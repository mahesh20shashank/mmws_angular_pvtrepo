import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, OnInit, AfterViewChecked, DestroyRef, ElementRef, ViewChild, Renderer2, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectInput } from '../../../../../shared/components/select-input/select-input';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { GridDateCell } from '../../../../../shared/components/data-grid/grid-date-cell';
import { GridTextCell } from '../../../../../shared/components/data-grid/grid-text-cell';
import { GridActionButton } from '../../../../../shared/components/data-grid/grid-action-button/grid-action-button';
import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { RowData } from 'ag-grid-community';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';

interface SubDepartmentDto {
  id: number;
  name: string;
}

interface RoutineInitListItem {
  pk: number;
  equipment_name: string;
  equipment_code: string;
  maintop_no: string;
  eq_count: number;
  routine_count: number;
  sub_routine_count: number;
  dyd_routine_count: number;
}

interface RoutineInitListResponse {
  result: RoutineInitListItem[];
  filter_options?: {
    sub_departments?: SubDepartmentDto[];
  };
}

interface RoutineRow {
  id: number;
  equipmentName: string;
  equipmentCode: string;
  maintopNo: string;
  eqCount: number;
  routineCount: number;
  subRoutineCount: number;
  dydRoutineCount: number;
}

interface RoutineInitDetailDto {
  pk: number;
  maintop_no: string;
  category: string;
  dart_number: string;
  routine_no: string;
  frequency: string;
  description: string;
  lst_completed_date: string;
  lst_completed_rh: string;
}

interface RoutineInitDetailResponse {
  status: string;
  data: RoutineInitDetailDto[];
  equipment: string;
  routine_type: string;
}

interface DetailRow extends RoutineInitDetailDto {
  completionDate: string;
  undertakenRh: string;
  saving: boolean;
}

@Component({
  selector: 'app-one-time-routine',
  imports: [CommonModule, FormsModule, SelectInput, DataGrid, ModalComponent, ButtonComponent, IconComponent],
  templateUrl: './one-time-routine.html',
  styleUrl: './one-time-routine.css',
})
export class OneTimeRoutine implements OnInit, AfterViewChecked {
  private call = inject(OperationalMaintenanceApi);
  private renderer = inject(Renderer2);
  private document = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);

  @ViewChild('modalHost') modalHost?: ElementRef<HTMLElement>;
  private modalMovedToBody = false;

  // API-bound state
  readonly rowData = signal<RoutineRow[]>([]);
  readonly subDepartmentOptions = signal<{ label: string; value: number }[]>([]);
  readonly detailRows = signal<DetailRow[]>([]);
  readonly detailEquipment = signal('');
  readonly detailRoutineType = signal('');

  // UI state
  readonly selectedSubDepartmentId = signal<number | null>(null);
  readonly searchTerm = signal('');
  readonly showDetailModal = signal(false);
  readonly detailLoading = signal(false);
  readonly isLoading = signal(false);
  readonly activeRow = signal<RoutineRow | null>(null);

  private readonly searchTermChanges = new Subject<string>();

  columnDefs = [
    { headerName: 'Equipment Name', field: 'equipmentName', minWidth: 260 },
    { headerName: 'Equipment Code', field: 'equipmentCode', minWidth: 180 },
    { headerName: 'Maintop No', field: 'maintopNo', minWidth: 160 },
    { headerName: 'Equipment Count', field: 'eqCount', minWidth: 160 },
    { headerName: 'Routine Count', field: 'routineCount', minWidth: 160 },
    { headerName: 'Sub Routine Count', field: 'subRoutineCount', minWidth: 180 },
    { headerName: 'DYD Routine Count', field: 'dydRoutineCount', minWidth: 180 },
  ];

  readonly detailColumnDefs = [
    { headerName: 'Maintop No', field: 'maintop_no', minWidth: 110, flex: 1 },
    { headerName: 'Dart Number', field: 'dart_number', minWidth: 110, flex: 1 },
    { headerName: 'Routine No', field: 'routine_no', minWidth: 110, flex: 1 },
    { headerName: 'Frequency', field: 'frequency', minWidth: 90, flex: 0.7 },
    { headerName: 'Description', field: 'description', minWidth: 200, flex: 1.6 },
    {
      headerName: 'Completion Date',
      field: 'completionDate',
      minWidth: 150,
      flex: 1.1,
      cellRenderer: GridDateCell,
      cellRendererParams: {
        onValueChange: (row: RowData, _field: string, newValue: unknown) =>
          this.onCompletionDateChange((row as unknown as DetailRow).pk, String(newValue ?? '')),
      },
    },
    {
      headerName: 'Undertaken RH',
      field: 'undertakenRh',
      minWidth: 120,
      flex: 1,
      cellRenderer: GridTextCell,
      cellRendererParams: {
        onValueChange: (row: RowData, _field: string, newValue: unknown) =>
          this.onUndertakenRhChange((row as unknown as DetailRow).pk, String(newValue ?? '')),
      },
    },
    {
      headerName: '',
      field: 'saving',
      minWidth: 90,
      width: 90,
      sortable: false,
      pinned: 'right',
      cellRenderer: GridActionButton,
      cellRendererParams: {
        label: 'Save',
        disabled: (row: RowData) => !!(row as unknown as DetailRow).saving,
        onEdit: (row: RowData) => this.saveDetailRow(row as unknown as DetailRow),
      },
    },
  ];

  ngOnInit(): void {
    this.searchTermChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadRoutineList());

    this.loadRoutineList();
  }

  ngAfterViewChecked(): void {
    if (this.showDetailModal() && this.modalHost && !this.modalMovedToBody) {
      this.renderer.appendChild(this.document.body, this.modalHost.nativeElement);
      this.modalMovedToBody = true;
    }
    if (!this.showDetailModal()) {
      this.modalMovedToBody = false;
    }
  }

  onSubDepartmentChange(value: number | null): void {
    this.selectedSubDepartmentId.set(value);
    this.loadRoutineList();
  }

  onSearchTermChange(value: string): void {
    this.searchTerm.set(value);
    this.searchTermChanges.next(value);
  }

  clearFilters(): void {
    this.selectedSubDepartmentId.set(null);
    this.searchTerm.set('');
    this.loadRoutineList();
  }

  loadRoutineList(): void {
    const params: Record<string, string | number> = {};
    const subDepartmentId = this.selectedSubDepartmentId();
    const search = this.searchTerm().trim();

    if (subDepartmentId) {
      params['sub_department'] = subDepartmentId;
    }
    if (search) {
      params['search'] = search;
    }

    this.isLoading.set(true);
    this.call.getOnetimeRoutineList(params).subscribe({
      next: (response: unknown) => {
        const data = response as RoutineInitListResponse;
        this.rowData.set(
          (data.result || []).map((item: RoutineInitListItem) => ({
            id: item.pk,
            equipmentName: item.equipment_name,
            equipmentCode: item.equipment_code,
            maintopNo: item.maintop_no,
            eqCount: item.eq_count,
            routineCount: item.routine_count,
            subRoutineCount: item.sub_routine_count,
            dydRoutineCount: item.dyd_routine_count,
          }))
        );
        this.subDepartmentOptions.set(
          (data.filter_options?.sub_departments || [])
            .filter((item: SubDepartmentDto) => item.name !== '')
            .map((item: SubDepartmentDto) => ({
              label: item.name,
              value: item.id,
            }))
        );
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('Error loading routines:', error);
        this.isLoading.set(false);
      },
    });
  }

  onRowClicked(data: RowData): void {
    const row = data as unknown as RoutineRow;
    this.activeRow.set(row);
    this.showDetailModal.set(true);
    this.loadRoutineDetails(row.id);
  }

  loadRoutineDetails(id: number): void {
    this.detailLoading.set(true);
    this.detailRows.set([]);
    this.call.getRoutineInitDetails(id).subscribe({
      next: (response: unknown) => {
        const data = response as RoutineInitDetailResponse;
        this.detailEquipment.set(data.equipment || '');
        this.detailRoutineType.set(data.routine_type || '');
        this.detailRows.set(
          (data.data || []).map((item: RoutineInitDetailDto) => ({
            ...item,
            completionDate: item.lst_completed_date && item.lst_completed_date !== '-' ? item.lst_completed_date : '',
            undertakenRh: item.lst_completed_rh && item.lst_completed_rh !== '-' ? item.lst_completed_rh : '',
            saving: false,
          }))
        );
        this.detailLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('Error loading routine details:', error);
        this.detailLoading.set(false);
      },
    });
  }

  saveDetailRow(row: DetailRow): void {
    this.updateDetailRow(row.pk, { saving: true });
    this.call
      .saveRoutineInit({
        routine_id: row.pk,
        completion_date: row.completionDate || null,
        undertaken_rh: row.undertakenRh || null,
      })
      .subscribe({
        next: () => {
          this.loadRoutineList();
          this.closeDetailModal();
        },
        error: (error: unknown) => {
          console.error('Error saving routine:', error);
          this.updateDetailRow(row.pk, { saving: false });
        },
      });
  }

  onCompletionDateChange(pk: number, value: string): void {
    this.updateDetailRow(pk, { completionDate: value });
  }

  onUndertakenRhChange(pk: number, value: string): void {
    this.updateDetailRow(pk, { undertakenRh: value });
  }

  private updateDetailRow(pk: number, patch: Partial<DetailRow>): void {
    this.detailRows.update((rows) => rows.map((r) => (r.pk === pk ? { ...r, ...patch } : r)));
  }

  closeDetailModal(): void {
    this.showDetailModal.set(false);
    this.activeRow.set(null);
    this.detailRows.set([]);
  }
}
