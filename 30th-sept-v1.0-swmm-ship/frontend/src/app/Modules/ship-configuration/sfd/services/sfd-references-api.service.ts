import { computed, inject, Injectable, signal } from "@angular/core";
import { AppService } from "../../../../Core/services/app/app.service";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { LandingPageService } from "../../../landing/services/landing-page.service";
import {
  LogLine,
  LogTone,
  StepSummary,
  SyncCardConfig,
  SyncKey,
} from "../sfd-references/sfd-references.models";

/** Running tallies for the step in flight, resolved into a StepSummary when it ends. */
interface Tally {
  fetched: number | null;
  saved: number | null;
  explicitInserted: number | null;
  explicitUpdated: number | null;
  explicitSkipped: number | null;
  insertedLines: number;
  updatedLines: number;
  skippedLines: number;
  errorLines: number;
  totalLines: number;
}

/** Headline counts the backend prints once per step, e.g. "[NEW] Inserted: 120". */
const RE_FETCHED = /(?:Fetched|Found)\D{0,60}(\d+)/i;
// Step 1 (CMMS SFD Sync) reports its batch size as "Retrieved N equipment records" rather than
// "Fetched"/"Found" — deliberately, so it doesn't double up with _build_log()'s own "Fetched N"
// summary line into the fetched tally (see that yield's own comment on the backend). This is a
// separate regex purely for setting totalItems (the progress-percentage denominator) from that
// line, without touching accumulate()'s t.fetched count the way RE_FETCHED does.
const RE_RETRIEVED = /Retrieved\D{0,60}(\d+)/i;
// Matches the "[SYSTEM] Synced X/Y equipment rows..." heartbeats _sync_rows_to_swmm yields —
// used in handleLine() to jump straight to the real processed-count X instead of counting
// heartbeat lines 1-by-1 (there's only one heartbeat per ~16 rows, not one per row).
const RE_PROGRESS = /Synced\s+(\d+)\/(\d+)\s+equipment rows/i;
const RE_SAVED = /\[OK\]\s*(?:Saved|Pushed|Synced)\s+(\d+)/i;
const RE_INSERTED_TOTAL = /\[NEW\]\s*(?:Inserted|Created)\s*:\s*(\d+)/i;
const RE_UPDATED_TOTAL = /\[EXISTING\]\s*Updated\s*:\s*(\d+)/i;
const RE_SKIPPED_TOTAL = /\[SKIPPED\]\s*(?:Errors|Failed|Skipped)\s*:\s*(\d+)/i;

function emptyTally(): Tally {
  return {
    fetched: null,
    saved: null,
    explicitInserted: null,
    explicitUpdated: null,
    explicitSkipped: null,
    insertedLines: 0,
    updatedLines: 0,
    skippedLines: 0,
    errorLines: 0,
    totalLines: 0,
  };
}

/** Substring → log-line classification, ported from the source Django template's inline
 *  `runSync()` script (see SFD/templates/SFD/sfd_import_master.html). */
function classify(line: string): LogTone {
  if (/INSERTED|Completed|\[OK\]|\[NEW\]/i.test(line)) return "success";
  if (/UPDATED|\[EXISTING\]/i.test(line)) return "update";
  if (/\[SKIPPED\]/i.test(line)) return "skipped";
  if (/Error/i.test(line)) return "error";
  return "info";
}

function stripHtml(chunk: string): string {
  // Bounded quantifier (real tags are nowhere near this long) so the pattern can't be
  // flagged/abused as unbounded backtracking — sonarjs/super-linear-regex.
  return chunk.replace(/<br[\s/]*>/gi, " ").replace(/<[^>]{0,1000}>/g, "").trim();
}

/**
 * Owns both the CMMS sync transport and the state of a run in flight.
 *
 * The state lives here rather than in SfdReferencesComponent because a sync outlives the
 * screen that started it: navigating to another tab destroys the component, and when the
 * state went with it a running sync looked like it had stopped. Being `providedIn: "root"`,
 * this service is a singleton, so the stream keeps filling the same signals and the screen
 * simply re-renders the run in progress when the user comes back.
 */
@Injectable({ providedIn: "root" })
export class SfdReferencesApiService {
  private readonly appService = inject(AppService);
  private readonly landing = inject(LandingPageService);
  private readonly notify = inject(NotificationService);

  readonly runningKey = signal<SyncKey | null>(null);
  readonly completedKeys = signal<ReadonlySet<SyncKey>>(new Set());
  readonly progress = signal(0);
  readonly currentAction = signal("Ready to synchronize Ship data...");
  readonly itemCount = signal(0);
  readonly logLines = signal<readonly LogLine[]>([]);

  /** One completed-step summary per key, newest step last. Kept across runs. */
  readonly summaries = signal<readonly StepSummary[]>([]);

  readonly isRunning = computed(() => this.runningKey() !== null);

  private totalItems = 0;
  private tally = emptyTally();
  private lineBuffer = "";
  private startedAt = 0;

  isCardRunning(key: SyncKey): boolean {
    return this.runningKey() === key;
  }

  isCardCompleted(key: SyncKey): boolean {
    return this.completedKeys().has(key);
  }

  /**
   * Runs one sync step to completion.
   *
   * Deliberately not tied to any component lifecycle and never aborted: once CMMS has
   * started handing us rows, tearing the request down mid-stream would leave the local
   * tables half-written.
   */
  async runSync(card: SyncCardConfig): Promise<void> {
    if (this.isRunning() || !card.endpoint) return;
    const endpoint = card.endpoint;

    this.runningKey.set(card.key);
    this.progress.set(0);
    this.itemCount.set(0);
    this.totalItems = 0;
    this.tally = emptyTally();
    this.lineBuffer = "";
    this.startedAt = Date.now();
    this.logLines.set([]);
    this.currentAction.set(`Starting ${card.title}...`);
    this.appendLog(`[SYSTEM] Initializing sync from /api/v1/sfd/${endpoint}...`, "info");

    let failure: string | null = null;

    try {
      await this.streamSync(endpoint, (chunk) => this.handleChunk(chunk));
      this.flushBuffer();
      this.progress.set(100);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      this.flushBuffer();
      this.appendLog(`[FATAL] Connection error: ${failure}`, "error");
    } finally {
      const summary = this.buildSummary(card, failure);
      this.recordSummary(summary);
      this.currentAction.set(
        failure ? `${card.title} failed — ${failure}` : `${card.title} complete — ${summary.text}`,
      );
      this.runningKey.set(null);
      // Only a run that actually finished marks the step done — this used to run
      // unconditionally here, so a step that errored out (no CMMS connection, a bad
      // query, anything) still got flagged "completed" both locally and in the durable
      // ActiveShipConfig.completed_steps record, silently unlocking the next step over a
      // sync that never really happened.
      if (!failure) {
        this.completedKeys.update((keys) => new Set(keys).add(card.key));
        // Fire-and-forget: the durable copy backing completedKeys across a page refresh.
        // A failure here just means the next refresh re-locks this step — no worse than
        // today, so it's not surfaced as an error of its own.
        void this.persistStepCompletion(card.key);
      }

      if (failure) {
        this.notify.error(failure, `Step ${card.step} failed`);
      } else {
        this.notify.success(summary.text, `Step ${card.step} — ${card.title} complete`);
      }
    }
  }

  /**
   * Restores completedKeys from the backend's durable record on page load.
   *
   * completedKeys otherwise only ever grows during the life of this (page-scoped)
   * service instance — a full browser refresh recreates it empty, which re-locks every
   * step after the first even though the underlying data was already synced.
   */
  async hydrateCompletedSteps(): Promise<void> {
    try {
      const token = this.landing.accessToken();
      const response = await fetch(`${this.appService.baseUrl}api/v1/sfd/sync-progress/`, {
        method: "GET",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return;
      const body = (await response.json()) as { completed_steps?: SyncKey[] };
      const steps = body.completed_steps ?? [];
      if (steps.length) {
        this.completedKeys.update((keys) => new Set([...keys, ...steps]));
      }
    } catch {
      // Best-effort restore — a failed fetch just leaves the wizard starting from
      // whatever completedKeys already had (i.e. locked, same as before this existed).
    }
  }

  private async persistStepCompletion(key: SyncKey): Promise<void> {
    try {
      const token = this.landing.accessToken();
      await fetch(`${this.appService.baseUrl}api/v1/sfd/sync-progress/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ step: key }),
      });
    } catch {
      // Best-effort persist — see hydrateCompletedSteps.
    }
  }

  /** Streams a sync endpoint's progress chunks, invoking `onChunk` as each one arrives. */
  async streamSync(endpoint: string, onChunk: (chunk: string) => void): Promise<void> {
    const token = this.landing.accessToken();
    const response = await fetch(`${this.appService.baseUrl}api/v1/sfd/${endpoint}`, {
      method: "GET",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "");
      let parsedErr = "";
      try {
        const json = JSON.parse(errText);
        parsedErr = json.error || json.message || errText;
      } catch {
        parsedErr = errText;
      }
      throw new Error(parsedErr ? parsedErr.trim() : `Request failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  }

  /**
   * Splits a network chunk into whole log lines.
   *
   * A chunk boundary has nothing to do with a line boundary — one read can carry several
   * lines or stop halfway through one — so the tail is held back until its newline
   * arrives. Counting per chunk (as this used to) both mangled long lines and made the
   * item count depend on network packet timing.
   */
  private handleChunk(chunk: string): void {
    this.lineBuffer += chunk;
    const parts = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = parts.pop() ?? "";
    for (const line of parts) {
      this.handleLine(line);
    }
  }

  private flushBuffer(): void {
    const remainder = this.lineBuffer;
    this.lineBuffer = "";
    if (remainder.trim()) this.handleLine(remainder);
  }

  private handleLine(raw: string): void {
    const clean = stripHtml(raw);
    if (!clean) return;

    this.accumulate(clean);
    this.appendLog(clean, classify(clean));

    // A "Synced X/Y equipment rows..." heartbeat (see _sync_rows_to_swmm's backend comment)
    // carries the real processed-so-far count in its text — jump straight to X instead of the
    // generic "one line = one unit" count below, or the label/percent stayed stuck near the
    // number of *heartbeat lines* seen (e.g. one every 16 rows) rather than the rows they
    // actually represent: 20 heartbeats for a 325-row batch read as "20/325 (~6%)" even once
    // every row was done, then jumped straight to 100% on the next unrelated line.
    const progressMatch = RE_PROGRESS.exec(clean);
    let count: number;
    if (progressMatch) {
      const total = Number(progressMatch[2]);
      if (total > this.totalItems) this.totalItems = total;
      // A later chunk's own "Synced X/Y" heartbeat can report a cumulative X larger than that
      // chunk's own Y once earlier chunks are folded in — clamp what's stored too (not just what
      // the "Processing records" label below shows) so the "N ITEMS PROCESSED" chip never reads
      // past the total it's supposedly out of.
      count = this.totalItems > 0 ? Math.min(Number(progressMatch[1]), this.totalItems) : Number(progressMatch[1]);
      this.itemCount.set(count);
    } else {
      count = this.itemCount() + 1;
      this.itemCount.set(count);
    }

    const percent = this.totalItems > 0
      ? Math.min(99, Math.round((count / this.totalItems) * 100))
      : Math.min(99, Math.round(count * 0.5));
    this.progress.set(percent);
    this.currentAction.set(
      this.totalItems > 0
        // The backend can print more log lines than the "Fetched"/"Synced" total it headlined
        // (e.g. several per-item lines per record), so `count` can run past `totalItems`.
        // Clamp the displayed count too — the progress bar above is already clamped.
        ? `Processing records (${Math.min(count, this.totalItems)}/${this.totalItems})`
        : `Processing records (${count})`,
    );
  }

  /** Pulls record counts out of a log line so the step can be summarised in one line. */
  private accumulate(line: string): void {
    const t = this.tally;
    t.totalLines += 1;

    // Steps can fetch in more than one phase (step 4 does), so fetches add up rather
    // than the first one winning.
    const fetched = RE_FETCHED.exec(line);
    if (fetched) {
      const n = Number(fetched[1]);
      t.fetched = (t.fetched ?? 0) + n;
      if (n > this.totalItems) this.totalItems = n;
    }

    // Sets only the progress denominator, never t.fetched — see RE_RETRIEVED's own comment.
    const retrieved = RE_RETRIEVED.exec(line);
    if (retrieved) {
      const n = Number(retrieved[1]);
      if (n > this.totalItems) this.totalItems = n;
    }

    const saved = RE_SAVED.exec(line);
    if (saved) t.saved = Number(saved[1]);

    const insertedTotal = RE_INSERTED_TOTAL.exec(line);
    if (insertedTotal) t.explicitInserted = Number(insertedTotal[1]);

    const updatedTotal = RE_UPDATED_TOTAL.exec(line);
    if (updatedTotal) t.explicitUpdated = Number(updatedTotal[1]);

    const skippedTotal = RE_SKIPPED_TOTAL.exec(line);
    if (skippedTotal) t.explicitSkipped = Number(skippedTotal[1]);

    // Per-row markers, used only when the backend printed no headline total.
    if (/^\[NEW\]/i.test(line)) t.insertedLines += 1;
    if (/^\[EXISTING\]/i.test(line)) t.updatedLines += 1;
    if (/^\[SKIPPED\]/i.test(line)) t.skippedLines += 1;
    if (/^\[(?:ERROR|FATAL)\]/i.test(line)) t.errorLines += 1;
  }

  private buildSummary(card: SyncCardConfig, failure: string | null): StepSummary {
    const t = this.tally;
    const inserted = t.explicitInserted ?? t.insertedLines;
    const updated = t.explicitUpdated ?? t.updatedLines;
    const skipped = t.explicitSkipped ?? t.skippedLines;
    const durationMs = Date.now() - this.startedAt;

    const parts: string[] = [];
    if (t.fetched !== null) parts.push(`${t.fetched} fetched`);
    if (t.saved !== null) parts.push(`${t.saved} saved`);
    if (inserted) parts.push(`${inserted} new`);
    if (updated) parts.push(`${updated} updated`);
    if (skipped) parts.push(`${skipped} skipped`);
    if (t.errorLines) parts.push(`${t.errorLines} error${t.errorLines === 1 ? "" : "s"}`);
    if (!parts.length) parts.push(`${t.totalLines} log lines`);

    const text = `${parts.join(" · ")} in ${(durationMs / 1000).toFixed(1)}s`;

    return {
      key: card.key,
      step: card.step,
      title: card.title,
      color: card.color,
      fetched: t.fetched,
      saved: t.saved,
      inserted,
      updated,
      skipped,
      errors: t.errorLines,
      durationMs,
      failed: failure !== null,
      text,
    };
  }

  /** Replaces any earlier summary for the same step so a re-run supersedes it. */
  private recordSummary(summary: StepSummary): void {
    this.summaries.update((all) =>
      [...all.filter((s) => s.key !== summary.key), summary].sort((a, b) => a.step - b.step),
    );
  }

  private appendLog(text: string, tone: LogTone): void {
    this.logLines.update((lines) => [...lines, { text, tone }]);
  }

  /** Appended right after Step 1 (CMMS SFD Sync) finishes when equipment is still missing
   *  a Sub Department — mirrors the reference project's "[ACTION REQUIRED]"/"[INFO]" log
   *  lines that point the operator at Reference Data > RHSI Master before Step 2 unlocks. */
  appendSubDepartmentActionLog(
    unassignedTotal: number,
    byDepartment: readonly { department: string; unassigned: number }[],
  ): void {
    const breakdown = byDepartment
      .filter((d) => d.unassigned > 0)
      .map((d) => `${d.department} - ${d.unassigned}`)
      .join(", ");
    this.appendLog(
      `[ACTION REQUIRED] ${unassignedTotal} equipment have no sub department` +
        `${breakdown ? ` (${breakdown})` : ""}. Go to Ship Configuration → Reference Data → ` +
        `RHSI Master and assign a sub department to every equipment, then return here. ` +
        `STEP 2 unlocks after that.`,
      "error",
    );
    this.appendLog(
      "[INFO] Reference Data → RHSI Master is where you assign Sub Departments. Sign in as " +
        "ADMIN or SHIPADMIN there to see every department at once.",
      "info",
    );
  }
}
