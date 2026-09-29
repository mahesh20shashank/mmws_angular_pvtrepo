import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CellCallbackParams, ColDef } from 'ag-grid-community';
import { Subject, debounceTime } from 'rxjs';

import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { SelectInput } from '../../../../../shared/components/select-input/select-input';
import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';
import { HelpGuidance } from '../../../../../shared/components/help-guidance/help-guidance';

const HELP_HTML = `
  <p class="mb-0">Lists the equipment running-hours history matching your search, showing when each equipment was started and stopped and how many hours it ran.</p>
`;

export interface EquipmentRunningRow {
  pk: number | string;
  month: string;
  equipmentStartedAt: string;
  equipmentName: string;
  hoursRun: number | string;
  equipmentStartTime: string;
  equipmentStopTime: string;
  entryCreationDate: string;
  createdBy?: string;
}

interface EquipmentRunningApiItem {
  pk?: number | string;
  id?: number | string;
  month: string;
  start_location?: string;
  started_at_location?: string;
  equipment_started_at?: string;
  equipment_name?: string;
  equipment_nomenclature?: string;
  hours_run?: number | string;
  start_time?: string;
  equipment_start_time?: string;
  stop_time?: string;
  equipment_stop_time?: string;
  entry_created_on?: string;
  entry_creation_date?: string;
  created_on?: string;
  created_by?: string;
}

interface EquipmentRunningApiResponse {
  result?: EquipmentRunningApiItem[];
  months?: string[];
  equipments?: string[];
}

@Component({
  selector: 'app-search-equipment-running-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DataGrid,
    SelectInput,
    HelpGuidance, ButtonComponent],
  templateUrl: './search-equipment-running-history.html',
  styleUrl: './search-equipment-running-history.scss',
})
export class SearchEquipmentRunningHistory implements OnInit {
  readonly helpHtml = HELP_HTML;

  private readonly call = inject(OperationalMaintenanceApi);

  /* ------------------------------------------------------------------ */
  /*  Filter state                                                         */
  /* ------------------------------------------------------------------ */
  selectedMonth = 'All';
  selectedEquipment = 'All';
  searchText = '';

  monthOptions = [
    { label: 'All', value: 'All' }
  ];

  equipmentOptions = [
    { label: 'All', value: 'All' }
  ];

  private readonly filtersChanged = new Subject<void>();

  /* ------------------------------------------------------------------ */
  /*  Column definitions                                                   */
  /* ------------------------------------------------------------------ */
  columnDefs: ColDef[] = [
    {
      headerName: 'PK',
      field: 'pk',
      flex: 0.8,
      minWidth: 80
    },
    {
      headerName: 'Month',
      field: 'month',
      flex: 1.2,
      minWidth: 140
    },
    {
      headerName: 'Equipment Started at',
      field: 'equipmentStartedAt',
      flex: 1.5,
      minWidth: 180
    },
    {
      headerName: 'Equipment Name',
      field: 'equipmentName',
      flex: 2,
      minWidth: 250
    },
    {
      headerName: 'Hours Run',
      field: 'hoursRun',
      flex: 1,
      minWidth: 120,
      valueFormatter: (params: CellCallbackParams) => {
        const val = params['value'];
        return val != null && val !== '' ? `${val} hrs` : 'NA';
      }
    },
    {
      headerName: 'Equipment Start Time',
      field: 'equipmentStartTime',
      flex: 1.8,
      minWidth: 200
    },
    {
      headerName: 'Equipment Stop Time*',
      field: 'equipmentStopTime',
      flex: 1.8,
      minWidth: 200
    },
    {
      headerName: 'Entry Creation Date',
      field: 'entryCreationDate',
      flex: 1.8,
      minWidth: 200
    }
  ];

  filteredRows = signal<EquipmentRunningRow[]>([]);
  readonly isLoading = signal(false);

  loadEquipmentRunningHistory(): void {

    this.isLoading.set(true);
    this.call
      .getEquipmentRunningHistory({
        equipment: this.selectedEquipment,
        month: this.selectedMonth,
        search: this.searchText.trim(),
      })
      .subscribe({
        next: (raw: unknown) => {
          const res = raw as EquipmentRunningApiResponse;

          this.filteredRows.set(
            (res.result || []).map((item: EquipmentRunningApiItem) => ({
              pk: item.pk ?? item.id ?? 'NA',
              month: item.month ?? '',
              equipmentStartedAt: item.equipment_started_at ?? item.started_at_location ?? item.start_location ?? 'NA',
              equipmentName: item.equipment_name ?? item.equipment_nomenclature ?? '',
              hoursRun: item.hours_run ?? 0,
              equipmentStartTime: item.equipment_start_time ?? item.start_time ?? 'NA',
              equipmentStopTime: item.equipment_stop_time ?? item.stop_time ?? 'NA',
              entryCreationDate: item.entry_creation_date ?? item.entry_created_on ?? item.created_on ?? 'NA',
              createdBy: item.created_by
            }))
          );

          this.monthOptions = [
            { label: 'All', value: 'All' },
            ...(res.months || []).map((month: string) => ({
              label: month,
              value: month
            }))
          ];

          this.equipmentOptions = [
            { label: 'All', value: 'All' },
            ...(res.equipments || []).map((equipment: string) => ({
              label: equipment,
              value: equipment
            }))
          ];
        },

        error: (err: HttpErrorResponse) => {
          console.error('Equipment Running History API Error', err);
          this.filteredRows.set([]);
          this.isLoading.set(false);
        },

        complete: () => {
          this.isLoading.set(false);
        }
      });

  }

  ngOnInit(): void {
    this.loadEquipmentRunningHistory();

    // Backend does the filtering — debounce so typing/dropdown changes don't
    // fire a request per keystroke/click.
    this.filtersChanged
      .pipe(debounceTime(300))
      .subscribe(() => this.loadEquipmentRunningHistory());
  }

  onFilterChange(): void {
    this.filtersChanged.next();
  }

  onSearchChange(): void {
    this.filtersChanged.next();
  }

  clearFilters(): void {
    this.selectedMonth = 'All';
    this.selectedEquipment = 'All';
    this.searchText = '';
    this.loadEquipmentRunningHistory();
  }
}
