import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ColDef } from 'ag-grid-community';
import { MasterCard } from '../../../../refit-maintenance/master-card/master-card';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { GridStatusChipRenderer } from '../../../../../shared/components/data-grid/grid-status-chip-renderer';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { RasApiService } from '../../services/ras-api.service';
import { TankMastersApiService } from '../../services/tank-masters-api.service';
import { FuellingDetails, FuellingDetailsPayload, FuellingLocation, RasMonitorRow } from '../../models/ras.model';
import { TankCategoryApi } from '../../models/tank-masters.model';

function toRow(fd: FuellingDetails, index: number): RasMonitorRow {
  const location: FuellingLocation = fd.fuelling_at === 'AT_SEA' ? 'AT_SEA' : 'AT_HARBOUR';
  return {
    id: fd.id,
    ser: index + 1,
    fuellingStart: [fd.fuelling_start_date, fd.fuelling_start_time].filter(Boolean).join(' '),
    fuellingStop: [fd.fuelling_stop_date, fd.fuelling_stop_time].filter(Boolean).join(' '),
    location,
    receivedFromAt: location === 'AT_HARBOUR' ? fd.received_at_station : fd.received_from_ship,
    receivedFuel: Number(fd.actual_fuel_received ?? fd.fuel_received ?? 0),
    fuellingRateTph: Number(fd.fuelling_rate ?? 0),
    status: fd.is_fuelling_completed ? 'Completed' : 'In Progress',
  };
}

// Mirrors Django's tank/create_ras_monitor.html — logging RAS/harbour fuelling evolutions.
@Component({
  selector: 'app-ras-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule, MasterCard, ModalComponent, IconComponent, DataGrid, ButtonComponent],
  templateUrl: './ras-monitor.html',
  styleUrl: './ras-monitor.css',
})
export class RasMonitor implements OnInit {
  private readonly toastr = inject(NotificationService);
  private readonly rasApi = inject(RasApiService);
  private readonly mastersApi = inject(TankMastersApiService);

  readonly columnDefs: ColDef[] = [
    { headerName: 'Ser No.', field: 'ser', flex: 1, minWidth: 90 },
    { headerName: 'Fuelling Start Details', field: 'fuellingStart', flex: 1, minWidth: 170 },
    { headerName: 'Fuelling Stop Details', field: 'fuellingStop', flex: 1, minWidth: 170, valueFormatter: (p) => (p['value'] as string) || '—' },
    { headerName: 'Fuelling Location', field: 'location', flex: 1, minWidth: 140, valueFormatter: (p) => (p['value'] === 'AT_SEA' ? 'At Sea' : 'At Harbour') },
    { headerName: 'Fuel Received From/At', field: 'receivedFromAt', flex: 1, minWidth: 170, valueFormatter: (p) => (p['value'] as string) || '—' },
    { headerName: 'Received Fuel', field: 'receivedFuel', flex: 1, minWidth: 130 },
    { headerName: 'Fuelling Rate (TPH)', field: 'fuellingRateTph', flex: 1, minWidth: 150 },
    {
      headerName: 'Status',
      field: 'status',
      flex: 1,
      minWidth: 130,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { Completed: 'success', 'In Progress': 'warning' } },
    },
    {
      headerName: 'Action',
      field: 'id',
      flex: 1,
      minWidth: 100,
      sortable: false,
      cellRenderer: () => `<button type="button" class="text-[#1D96E9] underline text-xs">View</button>`,
    },
  ];

  tankCategories: TankCategoryApi[] = [];

  rows: RasMonitorRow[] = [];

  locationFilter: FuellingLocation | '' = '';
  startDateFrom = '';
  startDateTo = '';

  showCreateModal = false;

  fuellingLocation: FuellingLocation | '' = '';
  startDate = '';
  startTime = '';
  stopDate = '';
  stopTime = '';
  tankCategory: number | null = null;
  fluidInTank = '';
  receivedAtStation = '';
  receivedThrough = '';
  rasShipName = '';
  remarks = '';

  ngOnInit(): void {
    this.loadRows();
    this.mastersApi.getTankCategories().subscribe((res) => {
      this.tankCategories = res.data;
    });
  }

  private loadRows(): void {
    this.rasApi.getFuellingHistory().subscribe((res) => {
      this.rows = res.fuelling_history.map((fd, index) => toRow(fd, index));
    });
  }

  get durationDisplay(): string {
    if (!this.startDate || !this.startTime || !this.stopDate || !this.stopTime) return '';
    const start = new Date(`${this.startDate}T${this.startTime}`);
    const stop = new Date(`${this.stopDate}T${this.stopTime}`);
    const diffMs = stop.getTime() - start.getTime();
    if (diffMs <= 0) return '';
    const hrs = Math.floor(diffMs / 3_600_000);
    const mins = Math.round((diffMs % 3_600_000) / 60_000);
    return `${hrs}h ${mins}m`;
  }

  filteredRows(): RasMonitorRow[] {
    let rows = this.rows;
    if (this.locationFilter) {
      rows = rows.filter((r) => r.location === this.locationFilter);
    }
    if (this.startDateFrom) {
      rows = rows.filter((r) => r.fuellingStart.slice(0, 10) >= this.startDateFrom);
    }
    if (this.startDateTo) {
      rows = rows.filter((r) => r.fuellingStart.slice(0, 10) <= this.startDateTo);
    }
    return rows;
  }

  clearFilters(): void {
    this.locationFilter = '';
    this.startDateFrom = '';
    this.startDateTo = '';
  }

  openCreateModal(): void {
    this.showCreateModal = true;
    this.fuellingLocation = '';
    this.startDate = '';
    this.startTime = '';
    this.stopDate = '';
    this.stopTime = '';
    this.tankCategory = null;
    this.fluidInTank = '';
    this.receivedAtStation = '';
    this.receivedThrough = '';
    this.rasShipName = '';
    this.remarks = '';
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  createRasMonitor(): void {
    if (!this.fuellingLocation || !this.startDate || !this.startTime || this.tankCategory == null || !this.fluidInTank) {
      this.toastr.warning('Fuelling Location, Fuelling Start Date/Time, Tank Category and Fluid in Tank are required.');
      return;
    }
    const payload: FuellingDetailsPayload = {
      fuelling_at: this.fuellingLocation,
      fuelling_start_date: this.startDate,
      fuelling_start_time: this.startTime,
      fuelling_stop_date: this.stopDate || null,
      fuelling_stop_time: this.stopTime || null,
      tank_category: this.tankCategory,
      fluid_in_tank: this.fluidInTank,
      received_at_station: this.fuellingLocation === 'AT_HARBOUR' ? this.receivedAtStation : '',
      received_from_ship: this.fuellingLocation === 'AT_SEA' ? this.rasShipName : '',
      received_through: this.receivedThrough,
      remarks: this.remarks,
      is_fuelling_completed: false,
    };
    this.rasApi.saveFuelling(payload).subscribe(() => {
      this.loadRows();
      this.closeCreateModal();
    });
  }
}
