import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import {
  AbstractControl,
  AsyncValidatorFn,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { catchError, firstValueFrom, map, of } from "rxjs";
import { InputField } from "../../../../../shared/components/input-field/input-field";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { TextareaInput } from "../../../../../shared/components/textarea-input/textarea-input";
import { FileInput } from "../../../../../shared/components/file-input/file-input";
import { ObsApiService } from "../../services/obs-api.service";
import {
  DEFAULT_SPARE_IMAGE,
  DropdownOptionDto,
  Spare,
  SpareCategory,
  SpareFormPayload,
} from "../../models/spare.model";

const CATEGORY_OPTIONS: { label: string; value: SpareCategory }[] = [
  { label: "Consumable", value: "CONSUMABLE" },
  { label: "Permanent", value: "PERMANENT" },
  { label: "Returnable", value: "RETURNABLE" },
  { label: "IM", value: "IM" },
];

// YES first, NO second. Both read-only renders of this field write YES
// first — the detail page's `s.critical ? "YES" : "NO"` and the Search Spare grid's value getter
// of the same shape — while this list read NO first, so the operator met the two labels in one
// order on the grid and the opposite order in the dropdown that sets them. The stored default is
// still NO: it is the control's initial value, not its first option.
const CRITICAL_OPTIONS: { label: string; value: "YES" | "NO" }[] = [
  { label: "YES", value: "YES" },
  { label: "NO", value: "NO" },
];

@Component({
  selector: "app-obs-spare-form",
  standalone: true,
  imports: [ReactiveFormsModule, InputField, SelectInput, TextareaInput, FileInput, ButtonComponent],
  templateUrl: "./spare-form.html",
  styleUrl: "./spare-form.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpareForm implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly initialValue = input<Spare | null>(null);
  readonly saving = input(false);
  /** When true, suppresses this component's own bottom Cancel/Save row — for a parent
   * that renders its own Save/Cancel (e.g. in a header, next to the title) and drives
   * this form via a template reference instead (`#formRef` + `formRef.submit()`).
   * `submit()`/`cancel()` stay public either way, so the parent's buttons work the same
   * as this component's own would. */
  readonly hideActions = input(false);
  readonly submitted = output<SpareFormPayload>();
  readonly cancelled = output<void>();

  /** Edit mode locks Class of Spares/Equipment Class — changing a spare's classification after
   * it has issue/survey/demand history attached would silently re-home it out of the originating
   * department's scope while that history stays behind. Matches the reference app's behavior. */
  readonly isEditMode = computed(() => !!this.initialValue());

  readonly categoryOptions = CATEGORY_OPTIONS;
  readonly criticalOptions = CRITICAL_OPTIONS;

  /** Set when the browser cannot load the stored photograph — a path whose
   * file has since been moved or deleted, or an unreachable API. Without it the frame would render
   * the browser's broken-image icon on the one screen whose job is to let the operator fix that. */
  private readonly storedImageFailed = signal(false);

  /** What the image frame shows before the operator picks a new file.
   * `previewImages` on `app-file-input` is populated only by `FileReader.onload`, so until this
   * change the frame on Update Spare showed the literal text "200 x 150" for every spare,
   * including one that already had a photograph — the existing photograph was never shown at all,
   * and the "no photograph yet" case was indistinguishable from it. The form control stays
   * `File | null`: what is rendered here is the READ model's `imageUrl`, which is a string, and
   * the two are deliberately not merged. Falls back to the same placeholder asset the Spare
   * Specific Details page uses, so one spare shows one artwork on both screens. */
  readonly storedImageSrc = computed(() => {
    const url = this.initialValue()?.imageUrl;
    return !url || this.storedImageFailed() ? DEFAULT_SPARE_IMAGE : url;
  });

  /** True only for a real photograph. `adaptSpare()` already resolves the
   * backend's `obs/default.png` default to `undefined`, so a spare that has never been
   * photographed reaches here with nothing rather than with the shared placeholder's URL. */
  readonly hasStoredImage = computed(() => this.storedImageSrc() !== DEFAULT_SPARE_IMAGE);

  readonly storedImageAlt = computed(() =>
    this.hasStoredImage() ? "Photograph currently on record for this spare" : "No photograph on record",
  );

  /** The caption states which of the three cases the operator is looking at
   * and what the file picker below will do about it. Finding and filling the spares with no
   * photograph is the whole purpose of the Search Spare photograph filter, so "there is none yet"
   * has to be unmistakable rather than inferred from a grey box. */
  readonly storedImageCaption = computed(() => {
    if (this.hasStoredImage()) return "Photograph on record. Choose a file to replace it.";
    return this.isEditMode()
      ? "No photograph on record. Choose a file to add one."
      : "No photograph chosen yet. Choose a file to add one.";
  });
  spareClasses: DropdownOptionDto[] = [];
  equipmentClasses: DropdownOptionDto[] = [];
  denominations: DropdownOptionDto[] = [];
  authorities: DropdownOptionDto[] = [];

  /** Cross-checks a user-typed pattern number against the real ILMS/WLMS pattern databases
   * (`verify-pattern/`) — matches the reference app's pattern-number cross-check. Add mode only:
   * in edit mode `initialValue()`'s pattern number may be a SWMM auto-generated code (ship code +
   * class prefixes + random digits), which by design never exists in ILMS/WLMS — re-validating it
   * on every edit would wrongly block saving an already-valid spare. Blank is always valid (leaving
   * it blank asks the backend to auto-generate one). */
  private readonly patternNumberValidator: AsyncValidatorFn = (control: AbstractControl) => {
    const value = (control.value as string)?.trim();
    if (!value || this.isEditMode()) return of(null);
    return this.api.verifyPatternNumber("", value).pipe(
      map((result): ValidationErrors | null => (result.matched ? null : { patternNotFound: true })),
      // Fail open on an unrelated network/server error — this is an external-database cross-check,
      // not a can't-happen case, and a transient hiccup here shouldn't block saving the spare.
      catchError(() => of(null)),
    );
  };

  readonly form = this.fb.nonNullable.group({
    spareClass: ["", Validators.required],
    equipmentClass: ["", Validators.required],
    // Leaving this blank asks the backend to auto-generate a pattern number. When the user does
    // type one, `patternNumberValidator()` cross-checks it against the real ILMS/WLMS pattern
    // databases (`verify-pattern/`) on blur, matching the reference app's "cross-checks every
    // pattern number against the ILMS and WLMS pattern-number databases" behavior.
    patternNumber: this.fb.nonNullable.control("", {
      asyncValidators: [this.patternNumberValidator],
      updateOn: "blur",
    }),
    description: ["", Validators.required],
    compartment: [""],
    rackPosition: [""],
    rackNumber: [""],
    location: [""],
    category: ["PERMANENT" as SpareCategory, Validators.required],
    // The label has always carried the required asterisk and the control has
    // never carried the validator, so the marker was a promise nothing kept. The asterisk stays
    // and the validator is added, rather than the other way round, because the field CAN be
    // emptied: `app-select-input` renders a clear button whenever a value is selected, and a
    // cleared control submitted as `raw.critical === "YES"` — which is `false` — silently filing
    // the spare as not critical. Two options and a default is not the same as a value that cannot
    // be removed.
    critical: ["NO" as "YES" | "NO", Validators.required],
    denomination: ["", Validators.required],
    authority: ["", Validators.required],
    // Not rendered — matches the reference's "Authorised quantity is set to match [Qty Held]"
    // rule. Kept in the group (rather than removed) so edit mode can still restore an existing
    // spare's real value on load; submit() overwrites it with quantityAvailable regardless.
    quantityAuthorised: [0, [Validators.min(0)]],
    quantityAvailable: [0, [Validators.required, Validators.min(0)]],
    page: [""],
    line: [""],
    remarks: [""],
    image: this.fb.control<File | null>(null),
  });

  readonly spareClassValue = toSignal(this.form.controls.spareClass.valueChanges, {
    initialValue: "",
  });
  /** Drives the Save button's disabled state while the pattern-number async check is in flight —
   * `form.invalid` alone doesn't catch a pending async validator (its status is `PENDING`, not yet
   * `INVALID`), so a fast double-click on Save right after blurring the field could otherwise slip
   * through before the check resolves. */
  readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  /** Cross-checks a user-typed pattern number against the real ILMS/WLMS pattern databases
   * (`verify-pattern/`) — matches the reference app's pattern-number cross-check. Add mode only:
   * in edit mode `initialValue()`'s pattern number may be a SWMM auto-generated code (ship code +
   * class prefixes + random digits), which by design never exists in ILMS/WLMS — re-validating it
   * on every edit would wrongly block saving an already-valid spare. Blank is always valid (leaving
   * it blank asks the backend to auto-generate one). */
  ngOnInit(): void {
    void this.loadDropdowns();

    // Qty Authorised is only rendered (and user-editable) in edit mode — see spare-form.html.
    // Add mode always overwrites it with Qty Held in submit(), so it stays required only where
    // it's actually a visible field a user could otherwise leave blank.
    if (this.isEditMode()) {
      // Coded by Unknown: retained deliberately. quantityAuthorised is
      // Coded by Unknown: disabled in edit mode, so this validator does not
      // Coded by Unknown: run. It is kept so the intent survives if the field
      // Coded by Unknown: is ever unlocked.
      this.form.controls.quantityAuthorised.addValidators(Validators.required);
      this.form.controls.quantityAuthorised.updateValueAndValidity({ emitEvent: false });
    }

    // Cascade: Class of Spares -> Equipment Class. Only wired in add mode — edit mode keeps the
    // full, uncascaded lists (see loadDropdowns()) and locks both controls, so there is nothing
    // for the cascade to do there. "Class of Spares" itself needs no cascade/department picker:
    // its option list is already scoped server-side to the caller's own department (see
    // `getSpareClasses()`), matching the reference app's design.
    this.form.controls.spareClass.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((spareClassId) => void this.onSpareClassChange(spareClassId));
  }

  private async onSpareClassChange(spareClassId: string): Promise<void> {
    if (this.isEditMode()) return;
    this.form.patchValue({ equipmentClass: "" }, { emitEvent: false });
    if (!spareClassId) {
      this.equipmentClasses = [];
      return;
    }
    this.equipmentClasses = await firstValueFrom(this.api.getEquipmentClassesForSpareClass(spareClassId));
  }

  private async loadDropdowns(): Promise<void> {
    const initial = this.initialValue();

    if (initial) {
      // Edit mode: keep loading the full, uncascaded lists — needed by the
      // byLabel() reverse-mapping below, which predates and is independent of the
      // add-mode cascade.
      const [spareClasses, equipmentClasses, denominations, authorities] = await Promise.all([
        firstValueFrom(this.api.getSpareClasses()),
        firstValueFrom(this.api.getEquipmentClasses()),
        firstValueFrom(this.api.getDenominations()),
        firstValueFrom(this.api.getAuthorities()),
      ]);
      this.spareClasses = spareClasses;
      this.equipmentClasses = equipmentClasses;
      this.denominations = denominations;
      this.authorities = authorities;

      // `Spare` (the read model `getSpare()` returns) carries `spareClass`/`equipmentClass`/
      // `denomination`/`authority` as human-readable NAMES for display — not the option ids
      // these dropdowns need. Spreading `initial` straight into the form (as this used to do)
      // patched those controls with names the dropdowns don't recognise, which then round-tripped
      // as literal strings like "Engine Class A" into what the backend expects to be a numeric FK
      // id, producing the "equipment_class ... nonexistent type" validation error on Save.
      // Reverse-map each by matching the loaded option lists' labels back to their ids.
      const byLabel = (options: DropdownOptionDto[], label: string): string =>
        options.find((o) => o.label === label)?.value ?? "";
      this.form.patchValue({
        ...initial,
        spareClass: byLabel(spareClasses, initial.spareClass),
        equipmentClass: byLabel(equipmentClasses, initial.equipmentClass),
        denomination: byLabel(denominations, initial.denomination),
        authority: byLabel(authorities, initial.authority),
        critical: initial.critical ? "YES" : "NO",
      });
      // Coded by Unknown: the Django edit screen at /obs/edit/<id>/ permits
      // Coded by Unknown: only description, compartment, rack position, rack
      // Coded by Unknown: number, box number, image and remarks to be changed.
      // Coded by Unknown: every other field is either disabled=True on the
      // Coded by Unknown: Django form or is a readonly widget whose value is
      // Coded by Unknown: restored server side by a clean_<field> method. The
      // Coded by Unknown: same nine fields are locked here so the two screens
      // Coded by Unknown: behave identically. Edit mode only - the add screen
      // Coded by Unknown: is reached with no initial value and is untouched.
      const lockedInEditMode = [
        "patternNumber",
        "category",
        "critical",
        "denomination",
        "authority",
        "quantityAuthorised",
        "quantityAvailable",
        "page",
        "line",
      ] as const;
      for (const controlName of lockedInEditMode) {
        this.form.get(controlName)?.disable({ emitEvent: false });
      }
      return;
    }

    // Add mode: "Class of Spares" loads immediately (its list is already scoped server-side to
    // the caller's own department), "Equipment Class" cascades from it via onSpareClassChange().
    const [spareClasses, denominations, authorities] = await Promise.all([
      firstValueFrom(this.api.getSpareClasses()),
      firstValueFrom(this.api.getDenominations()),
      firstValueFrom(this.api.getAuthorities()),
    ]);
    this.spareClasses = spareClasses;
    this.denominations = denominations;
    this.authorities = authorities;

    // Match the reference defaults once the real option lists are in: Denomination "KGS",
    // Authority "Delegated Powers" — only applied when that option actually exists, so a
    // department without a KGS denomination or that authority silently keeps no default.
    const kgs = denominations.find((d) => d.label.toUpperCase() === "KGS");
    if (kgs) this.form.controls.denomination.setValue(kgs.value);
    const delegatedPowers = authorities.find((a) => a.label.toUpperCase() === "DELEGATED POWERS");
    if (delegatedPowers) this.form.controls.authority.setValue(delegatedPowers.value);
  }

  submit(): void {
    // `form.invalid` alone doesn't catch a still-running async validator (status is `PENDING`,
    // not yet `INVALID`) — e.g. clicking Save right after tabbing out of Pattern Number, before
    // its ILMS/WLMS check has resolved.
    if (this.form.invalid || this.form.pending) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    // InputField (type="number") is a text-backed control — coerce back to number here
    // rather than trusting the reactive form's inferred type at runtime.
    const quantityAvailable = Number(raw.quantityAvailable);
    // Add mode: Qty Authorised isn't rendered — it always mirrors Qty Held, matching the
    // reference's "authorised is set to match [held]" rule for a brand-new spare. Edit mode
    // keeps its own rendered, independently-editable value.
    const quantityAuthorised = this.isEditMode() ? Number(raw.quantityAuthorised) : quantityAvailable;
    this.submitted.emit({
      ...raw,
      critical: raw.critical === "YES",
      quantityAuthorised,
      quantityAvailable,
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }

  /** A stored path is a real column and the file behind it can be moved or
   * deleted, so a URL that 404s is an ordinary state. Fall back to the placeholder rather than
   * leaving a broken frame on the one screen that can put a photograph right. */
  onStoredImageError(): void {
    this.storedImageFailed.set(true);
  }
}
