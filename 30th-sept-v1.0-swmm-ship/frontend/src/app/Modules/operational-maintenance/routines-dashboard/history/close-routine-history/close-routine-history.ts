import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ColDef } from 'ag-grid-community';
import { Subject, debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';

import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';
import { HelpGuidance } from '../../../../../shared/components/help-guidance/help-guidance';

const HELP_HTML = `
  <p class="mb-0">Lists routines that have been closed, with DART number, equipment, routine details and whether spares were requested. Use the column search boxes to filter the list.</p>
`;

export interface CloseRoutineRow {
  maintopsNo: string;
  dartNo: string;
  equipmentName: string;
  status: string;
  routineName: string;
  routineNo: string;
  sparedRequested: string;
}

interface ClosedRoutineApiItem {
  maintop_no?: string;
  dart_no?: string;
  equipment_name?: string;
  status?: string;
  routine_name?: string;
  routine_no?: string;
  spare_requested?: boolean;
}

export interface ClosedRoutineApiResponse {
  data: ClosedRoutineApiItem[];
}

@Component({
  selector: 'app-close-routine-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DataGrid,
    HelpGuidance, ButtonComponent],
  templateUrl: './close-routine-history.html',
  styleUrl: './close-routine-history.scss',
})
export class CloseRoutineHistory implements OnInit {
  readonly helpHtml = HELP_HTML;

  private callService = inject(OperationalMaintenanceApi);


  /* ------------------------------------------------------------------ */
  /*  Search state                                                         */
  /* ------------------------------------------------------------------ */
  searchText = signal('');
  private readonly searchChanged = new Subject<string>();

  onSearchChange(value: string): void {
    this.searchText.set(value);
    this.searchChanged.next(value);
  }

  /* ------------------------------------------------------------------ */
  /*  Column definitions                                                   */
  /* ------------------------------------------------------------------ */
  columnDefs: ColDef[] = [
    {
      headerName: 'Maintops No.',
      field: 'maintopsNo',
      sortable: true,
      flex: 1,
      minWidth: 140,
    },
    {
      headerName: 'DART No.',
      field: 'dartNo',
      sortable: true,
      flex: 1,
      minWidth: 140,
    },
    {
      headerName: 'Equipment Name',
      field: 'equipmentName',
      sortable: true,
      flex: 1,
      minWidth: 170,
    },
    {
      headerName: 'Status',
      field: 'status',
      sortable: true,
      flex: 1,
      minWidth: 110,
    },
    {
      headerName: 'Routine Name',
      field: 'routineName',
      sortable: true,
      flex: 2,
      minWidth: 180,
    },
    {
      headerName: 'Routine No.',
      field: 'routineNo',
      sortable: true,
      flex: 1,
      minWidth: 130,
    },
    {
      headerName: 'Spared Requested',
      field: 'sparedRequested',
      sortable: true,
      flex: 1,
      minWidth: 170,
    },
  ];

  /* ------------------------------------------------------------------ */
  /*  Row data                                                             */
  /* ------------------------------------------------------------------ */
  filteredRows = signal<CloseRoutineRow[]>([]);

  /* ------------------------------------------------------------------ */
  /*  Loading state                                                        */
  /* ------------------------------------------------------------------ */
  readonly isLoading = signal(false);

  /* ------------------------------------------------------------------ */
  /*  CMMS sync                                                            */
  /* ------------------------------------------------------------------ */
  readonly syncingCmms = signal(false);

  // Pushes closed routines (dart/models.py CompletedRoutine rows, the same
  // records this screen lists) to CMMS — updates the existing planned-routine
  // DART row in T_Dart (Is_Routine = 1) to closed. Success/error toasts come
  // from the global feedbackInterceptor.
  async syncWithCmms(): Promise<void> {
    if (this.syncingCmms()) return;

    this.syncingCmms.set(true);
    try {
      await firstValueFrom(this.callService.syncCompletedRoutines());
      this.loadClosedRoutineHistory(this.searchText());
    } catch (err: unknown) {
      console.error('Closed routine CMMS sync failed.', err);
    } finally {
      this.syncingCmms.set(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                            */
  /* ------------------------------------------------------------------ */
  ngOnInit(): void {
    this.loadClosedRoutineHistory();

    // Backend does the filtering — debounce so typing doesn't fire a
    // request per keystroke.
    this.searchChanged.pipe(debounceTime(300), distinctUntilChanged()).subscribe((search) => {
      this.loadClosedRoutineHistory(search);
    });
  }
  loadClosedRoutineHistory(search?: string): void {

    this.isLoading.set(true);
    this.callService.getClosedRoutineHistory(search).subscribe({
      next: (response: ClosedRoutineApiResponse) => {

        const rows: CloseRoutineRow[] = (response?.data || []).map(item => ({
          maintopsNo: item.maintop_no ?? '',
          dartNo: item.dart_no ?? '-',
          equipmentName: item.equipment_name ?? '',
          status: item.status ?? '',
          routineName: item.routine_name ?? '',
          routineNo: item.routine_no ?? '',
          sparedRequested: item.spare_requested ? 'Yes' : 'No'
        }));

        this.filteredRows.set(rows);
      },

      error: (err: HttpErrorResponse) => {
        console.error('Closed Routine History API Error', err);
        this.filteredRows.set([]);
      },

      complete: () => {
        this.isLoading.set(false);
      }
    });
  }
}
