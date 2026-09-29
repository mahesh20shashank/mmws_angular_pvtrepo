
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ColDef } from 'ag-grid-community';
import { MasterCard } from '../../../../refit-maintenance/master-card/master-card';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { RasApiService } from '../../services/ras-api.service';
import { FuellingDetails, FuellingLocation, RasHistoryRow } from '../../models/ras.model';

function toRow(fd: FuellingDetails, index: number): RasHistoryRow {
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
  };
}

// Mirrors Django's tank/ras_monitor_history.html — completed fuelling evolutions.
@Component({
  selector: 'app-ras-history',
  standalone: true,
  imports: [CommonModule, FormsModule, MasterCard, DataGrid],
  templateUrl: './ras-history.html',
  styleUrl: './ras-history.css',
})
export class RasHistory implements OnInit {
  private readonly api = inject(RasApiService);

  rows: RasHistoryRow[] = [];

  readonly columnDefs: ColDef[] = [
    { headerName: 'Ser No.', field: 'ser', flex: 1, minWidth: 90 },
    { headerName: 'Fuelling Start Details', field: 'fuellingStart', flex: 1, minWidth: 170 },
    { headerName: 'Fuelling Stop Details', field: 'fuellingStop', flex: 1, minWidth: 170 },
    { headerName: 'Fuelling Location', field: 'location', flex: 1, minWidth: 140, valueFormatter: (p) => (p['value'] === 'AT_SEA' ? 'At Sea' : 'At Harbour') },
    { headerName: 'Fuel Received From/At', field: 'receivedFromAt', flex: 1, minWidth: 170 },
    { headerName: 'Fuel Received (in tons)', field: 'receivedFuel', flex: 1, minWidth: 170 },
    { headerName: 'Fuelling Rate (TPH)', field: 'fuellingRateTph', flex: 1, minWidth: 150 },
    {
      headerName: 'Action',
      field: 'id',
      flex: 1,
      minWidth: 100,
      sortable: false,
      cellRenderer: () => `<button type="button" class="text-[#1D96E9] underline text-xs">View</button>`,
    },
  ];

  startDateFrom = '';
  startDateTo = '';
  locationFilter: FuellingLocation | '' = '';

  ngOnInit(): void {
    this.api.getFuellingHistory().subscribe((res) => {
      this.rows = res.fuelling_history.map((fd, index) => toRow(fd, index));
    });
  }

  filteredRows(): RasHistoryRow[] {
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
    this.startDateFrom = '';
    this.startDateTo = '';
    this.locationFilter = '';
  }
}
