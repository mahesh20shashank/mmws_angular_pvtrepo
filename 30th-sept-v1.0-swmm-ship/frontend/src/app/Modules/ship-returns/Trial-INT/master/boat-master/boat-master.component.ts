import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { Apiendpoints } from '../../ApiEndPoints';
import { ApiService } from '../../api.service';
import { AgActionCellComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { BoatMasterAddComponent } from '../boat-master-add/boat-master-add.component';

@Component({
  selector: 'app-boat-master',
  standalone: true,
  templateUrl: './boat-master.component.html',
  imports: [
    CommonModule,
    PaginateTableComponent,
    BoatMasterAddComponent,
    ReusableDeleteDialogComponent,
  ],
})
export class BoatMasterComponent implements OnInit {
  page = 1;
  totalPages = 0;
  totalCount = 0;

  isFormOpen = false;
  isEditMode = false;
  isViewMode = false;
  selectedRow: any = null;
  isLoading = false;
  isDeleteLoading = false;

  isDeleteDialogOpen = false;
  deleteRow: any = null;
  isNewEntryAdded = false;

  constructor(
    private apiService: ApiService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}
  rowData: any[] = [];

  columnDefs = [
    {
      field: 'ship_name',
      headerName: 'Ship',
      filter: 'agTextColumnFilter',
    },
    {
      field: 'boat_oem',
      headerName: 'Boat OEM',
      filter: 'agTextColumnFilter',
    },
    {
      field: 'registration_no',
      headerName: 'Registration No.',
      filter: 'agTextColumnFilter',
    },

    {
      field: 'type_of_boat',
      headerName: 'Type of Boat',
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

  handleEdit(row: any): void {
    this.ngZone.run(() => {
      this.isEditMode = true;
      this.isViewMode = false;
      this.selectedRow = row;
      this.isFormOpen = true;

      this.cdr.detectChanges();
    });
  }

  handleView(row: any): void {
    this.ngZone.run(() => {
      this.isViewMode = true;
      this.isEditMode = false;
      this.selectedRow = row;
      this.isFormOpen = true;

      this.cdr.detectChanges();
    });
  }

  openDeleteDialog(row: any) {
    this.ngZone.run(() => {
      this.deleteRow = row;
      this.isDeleteDialogOpen = true;

      this.cdr.detectChanges();
    });
  }

  ngOnInit(): void {
    this.fetchBoatMastersData(this.page);
  }

  openAddShip(): void {
    this.isEditMode = false;
    this.isViewMode = false;
    this.isFormOpen = true;
  }

  closeAddForm(): void {
    this.isFormOpen = false;

    if (this.isNewEntryAdded) {
      this.fetchBoatMastersData(this.page);
      this.isNewEntryAdded = false;
    }
  }
  // ---------------------------------------------- FETCH UNIT MASTER DATA -----------------------------
  fetchBoatMastersData(pageNum: number = 1, size: number = 10): void {
    this.isLoading = true;

    this.apiService
      .get(`${Apiendpoints.BOAT_MASTER}?page=${pageNum}&page_size=${size}`)
      .subscribe({
        next: (res: any) => {
          this.rowData = res?.results || [];
          this.totalCount = res?.count || 0;
          this.totalPages = Math.ceil(this.totalCount / size);
          this.cdr.detectChanges();
        },
        error: () => {
          this.isLoading = false;
        },
        complete: () => {
          this.isLoading = false;
        },
      });
  }

  onPageChange(event: { page: number; pageSize: number }): void {
    this.page = event.page;
    this.fetchBoatMastersData(event.page, event.pageSize); // ✅ removed the guard that was blocking same page
  }

  confirmDelete() {
    if (!this.deleteRow) return;
    this.isDeleteLoading = true;
    const payload = {
      id: this.deleteRow.id,
      delete: true,
    };

    this.apiService.post(`${Apiendpoints.BOAT_MASTER}`, payload).subscribe({
      next: (res: any) => {
        this.isDeleteLoading = false;
        this.notificationService.success(
          res?.message || 'Successfully deleted the selected record',
        );
        this.closeDeleteDialog();
        this.fetchBoatMastersData(this.page);
      },
      error: () => {
        this.isDeleteLoading = false;
        this.notificationService.error('Failed to delete the selected record');
      },
    });
  }

  closeDeleteDialog() {
    this.isDeleteDialogOpen = false;
    this.deleteRow = null;
  }
}
