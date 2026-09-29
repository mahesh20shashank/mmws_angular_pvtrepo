import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ColDef, RowData } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';

import { MasterCard } from '../../../../refit-maintenance/master-card/master-card';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { GridTextCell } from '../../../../../shared/components/data-grid/grid-text-cell';
import { GridSelectCell } from '../../../../../shared/components/data-grid/grid-select-cell';
import { GridActionButton } from '../../../../../shared/components/data-grid/grid-action-button/grid-action-button';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';
import { DlDraftRoutine, RefitMaintenancePeriodOption, RefitRoutineListItem, SelectOption } from '../refit-routines.model';
import { HelpGuidance } from '../../../../../shared/components/help-guidance/help-guidance';

const HELP_HTML = `
  <ul class="mb-0">
    <li>Builds a DL-I (Dockyard List) for a refit — pick the refit and yard, then add routines and assign DL numbers.</li>
    <li>Add remarks per routine, save the draft, and use Export to send it to the selected yard in the chosen file format.</li>
  </ul>
`;

interface DraftRow {
  id: number;
  equipmentName: number | string;
  routineName: number | string;
  maintopNo: string;
  dartNo: string;
  routineNo: string;
  routineDescription: string;
  dlNumber: string;
  additionalRemarks: string;
  remarks: number | '';
}

const EXPORT_FORMATS = ['ACCDB', 'XLSX'];

// The reference UI's "Select Refit Routine Names" list — these correspond to
// real routine_name text conventions in the data (e.g. "EMS RI SHORT REFIT"),
// matched via the backend's routine_name icontains filter on refit_search/.
const REFIT_ROUTINE_NAME_GROUPS = [
  { label: 'SHORT REFIT ROUTINES', keyword: 'SHORT REFIT' },
  { label: 'MAJOR REFIT ROUTINES', keyword: 'MAJOR REFIT' },
  { label: 'NORMAL REFIT ROUTINES', keyword: 'NORMAL REFIT' },
];

// Fixed SS-remarks reference list (no backend master list for this) — ids
// kept stable at 1-4 per the reference UI.
const SS_REMARK_OPTIONS: { label: string; value: number | '' }[] = [
  { label: '-- Select --', value: '' },
  { label: 'DAN', value: 1 },
  { label: 'DOSSRR', value: 2 },
  { label: 'FMUSSRR', value: 3 },
  { label: 'FMUDAN', value: 4 },
];

// Labels shown to the user, in the same order as the yard export endpoint
// suffixes (export_dl1_accdb_{key}) — index-matched, not string-matched.
const YARDS: { label: string; key: 'ndmbi' | 'ndv' | 'nsrykoc' | 'nsrykar' | 'nsrypdr' }[] = [
  { label: 'ND (Mbi)', key: 'ndmbi' },
  { label: 'ND (V)', key: 'ndv' },
  { label: 'NSRY (Koc)', key: 'nsrykoc' },
  { label: 'NSRY (Kar)', key: 'nsrykar' },
  { label: 'NSRY (Pbr)', key: 'nsrypdr' },
];

@Component({
  selector: 'app-generate-dl1',
  standalone: true,
  imports: [CommonModule, FormsModule, MasterCard, IconComponent, DataGrid, ModalComponent, HelpGuidance, ButtonComponent],
  templateUrl: './generate-dl1.html',
  styleUrl: './generate-dl1.css',
})
export class GenerateDl1 implements OnInit {
  readonly helpHtml = HELP_HTML;

  private readonly toastr = inject(NotificationService);
  private readonly api = inject(OperationalMaintenanceApi);

  readonly yards = YARDS;
  readonly exportFormats = EXPORT_FORMATS;
  readonly refitRoutineNameGroups = REFIT_ROUTINE_NAME_GROUPS;
  readonly refitTypeOptions = signal<SelectOption[]>([]);
  private refitPeriods: RefitMaintenancePeriodOption[] = [];

  refitType: number | string = '';
  yard = YARDS[0];
  exportFormat = EXPORT_FORMATS[0];

  dlNo = '';
  globalSearch = '';

  readonly draftRows = signal<DraftRow[]>([]);
  readonly totalRowCount = signal(0);
  readonly isLoading = signal(false);
  readonly dlNoApplied = signal(false);
  private currentPage = 1;
  private currentPageSize = 10;
  private searchDebounce?: ReturnType<typeof setTimeout>;

  get canExport(): boolean {
    return !!this.refitType && !!this.yard && this.dlNoApplied();
  }

  readonly showAddRoutinesModal = signal(false);
  refitNomenclature: number | '' = '';
  refitStartDate = '';
  refitEndDate = '';
  selectedRoutineNameGroups: string[] = [];
  fromDate = '';
  toDate = '';

  readonly columnDefs: ColDef[] = [
    {
      headerName: 'Ser',
      field: 'ser',
      flex: 0.5,
      sortable: false,
      valueGetter: (params) => {
        const rowIndex = params.node?.['rowIndex'] as number | null | undefined;
        return rowIndex != null ? rowIndex + 1 : '';
      },
    },
    // Read-only — set only via the "DL No" input + OK button above the grid,
    // not editable per cell.
    { headerName: 'DL No', field: 'dlNumber', flex: 0.7 },
    { headerName: 'Routine DART No', field: 'dartNo', flex: 1 },
    { headerName: 'Equipment Nomenclature', field: 'equipmentName', flex: 1.2 },
    { headerName: 'Routine Name', field: 'routineName', flex: 1 },
    { headerName: 'Routine Description', field: 'routineDescription', flex: 2, wrapText: true, autoHeight: true },
    { headerName: 'Additional Remarks', field: 'additionalRemarks', flex: 1.4, cellRenderer: GridTextCell },
    {
      headerName: 'SS Remarks',
      field: 'remarks',
      flex: 1.2,
      cellRenderer: GridSelectCell,
      cellRendererParams: { getOptions: () => SS_REMARK_OPTIONS },
    },
    {
      headerName: 'Action',
      field: 'action',
      flex: 0.8,
      sortable: false,
      pinned: 'right',
      cellRenderer: GridActionButton,
      cellRendererParams: {
        label: 'Delete',
        backgroundColor: '#B42318',
        onDelete: (row: RowData) => this.deleteRow(row as unknown as DraftRow),
      },
    },
  ];

  ngOnInit(): void {
    void this.loadDraftRows();
  }

  async loadDraftRows(page = 1, pageSize = this.currentPageSize): Promise<void> {
    this.currentPage = page;
    this.currentPageSize = pageSize;

    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.getDlDraftRows({ search: this.globalSearch || undefined, page, pageSize }),
      );
      const drafts = response?.results?.dl_drafts ?? [];
      this.draftRows.set(drafts.map((item) => this.toDraftRow(item)));
      this.totalRowCount.set(response?.count ?? 0);
      this.dlNoApplied.set(false);

      this.refitPeriods = response?.results?.refit_list ?? [];
      this.refitTypeOptions.set(
        this.refitPeriods.map((item) => ({
          value: item.id,
          label: this.refitLabel(item),
        })),
      );
    } catch (error: unknown) {
      console.error('Unable to fetch DL 1 draft rows.', error);
      this.toastr.error('Unable to fetch DL 1 draft rows.');
      this.draftRows.set([]);
      this.totalRowCount.set(0);
    } finally {
      this.isLoading.set(false);
    }
  }

  onPageRequested(event: { page: number; pageSize: number }): void {
    void this.loadDraftRows(event.page, event.pageSize);
  }

  // TODO: no client-side filtering — every keystroke re-queries the backend's
  // `search` param on api/v1/ems/generatedl1/, reset to page 1.
  onSearchChange(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => void this.loadDraftRows(1, this.currentPageSize), 300);
  }

  private refitLabel(item: Record<string, unknown>): string {
    const candidate =
      (item['name'] as string | undefined) ??
      (item['refit_type_name'] as string | undefined) ??
      (item['refit_type'] as string | undefined);
    return candidate ?? `Refit #${item['id']}`;
  }

  private toDraftRow(item: DlDraftRoutine): DraftRow {
    return {
      id: item.id,
      equipmentName: item.equipment_name ?? 'NA',
      routineName: item.routine_name ?? 'NA',
      maintopNo: item.maintop_no ?? 'NA',
      dartNo: item.dart_number ?? 'NA',
      routineNo: item.routine_no ?? 'NA',
      routineDescription: item.routine_description ?? '',
      dlNumber: '',
      additionalRemarks: '',
      remarks: '',
    };
  }

  // Mirrors the reference UI's single "DL No" field + OK button — the entered
  // number seeds a sequence across all draft rows in increasing order:
  // enter 2 with 3 rows -> those rows get 2, 3, 4.
  confirmDlNo(): void {
    const base = parseInt(this.dlNo, 10);
    if (!this.dlNo.trim() || Number.isNaN(base)) {
      this.toastr.warning('Enter a numeric DL No first.');
      return;
    }
    const rows = this.draftRows();
    if (!rows.length) {
      this.toastr.warning('No DL 1 draft rows to apply the DL No to.');
      return;
    }

    this.draftRows.set(rows.map((row, index) => ({ ...row, dlNumber: String(base + index) })));
    this.dlNoApplied.set(true);
    const dlNoRangeSuffix = rows.length > 1 ? `-${base + rows.length - 1}` : '';
    this.toastr.success(
      `DL No ${base}${dlNoRangeSuffix} applied to ${rows.length} routine(s).`,
    );
  }

  openAddRoutinesModal(): void {
    this.refitNomenclature = '';
    this.refitStartDate = '';
    this.refitEndDate = '';
    this.selectedRoutineNameGroups = [];
    this.fromDate = '';
    this.toDate = '';
    this.showAddRoutinesModal.set(true);
  }

  closeAddRoutinesModal(): void {
    this.showAddRoutinesModal.set(false);
  }

  resetDlNoApplied(): void {
    this.dlNoApplied.set(false);
  }

  onRefitNomenclatureChange(): void {
    const period = this.refitPeriods.find((p) => p.id === this.refitNomenclature);
    this.refitStartDate = this.toDateInput(period?.['actual_start_date'] ?? period?.['plan_start_date']);
    this.refitEndDate = this.toDateInput(period?.['actual_end_date'] ?? period?.['plan_end_date']);
  }

  private toDateInput(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  // The backend's refit_search/ has no routine_category, refit-period, or
  // date-range filter — only section/equipment/routine_name(icontains)/converted.
  // So each selected "routine name group" is matched via routine_name icontains,
  // results are merged, then the date range is applied client-side.
  async getRoutinesForDraft(): Promise<void> {
    if (!this.selectedRoutineNameGroups.length) {
      this.toastr.warning('Select at least one Refit Routine Name group.');
      return;
    }

    try {
      const keywords = this.selectedRoutineNameGroups
        .map((label) => this.refitRoutineNameGroups.find((g) => g.label === label)?.keyword)
        .filter((keyword): keyword is string => !!keyword);

      const results = await Promise.all(
        keywords.map((keyword) =>
          firstValueFrom(this.api.searchRefitRoutines({ routineName: keyword })),
        ),
      );

      const byPk = new Map<number, RefitRoutineListItem>();
      results.forEach((res) => res?.results?.forEach((row) => byPk.set(row.pk, row)));

      let matches = [...byPk.values()];
      if (this.fromDate) {
        matches = matches.filter((row) => !row.next_due_date || row.next_due_date >= this.fromDate);
      }
      if (this.toDate) {
        matches = matches.filter((row) => !row.next_due_date || row.next_due_date <= this.toDate);
      }

      if (!matches.length) {
        this.toastr.warning('No refit routines matched those filters.');
        return;
      }

      const res = await firstValueFrom(this.api.generateDl1(matches.map((row) => row.pk)));
      this.toastr.success(res?.message ?? `${matches.length} routine(s) added to the DL 1 draft.`);
      this.closeAddRoutinesModal();
      await this.loadDraftRows();
    } catch (error: unknown) {
      console.error('Unable to fetch/add refit routines.', error);
      this.toastr.error('Unable to fetch/add refit routines.');
    }
  }

  async deleteRow(row: DraftRow): Promise<void> {
    if (!confirm('Remove this routine from the DL 1 draft?')) return;

    try {
      await firstValueFrom(this.api.deleteDlDraftRow(row.id));
      this.toastr.success('Routine removed from DL 1 draft.');
      await this.loadDraftRows(this.currentPage, this.currentPageSize);
    } catch (error: unknown) {
      console.error('Unable to delete DL draft row.', error);
      this.toastr.error('Unable to delete DL draft row.');
    }
  }

  async save(): Promise<void> {
    if (!this.draftRows().length) {
      this.toastr.warning('No DL 1 draft rows to save.');
      return;
    }

    try {
      await firstValueFrom(
        this.api.saveDlDraftRows({
          rows: this.draftRows().map((row) => ({
            id: row.id,
            dl_number: row.dlNumber || undefined,
            additional_remarks: row.additionalRemarks || undefined,
            remarks: row.remarks === '' ? undefined : String(row.remarks),
          })),
          yard: this.yard.label || undefined,
          refit_type: this.refitType || undefined,
        }),
      );
      this.toastr.success('DL 1 saved successfully.');
      await this.loadDraftRows();
    } catch (error: unknown) {
      console.error('Unable to save DL 1.', error);
      this.toastr.error('Unable to save DL 1.');
    }
  }

  async exportRoutines(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.exportDl1Accdb(this.yard.key));
      this.toastr.info(res?.message ?? 'Export request submitted.');
    } catch (error) {
      const err = error as { error?: { message?: string } };
      this.toastr.error(err?.error?.message ?? 'Unable to export DL 1.');
    }
  }
}
