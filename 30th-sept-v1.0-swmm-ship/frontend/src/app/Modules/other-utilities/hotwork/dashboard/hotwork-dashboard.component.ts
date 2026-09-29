import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";

// Shared Components from src/app/shared/components
import { KpiCard } from "../../../../shared/components/kpi-card/kpi-card";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { DatePickerComponent } from "../../../../shared/components/date-picker/picker";
import {
  LineChart,
  LineSeries,
} from "../../../../shared/components/line-chart/line-chart";
import {
  BarChart,
  BarDatum,
} from "../../../../shared/components/bar-chart/bar-chart";
import {
  DonutChart,
  DonutSegment,
} from "../../../../shared/components/donut-chart/donut-chart";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import {
  CommonApiService,
  HotworkDashboardData,
  HotworkHistoryDataItem,
  HotworkItem,
} from "../../../../Core/http/services/api.service";

const HELP_HTML = `<p class="mb-0">Overview of hotwork activity - counts of requisitions scheduled, in progress, awaiting approval, completed, and ready to start, plus weekly and historical trend charts. Click a card's View more link to open the underlying list.</p>`;

function parseDateRange(rawDateRange: unknown): {
  startDateStr: string;
  endDateStr: string;
} {
  if (!rawDateRange) return { startDateStr: "", endDateStr: "" };

  if (typeof rawDateRange === "string") {
    const separators = [" – ", " - ", " to ", "–"];
    for (const sep of separators) {
      if (rawDateRange.includes(sep)) {
        const parts = rawDateRange.split(sep).map((s) => s.trim());
        return {
          startDateStr: parts[0] || "",
          endDateStr: parts[1] || parts[0] || "",
        };
      }
    }
    const trimmed = rawDateRange.trim();
    return { startDateStr: trimmed, endDateStr: trimmed };
  }

  if (typeof rawDateRange === "object") {
    const dr = rawDateRange as { start?: string; end?: string; startDate?: string; endDate?: string };
    const start = dr.start || dr.startDate || "";
    const end = dr.end || dr.endDate || start;
    return { startDateStr: start, endDateStr: end };
  }

  return { startDateStr: "", endDateStr: "" };
}

function isDateWithinRange(
  dateStr: string,
  startDateStr: string,
  endDateStr: string
): boolean {
  if (!startDateStr || !dateStr || dateStr === "-") return true;

  const itemTime = new Date(dateStr).getTime();
  const startTime = new Date(startDateStr).getTime();
  const endTime = new Date(endDateStr).getTime();

  if (Number.isNaN(itemTime) || Number.isNaN(startTime)) return true;

  if (!Number.isNaN(endTime)) {
    const endOfDayTime = endTime + 86400000 - 1;
    return itemTime >= startTime && itemTime <= endOfDayTime;
  }

  return itemTime >= startTime;
}

@Component({
  selector: "app-hotwork-dashboard",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    KpiCard,
    PanelCard,
    DatePickerComponent,
    LineChart,
    BarChart,
    DonutChart,
    HelpGuidance,
  ],
  templateUrl: "./hotwork-dashboard.component.html",
  styleUrl: "./hotwork-dashboard.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotworkDashboardComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly commonApiService = inject(CommonApiService);

  // Raw API Signals for Filtering
  readonly rawHistoryData = signal<HotworkHistoryDataItem[]>([]);
  readonly rawFallbackItems = signal<HotworkItem[]>([]);

  // KPI Counter Signals
  readonly scheduledToday = signal<number>(0);
  readonly inProgress = signal<number>(0);
  readonly awaitingApproval = signal<number>(0);
  readonly completed = signal<number>(0);
  readonly readyToStart = signal<number>(0);

  ngOnInit(): void {
    this.commonApiService.getHotworkDashboardData().subscribe({
      next: (res: HotworkDashboardData) => {
        this.applyDashboardData(res);
      },
      error: () => {
        this.loadFallbackFromList();
      },
    });
  }

  private applyDashboardData(res: HotworkDashboardData): void {
    const s = res?.summary;
    const p = res?.present_progress;
    const w = res?.weekly_data || res?.weekly_summary;
    const h = res?.history_data;

    if (h && Array.isArray(h)) {
      this.rawHistoryData.set(h);
    }

    const scheduledVal = s?.scheduled_today ?? res?.scheduled_today ?? 0;
    const inProgVal = s?.in_progress ?? s?.hotwork_in_progress_today ?? res?.hotwork_in_progress_today ?? res?.in_progress ?? 0;
    const awaitingVal = s?.awaiting_approval ?? s?.awaiting_approval_today ?? res?.awaiting_approval_today ?? res?.awaiting_approval ?? 0;
    const completedVal = s?.completed ?? s?.completed_today ?? res?.completed_today ?? res?.completed ?? 0;
    const readyVal = s?.ready_to_start ?? s?.ready_to_start_today ?? res?.ready_to_start_today ?? res?.ready_to_start ?? 0;

    const hasSummaryData = (
      scheduledVal > 0 ||
      inProgVal > 0 ||
      awaitingVal > 0 ||
      completedVal > 0 ||
      readyVal > 0
    );

    const hasProgressData = !!p && (
      (p.initiated || 0) > 0 ||
      (p.ready || 0) > 0 ||
      (p.paused || 0) > 0 ||
      (p.completed || 0) > 0
    );

    const hasWeeklyData = Array.isArray(w) && w.length > 0;
    const hasHistoryData = Array.isArray(h) && h.length > 0;

    if (!hasSummaryData && !hasProgressData && !hasWeeklyData && !hasHistoryData) {
      this.loadFallbackFromList();
      return;
    }

    this.scheduledToday.set(scheduledVal);
    this.inProgress.set(inProgVal);
    this.awaitingApproval.set(awaitingVal);
    this.completed.set(completedVal);
    this.readyToStart.set(readyVal);

    if (hasWeeklyData && w) {
      const labels = w.map((item) => {
        if (!item.date || item.date === "-") return "";
        const d = new Date(item.date);
        if (isNaN(d.getTime())) return item.date;
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
      });
      const initiatedVals = w.map((item) => Number(item.initiated || 0));
      const readyVals = w.map((item) => Number(item.ready || 0));
      const completedVals = w.map((item) => Number(item.completed || 0));

      this.weeklyLabels.set(labels);
      this.weeklySeries.set([
        { label: "Initiated", color: "#f59e0b", values: initiatedVals },
        { label: "Ready", color: "#ef4444", values: readyVals },
        { label: "Completed", color: "#3b82f6", values: completedVals },
      ]);
    }

    this.recalculateHistoryBarData();

    let readyTotal = 0;
    let completedTotal = 0;
    let initiatedTotal = 0;
    let pausedTotal = 0;

    if (hasHistoryData) {
      h.forEach((item) => {
        readyTotal += Number(item.ready || 0);
        completedTotal += Number(item.completed || 0);
        initiatedTotal += Number(item.initiated || 0);
        pausedTotal += Number(item.paused || 0);
      });
    } else if (p) {
      readyTotal = p.ready || 0;
      completedTotal = p.completed || 0;
      initiatedTotal = p.initiated || 0;
      pausedTotal = p.paused || 0;
    }

    if (p) {
      this.progressSegments.set([
        { label: "Initiated", value: p.initiated || 0, color: "#f59e0b" },
        { label: "Ready", value: p.ready || 0, color: "#f97316" },
        { label: "Paused", value: p.paused || 0, color: "#ef4444" },
        { label: "Completed", value: p.completed || 0, color: "#3b82f6" },
      ]);
    } else if (hasHistoryData) {
      this.progressSegments.set([
        { label: "Initiated", value: initiatedTotal, color: "#f59e0b" },
        { label: "Ready", value: readyTotal, color: "#f97316" },
        { label: "Paused", value: pausedTotal, color: "#ef4444" },
        { label: "Completed", value: completedTotal, color: "#3b82f6" },
      ]);
    }
  }

  onHistoryDateRangeChange(newRange: unknown): void {
    let strVal: string | null = null;
    if (typeof newRange === "string") {
      strVal = newRange;
    } else if (newRange && typeof newRange === "object") {
      const dr = newRange as { start?: string; end?: string; startDate?: string; endDate?: string };
      const start = dr.start || dr.startDate || "";
      const end = dr.end || dr.endDate || start;
      strVal = start && end ? `${start} – ${end}` : start;
    }
    this.historyDateRange.set(strVal);
    this.recalculateHistoryBarData();

    const { startDateStr, endDateStr } = parseDateRange(strVal);
    if (startDateStr) {
      this.commonApiService.getHotworkDashboardData({ from_date: startDateStr, to_date: endDateStr }).subscribe({
        next: (res) => {
          if (res?.history_data && Array.isArray(res.history_data) && res.history_data.length > 0) {
            this.rawHistoryData.set(res.history_data);
            this.recalculateHistoryBarData();
          }
        },
      });
    }
  }

  private recalculateHistoryBarData(): void {
    const range = this.historyDateRange();
    const { startDateStr, endDateStr } = parseDateRange(range);

    const historyItems = this.rawHistoryData();
    if (historyItems && historyItems.length > 0) {
      let readyCount = 0;
      let inProgressCount = 0;
      let completedCount = 0;

      historyItems.forEach((item) => {
        if (isDateWithinRange(item.date || "", startDateStr, endDateStr)) {
          readyCount += Number(item.ready || 0);
          inProgressCount += Number(item.in_progress || 0);
          completedCount += Number(item.completed || 0);
        }
      });

      this.historyBarData.set([
        { label: "Ready", value: readyCount, color: "#38bdf8", primary: true },
        { label: "In progress", value: inProgressCount, color: "#3b82f6", primary: true },
        { label: "Completed", value: completedCount, color: "#a855f7", primary: true },
      ]);
      return;
    }

    const fallbackItems = this.rawFallbackItems();
    if (fallbackItems && fallbackItems.length > 0) {
      let readyCount = 0;
      let inProgressCount = 0;
      let completedCount = 0;

      fallbackItems.forEach((item) => {
        const itemDate = item.date_of_hotwork || item.created_at || "";
        if (isDateWithinRange(itemDate, startDateStr, endDateStr)) {
          const status = (item.current_status || item.approval_status || "").toLowerCase();
          if (status.includes("complete")) {
            completedCount++;
          } else if (status.includes("progress") || status.includes("in_progress")) {
            inProgressCount++;
          } else if (status.includes("ready") || status.includes("approved")) {
            readyCount++;
          }
        }
      });

      this.historyBarData.set([
        { label: "Ready", value: readyCount, color: "#38bdf8", primary: true },
        { label: "In progress", value: inProgressCount, color: "#3b82f6", primary: true },
        { label: "Completed", value: completedCount, color: "#a855f7", primary: true },
      ]);
    }
  }

  private buildWeeklySummaryFromItems(items: HotworkItem[]): void {
    const daysCount = 7;
    const now = new Date();
    const dates: string[] = [];
    const dateMap = new Map<string, { initiated: number; ready: number; completed: number }>();

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const isoDate = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
      dates.push(label);
      dateMap.set(isoDate, { initiated: 0, ready: 0, completed: 0 });
    }

    if (items && Array.isArray(items)) {
      items.forEach((item) => {
        const rawDate = item.date_of_hotwork || item.created_at || "";
        const isoDate = rawDate.slice(0, 10);
        if (dateMap.has(isoDate)) {
          const counts = dateMap.get(isoDate)!;
          const st = (item.current_status || item.approval_status || "").toLowerCase();
          if (st.includes("complete")) {
            counts.completed++;
          } else if (st.includes("ready") || st.includes("approved")) {
            counts.ready++;
          } else {
            counts.initiated++;
          }
        }
      });
    }

    const initiatedVals: number[] = [];
    const readyVals: number[] = [];
    const completedVals: number[] = [];

    dateMap.forEach((val) => {
      initiatedVals.push(val.initiated);
      readyVals.push(val.ready);
      completedVals.push(val.completed);
    });

    this.weeklyLabels.set(dates);
    this.weeklySeries.set([
      { label: "Initiated", color: "#f59e0b", values: initiatedVals },
      { label: "Ready", color: "#ef4444", values: readyVals },
      { label: "Completed", color: "#3b82f6", values: completedVals },
    ]);
  }

  private loadFallbackFromList(): void {
    this.commonApiService.getHotworkList().subscribe({
      next: (items: HotworkItem[]) => {
        if (items && Array.isArray(items)) {
          let scheduled = 0;
          let inProg = 0;
          let awaiting = 0;
          let comp = 0;
          let ready = 0;

          items.forEach((item) => {
            const status = (
              item.current_status ||
              item.approval_status ||
              ""
            ).toLowerCase();
            if (status.includes("progress") || status.includes("in_progress")) {
              inProg++;
            } else if (
              status.includes("awaiting") ||
              status.includes("pending")
            ) {
              awaiting++;
            } else if (status.includes("complete")) {
              comp++;
            } else if (status.includes("ready")) {
              ready++;
            } else {
              scheduled++;
            }
          });

          this.scheduledToday.set(scheduled || items.length);
          this.inProgress.set(inProg);
          this.awaitingApproval.set(awaiting);
          this.completed.set(comp);
          this.readyToStart.set(ready);

          this.buildWeeklySummaryFromItems(items);

          this.progressSegments.set([
            { label: "Initiated", value: scheduled, color: "#f59e0b" },
            { label: "Ready", value: ready, color: "#f97316" },
            { label: "Paused", value: 0, color: "#ef4444" },
            { label: "Completed", value: comp, color: "#3b82f6" },
          ]);

          this.historyBarData.set([
            { label: "Ready", value: ready, color: "#38bdf8", primary: true },
            {
              label: "In progress",
              value: inProg,
              color: "#3b82f6",
              primary: true,
            },
            {
              label: "Completed",
              value: comp,
              color: "#a855f7",
              primary: true,
            },
          ]);
        }
      },
      error: (err) => {
        console.warn("Fallback list load failed", err);
      },
    });
  }

  // Total count for donut center label
  readonly totalHotwork = computed(() =>
    this.progressSegments().reduce((sum, s) => sum + s.value, 0),
  );

  // Weekly Summary Chart Configuration
  readonly weeklyLabels = signal<string[]>([
    "29 Jul 26",
    "30 Jul 26",
    "31 Jul 26",
    "01 Aug 26",
    "02 Aug 26",
    "03 Aug 26",
    "04 Aug 26",
    "05 Aug 26",
    "06 Aug 26",
    "07 Aug 26",
  ]);

  readonly weeklySeries = signal<LineSeries[]>([
    {
      label: "Initiated",
      color: "#f59e0b",
      values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "Ready",
      color: "#ef4444",
      values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "Completed",
      color: "#3b82f6",
      values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  ]);

  // Installation Trend Data
  readonly installationLabels = signal<string[]>([
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
  ]);
  readonly installationSeries = signal<LineSeries[]>([
    {
      label: "Trend",
      color: "#3b82f6", // bright blue
      values: [30, 50, 42, 60, 55, 70],
    },
  ]);

  // Present Hotwork Progress Segments
  readonly progressSegments = signal<DonutSegment[]>([
    { label: "Initiated", value: 0, color: "#f59e0b" },
    { label: "Ready", value: 0, color: "#f97316" },
    { label: "Paused", value: 0, color: "#ef4444" },
    { label: "Completed", value: 0, color: "#3b82f6" },
  ]);

  // History Bar Chart Data
  readonly historyDateRange = signal<string | null>("");
  readonly historyBarData = signal<BarDatum[]>([
    { label: "Ready", value: 0, color: "#38bdf8", primary: true },
    { label: "In progress", value: 0, color: "#3b82f6", primary: true },
    { label: "Completed", value: 0, color: "#a855f7", primary: true },
  ]);

  navigateToManageHotwork(): void {
    this.router.navigate(["../manage-hotwork"], { relativeTo: this.route });
  }
}
