import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ColDef } from 'ag-grid-community';
import { MasterCard } from '../../../refit-maintenance/master-card/master-card';
import { InputField } from '../../../../shared/components/input-field/input-field';
import { SelectInput, DropdownOption } from '../../../../shared/components/select-input/select-input';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { BarChart, BarDatum } from '../../../../shared/components/bar-chart/bar-chart';
import { KpiCard } from '../../../../shared/components/kpi-card/kpi-card';
import { DataGrid } from '../../../../shared/components/data-grid/data-grid';
import { OperationalMaintenanceApi } from '../../services/operational-maintenance-api';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import {
  EmsEquipmentLocation,
  EquipmentHistoryItem,
  MonthlyRunningHoursRow,
  SectionRhsiBarchartResponse,
} from './ems-dashboard.model';
import { SpareDeleteRenderer } from '../../../../shared/components/data-grid/spare-delete-renderer';
import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';

const HELP_HTML = `
  <ul class="mb-0">
    <li>The Op. Maintenance dashboard - shows counts of maintops, routines due by running hours or calendar, FUSS triggers and equipment due for ABER, each linking to its detailed list.</li>
    <li>Click a bar in a section's chart to open the Equipment Management pop-up, where you can switch equipment ON/OFF, log start/stop times with the Monthly Book Closing Assistant, or enter cumulative running hours directly.</li>
  </ul>
`;

interface DashboardTile {
  label: string;
  count: number;
  icon: string;
  iconColor: string;
  iconBg: string;
  route: string;
}

type EquipmentModalTab = 'status' | 'monthly' | 'cumulative';

interface SectionChart {
  id: string;
  name: string;
  bars: BarDatum[];
}

const TILE_META: { key: string; label: string; icon: string; iconColor: string; iconBg: string; route: string }[] = [
  { key: 'count', label: 'MAINTOPS', icon: 'clipboard-list', iconColor: '#4AA8FF', iconBg: 'rgba(74,168,255,0.16)', route: 'unique-maintop-routines' },
  { key: 'rh_due_count', label: "R/H Based Routines due in 1K Hours'", icon: 'clock', iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.16)', route: 'r-h-based-routines' },
  { key: 'cal_due_count', label: 'Calendar Based Routines due in next 06 months', icon: 'calendar', iconColor: '#a855f7', iconBg: 'rgba(168,85,247,0.16)', route: 'calendar-based-routing' },
  { key: 'fuss_due_count', label: 'FUSS Trigger List', icon: 'flag', iconColor: '#ec4899', iconBg: 'rgba(236,72,153,0.16)', route: 'fuss-trigger-list' },
  { key: 'aber_due_count', label: 'Equipment due for ABER', icon: 'triangle-alert', iconColor: '#F82C36', iconBg: 'rgba(248,44,54,0.16)', route: 'equipment-due-for-ABER' },
];

const LOCATION_OPTIONS: DropdownOption[] = [
  { label: 'AT HARBOUR', value: 'AT HARBOUR' },
  { label: 'AT SEA', value: 'AT SEA' },
  { label: 'AT ANCHORAGE', value: 'AT ANCHORAGE' },
];

@Component({
  selector: 'app-ems-dashboard',
  standalone: true,
  imports: [CommonModule, SelectInput, ReactiveFormsModule, MasterCard, InputField,
    ModalComponent, BarChart, KpiCard, HelpGuidance, DataGrid, ButtonComponent, IconComponent,
  ],
  templateUrl: './ems-dashboard.html',
  styleUrl: './ems-dashboard.css',
})
export class EmsDashboard implements OnInit {
  readonly helpHtml = HELP_HTML;

  private readonly router = inject(Router);
  private readonly call = inject(OperationalMaintenanceApi);
  private readonly toast = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  tiles: DashboardTile[] = TILE_META.map((t) => ({ label: t.label, icon: t.icon, iconColor: t.iconColor, iconBg: t.iconBg, route: t.route, count: 0 }));
  sections: SectionChart[] = [];
  loading = true;

  locationOptions: DropdownOption[] = [...LOCATION_OPTIONS];

  selectedSection: SectionChart | null = null;
  selectedBar: BarDatum | null = null;
  activeTab: EquipmentModalTab = 'status';

  get isEquipmentActive(): boolean {
    return this.selectedBar?.color === 'green';
  }

  savingStatus = false;
  savingMonthly = false;
  savingCumulative = false;

  // Tab 1 — Equipment ON / OFF
  statusForm: FormGroup;

  // Tab 2 — Monthly Book Closing Assistant
  monthlyRowForm: FormGroup;
  monthlyRows: MonthlyRunningHoursRow[] = [];
  monthlyTotalHours: string | null = null;
  recentHistory: EquipmentHistoryItem[] = [];
  loadingHistory = false;

  // Tab 3 — Cumulative Entry
  cumulativeForm: FormGroup;

  readonly monthlyRowsColumnDefs: ColDef[] = [
    { headerName: '#', valueGetter: (params) => (params.node ? params.node.rowIndex! + 1 : ''), flex: 1, minWidth: 60 },
    { headerName: 'Start Time', valueGetter: (p) => (p.data as MonthlyRunningHoursRow)?.start, valueFormatter: (p) => p['value'] ? new Date(p['value'] as string).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '', flex: 1, minWidth: 160 },
    { headerName: 'Stop Time', valueGetter: (p) => (p.data as MonthlyRunningHoursRow)?.stop, valueFormatter: (p) => p['value'] ? new Date(p['value'] as string).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '', flex: 1, minWidth: 160 },
    { headerName: 'Running Hour (HH:MM)', valueGetter: (p) => this.rowRunningHours(p.data as MonthlyRunningHoursRow), flex: 1, minWidth: 160 },
    { headerName: 'Location', field: 'location', flex: 1, minWidth: 140 },
    {
      headerName: 'Action',
      flex: 1,
      minWidth: 100,
      sortable: false,
      filter: false,
      cellRenderer: SpareDeleteRenderer,
      cellRendererParams: {
        onDelete: (row: MonthlyRunningHoursRow) => {
          const idx = this.monthlyRows.indexOf(row);
          if (idx >= 0) this.removeMonthlyRow(idx);
        },
      },
    },
  ];

  readonly recentHistoryColumnDefs: ColDef[] = [
    { headerName: 'Month', field: 'month', flex: 1, minWidth: 110 },
    { headerName: 'Start', field: 'start', flex: 1, minWidth: 110 },
    { headerName: 'Stop', field: 'stop', flex: 1, minWidth: 110 },
    { headerName: 'Duration', field: 'duration', flex: 1, minWidth: 110 },
    { headerName: 'Location', field: 'location', flex: 1, minWidth: 130 },
  ];

  constructor() {
    this.statusForm = this.fb.group({
      started_at_location: ['AT ANCHORAGE', Validators.required],
      start_timedate: [''],
      stop_timedate: [''],
    });

    this.monthlyRowForm = this.fb.group({
      location: ['', Validators.required],
      start_timedate: ['', Validators.required],
      stop_timedate: ['', Validators.required],
    });

    this.cumulativeForm = this.fb.group({
      rhsi: ['', Validators.required],
      rhsi_updated_until: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.loadDashboard();
  }

  private toSectionBars(chart: SectionRhsiBarchartResponse): BarDatum[] {
    return chart.labels.map((label, idx) => ({
      label,
      value: chart.values[idx],
      color: chart.colors[idx],
      id: chart.equipment_ids[idx],
    }));
  }

  private loadDashboard(): void {
    this.loading = true;

    this.call.getEmsThumbnail().subscribe({
      next: (res) => {
        const data = res.data;
        this.tiles = TILE_META.map((t) => ({
          label: t.label,
          icon: t.icon,
          iconColor: t.iconColor,
          iconBg: t.iconBg,
          route: t.route,
          count: (data as unknown as Record<string, number>)[t.key] ?? 0,
        }));
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load EMS thumbnail counts', err),
    });

    this.call.getEmsSubDepartments().subscribe({
      next: (res) => {
        const bucketIds = Object.entries(res.sub_department_name || {}).map(([name, id]) => ({ name, id }));

        if (!bucketIds.length) {
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }

        forkJoin(
          bucketIds.map((s) => this.call.getSubDepartmentRhsiBarchart(s.id)),
        ).subscribe({
          next: (results) => {
            this.sections = results.map((chart, i) => ({
              id: bucketIds[i].id,
              name: chart.section || bucketIds[i].name,
              bars: this.toSectionBars(chart),
            }));
            this.loading = false;
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Failed to load sub-department RHSI charts', err);
            this.loading = false;
            this.cdr.detectChanges();
          },
        });
      },
      error: (err) => {
        console.error('Failed to load EMS sub-departments', err);
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private refreshSection(bucketId: string): void {
    this.call.getSubDepartmentRhsiBarchart(bucketId).subscribe({
      next: (chart) => {
        const section = this.sections.find((s) => s.id === bucketId);
        if (!section) return;

        section.bars = this.toSectionBars(chart);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to refresh sub-department chart', err),
    });
  }

  goTo(route: string): void {
    this.router.navigate(['/afterAuth/op-maintenance/routine/dashboard/', route]);
  }

  onBarClick(section: SectionChart, bar: BarDatum): void {
    this.selectedSection = section;
    this.selectedBar = bar;
    this.activeTab = 'status';

    const isActive = bar.color === 'green';

    this.statusForm.reset({
      started_at_location: 'AT ANCHORAGE',
      start_timedate: '',
      stop_timedate: '',
    });

    this.monthlyRowForm.reset({ location: '', start_timedate: '', stop_timedate: '' });
    this.monthlyRows = [];
    this.monthlyTotalHours = null;

    this.cumulativeForm.reset({ rhsi: '', rhsi_updated_until: '' });
    if (isActive) {
      this.cumulativeForm.get('rhsi')?.disable();
    } else {
      this.cumulativeForm.get('rhsi')?.enable();
    }

    this.loadStateChangeDetail(bar.id);
  }

  private loadStateChangeDetail(equipmentId: string | number | undefined): void {
    if (equipmentId === undefined) {
      this.recentHistory = [];
      this.locationOptions = [...LOCATION_OPTIONS];
      return;
    }

    this.loadingHistory = true;
    this.cdr.detectChanges();

    this.call.getEmsStateChangeDetail(Number(equipmentId)).subscribe({
      next: (res) => {
        if (res?.form_options?.location_choices?.length) {
          this.locationOptions = res.form_options.location_choices.map((c) => ({
            label: c.label,
            value: c.value,
          }));
        } else {
          this.locationOptions = [...LOCATION_OPTIONS];
        }

        const currentLocation =
          res?.form_options?.current_location ||
          res?.equipment_detail?.started_at_location ||
          this.locationOptions[0]?.value ||
          'AT ANCHORAGE';

        this.statusForm.patchValue({
          started_at_location: currentLocation,
        });

        this.recentHistory = res?.history ?? [];
        this.loadingHistory = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadHistoryFallback(equipmentId);
      },
    });
  }

  private loadHistoryFallback(equipmentId: string | number): void {
    this.locationOptions = [...LOCATION_OPTIONS];
    this.call.getEmsEquipmentHistory(Number(equipmentId)).subscribe({
      next: (res) => {
        this.recentHistory = res.history ?? [];
        this.loadingHistory = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.recentHistory = [];
        this.loadingHistory = false;
        this.cdr.detectChanges();
      },
    });
  }

  setTab(tab: EquipmentModalTab): void {
    this.activeTab = tab;
  }

  closeEquipmentModal(): void {
    this.selectedSection = null;
    this.selectedBar = null;
    this.monthlyRows = [];
    this.monthlyTotalHours = null;
    this.recentHistory = [];
    this.locationOptions = [...LOCATION_OPTIONS];
    this.savingStatus = false;
    this.savingMonthly = false;
    this.savingCumulative = false;
  }

  // ---- Tab 1: Equipment ON / OFF ----

  saveStatusChange(): void {
    if (this.statusForm.invalid || !this.selectedBar) {
      this.statusForm.markAllAsTouched();
      return;
    }

    const equipmentId = this.selectedBar.id;
    if (equipmentId === undefined) {
      return;
    }

    const isActive = this.isEquipmentActive;
    const newState = isActive ? 'INACTIVE' : 'ACTIVE';
    const value = this.statusForm.value;

    if (isActive && !value.stop_timedate) {
      this.toast.error('EQ Stop Time is required to switch this equipment OFF.');
      return;
    }
    if (!isActive && !value.start_timedate) {
      this.toast.error('EQ Start Time is required to switch this equipment ON.');
      return;
    }

    const sectionId = this.selectedSection?.id;
    this.savingStatus = true;
    this.cdr.detectChanges();
    this.call
      .updateEmsEquipmentState({
        equipment_id: Number(equipmentId),
        state: newState,
        started_at_location: value.started_at_location as EmsEquipmentLocation,
        start_timedate: isActive ? null : value.start_timedate,
        stop_timedate: isActive ? value.stop_timedate : null,
      })
      .subscribe({
        next: (res) => {
          this.savingStatus = false;
          this.toast.success(res?.message ?? 'Equipment status updated successfully.');
          this.closeEquipmentModal();
          if (sectionId !== undefined) {
            this.refreshSection(sectionId);
          }
          this.cdr.detectChanges();
        },
        error: (err: { error?: { message?: string } }) => {
          this.savingStatus = false;
          this.toast.error(err?.error?.message ?? 'Failed to update equipment status.');
          this.cdr.detectChanges();
        },
      });
  }

  // ---- Tab 2: Monthly Book Closing Assistant ----

  addMonthlyRow(): void {
    if (this.monthlyRowForm.invalid) {
      this.monthlyRowForm.markAllAsTouched();
      return;
    }

    const value = this.monthlyRowForm.value;
    this.monthlyRows = [
      ...this.monthlyRows,
      {
        start: value.start_timedate,
        stop: value.stop_timedate,
        location: value.location as EmsEquipmentLocation,
      },
    ];
    this.monthlyRowForm.reset({ location: '', start_timedate: '', stop_timedate: '' });
    this.monthlyTotalHours = null;
    this.cdr.detectChanges();
  }

  removeMonthlyRow(index: number): void {
    this.monthlyRows = this.monthlyRows.filter((_, i) => i !== index);
    this.monthlyTotalHours = null;
    this.cdr.detectChanges();
  }

  rowRunningHours(row: MonthlyRunningHoursRow): string {
    const start = new Date(row.start).getTime();
    const stop = new Date(row.stop).getTime();
    if (Number.isNaN(start) || Number.isNaN(stop) || stop <= start) {
      return '--:--';
    }
    const totalMinutes = Math.round((stop - start) / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}`;
  }

  calculateRhsi(): void {
    if (!this.monthlyRows.length) {
      this.toast.error('Add at least one row to calculate RHSI.');
      return;
    }

    let totalMinutes = 0;
    for (const row of this.monthlyRows) {
      const start = new Date(row.start).getTime();
      const stop = new Date(row.stop).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(stop) && stop > start) {
        totalMinutes += Math.round((stop - start) / 60000);
      }
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    this.monthlyTotalHours = `${hours}:${String(minutes).padStart(2, '0')}`;
    this.cdr.detectChanges();
  }

  saveMonthlyEntries(): void {
    if (!this.selectedBar || !this.monthlyRows.length) {
      this.toast.error('Add at least one row before saving.');
      return;
    }

    const equipmentId = this.selectedBar.id;
    if (equipmentId === undefined) {
      return;
    }

    const sectionId = this.selectedSection?.id;
    this.savingMonthly = true;
    this.cdr.detectChanges();

    this.call
      .saveEmsMonthlyRunningHours({
        equipment_id: Number(equipmentId),
        rows: this.monthlyRows,
      })
      .subscribe({
        next: (res) => {
          this.savingMonthly = false;
          this.toast.success(res?.message ?? 'Running hour log saved successfully.');
          this.closeEquipmentModal();
          if (sectionId !== undefined) {
            this.refreshSection(sectionId);
          }
          this.cdr.detectChanges();
        },
        error: (err: { error?: { message?: string } }) => {
          this.savingMonthly = false;
          this.toast.error(err?.error?.message ?? 'Failed to save running hour log.');
          this.cdr.detectChanges();
        },
      });
  }

  private formatHhmm(raw: unknown): string {
    let value = String(raw ?? '').trim().replace(/[^0-9:]/g, '');
    if (!value) {
      return '0:00';
    }

    // Auto-format shorthand: "8" -> "8:00"
    if (/^\d+$/.test(value)) {
      value = value + ':00';
    }
    // Auto-format shorthand: "8:" -> "8:00"
    if (/^\d+:$/.test(value)) {
      value = value + '00';
    }
    // Auto-format shorthand: "8:9" -> "8:09"
    if (/^\d+:\d$/.test(value)) {
      const parts = value.split(':');
      value = parts[0] + ':0' + parts[1];
    }

    return value;
  }

  private hhmmToHours(hhmm: string): number {
    const formatted = this.formatHhmm(hhmm);
    const parts = formatted.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return Number((hours + minutes / 60).toFixed(2));
  }

  // ---- Tab 3: Cumulative Entry ----

  onRhsiBlur(): void {
    const rawRhsi = this.cumulativeForm.get('rhsi')?.value;
    if (rawRhsi) {
      const formattedHhmm = this.formatHhmm(rawRhsi);
      this.cumulativeForm.patchValue({ rhsi: formattedHhmm });
    }
  }

  saveCumulativeHours(): void {
    if (this.cumulativeForm.invalid || !this.selectedBar) {
      this.cumulativeForm.markAllAsTouched();
      return;
    }

    if (this.isEquipmentActive) {
      this.toast.error('Equipment must be OFF to enter cumulative hours.');
      return;
    }

    const equipmentId = this.selectedBar.id;
    if (equipmentId === undefined) {
      return;
    }

    const sectionId = this.selectedSection?.id;
    const rawRhsi = this.cumulativeForm.value.rhsi;
    const formattedHhmm = this.formatHhmm(rawRhsi);
    // Update the form control with the normalized HH:MM format
    this.cumulativeForm.patchValue({ rhsi: formattedHhmm }, { emitEvent: false });

    const rhsiDecimalHours = this.hhmmToHours(formattedHhmm);
    this.savingCumulative = true;
    this.cdr.detectChanges();

    this.call
      .updateEmsTotalRunningHours({
        equipment: Number(equipmentId),
        rhsi: rhsiDecimalHours,
        rhsi_updated_until: this.cumulativeForm.value.rhsi_updated_until,
      })
      .subscribe({
        next: (res) => {
          this.savingCumulative = false;
          this.toast.success(res?.message ?? 'Cumulative running hours updated successfully.');
          this.closeEquipmentModal();
          if (sectionId !== undefined) {
            this.refreshSection(sectionId);
          }
          this.cdr.detectChanges();
        },
        error: (err: { error?: { message?: string } }) => {
          this.savingCumulative = false;
          this.toast.error(err?.error?.message ?? 'Failed to update cumulative running hours.');
          this.cdr.detectChanges();
        },
      });
  }
}
