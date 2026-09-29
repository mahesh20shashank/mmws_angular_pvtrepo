import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule
} from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';

import { SelectInput } from '../../../shared/components/select-input/select-input';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { IconComponent } from '../../../shared/components/icon/icon.component';

import { CellCallbackParams, ColDef } from 'ag-grid-community';
import { OperationalMaintenanceApi } from '../services/operational-maintenance-api';
import { Router } from '@angular/router';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { ExportKind, ExportToolbar } from '../../../shared/components/export-toolbar/export-toolbar';
import { PrintColumn, ReportExportService } from '../../../Core/services/export/generic-export.service';
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';

const HELP_HTML = `
  <p class="mb-0">Search and filter closed defect DARTs by period, occasion, sub-department, type, date range or equipment. Click the eye icon on a row to open its full detail, or use "Sync With CMMS" to push closure status across.</p>
`;

export interface DartHistoryRow {
  id: number | string;
  dartNo: string;
  cmmsSyncStatus: boolean;
  opraNo: string;
  raRaised: boolean;
  dlNo: string;
  dlRaised: boolean;
  equipmentName: string;
  equipmentNomenclature: string;
  defectDescription: string;
  subDepartment: string;
  department: string;
  symptomCode: string;
  severityCode: string;
  closureDate: string;
  repairAgency: string;
  diagnosisCode: string;
  daysDelayed: number | string;
  delayReason: string;
  lessonLearnt: string;
  dartOccasion: string;
  defectDate: string;
  shipRemarks: string;
  maintenanceType: string;
  refitType: string;
}

interface FilterOption {
  label: string;
  value: string;
}

interface DartHistoryFilters {
  dartOccasions?: string[];
  dartTypes?: string[];
  subDepartments?: string[];
  departments?: string[];
  dartMaintenancePeriod?: string[];
  equipments?: string[];
  equipment_nomenclatures?: string[];
}

export interface DartHistoryResponse {
  data?: DartHistoryRow[];
  filters?: DartHistoryFilters;
}

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SelectInput,
    DataGrid,
    IconComponent,
    ExportToolbar,
    HelpGuidance
  , ButtonComponent],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss'
})
export class HistoryComponent implements OnInit {
  readonly helpHtml = HELP_HTML;

  private fb = inject(FormBuilder);
  private call = inject(OperationalMaintenanceApi);
  private router = inject(Router);
  private toastr = inject(NotificationService);
  private exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);

  pageSize = 10;

  form: FormGroup;

  errorMessage = '';


  rowData = signal<DartHistoryRow[]>([]);
  readonly isLoading = signal(false);
  maintenancePeriodOptions = signal<FilterOption[]>([]);
  dartOccasionOptions = signal<FilterOption[]>([]);
  subDepartmentOptions = signal<FilterOption[]>([]);
  dartTypeOptions = signal<FilterOption[]>([]);
  equipmentOptions = signal<FilterOption[]>([]);
  nomenclatureOptions = signal<FilterOption[]>([]);
  departmentOptions = signal<FilterOption[]>([]);


  constructor() {

    this.form = this.fb.group({
      maintenancePeriod: [''],
      dartOccasion: [''],
      subDepartment: [''],
      dartType: [''],

      dateFrom: [''],
      dateTo: [''],

      equipment: [''],
      nomenclature: [''],

      department: ['']
    });
  }

  ngOnInit(): void {





    void this.loadHistoryData();

    // Auto-filter as soon as any filter control changes — text/date fields are
    // debounced so typing doesn't fire a request per keystroke; dropdowns settle
    // on the same debounce since they change value once per click anyway. Each
    // change re-queries the backend (history/data/ re-applied with the current
    // form values as query params) rather than filtering the already-fetched rows
    // in-memory, so filtering isn't limited to whatever page of data happened to
    // load first.
    this.form.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      )
      .subscribe(() => void this.search());
  }

  readonly columnDefs: ColDef[] = [
    {
      field: 'dartNo',
      headerName: 'DART No.',
      flex: 1,
      minWidth: 140
    },
    {
      field: 'cmmsSyncStatus',
      headerName: 'DART Closing - CMMS Sync Status',
      flex: 1.5,
      minWidth: 250,
      valueGetter: (params: CellCallbackParams) =>
        (params.data as DartHistoryRow | undefined)?.cmmsSyncStatus
          ? 'Synced'
          : 'Not Synced'
    },
    {
      field: 'opraNo',
      headerName: 'OPRA No.',
      flex: 1,
      minWidth: 140
    },
    {
      field: 'raRaised',
      headerName: 'RA Raised Status',
      flex: 1,
      minWidth: 160,
      valueGetter: (params: CellCallbackParams) =>
        (params.data as DartHistoryRow | undefined)?.raRaised
          ? 'Raised'
          : 'Not Raised'
    },
    {
      field: 'equipmentNomenclature',
      headerName: 'Equipment Nomenclature',
      flex: 2,
      minWidth: 250
    },
    {
      field: 'defectDescription',
      headerName: 'Defect Description',
      flex: 2,
      minWidth: 220
    },
    {
      field: 'id',
      headerName: 'Actions',
      flex: 1,
      minWidth: 120,
      sortable: false,
      filter: false,
      cellRenderer: () => `
      <button type="button" class="history-action-btn">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
    `,
      onCellClicked: (params: CellCallbackParams) => {
        this.goToView(params.data as DartHistoryRow | undefined);
      }
    }
  ];

  // Re-queries history/data/ with the current form values as query params — the
  // backend (DartHistoryDefaultDataAPIView) does the actual filtering, this just
  // maps the form to its param names. Only rowData is refreshed; filter option
  // lists stay as loaded on the initial unfiltered fetch so narrowing one filter
  // doesn't shrink what's selectable in the others.
  async search(): Promise<void> {
    const {
      maintenancePeriod,
      dartOccasion,
      dartType,
      equipment,
      subDepartment,
      department,
      dateFrom,
      dateTo
    } = this.form.value;

    this.isLoading.set(true);
    try {
      const res: DartHistoryResponse = await firstValueFrom(
        this.call.getDartHistory({
          maintenance_period: maintenancePeriod,
          dart_occasion: dartOccasion,
          dart_type: dartType,
          equipment,
          sub_department: subDepartment,
          department,
          defect_date_from: dateFrom,
          defect_date_to: dateTo,
        }),
      );

      const rows = res.data || [];
      this.errorMessage = rows.length ? '' : 'No records found';
      this.rowData.set(rows);
    } catch {
      this.errorMessage = 'Failed to load DART History or Filters';
      this.rowData.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadHistoryData(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res: DartHistoryResponse = await firstValueFrom(this.call.getDartHistory());

      this.errorMessage = '';

      const rows = res.data || [];
      this.rowData.set(rows)

      this.dartOccasionOptions.set([
        ...(res.filters?.dartOccasions || []).filter((item: string) => item !== '').map((item: string) => ({
          label: item,
          value: item
        }))
      ]);

      this.dartTypeOptions.set([
        ...(res.filters?.dartTypes || []).filter((item: string) => item !== '').map((item: string) => ({
          label: item,
          value: item
        }))
      ]);

      this.subDepartmentOptions.set([
        { label: 'All', value: '' },
        ...(res.filters?.subDepartments || []).filter((item: string) => item !== '').map((item: string) => ({
          label: item,
          value: item
        }))
      ]);

      this.departmentOptions.set([
        { label: 'All', value: '' },
        ...(res.filters?.departments || []).filter((item: string) => item !== '').map((item: string) => ({
          label: item,
          value: item
        }))
      ]);

      this.maintenancePeriodOptions.set([
        ...(res.filters?.dartMaintenancePeriod || []).filter((item: string) => item !== '').map((item: string) => ({
          label: item,
          value: item
        }))
      ]);

      this.equipmentOptions.set([
        { label: 'All', value: '' },
        ...(res.filters?.equipments || []).filter((item: string) => item !== '').map((item: string) => ({
          label: item,
          value: item
        }))
      ]);
      this.nomenclatureOptions.set([
         { label: 'All', value: '' },
        ...(res.filters?.equipment_nomenclatures || []).filter((item: string) => item !== '').map((item: string) => ({
          label: item,
          value: item
        }))
      ]);

    } catch {
      this.errorMessage = 'Failed to load DART History or Filters';
      this.rowData.set([])
    } finally {
      this.isLoading.set(false);
    }
  }

  goToView(row: DartHistoryRow | undefined): void {
    this.router.navigate(
      ['/afterAuth/op-maintenance/defect/history/view-action'],
      {
        state: {
          dartData: row
        }
      }
    );
  }

  selectedRows: DartHistoryRow[] = [];
  readonly syncingCmms = signal(false);

  onSelectionChanged(rows: unknown[]): void {
    this.selectedRows = (rows as DartHistoryRow[]) ?? [];
  }

  /**
   * Pushes the ticked DARTs' closures up to CMMS.
   *
   * CMMS already holds the DART row itself, so closing it is an UPDATE that stamps
   * RectifiedDate, the diagnostic/repair/agency/delay codes, IsClosed and Active. The
   * backend skips closures it has already sent, and reports any selected DART that has no
   * closure recorded locally yet.
   */
  async syncWithCMMS(): Promise<void> {
    if (this.syncingCmms()) return;

    if (!this.selectedRows.length) {
      this.toastr.warning('Select at least one DART to sync with CMMS.');
      return;
    }

    const ids = this.selectedRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id));

    if (!ids.length) {
      this.toastr.warning('The selected rows have no usable DART id.');
      return;
    }

    this.syncingCmms.set(true);
    try {
      const res = await firstValueFrom(this.call.pushClosedDartsToCmms(ids));

      const notes: string[] = [];
      if (res.already_synced) notes.push(`${res.already_synced} already synced`);
      if (res.not_closed) notes.push(`${res.not_closed} not closed yet`);
      const suffix = notes.length ? ` (${notes.join(', ')})` : '';

      if (res.failed) {
        this.toastr.warning(
          `Closed ${res.pushed} of ${res.pushed + res.failed} in CMMS. ${res.failed} failed.${suffix}`,
        );
      } else if (res.pushed) {
        this.toastr.success(`Closed ${res.pushed} DART(s) in CMMS.${suffix}`);
      } else {
        this.toastr.info(`Nothing to sync${suffix}.`);
      }

      // Refresh so the pushed rows come back with their sync status updated.
      await this.loadHistoryData();
    } catch (err) {
      const error = err as { error?: { message?: string } };
      console.error('CMMS closure sync failed', err);
      this.toastr.error(error?.error?.message ?? 'CMMS sync failed.');
    } finally {
      this.syncingCmms.set(false);
    }
  }

  private static printColumnFormat(field: string): ((value: unknown) => string) | undefined {
    if (field === 'cmmsSyncStatus') return (v) => (v ? 'Synced' : 'Not Synced');
    if (field === 'raRaised') return (v) => (v ? 'Raised' : 'Not Raised');
    return undefined;
  }

  private get printColumns(): PrintColumn[] {
    return this.columnDefs
      .filter((c): c is typeof c & { field: string } => !!c.field && c.field !== 'id')
      .map((c) => ({
        header: String(c.headerName ?? c.field),
        field: c.field,
        format: HistoryComponent.printColumnFormat(c.field),
      }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.rowData() as unknown as Record<string, unknown>[];
    const ok = this.exportService.export(kind, 'Defect / DART History', this.printColumns, rows);
    if (!ok) {
      this.toastr.error('Unable to open the print preview — check if a popup was blocked.');
    }
  }

  copyRows(): void {
    void this.exportService.copyRows(this.printColumns, this.rowData() as unknown as Record<string, unknown>[]);
    this.toastr.success('Copied to clipboard.');
  }

}
