import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { ButtonComponent } from "../../../../../../shared/components/button/button.component";
import { ModalComponent } from "../../../../../../shared/components/modal/modal.component";
import { SelectInput } from "../../../../../../shared/components/select-input/select-input";
import { ImportValueLists } from "../../../services/obs-api.service";
import { EDITABLE_COLUMNS, ImportColumn } from "../import-columns";

/** THE ROW EDITOR. One component, two callers, and that is the point.
 *
 * Requirement 3.3 gives the page two entry modes and requirement 3.6 gives it in-place
 * correction. Building a row by hand and correcting an imported row are the same act on the
 * same seventeen columns against the same rule engine, so they are the same dialogue. CP-06
 * built that dialogue as markup inlined in `masters-page.html`, which cannot be called twice -
 * recorded as a defect in that change's design and resolved by EXTRACTING it here rather than
 * by writing a second one. Nothing about its behaviour changed in the move.
 *
 * What it does NOT do is decide anything. It collects cell values, exactly as they would have
 * been typed into the workbook, and emits them. Every verdict is the server's - the parent
 * posts the row and the rule engine answers. There is no validation in this component beyond
 * the closed lists, and those exist to prevent a mistake rather than to judge one.
 */
@Component({
  selector: "app-obs-import-row-editor",
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, SelectInput, ButtonComponent],
  templateUrl: "./import-row-editor.html",
  styleUrl: "./import-row-editor.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportRowEditor {
  private readonly fb = inject(FormBuilder);

  readonly title = input.required<string>();
  /** The cells as they stand. A blank object is a new row. */
  readonly values = input<Record<string, string>>({});
  /** What the WORKBOOK held for any cell the application corrected from a source of truth,
   * so the operator judges the correction rather than guessing what it replaced. Empty for a
   * hand-built row, which nothing has corrected yet. */
  readonly corrections = input<Record<string, string>>({});
  /** Every broken rule on this row, one per line, in the back end's own clause-led wording -
   * the same string the ERRORS column renders, so the dialogue and the table agree. */
  readonly errors = input("");
  /** `ImportGridRow.fieldErrors` - the same broken rules as `errors` above, but keyed by the
   * column each one is ABOUT rather than flattened into a paragraph. Drives `columns` below. */
  readonly fieldErrors = input<Record<string, string[]>>({});
  /** `ImportGridRow.patternUnmatched` - clause 5.1's red text, carried in so the PATTERN
   * NUMBER field can get the same treatment here as `obs-cell--unmatched` gives it in the
   * grid (`masters-page.css`), rather than reading as an ordinary field once it is the one
   * thing on screen inside this dialogue. */
  readonly patternUnmatched = input(false);
  /** Every closed list, for the caller's department and the selected route, straight from
   * `import-value-lists/`. `null` while it is still loading, which is why each select falls
   * back to an empty list rather than to a hard-coded one. */
  readonly valueLists = input<ImportValueLists | null>(null);
  readonly saveLabel = input("Save Row");
  /** The instruction requirement 3.4 asks to be visible where the equipment class is entered,
   * passed in so the page and the dialogue cannot word it differently. */
  readonly equipmentClassInstruction = input("");
  readonly busy = input(false);

  readonly saved = output<Record<string, string>>();
  readonly cancelled = output<void>();

  /** ONLY THE COLUMNS THE ROW IS ACTUALLY FAILING ON, so a rating opening
   * this dialogue on a row with one broken rule sees the one field to fix rather than
   * re-reading all seventeen. Falls back to the full `EDITABLE_COLUMNS` set whenever
   * `fieldErrors` names none of them - a valid row being hand-corrected pre-emptively, a
   * duplicate (whose message is about the whole row, not one column - see
   * `import-columns.ts`'s `DUPLICATE_ROW_MESSAGE`), or before the first check has answered at
   * all - so the dialogue is never left with nothing in it. */
  readonly columns = computed<ImportColumn[]>(() => {
    const errors = this.fieldErrors();
    const flagged = EDITABLE_COLUMNS.filter((column) => (errors[column.apiField]?.length ?? 0) > 0);
    return flagged.length ? flagged : EDITABLE_COLUMNS;
  });
  /** Whether `columns` above is narrowed or showing the full set - so the template can say
   * which is happening rather than leaving a rating to work out why some fields are missing. */
  readonly showingOnlyFlaggedColumns = computed(() => this.columns().length < EDITABLE_COLUMNS.length);
  readonly selectPlaceholder = "-- Select --";
  readonly optionalPlaceholder = "-- None --";

  /** One control per editable column, built from the same table the grid is built from so a
   * column can never appear in one and not the other. Every value is a workbook CELL value,
   * typed exactly as it would have been typed into the sheet, because that is what the server
   * is sent and what its rule engine reads. */
  readonly form = this.fb.nonNullable.group(
    Object.fromEntries(EDITABLE_COLUMNS.map((column) => [column.apiField, this.fb.nonNullable.control("")])),
  );

  /** The spare class currently chosen, so the EQUIPMENT CLASS list can be narrowed to the
   * classes actually registered under it. Rule 2.6's master check matches on exactly that
   * pair, so offering the whole department's list would offer values bound to fail. */
  private readonly spareClass = signal("");

  readonly spareClassOptions = computed(() => this.valueLists()?.spareClasses ?? []);
  readonly categoryOptions = computed(() => this.valueLists()?.categories ?? []);
  readonly denominationOptions = computed(() => this.valueLists()?.denominations ?? []);
  readonly rackPositionOptions = computed(() => this.valueLists()?.rackPositions ?? []);
  readonly criticalOptions = computed(() => this.valueLists()?.criticalValues ?? []);

  /** read from `equipmentClassOptions`, NOT from the stored
   * `equipmentClasses` grouping, so this dialogue and the grid behind it offer the same list.
   *
   * The stored grouping says which spare class a name is filed under, and an equipment class
   * name is unique per department - so the seeded MICELLANEOUS is filed under
   * SPARES_MICELLANEOUS alone, and reading the grouping literally showed an EMPTY list for
   * SPARES_PLL and SPARES_CONSUMABLE, both of which clause 2.6 permits it for. The back end's
   * `equipment_class_options` answers the question this control actually asks. */
  readonly equipmentClassOptions = computed(() => {
    const names = this.valueLists()?.equipmentClassOptions[this.spareClass()] ?? [];
    return names.map((name) => ({ label: name, value: name }));
  });

  /** Clause 2.5 permits these for this department and route, but the ship has not set them up
   * in Masters yet, so a row using one would fail R-010-MASTER. Named rather than silently
   * dropped from the list above. */
  readonly spareClassesNotSetUp = computed(() => this.valueLists()?.spareClassesNotSetUp ?? []);

  constructor() {
    // The dialogue is created fresh by the parent's `@if` each time it
    // opens, so this runs once per opening. `values()` is the row as it stands, and an absent
    // key is an empty cell rather than an untouched control.
    effect(() => {
      const values = this.values();
      this.form.reset(
        Object.fromEntries(EDITABLE_COLUMNS.map((column) => [column.apiField, values[column.apiField] ?? ""])),
      );
      this.spareClass.set(values["spare_class"] ?? "");
    });
    this.form.controls["spare_class"].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.spareClass.set((value ?? "").trim().toUpperCase()));
  }

  correctionFor(column: ImportColumn): string | undefined {
    return this.corrections()[column.apiField];
  }

  save(): void {
    this.saved.emit(this.form.getRawValue() as Record<string, string>);
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
