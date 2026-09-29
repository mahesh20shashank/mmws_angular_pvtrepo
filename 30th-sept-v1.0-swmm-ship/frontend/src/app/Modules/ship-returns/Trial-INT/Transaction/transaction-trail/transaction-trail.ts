import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import {
  ApiService,
  DropdownOption,
  RequestParams,
} from '../../api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { InitiateTrialsDialogComponent } from './initiate-trials-dialog.component';
import { CreateTrialPassDialogComponent } from './create-trial-pass-dialog.component';
import { TransactionOptionMap } from './initiate-trials-dialog.types';
import { ColDef } from 'ag-grid-community';
import { AgActionCellComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { defaultIfEmpty, finalize, forkJoin, Subject, debounceTime } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
// import { ReusableDeleteDialogComponent } from '../../ui/reusable-delete-dialog/reusable-delete-dialog.component';
import { ApprovalWorkFlow } from '../../ui/approval-work-flow/approval-work-flow';
import { equipmentHtml } from '../../ApiEndPoints';
import { SelectComponent } from '../../ui/select.component';
import { TrailService } from '../../trail.service';
import { AppService } from '../../../../../Core/services/app/app.service';


/** Keys for `getDropdownData` in loadAllDropdowns */
const DROPDOWN_KEYS = {
  nameId: { labelKey: 'name' as const, valueKey: 'id' as const },
  nameHtml: {
    labelKey: 'name' as const,
    valueKey: 'id' as const,
    htmlTag: `
      <div>
        <div class="font-bold text-[15px] leading-[1.05]">
          {{item.name}}
        </div>
        <div class="text-[12px] text-gray-700 mt-[2px]">
          Equipment Nomenclature: {{item.nomenclature || '-'}}<span *ngIf="item.nomenclature">,</span>
          Model: {{item.model || '-'}}<span *ngIf="item.model">,</span>
          Serial Number: {{item.serial_no || '-'}}
        </div>
      </div>
    ` as const,
  },
};

// Static dropdowns for status and refit type
const STATIC_STATUS: DropdownOption<string>[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

const STATIC_REFIT_TYPES: DropdownOption<string>[] = [
  { label: 'PRT', value: 'prt' },
  { label: 'ERT', value: 'ert' },
];

@Component({
  selector: 'app-transaction-trail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PaginateTableComponent,
    InitiateTrialsDialogComponent,
    CreateTrialPassDialogComponent,
    ReusableDeleteDialogComponent,
    ApprovalWorkFlow,
    SelectComponent
  ],
  templateUrl: './transaction-trail.html',
  providers: [ApiService, TrailService],
})
export class TransactionTrail implements OnInit, OnDestroy {
  private readonly apiService = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly trailService = inject(TrailService);
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly appService = inject(AppService);

  @ViewChild(InitiateTrialsDialogComponent)
  private readonly initiateTrialsDialog?: InitiateTrialsDialogComponent;
  @ViewChild(CreateTrialPassDialogComponent)
  private readonly createTrialPassDialog?: CreateTrialPassDialogComponent;
  @ViewChild('pagination') pagination?: PaginateTableComponent;

  isViewMode = false;
  addButtons = [
    { label: 'Initiate', key: 'add', show: true, cls: 'bg-blue-900 text-white' },
  ];

  // UI control variables
  initiateTitle = 'INITIATE TRIALS';
  showCreateLayout = false;
  showTrialPassLayout = false;
  showApprovalWorkflowPopup = false;
  selectedWorkflowTrialId: string | null = null;
  selectedWorkflowRowData: any = null;
  //Tanishk --> To close pop-up history
  autoOpenHistory = false;

  // Filter values
  fromDate = '';
  toDate = '';
  selectedStatus: string | null = null;
  selectedShip: string | number | null = null;
  selectedTrialType: string | null = null;
  selectedEquipment: string | number | null = null;
  selectedSatelliteUnit: string | number | null = null;
  selectedTrialUnit: string | number | null = null;
  selectedSection: string | number | null = null;

  // Track current URL to force change detection
  currentTableUrl = 'api/data/trials/';

  /**
   * Options for all dropdowns, shared between filter and form
   */
  optionMap: TransactionOptionMap = {
    status: [...STATIC_STATUS],
    ship: [],
    satelliteUnit: [],
    subSatelliteUnit: [],
    trialType: [],
    equipment: [],
    section: [],
    trialUnit: [],
    refitType: [...STATIC_REFIT_TYPES],
  };

  private readonly destroy$ = new Subject<void>();
  dropdownsLoaded = false;
  private readonly filterChangeSubject = new Subject<void>();
  rowData: any[] = [];

  /** Options shown by the status filter. */
  readonly statusOptions: DropdownOption<string>[] = [
    { label: 'Approved', value: 'approved' },
    { label: 'In Progress with ship', value: 'ship' },
    { label: 'In Progress with trial unit', value: 'trial' },
  ];

  /**
   * Column definitions for ag-grid table
   */
  columnDefs: ColDef[] = [
    {
      headerName: '#',
      valueGetter: (params: any) => (params.node?.rowIndex ?? 0) + 1,
      minWidth: 50,
      maxWidth: 70,
      filter: false,
    },
    { headerName: 'Date', field: 'trial_date', flex: 1, },
    { headerName: 'Trial Number', field: 'trial_number', flex: 1.2, minWidth: 180 },
    { headerName: 'Trial Unit', field: 'trial_unit_name', flex: 1, minWidth: 150 },
    { headerName: 'Satellite Unit', field: 'satellite_unit_name', flex: 1, minWidth: 180 },
    { headerName: 'Ship', field: 'ship_name', flex: 1, minWidth: 150 },
    { headerName: 'Trial Type', field: 'trial_type_name', flex: 1.5, minWidth: 150 },
    {
      headerName: 'Equipment',
      field: 'equipment_details',
      minWidth: 250,
      flex: 2,
      cellRenderer: (params: any) => {
        const details = params.data.equipment_details;
        if (Array.isArray(details) && details.length > 0) {
          return details
            .map((item: any) => {
              const equipmentName = item.equipment_name || '';
              const nomenclature = item.nomenclature ? ` (${item.nomenclature})` : '';
              return `${equipmentName}${nomenclature}`;
            })
            .join('<br/>');
        }
        return '';
      }
    },
    {
      headerName: 'Action',
      field: 'actions',
      minWidth: 180,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onMainAction: (row: any) => console.log('Main action', row),
        onAction: (k: string, r: any) => this.triggerOilModal(k, r),
        actions: [
          {
            key: 'edit',
            label: 'Edit',
            iconClass: 'fa fa-edit',
            btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
            hidden: (row: any) => row?.workflow_rights?.can_edit !== true,
          },
          { key: 'view', label: 'View', iconClass: 'fa fa-eye', btnClass: 'bg-green-100 text-green-600 hover:bg-green-200', hidden: (row: any) => row?.workflow_rights?.can_edit === true },
          { key: 'status', label: 'Status', iconClass: 'fa fa-info-circle', btnClass: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200', hidden: (row: any) => row?.workflow_rights?.can_edit !== true },
          { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash', btnClass: 'bg-red-100 text-red-600 hover:bg-red-200' },
          {
            key: 'report', label: 'Report',
            iconClass: 'fa-solid fa-file-lines',
            btnClass: 'bg-purple-100 text-purple-600 hover:bg-purple-200',

          },
        ]
      }
    }
  ];

  trialPassData: any;
  isDeleteDialogOpen = false;
  isDeleteLoading = false;
  deleteItem: any = null;

  constructor(
  ) {
    // Setup filter change debouncing
    this.filterChangeSubject
      .pipe(
        debounceTime(300)
      )
      .subscribe(() => {
        this.applyFilters();
      });
  }

  /**
   * On component init, load all dropdowns required for filters/forms
   */
  ngOnInit(): void {
    this.applyEquipmentFiltersFromRoute();
    this.loadAllDropdowns();
  }

  /** Optional: `?ship_id=&trial_unit_id=&section=` drive `master/equipments/` params on load */
  private applyEquipmentFiltersFromRoute(): void {
    const q = this.route.snapshot.queryParamMap;
    const ship = q.get('ship_id') ?? q.get('ship');
    const trialUnit = q.get('trial_unit_id') ?? q.get('trial_unit');
    const section = q.get('section_id') ?? q.get('section');
    if (ship != null && ship !== '') {
      this.selectedShip = ship;
    }
    if (trialUnit != null && trialUnit !== '') {
      this.selectedTrialUnit = trialUnit;
    }
    if (section != null && section !== '') {
      this.selectedSection = section;
    }
  }

  /**
   * On destroy: cleanup subscriptions
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.filterChangeSubject.complete();
  }

  /**
   * Query params for `master/equipments/` (ship_id, trial_unit_id, section) when filter fields are set.
   */
  private equipmentDropdownParams(): RequestParams | undefined {
    const p: RequestParams = {};
    if (this.selectedShip != null && this.selectedShip !== '') {
      p['ship_id'] = this.selectedShip;
    }
    if (this.selectedTrialUnit != null && this.selectedTrialUnit !== '') {
      p['trial_unit_id'] = this.selectedTrialUnit;
    }
    if (this.selectedSection != null && this.selectedSection !== '') {
      p['section'] = this.selectedSection;
    }
    return Object.keys(p).length ? p : undefined;
  }

  /**
   * Load all dropdown options for filters & forms in parallel,
   * then populate the optionMap with results.
   */
  private loadAllDropdowns(): void {
    this.appService.showLoader();
    const keys = DROPDOWN_KEYS;
    forkJoin({
      ships: this.apiService.getDropdownData('master/ships/', keys.nameId).pipe(defaultIfEmpty([])),
      satelliteUnits: this.apiService.getDropdownData('master/satellite-units/', keys.nameId).pipe(defaultIfEmpty([])),
      trialUnits: this.apiService.getDropdownData('master/trial-units/', keys.nameId).pipe(defaultIfEmpty([])),
      sections: this.apiService.getDropdownData('master/sections/', keys.nameId).pipe(defaultIfEmpty([])),
      equipments: this.apiService
        .getDropdownData(
          'master/equipments/',
          equipmentHtml,
          this.equipmentDropdownParams(),
        )
        .pipe(defaultIfEmpty([])),
    })
      .pipe(
        finalize(() => {
          this.appService.hideLoader();
        })
      )
      .subscribe({
        next: (res) => {
          this.ngZone.run(() => {
            this.optionMap.ship = res.ships;
            this.optionMap.satelliteUnit = res.satelliteUnits;
            this.optionMap.trialUnit = res.trialUnits;
            this.optionMap.section = res.sections;
            this.optionMap.equipment = res.equipments;
            this.dropdownsLoaded = true;
            this.cdr.markForCheck();
            this.cdr.detectChanges();
            this.maybeOpenInitiateTrialFromQuery();
          });
        },
      });
  }

  /**
   * Advance Trial "Trial Pass" button navigates here with `?openInitiate=1` to show INITIATE TRIALS modal.
   */
  private maybeOpenInitiateTrialFromQuery(): void {
    const raw = this.route.snapshot.queryParamMap.get('openInitiate');
    const shouldOpen = raw === '1' || raw === 'true' || raw === 'yes';
    if (!shouldOpen) {
      return;
    }
    this.openInitiateForm();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { openInitiate: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Called when any filter value changes
   */
  onFilterChange(): void {
    this.filterChangeSubject.next();
  }

  /** Keep the emitted custom-select value in sync before rebuilding the URL. */
  onStatusChange(value: string | null): void {
    this.selectedStatus = value;
    this.onFilterChange();
  }

  /**
   * Get filter parameters for the API request
   */
  getFilterParams(): RequestParams {
    const params: RequestParams = {};

    if (this.selectedTrialUnit != null && this.selectedTrialUnit !== '') {
      params['trial_unit_id'] = this.selectedTrialUnit;
    }
    if (this.selectedStatus != null && this.selectedStatus !== '') {
      params['status'] = this.selectedStatus;
    }

    if (this.fromDate) {
      params['from_date'] = this.fromDate;
    }
    if (this.toDate) {
      params['to_date'] = this.toDate;
    }
    if (this.selectedShip != null && this.selectedShip !== '') {
      params['ship_id'] = this.selectedShip;
    }
    if (this.selectedTrialType != null && this.selectedTrialType !== '') {
      params['trial_type_id'] = this.selectedTrialType;
    }
    if (this.selectedEquipment != null && this.selectedEquipment !== '') {
      params['equipment_id'] = this.selectedEquipment;
    }
    if (this.selectedSatelliteUnit != null && this.selectedSatelliteUnit !== '') {
      params['satellite_unit_id'] = this.selectedSatelliteUnit;
    }
    if (this.selectedSection != null && this.selectedSection !== '') {
      params['section_id'] = this.selectedSection;
    }

    return params;
  }

  /**
   * Build the table URL with query parameters
   */
  getTableUrl(): string {
    const params = this.getFilterParams();
    const queryString = Object.keys(params)
      .filter(key => params[key] != null && params[key] !== '')
      .map(key => `${key}=${encodeURIComponent(String(params[key]))}`)
      .join('&');

    return queryString ? `api/data/trials/?${queryString}` : 'api/data/trials/';
  }

  /**
   * Apply filters by refreshing the table
   */
  private applyFilters(): void {
    this.currentTableUrl = this.getTableUrl();
    this.cdr.detectChanges();
  }

  /**
   * Reset all filters
   */
  clearFilters(): void {
    this.fromDate = '';
    this.toDate = '';
    this.selectedStatus = null;
    this.selectedShip = null;
    this.selectedTrialType = null;
    this.selectedEquipment = null;
    this.selectedSatelliteUnit = null;
    this.selectedTrialUnit = null;
    this.selectedSection = null;

    // Apply the cleared filters
    this.applyFilters();
  }

  /**
   * Open INITIATE TRIALS dialog
   */
  openInitiateForm(): void {
    this.initiateTrialsDialog?.openForm();
  }

  /**
   * Handle action clicks from the table
   */
  triggerOilModal(action: string, rowData: any): void {
    console.log('Action Clicked:', action);
    console.log('Row Data Clicked:', rowData);

    if (action === 'view' || action === 'edit') {
      this.trailService.setTrialPayload(rowData);
      console.log('Data Stored In Service:', rowData);
      this.navigateToTrialTypeRoute(rowData);
    }
    if (action === 'status') {
      this.openApprovalWorkflow(rowData);
    }
    if (action === 'delete') {
      this.openDeleteDialog(rowData);
    }
    if (action === 'report') {
      const trialUuid = rowData?.uuid || rowData?.trial_uuid || '';
      this.router.navigate(['/afterAuth/ship-returns/trials/report-view'], {
        queryParams: {
          trial: trialUuid,
          type: 'trials',
        },
      });
    }
  }

  private navigateToTrialTypeRoute(rowData: any): void {
    // this.trailService.trialTypeNavigateOptions( '/afterAuth/'+rowData?.trial_type_url, rowData?.uuid )
    const rawUrl = '/afterAuth/ship-returns/trials/' + rowData?.trial_type_url;
    const trialUuid = rowData?.uuid || rowData?.trial_uuid || '';
    console.log('Navigating to URL:', rawUrl, 'with trial UUID:', trialUuid);

    if (!rawUrl) {
      this.router.navigate(['/wrstg/mfstar-failure-report']);
      return;
    }

    const normalizedPath = rawUrl.startsWith('/') ? `${rawUrl}` : `${rawUrl}`;
    const queryParams = trialUuid ? { trial: trialUuid, type: 'trials' } : undefined;
    console.log('Normalized Path:', normalizedPath, 'Query Params:', queryParams);
    this.router.navigate([normalizedPath], { queryParams });
  }

  private openApprovalWorkflow(rowData: any): void {
    this.selectedWorkflowTrialId = rowData?.uuid || rowData?.trial_uuid || null;
    this.selectedWorkflowRowData = rowData || null;
    //To open history pop-up --> Tanishk
    this.autoOpenHistory = true;
    this.showApprovalWorkflowPopup = true;
  }

  openDeleteDialog(item: any): void {
    this.deleteItem = item;
    this.isDeleteDialogOpen = true;
  }

  closeDeleteDialog(): void {
    this.isDeleteDialogOpen = false;
    this.deleteItem = null;
  }

  confirmDelete(): void {
    if (!this.deleteItem?.id) return;

    const trialUuid = this.deleteItem?.uuid || this.deleteItem?.trial_uuid || null;
    const payload = {
      active: 3,
      ...(trialUuid ? { id: trialUuid } : {})
    };

    this.isDeleteLoading = true;

    this.apiService.post('api/data/trials/', payload).pipe(
      finalize(() => {
        this.ngZone.run(() => {
          this.isDeleteLoading = false;
          this.cdr.detectChanges();
        });
      })
    ).subscribe({
      next: (res: any) => {
        console.log('DELETE SUCCESS', res);
        this.ngZone.run(() => {
          this.notificationService.success('Trial deleted successfully');
          this.closeDeleteDialog();
          if (this.pagination && typeof this.pagination.refreshTable === 'function') {
            this.pagination.refreshTable();
          }
          this.cdr.detectChanges();
        });
      },
      error: (err: any) => {
        console.error('DELETE ERROR', err);
        this.ngZone.run(() => {
          this.notificationService.error(err?.message || 'Failed to delete record');
          this.cdr.detectChanges();
        });
      }
    });
  }
}
