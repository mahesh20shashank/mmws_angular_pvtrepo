import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { HttpErrorResponse } from "@angular/common/http";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Subject, debounceTime, firstValueFrom } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ColDef, CellCallbackParams, GridApi, GridReadyEvent, RowData } from "ag-grid-community";
import { FileInput } from "../../../../../shared/components/file-input/file-input";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { ToolbarSearch } from "../../../../../shared/components/toolbar-search/toolbar-search";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
// The results table is the shared grid now, with the two cell
// renderers the design system already carries - the status chip that replaces this page's
// hand-rolled pills, and the action-icon cell that gives the ACTION column its Edit and
// Delete buttons. Neither is new work and neither needed a change to run here.
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { GridStatusChipRenderer } from "../../../../../shared/components/data-grid/grid-status-chip-renderer";
// The two always-on editable-cell renderers the design system already
// carries, used here for hand entry exactly as six other screens already use them. Nothing was
// added to `data-grid` - it passes `columnDefs` through to ag-grid untouched.
import { GridTextCell } from "../../../../../shared/components/data-grid/grid-text-cell";
import { GridSelectCell } from "../../../../../shared/components/data-grid/grid-select-cell";
// the ERRORS column's own renderer, local to this page rather than in the
// shared data-grid folder - it reads `ImportGridRow`'s two message lists and means nothing to any
// other screen.
import { GridErrorsCell } from "./grid-errors-cell";
import { ActionRendererComponent } from "../../../../../shared/components/data-grid/grid-action-icons";
import { ModalComponent } from "../../../../../shared/components/modal/modal.component";
// The mode chooser. Requirement 3.3 asks for two entry modes chosen by a
// control the user described as a radio button, and `radio-input` is generic in its value type,
// so it takes the `EntryMode` union directly.
import { RadioInput } from "../../../../../shared/components/radio-input/radio-input";
// The name entry on the Equipment Classes tab. `input-field` carries an
// `invalid` input the duplicate-name refusal binds to, so the field itself shows the failure
// rather than only a toast - WCAG 3.3.1.
import { InputField } from "../../../../../shared/components/input-field/input-field";
// Reads `message` out of the project's own error envelope
// (`swmm.exceptions.custom_exception_handler`) so the tab never hand-parses one.
import { getErrorMessage } from "../../../../../Core/http/services/http-feedback";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { ReportExportService } from "../../../../../Core/services/export/generic-export.service";
import { User } from "../../../../../Core/services/user/user";
import {
  DepartmentEquipmentClasses,
  ExcelImportCommitResult,
  ExcelImportPreview,
  ExcelImportPreviewRow,
  ImportAuthorityOption,
  ImportManualRow,
  ImportRoute,
  ImportSelection,
  ImportValueLists,
  ImportWorkingTable,
  ObsApiService,
  ShipCustomerCodeState,
  SparesPurgeState,
} from "../../services/obs-api.service";
import { DropdownOptionDto, VendorPilImportResult } from "../../models/spare.model";
// The column vocabulary moved to its own file so the row editor and this
// page can both read it without one importing the other. See `import-columns.ts`.
import {
  EDITABLE_COLUMNS,
  IMPORT_COLUMNS,
  ImportColumn,
  ImportGridRow,
  PATTERN_SOURCE_LABELS,
  ROW_STATE_LABELS,
  ROW_STATE_TONES,
  rowStateKey,
  rowTintClass,
  toGridRow,
} from "./import-columns";
// THE ROW EDITOR IS BACK, in a narrower role. It was removed in favour of
// typing straight into the grid's own cells - see the (now stale) comment this replaces in
// `masters-page.html` - because correcting ONE cell no longer needs it. It does not undo that:
// the cells are still typed into directly and this dialogue writes through the very same
// `onCellChanged` path a typed cell does. What it answers instead is EDITABLE_COLUMNS' own
// width - seventeen columns wide, most of it off screen at once - by opening every editable
// cell of one row together, so a rating fixing several fields of a row they have already
// scrolled to does not have to scroll back and forth between them to do it.
import { ImportRowEditor } from "./import-row-editor/import-row-editor";

/** `equipment-class` is the fourth tab. The existing union is EXTENDED
 * rather than a parallel mechanism being invented beside it, so `selectTab`, the tab bar and
 * every `@if` on this page keep working exactly as they did for the other three. */
type MastersTab = "import" | "spare-data-map" | "vendor-pil" | "equipment-class";

/** Requirement 3.3's two entry modes.
 *
 * `import` uploads a template workbook. `manual` builds the same rows by hand in the same
 * working table. The chooser swaps which controls are shown and never which page the user is
 * on - doctrine 5.12, fewer steps to the same outcome. Each mode keeps its own rows, so
 * switching between them discards nothing. */
type EntryMode = "manual" | "import";
/** `idle` — no preview yet (or the selected file changed since the last one, forcing a fresh
 * preview). `previewed` — a preview came back for the currently-selected file; the validation
 * panel is showing it. */
type ImportStage = "idle" | "previewed";
type ValidationTab = "all" | "valid" | "invalid" | "duplicate";

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-0">This is where you initialise your Ship Inventory in SWMM. Work through the three
     tabs — the main one is Import Data, where you import all onboard spares from a template Excel
     sheet. Each tab has its own <em>i</em> Help & Guidance — open it inside the tab.</p>
`;

const IMPORT_TAB_HELP_HTML = `
  <h6 class="fw-bold mb-1">Import Data — initialise your Ship Inventory</h6>
  <p class="mb-2">This is where you set up the ship's inventory by importing every spare held onboard
     from a <strong>template Excel sheet</strong>. Prepare an <strong>equipment-wise Excel sheet</strong>
     of all spares held onboard.</p>

  <h6 class="fw-bold mb-1">Pattern Numbers</h6>
  <ul class="mb-2">
    <li>If you <strong>do not know</strong> a spare's pattern number, <strong>leave that cell
        empty</strong> — SWMM auto-generates a pattern number for it during import.</li>
    <li>If you enter a <strong>wrong</strong> pattern number, SWMM cross-checks every pattern number
        against the <strong>ILMS and WLMS</strong> pattern-number databases. Any mismatch is
        <strong>also replaced</strong> with a SWMM auto-generated pattern number.</li>
  </ul>

  <h6 class="fw-bold mb-1">Validate, then submit</h6>
  <p class="mb-2">Pressing <strong>Preview Import</strong> validates the sheet — nothing is saved yet.
     You'll see every row with a status (Valid/Invalid/Duplicate), plus which columns are missing or
     were ignored. Use the tabs to filter, then press <strong>Submit Valid Data</strong> to load only
     the valid, non-duplicate rows into the <strong>OBS (Ship Inventory)</strong> table — invalid and
     duplicate rows are skipped individually rather than blocking the whole file.</p>

  <h6 class="fw-bold mb-1">Be diligent with quantities</h6>
  <ul class="mb-2">
    <li>Import carefully — <strong>no spare should be wrongly imported</strong>.</li>
    <li><strong>Do not fudge Quantity Authorised or Quantity Held.</strong> Wrong quantities distort
        the ship's <strong>MAT-CDF</strong> materiel-readiness analysis.</li>
    <li>If you <strong>don't know the actual held quantity</strong>, set
        <strong>Held Qty = Authorised Qty</strong>. Later, after a physical muster, <strong>issue</strong>
        items to correct the true onboard stock.</li>
  </ul>

  <!-- The two standing advisories, carried across word for word from the
       reference application's Ship Inventory Import Rules page (obs/templates/obs/import_rules.html
       lines 56 and 60). Neither had survived the conversion. -->
  <h6 class="fw-bold mb-1">Two standing advisories</h6>
  <ul class="mb-2">
    <li><strong>Prepare EQUIPMENT-WISE.</strong> Build one excel per equipment. Keep it to two or
        three equipment and no more than fifty spares per sheet, then import each sheet on its own
        and verify the imported count.</li>
    <li><strong>PRESERVE every template after import.</strong> Retain each equipment excel sheet
        after a successful import. It is your restore point for that equipment if onboard data is
        ever lost.</li>
  </ul>

  <!-- Explains the download control added beside the form. -->
  <h6 class="fw-bold mb-1">Templates</h6>
  <p class="mb-2">Use <strong>Download Template</strong> beside the form to get your own department's
     workbook. Each carries a <strong>GUIDANCE</strong> sheet, the twenty column headings, and
     dropdowns that only accept the values your department is allowed. Fill in the
     <strong>OBS</strong> sheet only.</p>
  <!-- rules clause 2.5.1 - "For import of D787J Spares of Engg. Elec and Hull
       Dept". Documented here because an operator in one of the other departments will otherwise
       look for a second button that has never existed for them. -->
  <p class="mb-2">You will see <strong>two</strong> workbooks — one for <strong>D787J</strong> and
     one for the other authorities — only in <strong>Engineering</strong>, <strong>Electrical</strong>
     and the <strong>Hull</strong> sub-department. Those are the departments that hold a D787J
     document. Everywhere else there is <strong>one</strong> workbook, for the other authorities, and
     <strong>D787J</strong> does not appear in the Import Authority list either.</p>

  <!-- THE SHIP'S MO CUSTOMER CODE. New content - the code was enforced with
       no explanation anywhere, and on a fresh ship it blocked every import with a message that
       named no code because none had been adopted. -->
  <h6 class="fw-bold mb-1">The ship's MO customer code</h6>
  <ul class="mb-2">
    <li>Every workbook carries a <strong>SHIP CUSTOMER CODE</strong> column, and every row of one
        workbook must carry the same code.</li>
    <li>On a new ship <strong>no code is set yet</strong>. The <strong>first workbook you import</strong>
        sets it, from that workbook's own column — so that first import is always allowed whatever
        the code says. Check it before you import: it is the code the ship will be held to.</li>
    <li>After that, every import is checked against it. A workbook carrying a different code is
        refused in full and nothing from it is saved. The refusal <strong>names the ship's code</strong>
        so you know what the column should say.</li>
    <li>The code in force is shown on the right of this tab. Only the application administrator can
        clear it, and clearing it deletes no spares — it only means the next workbook imported sets
        the code again.</li>
  </ul>

  <!-- CORRECTING A MISTAKE. New content. The delete existed with no
       documentation at all, so an operator who imported the wrong workbook had no way of learning
       that starting again was possible. -->
  <h6 class="fw-bold mb-1">Correcting a mistake — clearing spares and importing again</h6>
  <ul class="mb-2">
    <li>If you import the wrong workbook, or the quantities in it turn out to be wrong, you do not
        have to live with it. <strong>Clear OBS Spares</strong>, at the top right of this screen,
        deletes what was imported so you can correct the sheet and import it again.</li>
    <li>A <strong>Head of Department</strong> clears <strong>his own department's spares</strong> —
        every spare the department has imported so far, not only the last workbook. No other
        department is touched.</li>
    <li>Only the <strong>application administrator</strong> clears <strong>every</strong>
        department's spares in one go.</li>
    <li>A <strong>Dy HOD</strong> does not see the button. He may import on this screen but not
        delete what a department has imported. Neither does any other role — the button is simply
        absent for them.</li>
    <li>It <strong>asks first</strong>, and the question names the department, how many spares will
        go, and that their <strong>issue, survey, demand and receipt records go with them</strong>.
        Read that count before you answer — it is the live number, not an estimate.</li>
    <li><strong>It cannot be undone.</strong> Keep your filled-in workbooks, which is the reason for
        the standing advisory above: they are what you import again afterwards.</li>
    <li>This is <strong>not</strong> the same as <strong>Clear Table</strong>, further down. Clear
        Table discards the rows on screen that have not been saved yet and deletes nothing from the
        Ship Inventory.</li>
  </ul>

  <h6 class="fw-bold mb-1">Fields</h6>
  <ul class="mb-0">
    <!-- Restored word for word from the reference application's Import Data
         help (obs/templates/obs/master.html lines 143 to 144). The form has always rendered this
         field and the help had stopped documenting it. -->
    <li><strong>Select Department</strong> — the sheet is tagged to the department you choose here.
        You may only choose a department you are entitled to, so most users will see just their
        own.</li>
    <!-- The sub-department line. New content, not a restoration - the
         reference application's own Import Data help documents no sub-department, because no
         import view in it reads one. -->
    <li><strong>Sub Department</strong> — shown for <strong>Executive</strong> only, because
        Executive is the one department organised sub-department wise. The sheet is tagged to the
        sub-department you choose, and the Executive Head of Department can then see all eight
        together or narrow to any one on the Ship Inventory tab. If you hold a sub-department
        yourself, it is filled in for you and cannot be changed.</li>
    <!-- The Login Password line is unchanged in wording and true for the
         first time - the field is now checked before the import runs, and again by the server. -->
    <li><strong>Login Password</strong> — type your own login password to confirm it is you.</li>
    <!-- Was "Import Type - pick the sheet type (e.g. D787J, B & D, WED
         ITEM, CNAL, OTHERS)". Renamed to the reference screen's own label, and the example list
         corrected - WED ITEM is not an import authority under rule 2.17 and four real ones were
         missing. The list you see is the one your role and department are allowed. -->
    <li><strong>Import Authority</strong> — pick the authority the sheet's AUTHORITY column
        carries. <strong>Every row must carry that same authority</strong> — if any row disagrees,
        the whole file is refused and nothing is loaded. <strong>D787J</strong> appears only if
        your role may import it.</li>
    <li><strong>Select Excel File</strong> — pick the <strong>.xlsx</strong> file, then press
        <strong>Preview Import</strong>.</li>
  </ul>
`;

/** The D787J caution, carried across word for word from the reference
 * application (`obs/templates/obs/master.html` lines 210 to 212, shown and hidden by
 * `static/obs/data/js/excel_import.js` lines 1219 to 1225). It is a message only — it never blocks
 * or limits the import, exactly as the reference's own comment records.
 *
 * It is rendered beside the Import Type control rather than inside the collapsed Help & Guidance
 * panel, because a warning about a choice has to be visible at the moment the choice is made. */
const D787J_CAUTION =
  "D787J is a monitored authority. Select it only when the spares in this sheet are genuinely on " +
  "the ship's D787J. Its deficiency is reported in MAT-CDF analysis, and a wrong entry here " +
  "distorts the ship's OBS health during workups.";

const MAP_TAB_HELP_HTML = `
  <h6 class="fw-bold mb-1">Spare Data Map</h6>
  <p class="mb-2">The <strong>Equipment Name in the SFD/CMMS database is not the same</strong> as the
     Equipment Name in the <strong>D787J</strong> document. So when you prepare your import Excel, fill
     the <strong>Equipment Class</strong> column <strong>as per the D787J document — not as per the SFD
     Equipment Name</strong>.</p>
  <p class="mb-2">If the two happen to be the same, there is nothing to do. If they differ, the
     <strong>Equipment Class is auto-mapped to the SFD Equipment Name</strong> when you issue the spare
     — or you can map it yourself here by picking the <strong>INSMA Equipment Name</strong> and its
     <strong>Ship Inventory Equipment Class(es)</strong>.</p>
  <p class="mb-0">One SFD Equipment Name can hold <strong>several Equipment Classes</strong> — e.g. a
     <strong>Gas Turbine</strong> can link to both <strong>GT Spares</strong> and <strong>Burya Control
     System spares</strong> of the D787J document.</p>
`;

/** The Equipment Classes tab's own help.
 *
 * The first two paragraphs carry a CONTENT decision across from the reference application's
 * Spare Data Map help (`obs/templates/obs/master.html` lines 268 to 281, transcribed at RECON-02
 * section 6.6) — that the equipment name in the SFD or CMMS database is NOT the same as the
 * equipment name in the D787J document, and that the Equipment Class must follow the D787J
 * document. It is repeated here, beside the control that creates the name, because that sentence
 * describes exactly the mistake this tab exists to prevent and a rating adding a class will not
 * think to open the Spare Data Map tab's help first.
 *
 * The read-only paragraph is stated in the help as well as being true of the screen, because
 * "why can I not add a spare class" is the first question this tab will be asked. */
const EQUIPMENT_CLASS_TAB_HELP_HTML = `
  <h6 class="fw-bold mb-1">Equipment Classes — the ship's own equipment names</h6>
  <p class="mb-2">Every spare in the Ship Inventory hangs off an <strong>equipment class</strong>, and
     an equipment class hangs off a <strong>spare class</strong>. This tab lists the equipment
     classes your department already holds, and lets you add one that is genuinely missing.</p>

  <h6 class="fw-bold mb-1">Name it as the D787J document names it</h6>
  <p class="mb-2">The <strong>Equipment Name in the SFD/CMMS database is not the same</strong> as the
     Equipment Name in the <strong>D787J</strong> document. Enter the equipment class
     <strong>exactly as the D787J document or the shipyard purchase order gives it — not as per the
     SFD Equipment Name</strong>. If the two differ, the equipment class is mapped to the SFD
     Equipment Name later, on the <strong>Spare Data Map</strong> tab.</p>

  <h6 class="fw-bold mb-1">A name is used once</h6>
  <p class="mb-2">An equipment class name is <strong>unique across your whole department</strong>, not
     just within one spare class. If the equipment already has a name here, <strong>reuse it</strong>
     — do not create a second spelling of the same equipment. A name already in use is refused, and
     the tab tells you which spare class holds it.</p>

  <h6 class="fw-bold mb-1">Spare classes are fixed</h6>
  <p class="mb-0">The <strong>spare class list is read only</strong>. The eight spare classes are
     fixed by the Spares Import Rules document and cannot be added to, renamed or removed from any
     screen. If one your department is entitled to is missing, it has not been set up on this
     database yet — ask an administrator to run the onboard-spares seeding command.</p>
`;

const PIL_TAB_HELP_HTML = `
  <h6 class="fw-bold mb-1">Upload CPIL</h6>
  <p class="mb-0">Choose a <strong>CPIL</strong> file (<em>Comprehensive Part Identification
     List</em>) — vendor code/name is a column in the sheet itself, not picked separately.
     Download the template first if you need the exact column headers, then Validate before
     Import to catch any row errors without saving anything yet.</p>
`;

/** The two workbooks a department is offered, in the order they appear
 * beside the form. `route` is the value the back end's `download-template/` endpoint takes and the
 * suffix its file name carries — requirement 3.7 is that an Engineering login is offered
 * Engineering templates and no others, which the back end enforces rather than this list.
 *
 * `TemplateRoute` is gone — the same two route names now type the import as well, so
 * `ImportRoute` from the API service is the one definition of them. */
const TEMPLATE_DOWNLOADS: { route: ImportRoute; label: string }[] = [
  { route: "D787J", label: "D787J Template" },
  { route: "OTHERS", label: "Other Authorities Template" },
];

/** The unselected placeholder. `select-input` defaults to `Search...`,
 * which describes what the control does rather than what the user has to decide — the reference
 * screen's own placeholder was `-- Select --` and it is the better copy. */
const SELECT_PLACEHOLDER = "-- Select --";

/** Requirement 3.4's naming instruction, rendered at BOTH places an
 * equipment class is entered - the batch control on the form and the row editor's own field -
 * from this one string, so the two cannot word it differently. It is deliberately not in the
 * collapsed Help & Guidance panel: a naming rule that is only read by someone who opens a
 * disclosure is a naming rule that will be broken.
 *
 * The wording is the requirement's own - "exactly as mentioned in the D787J document or in the
 * purchase order given by the shipyards", and "that name, once entered, should not be
 * repeated". */
const EQUIPMENT_CLASS_INSTRUCTION =
  "Enter the equipment class EXACTLY as the D787J document or the shipyard purchase order " +
  "gives it. Pick an existing one wherever the equipment already has a name here - a name " +
  "once used is reused, never re-created under a second spelling.";

/** The two entry modes, worded as the act rather than as the mechanism.
 * The user's own framing is "creating using the data table" against "import".
 *
 * IMPORT IS FIRST, so it renders on the LEFT and is the one already selected on load. The two
 * were the other way round, which put the selected option on the right of an unselected one -
 * the page's default was `"import"` all along (`entryModeControl` and `entryMode` below), so
 * this is a rendering order fix and changes no behaviour. Importing a template workbook is what
 * this page is for, and the chooser now reads in that order. */
const ENTRY_MODE_OPTIONS: { label: string; value: EntryMode }[] = [
  { label: "Import from an Excel template", value: "import" },
  { label: "Build rows by hand", value: "manual" },
];

/** the phrase `POST spares/purge/` requires in its body, matching
 * `obs.views.PURGE_CONFIRMATION_PHRASE`. It is sent by the page rather than typed by the
 * operator — the confirmation modal already names the scope, the live count and the records that
 * go with the spares, and asking a rating to transcribe a word on top of that is a second lock on
 * a door that is already shut. The back end still requires it, so nothing reaches the endpoint by
 * accident. */
const PURGE_CONFIRMATION_PHRASE = "DELETE";

function rowMatchesSearch(row: ExcelImportPreviewRow, query: string): boolean {
  const { data } = row;
  return [
    data.patternNumber,
    data.description,
    data.equipmentClass,
    data.spareClass,
    data.authority,
    data.remarks,
  ].some((value) => value.toLowerCase().includes(query));
}

/** Identifies "the same file" for the stale-preview guard below — good enough to catch a swap
 * without hashing the file's contents. */
function fileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

@Component({
  selector: "app-obs-masters-page",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FileInput,
    SelectInput,
    RadioInput,
    ToolbarSearch,
    HelpGuidance,
    InputField,
    DataGrid,
    ModalComponent,
    ButtonComponent,
    ImportRowEditor,
  ],
  templateUrl: "./masters-page.html",
  styleUrl: "./masters-page.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MastersPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);
  private readonly api = inject(ObsApiService);
  private readonly exportService = inject(ReportExportService);
  private readonly userStore = inject(User);
  // Ends the debounced re-check subscription with the component - see `ngOnInit`.
  private readonly destroyRef = inject(DestroyRef);

  readonly helpHtml = HELP_HTML;
  readonly importTabHelpHtml = IMPORT_TAB_HELP_HTML;
  readonly mapTabHelpHtml = MAP_TAB_HELP_HTML;
  readonly pilTabHelpHtml = PIL_TAB_HELP_HTML;
  readonly equipmentClassTabHelpHtml = EQUIPMENT_CLASS_TAB_HELP_HTML;

  readonly activeTab = signal<MastersTab>("import");
  /** Was `IMPORT_TYPE_OPTIONS`, a five-entry constant offered to every user
   * and read nowhere. It listed `WED ITEM`, which is not an import authority under clause 2.17 and
   * appears in no template workbook, and omitted four that are — `MO ITEM`, `SHIPYARD ALLOWANCE`,
   * `MO ALLOWANCE` and `DELEGATED POWERS`. Worse, it offered `D787J` to everyone.
   *
   * The list now comes from `import-authorities/`, which returns clause 2.17's permitted values
   * scoped to this caller's role and department, in the reference screen's own order, with
   * `D787J` present only for an entitled login. The back end refuses the D787J route regardless of
   * what this control shows, so this list narrows the choice rather than being the gate. */
  readonly importAuthorityOptions = signal<ImportAuthorityOption[]>([]);
  readonly loadingAuthorities = signal(true);
  /** D787J is absent from this list in hand-entry mode, and that is the
   * requirement's own rule - "D787J will never be imported after the initial import through
   * the template Excel sheet". The back end refuses the D787J route on a hand-built batch
   * outright (`services.MANUAL_D787J_DENIED_MESSAGE`), so this narrows the choice rather than
   * being the gate that enforces it, exactly as the role filter on the list already does. */
  readonly authoritySelectOptions = computed(() =>
    this.importAuthorityOptions()
      .filter((option) => this.entryMode() === "import" || option.route !== "D787J")
      .map((option) => ({ label: option.label, value: option.value })),
  );
  readonly selectPlaceholder = SELECT_PLACEHOLDER;
  /** The template download control and the D787J caution both need to react
   * to a form value under `OnPush`, so the two values they read are mirrored into signals from the
   * controls' own `valueChanges` rather than read off the FormGroup in the template. */
  readonly templateDownloads = TEMPLATE_DOWNLOADS;
  readonly d787jCaution = D787J_CAUTION;
  readonly selectedDepartmentId = signal("");
  /** Requirement 3.2 — the department control is LOCKED for a departmental
   * login, and the lock is the server's answer (`selectable-departments/`'s `locked`), not a
   * guess made here from the length of the options array.
   *
   * It is rendered with `select-input`'s `readonly` input and NOT with `disabled`. The two look
   * similar and behave differently in the one way that matters: `disabled` removes the control's
   * value from `form.value`, and this value must be SUBMITTED — it is what tags the sheet to a
   * department. `readonly` keeps the value in the form and keeps the control focusable, so the
   * field is still reachable by keyboard and still announced, it simply cannot be changed. */
  readonly departmentLocked = signal(false);
  /** The Executive sub-department chooser — requirement 3.1. Named `import*` throughout to keep it
   * apart from `subDepartmentOptions` above, which is the Spare Data Map tab's `ems.SectionName`
   * control and a different model entirely. */
  readonly importSubDepartmentOptions = signal<DropdownOptionDto[]>([]);
  readonly importSubDepartmentLocked = signal(false);
  readonly loadingSubDepartments = signal(false);
  /** The dependent field appears only when the chosen department has sub-departments — in
   * practice, only for EXECUTIVE. Every other department returns an empty list and the control
   * stays off the form rather than being shown empty and disabled forever. */
  readonly showImportSubDepartment = computed(() => this.importSubDepartmentOptions().length > 0);
  readonly selectedImportAuthority = signal("");
  /** The route the selected authority belongs to. One control, not two —
   * picking `D787J` settles the route as surely as picking `CNAL` does, so the screen never asks
   * the operator to keep two fields consistent with each other. */
  readonly selectedImportRoute = computed<ImportRoute | null>(
    () =>
      this.importAuthorityOptions().find(
        (option) => option.value === this.selectedImportAuthority(),
      )?.route ?? null,
  );
  readonly downloadingTemplate = signal<ImportRoute | null>(null);
  /** WHICH template workbooks actually exist for the chosen scope, from
   * `template-routes/`. Both Download Template buttons used to be offered to everyone and one of
   * them 404'd — NBCD holds its spares on CNAL alone, and Logistics, Medical and
   * Executive-at-large hold no D787J document either (rules clause 2.5.1 names Engineering,
   * Electrical and Hull), so no D787J workbook exists for any of them.
   *
   * Empty until the department is known, which is why the whole bar is hidden rather than shown
   * with no buttons in it. */
  readonly availableTemplateRoutes = signal<ImportRoute[]>([]);
  readonly availableTemplateDownloads = computed(() =>
    TEMPLATE_DOWNLOADS.filter((item) => this.availableTemplateRoutes().includes(item.route)),
  );
  /** THE SHIP'S ADOPTED MO CUSTOMER CODE, and the panel that states it.
   *
   * `null` only while the first read is in flight or if it failed — the panel is then absent
   * rather than asserting a code the page does not actually know. */
  readonly customerCodeState = signal<ShipCustomerCodeState | null>(null);
  readonly confirmingCustomerCodeClear = signal(false);
  readonly clearingCustomerCode = signal(false);
  /** CLEAR OBS SPARES. `null` means this login may not clear anything and
   * the control is absent — `purge-state/` answers 403 for a Dy HOD, a storekeeper and everyone
   * else `CanPurgeSpares` refuses, and a 403 here is an ordinary expected answer rather than a
   * failure worth a toast. */
  readonly purgeState = signal<SparesPurgeState | null>(null);
  readonly confirmingPurge = signal(false);
  readonly purging = signal(false);
  readonly departmentOptions = signal<DropdownOptionDto[]>([]);
  readonly subDepartmentOptions = signal<DropdownOptionDto[]>([]);
  readonly equipmentOptions = signal<DropdownOptionDto[]>([]);
  readonly equipmentClassOptions = signal<DropdownOptionDto[]>([]);
  readonly mapSubmitting = signal(false);

  /** THE MODE CHOOSER — requirement 3.3, defect F-06.
   *
   * There had been no hand-entry path at all: the only way to get a row onto this page was a
   * file upload. The chooser swaps which controls the tab shows and never navigates - one
   * screen, one working table, one Save. It defaults to `import` because that is the path the
   * template-download bar directly above it leads into, and because a first-time user of this
   * tab is almost always loading a prepared workbook.
   *
   * The two modes hold their rows SEPARATELY (`preview` against `manualPreview`), so switching
   * between them discards nothing and no warning has to be shown for a loss that does not
   * happen. */
  readonly entryModeOptions = ENTRY_MODE_OPTIONS;
  readonly entryModeControl = this.fb.nonNullable.control<EntryMode>("import");
  readonly entryMode = signal<EntryMode>("import");
  readonly equipmentClassInstruction = EQUIPMENT_CLASS_INSTRUCTION;

  readonly importStage = signal<ImportStage>("idle");
  readonly previewing = signal(false);
  readonly committing = signal(false);
  readonly preview = signal<ExcelImportPreview | null>(null);
  readonly activeValidationTab = signal<ValidationTab>("all");
  readonly searchText = signal("");
  private previewedFileFingerprint: string | null = null;

  /** The working table's own state.
   *
   * `workingEdits` holds every cell the user has corrected, keyed by the workbook's own row
   * number, and `removedRows` holds the rows they deleted. Neither is a verdict - both are
   * sent with the file on every call and the server re-validates the corrected sheet from
   * scratch, which is what lets a corrected row turn green by itself without this screen ever
   * deciding that it should.
   *
   * `previewError` is the in-page error state. A file-level refusal used to leave the page
   * exactly as it was with only a toast that vanishes, which is the wrong surface for
   * something a rating has to recover from. */
  private readonly workingEdits = signal<Record<number, Record<string, string>>>({});
  private readonly removedRows = signal<number[]>([]);
  readonly revalidating = signal(false);
  readonly previewError = signal<string | null>(null);
  readonly pendingDeleteRow = signal<ImportGridRow | null>(null);
  readonly confirmingClear = signal(false);
  /** THE ROW EDITOR'S OWN OPEN ROW, or `null` while it is closed. Opened
   * from the ACTION column's Edit icon, beside Delete - see `openRowEditor` below. Holding the
   * grid row itself, rather than just its number, is what lets the dialogue read `.values`,
   * `.corrections` and `.errors` straight off it without a second lookup into whichever preview
   * (`preview()` or `manualPreview()`) the active mode currently holds. */
  readonly editingRow = signal<ImportGridRow | null>(null);
  // ---------------------------------------------------------------------------------------
  // MULTI-ROW SELECTION, so a bad sheet can be cleaned up in one go.
  //
  // Deleting a row was a bin icon and a confirmation EACH, and the cost was not only the
  // clicks: `confirmDeleteRow` awaits a network round trip per row, and on the workbook path
  // that round trip RE-UPLOADS THE ENTIRE .xlsx and runs the whole rule engine again. Five bad
  // rows meant five confirmations and five full workbook uploads.
  //
  // ROW NUMBERS, NOT ROW OBJECTS. `toGridRow` builds brand-new `ImportGridRow` objects on every
  // re-validation, so a held object is stale the moment the engine answers. The number is the
  // row's identity everywhere else on this screen - it is what `gridRowId` hands ag-grid and
  // what `removedRows` posts to the server - so it is what is held here too.
  // ---------------------------------------------------------------------------------------
  readonly selectedRowNumbers = signal<number[]>([]);
  readonly confirmingBulkDelete = signal(false);
  /** The grid's own API, taken from `(gridReady)`. Held for ONE purpose: `deselectAll()` after a
   * bulk delete. `resetKey` resets the grid's pagination and NOT its selection, so a selection
   * that is not cleared explicitly would survive the rows it pointed at. */
  private gridApi: GridApi | null = null;
  /** Clause 4.5's confirmation. It is raised BEFORE the save, from the
   * count the preview already carries, and cancelling it writes nothing. Held as its own
   * signal beside the two confirmations already on this screen so all three read the same way.
   */
  readonly confirmingShortfall = signal(false);
  /** Set only by `confirmShortfallSave()`, cleared as soon as the save that used it finishes.
   * It is what lets the two save methods be their own entry points and their own continuation
   * without a second copy of either. */
  private shortfallConfirmed = false;
  /** The master-value confirmation. Raised in the same place, from the
   * list the preview already carries, and cancelling writes nothing - the same shape as the
   * shortfall pair above, deliberately, so a fourth confirmation on this screen reads like the
   * three before it.
   *
   * The DIFFERENCE from the shortfall one is that this answer travels to the SERVER. A
   * shortfall confirmation only unblocks a save the server would have accepted anyway; this one
   * authorises a write to a shared master register, so the server must be told which values
   * were approved rather than inferring that something was. */
  readonly confirmingMasters = signal(false);
  private mastersConfirmed = false;
  /** The four values the last successful preview was made with, reused for the re-validation
   * that follows every edit. The password is NOT re-verified for those - the server verifies
   * it again on every single call, so the courtesy check that catches a mistyped password
   * early has nothing left to catch once one import call has already been accepted. */
  private activeSelection: ImportSelection | null = null;
  private activeFile: File | null = null;

  /** The hand-entry half of the working table.
   *
   * `manualRows` is the SOURCE OF TRUTH for Mode 1 - it is what the operator typed and it is
   * what gets posted. `manualPreview` is the SERVER'S VERDICT on it, and the grid renders that
   * verdict, never a locally-decided one. The two are separate on purpose: if a check fails
   * for a transport reason, the rows are still held here and nothing the operator entered is
   * lost, while the table keeps showing the last answer the rule engine actually gave.
   *
   * `manualStage` mirrors `importStage` so both modes read the same way - `idle` until the
   * operator has confirmed the authority and their password, `entering` once they have. */
  private readonly manualRows = signal<ImportManualRow[]>([]);
  /** Kept separate from `activeSelection` above, which belongs to the workbook path. The two
   * modes can be sitting on different authorities at the same time, and a re-validation must
   * use the one its own rows were entered under. */
  private manualSelection: ImportSelection | null = null;
  readonly manualPreview = signal<ExcelImportPreview | null>(null);
  readonly manualStage = signal<ImportStage>("idle");
  readonly manualStarting = signal(false);
  readonly manualChecking = signal(false);
  /** TRUE WHILE THE TABLE IS AHEAD OF THE ENGINE'S LAST ANSWER.
   *
   * It used to say that re-validating after every edit "would put an HTTP round trip behind each
   * one", so the edits were collected and checked when the operator pressed a button. That was
   * true of a keystroke and it was never true of an EDIT: `GridTextCell` commits on blur and
   * Enter and `GridSelectCell` on change, so `onCellChanged` fires once per corrected cell, not
   * once per character. What the button actually cost was the thing the whole table exists for -
   * a rating fixed the cell the ERRORS column told them to fix, the row stayed red, and nothing
   * on screen said the fix had landed until they found a button to press.
   *
   * The check is automatic now, debounced. This flag survives unchanged and does the same job in
   * the gap between the edit and the answer: while it is set, Save is refused, so nothing reaches
   * the database on the strength of a verdict that predates the correction it is meant to judge.
   * It is still cleared only on a SUCCESSFUL response, and the Re-check button stays as the
   * recovery when a check fails. */
  readonly pendingCellEdits = signal(false);
  /** the debounce behind the automatic re-check.
   *
   * `debounceTime` coalesces a burst - a rating correcting three cells in a row gets one check,
   * not three. It is NOT `switchMap`ped over the request here: `recheckRows` is promise-based and
   * guards itself with `revalidating`/`manualChecking`, and a second edit landing mid-flight
   * re-arms this subject, so the last edit always gets an answer. */
  private readonly cellEdited = new Subject<void>();
  /** True while an AUTOMATIC re-check is running, as opposed to one the operator asked for.
   *
   * Kept apart from `revalidating` because that signal is bound to the grid's `[loading]`, which
   * paints a ten-row skeleton over the table. Flashing the whole table on every corrected cell
   * would make the live verdict worse than the button it replaces. */
  readonly backgroundChecking = signal(false);
  /** Requirement 3.4 - one equipment class per run. Set once for the batch and used to
   * pre-fill every new row, so the operator states it deliberately and then does not retype
   * it eighteen times. The row editor still shows the field, so a single row can differ. */
  readonly batchEquipmentClassControl = this.fb.nonNullable.control("");
  readonly batchEquipmentClass = signal("");
  /** HOW MANY BLANK ROWS TO OPEN THE TABLE WITH.
   *
   * The operator states the equipment class and the number of spares of it they are about to
   * enter, and gets that many pre-filled rows to type into. Defaulted to 10 rather than 1, because
   * a rating entering spares equipment-wise is entering several, and starting at 1 would make the
   * count a step they have to take rather than one they can accept. */
  readonly manualRowCountControl = this.fb.nonNullable.control(10);
  readonly valueLists = signal<ImportValueLists | null>(null);
  readonly loadingValueLists = signal(false);

  // ---------------------------------------------------------------------------------------
  // THE EQUIPMENT CLASSES TAB - the fourth tab.
  //
  // It manages ONE thing: adding an equipment class under an EXISTING spare class. There is no
  // control anywhere on it that creates, renames or deletes a spare class, and there is none
  // that deletes an equipment class either - `Spares.equipment_class` is `PROTECT`, so a class
  // with spares attached cannot be removed, and removal is not part of this change.
  // ---------------------------------------------------------------------------------------

  /** The department's spare classes with their equipment classes, as the server returned them.
   * `null` until the first load, which is what separates the loading state from the empty one. */
  readonly equipmentClassMaster = signal<DepartmentEquipmentClasses | null>(null);
  readonly equipmentClassLoading = signal(false);
  /** The in-page error state. A failed load leaves the panel saying what happened and offering
   * a retry, rather than an empty grid and a toast that has already gone. */
  readonly equipmentClassLoadError = signal<string | null>(null);
  readonly equipmentClassSubmitting = signal(false);
  /** The duplicate-name refusal, held at the FIELD and not only raised as
   * a toast. The server's own sentence is used verbatim - it names the spare class the existing
   * class sits under, which is the fix rather than only the failure, per WCAG 3.3.3. */
  readonly equipmentClassNameError = signal<string | null>(null);

  /** `department` is the same locked control the Import Data tab uses and
   * reads the same two signals, so the two tabs cannot disagree about which department the
   * operator is working in. `spareClass` offers ONLY the spare classes the server returned for
   * that department - `select-input` rejects a value that is not in its own options list, so no
   * spare class can be invented through it. */
  readonly equipmentClassForm = this.fb.nonNullable.group({
    department: ["", Validators.required],
    spareClass: ["", Validators.required],
    name: ["", Validators.required],
  });

  /** The spare class picker's options. Empty until the master list loads, which is why the add
   * control is disabled until then rather than offering an empty list. */
  readonly equipmentClassSpareClassOptions = computed<DropdownOptionDto[]>(() =>
    (this.equipmentClassMaster()?.spareClasses ?? []).map((spareClass) => ({
      label: spareClass.name,
      value: spareClass.id,
    })),
  );

  /** Every equipment class the department holds, flattened one row per
   * class and carrying the spare class it sits under. Ordered by spare class and then by name -
   * the server orders it that way and the order is kept, because a list a reader has to re-sort
   * to find something in is a list that has failed them. */
  readonly equipmentClassRows = computed<RowData[]>(() =>
    (this.equipmentClassMaster()?.spareClasses ?? []).flatMap((spareClass) =>
      spareClass.equipmentClasses.map((entry) => ({
        id: entry.id,
        spareClass: spareClass.name,
        equipmentClass: entry.name,
      })),
    ),
  );

  readonly equipmentClassRowId = (row: RowData): string => String((row as { id: string }).id);

  /** Two columns and no more. Tufte - the spare class and the name are the whole of what this
   * list is, and an id column would be non-data ink that no operator can act on. */
  readonly equipmentClassColumnDefs: ColDef[] = [
    { field: "spareClass", headerName: "SPARE CLASS", width: 260 },
    { field: "equipmentClass", headerName: "EQUIPMENT CLASS", flex: 1, minWidth: 260 },
  ];

  /** Whether this caller may add one. The server decides it and the gate is on the create
   * endpoint - this only decides whether the form is shown and what is said in its place. */
  readonly canAddEquipmentClass = computed(() => this.equipmentClassMaster()?.canAdd ?? false);

  readonly pilImporting = signal(false);

  /** `password` and `importAuthority` are both real now.
   *
   * The BACKEND GAP that used to be recorded here is closed. `password` is verified against
   * `user/me/verify-password/` before the import runs, and again by the import endpoints
   * themselves, so it is the re-authentication the reference page performed and not a field
   * collected for appearance. `importType` is renamed `importAuthority` — the reference screen's
   * own label and the name the back end's parameter carries — and it is sent with both calls
   * together with the route it implies.
   *
   * `department` is real now too, and it was the last of the three. The BACKEND GAP recorded here
   * is closed: `import-excel-preview/` and `import-excel-commit-valid/` take a `department`, and
   * `SparesViewSet._import_department` resolves it through `rbac.resolve_selected_department` —
   * so the sheet is tagged to the department chosen here, an admin can import on behalf of a
   * department, and a departmental login naming another department is refused with 403 rather
   * than silently redirected to its own. The options come from `selectable-departments/`, which
   * is scoped to this caller, so a Head of Department is no longer shown every department on the
   * ship.
   *
   * `subDepartment` is NEW and it is the Executive half of requirement 3.1. It carries no
   * `Validators.required`: it is required only when the chosen department has sub-departments,
   * which is a rule about the other control's value and belongs in `resolveSelection()` where
   * that value is known, not in a static validator that would block every Engineering import. */
  readonly importForm = this.fb.nonNullable.group({
    department: ["", Validators.required],
    subDepartment: [""],
    password: ["", Validators.required],
    importAuthority: ["", Validators.required],
    file: this.fb.control<File | null>(null),
  });
  /** `subDepartment` mirrors the reference page's "Sub Department" selector (`ems.SectionName`,
   * via `getSectionOptions()`) — required for UI/flow parity, but intentionally not sent as part
   * of `createSpareDataMapping()`'s payload: `SparesMapping.section_name` FKs a *different* model
   * (`master.Section`), so posting an `ems.SectionName` id there would silently point the mapping
   * at the wrong row. Same "collected, not submitted" precedent as `importForm.password` above. */
  readonly mapForm = this.fb.nonNullable.group({
    subDepartment: ["", Validators.required],
    equipmentName: ["", Validators.required],
    equipmentClass: ["", Validators.required],
  });
  /** THERE IS NO EDIT DIALOGUE ANY MORE, on either path.
   *
   * A row was corrected by opening a modal of all eighteen columns, finding the one cell that
   * was wrong, changing it and saving - once per row. The cells are typed into directly now, in
   * the table the operator is already reading, so the dialogue and its form are gone from this
   * file and from the template.
   *
   * What survives from it is the rule its option lists were built on, and it still holds: every
   * closed list comes from `import-value-lists/` and none is written here. A value list written
   * into a component drifts from the rule engine and then offers a value the engine refuses -
   * exactly the defect the old five-entry Import Type list had, and the old `criticalOptions`,
   * which offered `NO` where clause 2.20 permits only `YES` or nothing. */
  readonly pilForm = this.fb.nonNullable.group({ file: this.fb.control<File | null>(null) });
  readonly pilFile = signal<File | null>(null);
  readonly pilDownloadingTemplate = signal(false);
  readonly pilValidating = signal(false);
  readonly pilResult = signal<VendorPilImportResult | null>(null);
  /** Import is only enabled once a dry-run against the currently-selected file has come back
   * clean — re-picking the file clears this so a stale validation can't be used to skip straight
   * to a real import. */
  readonly pilValidatedForImport = signal(false);

  /** The one working table, fed by whichever mode is showing.
   *
   * Every computed below reads THIS rather than `preview()`, so the tiles, the four filter
   * tabs, the search, the grid, the corrections sentence and the Save gate are literally the
   * same code for a hand-built row and an imported one. That is what makes acceptance A2
   * structural rather than a promise - there is no second table to keep in step.
   *
   * The two modes keep their own answers, so switching modes swaps which is shown and
   * discards neither. Acceptance A6, met by never losing anything rather than by warning. */
  readonly activePreview = computed<ExcelImportPreview | null>(() =>
    this.entryMode() === "manual" ? this.manualPreview() : this.preview(),
  );

  /** True while the operator has entered rows the rule engine has not answered on yet - a
   * failed check, or a row added while the last check was still in flight. Save is refused
   * until it clears, because a verdict that does not describe every row on screen is not a
   * verdict anyone should be allowed to act on. */
  /** Every equipment class the department already has, across every spare class, so the batch
   * control offers what exists before it lets a new name be typed. It is deliberately the
   * union rather than one spare class's list: the operator knows the equipment from the D787J
   * document and picks the spare class per row afterwards. */
  readonly batchEquipmentClassOptions = computed<DropdownOptionDto[]>(() => {
    const grouped = this.valueLists()?.equipmentClasses ?? {};
    const names = new Set<string>();
    for (const list of Object.values(grouped)) {
      for (const name of list) names.add(name);
    }
    return [...names].sort().map((name) => ({ label: name, value: name }));
  });

  readonly manualRowCount = computed(() => this.manualRows().length);
  readonly manualCheckPending = computed(
    () =>
      this.entryMode() === "manual" &&
      this.manualRows().length !== (this.manualPreview()?.rows.length ?? 0),
  );

  readonly tabCounts = computed(() => {
    const rows = this.activePreview()?.rows ?? [];
    return {
      all: rows.length,
      valid: rows.filter((row) => row.status === "valid").length,
      invalid: rows.filter((row) => row.status === "invalid").length,
      duplicate: rows.filter((row) => row.status === "duplicate").length,
    };
  });

  /** The row numbers the current tab held when it was SELECTED, or null on
   * the All Rows tab where there is nothing to pin.
   *
   * It exists because the verdict is live now. On the Invalid Only tab, a rating who corrects the
   * cell the ERRORS column told them to correct would watch the row VANISH the instant it turned
   * valid - the filter stops matching it - and the one thing they were waiting to see, the row
   * going green, is the one thing they would never see. So the tab is a snapshot: the rows that
   * were invalid when they opened the tab stay listed while they work through them, turning green
   * in place as each is fixed. The list is re-derived whenever the tab is chosen again, a new
   * sheet is previewed, or the operator presses Re-check. */
  private readonly pinnedTabRows = signal<Set<number> | null>(null);

  readonly filteredRows = computed(() => {
    const rows = this.activePreview()?.rows ?? [];
    const tab = this.activeValidationTab();
    const pinned = this.pinnedTabRows();
    const scoped =
      tab === "all"
        ? rows
        : rows.filter((row) => row.status === tab || pinned?.has(row.row) === true);
    const query = this.searchText().trim().toLowerCase();
    if (!query) return scoped;
    return scoped.filter((row) => rowMatchesSearch(row, query));
  });

  /** Every row of the workbook, flattened for the grid. There is no
   * client-side slice and no page - clause 4.6 asks for every row, and ag-grid virtualises the
   * body, so the DOM stays small without any of them being hidden from the reader. */
  readonly gridRows = computed<RowData[]>(() => this.filteredRows().map(toGridRow));

  /** Identity for the grid, so correcting one row re-renders that row rather than rebuilding
   * the whole body and losing the reader's scroll position. */
  readonly gridRowId = (row: RowData): string => String((row as ImportGridRow).row);

  /** Changes exactly when the dataset changes, so the grid resets its own view state. The
   * mode is part of the key because the two modes carry different row sets. */
  readonly gridResetKey = computed(
    () =>
      `${this.entryMode()}:${this.activePreview()?.summary.totalRows ?? 0}:` +
      `${this.removedRows().length}:${this.manualRows().length}`,
  );

  /** The working table's columns, built once.
   *
   * Everything the four visual states need is a standard `ColDef` property that `data-grid`
   * already passes through to ag-grid untouched - `cellClass` for the row tint and the two
   * cell treatments, `pinned` for the two locked columns, `cellRenderer` for the status chip
   * and the action icons. Nothing here needed a change to the shared component, and the
   * proposal to add editable-cell support to it (DS-01) is left standing and unbuilt. */
  readonly columnDefs: ColDef[] = [
    {
      field: "row",
      headerName: "Row",
      // Below `data-grid`'s own `minWidth: 120` default - that default is
      // overridden here, per column, by declaring `minWidth`/`maxWidth` explicitly, which
      // ag-grid always prefers over `defaultColDef`. A row number is two or three digits and
      // never needed the 120px every other column was forced into; narrowing it (and STATUS
      // and ACTION below) is what gives COMPARTMENT, ERRORS and the rest of the sheet's own
      // columns the room they actually need without the grid growing wider overall.
      width: 64,
      minWidth: 56,
      maxWidth: 80,
      pinned: "left",
      cellClass: (params: CellCallbackParams) => [
        this.rowStatusClass(params),
        "obs-cell--compact",
        "obs-cell--center",
      ],
      headerClass: "obs-header--compact obs-header--center",
    },
    {
      field: "status",
      headerName: "Status",
      // Narrowed from 150, with the cell's own padding cut in `obs-cell--compact` so the chip
      // keeps roughly the same room to render in as before - a narrower column and a narrower
      // gutter around it, not a narrower chip.
      width: 100,
      minWidth: 122,
      maxWidth: 190,
      pinned: "left",
      cellRenderer: GridStatusChipRenderer,
      // the RENDERED key, which is the row's status widened by the two
      // presentation states - see `rowStateKey`. `status` itself is unchanged and is still what
      // the tabs filter on and what the commit skips; this only decides which word the chip
      // shows, so a row that fails on nothing but a pattern number does not read INVALID.
      valueGetter: (params: CellCallbackParams) => {
        const row = params.data as ImportGridRow | undefined;
        return row ? rowStateKey(row) : "";
      },
      cellRendererParams: { toneMap: ROW_STATE_TONES, labelMap: ROW_STATE_LABELS },
      cellClass: (params: CellCallbackParams) => [this.rowStatusClass(params), "obs-cell--compact"],
      headerClass: "obs-header--compact",
    },
    ...IMPORT_COLUMNS.map(
      (column): ColDef => ({
        field: column.apiField,
        headerName: column.header,
        width: column.width,
        // The cell's own text, plus the workbook's own value on a second line wherever the
        // application corrected this cell from a source of truth. That second line is the
        // non-colour signal the orange treatment needs under WCAG 1.4.1, and it is also the
        // thing a rating actually needs in order to judge whether the correction was right.
        valueGetter: (params: CellCallbackParams) => this.cellText(params, column),
        cellClass: (params: CellCallbackParams) => this.cellClasses(params, column),
      }),
    ),
    {
      field: "errors",
      headerName: "ERRORS",
      width: 380,
      pinned: "right",
      // Every broken rule on its own line, and the row grows to fit them rather than
      // truncating the one thing on the row the reader has to act on.
      wrapText: true,
      autoHeight: true,
      // a renderer, because this cell now says TWO different things and
      // has to say them differently - the broken rules in red, the "will be added when you
      // save" notes in the ordinary voice. A plain text cell can only be one colour, so every
      // line in it read as a failure. See `GridErrorsCell`.
      cellRenderer: GridErrorsCell,
      cellClass: (params: CellCallbackParams) => [this.rowStatusClass(params), "obs-cell--errors"],
    },
    {
      field: "actions",
      headerName: "ACTION",
      // Two 28px icons, not the 120px a column built for a five-icon
      // action list would need - narrowed the same way ROW and STATUS above are, sized for
      // exactly the pair this column renders and no more.
      width: 88,
      minWidth: 80,
      maxWidth: 100,
      pinned: "right",
      sortable: false,
      cellRenderer: ActionRendererComponent,
      // EDIT AND DELETE, EXPLICITLY, for the same reason DELETE ALONE used
      // to be spelled out rather than left to `ActionRendererComponent`'s own fallback - see
      // `openRowEditor` above the `editingRow` signal for what Edit opens. With no `actions`
      // array `ActionRendererComponent` falls back to a hard-coded Edit + Delete pair that calls
      // `params.edit?.()`/`params.delete?.()`, neither of which this column ever defined, and its
      // `refresh()` falls back to a THREE-icon list that adds "Change Serial" on top. An explicit
      // array is the only way this cell renders exactly the two actions it means to.
      cellRendererParams: {
        actions: [
          {
            icon: "edit",
            label: "Edit row",
            color: "#2563eb",
            action: (row: RowData) => this.openRowEditor(row as ImportGridRow),
          },
          {
            icon: "delete",
            label: "Delete",
            color: "#dc2626",
            action: (row: RowData) => this.askToDeleteRow(row as ImportGridRow),
          },
        ],
      },
      cellClass: (params: CellCallbackParams) => [
        this.rowStatusClass(params),
        "obs-cell--compact",
        "obs-cell--center",
      ],
      headerClass: "obs-header--compact obs-header--center",
    },
  ];

  // -------------------------------------------------------------------------------------
  // THE HAND-ENTRY COLUMNS - the same table, typed into directly.
  //
  // Hand entry used to open a MODAL PER ROW: press Add Row, fill in a dialogue, save, press Add
  // Row again. For twenty spares of one equipment class that is twenty dialogues to enter data
  // that differs in three cells. The table is now the form: the operator asks for N rows, gets N
  // blank pre-filled rows, and types into them.
  //
  // Nothing was added to `data-grid` to do it. `columnDefs` is passed straight through to
  // ag-grid, and the two always-on renderers the design system already carries - `GridTextCell`
  // and `GridSelectCell` - are used exactly as six other screens already use them.
  //
  // THE ROW SHAPE IS THE TRAP. `toGridRow` nests every cell under `row.values[apiField]`, and
  // both renderers write flat to `params.data[field]` and call `onValueChange`. So each editable
  // column needs a `valueGetter` that reads out of `values`, and `onManualCellChanged` writes the
  // new value back into BOTH `manualRows` (what is posted) and the grid row's own `values` (what
  // stays on screen until the next check answers).
  // -------------------------------------------------------------------------------------

  /** The closed lists a hand-entered cell may draw on, in the shape `GridSelectCell` wants. An
   * empty first entry is what lets a cell be cleared back to blank - several of these columns are
   * optional and a select with no empty option cannot express that. */
  private selectOptionsFor(field: string): { label: string; value: string }[] {
    const lists = this.valueLists();
    const blank = { label: "—", value: "" };
    if (!lists) return [blank];
    const source: Record<string, DropdownOptionDto[]> = {
      spare_class: lists.spareClasses,
      category: lists.categories,
      denomination: lists.denominations,
      rack_position: lists.rackPositions,
      critical: lists.criticalValues,
    };
    const options = source[field] ?? [];
    return [blank, ...options.map((option) => ({ label: option.label, value: option.value }))];
  }

  // `permittedEquipmentClasses` and `equipmentClassOptionsFor` WERE HERE.
  // They built the per-row option list for the EQUIPMENT CLASS dropdown, narrowed by the row's
  // own Spare Class. The column is free text now - clause 2.6.1 permits any name the ship's D787J
  // document carries and the import creates it - so there is no list to narrow and nothing left
  // to ask them. `batchEquipmentClassOptions` above survives: the batch "Equipment Class for
  // these rows" control on the hand-entry form still offers the department's own list, which is
  // a convenience rather than a constraint and always accepted a typed value.

  /** one hand-entered cell changed. Written into `manualRows` by ROW NUMBER
   * rather than by array index, because the grid may be filtered or sorted and the row on screen
   * is not necessarily the nth entry of the array behind it. */
  private onCellChanged = (row: RowData, field: string, value: unknown): void => {
    const gridRow = row as ImportGridRow;
    const text = String(value ?? "");
    // Keeps the cell showing what was typed until the next check answers. The grid row is the
    // object ag-grid is rendering, so this is what the reader sees.
    gridRow.values[field] = text;
    // THE EQUIPMENT CLASS IS NO LONGER CLEARED when SPARE CLASS changes.
    //
    // That block existed because the equipment class was a closed list narrowed by the spare
    // class, so changing one could strand the other, and it emptied the cell "the moment the
    // choice that invalidated it is made". The column is free text now - clause 2.6.1 permits any
    // name the ship's D787J document carries, and the import creates it - so there is no list to
    // fall out of and nothing to be stranded by. Emptying a cell the operator typed, on their
    // behalf, without telling them, is the one behaviour worth being sure is gone.
    //
    // Rules 2.6.2 and 2.6.3 still narrow three spare classes to MICELLANEOUS and POL, and the
    // engine still fails a row that breaks them - with a message naming the clause, which is a
    // better answer than a silently blanked cell ever was.
    this.recordCellChange(gridRow.row, field, text);
    // The table is now ahead of the engine's last answer. Save is refused until it is asked
    // again - see `pendingCellEdits` in `submitBlockedReason` - and the button below the table
    // says so rather than leaving a greyed-out Save to be puzzled over.
    this.pendingCellEdits.set(true);
    // Ask for a re-check. Debounced in `ngOnInit`, so a burst of corrections costs one.
    this.cellEdited.next();
  };

  /** where a changed cell actually goes, and it differs by mode.
   *
   * A HAND-BUILT row is held by this screen, so the change is written into the row that gets
   * posted. A WORKBOOK row is not: the server re-reads the sheet from disk on every call and
   * remembers nothing between them, so the change has to travel as an EDIT alongside the file -
   * which is the same `workingEdits` overlay the Edit dialogue used to fill in, reached from the
   * cell instead of from a modal.
   *
   * Only cells the operator actually touched are recorded on the workbook path. An untouched
   * cell keeps whatever the workbook holds, so a later source-of-truth correction is not frozen
   * into an edit nobody made. */
  private recordCellChange(rowNumber: number, field: string, value: string): void {
    if (this.entryMode() === "manual") {
      // By ROW NUMBER and not by array index: the grid may be filtered or sorted, so the row on
      // screen is not necessarily the nth entry of the array behind it.
      this.manualRows.update((rows) =>
        rows.map((entry) => (entry["row"] === rowNumber ? { ...entry, [field]: value } : entry)),
      );
      return;
    }
    this.workingEdits.update((edits) => ({
      ...edits,
      [rowNumber]: { ...(edits[rowNumber] ?? {}), [field]: value },
    }));
  }

  /** THE WORKING TABLE'S COLUMNS, EDITABLE, FOR BOTH MODES.
   *
   * This was hand entry's alone, and the workbook path kept a read-only table with an Edit icon
   * that opened a modal carrying all eighteen columns. Correcting one cell of one row therefore
   * cost a dialogue, a scroll to the field, an edit and a save - for a sheet with a dozen rows
   * to fix, a dozen dialogues. The two paths are the same table over the same rule engine, so
   * they now get the same editable cells and the correction happens where the reader is already
   * looking. `onCellChanged` is what differs beneath, and only in where it writes.
   *
   * Row, Status, ERRORS and ACTION are shared with the read-only definition above by reference,
   * so a change to any of them cannot apply to one mode and not the other. */
  readonly editableColumnDefs = computed<ColDef[]>(() => {
    const selectFields = new Set([
      "spare_class",
      "category",
      "critical",
      "denomination",
      "rack_position",
    ]);
    return [
      this.columnDefs[0],
      this.columnDefs[1],
      ...IMPORT_COLUMNS.map((column): ColDef => {
        const base: ColDef = {
          field: column.apiField,
          headerName: column.header,
          width: column.width,
          // Reads out of the nested `values`, which is where `toGridRow` puts every cell.
          valueGetter: (params: CellCallbackParams) =>
            (params.data as ImportGridRow | undefined)?.values[column.apiField] ?? "",
          // Paired with the getter above and NOT optional. Both renderers call
          // `node.setDataValue(field, …)`, and against a column that has a `valueGetter` and no
          // `valueSetter` ag-grid has nowhere to put the value - it warns and drops the write.
          // This sends it back to the same nested place the getter reads from.
          valueSetter: (params: CellCallbackParams) => {
            const row = params.data as ImportGridRow | undefined;
            if (!row) return false;
            row.values[column.apiField] = String(
              (params as unknown as { newValue: unknown }).newValue ?? "",
            );
            return true;
          },
          cellClass: (params: CellCallbackParams) => this.cellClasses(params, column),
          tooltipValueGetter: (params: CellCallbackParams) => this.cellTooltip(params, column),
        };
        // The three columns that are shown and never typed into, each for
        // its own reason - AUTHORITY is the whole-batch gate chosen on the form above, SHIP
        // CUSTOMER CODE is reconciled against the active ship for the whole sheet, and SER is
        // read off the workbook and stored nowhere, so an edit to it could change nothing a save
        // would keep. All three are declared by `ImportColumn.editable`, and the server refuses
        // them too: none is in `services.IMPORT_EDITABLE_FIELDS`. PICTURE PATH used to be a
        // fourth and is now editable - the import stores it, and a path the server cannot open
        // is exactly the kind of thing an operator needs to fix from this table.
        if (!column.editable) return base;
        // EQUIPMENT CLASS IS FREE TEXT AGAIN, and it falls through to the
        // same `GridTextCell` as every other typed column below.
        //
        // It was a searchable closed list, and the note defending that said free text "let a row
        // be typed with a name no master list held - R-012-MASTER then failed it after the fact,
        // which is error reporting where error prevention was available". That reasoning has
        // expired. `services.collect_master_additions` now CREATES an equipment class the sheet
        // names, and creates it without asking anyone, because clause 2.6.1 permits any name the
        // ship's own D787J document carries. There is no error left to prevent, so there is
        // nothing for the list to close.
        //
        // The list was also destroying work. Its options are narrowed by the row's Spare Class,
        // so changing that cell could strand the equipment class - and `onCellChanged` answered
        // by CLEARING it. A rating who picked the wrong spare class, noticed, and corrected it
        // lost the equipment name they had already typed. Nothing silently empties a cell now.
        //
        // Rules 2.6.2 and 2.6.3 are untouched: `EQUIPMENT_CLASS_BY_SPARE_CLASS` still closes
        // SPARES_PLL, SPARES_MICELLANEOUS and SPARES_CONSUMABLE to MICELLANEOUS and POL, and the
        // engine still fails a row that breaks them. Free text is free only where 2.6.1 says.
        if (selectFields.has(column.apiField)) {
          return {
            ...base,
            cellRenderer: GridSelectCell,
            cellRendererParams: {
              getOptions: () => this.selectOptionsFor(column.apiField),
              onValueChange: this.onCellChanged,
            },
          };
        }
        return {
          ...base,
          cellRenderer: GridTextCell,
          cellRendererParams: { onValueChange: this.onCellChanged },
        };
      }),
      ...this.columnDefs.slice(2 + IMPORT_COLUMNS.length),
    ];
  });

  /** Both modes now get the editable columns. `columnDefs` above is kept as the source of the
   * four framing columns the editable set reuses, and is no longer rendered on its own. */
  readonly activeColumnDefs = computed<ColDef[]>(() => this.editableColumnDefs());

  /** Save is refused while ANY row would not be written, and the reason
   * is said in words rather than left to a greyed-out button. Requirement 3.6 is that nothing
   * reaches the database while a row is still failing - the previous rule was
   * `valid > 0`, which let an operator submit a sheet whose failing rows were then skipped
   * without anyone being told. A duplicate counts here too: it is a row that would not be
   * written, and Delete or a corrected pattern number is what clears it. */
  readonly submitBlockedReason = computed<string | null>(() => {
    const counts = this.tabCounts();
    if (!counts.all) return "There are no rows to import.";
    // A row the operator has typed but the engine has not answered on
    // is a row nobody can vouch for, so Save waits for the check rather than committing a
    // table that is ahead of its own verdict.
    if (this.manualCheckPending()) {
      return (
        `${this.manualRowCount()} row(s) entered and ${counts.all} checked. ` +
        `Press Check Rows so every row is validated before anything is saved.`
      );
    }
    // the same rule for a cell corrected IN the table. The verdicts on
    // screen were reached before the correction was made, so they describe a table that no
    // longer exists and nothing may be saved on them.
    if (this.pendingCellEdits()) {
      // the check is automatic now, so this sentence says what is
      // HAPPENING rather than ordering the operator to press a button that is about to fire on
      // its own. The button is still there and still named, because a check that failed leaves
      // this flag standing and pressing it is how they ask again.
      return this.backgroundChecking()
        ? "Checking your corrections against the rules…"
        : "Your corrections are about to be checked. Save is available as soon as the rows " +
            `have been judged - or press ${this.recheckLabel()} to check them now.`;
    }
    const blockers: string[] = [];
    // The invalid count is SPLIT three ways rather than reported as one
    // number, because the three need different things done to them and the sentence used to
    // send all of them to Edit. A row waiting on a pattern number needs a lookup, a row waiting
    // on a master value needs the Head of Department to answer the dialogue Save raises, and
    // only the remainder actually broke a clause. `counts.invalid` is unchanged - these are
    // subsets of it, and the arithmetic below never lets the three add up to more than it.
    const patternOnly = Math.min(this.patternOnlyRows(), counts.invalid);
    const awaitingConfirmation = Math.min(this.confirmationRows(), counts.invalid - patternOnly);
    const brokenRules = counts.invalid - patternOnly - awaitingConfirmation;
    if (brokenRules > 0) {
      blockers.push(`${brokenRules} row(s) break a rule`);
    }
    if (patternOnly) {
      blockers.push(`${patternOnly} row(s) need a pattern number ILMS or WLMS knows`);
    }
    // `awaitingConfirmation` is counted above and is DELIBERATELY NOT a
    // blocker. It is the one of the three that Save itself resolves - the dialogue is raised,
    // the Head of Department answers, the master rows are created and the same rows are then
    // committed. Blocking on it would disable the only button that can clear it, and the
    // feature would be unreachable. The other two are blockers because neither can be answered
    // from the save dialogue: a broken rule needs Edit, and a pattern number needs a lookup.
    if (counts.duplicate) {
      blockers.push(`${counts.duplicate} row(s) repeat a pattern number already in this sheet`);
    }
    if (!blockers.length) return null;
    // "with Edit" is gone from this sentence with the dialogue it named. Corrections are made in
    // the cells themselves now, so the instruction points at the table.
    return (
      `Nothing can be saved yet - ${blockers.join(", and ")}. ` +
      `Correct the cell in the table and press ${this.recheckLabel()}, or delete the row.`
    );
  });

  /** The re-check button's label, which differs by mode only in wording. Written once so the
   * button and the three sentences that tell an operator to press it cannot drift apart. */
  readonly recheckLabel = computed(() =>
    this.entryMode() === "manual" ? "Check Rows" : "Re-check Rows",
  );

  readonly canSubmitValid = computed(
    () =>
      this.submitBlockedReason() === null &&
      !this.committing() &&
      !this.revalidating() &&
      !this.manualChecking(),
  );
  readonly submitValidLabel = computed(() =>
    this.entryMode() === "manual"
      ? `Save ${this.tabCounts().valid} row(s) to Ship Inventory`
      : `Submit Valid Data (${this.tabCounts().valid} rows)`,
  );

  /** How many rows about to be saved carry a held quantity below their
   * authorised quantity. Read from the preview summary, so it is the SERVER's count of what
   * it would write and not a number this screen worked out for itself. */
  readonly shortfallRows = computed(() => this.activePreview()?.summary.shortfallRows ?? 0);

  /** The two subsets of `invalidRows` the working table now distinguishes.
   * Read from the preview summary, so they are the SERVER's counts of its own verdict and not
   * numbers this screen worked out by re-reading the rows. */
  readonly patternOnlyRows = computed(() => this.activePreview()?.summary.patternOnlyRows ?? 0);
  readonly confirmationRows = computed(() => this.activePreview()?.summary.confirmationRows ?? 0);

  /** Every master value this sheet would add, as the server reported it -
   * one entry per distinct value and not per row, so a sheet using `PCS` on twelve rows asks
   * one question rather than twelve. */
  readonly masterAdditions = computed(() => this.activePreview()?.masterAdditions ?? []);

  /** The subset somebody has to answer for. An EQUIPMENT CLASS is not in it - clause 2.6.1
   * already permits a name the ship's D787J document carries, so it is stated and added. */
  readonly confirmationsRequired = computed(() =>
    this.masterAdditions().filter((addition) => addition.confirmationRequired),
  );

  /** The rest - added on save with nothing to decide, listed so the operator is told rather
   * than finding a new equipment class in Masters afterwards and wondering where it came. */
  readonly automaticAdditions = computed(() =>
    this.masterAdditions().filter((addition) => !addition.confirmationRequired),
  );

  /** The counts clauses 4.3 and 4.4 ask to be stated with the results
   * table. Rendered as a sentence beside the table rather than as three more tiles, because
   * they are one thing the user is being told and not three numbers to compare. */
  readonly correctionSummary = computed<string | null>(() => {
    const summary = this.activePreview()?.summary;
    if (!summary) return null;
    const parts: string[] = [];
    if (summary.patternsGenerated) {
      parts.push(`generated ${summary.patternsGenerated} pattern number(s) for rows that left the cell empty`);
    }
    if (summary.descriptionsCorrected) {
      parts.push(`corrected ${summary.descriptionsCorrected} description(s)`);
    }
    if (summary.categoriesCorrected) {
      // "equipment category" rather than "CRP category". CRP is the
      // column heading ILMS and WLMS use at their end; it is not a phrase anybody on a ship
      // says, and the sentence is for them.
      parts.push(`corrected ${summary.categoriesCorrected} equipment category(s)`);
    }
    if (!parts.length) return null;
    // "your sheet" was true when a workbook was the only way onto this
    // page. It is now one of two, so the sentence names the value rather than its source.
    //
    // The tail used to promise that "every corrected cell shows the value it replaced underneath
    // it", which stopped being true when the table became inline-editable: the second line came
    // from `cellText`, whose only caller was the read-only column set nothing renders any more.
    // The value moved to the cell's tooltip and the sentence now says where to find it, because
    // a sentence that tells the reader to look somewhere there is nothing to see is worse than
    // no sentence at all.
    return (
      `SWMM ${parts.join(", ")} from the ILMS and WLMS source of truth. ` +
      "Every corrected cell is marked, and hovering it shows the value it replaced."
    );
  });

  /** The tint class for a whole row, read by every column so the row reads as one band. */
  private rowStatusClass(params: CellCallbackParams): string {
    const row = params.data as ImportGridRow | undefined;
    return row ? rowTintClass(row) : "";
  }

  private cellClasses(params: CellCallbackParams, column: ImportColumn): string[] {
    const row = params.data as ImportGridRow | undefined;
    if (!row) return [];
    const classes = [rowTintClass(row)];
    if (row.corrections[column.apiField] !== undefined) {
      classes.push("obs-cell--corrected");
    }
    // Clause 5.1 - red text on a pattern number that matched no source of truth. The reason
    // it is red is spelled out in the ERRORS column on the same row.
    if (column.apiField === "pattern_number" && row.patternUnmatched) {
      classes.push("obs-cell--unmatched");
    }
    // and GREEN on one that DID match, which had no treatment at all.
    //
    // The red said "this one is wrong" and everything else said nothing, so a pattern number
    // ILMS had confirmed and one nobody had checked read identically. On a sheet where most rows
    // resolve, that made the red look like the only state worth having an opinion about; on one
    // where few do, it hid how much work the source-of-truth check had actually done. The
    // non-colour half is the tooltip in `cellTooltip`, which names the source that answered.
    if (column.apiField === "pattern_number" && row.patternMatched) {
      classes.push("obs-cell--matched");
    }
    return classes;
  }

  /** The cell's title attribute. Two things earn one, and both are things
   * the table can otherwise only say in colour.
   *
   * A MATCHED pattern number names the source that answered - ILMS's item master, the MO or WED
   * source-of-truth tables, or WLMS - which is the one fact about a resolved row that appears
   * nowhere else on this screen.
   *
   * A CORRECTED cell carries the value the workbook actually held. That used to be rendered as a
   * second line inside the cell by `cellText`, whose only caller was the read-only column set the
   * page stopped rendering when the table became editable - so the orange has had no non-colour
   * partner since. A tooltip is not as good as the line was and is a great deal better than
   * nothing; restoring the line means changing the shared `GridTextCell` that other screens use. */
  private cellTooltip(params: CellCallbackParams, column: ImportColumn): string {
    const row = params.data as ImportGridRow | undefined;
    if (!row) return "";
    const parts: string[] = [];
    const original = row.corrections[column.apiField];
    if (original !== undefined) {
      parts.push(`before correction: ${original || "(empty)"}`);
    }
    if (column.apiField === "pattern_number" && row.patternMatched && row.patternSource) {
      parts.push(`matched in ${PATTERN_SOURCE_LABELS[row.patternSource] ?? row.patternSource}`);
    }
    return parts.join("\n");
  }

  private cellText(params: CellCallbackParams, column: ImportColumn): string {
    const row = params.data as ImportGridRow | undefined;
    if (!row) return "";
    const value = row.values[column.apiField] ?? "";
    const original = row.corrections[column.apiField];
    if (original === undefined) return value;
    // "your sheet held" was written when a workbook was the only source
    // of a row. A hand-built row has no sheet, so the second line names the value it replaced.
    return `${value}\nbefore correction: ${original || "(empty)"}`;
  }

  ngOnInit(): void {
    // THE LIVE VERDICT. Every corrected cell pushes into `cellEdited`, and
    // a quiet moment later the same `recheckRows` the button calls runs by itself, so the row
    // the operator just fixed comes back green without them having to ask.
    //
    // 500ms is chosen against the event, not against typing: `onCellChanged` fires on blur,
    // Enter or a select change, so this is coalescing a rating tabbing across two or three cells
    // of one row, not their keystrokes. A check already running is skipped rather than queued -
    // `recheckRows` guards on `revalidating`/`manualChecking` - and the edit that arrived during
    // it has already re-armed this subject, so the last correction always gets an answer.
    this.cellEdited
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.recheckRows({ background: true }));
    void this.loadDepartmentOptions();
    void this.loadMapOptions();
    // Both are read once on entry and neither depends on the department, so
    // neither belongs in `onDepartmentChanged` below. The customer code is ship-wide, and whether
    // this login may clear spares is a question about the login, not about a form value.
    void this.loadCustomerCodeState();
    void this.loadPurgeState();
    this.importForm.controls.file.valueChanges.subscribe((file) => this.onImportFileChanged(file));
    // See `selectedDepartmentId` / `selectedImportAuthority` above.
    //
    // The department is no longer a value that only the template download reads. It scopes the
    // import authorities, the hand-entry value lists and the sub-department list, so changing it
    // re-reads all three rather than leaving the form describing the department that was chosen
    // before. `loadImportAuthorityOptions` is no longer called from `ngOnInit` at all - it now
    // needs a department, and the department arrives asynchronously.
    this.importForm.controls.department.valueChanges.subscribe((value) =>
      this.onDepartmentChanged(value ?? ""),
    );
    this.importForm.controls.importAuthority.valueChanges.subscribe((value) => {
      this.selectedImportAuthority.set(value ?? "");
      // The authority settles the route, and the route decides which
      // spare classes clause 2.5 permits, so the closed lists are re-read whenever it changes
      // rather than fetched once and reused across two different routes.
      void this.loadImportValueLists();
    });
    // The mode chooser. It swaps which controls the tab shows and
    // nothing else - no navigation, and neither mode's rows are touched by the switch.
    this.entryModeControl.valueChanges.subscribe((mode) => this.onEntryModeChanged(mode));
    // Mirrored into a signal for the same reason the department and the
    // authority are - a `computed()` under `OnPush` cannot read a FormGroup value directly.
    this.batchEquipmentClassControl.valueChanges.subscribe((value) =>
      this.batchEquipmentClass.set((value ?? "").trim().toUpperCase()),
    );
    this.pilForm.controls.file.valueChanges.subscribe((file) => this.onPilFileChanged(file));
    // The Equipment Classes tab re-reads whenever its department changes,
    // for the same reason the Import Data tab does - the list is per department and leaving it
    // showing the previous department's classes would be worse than showing none.
    this.equipmentClassForm.controls.department.valueChanges.subscribe(() =>
      void this.loadEquipmentClassMaster(),
    );
    // Clearing the field-level refusal as soon as the operator changes the name is what makes
    // the message a correction rather than a verdict that sticks - Nielsen 3 and 9.
    this.equipmentClassForm.controls.name.valueChanges.subscribe(() =>
      this.equipmentClassNameError.set(null),
    );
  }

  /** Switching modes shows the other mode's controls and the other
   * mode's rows. It discards nothing - acceptance A6 is met by not losing the work rather
   * than by warning about losing it, which is the better answer to the same question.
   *
   * The one thing it must do is clear an authority the new mode may not use: D787J is offered
   * in Mode 2 and never in Mode 1, so a switch to hand entry while D787J is selected would
   * otherwise leave a value chosen that the list no longer shows. */
  private onEntryModeChanged(mode: EntryMode): void {
    this.entryMode.set(mode);
    this.activeValidationTab.set("all");
    this.searchText.set("");
    this.pendingDeleteRow.set(null);
    // The two modes carry different row sets, so a row number selected in one means something
    // else in the other. The selection does not cross the switch.
    this.clearRowSelection();
    if (mode === "manual" && this.selectedImportRoute() === "D787J") {
      this.importForm.controls.importAuthority.setValue("");
      this.notifications.error(
        "D787J spares are loaded from the D787J template workbook only. Pick another import authority to build rows by hand.",
      );
    }
  }

  /** Every closed list the row editor offers, for this caller's own
   * department and the selected route. Read from the back end on every route change and never
   * hard-coded here - the lists come from the same `services` register the rule engine
   * validates against, so the form cannot offer a value the engine refuses. */
  private async loadImportValueLists(): Promise<void> {
    const route = this.selectedImportRoute();
    const department = this.selectedDepartmentId();
    if (!route || !department) {
      this.valueLists.set(null);
      return;
    }
    this.loadingValueLists.set(true);
    try {
      this.valueLists.set(await firstValueFrom(this.api.getImportValueLists(route, department)));
    } catch (error) {
      console.error("Failed to load the import value lists:", error);
      this.valueLists.set(null);
      this.notifications.error(
        "Could not load the permitted values for your department. Please refresh and try again.",
      );
    } finally {
      this.loadingValueLists.set(false);
    }
  }

  /** The Import Authority list, fetched per visit rather than cached with
   * the other master lists — it is a permission answer, and a role change must not be served from
   * a stale copy. A failure leaves the control empty and says so, rather than silently falling
   * back to a hard-coded list that would offer D787J to everyone. */
  private async loadImportAuthorityOptions(): Promise<void> {
    const department = this.selectedDepartmentId();
    if (!department) {
      // Nothing to ask about yet. The list is per department and per role, and an unscoped
      // request would 400 for a privileged caller who has not chosen one.
      this.importAuthorityOptions.set([]);
      this.loadingAuthorities.set(false);
      return;
    }
    this.loadingAuthorities.set(true);
    try {
      const result = await firstValueFrom(this.api.getImportAuthorities(department));
      this.importAuthorityOptions.set(result.authorities);
    } catch (error) {
      console.error("Failed to load Import Authority options:", error);
      this.importAuthorityOptions.set([]);
      this.notifications.error(
        "Could not load the import authorities you are allowed to use. Please refresh and try again.",
      );
    } finally {
      this.loadingAuthorities.set(false);
    }
  }

  /** Everything that has to follow a change of department, in one place.
   *
   * The department scopes three separate answers - which sub-departments exist under it, which
   * import authorities it permits, and which closed values a hand-entered row may draw on - and
   * all three have to be re-asked together. Leaving any one behind would show the operator a form
   * that describes two different departments at once, which is worse than showing them nothing.
   *
   * The sub-department is cleared first, before the new list is fetched, so a value chosen under
   * the previous department can never survive into the next one and be posted against it. The
   * server would refuse it - `_import_sub_department` checks that the sub-department belongs to
   * the chosen department - but a refusal the user could have been spared is still a defect. */
  private onDepartmentChanged(departmentId: string): void {
    this.selectedDepartmentId.set(departmentId);
    this.importForm.controls.subDepartment.setValue("");
    this.importSubDepartmentOptions.set([]);
    this.importSubDepartmentLocked.set(false);
    void this.loadImportSubDepartments(departmentId);
    void this.loadImportAuthorityOptions();
    void this.loadImportValueLists();
    void this.loadTemplateRoutes();
  }

  // -------------------------------------------------------------------------------------
  // THE THREE ANSWERS THIS SCREEN NOW ASKS THE SERVER FOR BEFORE THE
  // OPERATOR CAN GET ANYTHING WRONG — which template buttons can succeed, what the ship's MO
  // customer code is, and whether this login may clear spares.
  //
  // All three are error PREVENTION rather than error reporting. Every one of them used to be
  // discovered by attempting the act and being refused.
  // -------------------------------------------------------------------------------------

  /** Which Download Template buttons exist for the chosen department and sub-department. A
   * failure leaves the list empty and the whole bar hidden — offering a button that 404s is worse
   * than offering none, and the workbook is also obtainable from the ship's own records. */
  private async loadTemplateRoutes(): Promise<void> {
    const departmentId = this.selectedDepartmentId();
    if (!departmentId) {
      this.availableTemplateRoutes.set([]);
      return;
    }
    try {
      const result = await firstValueFrom(
        this.api.getImportTemplateRoutes(departmentId, this.selectedSubDepartmentLabel() || undefined),
      );
      this.availableTemplateRoutes.set(result.routes);
    } catch (error) {
      console.error("Failed to load the available import templates:", error);
      this.availableTemplateRoutes.set([]);
    }
  }

  /** The ship's adopted MO customer code. A failure leaves the panel absent rather than asserting
   * a code the page does not know — a wrong code on this panel would send an operator off to edit
   * thirty-five workbooks. */
  private async loadCustomerCodeState(): Promise<void> {
    try {
      this.customerCodeState.set(await firstValueFrom(this.api.getShipCustomerCodeState()));
    } catch (error) {
      console.error("Failed to read the ship's MO customer code:", error);
      this.customerCodeState.set(null);
    }
  }

  /** Whether this login may clear OBS spares, and over what scope. A 403 is the ORDINARY answer
   * for a Dy HOD or a storekeeper, so it is swallowed and the control is simply absent. */
  private async loadPurgeState(): Promise<void> {
    try {
      this.purgeState.set(await firstValueFrom(this.api.getSparesPurgeState()));
    } catch {
      this.purgeState.set(null);
    }
  }

  askToClearCustomerCode(): void {
    this.confirmingCustomerCodeClear.set(true);
  }

  cancelClearCustomerCode(): void {
    this.confirmingCustomerCodeClear.set(false);
  }

  /** forgets the adopted code so the NEXT workbook imported sets it again.
   * No spare is deleted and no pattern number already minted is changed — the panel's own
   * confirmation says so, because "clear" beside a delete button invites the wrong reading. */
  async confirmClearCustomerCode(): Promise<void> {
    this.clearingCustomerCode.set(true);
    try {
      const result = await firstValueFrom(this.api.clearShipCustomerCode());
      this.customerCodeState.set(result);
      this.confirmingCustomerCodeClear.set(false);
      this.notifications.success(
        result.detail ??
          "The MO customer code has been cleared. The next workbook imported will set it again.",
      );
    } catch (error) {
      this.notifications.error(
        error instanceof Error ? error.message : "Could not clear the MO customer code.",
      );
    } finally {
      this.clearingCustomerCode.set(false);
    }
  }

  /** Re-reads the live count before asking, so the confirmation names the number of spares that
   * are there NOW rather than the number there were when the page was opened. */
  async askToPurgeSpares(): Promise<void> {
    await this.loadPurgeState();
    if (!this.purgeState()) {
      this.notifications.error("You are not allowed to clear spares from the Ship Inventory.");
      return;
    }
    this.confirmingPurge.set(true);
  }

  cancelPurgeSpares(): void {
    this.confirmingPurge.set(false);
  }

  /** the delete itself. The confirmation phrase is sent from here rather
   * than typed by the operator: the modal above already names the scope, the live count and the
   * records that go with the spares, and asking a rating to transcribe the word DELETE on top of
   * that is a second lock on a door that is already shut. The back end still requires the phrase,
   * so a script cannot reach this endpoint by accident. */
  async confirmPurgeSpares(): Promise<void> {
    this.purging.set(true);
    try {
      const result = await firstValueFrom(this.api.purgeSpares(PURGE_CONFIRMATION_PHRASE));
      this.confirmingPurge.set(false);
      this.notifications.success(result.detail);
      // The table on screen described spares that no longer exist, and the count in the header
      // control is now wrong. Both are re-read rather than adjusted locally.
      this.resetHandEntry();
      this.resetImport();
      await this.loadPurgeState();
    } catch (error) {
      this.notifications.error(
        error instanceof Error ? error.message : "Could not clear the Ship Inventory spares.",
      );
    } finally {
      this.purging.set(false);
    }
  }

  /** The dependent sub-department list — requirement 3.1, defect F-26.
   *
   * An empty list is the NORMAL answer for Engineering, Electrical and Medical, not a failure:
   * EXECUTIVE is the only department organised sub-department wise. The control simply does not
   * render, rather than rendering empty.
   *
   * A `locked` answer means the caller is the Dy HOD of one sub-department. They are given their
   * own and only their own, and the value is pre-selected for them, because there is no choice to
   * make and asking for one would be a form asking a question it already knows the answer to. */
  private async loadImportSubDepartments(departmentId: string): Promise<void> {
    if (!departmentId) return;
    this.loadingSubDepartments.set(true);
    try {
      const result = await firstValueFrom(this.api.getSubDepartments(departmentId));
      this.importSubDepartmentOptions.set(result.subDepartments);
      this.importSubDepartmentLocked.set(result.locked && result.subDepartments.length > 0);
      if (result.subDepartments.length === 1 && result.locked) {
        // Same deferred write, and for the same change-detection reason, as the department
        // default below - `<app-select-input>`'s `[options]` binding only picks up the array
        // just set above on Angular's next pass.
        const only = result.subDepartments[0].value;
        setTimeout(() => this.importForm.controls.subDepartment.setValue(only));
      }
    } catch (error) {
      console.error("Failed to load the sub-department list:", error);
      this.importSubDepartmentOptions.set([]);
      this.notifications.error(
        "Could not load the sub-departments for this department. Please refresh and try again.",
      );
    } finally {
      this.loadingSubDepartments.set(false);
    }
  }

  /** The label of the currently-selected department, for the download
   * filename and for the "not yet available" message. Falls back to the raw id, which is only
   * reachable if the options list failed to load. */
  private selectedDepartmentLabel(): string {
    const id = this.selectedDepartmentId();
    return this.departmentOptions().find((option) => option.value === id)?.label ?? id;
  }

  /** The NAME of the currently-selected sub-department, which is what
   * `download-template/` takes. Empty when none is chosen or the department has none. */
  private selectedSubDepartmentLabel(): string {
    const id = this.importForm.value.subDepartment ?? "";
    if (!id) return "";
    return this.importSubDepartmentOptions().find((option) => option.value === id)?.label ?? "";
  }

  /** Requirement 3.7 — download the caller's own department's curated
   * workbook for one of the two routes. The department sent is the one selected in the form, which
   * a departmental login can only ever set to its own. A request for another department's template
   * is refused by the back end, so this control narrows the choice rather than being the gate.
   *
   * A 404 is the documented "no workbook has been authored for this combination yet" answer, not a
   * failure, so it is worded for the user instead of reported as an error. */
  async downloadImportTemplate(route: ImportRoute): Promise<void> {
    const departmentId = this.selectedDepartmentId();
    if (!departmentId) {
      this.importForm.controls.department.markAsTouched();
      this.notifications.error("Select the department first, then download its template.");
      return;
    }
    // The chosen sub-department now narrows the download too, so a Hull
    // officer is handed the HULL workbook rather than the general Executive one.
    //
    // Note carefully WHICH value is sent. `download-template/` takes the workbook CODE - the
    // sub-department's NAME, `HULL` or `NBCD` - while the import endpoints take the
    // `master.SubDepartment` ROW ID. The two parameters are spelled the same and mean different
    // things, so the option's `label` goes here and its `value` goes to the import. Recorded in
    // `ImportSelection` as well, because this is the kind of difference that is only obvious once.
    const subDepartmentCode = this.selectedSubDepartmentLabel();
    const departmentLabel = this.selectedDepartmentLabel();
    const scopeLabel = subDepartmentCode
      ? `${departmentLabel} - ${subDepartmentCode}`
      : departmentLabel;
    this.downloadingTemplate.set(route);
    try {
      const blob = await firstValueFrom(
        this.api.downloadSparesImportTemplate(departmentId, route, subDepartmentCode || undefined),
      );
      // the scope label is a LABEL and is not a file name. It reads
      // `E | ENGINEERING` on a deployment whose department row carries the short name, and `|`
      // is illegal in a Windows file name - the save would have failed or been silently
      // renamed by the browser. Every run of characters that is not safe in a file name
      // becomes a single underscore, which also subsumes the ` - ` the sub-department joins on.
      // Split-and-join rather than replace-then-trim: it drops the leading and trailing empty
      // pieces by itself, and needs no second anchored pattern to strip them.
      const fileScope = scopeLabel.split(/[^A-Za-z0-9]+/).filter(Boolean).join("_");
      this.exportService.downloadBlob(
        blob,
        `${fileScope}_SWMM_IMPORT_TEMPLATE_${route}.xlsx`,
      );
    } catch (error) {
      const notFound = error instanceof HttpErrorResponse && error.status === 404;
      this.notifications.error(
        notFound
          ? `No import template is available yet for ${scopeLabel} on the ${route} route.`
          : "Could not download the import template. Please try again.",
      );
    } finally {
      this.downloadingTemplate.set(null);
    }
  }

  /** Requirement 3.2 and defects F-07 and F-08, both closed here.
   *
   * The list now comes from `selectable-departments/`, which returns
   * `rbac.visible_departments_for(caller)` — so an Engineering Head of Department is offered
   * Engineering and nothing else, where before this control was fed `master_dropdown`'s unscoped
   * list and showed every department on the ship to everybody. The narrowing is the SERVER's, not
   * this component's: nothing is filtered here, and the import endpoints refuse a department the
   * caller is not entitled to whatever this list happened to contain.
   *
   * The same response says whether the control should LOCK, and which department to pre-select.
   * Both used to be derived here — the default was read off `/me/`'s `profile.department_detail`
   * and the lock did not exist. Reading the caller's own department out of the token payload and
   * matching it against a list is exactly the "view that re-derives the rule" `backend\CLAUDE.md`
   * warns about, one layer further out, so both answers now come from the one place that decides
   * them. `userStore` is still used on this page, for the password re-authentication. */
  private async loadDepartmentOptions(): Promise<void> {
    let result;
    try {
      result = await firstValueFrom(this.api.getSelectableDepartments());
    } catch (error) {
      console.error("Failed to load Select Department options:", error);
      this.notifications.error("Could not load departments. Please refresh and try again.");
      return;
    }
    this.departmentOptions.set(result.departments);
    this.departmentLocked.set(result.locked);

    // Pre-select the caller's own department when it is one of the options, and fall back to the
    // reference page's own behaviour - auto-select when there is exactly one - for the privileged
    // accounts that belong to no operational department. With several options and no own
    // department, nothing is assumed and the operator chooses.
    const own = result.departments.find((option) => option.value === result.selectedDepartment);
    const defaultDepartment =
      own?.value ?? (result.departments.length === 1 ? result.departments[0].value : "");
    if (defaultDepartment) {
      // Deferred a tick: `<app-select-input>`'s `[options]` binding only picks up the array
      // just set above on Angular's *next* change-detection pass — writing the FormControl
      // value in the same synchronous tick races that, so the dropdown's own option list (and
      // not just its closed-state label) briefly still sees the old, empty options array and
      // renders "No results found" even though a value is already bound.
      setTimeout(() => this.importForm.controls.department.setValue(defaultDepartment));
    }
  }

  /** `Promise.allSettled`, not `Promise.all` — one failing call must not blank out the other two
   * dropdowns' otherwise-successful results (see the equivalent fix in `mo-masters.ts`).
   *
   * Reference-page parity: unlike "Select Department", its Sub Department / INSMA Equipment Name
   * `<select>`s have no blank placeholder `<option>` at all, so the browser always defaults them
   * to the first entry — mirrored here by pre-selecting `options[0]` once each list loads. */
  private async loadMapOptions(): Promise<void> {
    const [subDepartments, equipment, equipmentClasses] = await Promise.allSettled([
      firstValueFrom(this.api.getSectionOptions()),
      firstValueFrom(this.api.getShipEquipmentOptions()),
      firstValueFrom(this.api.getEquipmentClasses()),
    ]);
    if (subDepartments.status === "fulfilled") {
      this.subDepartmentOptions.set(subDepartments.value);
      if (subDepartments.value.length) {
        // See the equivalent comment in `loadDepartmentOptions()` — deferred so the child
        // select's `[options]` binding has already updated before the value lands on it.
        setTimeout(() => this.mapForm.controls.subDepartment.setValue(subDepartments.value[0].value));
      }
    } else {
      console.error("Failed to load Sub Department options:", subDepartments.reason);
    }
    if (equipment.status === "fulfilled") {
      this.equipmentOptions.set(equipment.value);
      if (equipment.value.length) {
        setTimeout(() => this.mapForm.controls.equipmentName.setValue(equipment.value[0].value));
      }
    } else {
      console.error("Failed to load INSMA Equipment Name options:", equipment.reason);
    }
    if (equipmentClasses.status === "fulfilled") {
      this.equipmentClassOptions.set(equipmentClasses.value);
    } else {
      console.error("Failed to load Ship Inventory Equipment Class options:", equipmentClasses.reason);
    }
    if ([subDepartments, equipment, equipmentClasses].some((r) => r.status === "rejected")) {
      this.notifications.error("Some Spare Data Map dropdown options failed to load. Please refresh and try again.");
    }
  }

  selectTab(tab: MastersTab): void {
    this.activeTab.set(tab);
    // The Equipment Classes tab loads on first entry rather than on page
    // load, so a user who only ever imports never pays for a list they do not open. It seeds its
    // department control from the same answer the Import Data tab already has, so the two tabs
    // open on the same department and the operator is not asked the same question twice.
    if (tab === "equipment-class") {
      if (!this.equipmentClassForm.controls.department.value) {
        const departments = this.departmentOptions();
        const seed = this.importForm.controls.department.value
          || (departments.length === 1 ? departments[0].value : "");
        if (seed) {
          // Deferred a tick for the same reason `loadDepartmentOptions()` defers - the child
          // select's `[options]` binding has not seen the array yet in this same tick.
          setTimeout(() => this.equipmentClassForm.controls.department.setValue(seed));
          return;
        }
      }
      void this.loadEquipmentClassMaster();
    }
  }

  /** The Equipment Classes tab's one read. Re-read after every successful
   * add, so the grid is the server's answer and never a locally-appended row that could differ
   * from what was actually stored. */
  private async loadEquipmentClassMaster(): Promise<void> {
    const department = this.equipmentClassForm.controls.department.value;
    if (!department) {
      this.equipmentClassMaster.set(null);
      return;
    }
    this.equipmentClassLoading.set(true);
    this.equipmentClassLoadError.set(null);
    try {
      const result = await firstValueFrom(this.api.getDepartmentEquipmentClasses(department));
      this.equipmentClassMaster.set(result);
    } catch (error) {
      console.error("Failed to load the department's equipment classes:", error);
      this.equipmentClassMaster.set(null);
      this.equipmentClassLoadError.set(getErrorMessage(error));
    } finally {
      this.equipmentClassLoading.set(false);
    }
  }

  /** Retry from the in-page error panel, so a failed load is recoverable without a page reload. */
  async retryEquipmentClassMaster(): Promise<void> {
    await this.loadEquipmentClassMaster();
  }

  /** Adds ONE equipment class under an EXISTING spare class.
   *
   * It posts `type=equipment_class` and nothing else. There is no branch here, and no branch
   * anywhere on this page, that posts `type=spare_class` - acceptance A2.
   *
   * A duplicate name comes back as a 400 carrying the server's own sentence under the `name`
   * key, and it is written UNDER THE FIELD rather than only raised as a toast, because a toast
   * disappears and the operator has to act on this one. The form is NOT cleared on a refusal -
   * what they typed stays there to be corrected. */
  async submitEquipmentClass(): Promise<void> {
    if (this.equipmentClassForm.invalid) {
      this.equipmentClassForm.markAllAsTouched();
      return;
    }
    const { spareClass, name } = this.equipmentClassForm.getRawValue();
    const trimmed = name.trim().toUpperCase();
    if (!spareClass || !trimmed) return;
    this.equipmentClassSubmitting.set(true);
    this.equipmentClassNameError.set(null);
    try {
      await firstValueFrom(this.api.createEquipmentClass(trimmed, spareClass));
      this.notifications.success(`${trimmed} added to this department's equipment classes.`);
      // Only the name is cleared. The spare class stays as it was, because adding several
      // classes under one spare class in a row is the normal shape of this task and re-picking
      // it every time would be a step the operator does not need - doctrine 5.12.4.
      this.equipmentClassForm.controls.name.setValue("");
      this.equipmentClassForm.controls.name.markAsUntouched();
      await this.loadEquipmentClassMaster();
    } catch (error) {
      this.equipmentClassNameError.set(this.equipmentClassFieldError(error));
    } finally {
      this.equipmentClassSubmitting.set(false);
    }
  }

  /** The `name` field error out of the project's own envelope
   * (`{"status": "error", "message": "...", "name": ["..."]}` from
   * `swmm.exceptions.custom_exception_handler`), falling back to `message` for a refusal that is
   * not about the name - the 403 a caller without the entitlement gets, for one. */
  private equipmentClassFieldError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (body && typeof body === "object") {
        const field = (body as Record<string, unknown>)["name"];
        if (Array.isArray(field) && typeof field[0] === "string") return field[0];
      }
    }
    return getErrorMessage(error);
  }

  /** If the selected file changes after a preview exists, the preview no longer describes what
   * would actually be submitted — force a fresh "Preview Import" before "Submit Valid Data" can
   * show a trustworthy row count again. */
  private onImportFileChanged(file: File | null): void {
    // The in-page error state is cleared here too - picking a different
    // file is the user acting on the refusal, and leaving the panel up would report a failure
    // about a file that is no longer selected.
    this.previewError.set(null);
    if (this.importStage() !== "previewed") return;
    const fingerprint = file ? fileFingerprint(file) : null;
    if (fingerprint !== this.previewedFileFingerprint) {
      this.importStage.set("idle");
      this.preview.set(null);
      // The working table belongs to the file it was built from. A
      // correction made to row 7 of one workbook means nothing on row 7 of another, so the
      // edits go with the preview rather than surviving it.
      this.discardWorkingTable();
    }
  }

  /** Forgets every correction and deletion, and the file and selection
   * they were made against. Touches nothing in the database - there is nothing in the database
   * to touch until Submit Valid Data is pressed. */
  private discardWorkingTable(): void {
    this.workingEdits.set({});
    // The table is gone, so it can no longer be ahead of the engine's last answer.
    this.pendingCellEdits.set(false);
    this.removedRows.set([]);
    this.activeSelection = null;
    this.activeFile = null;
    this.pendingDeleteRow.set(null);
    this.clearRowSelection();
  }

  /** `confirmedMasterAdditions` is PASSED IN rather than read from
   * `mastersConfirmed` here, because the save consumes that flag before it posts - reading it
   * inside this method would have sent an empty confirmation on every commit and silently
   * skipped every row waiting on one. Absent on every preview, which is what keeps a preview
   * from settling anything. */
  private workingTable(
    confirmedMasterAdditions?: { field: string; value: string }[],
  ): ImportWorkingTable {
    return {
      edits: this.workingEdits(),
      removedRows: this.removedRows(),
      confirmedMasterAdditions,
    };
  }

  /** The values to confirm on THIS save, or `undefined` when there is nothing to confirm. */
  private confirmedMasterAdditions(): { field: string; value: string }[] | undefined {
    if (!this.mastersConfirmed) return undefined;
    const confirmed = this.confirmationsRequired().map((addition) => ({
      field: addition.field,
      value: addition.value,
    }));
    return confirmed.length ? confirmed : undefined;
  }

  /** Resolves the four things every import call now carries, and
   * re-authenticates the operator before either call runs.
   *
   * Returns `null` when the form is not ready or the password is wrong, having already said which
   * at the field. The password check is a courtesy, not the gate — the import endpoints verify the
   * same password, the same authority and the same route server side, so nothing here can be
   * skipped to gain anything. It exists so a mistyped password is caught before the operator waits
   * on a workbook upload. */
  private async resolveImportSelection(): Promise<({ file: File } & ImportSelection) | null> {
    if (this.importForm.invalid) {
      this.importForm.markAllAsTouched();
      this.notifications.error(
        "Select a department, enter your login password, and pick the import authority this sheet carries.",
      );
      return null;
    }
    const file = this.importForm.value.file;
    if (!file) {
      this.notifications.error("Select an Excel (*.xlsx) file to import.");
      return null;
    }
    const selection = await this.resolveSelection();
    return selection ? { file, ...selection } : null;
  }

  /** The three values BOTH modes carry, split out of the method above so
   * hand entry is not made to invent a file it does not have. The file check stays where it
   * belongs, on the workbook path alone, and neither mode has its own copy of the route,
   * authority and password logic. */
  private async resolveSelection(): Promise<ImportSelection | null> {
    if (
      this.importForm.controls.password.invalid ||
      this.importForm.controls.importAuthority.invalid ||
      this.importForm.controls.department.invalid
    ) {
      this.importForm.markAllAsTouched();
      this.notifications.error(
        "Select a department, enter your login password and pick the import authority these rows carry.",
      );
      return null;
    }
    // The department, sent for the first time. `readonly` rather than
    // `disabled` on the control is what makes this line possible - a disabled control's value is
    // absent from `form.value` and this would read `undefined` for exactly the single-department
    // login the lock exists for.
    const department = this.importForm.value.department ?? "";
    // The sub-department is REQUIRED when the chosen department has any,
    // and meaningless when it has none. That is a rule about another control's value, which is
    // why it is checked here rather than as a static `Validators.required` that would block every
    // Engineering import.
    const subDepartment = this.importForm.value.subDepartment ?? "";
    if (this.showImportSubDepartment() && !subDepartment) {
      this.importForm.controls.subDepartment.markAsTouched();
      this.notifications.error("Pick the sub-department these rows belong to.");
      return null;
    }
    const route = this.selectedImportRoute();
    const authority = this.selectedImportAuthority();
    if (!route || !authority) {
      this.importForm.controls.importAuthority.markAsTouched();
      this.notifications.error("Pick the import authority this sheet carries.");
      return null;
    }
    const password = this.importForm.value.password ?? "";
    try {
      if (!(await this.userStore.verifyLoginPassword(password))) {
        this.importForm.controls.password.markAsTouched();
        this.notifications.error("Incorrect password. Enter your own login password.");
        return null;
      }
    } catch {
      this.notifications.error("Could not confirm your password. Please try again.");
      return null;
    }
    return {
      department,
      // Omitted rather than sent empty - the back end reads its absence as "not attributed to a
      // sub-department", which is the correct answer for every non-Executive department.
      ...(subDepartment ? { subDepartment } : {}),
      route,
      authority,
      password,
    };
  }

  /** Dry-run validate the selected file (`previewImportExcel` — nothing is written). The panel
   * always renders on success, even with 0 valid rows, so the user can see exactly why. */
  async previewImport(): Promise<void> {
    const selection = await this.resolveImportSelection();
    if (!selection) return;
    const { file, ...importSelection } = selection;
    // A fresh preview starts a fresh working table. Corrections made
    // against the last file cannot be carried into this one.
    this.discardWorkingTable();
    this.previewError.set(null);
    this.previewing.set(true);
    try {
      const result = await firstValueFrom(this.api.previewImportExcel(file, importSelection));
      this.preview.set(result);
      this.previewedFileFingerprint = fileFingerprint(file);
      this.activeFile = file;
      this.activeSelection = importSelection;
      this.importStage.set("previewed");
      this.activeValidationTab.set("all");
      this.searchText.set("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validation failed.";
      // Both surfaces, deliberately. The toast says it happened, the panel is still there
      // when the user comes back to the screen to act on it.
      this.previewError.set(message);
      this.notifications.error(message);
    } finally {
      this.previewing.set(false);
    }
  }

  /** Re-validates the working table after a correction or a deletion.
   *
   * The same workbook is posted again with the corrections attached, and the answer replaces
   * the table. Nothing is re-classified in the browser - there is one rule engine, it lives on
   * the server, and this is how a corrected row comes back green without this screen ever
   * deciding that it should. */
  private async revalidateWorkingTable(
    options: { background?: boolean } = {},
  ): Promise<void> {
    const background = options.background === true;
    const file = this.activeFile;
    const selection = this.activeSelection;
    if (!file || !selection) return;
    // See `backgroundChecking`: an automatic run must not raise the grid's skeleton or the
    // full-screen loader, or correcting a cell would blank the table the operator is reading.
    (background ? this.backgroundChecking : this.revalidating).set(true);
    try {
      const result = await firstValueFrom(
        this.api.previewImportExcel(file, selection, this.workingTable(), background),
      );
      this.preview.set(result);
      this.previewError.set(null);
      // The engine has now judged the corrected table, so Save is unblocked. Cleared only on
      // SUCCESS - a failed check leaves the flag standing, because the rows on screen are still
      // ahead of the last answer anybody actually got.
      this.pendingCellEdits.set(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validation failed.";
      this.previewError.set(message);
      this.notifications.error(message);
    } finally {
      (background ? this.backgroundChecking : this.revalidating).set(false);
    }
  }

  // -------------------------------------------------------------------------------------
  // MODE 1 — hand entry. Requirement 3.3, defect F-06.
  //
  // The shape deliberately mirrors Mode 2 step for step, so an operator who knows one knows
  // the other - Nielsen 4. "Start Hand Entry" is what "Preview Import" is: it confirms the
  // authority and the password once, and from then on the same three values ride every call.
  // Add Row opens the SAME dialogue Edit opens. Every row goes to the SAME endpoint, through
  // the SAME rule engine, and lands in the SAME working table with the same four visual
  // states and the same ERRORS column.
  //
  // Nothing here decides whether a row is valid. That is the server's answer, every time.
  // -------------------------------------------------------------------------------------

  /** Confirms the authority and the operator's password, then opens the
   * table PRE-LOADED with the number of blank rows they asked for, each already carrying the
   * batch's equipment class.
   *
   * It used to open an empty table and leave the operator to press Add Row and fill in a modal,
   * once per spare. The rows are seeded here instead and typed into directly. They are checked
   * immediately, so the ERRORS column names what each blank row still needs rather than the
   * operator discovering it only when they press Save. */
  async startHandEntry(): Promise<void> {
    this.manualStarting.set(true);
    try {
      const selection = await this.resolveSelection();
      if (!selection) return;
      this.manualSelection = selection;
      this.previewError.set(null);
      this.manualStage.set("previewed");
      this.activeValidationTab.set("all");
      this.searchText.set("");
      // Only seeds an EMPTY table. Coming back to a table that already holds rows - after a
      // failed check, say - must not throw them away and start over.
      if (!this.manualRows().length) {
        this.manualRows.set(this.blankRows(this.requestedRowCount()));
        await this.checkManualRows();
      }
    } finally {
      this.manualStarting.set(false);
    }
  }

  /** The row count, clamped. Below 1 there is nothing to open the table with, and the ceiling is
   * the same fifty the standing advisory asks operators to keep a sheet under. */
  private requestedRowCount(): number {
    const raw = Number(this.manualRowCountControl.value);
    if (!Number.isFinite(raw)) return 1;
    return Math.min(50, Math.max(1, Math.trunc(raw)));
  }

  /** `count` blank rows, each carrying the batch's equipment class so it is stated once rather
   * than retyped on every row. Every other cell is left empty on purpose - a blank cell the
   * engine names is better than a plausible default nobody checked. */
  private blankRows(count: number, startAt = 0): ImportManualRow[] {
    const equipmentClass = this.batchEquipmentClass();
    return Array.from({ length: count }, (_unused, index) => ({
      row: startAt + index + 1,
      equipment_class: equipmentClass,
    }));
  }

  /** The `+` above the table. Adds ONE more blank row, pre-filled the same way, and re-checks so
   * the new row appears with the same verdict every other row carries. */
  async addBlankRow(): Promise<void> {
    const rows = this.manualRows();
    this.manualRows.set([...rows, ...this.blankRows(1, rows.length)]);
    await this.checkManualRows();
  }

  /** Loads a fresh set of blank rows over whatever is in the table. Used when the operator changes
   * the equipment class or the count and wants to start that batch again. */
  async reloadBlankRows(): Promise<void> {
    this.manualRows.set(this.blankRows(this.requestedRowCount()));
    await this.checkManualRows();
  }

  /** Posts every hand-built row and replaces the table with the engine's answer. The rows are
   * renumbered 1..n on the way out, so the ROW column reads as the table reads after a
   * deletion rather than showing a gap where a removed row used to be. */
  async checkManualRows(options: { background?: boolean } = {}): Promise<void> {
    const background = options.background === true;
    const selection = this.manualSelection;
    if (!selection) return;
    const rows = this.manualRows().map((row, index) => ({ ...row, row: index + 1 }));
    this.manualRows.set(rows);
    if (!rows.length) {
      this.manualPreview.set(null);
      this.previewError.set(null);
      return;
    }
    // `backgroundChecking` for an automatic run, so the grid's `[loading]` skeleton does not
    // paint over the table the operator is still working in. See its declaration.
    (background ? this.backgroundChecking : this.manualChecking).set(true);
    try {
      this.manualPreview.set(
        await firstValueFrom(this.api.previewManualRows(rows, selection, background)),
      );
      this.previewError.set(null);
      this.pendingCellEdits.set(false);
    } catch (error) {
      // The rows stay exactly where they are. The table keeps showing the last answer the
      // engine actually gave, the panel says why there is no newer one, and the Save gate
      // refuses until the two agree again.
      const message = error instanceof Error ? error.message : "Validation failed.";
      this.previewError.set(message);
      this.notifications.error(message);
    } finally {
      (background ? this.backgroundChecking : this.manualChecking).set(false);
    }
  }

  /** Save, for hand-built rows. The same endpoint, the same gates, and the server re-validates
   * every row from scratch before writing any of it - what is posted is cell values, never a
   * verdict this screen reached. */
  async saveHandEntryRows(): Promise<void> {
    const blocked = this.submitBlockedReason();
    if (blocked) {
      this.notifications.error(blocked);
      return;
    }
    // Clause 4.5. Nothing is written until the operator has answered.
    if (this.needsShortfallConfirmation()) {
      this.confirmingShortfall.set(true);
      return;
    }
    // The same master-value question the workbook path asks, in the same place. A hand-built
    // row reaches the same rule engine, so it can introduce the same new value.
    if (this.needsMasterConfirmation()) {
      this.confirmingMasters.set(true);
      return;
    }
    // Consumed here, not in a `finally` - see the same line in `submitValidData()`.
    const confirmedMasters = this.confirmedMasterAdditions();
    this.shortfallConfirmed = false;
    this.mastersConfirmed = false;
    const selection = await this.resolveSelection();
    if (!selection) return;
    this.committing.set(true);
    try {
      const result = await firstValueFrom(
        this.api.commitValidManualRows(this.manualRows(), selection, confirmedMasters),
      );
      this.notifications.success(
        `Saved ${result.imported} spare(s) to the Ship Inventory. ` +
          `${result.skippedInvalid} invalid and ${result.skippedDuplicate} duplicate row(s) skipped.` +
          (result.mastersAdded ? ` ${result.mastersAdded} new master value(s) added.` : "") +
          this.pictureOutcome(result),
      );
      this.resetHandEntry();
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Saving failed.");
    } finally {
      this.committing.set(false);
    }
  }

  /** what the PICTURE PATH column did, appended to whichever save message
   * the operator is reading. Said only when there was something to say - a sheet with no picture
   * paths in it should not be told that nought photographs were stored.
   *
   * The SKIPPED count is worth stating on its own: the paths are opened by the SERVER, so a
   * folder that is not shared with it fails every row at once, and an operator who is not told
   * would find out by opening spares one at a time. The preview named each failing row; this is
   * the total, after the save. */
  private pictureOutcome(result: ExcelImportCommitResult): string {
    const parts: string[] = [];
    if (result.imagesAttached) parts.push(`${result.imagesAttached} photograph(s) stored`);
    if (result.imagesSkipped) {
      parts.push(`${result.imagesSkipped} picture path(s) could not be read — those spares kept the default photo`);
    }
    return parts.length ? ` ${parts.join(", ")}.` : "";
  }

  /** Returns the hand-entry tab to its first-run state. Writes nothing and deletes nothing -
   * a hand-built row has never been in the database until Save puts it there. */
  private resetHandEntry(): void {
    this.manualRows.set([]);
    // The table is gone, so it can no longer be ahead of the engine's last answer.
    this.pendingCellEdits.set(false);
    this.manualPreview.set(null);
    this.manualStage.set("idle");
    this.previewError.set(null);
    this.activeValidationTab.set("all");
    this.searchText.set("");
    this.pendingDeleteRow.set(null);
    this.clearRowSelection();
    this.manualSelection = null;
  }

  selectValidationTab(tab: ValidationTab): void {
    this.activeValidationTab.set(tab);
    // Snapshot taken HERE and nowhere else - see `pinnedTabRows`. Choosing the tab is the moment
    // the operator says which rows they intend to work through, so it is the moment the list is
    // fixed. All Rows pins nothing: everything is already in it.
    this.pinnedTabRows.set(
      tab === "all"
        ? null
        : new Set(
            (this.activePreview()?.rows ?? [])
              .filter((row) => row.status === tab)
              .map((row) => row.row),
          ),
    );
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
  }

  /** ONE re-check, for whichever mode is showing. Both the button above
   * the table and the three blocked-save sentences name it, so there is one action and not a
   * pair of near-identical ones an operator has to tell apart. */
  async recheckRows(options: { background?: boolean } = {}): Promise<void> {
    // a check already in flight is SKIPPED, not queued. The edit that
    // arrived during it has already re-armed `cellEdited`, so the debounce will ask again the
    // moment the burst ends and the last correction is the one that gets answered.
    if (this.revalidating() || this.manualChecking() || this.backgroundChecking()) return;
    // A re-check the operator ASKED for re-derives the tab from the answer it brings back. The
    // pin exists so a live verdict does not pull a row out from under them mid-correction; a
    // deliberate press is them saying they are done with the batch they were working through.
    if (options.background !== true) {
      this.selectValidationTab(this.activeValidationTab());
    }
    if (this.entryMode() === "manual") {
      await this.checkManualRows(options);
      return;
    }
    await this.revalidateWorkingTable(options);
  }

  // -------------------------------------------------------------------------------------
  // SELECT MANY, DELETE ONCE.
  // -------------------------------------------------------------------------------------

  /** The grid is ready. Kept only so the bulk delete can clear the selection afterwards. */
  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
  }

  /** the checkbox column changed. `app-data-grid` emits the selected ROW
   * OBJECTS; only their row numbers are kept, for the reason given on `selectedRowNumbers`. */
  onGridSelectionChanged(rows: RowData[]): void {
    this.selectedRowNumbers.set((rows as ImportGridRow[]).map((row) => row.row));
  }

  askToBulkDelete(): void {
    if (!this.selectedRowNumbers().length) return;
    this.confirmingBulkDelete.set(true);
  }

  cancelBulkDelete(): void {
    this.confirmingBulkDelete.set(false);
  }

  /** removes every selected row in ONE state change and ONE round trip.
   *
   * This is `confirmDeleteRow` below generalised from a row to a set, and the generalisation is
   * the whole point - looping that method would fire one preview per row, and on the workbook
   * path one whole-file upload per row.
   *
   * EVERY VICTIM IS RESOLVED BEFORE ANYTHING MUTATES, and in hand-entry mode that is a
   * correctness requirement rather than tidiness: `checkManualRows` renumbers the survivors
   * 1..n, so deleting one row at a time retargets the rest. Remove row 3 and the old row 7
   * becomes row 6 - a second pass asked to delete "7" would then take the wrong spare. One
   * filter, one renumber.
   *
   * Nothing is deleted from the database. These rows have never been in it; they simply stop
   * being part of what Submit Valid Data would write. */
  async confirmBulkDelete(): Promise<void> {
    const victims = new Set(this.selectedRowNumbers());
    if (!victims.size) return;
    this.confirmingBulkDelete.set(false);
    // Cleared BEFORE the await, so the button goes the moment the operator commits to the act
    // rather than lingering with a count over rows that are on their way out.
    this.clearRowSelection();

    if (this.entryMode() === "manual") {
      this.manualRows.update((rows) => rows.filter((entry) => !victims.has(entry.row)));
      await this.checkManualRows();
      return;
    }
    // Workbook row numbers are the sheet's own and never shift, so the whole set can be
    // appended at once. `removedRows` rides with the file on every preview AND on the commit
    // (see `workingTable`), which is what makes the deletion stick rather than reappear.
    this.removedRows.update((rows) => [...rows, ...victims]);
    this.workingEdits.update((edits) => {
      const remaining = { ...edits };
      for (const rowNumber of victims) {
        delete remaining[rowNumber];
      }
      return remaining;
    });
    await this.revalidateWorkingTable();
  }

  /** Empties the selection in both places it lives - this screen's signal and the grid's own
   * checkboxes. `deselectAll()` re-emits `selectionChanged`, so the signal would empty itself;
   * it is set here first anyway, because on a reset path the grid may not be there to answer.
   *
   * the `try` is not defensive padding. The grid is rendered inside
   * `@if (activePreview(); ...)`, so clearing the table DESTROYS it - and three of the four
   * callers here are exactly the paths that clear the table. `gridApi` then still holds the
   * destroyed instance, and ag-grid answers a call on one of those with a console warning. The
   * selection has gone with the grid in that case, so there is nothing to do and nothing to
   * report. */
  private clearRowSelection(): void {
    this.selectedRowNumbers.set([]);
    this.confirmingBulkDelete.set(false);
    try {
      this.gridApi?.deselectAll();
    } catch {
      this.gridApi = null;
    }
  }

  /** Opens the row editor on one row's seventeen editable cells, all together, instead of
   * however many of them are currently off the right edge of the scrolled table. */
  openRowEditor(row: ImportGridRow): void {
    this.editingRow.set(row);
  }

  closeRowEditor(): void {
    this.editingRow.set(null);
  }

  /** The dialogue's `(saved)` handler. Every field it collected is written through
   * `onCellChanged` - the SAME PATH a cell typed into directly in the grid uses - so a change
   * made here is indistinguishable from one made in the table: it lands in `manualRows` or
   * `workingEdits` exactly as it would have, it marks the table `pendingCellEdits` until the
   * next check answers, and it queues the same debounced re-check.
   *
   * `onCellChanged` mutates `row.values` and stops there - which is enough for an edit made IN
   * the grid, because the cell the operator is looking at IS the input they just typed into, so
   * it already shows what they typed with nothing further to repaint. Nothing plays that role
   * for an edit made in this dialogue: the row sits off screen, or scrolled past, while the
   * popup is open, so without telling ag-grid to repaint it explicitly the table kept showing
   * the pre-edit value until the debounced re-check below happened to replace the whole preview
   * - correct within a second or so, but "did my save even work" in the meantime. `refreshCells`
   * re-reads this row's cells from the very `row.values` `onCellChanged` just wrote, so it shows
   * the correction immediately, the same instant the popup closes - the verdict (STATUS/ERRORS)
   * still updates on the check's own schedule, exactly as a typed cell's does. */
  saveRowEditorRow(values: Record<string, string>): void {
    const row = this.editingRow();
    if (!row) return;
    for (const column of EDITABLE_COLUMNS) {
      const next = values[column.apiField] ?? "";
      if ((row.values[column.apiField] ?? "") !== next) {
        this.onCellChanged(row, column.apiField, next);
      }
    }
    const node = this.gridApi?.getRowNode(this.gridRowId(row));
    if (node) {
      this.gridApi?.refreshCells({ rowNodes: [node], force: true });
    }
    this.editingRow.set(null);
  }

  askToDeleteRow(row: ImportGridRow): void {
    this.pendingDeleteRow.set(row);
  }

  cancelDeleteRow(): void {
    this.pendingDeleteRow.set(null);
  }

  /** Removes one row from the working table. Nothing is deleted from the
   * database - the row has never been in it. It is simply no longer part of what Submit Valid
   * Data would write, and re-validating without it is what updates every count on the page. */
  async confirmDeleteRow(): Promise<void> {
    const row = this.pendingDeleteRow();
    if (!row) return;
    this.pendingDeleteRow.set(null);
    // A hand-built row is simply dropped from the rows the client holds
    // - there is no sheet it has to be subtracted from. `checkManualRows` renumbers what is
    // left, so the table reads 1..n rather than showing a gap.
    if (this.entryMode() === "manual") {
      this.manualRows.update((rows) => rows.filter((entry) => entry.row !== row.row));
      await this.checkManualRows();
      return;
    }
    this.removedRows.update((rows) => [...rows, row.row]);
    this.workingEdits.update((edits) => {
      const remaining = { ...edits };
      delete remaining[row.row];
      return remaining;
    });
    await this.revalidateWorkingTable();
  }

  askToClearTable(): void {
    this.confirmingClear.set(true);
  }

  cancelClearTable(): void {
    this.confirmingClear.set(false);
  }

  /** Requirement 3.9's clear control, in the one scope this change
   * builds - the UNSAVED working table on this screen. It empties the table and the
   * corrections made to it and returns the tab to its first-run state. It writes nothing,
   * deletes nothing, and cannot reach a saved spare. The application-admin purge of SAVED
   * spares is a different control with a different scope and is not built here. */
  clearWorkingTable(): void {
    this.confirmingClear.set(false);
    // Clear acts on the table the operator is looking at and leaves the
    // other mode's rows alone, for the same reason switching modes does - neither is a
    // consequence the operator asked for.
    if (this.entryMode() === "manual") {
      this.resetHandEntry();
      this.notifications.success("The working table has been cleared. No spare in the database was touched.");
      return;
    }
    this.preview.set(null);
    this.previewError.set(null);
    this.importStage.set("idle");
    this.previewedFileFingerprint = null;
    this.activeValidationTab.set("all");
    this.searchText.set("");
    this.discardWorkingTable();
    this.notifications.success("The working table has been cleared. No spare in the database was touched.");
  }

  /** Commit only the valid, non-duplicate rows (`commitValidImportExcel`) — the currently
   * selected file is re-sent and re-validated server-side rather than trusting this preview. */
  async submitValidData(): Promise<void> {
    // The same four values and the same re-authentication as the preview.
    // The back end re-checks all of them itself and remembers nothing between the two calls.
    // Refused outright while any row would not be written. The button is
    // already disabled, and this is the same rule stated again where it cannot be bypassed by
    // a stale click.
    const blocked = this.submitBlockedReason();
    if (blocked) {
      this.notifications.error(blocked);
      return;
    }
    // Clause 4.5. The confirmation is raised HERE, before the password
    // is re-verified and before the file is posted, so cancelling it leaves the database
    // untouched and the working table exactly as it was.
    if (this.needsShortfallConfirmation()) {
      this.confirmingShortfall.set(true);
      return;
    }
    // The master-value confirmation, raised in the same place and for the
    // same reason - before the password and before the post, so cancelling writes nothing. It
    // is asked AFTER the shortfall question rather than before it because the shortfall one is
    // about the rows being written and this one is about the ship's master lists, and a Head of
    // Department should settle the smaller question first.
    if (this.needsMasterConfirmation()) {
      this.confirmingMasters.set(true);
      return;
    }
    // The answer is CONSUMED here, not in a `finally`. A save that is
    // abandoned further down - the operator dismisses the password prompt - must ask again
    // next time, because the table may have been edited in between.
    // Captured BEFORE the flag is consumed - see `workingTable`.
    const confirmedMasters = this.confirmedMasterAdditions();
    this.shortfallConfirmed = false;
    this.mastersConfirmed = false;
    const selection = await this.resolveImportSelection();
    if (!selection) return;
    const { file, ...importSelection } = selection;
    this.committing.set(true);
    try {
      // The working table goes with the file. The server re-parses the
      // workbook, applies the same corrections it applied on the preview, and re-validates
      // every row before writing any of it - so what is committed is what was on the screen,
      // and it is still the server that decides whether each row may be written.
      const result = await firstValueFrom(
        this.api.commitValidImportExcel(
          file,
          importSelection,
          this.workingTable(confirmedMasters),
        ),
      );
      this.notifications.success(
        `Imported ${result.imported} spare(s). ${result.skippedInvalid} invalid and ` +
          `${result.skippedDuplicate} duplicate row(s) skipped.` +
          // A master row is permanent and shared, so a save that added
          // one says so rather than leaving the operator to notice it in Masters later.
          (result.mastersAdded
            ? ` ${result.mastersAdded} new master value(s) added.`
            : "") +
          this.pictureOutcome(result),
      );
      this.resetImport();
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      this.committing.set(false);
    }
  }

  /** True while at least one row about to be saved is short and the
   * operator has not yet answered the confirmation. Both save methods ask this, so neither
   * can write past it. */
  private needsShortfallConfirmation(): boolean {
    return this.shortfallRows() > 0 && !this.shortfallConfirmed;
  }

  /** True while this sheet would put a value the rules document does not
   * list into the ship's master registers and the Head of Department has not yet said so. An
   * EQUIPMENT CLASS never counts - clause 2.6.1 already permits a name the ship's D787J
   * document carries, so `confirmationsRequired` is empty for a sheet that introduces only
   * those and the dialogue is never raised. */
  private needsMasterConfirmation(): boolean {
    return this.confirmationsRequired().length > 0 && !this.mastersConfirmed;
  }

  /** Cancel. Nothing is written and the working table is untouched, so
   * the operator can correct the offending cell with Edit and save again - which is the other
   * answer to the question the dialogue just asked. */
  cancelMasterSave(): void {
    this.confirmingMasters.set(false);
    this.mastersConfirmed = false;
  }

  /** Proceed, then re-enter the save that asked - the same shape as `confirmShortfallSave`. */
  async confirmMasterSave(): Promise<void> {
    this.confirmingMasters.set(false);
    this.mastersConfirmed = true;
    if (this.entryMode() === "manual") {
      await this.saveHandEntryRows();
      return;
    }
    await this.submitValidData();
  }

  /** Cancel. Nothing is written, nothing is cleared, and the working
   * table is exactly where the operator left it - so the advice the dialogue just gave, to
   * make held and authorised equal, can be acted on with Edit and the save tried again. */
  cancelShortfallSave(): void {
    this.confirmingShortfall.set(false);
    this.shortfallConfirmed = false;
  }

  /** Proceed. Records the answer and re-enters whichever save method
   * asked, which then runs straight through - the alternative was a second copy of each save
   * body, which would have drifted from the first. */
  async confirmShortfallSave(): Promise<void> {
    this.confirmingShortfall.set(false);
    this.shortfallConfirmed = true;
    if (this.entryMode() === "manual") {
      await this.saveHandEntryRows();
      return;
    }
    await this.submitValidData();
  }

  cancelImport(): void {
    this.resetImport();
  }

  private resetImport(): void {
    // The department and the sub-department are DELIBERATELY not reset.
    //
    // `resolveDefaultDepartment` used to be re-derived here from the options array. Both values
    // are now the operator's deliberate choice, and both drive three further server reads
    // (authorities, value lists, sub-departments) through `onDepartmentChanged`. Resetting them
    // after a successful import would throw all of that away and re-fetch it, so an operator
    // loading a second Executive sheet would have to re-choose the same department and the same
    // sub-department they just used. `reset()` on the other three controls is unchanged.
    this.importForm.patchValue({
      password: "",
      importAuthority: "",
      file: null,
    });
    this.importForm.controls.password.markAsUntouched();
    this.importForm.controls.importAuthority.markAsUntouched();
    this.importStage.set("idle");
    this.preview.set(null);
    this.previewError.set(null);
    this.previewedFileFingerprint = null;
    this.activeValidationTab.set("all");
    this.searchText.set("");
    this.discardWorkingTable();
  }

  /** `SparesMapping` (equipment_class/equipment/section_name) has a real CRUD endpoint
   * (`spares-mapping/`); the equipment picker sources from `sfd.ShipEquipment` — the model
   * `SparesMapping.equipment` actually FKs — via the department/role-scoped
   * `sfd/transaction-equipment/list/` action (a cross-app read, same pattern used elsewhere in
   * this service for lookups that live outside `obs`). One submit creates one equipment <->
   * equipment-class mapping row. */
  async submitMap(): Promise<void> {
    if (this.mapForm.invalid) {
      this.mapForm.markAllAsTouched();
      this.notifications.error(
        "Pick the Sub Department, the INSMA Equipment Name, and the Ship Inventory Equipment Class.",
      );
      return;
    }
    const { equipmentName, equipmentClass } = this.mapForm.value;
    if (!equipmentName || !equipmentClass) return;
    this.mapSubmitting.set(true);
    try {
      await firstValueFrom(this.api.createSpareDataMapping(equipmentName, equipmentClass));
      this.notifications.success("Spare Data Map saved.");
      const subDepartments = this.subDepartmentOptions();
      const equipment = this.equipmentOptions();
      this.mapForm.reset({
        subDepartment: subDepartments.length ? subDepartments[0].value : "",
        equipmentName: equipment.length ? equipment[0].value : "",
        equipmentClass: "",
      });
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Saving the Spare Data Map failed.");
    } finally {
      this.mapSubmitting.set(false);
    }
  }

  private onPilFileChanged(file: File | null): void {
    this.pilFile.set(file);
    this.pilResult.set(null);
    this.pilValidatedForImport.set(false);
  }

  /** Template helper — `Object` isn't in scope inside an Angular template. */
  pilErrorFields(errors: Record<string, string[]>): string[] {
    return Object.keys(errors);
  }

  async downloadPilTemplate(): Promise<void> {
    this.pilDownloadingTemplate.set(true);
    try {
      const blob = await firstValueFrom(this.api.downloadVendorPilImportTemplate());
      this.exportService.downloadBlob(blob, "vendor_pil_import_template.xlsx");
    } catch {
      this.notifications.error("Could not download the import template.");
    } finally {
      this.pilDownloadingTemplate.set(false);
    }
  }

  async validatePilFile(): Promise<void> {
    await this.runPilImport(true);
  }

  async submitPil(): Promise<void> {
    await this.runPilImport(false);
  }

  private async runPilImport(dryRun: boolean): Promise<void> {
    const file = this.pilFile();
    if (!file) {
      this.notifications.error("Choose a CPIL .xlsx file first.");
      return;
    }
    const busy = dryRun ? this.pilValidating : this.pilImporting;
    busy.set(true);
    try {
      const result = await firstValueFrom(this.api.importVendorPilExcel(file, dryRun));
      this.pilResult.set(result);
      if (result.status === "column_error") {
        this.notifications.error(result.headerErrors[0] || "The file has unsupported columns.");
      } else if (result.status === "row_limit_error") {
        this.notifications.error(result.headerErrors[0] || "The file has too many rows.");
      } else if (result.invalidRows > 0) {
        this.notifications.error(
          `${result.invalidRows} row(s) failed validation — nothing was ${dryRun ? "checked further" : "imported"}.`,
        );
        this.pilValidatedForImport.set(false);
      } else if (dryRun) {
        this.pilValidatedForImport.set(true);
        this.notifications.success(`${result.validRows} row(s) look valid. Ready to import.`);
      } else {
        this.pilValidatedForImport.set(false);
        this.notifications.success(`${result.imported} row(s) imported.`);
        this.pilForm.reset({ file: null });
      }
    } catch {
      this.notifications.error(dryRun ? "Validation failed. Please try again." : "Import failed. Please try again.");
    } finally {
      busy.set(false);
    }
  }
}
