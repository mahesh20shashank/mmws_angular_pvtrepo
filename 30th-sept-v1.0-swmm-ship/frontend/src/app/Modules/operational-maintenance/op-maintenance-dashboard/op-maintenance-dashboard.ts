import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ColDef } from 'ag-grid-community';
import { DonutChart, DonutSegment } from '../../../shared/components/donut-chart/donut-chart';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../shared/components/modal/modal.component';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { OperationalMaintenanceApi } from '../services/operational-maintenance-api';
import {
  DartDashboardResponse,
  MonthlySeriesRow,
  ShipStatus,
  SubDeptDefectRow,
  SubDeptEquipmentRow,
} from './op-maintenance-dashboard.model';

// Fallback used only when the logged-in user's department can't be resolved,
// matching the convention used elsewhere (e.g. defact-form.ts hardcodes department_id "1").
const FALLBACK_DEPARTMENT_ID = 1;

const SUB_DEPARTMENT_PALETTE = ['#1D74D3', '#7FB8F5', '#C7E1FB', '#E5F1FF', '#F0B98D', '#BF83FF', '#1cc88a'];

const EMPTY_SHIP_STATUS: ShipStatus = {
  status: '-',
  refit_name: null,
  start_date: null,
  end_date: null,
};

@Component({
  selector: 'app-op-maintenance-dashboard',
  standalone: true,
  imports: [CommonModule, DonutChart, IconComponent, ModalComponent, DataGrid, ButtonComponent],
  templateUrl: './op-maintenance-dashboard.html',
  styleUrl: './op-maintenance-dashboard.css',
})
export class OpMaintenanceDashboard implements OnInit {
  private readonly router = inject(Router);
  private readonly opMaintenance = inject(OperationalMaintenanceApi);
  private readonly cdr = inject(ChangeDetectorRef);

  shipStatus: ShipStatus = EMPTY_SHIP_STATUS;
  kpis = { open_darts_ops_count: 0, open_darts_refit_count: 0, due_for_closing_count: 0 };
  openDarts6m: MonthlySeriesRow[] = [];
  closedDarts6m: MonthlySeriesRow[] = [];
  subDeptStatus: SubDeptEquipmentRow[] = [];
  subDepartments: string[] = [];
  subDeptColors: Record<string, string> = {};

  loading = true;
  error: string | null = null;

  selectedSubDept: SubDeptEquipmentRow | null = null;
  selectedSubDeptDefects: SubDeptDefectRow[] = [];

  readonly subDeptDefectColumnDefs: ColDef[] = [
    { headerName: 'DART No.', field: 'dart_number', flex: 1, minWidth: 130 },
    { headerName: 'Equipment Nomenclature', field: 'nomenclature', flex: 1, minWidth: 180 },
    { headerName: 'Category', field: 'category', flex: 1, minWidth: 140 },
    { headerName: 'Defective Since', field: 'defective_since', flex: 1, minWidth: 140 },
  ];

  ngOnInit(): void {
    this.loadDashboard();
  }

  async loadDashboard(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const departmentId = (await this.opMaintenance.getCurrentDepartmentId()) ?? FALLBACK_DEPARTMENT_ID;
      const data = await this.opMaintenance.getDartDashboard(departmentId);
      this.applyDashboard(data);
    } catch (err) {
      this.error = (err as { error?: { error?: string } })?.error?.error ?? 'Failed to load DART dashboard.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private applyDashboard(data: DartDashboardResponse): void {
    this.shipStatus = data.ship_status ?? EMPTY_SHIP_STATUS;
    this.kpis = {
      open_darts_ops_count: data.open_darts_ops_count,
      open_darts_refit_count: data.open_darts_refit_count,
      due_for_closing_count: data.due_for_closing_count,
    };
    this.openDarts6m = data.open_chart_data;
    this.closedDarts6m = data.closed_chart_data;
    this.subDeptStatus = data.sub_dept_equipment_data;
    this.subDepartments = data.sub_depts;
    this.subDeptColors = Object.fromEntries(
      data.sub_depts.map((name, i) => [name, SUB_DEPARTMENT_PALETTE[i % SUB_DEPARTMENT_PALETTE.length]]),
    );
  }

  /** Highest single-department value across both 6-month series, used to scale bar heights. */
  get maxMonthlyValue(): number {
    const all = [...this.openDarts6m, ...this.closedDarts6m];
    return Math.max(1, ...all.flatMap((row) => this.subDepartments.map((d) => Number(row[d] ?? 0))));
  }

  segmentsFor(dept: SubDeptEquipmentRow): DonutSegment[] {
    return [
      { label: 'Operational', value: dept.operational, color: '#22c55e' },
      { label: 'Non-Operational', value: dept.non_operational, color: '#ef4444' },
    ];
  }

  totalEquipment(dept: SubDeptEquipmentRow): number {
    return dept.total;
  }

  async openSubDeptDefects(dept: SubDeptEquipmentRow): Promise<void> {
    this.selectedSubDept = dept;
    this.selectedSubDeptDefects = await this.opMaintenance.getSubDeptDefects(dept.sub_dept);
    this.cdr.detectChanges();
  }

  closeSubDeptDefects(): void {
    this.selectedSubDept = null;
    this.selectedSubDeptDefects = [];
  }

  viewShipStatus(): void {
    this.router.navigate(['/afterAuth/op-maintenance/maintenance-periods']);
  }

  viewOpenDarts(period: 'OPERATIONAL' | 'REFIT'): void {
    this.router.navigate(['/afterAuth/op-maintenance/open-darts'], { queryParams: { maintenance_period: period } });
  }

  viewDueForClosing(): void {
    this.router.navigate(['/afterAuth/op-maintenance/open-darts'], { queryParams: { filter_due: 'overdue' } });
  }
}
