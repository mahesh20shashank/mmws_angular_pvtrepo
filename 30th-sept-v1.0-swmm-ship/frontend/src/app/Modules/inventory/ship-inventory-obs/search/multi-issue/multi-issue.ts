import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { HttpErrorResponse } from "@angular/common/http";
import { Router } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Observable, Subject, firstValueFrom, of } from "rxjs";
import { catchError, debounceTime, map, switchMap } from "rxjs/operators";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { TextareaInput } from "../../../../../shared/components/textarea-input/textarea-input";
import { ObsApiService } from "../../services/obs-api.service";
import { ObsSelectionStore } from "../../services/obs-selection-store";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { DropdownOptionDto, Spare } from "../../models/spare.model";
import {
  HIGH_ISSUE_QUANTITY_THRESHOLD,
  IssueReason,
  MultiIssuePayload,
  MultiIssueRow,
  OTHER_UNIT_SEARCH_MIN_LENGTH,
  OtherUnitFilterOption,
  OtherUnitUser,
  OtherUnitUserPage,
  OtherUnitUserQuery,
  isOtherUnitQueryReady,
  obsUserOptionLabel,
} from "../../models/issue.model";

const REASON_OPTIONS = [
  { label: "Defect", value: "Defect" },
  { label: "Ty Loan - Other Ship", value: "Ty Loan - Other Ship" },
];

// Developed with Understanding: the Ty Loan Issued To search waits this long after the last
// keystroke or filter change before it asks the server (CP-H).
const OTHER_UNIT_SEARCH_DEBOUNCE_MS = 300;

// Developed with Understanding: the four states each Ty Loan list moves through. "idle" is the
// Issued To list before a Command, a Unit Name or a long enough search has been given.
type ListState = "idle" | "loading" | "error" | "ready";

// Developed with Understanding: what one Issued To query came back with, so a failed request and
// a query not yet worth sending are told apart from a real page.
type OtherUsersOutcome =
  | { kind: "idle" }
  | { kind: "error" }
  | { kind: "ready"; page: OtherUnitUserPage };

// Developed with Understanding: the multi-issue field errors the screen shows at their field.
// Everything else stays with the toast feedbackInterceptor already raises.
const ISSUE_FIELD_ERROR_KEYS = ["username", "issued_to_other_profile"] as const;
type IssueFieldErrorKey = (typeof ISSUE_FIELD_ERROR_KEYS)[number];
type IssueFieldErrors = Partial<Record<IssueFieldErrorKey, string>>;

// Developed with Understanding: DRF sends a field error as a list of strings, the project envelope
// may also send one string. Either becomes one line of text, anything else becomes "".
function fieldErrorText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").join(" ").trim();
  }
  return "";
}

// Developed with Understanding: reads the Issued To field errors out of a multi-issue 400 body
// (CP-G contract section 5), so each shows under its own field.
function readIssueFieldErrors(error: HttpErrorResponse): IssueFieldErrors {
  const body: unknown = error.error;
  if (!body || typeof body !== "object") {
    return {};
  }
  const record = body as Record<string, unknown>;
  const found: IssueFieldErrors = {};
  for (const key of ISSUE_FIELD_ERROR_KEYS) {
    const text = fieldErrorText(record[key]);
    if (text) {
      found[key] = text;
    }
  }
  return found;
}

// Developed with Understanding: a Command or Unit Name option. The name leads, and the code is
// shown beside it when it adds something, so two units that share a name can still be told apart.
function otherUnitFilterOptionLabel(option: OtherUnitFilterOption): string {
  const name = option.name.trim();
  if (!name || name === option.code) {
    return option.code;
  }
  return `${name} (${option.code})`;
}

// Developed with Understanding: the filter option list as the shared select control takes it.
function toFilterDropdownOptions(options: OtherUnitFilterOption[]): DropdownOptionDto[] {
  return options.map((option) => ({ value: option.code, label: otherUnitFilterOptionLabel(option) }));
}

@Component({
  selector: "app-obs-multi-issue",
  standalone: true,
  // Developed with Understanding: InputField left the imports with the Ty Loan free-text boxes
  // it rendered (D11). Every Ty Loan control is now app-select-input.
  imports: [ReactiveFormsModule, SelectInput, TextareaInput, ButtonComponent],
  templateUrl: "./multi-issue.html",
  styleUrl: "./multi-issue.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiIssue implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly selectionStore = inject(ObsSelectionStore);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly spares = signal<Spare[]>([]);
  readonly usernameOptions = signal<DropdownOptionDto[]>([]);
  readonly sectionOptions = signal<DropdownOptionDto[]>([]);
  /** Cascades from `section` — see the `section.valueChanges` subscription in `ngOnInit()`. */
  readonly equipmentOptions = signal<DropdownOptionDto[]>([]);
  readonly quantities = signal<Record<string, number>>({});
  /** Required per-row once `quantityFor(id)` exceeds `HIGH_ISSUE_QUANTITY_THRESHOLD` —
   * mirrors the backend's `HIGH_ISSUE_QUANTITY_THRESHOLD` rule in `SparesViewSet.multi_issue`.
   * UX hint only; the server call stays the real enforcement. */
  readonly highQuantityReasons = signal<Record<string, string>>({});
  readonly saving = signal(false);
  readonly reasonOptions = REASON_OPTIONS;
  readonly isDefect = signal(true);
  readonly highIssueThreshold = HIGH_ISSUE_QUANTITY_THRESHOLD;

  // Developed with Understanding: Ty Loan branch state (D11). Command options load once, Unit Name
  // options reload whenever Command changes, Issued To is a server search over both filters.
  readonly commandOptions = signal<DropdownOptionDto[]>([]);
  readonly commandsState = signal<ListState>("idle");
  readonly unitOptions = signal<DropdownOptionDto[]>([]);
  readonly unitsState = signal<ListState>("idle");
  readonly otherUsers = signal<OtherUnitUser[]>([]);
  readonly otherUsersCount = signal(0);
  readonly otherUsersState = signal<ListState>("idle");
  readonly pickedOtherUser = signal<OtherUnitUser | null>(null);
  // Developed with Understanding: true once the filters endpoint has answered with no Command and no
  // Unit Name at all - the other-unit table holds nobody yet, so the HR CDF empty state is shown.
  readonly otherUnitDirectoryEmpty = signal(false);
  readonly otherSearchMinLength = OTHER_UNIT_SEARCH_MIN_LENGTH;
  // Developed with Understanding: server field errors from the last submit, shown at their field.
  readonly serverFieldErrors = signal<IssueFieldErrors>({});

  // Developed with Understanding: the Issued To options. The picked person is kept in the list
  // even when a newer search no longer returns them, because the shared select shows its label
  // only while the value is among its options.
  readonly otherUserOptions = computed<DropdownOptionDto[]>(() => {
    const picked = this.pickedOtherUser();
    const rows = this.otherUsers();
    const withPicked = picked && !rows.some((row) => row.id === picked.id) ? [picked, ...rows] : rows;
    return withPicked.map((row) => ({ value: row.id, label: obsUserOptionLabel(row) }));
  });

  // Developed with Understanding: the page holds 20 rows. When the server counts more, the screen
  // says so and asks for a narrower search rather than paging.
  readonly hasMoreOtherUsers = computed(
    () => this.otherUsersState() === "ready" && this.otherUsersCount() > this.otherUsers().length,
  );

  private otherSearchText = "";
  private readonly otherUserQuery$ = new Subject<OtherUnitUserQuery>();
  private readonly unitFilterCommand$ = new Subject<string>();

  readonly form = this.fb.nonNullable.group({
    reason: ["Defect" as IssueReason, Validators.required],
    remarks: ["", Validators.required],
    // Required only in the Defect branch (Issued To *) or the Ty Loan branch (Command,
    // Issued to Ship) respectively — toggled by applyReasonValidators() below, since the two
    // branches are mutually exclusive and the reference only marks the active branch's fields
    // required.
    // Developed with Understanding: the Ty Loan branch now requires Command and
    // issuedToOtherProfile. Unit Name is optional. shipId and customShip are gone with the
    // free-text boxes they held (D11).
    username: [""],
    section: [""],
    equipmentName: [""],
    command: [""],
    unit: [""],
    issuedToOtherProfile: [""],
  });

  ngOnInit(): void {
    const selected = this.selectionStore.selectedSpares();
    if (!selected.length) {
      this.goBack();
      return;
    }
    this.spares.set(selected);
    this.quantities.set(Object.fromEntries(selected.map((s) => [s.id, 1])));

    this.applyReasonValidators(true);
    // Developed with Understanding: every reason change now also resets the recipient controls
    // (folds R2 OB2), so a person picked under one reason is never posted under the other.
    this.form.controls.reason.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.onReasonChange(value));

    void this.loadDefectFieldOptions();

    // Sub-Department -> Defect on Equipment Nomenclature is an optional narrowing filter, not a
    // hard cascade — the real "Active Systems & Equipment" list (Ship Configuration > SFD
    // Details) that backs this dropdown shows every active equipment row unfiltered by default,
    // same as that reference screen's own "Sub Dept" filter. Real ShipEquipment data commonly has
    // no sub-department set at all, so gating the dropdown until one is picked would leave it
    // permanently empty in practice.
    this.form.controls.section.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sectionId) => void this.onSectionChange(sectionId));

    this.watchTyLoanControls();
  }

  // Developed with Understanding: wires the Ty Loan controls (D11). Command reloads the Unit Name
  // options and clears Unit Name. Command and Unit Name both clear a picked person and re-run the
  // search. The search itself is debounced and switchMap drops a stale answer.
  private watchTyLoanControls(): void {
    const controls = this.form.controls;
    controls.command.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((command) => this.onCommandChange(command ?? ""));
    controls.unit.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.clearPickedOtherUser();
        this.queueOtherUserQuery();
      });
    controls.issuedToOtherProfile.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((id) => this.onOtherUserPicked(id ?? ""));
    controls.username.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearServerFieldError("username"));

    this.unitFilterCommand$
      .pipe(
        switchMap((command) => this.fetchUnitOptions(command)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((units) => {
        if (units === null) {
          this.unitsState.set("error");
          return;
        }
        this.unitOptions.set(toFilterDropdownOptions(units));
        this.unitsState.set("ready");
      });

    this.otherUserQuery$
      .pipe(
        debounceTime(OTHER_UNIT_SEARCH_DEBOUNCE_MS),
        switchMap((query) => this.fetchOtherUsers(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((outcome) => this.applyOtherUsersOutcome(outcome));
  }

  private async loadDefectFieldOptions(): Promise<void> {
    const [users, sections, equipment] = await Promise.all([
      // Developed with Understanding: the Defect list is now asked for with reason=DEFECT - own-ship
      // personnel who are active and have not left the ship (D5, CP-G contract section 2).
      firstValueFrom(this.api.getInventoryUsers("DEFECT")),
      firstValueFrom(this.api.getSfdSubDepartments()),
      firstValueFrom(this.api.getSfdEquipment()),
    ]);
    // `selectableForIssue` keeps the accounts `seed_all.py` writes (`PN0001`…) out of the
    // picker — a spare must not be issued against a demo row — and applies the department
    // scoping the previous `users/users/active/` endpoint did server-side. Labelled the same
    // way as Return's "Returned by" so one person reads identically across Ship Inventory.
    this.usernameOptions.set(
      users
        .filter((user) => user.selectableForIssue)
        .map((user) => ({ value: user.id, label: obsUserOptionLabel(user) })),
    );
    this.sectionOptions.set(sections);
    this.equipmentOptions.set(equipment);
  }

  private async onSectionChange(sectionId: string): Promise<void> {
    // Re-picking equipment on every Sub-Department change (rather than leaving whatever was
    // selected) avoids submitting a choice that's no longer valid for the new filter.
    this.form.patchValue({ equipmentName: "" }, { emitEvent: false });
    this.equipmentOptions.set(await firstValueFrom(this.api.getSfdEquipment(sectionId || undefined)));
  }

  // Developed with Understanding: one reason change - reset username, Command, Unit Name and the
  // other-unit person, then re-apply the validators (R2 OB2). Entering Ty Loan loads its filters.
  private onReasonChange(value: IssueReason): void {
    const isDefect = value === "Defect";
    this.isDefect.set(isDefect);
    this.resetRecipientControls();
    this.applyReasonValidators(isDefect);
    if (!isDefect) {
      this.enterTyLoanBranch();
    }
  }

  // Developed with Understanding: clears every recipient control without firing their own change
  // handlers, marks them untouched so no error shows before the operator acts, and cancels any
  // Issued To query still in flight.
  private resetRecipientControls(): void {
    this.form.patchValue(
      { username: "", command: "", unit: "", issuedToOtherProfile: "" },
      { emitEvent: false },
    );
    const controls = this.form.controls;
    for (const control of [controls.username, controls.command, controls.unit, controls.issuedToOtherProfile]) {
      control.markAsUntouched();
    }
    this.pickedOtherUser.set(null);
    this.otherUsers.set([]);
    this.otherUsersCount.set(0);
    this.otherUsersState.set("idle");
    this.otherSearchText = "";
    this.serverFieldErrors.set({});
    this.otherUserQuery$.next({ command: "", unit: "", search: "" });
  }

  // Developed with Understanding: loads the Command options the first time Ty Loan is chosen (or
  // after a failure), and otherwise only re-lists every Unit Name, since Command was just cleared.
  private enterTyLoanBranch(): void {
    const state = this.commandsState();
    if (state === "ready") {
      this.unitFilterCommand$.next("");
      return;
    }
    if (state !== "loading") {
      void this.loadCommandFilters();
    }
  }

  // Developed with Understanding: the first filters call, with no Command. It answers both lists,
  // and an answer with neither means the other-unit table is empty (HR CDF Step 3 not yet run).
  async loadCommandFilters(): Promise<void> {
    this.commandsState.set("loading");
    this.unitsState.set("loading");
    try {
      const filters = await firstValueFrom(this.api.getOtherUnitUserFilters());
      this.commandOptions.set(toFilterDropdownOptions(filters.commands));
      this.otherUnitDirectoryEmpty.set(!filters.commands.length && !filters.units.length);
      this.commandsState.set("ready");
      if (!this.form.controls.command.value) {
        this.unitOptions.set(toFilterDropdownOptions(filters.units));
        this.unitsState.set("ready");
      }
    } catch {
      this.commandsState.set("error");
      this.unitsState.set("error");
    }
  }

  // Developed with Understanding: re-asks for the Unit Name options under the current Command, the
  // Retry offered when that list failed to load.
  retryUnitOptions(): void {
    this.unitFilterCommand$.next(this.form.controls.command.value ?? "");
  }

  // Developed with Understanding: re-sends the current Issued To query at once, the Retry offered
  // when the search failed.
  retryOtherUsers(): void {
    this.queueOtherUserQuery();
  }

  // Developed with Understanding: the shared select's serverSearch output. Each keystroke is kept
  // and the debounced query picks up the latest text.
  onOtherUserSearch(text: string): void {
    this.otherSearchText = text;
    this.queueOtherUserQuery();
  }

  private onCommandChange(command: string): void {
    // Developed with Understanding: Unit Name is cleared when Command changes (D11), and so is a
    // picked person, who may no longer sit under the new Command.
    this.form.patchValue({ unit: "" }, { emitEvent: false });
    this.form.controls.unit.markAsUntouched();
    this.clearPickedOtherUser();
    this.unitFilterCommand$.next(command);
    this.queueOtherUserQuery();
  }

  // Developed with Understanding: keeps the picked person's row so the read-only "Unit:" line can
  // name their unit, and clears the server error the pick answers.
  private onOtherUserPicked(id: string): void {
    this.clearServerFieldError("issued_to_other_profile");
    if (!id) {
      this.pickedOtherUser.set(null);
      return;
    }
    const current = this.pickedOtherUser();
    const row = this.otherUsers().find((user) => user.id === id) ?? (current?.id === id ? current : null);
    this.pickedOtherUser.set(row);
  }

  private clearPickedOtherUser(): void {
    this.form.patchValue({ issuedToOtherProfile: "" }, { emitEvent: false });
    this.pickedOtherUser.set(null);
  }

  private clearServerFieldError(key: IssueFieldErrorKey): void {
    if (this.serverFieldErrors()[key]) {
      this.serverFieldErrors.update((current) => ({ ...current, [key]: undefined }));
    }
  }

  private queueOtherUserQuery(): void {
    const raw = this.form.getRawValue();
    this.otherUserQuery$.next({
      command: raw.command ?? "",
      unit: raw.unit ?? "",
      search: this.otherSearchText,
    });
  }

  // Developed with Understanding: one Unit Name options request. null stands for a failed request
  // so the subscriber can show the error state with a Retry.
  private fetchUnitOptions(command: string): Observable<OtherUnitFilterOption[] | null> {
    this.unitsState.set("loading");
    return this.api.getOtherUnitUserFilters(command || undefined).pipe(
      map((filters) => filters.units),
      catchError(() => of(null)),
    );
  }

  // Developed with Understanding: one Issued To request. A query without a Command, a Unit Name or
  // a long enough search is not sent, because the backend answers it with a 400 (D12).
  private fetchOtherUsers(query: OtherUnitUserQuery): Observable<OtherUsersOutcome> {
    if (!isOtherUnitQueryReady(query)) {
      return of<OtherUsersOutcome>({ kind: "idle" });
    }
    this.otherUsersState.set("loading");
    return this.api.getOtherUnitUsers(query).pipe(
      map((page): OtherUsersOutcome => ({ kind: "ready", page })),
      catchError(() => of<OtherUsersOutcome>({ kind: "error" })),
    );
  }

  private applyOtherUsersOutcome(outcome: OtherUsersOutcome): void {
    if (outcome.kind === "ready") {
      this.otherUsers.set(outcome.page.users);
      this.otherUsersCount.set(outcome.page.count);
      this.otherUsersState.set("ready");
      return;
    }
    this.otherUsers.set([]);
    this.otherUsersCount.set(0);
    this.otherUsersState.set(outcome.kind);
  }

  private applyReasonValidators(isDefect: boolean): void {
    const username = this.form.controls.username;
    const command = this.form.controls.command;
    // Developed with Understanding: the Ty Loan branch's required pair is now Command and the
    // other-unit Issued To. Unit Name stays optional (D11).
    const otherProfile = this.form.controls.issuedToOtherProfile;
    if (isDefect) {
      username.addValidators(Validators.required);
      command.clearValidators();
      otherProfile.clearValidators();
    } else {
      username.clearValidators();
      command.addValidators(Validators.required);
      otherProfile.addValidators(Validators.required);
    }
    username.updateValueAndValidity({ emitEvent: false });
    command.updateValueAndValidity({ emitEvent: false });
    otherProfile.updateValueAndValidity({ emitEvent: false });
  }

  quantityFor(spareId: string): number {
    return this.quantities()[spareId] ?? 1;
  }

  updateQuantity(spareId: string, value: string): void {
    this.quantities.update((current) => ({ ...current, [spareId]: Number(value) || 0 }));
  }

  /** Client-side mirror of the backend's real "Issue quantity cannot exceed available
   * quantity" rule (`SparesViewSet.multi_issue`) plus a plain "must be at least 1" check —
   * the server call stays the real enforcement, this is just immediate feedback. */
  quantityInvalid(spare: Spare): boolean {
    const qty = this.quantityFor(spare.id);
    return qty < 1 || qty > spare.quantityAvailable;
  }

  hasRowErrors(): boolean {
    return this.spares().some((s) => this.quantityInvalid(s) || this.needsReasonFor(s.id));
  }

  reasonFor(spareId: string): string {
    return this.highQuantityReasons()[spareId] ?? "";
  }

  updateReason(spareId: string, value: string): void {
    this.highQuantityReasons.update((current) => ({ ...current, [spareId]: value }));
  }

  needsReasonFor(spareId: string): boolean {
    return (
      this.quantityFor(spareId) > this.highIssueThreshold && !this.reasonFor(spareId).trim()
    );
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error("Fill in every required field before submitting.");
      return;
    }
    const invalidQtyRows = this.spares().filter((spare) => this.quantityInvalid(spare));
    if (invalidQtyRows.length) {
      this.notifications.error(
        "Quantity Issued must be at least 1 and cannot exceed Qty Held for: " +
          invalidQtyRows.map((spare) => spare.patternNumber).join(", "),
      );
      return;
    }
    const rowsNeedingReason = this.spares().filter((spare) => this.needsReasonFor(spare.id));
    if (rowsNeedingReason.length) {
      this.notifications.error(
        `Enter a reason for issuing more than ${this.highIssueThreshold} for: ` +
          rowsNeedingReason.map((spare) => spare.patternNumber).join(", "),
      );
      return;
    }
    this.saving.set(true);
    this.serverFieldErrors.set({});
    try {
      const raw = this.form.getRawValue();
      const rows: MultiIssueRow[] = this.spares().map((spare) => ({
        spareId: spare.id,
        patternNumber: spare.patternNumber,
        description: spare.description,
        quantityAuthorised: spare.quantityAuthorised,
        quantityAvailable: spare.quantityAvailable,
        quantityIssued: this.quantityFor(spare.id),
        highQuantityReason: this.reasonFor(spare.id),
      }));
      const payload: MultiIssuePayload = { ...raw, rows };
      await firstValueFrom(this.api.issueMultiple(payload));
      this.selectionStore.clear();
      this.goBack();
    } catch (error) {
      // Developed with Understanding: a multi-issue 400 names the field it rejects (CP-G contract
      // section 5). That text is shown at the Issued To field. feedbackInterceptor has already
      // raised the toast, so nothing else is added. Anything that is not an HTTP error is thrown on
      // as before.
      if (!(error instanceof HttpErrorResponse)) {
        throw error;
      }
      this.serverFieldErrors.set(readIssueFieldErrors(error));
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search"]);
  }
}
