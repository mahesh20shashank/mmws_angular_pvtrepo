import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { ApiService } from '../../api.service';
import { Apiendpoints } from '../../ApiEndPoints';
import { RefitAddComponent } from '../refit-add/refit-add.component';
import { AgActionCellComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';

@Component({
  selector: 'app-refit-view',
  standalone: true,
  templateUrl: './refit-view.component.html',
  imports: [
    CommonModule,
    PaginateTableComponent,
    RefitAddComponent,
    ReusableDeleteDialogComponent,
  ],
})
export class RefitViewComponent implements OnInit {
  page = 1;
  totalPages = 0;
  totalCount = 0;
  isEditMode = false;
  isViewMode = false;
  selectedRow: any = null;
  isFormOpen = false;
  isLoading = false;
  isDeleteLoading = false;
  isDeleteDialogOpen = false;
  deleteRow: any = null;

  rowData: any[] = [];

  columnDefs = [
    {
      field: 'name',
      headerName: 'Type of Refit',
      filter: 'agTextColumnFilter',
    },
    {
      headerName: 'Status',
      field: 'active',
      filter: true,
      cellRenderer: (params: any) => {
        const isActive = params.value === 1;
        const statusClass = isActive ? 'status-active' : 'status-inactive';
        const label = isActive ? 'Active' : 'Inactive';

        return `
        <span class="status-badge ${statusClass}">
          ${label}
        </span>
      `;
      },
    },
    {
      headerName: 'Actions',
      cellRenderer: AgActionCellComponent,
      sortable: false,
      filter: false,
      floatingFilter: false,
      resizable: false,
      suppressMenu: true,
      cellRendererParams: {
        editCallback: (row: any) => this.handleEdit(row),
        deleteCallback: (row: any) => this.openDeleteDialog(row),
        viewCallback: (row: any) => this.handleView(row),
      },
    },
  ];

  constructor(
    private apiService: ApiService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  handleEdit(row: any): void {
    this.isEditMode = true;
    this.isViewMode = false;
    this.selectedRow = row;
    this.isFormOpen = true;
    this.cdr.detectChanges();
  }

  handleView(row: any): void {
    this.isViewMode = true;
    this.isEditMode = false;
    this.selectedRow = row;
    this.isFormOpen = true;
    this.cdr.detectChanges();
  }

  openDeleteDialog(row: any): void {
    this.deleteRow = row;
    this.isDeleteDialogOpen = true;
    this.cdr.detectChanges();
  }

  ngOnInit(): void {
    this.fetchRefitMaster(this.page);
  }

  openAddRefit(): void {
    this.isEditMode = false;
    this.isViewMode = false;
    this.selectedRow = null;
    this.isFormOpen = true;
    this.cdr.detectChanges();
  }

  closeAddForm(): void {
    this.isFormOpen = false;
    this.isEditMode = false;
    this.isViewMode = false;
    this.selectedRow = null;
    this.fetchRefitMaster(this.page);
    this.cdr.detectChanges();
  }

  fetchRefitMaster(pageNum: number = 1, pageSize: number = 10): void {
    this.isLoading = true;
    this.rowData = [];
    this.totalCount = 0;
    this.totalPages = 0;

    this.apiService
      .get(`${Apiendpoints.MASTER_REFITS}?page=${pageNum}`)
      .subscribe({
        next: (res: any) => {
          this.rowData = res?.results || [];
          this.totalCount = res?.count || 0;
          this.totalPages = Math.ceil(this.totalCount / pageSize) || 1;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to fetch refits', err);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        complete: () => {
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  onPageChange(event: { page: number; pageSize: number }): void {
    this.page = event.page;
    this.fetchRefitMaster(event.page, event.pageSize);
  }

  confirmDelete(): void {
    if (!this.deleteRow) return;
    this.isDeleteLoading = true;
    const payload = {
      id: this.deleteRow.id,
      delete: true,
    };

    this.apiService.post(Apiendpoints.MASTER_REFITS, payload).subscribe({
      next: (res: any) => {
        this.isDeleteLoading = false;
        this.notificationService.success(
          res?.message || 'Successfully deleted the selected record',
        );
        this.closeDeleteDialog();
        this.fetchRefitMaster(this.page);
      },
      error: () => {
        this.isDeleteLoading = false;
        this.notificationService.error('Failed to delete the selected record');
      },
    });
  }

  closeDeleteDialog(): void {
    this.isDeleteDialogOpen = false;
    this.deleteRow = null;
    this.cdr.detectChanges();
  }
}
