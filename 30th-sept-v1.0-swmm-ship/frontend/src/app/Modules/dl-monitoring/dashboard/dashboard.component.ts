import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DlApiService } from '../services/dl-api.service';
import { DlDashboardBreakdown } from '../models';
import { BarChart, KpiCard, StackedBarSeries } from '../../../shared/components';
import { PanelCard } from '../../../shared/components/panel-card/panel-card';
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';

/** Cycled per compartment (sub-department) — the number of compartments is
 *  data-driven, not fixed, so colours are assigned by index rather than name. */
const TOTAL_PALETTE = ['#2674b8', '#4a94d0', '#83bdd8', '#b3d7e6', '#d9e8ef', '#e8f1f6'];
const PENDING_PALETTE = ['#a98216', '#c29e1f', '#e3bd31', '#edcf5f', '#f9e7ac', '#fbf0cc'];

/** Matches `DLDashboardBreakdownAPIView.DL_TYPES` — shown immediately, before the API
 *  response lands, so the chart's axis/legend never render fully blank. */
const DEFAULT_CATEGORIES = ['DL1', 'DL2', 'DL3'];

function toStackedSeries(dataset: DlDashboardBreakdown['total'] | undefined, palette: string[]): StackedBarSeries[] {
  const categories = dataset?.categories ?? DEFAULT_CATEGORIES;
  const series = dataset?.series ?? [];
  if (series.length === 0) {
    // No `DLTracker` rows for this department yet — still render a flat 0-value
    // series so the axis/legend show instead of a fully blank panel.
    return [{ name: 'No data', color: 'rgba(127,150,178,0.35)', data: categories.map(() => 0) }];
  }
  return series.map((s, i) => ({
    name: s.name,
    color: palette[i % palette.length],
    data: s.data,
  }));
}

@Component({
  selector: 'app-dl-dashboard',
  standalone: true,
  imports: [KpiCard, PanelCard, BarChart, HelpGuidance],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(DlApiService);

  readonly helpHtml = `<p class="fw-bold mb-3">An overview of Defect List (DL) monitoring - refits in progress and counts for Defect List I, II, and III, with charts breaking down DLs by compartment (sub-department) and showing pending vs completed. Use "View more" on any card to open its tracking list.</p>`;

  // Signal state
  readonly countsSignal = signal({ dl1: 0, dl2: 0, dl3: 0, total: 0 });

  // "Refit in Progress" total is computed server-side (`DLDashboardCountsAPIView`), not summed here.
  readonly totalRefit = computed(() => this.countsSignal().total);

  readonly dl1Count = computed(() => this.countsSignal().dl1);
  readonly dl2Count = computed(() => this.countsSignal().dl2);
  readonly dl3Count = computed(() => this.countsSignal().dl3);

  // Compartment-wise (department-scoped) breakdown — real `DLTracker` aggregates from
  // `dashboard-breakdown/` (DLDashboardBreakdownAPIView), no static/demo values.
  private readonly breakdown = signal<DlDashboardBreakdown | null>(null);

  readonly breakdownCategories = computed(() => this.breakdown()?.total.categories ?? DEFAULT_CATEGORIES);
  readonly breakdownSeries = computed<StackedBarSeries[]>(() =>
    toStackedSeries(this.breakdown()?.total, TOTAL_PALETTE),
  );

  readonly pendingCategories = computed(() => this.breakdown()?.pending.categories ?? DEFAULT_CATEGORIES);
  readonly pendingSeries = computed<StackedBarSeries[]>(() =>
    toStackedSeries(this.breakdown()?.pending, PENDING_PALETTE),
  );

  ngOnInit(): void {
    this.api.counts().subscribe({
      next: v => {
        if (v) {
          this.countsSignal.set(v);
        }
      },
      error: err => {
        console.error('Failed to fetch DL counts:', err);
      }
    });

    this.api.breakdown().subscribe({
      next: data => this.breakdown.set(data),
      error: err => {
        console.error('Failed to fetch DL compartment breakdown:', err);
      }
    });
  }
}
