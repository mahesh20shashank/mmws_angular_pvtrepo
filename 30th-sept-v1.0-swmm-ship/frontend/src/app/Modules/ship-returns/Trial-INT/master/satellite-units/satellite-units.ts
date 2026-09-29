import { Component, ViewChild, OnInit, inject } from '@angular/core';
import { AgActionCellComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { ApiService } from '../../api.service';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { AppService } from '../../../../../Core/services/app/app.service';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';


@Component({
  selector: 'app-satellite-units',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PaginateTableComponent,
    AddFormComponent,
    ReusableDeleteDialogComponent
  ],
  templateUrl: './satellite-units.html',
})
export class SatelliteUnits implements OnInit {
  title = 'Add Satellite Unit';
  trialUnit = '';
  trialType: (string | number)[] = [];
  showCreateLayout = false;

  isEditMode = false;
  selectedRow: any = null;
  editFormData: any = {};
  isLoading = false;
  errorMessage = '';

  // Delete dialog properties
  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName = '';
  deleteLoading = false;

  @ViewChild(PaginateTableComponent) paginateTable!: PaginateTableComponent;
  trialUnitOptions: { label: string; value: any }[] = [];
  commandOptions: { label: string; value: string }[] = [];

  private readonly apiService = inject(ApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly appService = inject(AppService);

  ngOnInit(): void {
    this.loadDropdownData();
  }

  rowData: any[] = [];

  columnOilData = [
    { field: 'trial_unit_name', headerName: 'Trial Units', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'command_name', headerName: 'Command', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'name', headerName: 'Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'code', headerName: 'Code', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    {
      field: 'description',
      headerName: 'Description',
      filter: 'agTextColumnFilter',
      minWidth: 150,
     },
    {
      headerName: 'Action',
      field: 'actions',
      minWidth: 80,
      width: 80,
      maxWidth: 90,
      sortable: false,
      filter: false,
      pinned: 'right' as const,
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (k: string, r: any) => this.onGridAction(k, r),
        actions: [
          {
            key: 'edit',
            label: 'Edit',
            iconClass: 'fa fa-edit',
            btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
          },
          {
            key: 'delete',
            label: 'Delete',
            iconClass: 'fa fa-trash',
            btnClass: 'bg-red-100 text-red-600 hover:bg-red-200',
          },
        ],
      },
    },
  ];

  tabs = [
    {
      id: 'satellite-unit',
      label: 'Satellite Unit',
      icon: 'fa-solid fa-oil-can',
      url: 'master/satellite-units/?page=1&search=',
      columnDefs: this.columnOilData
    },
  ];

  addButtons = [
    { label: 'Create Satellite Unit', key: 'add', show: true, cls: 'bg-blue-900 text-white' },
  ];

  activeTab = this.tabs[0];

  setActiveTab(tab: any) {
    this.activeTab = tab;
    this.rowData = [];
  }

  formConfigForNewDetails: any[] = [
    {
      label: 'Select Trial Unit',
      key: 'trialUnit',
      type: 'select',
      required: true,
      options: this.trialUnitOptions,
      labelKey: 'label',
      valueKey: 'value',
      placeholder: 'Select Trial Unit'
    },
    {
      label: 'Command',
      key: 'command',
      type: 'select',
      required: true,
      options: this.commandOptions,
      labelKey: 'label',
      valueKey: 'value',
      placeholder: 'Select Ship'
    },
    {
      label: 'Name',
      key: 'name',
      type: 'text',
      required: true,
      placeholder: 'Enter Trial Unit Name'
    },
    {
      label: 'Description',
      key: 'descriptions',
      type: 'textarea',
      required: true,
      placeholder: 'Enter Description',
      rows: 2
    },
    {
      label: 'Code',
      key: 'code',
      type: 'text',
      required: false,
      placeholder: 'Enter Code'
    },
    {
      label: 'Sequence',
      key: 'sequence',
      type: 'number',
      required: true,
      placeholder: 'Enter Sequence',
      min: 0
    },
    {
      label: 'Active',
      key: 'active',
      type: 'checkbox',
      defaultValue: true
    }
  ];

  openAddPopup(): void {
    this.isEditMode = false;
    this.selectedRow = null;
    this.editFormData = { active: true };
    this.title = 'Add Satellite Unit';
    this.errorMessage = '';
    this.showCreateLayout = true;
  }

  closeAddPopup(): void {
    this.showCreateLayout = false;
    this.isEditMode = false;
    this.selectedRow = null;
    this.editFormData = {};
    this.errorMessage = '';
  }

  onBackdropClick(): void {
    this.closeAddPopup();
  }

  onSaveAddEquipment(): void {
    this.closeAddPopup();
  }

  private onGridAction(key: string, row: any): void {
    if (key === 'edit') {
      this.openEditPopup(row);
    } else if (key === 'delete') {
      this.openDeleteDialog(row);  // Changed from handleDelete to openDeleteDialog
    }
  }

  headerTitle = '';

  openEditPopup(row: any): void {
    this.isEditMode = true;
    this.selectedRow = row;
    this.title = 'Edit Satellite Unit';
    this.errorMessage = '';

    // Build formData object that AddFormComponent reads via this.formData[field.key]
    this.editFormData = {
      trialUnit: row.trial_unit ?? '',
      command: row.command ?? '',
      name: row.name ?? '',
      descriptions: row.description ?? row.descriptions ?? '',
      code: row.code ?? '',
      sequence: row.sequence ?? 0,
      active: true,
    };

    this.showCreateLayout = true;
  }

  triggerOilModal(key: string, rowData?: any, headerTitle?: string): void {
    this.headerTitle = headerTitle || '';
    if (key === 'add') {
      this.openAddPopup();
    } else if (key === 'edit') {
      this.openEditPopup(rowData);
    }
  }

  handleSubmit(formData: any): void {
    if (this.isEditMode) {
      this.handleEdit(formData);
    } else {
      this.handleCreate(formData);
    }
  }

  private buildPayload(formData: any): object {
    return {
      trial_unit: formData.trialUnit,
      command: formData.command,
      name: formData.name,
      code: formData.code,
      description: formData.descriptions,
      sequence: formData.sequence ?? 1,
      // Backend rejects `0` for this field; inactive rows are handled via soft delete (`active: 3`).
      active: 1,
    };
  }

  private handleCreate(formData: any): void {
    this.isLoading = true;
    this.errorMessage = '';

    const payload = this.buildPayload(formData);

    this.apiService.post('master/satellite-units/', payload).subscribe({
      next: () => {
        this.isLoading = false;
        this.closeAddPopup();
        this.refreshTable();
        this.notificationService.success('Satellite Unit created successfully');
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.detail || 'Failed to create. Please try again.';
        this.notificationService.error(this.errorMessage);
      },
    });
  }

  private handleEdit(formData: any): void {
    this.isLoading = true;
    this.errorMessage = '';

    const id = this.selectedRow?.id;
    const payload = { ...this.buildPayload(formData), id };

    this.apiService.post(`master/satellite-units/${id}/`, payload).subscribe({
      next: () => {
        this.isLoading = false;
        this.closeAddPopup();
        this.refreshTable();
        this.notificationService.success('Satellite Unit updated successfully');
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.detail || 'Failed to update. Please try again.';
        this.notificationService.error(this.errorMessage);
      },
    });
  }

  // Delete Dialog Methods
  openDeleteDialog(row: any): void {
    this.deleteId = row?.id;
    this.deleteName = row?.name || 'this satellite unit';
    this.showDeleteDialog = true;
  }

  closeDeleteDialog(): void {
    this.showDeleteDialog = false;
    this.deleteId = null;
    this.deleteName = '';
    this.deleteLoading = false;
  }

  confirmDelete(): void {
    if (!this.deleteId) return;

    this.deleteLoading = true;

    // Using soft delete with active=3
    this.apiService.post(`master/satellite-units/${this.deleteId}/`, { id: this.deleteId, active: 3 }).subscribe({
      next: () => {
        this.deleteLoading = false;
        this.closeDeleteDialog();
        this.refreshTable();
        this.notificationService.success('Satellite Unit deleted successfully');
      },
      error: (err: any) => {
        console.error('Error deleting satellite unit:', err);
        this.deleteLoading = false;
        const errorMsg = err?.error?.detail || 'Failed to delete. Please try again.';
        this.notificationService.error(errorMsg);
      },
    });
  }

  private refreshTable(): void {
    if (this.paginateTable) {
      this.paginateTable.loadData();
    }
  }

  private mapUnitOptions(source: any[]): { label: string; value: any }[] {
    if (!Array.isArray(source)) return [];
    return source
      .map((row: any) => ({
        label: String(row?.name ?? row?.unit_name ?? row?.TrialUnit ?? row?.label ?? '').trim(),
        value: row?.id ?? row?.value ?? row?.unit_id ?? row?.TrialUnit ?? '',
      }))
      .filter((x) => !!x.label && x.value !== '');
  }

  private loadDropdownData(): void {
    this.appService.showLoader();
    forkJoin({
      trialUnits: this.apiService.get('master/trial-units/').pipe(catchError(() => of([]))),
      commands: this.apiService.get('master/commands/').pipe(catchError(() => of([])))
    })
      .pipe(
        finalize(() => {
          this.appService.hideLoader();
        })
      )
      .subscribe({
        next: (res: any) => {
          const unitOpts = this.mapUnitOptions(res.trialUnits?.data ?? res.trialUnits ?? []);
          this.trialUnitOptions = unitOpts;
          const tuField = this.formConfigForNewDetails.find(f => f.key === 'trialUnit');
          if (tuField) {
            tuField.options = unitOpts;
          }

          const cmdData = res.commands?.data || res.commands || [];
          const cmdOpts = cmdData.map((cmd: any) => ({
            label: cmd?.command || cmd?.name || 'Unknown',
            value: cmd?.id || cmd?.command_id || ''
          }));
          this.commandOptions = cmdOpts;
          const cmdField = this.formConfigForNewDetails.find(f => f.key === 'command');
          if (cmdField) {
            cmdField.options = cmdOpts;
          }
        },
        error: (err) => {
          console.error('API Error:', err);
          this.notificationService.error('Failed to load dropdown data');
        }
      });
  }
}
