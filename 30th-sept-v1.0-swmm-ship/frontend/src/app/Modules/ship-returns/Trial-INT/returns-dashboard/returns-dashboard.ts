import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';
import { KpiCard } from '../../../../shared/components/kpi-card/kpi-card';
import { Apiendpoints } from '../ApiEndPoints';

type ReturnRecord = Record<string, any>;

@Component({
  selector: 'app-returns-dashboard',
  standalone: true,
  imports: [CommonModule, KpiCard],
  templateUrl: './returns-dashboard.html',
  styleUrl: './returns-dashboard.css',
  providers: [ApiService],
})
export class ReturnsDashboardComponent implements OnInit {
  returns: ReturnRecord[] = [];
  loading = true;
  loadFailed = false;
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.api.get<any>(Apiendpoints.DTTT_RETURN_DASHBOARD).subscribe({
      next: (response) => {
        this.returns = this.extractRows(response);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.loadFailed = true;
      },
    });
  }

  get totalReturns(): number {
    return this.returns.length;
  }

  get pendingReturns(): number {
    return this.countStatus('pending');
  }

  get approvedReturns(): number {
    return this.countStatus('approved');
  }

  get rejectedReturns(): number {
    return this.countStatus('rejected');
  }

  get completionRate(): number {
    return this.totalReturns ? Math.round((this.approvedReturns / this.totalReturns) * 100) : 0;
  }

  get recentReturns(): ReturnRecord[] {
    return [...this.returns]
      .sort((a, b) => this.dateValue(b) - this.dateValue(a))
      .slice(0, 6);
  }

  get kpiCards(): { key: string; title: string; count: number; iconColor: string }[] {
    return [
      { key: 'total', title: 'Total Returns Raised', count: this.totalReturns, iconColor: '#3b82f6' },
      { key: 'pending', title: 'Pending Return', count: this.pendingReturns, iconColor: '#f59e0b' },
      { key: 'approved', title: 'Approved Return', count: this.approvedReturns, iconColor: '#22c55e' },
      { key: 'rejected', title: 'Returned with remarks', count: this.rejectedReturns, iconColor: '#ef4444' },
    ];
  }

  openTransactions(initiate = false): void {
    void this.router.navigate(['/afterAuth/ship-returns/returns/transaction'], {
      queryParams: initiate ? { openInitiate: 1 } : undefined,
    });
  }

  statusOf(row: ReturnRecord): string {
    return String(row?.['status_name'] ?? row?.['status'] ?? row?.['workflow_status'] ?? 'Pending');
  }

  statusClass(row: ReturnRecord): string {
    const status = this.statusOf(row).toLowerCase();
    if (status.includes('approv') || status.includes('complete')) return 'status-approved';
    if (status.includes('reject') || status.includes('return')) return 'status-rejected';
    return 'status-pending';
  }

  dateOf(row: ReturnRecord): string {
    const raw = row?.['return_date'] ?? row?.['created_at'] ?? row?.['created_date'] ?? row?.['date'];
    if (!raw) return '—';
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleDateString('en-GB');
  }

  private extractRows(response: any): ReturnRecord[] {
    if (Array.isArray(response)) return response;
    return response?.results ?? response?.data ?? response?.records ?? [];
  }

  private countStatus(target: string): number {
    return this.returns.filter((row) => this.statusOf(row).toLowerCase().includes(target)).length;
  }

  private dateValue(row: ReturnRecord): number {
    const raw = row?.['return_date'] ?? row?.['created_at'] ?? row?.['created_date'] ?? row?.['date'];
    const value = raw ? new Date(raw).getTime() : 0;
    return Number.isNaN(value) ? 0 : value;
  }
}
