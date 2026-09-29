import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { defaultIfEmpty, finalize, forkJoin, of, Subject, takeUntil } from 'rxjs';
import { ColDef } from 'ag-grid-community';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
// import { AgActionCellComponent } from '../../ui/action-column.factory';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { AgActionCellComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { ApiService, DropdownOption } from '../../api.service';
import { ApprovalWorkFlow } from '../../ui/approval-work-flow/approval-work-flow';
import { AppService } from '../../../../../Core/services/app/app.service';
// import { ApprovalWorkFlow } from '../../ui/approval-work-flow';

export interface TransactionOptionMap {
  status: DropdownOption<string>[];
  ship: DropdownOption[];
  satelliteUnit: DropdownOption[];
  trialType: DropdownOption[];
  equipment: DropdownOption[];
  section: DropdownOption[];
  trialUnit: DropdownOption[];
  refitType: DropdownOption<string>[];
}

type StoredUser = Record<string, any> & {
  ship_id?: string | number | null;
  ship_name?: string | null;
};

const STATIC_STATUS: DropdownOption<string>[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

const STATIC_REFIT_TYPES: DropdownOption<string>[] = [
  { label: 'PRT', value: 'prt' },
  { label: 'ERT', value: 'ert' },
];

const DD = {
  nameId: { labelKey: 'name' as const, valueKey: 'id' as const },
  satelliteByTrial: 'trial_unit' as const,
  sectionBySatellite: 'satellite_unit_id' as const,
};

@Component({
  selector: 'app-transaction-return',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginateTableComponent, AddFormComponent, ApprovalWorkFlow, ReusableDeleteDialogComponent],
  templateUrl: './transaction-return.html',
  providers: [ApiService],
})
export class TransactionReturn implements OnInit, OnDestroy {
  @ViewChild(AddFormComponent) private readonly initiateForm?: AddFormComponent;
  @ViewChild('paginateTable') paginateTable!: PaginateTableComponent;

  addButtons = [
    { label: 'Initiate', key: 'add', show: true, cls: 'bg-blue-900 text-white' },
  ];
  initiateTitle = 'INITIATE RETURNS';
  showCreateLayout = false;
  dropdownsLoaded = false;
  fromDate = '';
  toDate = '';
  selectedStatus: string | null = null;
  selectedShip: string | number | null = null;
  selectedTrialType: string | null = null;
  selectedEquipment: string | number | null = null;
  selectedSatelliteUnit: string | number | null = null;
  rowData: any[] = [];
  formConfigForInitiateTrial: any[] = [];
  isDeleteDialogOpen = false;
  isDeleteLoading = false;
  deleteItem: any = null;
  fromEditData: Record<string, any> = {
    ship_id: this.getStoredUser()?.ship_id || null
  };

  TABS = [
    { key: 'operational_trial', label: 'Operational Trial' },
    { key: 'refit_trial', label: 'Refit Trial' }
  ];

  optionMap: TransactionOptionMap = {
    status: [...STATIC_STATUS],
    ship: [],
    satelliteUnit: [],
    trialType: [],
    equipment: [],
    section: [],
    trialUnit: [],
    refitType: [...STATIC_REFIT_TYPES],
  };

  private initiateCascade = { satelliteUnit: [] as DropdownOption[], trialType: [] as DropdownOption[] };
  private readonly destroy$ = new Subject<void>();

  // Update your columnDefs with proper date handling
  columnDefs: ColDef[] = [
    {
      headerName: '#',
      valueGetter: (params: any) => (params.node?.rowIndex ?? 0) + 1,
      minWidth: 50,
      maxWidth: 70,
      pinned: 'left',
      sortable: false,
      filter: false
    },
    {
      headerName: 'Date',
      field: 'return_date',
      flex: 1,
      // Add a value getter to handle different date formats and field names
      valueGetter: (params: any) => {
        if (!params.data) return '';

        // Try multiple possible date field names
        const dateValue = params.data.trial_date ||
          params.data.created_at ||
          params.data.created_date ||
          params.data.return_date ||
          params.data.date ||
          params.data.updated_at;

        if (!dateValue) return '';

        // Format the date
        try {
          const date = new Date(dateValue);
          if (isNaN(date.getTime())) return dateValue;

          // Format as DD/MM/YYYY
          return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
        } catch {
          return dateValue;
        }
      }
    },
    {
      headerName: 'Return Number',
      minWidth: 180,
      field: 'trial_number',
      flex: 1.2
    },
    {
      headerName: 'Ship',
      field: 'ship_name',
      flex: 1
    },
    {
      headerName: 'Return Type',
      field: 'trial_type_name',
      minWidth: 180,
      flex: 1.5
    },
    {
      headerName: 'Trial Unit',
      field: 'trial_unit_name',
      minWidth: 180,
      flex: 1
    },
    {
      headerName: 'Satellite Unit',
      field: 'satellite_unit_name',
      minWidth: 180,
      flex: 1
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
        // onMainAction: (row: any) => console.log('Main action', row),
        onAction: (k: string, r: any) => this.triggerOilModal(k, r),
        actions: [
          { key: 'edit', label: 'Edit', iconClass: 'fa fa-edit', btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200', hidden: (row: any) => row?.workflow_rights?.can_edit !== true },
          { key: 'view', label: 'View', iconClass: 'fa fa-eye', btnClass: 'bg-green-100 text-green-600 hover:bg-green-200', hidden: (row: any) => row?.workflow_rights?.can_edit === true },
          { key: 'status', label: 'Status', iconClass: 'fa fa-info-circle', btnClass: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
          { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash', btnClass: 'bg-red-100 text-red-600 hover:bg-red-200' },
          { key: 'report', label: 'Report', iconClass: 'fa-solid fa-file-lines', btnClass: 'bg-purple-100 text-purple-600 hover:bg-purple-200' }
        ]
      }
    }
  ];

  private readonly apiService = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly appService = inject(AppService);

  ngOnInit(): void {
    this.loadAllDropdowns();
    this.maybeOpenInitiateFromQuery();
  }

  /**
   * Ship dashboard "Fill Return" navigates here with `?openInitiate=1`.
   */
  private maybeOpenInitiateFromQuery(): void {
    const raw = this.route.snapshot.queryParamMap.get('openInitiate');
    const shouldOpen = raw === '1' || raw === 'true' || raw === 'yes';
    if (!shouldOpen) return;

    this.openInitiateForm();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { openInitiate: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getStoredUser(): StoredUser {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}') || {};
    } catch {
      return {};
    }
  }

  private loadAllDropdowns(): void {
    this.appService.showLoader();
    const user = this.getStoredUser();
    const hasStoredShip = this.hasVal(user?.ship_id);

    forkJoin({
      ships: hasStoredShip
        ? of([] as DropdownOption[])
        : this.apiService.getDropdownData('master/ships/', DD.nameId).pipe(defaultIfEmpty([])),
      satelliteUnits: this.apiService.getDropdownData('master/satellite-units/', DD.nameId).pipe(defaultIfEmpty([])),
      trialUnits: this.apiService.getDropdownData('master/trial-units/', DD.nameId).pipe(defaultIfEmpty([])),
      trialTypes: this.apiService.getDropdownData('master/trial-types/?type=returns', DD.nameId).pipe(defaultIfEmpty([]))
    })
      .pipe(
        finalize(() => {
          this.appService.hideLoader();
        })
      )
      .subscribe({
        next: (res) => {
          this.ngZone.run(() => {
            this.optionMap.ship = hasStoredShip
              ? [{ label: user?.ship_name || 'Selected Ship', value: user.ship_id }]
              : res.ships;
            this.optionMap.satelliteUnit = res.satelliteUnits;
            this.optionMap.trialUnit = res.trialUnits;
            this.optionMap.trialType = res.trialTypes;
            this.fromEditData = { ...this.fromEditData, ship_id: hasStoredShip ? user.ship_id : null };
            this.dropdownsLoaded = true;
            this.rebuildInitiateFormConfig();
            this.cdr.detectChanges();
          });
        }
      });
  }

  private initiateFieldLabel(fieldKey: string): string {
    switch (fieldKey) {
      case 'ship_id': return 'Select Ship';
      case 'trial_unit': return `Selected Trial Unit (${this.optionMap.trialUnit.length} available)`;
      case 'satellite_unit': return `Select Satellite Unit (${this.initiateCascade.satelliteUnit.length} available)`;
      case 'trial_type': return `Select Return Type (${this.optionMap.trialType.length} available)`;
      case 'refit_type': return 'Refit Type';
      default: return fieldKey;
    }
  }

  private rebuildInitiateFormConfig(): void {
    const hasStoredShip = this.hasVal(this.getStoredUser()?.ship_id);

    this.formConfigForInitiateTrial = [
      { label: this.initiateFieldLabel('ship_id'), key: 'ship_id', type: 'select', required: !hasStoredShip, options: this.optionMap.ship, placeholder: 'Select Ship', colSpan: 3, hide: hasStoredShip },
      { label: this.initiateFieldLabel('trial_unit'), key: 'trial_unit', type: 'select', required: true, options: this.optionMap.trialUnit, placeholder: 'Select Trial Unit', colSpan: 3 },
      { label: this.initiateFieldLabel('satellite_unit'), key: 'satellite_unit', type: 'radio', required: true, options: [...this.initiateCascade.satelliteUnit], placeholder: 'Select Satellite Unit', colSpan: 3 },
      { label: this.initiateFieldLabel('trial_type'), key: 'trial_type', type: 'select', required: true, options: this.optionMap.trialType, placeholder: 'Select Trial Type', colSpan: 3 }
    ];
    this.cdr.detectChanges();
  }

  private updateInitiateFieldOptions(fieldKey: string, options: DropdownOption[]): void {
    this.ngZone.run(() => {
      if (fieldKey === 'satellite_unit') this.initiateCascade.satelliteUnit = options;
      if (fieldKey === 'trial_type') {
        this.optionMap.trialType = options;
        this.initiateCascade.trialType = options;
      }
      this.formConfigForInitiateTrial = this.formConfigForInitiateTrial.map(field =>
        field.key === fieldKey ? { ...field, options: [...options], label: this.initiateFieldLabel(fieldKey) } : field
      );
      this.cdr.detectChanges();
    });
  }

  private hasVal(v: any): boolean { return v !== null && v !== undefined && v !== ''; }

  private clearInitiateFields(keys: string[]): void {
    const patch: Record<string, any> = {};
    keys.forEach(k => patch[k] = '');
    queueMicrotask(() => this.initiateForm?.patchFormPartial(patch));
  }

  onInitiateFieldChange(evt: { key: string; value: any; form?: any }): void {
    const { key, value } = evt;
    if (key === 'trial_unit') {
      this.clearInitiateFields(['satellite_unit', 'trial_type']);
      this.updateInitiateFieldOptions('trial_type', []);
      if (!this.hasVal(value)) {
        this.updateInitiateFieldOptions('satellite_unit', []);
        return;
      }
      this.apiService.getDropdownData('master/satellite-units/', DD.nameId, { [DD.satelliteByTrial]: value } as any)
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe(opts => this.updateInitiateFieldOptions('satellite_unit', opts));
    }
    if (key === 'satellite_unit') {
      this.clearInitiateFields(['trial_type']);
      this.updateInitiateFieldOptions('trial_type', []);
      if (!this.hasVal(value)) return;
      this.apiService.getDropdownData('master/trial-types/?type=returns', DD.nameId, { [DD.sectionBySatellite]: value } as any)
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe(opts => this.updateInitiateFieldOptions('trial_type', opts));
    }
  }

  clearFilters(): void {
    this.fromDate = ''; this.toDate = ''; this.selectedStatus = null;
    this.selectedShip = null; this.selectedTrialType = null;
    this.selectedEquipment = null; this.selectedSatelliteUnit = null;
  }

  openInitiateForm(): void {
    const user = this.getStoredUser();
    this.initiateCascade = { satelliteUnit: [], trialType: [] };
    this.optionMap.trialType = [];
    this.fromEditData = { ...this.fromEditData, ship_id: this.hasVal(user?.ship_id) ? user.ship_id : null };
    this.rebuildInitiateFormConfig();
    this.showCreateLayout = true;
  }

  handleInitiateSubmit(formValue: any): void {
    const user = this.getStoredUser();
    const shipId = this.hasVal(user?.ship_id) ? user.ship_id : formValue.ship_id;
    const shipName = this.hasVal(user?.ship_id)
      ? user?.ship_name || this.optionMap.ship.find(s => String(s.value) === String(shipId))?.label || ''
      : this.optionMap.ship.find(s => String(s.value) === String(shipId))?.label || '';

    console.log(formValue, '------------formValue--------------------------------------------')
    if (!this.hasVal(shipId)) {
      this.notificationService.error('Please select ship.');
      return;
    }

    const payload = {
      trial_unit_id: formValue.trial_unit,
      trial_type_id: formValue.trial_type,
      trial_unit_name: this.optionMap.trialUnit.find(t => t.value === formValue.trial_unit)?.label || '',
      satellite_unit_id: formValue.satellite_unit,
      satellite_unit_name: this.optionMap.satelliteUnit.find(s => s.value === formValue.satellite_unit)?.label || '',
      ship_id: shipId,
      ship_name: shipName
    };

    this.apiService.post('api/data/returns/', payload).subscribe({
      next: (response: any) => {

        this.router.navigate(
          ['afterAuth/ship-returns/returns/' + response?.trial_type_url],
          {
            queryParams: {
              trial: response?.uuid,
              type: 'returns'
            }
          }
        );
      },

      error: (err) => console.error('API ERROR', err)
    });
  }

  statusOpen = false;
  selectRowData: any = null;
  triggerOilModal(action: string, rowData: any): void {
    this.selectRowData = rowData;

    if (action === 'edit' || action === 'view') {

      this.router.navigate(
        ['afterAuth/ship-returns/returns/' + rowData?.trial_type_url],
        {
          queryParams: {
            trial: rowData?.uuid,
            type: 'returns'
          }
        }
      );

    } else if (action === 'status') {
      console.log('Status action triggered for:', rowData);
      this.statusOpen = true;
    } else if (action === 'delete') {
      this.openDeleteDialog(rowData);
    }
    else if (action === 'report') {
      this.router.navigate(['/afterAuth/ship-returns/returns/report-view'], {
        queryParams: {
          trial: rowData?.uuid,
          type: 'returns',
        },
      });

    }


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

    this.isDeleteLoading = true;
    this.apiService.post('api/data/returns/', { id: this.deleteItem.id, action: 'delete' }).pipe(
      finalize(() => {
        this.isDeleteLoading = false;
        this.closeDeleteDialog();
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: () => {
        // this.notificationService.success('Return deleted successfully');
        this.closeDeleteDialog();
        this.refreshTable();
      },
      error: (err) => {
        console.error('API ERROR', err);
        this.closeDeleteDialog();
        // this.notificationService.error('Failed to delete return. Please try again.');
      }
    });
  }

  onTabChange(tab: any): void {
    if (tab.key === 'operational_trial') {
      this.formConfigForInitiateTrial = this.formConfigForInitiateTrial.filter(f => f.key !== 'refit_type');
    } else {
      this.formConfigForInitiateTrial = [...this.formConfigForInitiateTrial, { label: this.initiateFieldLabel('refit_type'), key: 'refit_type', type: 'radio', visible: true, options: this.optionMap.refitType }];
    }
    this.cdr.detectChanges();
  }

  private refreshTable(): void { this.paginateTable.refreshTable(); }
}
