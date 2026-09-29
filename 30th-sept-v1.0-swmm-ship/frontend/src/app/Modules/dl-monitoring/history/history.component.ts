import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { DlApiService } from '../services/dl-api.service';
import { DlHistory } from '../models';
import { PanelCard } from '../../../shared/components/panel-card/panel-card';
import { DataGrid } from '../../../shared/components';
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';
import { ColDef } from 'ag-grid-community';
import { NotificationService } from '../../../Core/services/notification';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-dl-history',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PanelCard, DataGrid, HelpGuidance],
  templateUrl: './history.component.html',
  styleUrl: './history.component.css'
})
export class HistoryComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DlApiService);
  private readonly destroy$ = new Subject<void>();
  private readonly toaster = inject(NotificationService);
  readonly helpHtml = `<p class="fw-bold mb-3">A read-only, searchable log of closed DL records - equipment, DART/defect number, description, ship and yard remarks, and the dates from raising through work completion.</p>`;

  // Signals State
  readonly rowsSignal = signal<DlHistory[]>([]);
  readonly filterSignal = signal<string>('');
  readonly loadingSignal = signal<boolean>(false);

  filterControl = this.fb.nonNullable.control('');

  readonly columns: ColDef[] = [
    { headerName: 'Type', field: 'dl_type', width: 90 },
    { headerName: 'Department', field: 'sub_department', minWidth: 130 },
    { headerName: 'Equipment', field: 'equip_name', minWidth: 150 },
    { headerName: 'Defect No.', field: 'defect_no', minWidth: 120 },
    { headerName: 'DART No.', field: 'dart_no', minWidth: 120 },
    { headerName: 'Description', field: 'defect_description', minWidth: 220 },
    { headerName: 'Status', field: 'status', minWidth: 120 },
    { headerName: 'E & R', field: 'er_date_by_yard', minWidth: 120 },
    { headerName: 'Work Started', field: 'start_work_by_yard', minWidth: 130 },
    { headerName: 'Completed', field: 'complete_work_by_yard', minWidth: 130 },
    { headerName: 'Days', field: 'dl_work', width: 90 },
  ];

  // Computed Reactive Filtered Rows
  readonly filteredRows = computed<DlHistory[]>(() => {
    const rows = this.rowsSignal() || [];
    const q = (this.filterSignal() || '').toLowerCase().trim();

    if (!q) {
      return rows;
    }
    return rows.filter(r =>
      !!r && Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
    );
  });

  ngOnInit(): void {
    this.filterControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(val => {
      this.filterSignal.set(val || '');
    });

    this.loadHistory();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadHistory(): void {
    this.loadingSignal.set(true);
    this.api.history().pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        const fallback = res as unknown as { data?: DlHistory[]; results?: DlHistory[] };
        const data = Array.isArray(res) ? res : (fallback?.data ?? fallback?.results ?? []);
        this.rowsSignal.set(data);
        this.loadingSignal.set(false);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Failed to load DL history:', err);
        this.rowsSignal.set([]);
        this.loadingSignal.set(false);
        const errorMsg = err?.error?.message || err?.message || "Unable to connect to CMMS API.";
        this.toaster.error(errorMsg);
      }
    });
  }
}
