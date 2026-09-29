import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ColDef } from 'ag-grid-community';
import { defaultIfEmpty, finalize, Subject, catchError, forkJoin, of, takeUntil } from 'rxjs';
// Old imports:
// import { PaginateTableComponent } from '../../../../../../Components/paginate-table/paginate-table.component';
import { PaginateTableComponent } from '../../../../ui/paginate-table/paginate-table.component';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import { SelectOption } from '../../../../ui/select.component';
import { ReusableDeleteDialogComponent, AgActionCellComponent, AgSelectCellComponent } from '../../../../ui/master-compat';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { TrailService } from '../../../../trail.service';
import {
  resolveTrialSubSubSystemName,
  resolveTrialSystemName,
} from '../../seg-trial-prefill.shared';
import {
  catalogueActiveStatusBadgeClass,
  CATALOGUE_ACTIVE_STATUS_OPTIONS,
  pickCatalogueListValue,
  renderCatalogueActiveStatusBadge,
  renderSegVerificationStatusBadge,
  resolveCatalogueActiveStatusLabel,
  resolveCatalogueActiveValue,
  resolveCatalogueMmdName,
  resolveCatalogueLastBackupHeldLabel,
  resolveCatalogueMmdSerial,
  resolveCatalogueApprovedValue,
  resolveSegCatalogueTrialId,
  segVerificationBadgeClass,
  SEG_CATALOGUES_API,
  SEG_VERIFICATION_OPTIONS,
  SEG_TRIALS_API,
  SEG_MMD_MASTER_LOOKUP_CODES,
  setCatalogueMmdLookupOptions,
} from '../seg-catalogue-form.shared';
import { AddMmdDialogComponent } from '../add-mmd-dialog.component';
import {
  getUserShipId,
  isUserShipProcess,
} from '../../../../../../../shared/utils/user-satellite-unit';

@Component({
  selector: 'app-seg-create-catalogue-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PaginateTableComponent,
    MultiSelectDropdownComponent,
    AddMmdDialogComponent,
    ReusableDeleteDialogComponent,
  ],
  templateUrl: './create-catalogue-page.html',
  styleUrl: './create-catalogue-page.css',
})
export class SegCreateCataloguePageComponent implements OnInit, OnDestroy {
  @ViewChild(PaginateTableComponent) table!: PaginateTableComponent;

  filterForm!: FormGroup;
  filtersOpen = false;
  departmentOptions: SelectOption[] = [];
  systemOptions: SelectOption[] = [];
  subsystemOptions: SelectOption[] = [];
  subSubSystemOptions: SelectOption[] = [];
  shipOptions: SelectOption[] = [];
  readonly showShipFilter = !isUserShipProcess();
  readonly isShipUser = isUserShipProcess();
  readonly canEditCatalogueStatus = !isUserShipProcess();
  readonly canEditSegVerificationStatus = !isUserShipProcess();

  tableUrl = SEG_CATALOGUES_API;
  showAddMmdDialog = false;
  totalActiveMmdsInSubsystem = 0;

  showDeleteDialog = false;
  deleteLoading = false;
  deleteName = '';
  private deleteTrialId: string | null = null;

  get addMmdFilterContext(): {
    department_id?: string;
    system_id?: string;
    subsystem_id?: string;
    sub_sub_system_id?: string;
    equipment_nomenclature?: string;
  } {
    const { department, system, subsystem, subSubSystem } =
      this.filterForm?.getRawValue() ?? {};
    const departmentIds = this.toIdList(department);
    const systemIds = this.toIdList(system);
    const subsystemIds = this.toIdList(subsystem);
    const subSubSystemIds = this.toIdList(subSubSystem);
    const subSubSystemId = subSubSystemIds[0];
    const equipmentOption = this.subSubSystemOptions.find(
      (option) => String(option.value) === String(subSubSystemId ?? ''),
    );

    return {
      department_id: departmentIds[0],
      system_id: systemIds[0],
      subsystem_id: subsystemIds[0],
      sub_sub_system_id: subSubSystemId,
      equipment_nomenclature: equipmentOption?.label,
    };
  }

  get activeMmdMetricTitle(): string {
    return "Total Active MMD's in selected parameters";
  }

  get activeFilterCount(): number {
    const value = this.filterForm?.getRawValue() ?? {};
    const counts = [
      this.showShipFilter ? this.toIdList(value.ship).length : 0,
      this.toIdList(value.department).length,
      this.toIdList(value.system).length,
      this.toIdList(value.subsystem).length,
      this.toIdList(value.subSubSystem).length,
    ];
    return counts.filter((count) => count > 0).length;
  }

  get shipFilterLabel(): string {
    return this.formatSelectedFilterLabels(
      'Ship',
      this.toIdList(this.filterForm?.get('ship')?.value),
      this.shipOptions,
    );
  }

  get departmentFilterLabel(): string {
    return this.formatSelectedFilterLabels(
      'Dept',
      this.toIdList(this.filterForm?.get('department')?.value),
      this.departmentOptions,
    );
  }

  get systemFilterLabel(): string {
    return this.formatSelectedFilterLabels(
      'System',
      this.toIdList(this.filterForm?.get('system')?.value),
      this.systemOptions,
    );
  }

  get subsystemFilterLabel(): string {
    return this.formatSelectedFilterLabels(
      'Sub',
      this.toIdList(this.filterForm?.get('subsystem')?.value),
      this.subsystemOptions,
    );
  }

  get subSubSystemFilterLabel(): string {
    return this.formatSelectedFilterLabels(
      'Sub Sub',
      this.toIdList(this.filterForm?.get('subSubSystem')?.value),
      this.subSubSystemOptions,
    );
  }

  get activeMmdFilterHint(): string | null {
    const { ship, department, system, subsystem, subSubSystem } =
      this.filterForm?.getRawValue() ?? {};

    if (this.showShipFilter) {
      const shipIds = this.toIdList(ship);
      if (shipIds.length) {
        return this.resolveSelectionNames(shipIds, this.shipOptions);
      }
    }

    const subSubSystemIds = this.toIdList(subSubSystem);
    if (subSubSystemIds.length) {
      return this.resolveSelectionNames(subSubSystemIds, this.subSubSystemOptions);
    }

    const subsystemIds = this.toIdList(subsystem);
    if (subsystemIds.length) {
      return this.resolveSelectionNames(subsystemIds, this.subsystemOptions);
    }

    const systemIds = this.toIdList(system);
    if (systemIds.length) {
      return this.resolveSelectionNames(systemIds, this.systemOptions);
    }

    const departmentIds = this.toIdList(department);
    if (departmentIds.length) {
      return this.resolveSelectionNames(departmentIds, this.departmentOptions);
    }

    return null;
  }

  get activeMmdSummaryScope(): string {
    const parts = this.buildActiveMmdSummaryParts();
    return parts.length ? parts.join(' · ') : '';
  }

  get activeMmdSummaryLabel(): string {
    const hint = this.activeMmdFilterHint;
    return hint
      ? `${this.activeMmdMetricTitle} · ${hint}`
      : this.activeMmdMetricTitle;
  }

  private buildActiveMmdSummaryParts(): string[] {
    const { ship, department, system, subsystem, subSubSystem } =
      this.filterForm?.getRawValue() ?? {};

    const parts = [
      this.formatSelectedFilterLabels(
        'Department',
        this.toIdList(department),
        this.departmentOptions,
      ),
      this.formatSelectedFilterLabels(
        'System',
        this.toIdList(system),
        this.systemOptions,
      ),
      this.formatSelectedFilterLabels(
        'Sub System',
        this.toIdList(subsystem),
        this.subsystemOptions,
      ),
      this.formatSelectedFilterLabels(
        'Sub Sub System',
        this.toIdList(subSubSystem),
        this.subSubSystemOptions,
      ),
    ].filter(Boolean);

    if (this.showShipFilter) {
      const shipPart = this.formatSelectedFilterLabels(
        'Ship',
        this.toIdList(ship),
        this.shipOptions,
      );
      return shipPart ? [shipPart, ...parts] : parts;
    }

    return parts;
  }

  private readonly destroy$ = new Subject<void>();

  addButtons: { label: string; key: string; show?: boolean; cls?: string }[] = [];

  readonly segVerificationOptions = SEG_VERIFICATION_OPTIONS.map((option) => ({
    label: option.label,
    value: String(option.value),
  }));

  readonly catalogueActiveStatusOptions = CATALOGUE_ACTIVE_STATUS_OPTIONS.map(
    (option) => ({
      label: option.label,
      value: option.value,
    }),
  );

  columnDefs: ColDef[] = [
    {
      headerName: 'System',
      flex: 1,
      minWidth: 120,
      valueGetter: (params) => {
        const row = params.data as Record<string, unknown>;
        const name =
          row?.['system_name'] ??
          row?.['system'] ??
          resolveTrialSystemName(row);
        return String(name || '-');
      },
    },
    {
      headerName: 'Sub System',
      flex: 1,
      minWidth: 130,
      valueGetter: (params) => {
        const row = params.data as Record<string, unknown>;
        return String(
          row?.['subsystem_name'] ??
            row?.['sub_system_name'] ??
            row?.['subsystem'] ??
            '-',
        );
      },
    },
    {
      headerName: 'Sub Sub System',
      flex: 1,
      minWidth: 140,
      valueGetter: (params) => {
        const row = params.data as Record<string, unknown>;
        return String(
          row?.['name'] ??
            row?.['sub_sub_system_name'] ??
            row?.['sub_subsystem_name'] ??
            resolveTrialSubSubSystemName(row) ??
            '-',
        );
      },
    },
    {
      headerName: 'MMD Name',
      flex: 1,
      minWidth: 180,
      valueGetter: (params) =>
        resolveCatalogueMmdName(params.data as Record<string, unknown>),
    },
    {
      field: 'active',
      headerName: 'Status',
      minWidth: 160,
      sortable: false,
      filter: false,
      cellRenderer: AgSelectCellComponent,
      cellRendererParams: {
        field: 'active',
        placeholder: '-- Select --',
        saveOnChange: true,
        getOptions: () => this.catalogueActiveStatusOptions,
        getSelectClass: (value: string | number | null) =>
          catalogueActiveStatusBadgeClass(value),
        onValueChange: (
          value: string | number | null,
          row: Record<string, unknown>,
          _params: unknown,
          ctx: { revert: () => void; setSaving: (saving: boolean) => void },
        ) => this.onCatalogueActiveStatusChange(value, row, ctx),
      },
      valueGetter: (params) => {
        const raw = resolveCatalogueActiveValue(
          params.data as Record<string, unknown>,
        );
        return raw == null ? '' : String(raw);
      },
    },
    {
      headerName: 'MMD Serial',
      minWidth: 130,
      valueGetter: (params) =>
        resolveCatalogueMmdSerial(params.data as Record<string, unknown>),
    },
    {
      headerName: 'Last Backup Held',
      minWidth: 150,
      valueGetter: (params) =>
        resolveCatalogueLastBackupHeldLabel(
          params.data as Record<string, unknown>,
        ),
    },
    {
      field: 'approved',
      headerName: 'SEG Verification Status',
      minWidth: 200,
      sortable: false,
      filter: false,
      cellRenderer: AgSelectCellComponent,
      cellRendererParams: {
        field: 'approved',
        placeholder: '-- Select --',
        saveOnChange: true,
        getOptions: () => this.segVerificationOptions,
        getSelectClass: (value: string | number | null) =>
          segVerificationBadgeClass(value),
        onValueChange: (
          value: string | number | null,
          row: Record<string, unknown>,
          _params: unknown,
          ctx: { revert: () => void; setSaving: (saving: boolean) => void },
        ) => this.onSegVerificationChange(value, row, ctx),
      },
      valueGetter: (params) => {
        // Old line: const raw = params.data?.approved;
        const raw = (params.data as any)?.approved;
        return raw == null || raw === '' ? '' : String(raw);
      },
    },
    {
      headerName: 'Action',
      field: 'actions',
      width: 150,
      maxWidth: 160,
      sortable: false,
      filter: false,
      pinned: 'right' as const,
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (key: string, row: Record<string, unknown>) =>
          this.onGridAction(key, row),
        actions: [
          {
            key: 'edit',
            label: 'Edit',
            iconClass: 'fa fa-edit',
            btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
            visible: (row: Record<string, unknown>) =>
              this.canShowCatalogueModifyActions(row),
          },
          {
            key: 'view',
            label: 'View',
            iconClass: 'fa fa-eye',
            btnClass: 'bg-green-100 text-green-600 hover:bg-green-200',
          },
          {
            key: 'delete',
            label: 'Delete',
            iconClass: 'fa fa-trash',
            btnClass: 'bg-red-100 text-red-600 hover:bg-red-200',
            visible: (row: Record<string, unknown>) =>
              this.canShowCatalogueModifyActions(row),
          },
        ],
      },
    },
  ];

  constructor(
    private readonly fb: FormBuilder,
    private readonly apiService: ApiService,
    private readonly toast: ToastService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone,
    private readonly trailService: TrailService,
  ) {}

  ngOnInit(): void {
    if (this.showShipFilter) {
      this.columnDefs.unshift(this.buildShipNameColumnDef());
    }

    if (!this.canEditCatalogueStatus) {
      const statusColIndex = this.columnDefs.findIndex(
        (col) => col.field === 'active',
      );
      if (statusColIndex >= 0) {
        this.columnDefs[statusColIndex] = this.buildReadOnlyStatusColumnDef();
      }
    }
    if (!this.canEditSegVerificationStatus) {
      const segVerificationColIndex = this.columnDefs.findIndex(
        (col) => col.field === 'approved',
      );
      if (segVerificationColIndex >= 0) {
        this.columnDefs[segVerificationColIndex] =
          this.buildReadOnlySegVerificationColumnDef();
      }
    }

    this.addButtons = [
      {
        label: 'Add MMD',
        key: 'add',
        cls: 'bg-blue-900 text-white',
      },
    ];

    this.filterForm = this.fb.group({
      ship: [[] as string[]],
      department: [[] as string[]],
      system: [[] as string[]],
      subsystem: [[] as string[]],
      subSubSystem: [[] as string[]],
    });

    if (this.showShipFilter) {
      this.loadShipOptions();
    }

    this.loadDepartmentOptions();
    this.loadMmdLookupOptions();
    this.listenToFilterCascade();
    this.tableUrl = this.buildCatalogueTableUrl();
    this.loadActiveMmdCount();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilters(): void {
    this.refreshCatalogueTable();
  }

  resetFilters(): void {
    this.filterForm.reset({
      ship: [],
      department: [],
      system: [],
      subsystem: [],
      subSubSystem: [],
    });
    this.systemOptions = [];
    this.subsystemOptions = [];
    this.subSubSystemOptions = [];
    this.refreshCatalogueTable();
  }

  handleAddButtonClick(event: { key: string }): void {
    if (event.key === 'add') {
      this.showAddMmdDialog = true;
    }
  }

  onAddMmdDialogOpenChange(open: boolean): void {
    this.showAddMmdDialog = open;
    if (!open) {
      this.refreshCatalogueTable();
    }
  }

  onMmdSaved(): void {
    this.refreshCatalogueTable();
  }

  private refreshCatalogueTable(): void {
    this.tableUrl = this.buildCatalogueTableUrl();
    this.loadActiveMmdCount();
    this.table?.refreshTable();
  }

  private buildCatalogueTableUrl(): string {
    const { system, subsystem, subSubSystem } = this.filterForm.getRawValue();
    const params = new URLSearchParams();
    const shipIds = this.joinIds(this.resolveShipFilterIds());
    const systemIds = this.joinIds(this.toIdList(system));
    const subsystemIds = this.joinIds(this.toIdList(subsystem));
    const subSubSystemIds = this.joinIds(this.toIdList(subSubSystem));

    if (shipIds) {
      params.set('ship_id', shipIds);
    }
    if (systemIds) {
      params.set('system_id', systemIds);
    }
    if (subsystemIds) {
      params.set('subsystem_id', subsystemIds);
    }
    if (subSubSystemIds) {
      params.set('sub_sub_system_id', subSubSystemIds);
    }

    const query = params.toString();
    return query ? `${SEG_CATALOGUES_API}?${query}` : SEG_CATALOGUES_API;
  }

  private onGridAction(key: string, row: Record<string, unknown>): void {
    if (key === 'delete') {
      this.onDeleteCatalogueRow(row);
      return;
    }

    if (key !== 'edit' && key !== 'view') {
      return;
    }

    if (key === 'edit' && !this.canShowCatalogueModifyActions(row)) {
      return;
    }

    const trialUuidRaw = row['uuid'] ?? row['trial_uuid'];
    const trialUuid =
      typeof trialUuidRaw === 'string' || typeof trialUuidRaw === 'number'
        ? trialUuidRaw
        : undefined;

    // Old call: const { path, queryParams } = trialTypeNavigateOptions(...)
    const { path, queryParams } = this.trailService.trialTypeNavigateOptions(
      String(row['trial_type_url'] ?? '/seg/create_catalogue'),
      trialUuid,
    );

    if (!path.length) {
      this.toast.showError('Form route is not configured for this MMD.');
      return;
    }

    this.router.navigate(path, { queryParams });
  }

  private buildShipNameColumnDef(): ColDef {
    return {
      headerName: 'Ship Name',
      flex: 1,
      minWidth: 130,
      valueGetter: (params) =>
        pickCatalogueListValue(params.data as Record<string, unknown>, [
          'ship_name',
          'ship',
        ]) || '-',
    };
  }

  private buildReadOnlyStatusColumnDef(): ColDef {
    return {
      headerName: 'Status',
      minWidth: 160,
      sortable: false,
      filter: false,
      valueGetter: (params) =>
        resolveCatalogueActiveStatusLabel(
          params.data as Record<string, unknown>,
        ),
      cellRenderer: (params: { data?: Record<string, unknown> }) =>
        renderCatalogueActiveStatusBadge(params.data),
    };
  }

  private buildReadOnlySegVerificationColumnDef(): ColDef {
    return {
      field: 'approved',
      headerName: 'SEG Verification Status',
      minWidth: 200,
      sortable: false,
      filter: false,
      valueGetter: (params) =>
        String(
          resolveCatalogueApprovedValue(params.data as Record<string, unknown>) ?? '',
        ),
      cellRenderer: (params: { value?: string | number | null }) =>
        renderSegVerificationStatusBadge(params.value),
    };
  }

  private onCatalogueActiveStatusChange(
    value: string | number | null,
    row: Record<string, unknown>,
    ctx: { revert: () => void; setSaving: (saving: boolean) => void },
  ): void {
    if (!this.canEditCatalogueStatus) {
      ctx.revert();
      return;
    }

    if (value == null || value === '') {
      ctx.revert();
      return;
    }

    const trialId = resolveSegCatalogueTrialId(row);
    if (!trialId) {
      this.toast.showError('Trial uuid not found');
      ctx.revert();
      return;
    }

    const active = Number(value);
    ctx.setSaving(true);

    this.apiService
      .post(SEG_TRIALS_API, {
        id: trialId,
        active,
      })
      .pipe(
        finalize(() => {
          ctx.setSaving(false);
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          row['active'] = active;
          this.toast.showSuccess('Status updated successfully');
          this.loadActiveMmdCount();
          this.cdr.detectChanges();
        },
        error: (err: { message?: string }) => {
          ctx.revert();
          this.toast.showError(err?.message || 'Failed to update status');
          this.cdr.detectChanges();
        },
      });
  }

  private onSegVerificationChange(
    value: string | number | null,
    row: Record<string, unknown>,
    ctx: { revert: () => void; setSaving: (saving: boolean) => void },
  ): void {
    if (!this.canEditSegVerificationStatus) {
      ctx.revert();
      return;
    }

    if (value == null || value === '') {
      ctx.revert();
      return;
    }

    const trialId = resolveSegCatalogueTrialId(row);
    if (!trialId) {
      this.toast.showError('Trial uuid not found');
      ctx.revert();
      return;
    }

    const approved = Number(value);
    ctx.setSaving(true);

    this.apiService
      .post(SEG_TRIALS_API, {
        id: trialId,
        approved,
      })
      .pipe(
        finalize(() => {
          ctx.setSaving(false);
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          row['approved'] = approved;
          this.toast.showSuccess('SEG Verification updated successfully');
          this.cdr.detectChanges();
        },
        error: (err: { message?: string }) => {
          ctx.revert();
          this.toast.showError(
            err?.message || 'Failed to update SEG Verification status',
          );
          this.cdr.detectChanges();
        },
      });
  }

  private onDeleteCatalogueRow(row: Record<string, unknown>): void {
    const trialId = resolveSegCatalogueTrialId(row);
    if (!trialId) {
      this.toast.showError('Trial uuid not found');
      return;
    }

    this.deleteTrialId = trialId;
    this.deleteName =
      resolveCatalogueMmdName(row) ||
      resolveCatalogueMmdSerial(row) ||
      String(row['trial_number'] ?? row['mmd_type'] ?? 'this MMD');
    this.showDeleteDialog = true;
    this.cdr.detectChanges();
  }

  closeDeleteDialog(): void {
    this.showDeleteDialog = false;
    this.deleteLoading = false;
    this.deleteTrialId = null;
    this.deleteName = '';
    this.cdr.detectChanges();
  }

  confirmDelete(): void {
    if (!this.deleteTrialId) {
      this.toast.showError('Trial uuid not found');
      return;
    }

    this.deleteLoading = true;
    this.apiService
      .post(SEG_TRIALS_API, {
        id: this.deleteTrialId,
        active: 3,
      })
      .pipe(
        finalize(() => {
          this.deleteLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          this.toast.showSuccess('Catalogue entry deleted successfully');
          this.closeDeleteDialog();
          this.refreshCatalogueTable();
          this.cdr.detectChanges();
        },
        error: (err: { message?: string }) => {
          this.toast.showError(err?.message || 'Failed to delete catalogue entry');
          this.cdr.detectChanges();
        },
      });
  }

  private loadShipOptions(): void {
    this.apiService
      .getDropdownData('master/ships/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          this.shipOptions = this.mapSelectOptions(options);
          this.cdr.detectChanges();
        },
        error: () => {
          this.shipOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private loadMmdLookupOptions(): void {
    const lookupConfig = { labelKey: 'name', valueKey: 'id' } as const;

    forkJoin({
      mmdType: this.apiService
        .getDropdownData(
          `master/lookups/?type__code=${SEG_MMD_MASTER_LOOKUP_CODES.mmdType}`,
          lookupConfig,
        )
        .pipe(defaultIfEmpty([]), catchError(() => of([]))),
      mmdSize: this.apiService
        .getDropdownData(
          `master/lookups/?type__code=${SEG_MMD_MASTER_LOOKUP_CODES.mmdSize}`,
          lookupConfig,
        )
        .pipe(defaultIfEmpty([]), catchError(() => of([]))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          setCatalogueMmdLookupOptions({
            mmdType: options.mmdType.map((option: any) => ({
              label: option.label,
              value: String(option.value),
            })),
            mmdSize: options.mmdSize.map((option: any) => ({
              label: option.label,
              value: String(option.value),
            })),
          });
          this.table?.refreshTable();
          this.cdr.detectChanges();
        },
      });
  }

  private loadDepartmentOptions(): void {
    this.apiService
      .getDropdownData('master/departments/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          this.ngZone.run(() => {
            this.departmentOptions = options.map((option: any) => ({
              label: option.label,
              value: String(option.value),
            }));
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.departmentOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private listenToFilterCascade(): void {
    this.filterForm
      .get('department')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((departmentIds) => {
        this.filterForm.patchValue(
          { system: [], subsystem: [], subSubSystem: [] },
          { emitEvent: false },
        );
        this.subsystemOptions = [];
        this.subSubSystemOptions = [];
        const ids = this.toIdList(departmentIds);
        if (ids.length) {
          this.loadSystemOptions(ids);
        } else {
          this.systemOptions = [];
        }
        this.cdr.detectChanges();
      });

    this.filterForm
      .get('system')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((systemIds) => {
        this.filterForm.patchValue(
          { subsystem: [], subSubSystem: [] },
          { emitEvent: false },
        );
        this.subSubSystemOptions = [];
        const ids = this.toIdList(systemIds);
        if (ids.length) {
          this.loadSubsystemOptions(ids);
        } else {
          this.subsystemOptions = [];
        }
        this.cdr.detectChanges();
      });

    this.filterForm
      .get('subsystem')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((subsystemIds) => {
        this.filterForm.patchValue({ subSubSystem: [] }, { emitEvent: false });
        const ids = this.toIdList(subsystemIds);
        if (ids.length) {
          this.loadSubSubSystemOptions(ids);
        } else {
          this.subSubSystemOptions = [];
        }
        this.cdr.detectChanges();
      });
  }

  private loadSystemOptions(departmentIds: string[]): void {
    this.apiService
      .getDropdownData(
        'master/systems/',
        { labelKey: 'name', valueKey: 'id' },
        { department: departmentIds.join(',') },
      )
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          this.systemOptions = this.mapSelectOptions(options);
          this.cdr.detectChanges();
        },
        error: () => {
          this.systemOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private loadSubsystemOptions(systemIds: string[]): void {
    this.apiService
      .getDropdownData(
        'master/subsystems/',
        { labelKey: 'name', valueKey: 'id' },
        { system: systemIds.join(',') },
      )
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          this.subsystemOptions = this.mapSelectOptions(options);
          this.cdr.detectChanges();
        },
        error: () => {
          this.subsystemOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private loadSubSubSystemOptions(subsystemIds: string[]): void {
    this.apiService
      .getDropdownData(
        'master/sub-sub-system/',
        { labelKey: 'name', valueKey: 'id' },
        { subsystem: subsystemIds.join(',') },
      )
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          this.subSubSystemOptions = this.mapSelectOptions(options);
          this.cdr.detectChanges();
        },
        error: () => {
          this.subSubSystemOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private loadActiveMmdCount(): void {
    const { system, subsystem, subSubSystem } = this.filterForm.getRawValue();
    const params: Record<string, string> = {};
    const joinedShipIds = this.joinIds(this.resolveShipFilterIds());
    const joinedSystemIds = this.joinIds(this.toIdList(system));
    const joinedSubsystemIds = this.joinIds(this.toIdList(subsystem));
    const joinedSubSubSystemIds = this.joinIds(this.toIdList(subSubSystem));

    if (joinedShipIds) {
      params['ship_id'] = joinedShipIds;
    }
    if (joinedSystemIds) {
      params['system_id'] = joinedSystemIds;
    }
    if (joinedSubsystemIds) {
      params['subsystem_id'] = joinedSubsystemIds;
    }
    if (joinedSubSubSystemIds) {
      params['sub_sub_system_id'] = joinedSubSubSystemIds;
    }

    this.apiService
      .get(SEG_CATALOGUES_API, Object.keys(params).length ? params : undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.ngZone.run(() => {
            this.totalActiveMmdsInSubsystem =
              this.extractActiveCountFromResponse(response);
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.totalActiveMmdsInSubsystem = 0;
          this.cdr.detectChanges();
        },
      });
  }

  private extractActiveCountFromResponse(response: unknown): number {
    if (!response || typeof response !== 'object') {
      return 0;
    }

    const root = response as Record<string, unknown>;
    const fromRoot = root['active_count'];
    if (fromRoot != null && fromRoot !== '') {
      const parsed = Number(fromRoot);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    const data = root['data'];
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const nested = (data as Record<string, unknown>)['active_count'];
      if (nested != null && nested !== '') {
        const parsed = Number(nested);
        return Number.isFinite(parsed) ? parsed : 0;
      }
    }

    return 0;
  }

  private formatSelectedFilterLabels(
    fieldLabel: string,
    ids: string[],
    options: SelectOption[],
  ): string {
    if (!ids.length) {
      return '';
    }

    return `${fieldLabel}: ${this.resolveSelectionNames(ids, options)}`;
  }

  private resolveSelectionNames(
    ids: string[],
    options: SelectOption[],
  ): string {
    const labels = ids.map(
      (id) => options.find((option) => String(option.value) === id)?.label ?? id,
    );

    if (labels.length === 1) {
      return labels[0];
    }

    if (labels.length === 2) {
      return labels.join(', ');
    }

    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
  }

  private resolveShipFilterIds(): string[] {
    if (this.showShipFilter) {
      return this.toIdList(this.filterForm.get('ship')?.value);
    }

    const shipId = getUserShipId();
    return shipId ? [shipId] : [];
  }

  private toIdList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((id) => id != null && id !== '')
      .map((id) => String(id));
  }

  private joinIds(ids: string[]): string | undefined {
    return ids.length ? ids.join(',') : undefined;
  }

  private mapSelectOptions(
    options: { label: string; value: unknown }[],
  ): SelectOption[] {
    return options.map((option) => ({
      label: option.label,
      value: String(option.value),
    }));
  }

  private canShowCatalogueModifyActions(
    row: Record<string, unknown>,
  ): boolean {
    if (!this.isShipUser) {
      return true;
    }

    return Number(resolveCatalogueApprovedValue(row)) !== 1;
  }
}
