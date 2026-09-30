import { DOCUMENT, NgTemplateOutlet, formatDate } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AbstractControl, FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { CellCallbackParams, ColDef, ValueFormatterParams } from "ag-grid-community";
import {
  Observable,
  Subject,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  exhaustMap,
  map,
  of,
  switchMap,
  timer,
} from "rxjs";
import { getErrorMessage } from "../../../Core/http/services/http-feedback";
import { ButtonComponent } from "../../../shared/components/button/button.component";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { ModalComponent } from "../../../shared/components/modal/modal.component";
import { PageHeaderBar } from "../../../shared/components/page-header-bar/page-header-bar";
import { PanelCard } from "../../../shared/components/panel-card/panel-card";
import { PillToggle } from "../../../shared/components/pill-toggle/pill-toggle";
import { ProgressBar } from "../../../shared/components/progress-bar/progress-bar";
import { DropdownOption, SelectInput } from "../../../shared/components/select-input/select-input";
import { ChipTone, StatusChip } from "../../../shared/components/status-chip/status-chip";
import { ToolbarSearch } from "../../../shared/components/toolbar-search/toolbar-search";
import { HRCDF_PROGRESS_LINE_LIMIT, HrcdfSyncApiService } from "../services/hrcdf-sync-api.service";
import {
  HrcdfCommandOption,
  HrcdfHomeUnit,
  HrcdfJobStatus,
  HrcdfJobSummary,
  HrcdfLogLevel,
  HrcdfOwnStatusFilter,
  HrcdfPersonnelPage,
  HrcdfPersonnelRow,
  HrcdfProgress,
  HrcdfProgressLine,
  HrcdfReadiness,
  HrcdfRunInline,
  HrcdfRunMode,
  HrcdfRunResponse,
  HrcdfStats,
  HrcdfSyncMode,
  HrcdfUnit,
} from "./sync-hrcdf.models";

// Developed with Understanding: poll timing and caps carried from the IIMA console
// (IIMA/fe__hrcdf-sync.component.ts lines 87-90 and 230) - one tick a second, stop after ten
// failures in a row, and keep at most 5000 lines drawn so a long run cannot slow the tab.
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_FAILURES = 10;
const MAX_CLIENT_LINES = 5000;
// Developed with Understanding: the log only follows new lines while the operator is at the
// bottom, so reading an earlier error is never interrupted (IIMA fe.ts lines 324-332).
const NEAR_BOTTOM_PX = 40;
const SEARCH_DEBOUNCE_MS = 300;
// Developed with Understanding: the personnel page size, the backend default (CP-C contract).
const PERSONNEL_PAGE_SIZE = 25;

// Developed with Understanding: the key the operator sets on the swmm server to configure the
// sync (swmm settings.py HRCDF_SYNC BASE_URL, read from this environment key).
const HRCDF_HOST_KEY = "HRCDF_SYNC_BASE_URL";
// Developed with Understanding: the Step 1 Command value that means every command, the default.
const ALL_COMMANDS = "ALL";

type LoadState = "loading" | "ready" | "error";
type PersonnelTab = "own" | "others";
// Developed with Understanding: the step whose card holds the run console - Step 1 (ship names),
// Step 2 (own ship) or Step 3 (other units). Only one console exists at a time.
type ConsoleStep = "ship" | "own" | "others";

// Developed with Understanding: the card a job's console belongs under. A units job is the Step 1
// Get Ship Names refresh.
function stepForMode(mode: HrcdfSyncMode): ConsoleStep {
  return mode === "units" ? "ship" : mode;
}

// Developed with Understanding: the pill labels of the two personnel tabs. The URL carries the
// short key (tab=own or tab=others) so the view survives a refresh and can be shared.
const TAB_LABELS: Record<PersonnelTab, string> = { own: "This Ship", others: "Other Units" };

// Developed with Understanding: every log line starts with its level in words, so meaning
// never rests on colour.
const LEVEL_WORDS: Record<HrcdfLogLevel, string> = {
  info: "INFO",
  record: "RECORD",
  warn: "WARN",
  error: "ERROR",
  done: "DONE",
};

// Developed with Understanding: status chip text and tone per job status.
const STATUS_CHIPS: Record<HrcdfJobStatus, { text: string; tone: ChipTone }> = {
  queued: { text: "Queued", tone: "info" },
  running: { text: "Running", tone: "info" },
  finished: { text: "Finished", tone: "success" },
  failed: { text: "Failed", tone: "danger" },
};

const STATUS_PHRASES: Record<HrcdfJobStatus, string> = {
  queued: "is queued",
  running: "is running",
  finished: "has finished",
  failed: "has failed",
};

const MODE_PHRASES: Record<HrcdfSyncMode, string> = {
  own: "The run for this ship's personnel",
  others: "The run for other units' personnel",
  units: "The ship names refresh",
};

// Developed with Understanding: the Open, Closed, All filter of the This Ship tab.
const OWN_STATUS_OPTIONS: DropdownOption[] = [
  { label: "Open", value: "open" },
  { label: "Closed", value: "closed" },
  { label: "All", value: "all" },
];

// Developed with Understanding: one process-log line as drawn. seq is the server sequence, or
// a negative number for a line this page wrote itself, so the two never collide (IIMA fe.ts
// lines 311-321).
interface LogLine {
  seq: number;
  // Developed with Understanding: the raw level, so the console can colour warn and error
  // words. The word itself still carries the meaning.
  level: string;
  word: string;
  time: string;
  text: string;
}

// Developed with Understanding: the run shown in the step console, built from a progress poll
// or from the inline summary of a 200 background_fallback answer.
interface RunView {
  mode: HrcdfSyncMode;
  status: HrcdfJobStatus;
  total: number | null;
  processed: number;
  percent: number | null;
  stats: HrcdfStats;
  message: string;
}

// Developed with Understanding: one counter status chip. The label is always in the text.
interface CounterChip {
  key: string;
  text: string;
  tone: ChipTone;
}

// Developed with Understanding: the last-run block of Step 2 and Step 3.
interface JobDescription {
  chipText: string;
  tone: ChipTone;
  detail: string;
  message: string;
}

// Developed with Understanding: one personnel fetch, either a page or an error message.
interface PersonnelResult {
  page: HrcdfPersonnelPage | null;
  error: string;
}

// Developed with Understanding: a date and time for the page, or the raw value when the
// browser cannot read it.
function formatStamp(value: string | null): string {
  if (!value) {
    return "";
  }
  try {
    return formatDate(value, "dd MMM yyyy, HH:mm", "en-US");
  } catch {
    return value;
  }
}

// Developed with Understanding: the time part of a log line stamp.
function formatClock(value: string): string {
  try {
    return formatDate(value, "HH:mm:ss", "en-US");
  } catch {
    return value;
  }
}

// Developed with Understanding: the level word of a log line, falling back to the raw level in
// capitals if the server ever sends a level this page does not know.
function levelWord(level: string): string {
  return LEVEL_WORDS[level as HrcdfLogLevel] ?? level.toUpperCase();
}

// Developed with Understanding: a counter read from the stats dictionary, zero when absent.
function stat(stats: HrcdfStats, key: string): number {
  return Number(stats[key] ?? 0);
}

// Developed with Understanding: tells the inline 200 answer of runs/ from the queued 202.
function isInlineRun(response: HrcdfRunResponse): response is HrcdfRunInline {
  return "summary" in response;
}

// Developed with Understanding: the view of a run from one progress poll.
function runViewFromProgress(progress: HrcdfProgress): RunView {
  return {
    mode: progress.mode,
    status: progress.status,
    total: progress.total,
    processed: progress.processed,
    percent: progress.percent,
    stats: progress.stats ?? {},
    message: progress.message,
  };
}

// Developed with Understanding: the view of a run from a JobSummary. percent is worked out the
// way the server does - processed over total, capped at 100 - and is null when total is unknown.
function runViewFromSummary(summary: HrcdfJobSummary): RunView {
  const percent =
    summary.total && summary.total > 0
      ? Math.min(100, Math.round((summary.processed * 1000) / summary.total) / 10)
      : null;
  return {
    mode: summary.mode,
    status: summary.status,
    total: summary.total,
    processed: summary.processed,
    percent,
    stats: summary.stats ?? {},
    message: summary.message,
  };
}

// Developed with Understanding: the last-run block text for Step 2 and Step 3, or null when the
// mode has never run.
function describeJob(job: HrcdfJobSummary | null | undefined): JobDescription | null {
  if (!job) {
    return null;
  }
  const chip = STATUS_CHIPS[job.status] ?? { text: job.status, tone: "neutral" as ChipTone };
  const parts: string[] = [];
  if (job.started_at) {
    parts.push("Started " + formatStamp(job.started_at));
  }
  if (job.finished_at) {
    parts.push("Finished " + formatStamp(job.finished_at));
  }
  const total = job.total === null ? "an unknown number of" : String(job.total);
  parts.push(`${job.processed} of ${total} record(s) processed`);
  return {
    chipText: chip.text,
    tone: chip.tone,
    detail: parts.join(". ") + ".",
    message: job.message ?? "",
  };
}

// Developed with Understanding: the Active column - on this ship the on-board flag (False once
// the person has left), on the other units list the HRCDF isActive flag, in words.
function activeText(params: CellCallbackParams<HrcdfPersonnelRow>): string {
  const row = params.data;
  if (!row) {
    return "";
  }
  const flag = row.user_active ?? row.hrcdf_is_active;
  if (flag === null || flag === undefined) {
    return "";
  }
  return flag ? "Yes" : "No";
}

// Developed with Understanding: the Designation column - the HRCDF designation, else the
// designation the row already had.
function designationText(params: CellCallbackParams<HrcdfPersonnelRow>): string {
  return params.data?.hrcdf_designation || params.data?.designation || "";
}

// Developed with Understanding: disables or enables a form control without raising
// valueChanges. Driving the control itself is what also disables the select's clear button
// (the reason the Step 0 page does the same, sfd-references.component.ts lines 163-182).
function setControlDisabled(control: AbstractControl, disabled: boolean): void {
  if (disabled) {
    control.disable({ emitEvent: false });
  } else {
    control.enable({ emitEvent: false });
  }
}

// Developed with Understanding: the personnel columns in the order the prompt fixes. Sorting is
// off because the server orders every page by name, and sorting one page on the client would
// look like a sort of the whole list when it is not.
const PERSONNEL_COLUMNS: ColDef<HrcdfPersonnelRow>[] = [
  { headerName: "Personal No", field: "personal_number", sortable: false, minWidth: 130 },
  { headerName: "Name", field: "full_name", sortable: false, minWidth: 180 },
  { headerName: "Rank", field: "rank_name", sortable: false },
  { headerName: "Designation", colId: "designation", valueGetter: designationText, sortable: false },
  { headerName: "Unit", field: "unit_name", sortable: false, minWidth: 160 },
  { headerName: "Command", field: "command_code", sortable: false },
  { headerName: "Branch", field: "branch_name", sortable: false },
  { headerName: "Active", colId: "active", valueGetter: activeText, sortable: false },
  {
    headerName: "Last Synced",
    field: "hrcdf_synced_at",
    sortable: false,
    minWidth: 170,
    valueFormatter: (params: ValueFormatterParams<HrcdfPersonnelRow, string | null>) =>
      formatStamp(params.value ?? null),
  },
];

// Developed with Understanding: the HR CDF Synchronization page, rebuilt from the design system
// (CP-D). It replaces the placeholder that only set activeButton (R1 F-4) with the three steps of
// the HRCDF roster sync against the CP-C API - Step 1 picks and locks this ship with the Step 0
// confirm-and-lock pattern (R1 C2), Step 2 reads this ship's personnel, Step 3 reads other units'
// personnel - then follows a run line by line and pages through both personnel lists. The
// polling carries IIMA's logic (R1 G1 step 16, G2) re-expressed in signals, OnPush, inject() and
// takeUntilDestroyed. The page creates no login, role or credential, and says so nowhere
// because nothing of the kind happens.
@Component({
  selector: "app-sync-hrcdf",
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    ButtonComponent,
    DataGrid,
    IconComponent,
    ModalComponent,
    PageHeaderBar,
    PanelCard,
    PillToggle,
    ProgressBar,
    SelectInput,
    StatusChip,
    ToolbarSearch,
  ],
  templateUrl: "./sync-hrcdf.component.html",
  styleUrls: ["./sync-hrcdf.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "(document:keydown.escape)": "onEscapeKey()",
  },
})
export class SyncHrcdfComponent {
  private readonly api = inject(HrcdfSyncApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  readonly hostKey = HRCDF_HOST_KEY;
  readonly tabLabels = [TAB_LABELS.own, TAB_LABELS.others];
  readonly ownStatusOptions = OWN_STATUS_OPTIONS;
  readonly personnelColumns = PERSONNEL_COLUMNS;

  private readonly logBox = viewChild<ElementRef<HTMLDivElement>>("logBox");
  private readonly confirmBody = viewChild<ElementRef<HTMLDivElement>>("confirmBody");
  private readonly clearBody = viewChild<ElementRef<HTMLDivElement>>("clearBody");
  private readonly lockedShip = viewChild<ElementRef<HTMLParagraphElement>>("lockedShip");

  // Developed with Understanding: Step 1 form - the optional Command filter and the Ship Name,
  // the same two-control group Step 0 uses (R1 C2).
  readonly shipForm = this.fb.group({ command: [ALL_COMMANDS], unit: [""] });
  // Developed with Understanding: personnel filters - status on This Ship, command and unit
  // codes on Other Units.
  readonly personnelFilters = this.fb.group({ status: ["open"], command: [""], unit: [""] });

  // Developed with Understanding: readiness state.
  readonly readiness = signal<HrcdfReadiness | null>(null);
  readonly readinessState = signal<LoadState>("loading");
  readonly readinessError = signal("");

  // Developed with Understanding: Step 1 state.
  readonly commands = signal<HrcdfCommandOption[]>([]);
  readonly units = signal<HrcdfUnit[]>([]);
  readonly unitsState = signal<LoadState>("loading");
  readonly unitsError = signal("");
  private readonly unitsHomeUnit = signal<HrcdfHomeUnit | null>(null);
  private readonly hintUnitId = signal<number | null>(null);
  private hintConsumed = false;
  readonly hintApplied = signal(false);
  private readonly selectedCommandId = signal("");
  readonly stagedUnitId = signal("");
  readonly refreshing = signal(false);
  readonly refreshMessage = signal("");
  readonly refreshError = signal("");
  readonly confirmOpen = signal(false);
  readonly savingHomeUnit = signal(false);
  readonly homeUnitError = signal("");
  readonly homeUnitNotice = signal("");
  private modalTrigger: HTMLElement | null = null;
  // Developed with Understanding: Clear set ship name - the application admin's dialog state.
  readonly clearOpen = signal(false);
  readonly clearing = signal(false);
  readonly clearError = signal("");
  readonly clearNotice = signal("");
  readonly recheckingHrcdf = signal(false);

  // Developed with Understanding: run progress state.
  readonly starting = signal(false);
  readonly polling = signal(false);
  readonly run = signal<RunView | null>(null);
  readonly logLines = signal<LogLine[]>([]);
  readonly pollLostMessage = signal("");
  // Developed with Understanding: the step the console is drawn under. Set by the button that
  // started the run and by every progress snapshot, so a run picked up on load opens under the
  // right step.
  readonly activeStep = signal<ConsoleStep | null>(null);
  private pollSub: Subscription | null = null;
  private pollFailures = 0;
  private lastSeq = 0;
  private localSeq = -1;

  // Developed with Understanding: personnel list state.
  readonly activeTab = signal<PersonnelTab>("own");
  readonly searchText = signal("");
  private readonly appliedSearch = signal("");
  private readonly ownStatus = signal<HrcdfOwnStatusFilter>("open");
  private readonly personnelCommand = signal("");
  private readonly personnelUnit = signal("");
  private readonly page = signal(1);
  private readonly pageSize = signal(PERSONNEL_PAGE_SIZE);
  readonly personnelPageSize = PERSONNEL_PAGE_SIZE;
  readonly personnelState = signal<LoadState>("loading");
  readonly personnelRows = signal<HrcdfPersonnelRow[]>([]);
  readonly personnelTotal = signal(0);
  readonly personnelError = signal("");
  private readonly filterVersion = signal(0);
  private personnelStarted = false;
  private readonly search$ = new Subject<string>();
  private readonly personnelLoad$ = new Subject<void>();

  // Developed with Understanding: header chip - Connected, HRCDF unreachable or Not configured
  // from readiness.
  readonly headerChip = computed<{ text: string; tone: ChipTone }>(() => {
    const state = this.readinessState();
    if (state === "loading") {
      return { text: "Checking", tone: "neutral" };
    }
    const readiness = this.readiness();
    if (!readiness) {
      return { text: "Status unknown", tone: "danger" };
    }
    if (!readiness.configured) {
      return { text: "Not configured", tone: "warning" };
    }
    return readiness.reachable === false
      ? { text: "HRCDF unreachable", tone: "danger" }
      : { text: "Connected", tone: "success" };
  });

  readonly configured = computed(() => this.readiness()?.configured === true);
  readonly notConfigured = computed(() => this.readiness()?.configured === false);
  // Developed with Understanding: HRCDF is set but this server cannot reach it - true off the Navy
  // network. Step 1 still works from the ship list already in the application.
  readonly unreachable = computed(() => this.configured() && this.readiness()?.reachable === false);
  // Developed with Understanding: Clear set ship name is offered to the application admin only, and
  // only once a ship is locked. The server makes the same check on the DELETE.
  readonly canClearShip = computed(
    () => this.readiness()?.can_clear_home_unit === true && this.shipLocked(),
  );
  // Developed with Understanding: the command of the locked ship, for the locked notice.
  readonly homeCommandText = computed(() => {
    const home = this.homeUnit();
    if (!home) {
      return "";
    }
    const command = this.commands().find((item) => item.code !== null && item.code === home.command_code);
    return command?.name ? `${command.code} - ${command.name}` : home.command_code || "Not recorded";
  });
  readonly homeUnit = computed<HrcdfHomeUnit | null>(
    () => this.readiness()?.home_unit ?? this.unitsHomeUnit(),
  );
  // Developed with Understanding: once ShipIdentity has a unit the API answers 409 to any other
  // pick (D15), so a home unit on record means the choice is locked.
  readonly shipLocked = computed(() => this.homeUnit() !== null);

  // Developed with Understanding: ALL comes first and is the default, and with it every ship of
  // every command is listed in Ship Name.
  readonly commandOptions = computed<DropdownOption[]>(() => [
    { label: "ALL - All commands", value: ALL_COMMANDS },
    ...this.commands().map((command) => ({
      label: command.name ? `${command.code ?? ""} - ${command.name}` : command.code ?? `Command ${command.id}`,
      value: String(command.id),
    })),
  ]);

  // Developed with Understanding: ship names narrowed by the Command filter on the client, as
  // Step 0 narrows its ship list (sfd-references.component.ts lines 144-150).
  readonly unitOptions = computed<DropdownOption[]>(() => {
    const commandId = this.selectedCommandId();
    const list = commandId
      ? this.units().filter((unit) => String(unit.command_id ?? "") === commandId)
      : this.units();
    return list.map((unit) => ({ label: `${unit.name} (${unit.code})`, value: String(unit.id) }));
  });

  readonly stagedUnit = computed<HrcdfUnit | null>(
    () => this.units().find((unit) => String(unit.id) === this.stagedUnitId()) ?? null,
  );

  readonly stagedCommandText = computed(() => {
    const unit = this.stagedUnit();
    if (!unit) {
      return "";
    }
    const command = this.commands().find((item) => item.id === unit.command_id);
    return command?.name || command?.code || unit.command_code || "Not recorded";
  });

  readonly runActive = computed(() => this.starting() || this.polling());

  // Developed with Understanding: Get Ship Names is busy while its request is out and while the
  // units job it started is being followed.
  readonly refreshBusy = computed(
    () => this.refreshing() || (this.runActive() && this.activeStep() === "ship"),
  );

  // Developed with Understanding: why Get Ship Names is unavailable, written beside the button.
  readonly refreshBlockReason = computed(() => {
    if (this.runActive()) {
      return "A sync run is in progress. Wait for it to end.";
    }
    if (this.unreachable()) {
      return "HRCDF is not reachable from this server right now.";
    }
    return "";
  });

  // Developed with Understanding: why Confirm this ship is unavailable, written beside it.
  readonly confirmBlockReason = computed(() => {
    if (this.unitsState() === "loading") {
      return "The ship list is still loading.";
    }
    if (this.unitsState() === "error") {
      return "The ship list could not be loaded.";
    }
    if (!this.stagedUnitId()) {
      return "Pick a ship name first.";
    }
    return "";
  });

  // Developed with Understanding: an own-ship run has finished at least once. readiness gives
  // only the newest own job, so own-ship rows written by HRCDF also count as proof of an earlier
  // finished run (OPEN QUESTION OQ-D2 in the Change Impact Map).
  readonly ownRunDone = computed(() => {
    const readiness = this.readiness();
    if (!readiness) {
      return false;
    }
    return readiness.last_runs.own?.status === "finished" || readiness.counts.own_ship > 0;
  });

  readonly ownBlockReason = computed(() => this.runBlockReason("own"));
  readonly othersBlockReason = computed(() => this.runBlockReason("others"));

  readonly ownLastRun = computed(() => describeJob(this.readiness()?.last_runs.own));
  readonly othersLastRun = computed(() => describeJob(this.readiness()?.last_runs.others));

  readonly runChip = computed<{ text: string; tone: ChipTone }>(() => {
    const run = this.run();
    if (run) {
      return STATUS_CHIPS[run.status] ?? { text: run.status, tone: "neutral" };
    }
    if (this.starting()) {
      return { text: "Starting", tone: "info" };
    }
    return { text: "No run yet", tone: "neutral" };
  });

  // Developed with Understanding: the bar value - the server percent while running (null draws
  // the indeterminate state until the total is known), full on finish, and where it stopped on
  // a failure.
  readonly barValue = computed<number | null>(() => {
    const run = this.run();
    if (!run) {
      return null;
    }
    if (run.status === "finished") {
      return 100;
    }
    if (run.status === "failed") {
      return run.percent ?? 0;
    }
    return run.percent;
  });

  // Developed with Understanding: the bar and status line show while a run starts, is followed,
  // or has reported. The black log is always drawn inside the step console, with a waiting line
  // until the first line arrives.
  readonly showProgress = computed(() => this.run() !== null || this.starting() || this.polling());

  // Developed with Understanding: one sentence on the state of the run, read with the bar.
  readonly runStatusText = computed(() => {
    const run = this.run();
    if (!run) {
      return this.starting() ? "Starting the run." : "Waiting for the first report from the server.";    }
    const total = run.total === null ? "an unknown number of" : String(run.total);
    const parts = [
      `${MODE_PHRASES[run.mode] ?? "The run"} ${STATUS_PHRASES[run.status] ?? run.status}.`,
      `${run.processed} of ${total} record(s) processed.`,
    ];
    if (run.percent !== null) {
      parts.push(`${run.percent} percent.`);
    }
    return parts.join(" ");
  });

  // Developed with Understanding: the five counters the prompt names, each a status chip whose
  // text carries the label. created, updated and unchanged add the own-ship and other-unit
  // counters of the swmm STAT_KEYS together.
  readonly counters = computed<CounterChip[]>(() => {
    const run = this.run();
    const stats = run?.stats ?? {};
    // Developed with Understanding: a units job reads ship names, not personnel, so it shows
    // the records read, the units created and the failures instead of the personnel counters.
    if (run?.mode === "units") {
      const unitsFailed = stat(stats, "failed");
      return [
        { key: "fetched", text: `Read ${stat(stats, "fetched")}`, tone: "info" },
        { key: "units_created", text: `Units created ${stat(stats, "units_created")}`, tone: "success" },
        { key: "failed", text: `Failed ${unitsFailed}`, tone: unitsFailed > 0 ? "danger" : "neutral" },
      ];
    }
    const created = stat(stats, "own_created") + stat(stats, "others_created");
    const updated = stat(stats, "own_updated") + stat(stats, "others_updated");
    const unchanged = stat(stats, "own_unchanged") + stat(stats, "others_unchanged");
    const leavers = stat(stats, "leavers");
    const failed = stat(stats, "failed");
    return [
      { key: "created", text: `Created ${created}`, tone: "success" },
      { key: "updated", text: `Updated ${updated}`, tone: "info" },
      { key: "unchanged", text: `Unchanged ${unchanged}`, tone: "neutral" },
      { key: "leavers", text: `Leavers ${leavers}`, tone: leavers > 0 ? "warning" : "neutral" },
      { key: "failed", text: `Failed ${failed}`, tone: failed > 0 ? "danger" : "neutral" },
    ];
  });

  readonly activeTabLabel = computed(() => TAB_LABELS[this.activeTab()]);

  // Developed with Understanding: Command filter of Other Units, by command code because
  // personnel/others/ filters on command_code.
  readonly personnelCommandOptions = computed<DropdownOption[]>(() =>
    this.commands()
      .filter((command) => !!command.code)
      .map((command) => ({
        label: command.name ? `${command.code} - ${command.name}` : String(command.code),
        value: String(command.code),
      })),
  );

  // Developed with Understanding: Unit filter of Other Units, narrowed by the chosen command.
  readonly personnelUnitOptions = computed<DropdownOption[]>(() => {
    const commandCode = this.personnelCommand();
    const list = commandCode
      ? this.units().filter((unit) => unit.command_code === commandCode)
      : this.units();
    return list.map((unit) => ({ label: `${unit.name} (${unit.code})`, value: unit.code }));
  });

  readonly personnelResetKey = computed(() => `${this.activeTab()}-${this.filterVersion()}`);

  readonly personnelSubtitle = computed(() => {
    const counts = this.readiness()?.counts;
    if (!counts) {
      return "Personnel read from HRCDF";
    }
    return `This ship: ${counts.own_ship_open} on board of ${counts.own_ship} from HRCDF. Other units: ${counts.other_units}.`;
  });

  readonly showPersonnelGrid = computed(
    () => this.personnelState() === "loading" || (this.personnelState() === "ready" && this.personnelTotal() > 0),
  );

  // Developed with Understanding: the empty state names the next action - run Step 2 or Step 3,
  // or change the search and filters when they are what emptied the list.
  readonly personnelEmptyText = computed(() => {
    if (this.activeTab() === "own") {
      const filtered = this.appliedSearch() !== "" || this.ownStatus() === "closed";
      return filtered
        ? "No personnel match the search or the status filter. Change or clear them to see more."
        : "No personnel records for this ship yet. Run Step 2 to get this ship's personnel from HRCDF.";
    }
    const filtered = this.appliedSearch() !== "" || this.personnelCommand() !== "" || this.personnelUnit() !== "";
    return filtered
      ? "No personnel match the search, Command or Unit filter. Change or clear them to see more."
      : "No other-unit personnel yet. Run Step 3 to get other units' personnel from HRCDF.";
  });

  constructor() {
    this.wireShipForm();
    this.wirePersonnelFilters();
    this.wirePersonnelLoading();
    this.wireTabFromUrl();

    // Developed with Understanding: the Step 1 selects are disabled while the ship list loads,
    // while the choice is being saved, and for good once the ship is locked.
    effect(() => {
      const lock = this.shipLocked() || this.savingHomeUnit() || this.unitsState() !== "ready";
      setControlDisabled(this.shipForm.controls.command, lock);
      setControlDisabled(this.shipForm.controls.unit, lock);
    });

    this.loadReadiness(true);
    this.loadUnits();
  }

  // Developed with Understanding: reads readiness/. On first load, a run already in flight is
  // picked up and replayed from the first line (IIMA fe.ts lines 143-151).
  loadReadiness(attachIfRunning: boolean): void {
    this.api
      .getReadiness()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (readiness) => {
          this.applyReadiness(readiness);
          if (attachIfRunning && readiness.running && readiness.active_job_id && !this.polling()) {
            this.pushLocal("info", "A sync run is already in progress. Following it from its first line.");
            this.startPolling(readiness.active_job_id);
          }
        },
        error: (err: unknown) => {
          this.readinessError.set(getErrorMessage(err));
          if (!this.readiness()) {
            this.readinessState.set("error");
          }
        },
      });
  }

  // Developed with Understanding: Try again on the readiness error panel.
  retryReadiness(): void {
    this.readinessState.set("loading");
    this.loadReadiness(true);
  }

  // Developed with Understanding: Check again on the HRCDF-unreachable panel - asks the server to
  // probe HRCDF now instead of reusing its answer from the last minute.
  recheckHrcdf(): void {
    if (this.recheckingHrcdf()) {
      return;
    }
    this.recheckingHrcdf.set(true);
    this.api
      .getReadiness(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (readiness) => {
          this.recheckingHrcdf.set(false);
          this.applyReadiness(readiness);
        },
        error: (err: unknown) => {
          this.recheckingHrcdf.set(false);
          this.readinessError.set(getErrorMessage(err));
        },
      });
  }

  // Developed with Understanding: stores readiness and brings Step 1 and the hint in line.
  private applyReadiness(readiness: HrcdfReadiness): void {
    this.readiness.set(readiness);
    this.readinessState.set("ready");
    this.readinessError.set("");
    this.syncFormToHomeUnit();
    this.applyHint();
  }

  // Developed with Understanding: reads units/ for the Command and Ship Name options.
  loadUnits(): void {
    this.unitsState.set("loading");
    this.api
      .getUnits()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.commands.set(response.commands ?? []);
          this.units.set(response.units ?? []);
          this.hintUnitId.set(response.hint);
          this.unitsHomeUnit.set(response.home_unit);
          this.unitsError.set("");
          this.unitsState.set("ready");
          this.syncFormToHomeUnit();
          this.applyHint();
        },
        error: (err: unknown) => {
          this.unitsError.set(getErrorMessage(err));
          this.unitsState.set("error");
        },
      });
  }

  // Developed with Understanding: Get Ship Names from HRCDF - posts units/refresh/, which starts a
  // units job and answers exactly like runs/. A 202 is followed in the console under Step 1, a
  // 200 shows its inline summary, a 409 attaches to the run holding the lock. The server message
  // is also written beside the button, and the ship list is read again once the job ends.
  refreshUnits(): void {
    if (this.refreshing() || this.refreshBlockReason()) {
      return;
    }
    this.resetRunView();
    this.activeStep.set("ship");
    this.refreshing.set(true);
    this.starting.set(true);
    this.refreshMessage.set("");
    this.refreshError.set("");
    this.pushLocal("info", "Requesting ship names from HRCDF.");
    this.api
      .refreshUnits()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.refreshing.set(false);
          this.refreshMessage.set(response.message);
          this.onRunStarted(response);
        },
        error: (err: unknown) => {
          this.refreshing.set(false);
          const isConflict = err instanceof HttpErrorResponse && err.status === 409;
          if (!isConflict) {
            this.refreshError.set(getErrorMessage(err));
          }
          this.onRunRefused(err);
        },
      });
  }

  // Developed with Understanding: opens the confirm-and-lock dialog, remembering the button that
  // opened it so focus can go back there, and moves focus to Cancel inside the dialog.
  openConfirm(): void {
    if (this.shipLocked() || this.confirmBlockReason()) {
      return;
    }
    const active = this.document.activeElement;
    this.modalTrigger = active instanceof HTMLElement ? active : null;
    this.confirmOpen.set(true);
    afterNextRender(
      () => {
        this.confirmBody()?.nativeElement.querySelector<HTMLButtonElement>("button")?.focus();
      },
      { injector: this.injector },
    );
  }

  // Developed with Understanding: Cancel, or Escape, on the dialog - nothing was sent yet, the
  // staged pick stays so the operator can confirm it later or pick another.
  cancelConfirm(): void {
    if (this.savingHomeUnit()) {
      return;
    }
    this.confirmOpen.set(false);
    this.restoreFocus();
  }

  // Developed with Understanding: Escape closes the open dialog, because app-modal has no key
  // handler.
  onEscapeKey(): void {
    if (this.confirmOpen()) {
      this.cancelConfirm();
    }
    if (this.clearOpen()) {
      this.cancelClear();
    }
  }

  // Developed with Understanding: opens the Clear set ship name dialog (application admin only),
  // focus on Cancel first so a stray Enter never clears the ship.
  openClear(): void {
    if (!this.canClearShip()) {
      return;
    }
    const active = this.document.activeElement;
    this.modalTrigger = active instanceof HTMLElement ? active : null;
    this.clearError.set("");
    this.clearOpen.set(true);
    afterNextRender(
      () => {
        this.clearBody()?.nativeElement.querySelector<HTMLButtonElement>("button")?.focus();
      },
      { injector: this.injector },
    );
  }

  // Developed with Understanding: Cancel, or Escape, on the Clear dialog - nothing was sent.
  cancelClear(): void {
    if (this.clearing()) {
      return;
    }
    this.clearOpen.set(false);
    this.restoreFocus();
  }

  // Developed with Understanding: Clear ship name on the dialog - deletes home-unit/. On success
  // the ship name is gone app-wide, so the page reloads like it does after a confirm and Step 1
  // opens again. A 403 or 409 stays in the dialog.
  clearHomeUnit(): void {
    if (this.clearing()) {
      return;
    }
    this.clearing.set(true);
    this.clearError.set("");
    this.api
      .clearHomeUnit()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearing.set(false);
          this.clearOpen.set(false);
          this.clearNotice.set("Ship name cleared. Step 1 can be done again. Refreshing…");
          const reloadTimer = setTimeout(() => this.document.defaultView?.location.reload(), 1500);
          this.destroyRef.onDestroy(() => clearTimeout(reloadTimer));
        },
        error: (err: unknown) => {
          this.clearing.set(false);
          this.clearError.set(getErrorMessage(err));
        },
      });
  }

  // Developed with Understanding: Confirm on the dialog - posts home-unit/. On success the ship is
  // locked and shown as text. A 400 or 409 is written at the Ship Name field, and on a 409 the
  // page re-reads readiness so the ship someone else locked is shown.
  confirmHomeUnit(): void {
    const unitId = Number(this.stagedUnitId());
    if (!unitId || this.savingHomeUnit()) {
      return;
    }
    this.savingHomeUnit.set(true);
    this.homeUnitError.set("");
    this.api
      .setHomeUnit(unitId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.savingHomeUnit.set(false);
          this.confirmOpen.set(false);
          this.unitsHomeUnit.set(response.home_unit);
          this.readiness.update((current) => (current ? { ...current, home_unit: response.home_unit } : current));
          this.homeUnitNotice.set(
            `${response.home_unit.name} (${response.home_unit.code}) is now locked as this ship. ` +
              "Refreshing to apply the ship name…",
          );
          this.syncFormToHomeUnit();
          this.restoreFocus();
          // Developed with Understanding: the ship name shown app-wide now comes from this pick. A full
          // reload, after the notice has been read, so the sidebar badge, landing page and every cached
          // screen start again with the new "INS" name. Skipped if the page is left first.
          const reloadTimer = setTimeout(() => this.document.defaultView?.location.reload(), 1500);
          this.destroyRef.onDestroy(() => clearTimeout(reloadTimer));
        },
        error: (err: unknown) => {
          this.savingHomeUnit.set(false);
          this.confirmOpen.set(false);
          this.homeUnitError.set(getErrorMessage(err));
          if (err instanceof HttpErrorResponse && err.status === 409) {
            this.loadReadiness(false);
            this.loadUnits();
          }
          this.restoreFocus();
        },
      });
  }

  // Developed with Understanding: after the dialog closes, focus goes back to the button that
  // opened it. When that button is gone because the ship is now locked, focus goes to the locked
  // ship text instead, so it is never dropped to the top of the page.
  private restoreFocus(): void {
    const trigger = this.modalTrigger;
    this.modalTrigger = null;
    afterNextRender(
      () => {
        if (trigger?.isConnected) {
          trigger.focus();
          return;
        }
        this.lockedShip()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  // Developed with Understanding: follows the two Step 1 selects into signals.
  private wireShipForm(): void {
    this.shipForm.controls.command.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        // Developed with Understanding: a cleared Command field goes back to ALL so it is never
        // blank, and ALL means no command filter.
        if (!value) {
          this.shipForm.controls.command.setValue(ALL_COMMANDS, { emitEvent: false });
        }
        const commandId = value ? String(value) : ALL_COMMANDS;
        this.selectedCommandId.set(commandId === ALL_COMMANDS ? "" : commandId);
        this.dropUnitOutsideCommand();
      });
    this.shipForm.controls.unit.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.stagedUnitId.set(value ? String(value) : "");
        this.hintApplied.set(false);
        this.homeUnitError.set("");
      });
  }

  // Developed with Understanding: clears the Ship Name pick when the Command filter leaves it
  // out, as Step 0 does (sfd-references.component.ts lines 369-380).
  private dropUnitOutsideCommand(): void {
    const commandId = this.selectedCommandId();
    const unit = this.stagedUnit();
    if (!commandId || !unit || String(unit.command_id ?? "") === commandId) {
      return;
    }
    this.shipForm.controls.unit.setValue("", { emitEvent: false });
    this.stagedUnitId.set("");
    this.hintApplied.set(false);
  }

  // Developed with Understanding: shows the locked home unit in the two selects.
  private syncFormToHomeUnit(): void {
    const home = this.homeUnit();
    if (!home) {
      return;
    }
    const command = this.commands().find((item) => item.code !== null && item.code === home.command_code);
    const commandId = command ? String(command.id) : "";
    // Developed with Understanding: shows ALL when the locked ship's command is not in the list.
    this.shipForm.patchValue({ command: commandId || ALL_COMMANDS, unit: String(home.id) }, { emitEvent: false });
    this.selectedCommandId.set(commandId);
    this.stagedUnitId.set(String(home.id));
    this.hintApplied.set(false);
  }

  // Developed with Understanding: pre-selects the hint unit once, when readiness has no home unit
  // (OQ15). It only stages the pick - the operator still confirms it.
  private applyHint(): void {
    if (this.hintConsumed || this.readinessState() !== "ready" || this.unitsState() !== "ready") {
      return;
    }
    this.hintConsumed = true;
    const hint = this.hintUnitId();
    if (this.homeUnit() || hint === null || this.stagedUnitId()) {
      return;
    }
    if (!this.units().some((unit) => unit.id === hint)) {
      return;
    }
    this.shipForm.controls.unit.setValue(String(hint), { emitEvent: false });
    this.stagedUnitId.set(String(hint));
    this.hintApplied.set(true);
  }

  // Developed with Understanding: why a run button is unavailable, written beside it.
  private runBlockReason(mode: HrcdfRunMode): string {
    if (this.readinessState() === "loading") {
      return "Checking the sync status.";
    }
    const readiness = this.readiness();
    if (!readiness) {
      return "The sync status could not be read. Use Try again at the top of the page.";
    }
    if (!readiness.configured) {
      return "The HRCDF address is not set on this server.";
    }
    if (readiness.reachable === false) {
      return "HRCDF is not reachable from this server right now.";
    }
    if (!this.shipLocked()) {
      return "Confirm this ship in Step 1 first.";
    }
    if (this.runActive()) {
      return "A sync run is in progress. Follow it in the console under its step.";
    }
    if (mode === "others" && !this.ownRunDone()) {
      return "Run Step 2 at least once first.";
    }
    return "";
  }

  // Developed with Understanding: Step 2 or Step 3 - posts runs/. A 202 starts polling, a 200
  // with background_fallback shows the summary directly, a 409 attaches to the running job
  // (IIMA fe.ts lines 175-216).
  startRun(mode: HrcdfRunMode): void {
    if (this.runBlockReason(mode)) {
      return;
    }
    this.resetRunView();
    this.activeStep.set(mode);
    this.starting.set(true);
    this.pushLocal(
      "info",
      mode === "own"
        ? "Requesting a run for this ship's personnel."
        : "Requesting a run for other units' personnel. This reads the whole Navy roster.",
    );
    this.api
      .startRun(mode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.onRunStarted(response),
        error: (err: unknown) => this.onRunRefused(err),
      });
  }

  // Developed with Understanding: the 202 and 200 answers of runs/ and of units/refresh/.
  private onRunStarted(response: HrcdfRunResponse): void {
    this.starting.set(false);
    if (isInlineRun(response)) {
      this.showInlineSummary(response);
      return;
    }
    this.pushLocal("info", response.message);
    this.startPolling(response.job_id);
  }

  // Developed with Understanding: a refused start. 409 means another run holds the lock, so the
  // page attaches to it rather than reporting nothing (IIMA fe.ts lines 205-212).
  private onRunRefused(err: unknown): void {
    this.starting.set(false);
    const message = getErrorMessage(err);
    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.pushLocal("warn", message);
      this.attachToRunningJob();
      return;
    }
    this.pushLocal("error", message);
    this.loadReadiness(false);
  }

  // Developed with Understanding: after a 409, reads readiness for the job id holding the lock
  // and follows that job.
  private attachToRunningJob(): void {
    this.api
      .getReadiness()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (readiness) => {
          this.applyReadiness(readiness);
          if (readiness.running && readiness.active_job_id) {
            this.pushLocal("info", "Following the run that is already in progress.");
            this.startPolling(readiness.active_job_id);
            return;
          }
          this.pushLocal("info", "The other run has already ended. Its result is shown in the steps above.");
        },
        error: (err: unknown) => this.pushLocal("error", getErrorMessage(err)),
      });
  }

  // Developed with Understanding: the inline fallback (OQ11) - the run finished inside the request,
  // so there was no live log to follow. The final summary is shown at once, then the job's stored
  // log is read back once so the whole run is still visible without a worker. If that read fails
  // or holds no line, the summary's closing message is written instead.
  private showInlineSummary(response: HrcdfRunInline): void {
    const summary = response.summary;
    this.activeStep.set(stepForMode(summary.mode));
    const view = runViewFromSummary(summary);
    this.run.set(view);
    this.reportUnitsOutcome(view);
    this.pushLocal(
      "warn",
      "The background worker did not answer, so the run was carried out while this page waited. Its log is read back below.",
    );
    const closingLevel: HrcdfLogLevel = summary.status === "failed" ? "error" : "done";
    const closing = summary.message || response.message;
    this.afterRunEnded();
    this.api
      .getProgress(response.job_id, 0, HRCDF_PROGRESS_LINE_LIMIT)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (progress) => {
          const lines = (progress.lines ?? []).map((line) => this.toLogLine(line));
          if (lines.length === 0) {
            this.pushLocal(closingLevel, closing);
            return;
          }
          this.appendLines(lines);
        },
        error: () => this.pushLocal(closingLevel, closing),
      });
  }

  // Developed with Understanding: IIMA's poll (fe.ts lines 224-235) re-expressed - timer every
  // 1000 ms with exhaustMap, so a tick that lands while a request is still out is dropped and
  // polls never overlap. since is the last sequence held and limit is 2000. A failed request
  // becomes null and is counted. takeUntilDestroyed stops the poll when the page is left, which
  // stops watching but never stops the run on the server.
  private startPolling(jobId: string): void {
    this.stopPolling();
    this.lastSeq = 0;
    this.pollFailures = 0;
    this.pollLostMessage.set("");
    this.polling.set(true);
    this.pollSub = timer(0, POLL_INTERVAL_MS)
      .pipe(
        exhaustMap(() =>
          this.api
            .getProgress(jobId, this.lastSeq, HRCDF_PROGRESS_LINE_LIMIT)
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((snapshot) => this.applyProgress(snapshot));
  }

  // Developed with Understanding: ends the poll subscription.
  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
    this.polling.set(false);
  }

  // Developed with Understanding: one poll result (IIMA fe.ts lines 242-309) - the gap line, the
  // new lines, the counters, and the stop rule: finished or failed and not truncated, because a
  // truncated answer still has buffered lines, the last of which is the closing line.
  private applyProgress(snapshot: HrcdfProgress | null): void {
    if (snapshot === null) {
      this.onPollFailure();
      return;
    }
    this.pollFailures = 0;
    if (snapshot.gap) {
      this.pushLocal(
        "warn",
        `${snapshot.dropped} earlier line(s) left the server's buffer before this page could collect them. The counters are still complete.`,
      );
    }
    this.appendLines(snapshot.lines.map((line) => this.toLogLine(line)));
    this.lastSeq = snapshot.last_seq;
    this.activeStep.set(stepForMode(snapshot.mode));
    const view = runViewFromProgress(snapshot);
    this.run.set(view);
    const ended = snapshot.status === "finished" || snapshot.status === "failed";
    if (ended && !snapshot.truncated) {
      this.stopPolling();
      this.reportUnitsOutcome(view);
      this.afterRunEnded();
    }
  }

  // Developed with Understanding: when a units job ends, its closing message is also written
  // beside the Get Ship Names button - as the notice on success, as the error on failure.
  private reportUnitsOutcome(view: RunView): void {
    if (view.mode !== "units") {
      return;
    }
    if (view.status === "failed") {
      this.refreshMessage.set("");
      this.refreshError.set(view.message || "Getting ship names from HRCDF failed.");
      return;
    }
    this.refreshError.set("");
    this.refreshMessage.set(view.message || "Ship names were read from HRCDF.");
  }

  // Developed with Understanding: ten failed polls in a row stop the poll with a visible message
  // (IIMA fe.ts lines 243-251). One failure is treated as a blip.
  private onPollFailure(): void {
    this.pollFailures += 1;
    if (this.pollFailures < MAX_POLL_FAILURES) {
      return;
    }
    this.stopPolling();
    const message =
      "Lost contact with the server after 10 failed checks in a row. The run may still be going on the server. Reload this page to follow it again.";
    this.pollLostMessage.set(message);
    this.pushLocal("error", message);
  }

  // Developed with Understanding: after a run ends, the steps, the ship list and the personnel
  // list are read again so they show what the run changed.
  private afterRunEnded(): void {
    this.loadReadiness(false);
    this.loadUnits();
    this.requestPersonnel();
  }

  // Developed with Understanding: clears the run view before a new run.
  private resetRunView(): void {
    this.stopPolling();
    this.run.set(null);
    this.logLines.set([]);
    this.pollLostMessage.set("");
    this.lastSeq = 0;
    this.localSeq = -1;
  }

  // Developed with Understanding: a server line as drawn, with its level word and clock time.
  private toLogLine(line: HrcdfProgressLine): LogLine {
    return {
      seq: line.seq,
      level: line.level,
      word: levelWord(line.level),
      time: formatClock(line.ts),
      text: line.text,
    };
  }

  // Developed with Understanding: a line this page writes itself, with a negative sequence.
  private pushLocal(level: HrcdfLogLevel, text: string): void {
    const seq = this.localSeq;
    this.localSeq -= 1;
    this.appendLines([
      { seq, level, word: levelWord(level), time: formatClock(new Date().toISOString()), text },
    ]);
  }

  // Developed with Understanding: appends lines, keeps at most 5000, and follows the end of the
  // log only when the operator was already at the bottom. The scroll waits for the new lines to
  // render through afterNextRender, never setTimeout (R1 G2).
  private appendLines(lines: LogLine[]): void {
    if (lines.length === 0) {
      return;
    }
    const follow = this.isLogNearBottom();
    this.logLines.update((current) => {
      const next = current.concat(lines);
      return next.length > MAX_CLIENT_LINES ? next.slice(-MAX_CLIENT_LINES) : next;
    });
    if (!follow) {
      return;
    }
    afterNextRender(
      () => {
        const element = this.logBox()?.nativeElement;
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      },
      { injector: this.injector },
    );
  }

  // Developed with Understanding: measured before new lines are added (IIMA fe.ts lines 324-332).
  private isLogNearBottom(): boolean {
    const element = this.logBox()?.nativeElement;
    if (!element) {
      return true;
    }
    return element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
  }

  // Developed with Understanding: the pill toggle writes the tab into the URL query parameter
  // tab, and the URL subscription below loads it, so back and forward and a refresh all agree.
  onTabLabel(label: string): void {
    const tab: PersonnelTab = label === TAB_LABELS.others ? "others" : "own";
    if (tab === this.activeTab()) {
      return;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  // Developed with Understanding: the search box - debounced before it reaches the server.
  onSearchInput(value: string): void {
    this.searchText.set(value);
    this.search$.next(value);
  }

  // Developed with Understanding: the grid asked for another page or page size.
  onPageRequested(request: { page: number; pageSize: number }): void {
    this.page.set(request.page);
    this.pageSize.set(request.pageSize);
    this.requestPersonnel();
  }

  // Developed with Understanding: Try again on the personnel error state.
  retryPersonnel(): void {
    this.requestPersonnel();
  }

  // Developed with Understanding: queues a personnel fetch. switchMap below drops an answer that
  // arrives after a newer request, so a slow page can never overwrite a newer one.
  private requestPersonnel(): void {
    this.personnelLoad$.next();
  }

  // Developed with Understanding: reads the tab from the URL query parameter tab.
  private wireTabFromUrl(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const tab: PersonnelTab = params.get("tab") === "others" ? "others" : "own";
      if (tab === this.activeTab() && this.personnelStarted) {
        return;
      }
      this.personnelStarted = true;
      this.activeTab.set(tab);
      this.resetPersonnelPaging();
      this.requestPersonnel();
    });
  }

  // Developed with Understanding: follows the search box and the three personnel filters.
  private wirePersonnelFilters(): void {
    this.search$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        map((value) => value.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => {
        this.appliedSearch.set(value);
        this.onPersonnelFiltersChanged();
      });
    this.personnelFilters.controls.status.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.ownStatus.set(value === "open" || value === "closed" ? value : "all");
        this.onPersonnelFiltersChanged();
      });
    this.personnelFilters.controls.command.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.personnelCommand.set(value ? String(value) : "");
        this.dropPersonnelUnitOutsideCommand();
        this.onPersonnelFiltersChanged();
      });
    this.personnelFilters.controls.unit.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.personnelUnit.set(value ? String(value) : "");
        this.onPersonnelFiltersChanged();
      });
  }

  // Developed with Understanding: clears the Unit filter when the Command filter leaves it out.
  private dropPersonnelUnitOutsideCommand(): void {
    const commandCode = this.personnelCommand();
    const unitCode = this.personnelUnit();
    if (!commandCode || !unitCode) {
      return;
    }
    const stillValid = this.units().some((unit) => unit.code === unitCode && unit.command_code === commandCode);
    if (!stillValid) {
      this.personnelFilters.controls.unit.setValue("", { emitEvent: false });
      this.personnelUnit.set("");
    }
  }

  // Developed with Understanding: a filter change starts again from page 1, and the reset key
  // tells the grid to reset its own page tracker too.
  private onPersonnelFiltersChanged(): void {
    this.resetPersonnelPaging();
    this.requestPersonnel();
  }

  // Developed with Understanding: back to page 1 of the default page size.
  private resetPersonnelPaging(): void {
    this.page.set(1);
    this.pageSize.set(PERSONNEL_PAGE_SIZE);
    this.filterVersion.update((version) => version + 1);
  }

  // Developed with Understanding: the personnel fetch pipeline, one request at a time.
  private wirePersonnelLoading(): void {
    this.personnelLoad$
      .pipe(
        switchMap(() => this.fetchPersonnel()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.applyPersonnel(result));
  }

  // Developed with Understanding: one server page of the active tab, as a page or an error.
  private fetchPersonnel(): Observable<PersonnelResult> {
    this.personnelState.set("loading");
    const base = { page: this.page(), page_size: this.pageSize(), search: this.appliedSearch() };
    const request$ =
      this.activeTab() === "own"
        ? this.api.getOwnPersonnel({ ...base, status: this.ownStatus() })
        : this.api.getOtherPersonnel({ ...base, command: this.personnelCommand(), unit: this.personnelUnit() });
    return request$.pipe(
      map((page): PersonnelResult => ({ page, error: "" })),
      catchError((err: unknown) => of<PersonnelResult>({ page: null, error: getErrorMessage(err) })),
    );
  }

  // Developed with Understanding: stores a personnel result as the populated, empty or error state.
  private applyPersonnel(result: PersonnelResult): void {
    if (!result.page) {
      this.personnelError.set(result.error);
      this.personnelState.set("error");
      return;
    }
    this.personnelRows.set(result.page.results ?? []);
    this.personnelTotal.set(result.page.count ?? 0);
    this.personnelError.set("");
    this.personnelState.set("ready");
  }
}
