import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { LineChart, LineSeries } from '../../../../shared/components/line-chart/line-chart';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { KpiCard } from '../../../../shared/components/kpi-card/kpi-card';
import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';

import {
  Call,
  TechnicalDashboardCards,
  TechnicalDashboardCertificateAlert,
  TechnicalDashboardDartAlert,
  TechnicalDashboardRoutineAlert,
} from '../../../../Core/http/services/call';
import { EquipmentSection } from '../../constants/data';

const HELP_HTML = `
  <p class="mb-2 leading-relaxed"><strong>What this page is for</strong></p>
  <p class="mb-3 leading-relaxed">An overview of the Ship's Role, and a repository of Daily Orders.</p>

  <p class="mb-2 leading-relaxed"><strong>What each menu group means</strong></p>
  <ul class="list-disc pl-4 mb-3 space-y-1">
    <li class="leading-relaxed"><strong>Op. Maintenance</strong> - defects, equipment routines, and other utilities (engineering department only).</li>
    <li class="leading-relaxed"><strong>Inventory</strong> - Ship Inventory (as-is spares, validated against MO/WED), and Shore Inventory (MO/WED) for demand and receipt.</li>
    <li class="leading-relaxed"><strong>Ship Returns</strong> - SRAR and Trial Returns reporting.</li>
    <li class="leading-relaxed"><strong>Trial Requisitions</strong> - trial requisition proforma sent to trial teams via ITTTM.</li>
    <li class="leading-relaxed"><strong>Other Utilities</strong> - Hot Work permits and Tag In/Tag Out records.</li>
    <li class="leading-relaxed"><strong>Activity Planner</strong> - department-wise activities planned by the HOD, visible to that department.</li>
    <li class="leading-relaxed"><strong>Ship Configuration</strong> - view the Ship Fit Definition (SFD) as available in CMMS.</li>
    <li class="leading-relaxed"><strong>Refit Maintenance</strong> - monitors Defect Lists raised by Ship Staff during refit.</li>
    <li class="leading-relaxed"><strong>KMS</strong> - certificate expiry, in/out mail, and the document/SharePoint/technical manual repository.</li>
    <li class="leading-relaxed"><strong>Ship Crew</strong> - create the Watch &amp; Station Bill, approve Leave Forecast, view crew availability.</li>
  </ul>

  <p class="mb-1 leading-relaxed"><strong>Tip:</strong> If a menu item you expect isn't showing, it is most likely restricted to a different role or rank.</p>
  <p class="leading-relaxed"><strong>Tip:</strong> Update the Ship's Role text and the five sliding images from the References tab.</p>
`;

const EMPTY_CARDS: TechnicalDashboardCards = {
  total_maintops: 0,
  total_outstanding_darts: 0,
  total_planned_routines: 0,
  due_for_receipt: 0,
  pts_survey_pending: 0,
  total_issued_spares: 0,
  user_count: 0,
};

// Cycled by index across however many sub-departments the backend returns -
// the reference itself only ever chose these colours client-side too.
const EQUIPMENT_PALETTE = ['#f97316', '#22c55e', '#a855f7', '#4AA8FF', '#f59e0b', '#ef4444', '#14b8a6'];

type AlertCategory = 'Darts' | 'Certificates' | 'Routines';
type AlertTabKey = 'All' | AlertCategory;

// Matches the three CSS treatments already defined for this panel
// (.oc-dashboard__alert-item--info/--alert/--warn etc.) - the icon itself
// stays variant="inherit" and gets its colour from the wrapping div's class.
type AlertKind = 'info' | 'alert' | 'warn';

interface DashboardAlert {
  id: string;
  category: AlertCategory;
  title: string;
  body: string;
  when: string;
  icon: string;
  kind: AlertKind;
}

const ALERT_TABS: { key: AlertTabKey; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Darts', label: 'DARTs' },
  { key: 'Certificates', label: 'Certificates' },
  { key: 'Routines', label: 'Routines' },
];

@Component({
  selector: 'app-oc-planner-dashboard',
  standalone: true,
  imports: [LineChart, IconComponent, KpiCard, HelpGuidance, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class OcPlannerDashboardComponent implements OnInit {
  private readonly call = inject(Call);
  private readonly router = inject(Router);

  protected readonly helpHtml = HELP_HTML;
  protected readonly alertTabs = ALERT_TABS;

  protected readonly cards = signal<TechnicalDashboardCards>(EMPTY_CARDS);
  protected readonly dartTrendLabels = signal<string[]>([]);
  protected readonly dartTrendSeries = signal<LineSeries[]>([]);
  protected readonly equipmentSections = signal<EquipmentSection[]>([]);
  protected readonly alerts = signal<DashboardAlert[]>([]);
  protected readonly activeAlertTab = signal<AlertTabKey>('All');

  ngOnInit(): void {
    this.call.getTechnicalDashboard().subscribe({
      next: (response) => {
        const data = response.data;
        this.cards.set(data.cards);

        // Reference parity: main_home.html's amCharts series use exactly these
        // labels and colours (green 0x28a745 for open, red 0xDC3545 for closed).
        this.dartTrendLabels.set(data.dart_chart.map((m) => m.month));
        this.dartTrendSeries.set([
          { label: 'Defect Open DART', color: '#28a745', values: data.dart_chart.map((m) => m.open_dart) },
          { label: 'Defect Closed DART', color: '#dc3545', values: data.dart_chart.map((m) => m.closed_dart) },
        ]);

        this.equipmentSections.set(
          data.sub_dept_equipment_data.map((row, i) => ({
            label: row.sub_dept,
            operational: row.operational,
            nonOperational: row.non_operational,
            color: EQUIPMENT_PALETTE[i % EQUIPMENT_PALETTE.length],
          })),
        );

        this.alerts.set([
          ...data.dart_alerts.map((a) => this.toDartAlert(a)),
          ...data.certificate_alerts.map((a) => this.toCertificateAlert(a)),
          ...data.routine_alerts.map((a) => this.toRoutineAlert(a)),
        ]);
      },
      error: (error) => console.error('Failed to load technical dashboard', error),
    });
  }

  protected readonly totalMaintops = computed(() => this.cards().total_maintops);
  protected readonly totalOutstandingDarts = computed(() => this.cards().total_outstanding_darts);
  protected readonly totalPlannedRoutines = computed(() => this.cards().total_planned_routines);
  protected readonly dueForReceipt = computed(() => this.cards().due_for_receipt);
  protected readonly ptsSurveyPending = computed(() => this.cards().pts_survey_pending);
  protected readonly totalIssuedSpares = computed(() => this.cards().total_issued_spares);

  protected readonly filteredAlerts = computed(() => {
    const tab = this.activeAlertTab();
    const all = this.alerts();
    return tab === 'All' ? all : all.filter((a) => a.category === tab);
  });

  protected setAlertTab(tab: AlertTabKey): void {
    this.activeAlertTab.set(tab);
  }

  private toDartAlert(a: TechnicalDashboardDartAlert): DashboardAlert {
    return {
      id: `dart-${a.id}`,
      category: 'Darts',
      title: `${a.dart_number} pending ${a.days_open}d`,
      body: a.equipment,
      when: `${a.days_open}d open`,
      icon: 'wrench',
      kind: 'info',
    };
  }

  private toRoutineAlert(a: TechnicalDashboardRoutineAlert): DashboardAlert {
    return {
      id: `routine-${a.id}`,
      category: 'Routines',
      title: `${a.dart_number} overdue`,
      body: a.equipment,
      when: `${a.days_overdue}d overdue`,
      icon: 'triangle-alert',
      kind: 'warn',
    };
  }

  private toCertificateAlert(a: TechnicalDashboardCertificateAlert): DashboardAlert {
    return {
      id: `cert-${a.id}`,
      category: 'Certificates',
      title: a.is_expired ? 'Certificate Expired' : 'Certificate Expiring',
      body: `${a.name} (${a.certificate_type}) ${a.is_expired ? 'expired on' : 'expires on'} ${a.expiry_date}`,
      when: a.is_expired ? `${a.days_abs}d overdue` : `in ${a.days}d`,
      icon: 'file-text',
      kind: a.is_expired ? 'alert' : 'warn',
    };
  }

  protected equipmentTotal(section: EquipmentSection): number {
    return section.operational + section.nonOperational;
  }

  /**
   * Two-tone semicircle arc (operational then non-operational) drawn over a
   * 120x66 viewBox, centred at (60,60) with radius 50 - sweeping from the
   * left point (180deg) over the top to the right point (0deg).
   */
  protected equipmentArcPath(section: EquipmentSection): { operational: string; nonOperational: string } {
    const total = this.equipmentTotal(section);
    const ratio = total ? section.operational / total : 0;
    const cx = 60;
    const cy = 60;
    const r = 50;
    const point = (angleDeg: number) => {
      const rad = (angleDeg * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
    };
    const start = point(180);
    const mid = point(180 - ratio * 180);
    const end = point(0);
    const arc = (from: { x: number; y: number }, to: { x: number; y: number }) =>
      `M ${from.x} ${from.y} A ${r} ${r} 0 0 1 ${to.x} ${to.y}`;
    return {
      operational: arc(start, mid),
      nonOperational: arc(mid, end),
    };
  }

  protected goToCalendar(): void {
    void this.router.navigateByUrl('/afterAuth/activity/calendar');
  }

  protected goToSearchRoutines(): void {
    void this.router.navigateByUrl('/afterAuth/op-maintenance/routine/search-routines');
  }

  protected goToSearchSpare(): void {
    void this.router.navigateByUrl('/afterAuth/inventory/ship-inventory-obs/search');
  }

  protected goToOpenDarts(): void {
    void this.router.navigateByUrl('/afterAuth/op-maintenance/defect/actions');
  }

  protected goToPlannedRoutines(): void {
    void this.router.navigateByUrl('/afterAuth/op-maintenance/routine/planned-routines');
  }

  protected goToIssuedSpares(): void {
    void this.router.navigateByUrl('/afterAuth/inventory/ship-inventory-obs/history');
  }

  protected goToDueForReceipt(): void {
    void this.router.navigateByUrl('/afterAuth/inventory/shore-inventory-mo/transactions/receive');
  }

  protected goToPtsSurveyPending(): void {
    void this.router.navigateByUrl('/afterAuth/inventory/shore-inventory-mo/transactions/pts');
  }

  protected goToEquipmentStatus(section: EquipmentSection): void {
    void this.router.navigate(['/afterAuth/technical-dashboard/dashboard/equipment-status'], {
      queryParams: { section: section.label },
    });
  }
}
