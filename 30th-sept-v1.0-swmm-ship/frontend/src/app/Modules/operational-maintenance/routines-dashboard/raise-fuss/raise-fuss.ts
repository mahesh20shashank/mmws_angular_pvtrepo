import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { MasterCard } from '../../../refit-maintenance/master-card/master-card';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ColDef, CellCallbackParams } from 'ag-grid-community';
import { OperationalMaintenanceApi } from '../../services/operational-maintenance-api';
import { DataGrid } from '../../../../shared/components/data-grid/data-grid';
import { GridStatusChipRenderer } from '../../../../shared/components/data-grid/grid-status-chip-renderer';
import { ExportKind, ExportToolbar } from '../../../../shared/components/export-toolbar/export-toolbar';
import { PrintColumn, ReportExportService } from '../../../../Core/services/export/generic-export.service';

const RAISE_FUSS_PRINT_COLUMNS: PrintColumn[] = [
  { header: 'Sub Dept', field: 'subDept' },
  { header: 'Equipment Nomenclature', field: 'equipmentNomenclature' },
  { header: 'Routine Name', field: 'routineName' },
  { header: 'Status', field: 'status' },
  { header: 'Previous Routine', field: 'previousRoutineDate' },
];

interface FussRaisedRow {
  id: number;
  subDept: string;
  equipmentNomenclature: string;
  routineName: string;
  status: string;
  previousRoutineDate: string;
}

@Component({
  selector: 'app-raise-fuss',
  standalone: true,
  imports: [CommonModule, MasterCard, IconComponent, ExportToolbar, DataGrid],
  templateUrl: './raise-fuss.html',
  styleUrl: './raise-fuss.css',
})
export class RaiseFUSS implements OnInit {
  private router = inject(Router);
  private call = inject(OperationalMaintenanceApi);
  private cdr = inject(ChangeDetectorRef);
  private exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly columnDefs: ColDef[] = [
    { headerName: 'Sub Dept', field: 'subDept', flex: 1, minWidth: 120 },
    { headerName: 'Equipment Nomenclature', field: 'equipmentNomenclature', flex: 1, minWidth: 200 },
    { headerName: 'Routine Name', field: 'routineName', flex: 1, minWidth: 150 },
    {
      headerName: 'Status',
      field: 'status',
      flex: 1,
      minWidth: 110,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: {} },
    },
    { headerName: 'Previous Routine', field: 'previousRoutineDate', flex: 1, minWidth: 150 },
    {
      headerName: 'Actions',
      field: 'id',
      flex: 1,
      minWidth: 150,
      sortable: false,
      cellRenderer: () =>
        `<button type="button" class="h-8 min-w-[120px] px-4 rounded-lg bg-white/15 border border-white/10 text-white text-[13px] whitespace-nowrap">Close Routine</button>`,
      onCellClicked: (event: CellCallbackParams) => this.navigateToCloseRoutine((event.data as FussRaisedRow).id),
    },
  ];

  maintopRoutines: FussRaisedRow[] = [];
  searchText = '';
  private readonly searchChanged = new Subject<string>();

  ngOnInit(): void {
    this.loadRoutines();

    this.searchChanged.pipe(debounceTime(300), distinctUntilChanged()).subscribe((search) => {
      this.loadRoutines(search);
    });
  }

  private loadRoutines(search?: string): void {
    this.call.getFUSSRaisedRoutines({ search }).subscribe({
      next: (data) => {
        this.maintopRoutines = (data.fuss_list ?? []).map((item) => ({
          id: item.id,
          subDept: item.department ?? '',
          equipmentNomenclature: item.equipment ?? '',
          routineName: item.routine_name ?? '',
          status: item.status ?? '',
          previousRoutineDate: item.due_date ?? 'NA',
        }));
        this.cdr.detectChanges();
      },
      error: (err: unknown) => console.error('Failed to load raised FUSS routines', err),
    });
  }

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.searchChanged.next(this.searchText);
  }

  navigateTo(url: string) {
    this.router.navigateByUrl(url);
  }

  navigateToCloseRoutine(id: number): void {
    this.router.navigate(
      ['/afterAuth/op-maintenance/routine/close-routine'],
      { state: { routineId: id } },
    );
  }

  onExport(kind: ExportKind): void {
    const rows = this.maintopRoutines as unknown as Record<string, unknown>[];
    if (kind === 'excel') {
      this.exportService.downloadCsv(RAISE_FUSS_PRINT_COLUMNS, rows, 'raise-fuss.csv');
      return;
    }
    this.exportService.printRows('Raise FUSS', RAISE_FUSS_PRINT_COLUMNS, rows);
  }
}
