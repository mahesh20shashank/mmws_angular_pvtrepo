import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';
import { KpiCard } from '../../../../shared/components/kpi-card/kpi-card';

type TrialRecord = Record<string, any>;

@Component({
  selector: 'app-trials-dashboard',
  standalone: true,
  imports: [CommonModule, KpiCard],
  templateUrl: './trials-dashboard.html',
  styleUrl: './trials-dashboard.css',
  providers: [ApiService],
})
export class TrialsDashboardComponent implements OnInit {
  trials: TrialRecord[] = [];
  loading = true;
  loadFailed = false;
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.loading = false;
  }

  get totalTrials(): number {
    return this.trials.length;
  }

  get pendingTrials(): number {
    return this.countStatus('pending');
  }

  get approvedTrials(): number {
    return this.countStatus('approved');
  }

  get rejectedTrials(): number {
    return this.countStatus('rejected');
  }

  get completionRate(): number {
    return this.totalTrials ? Math.round((this.approvedTrials / this.totalTrials) * 100) : 0;
  }

  get recentTrials(): TrialRecord[] {
    return [...this.trials]
      .sort((a, b) => this.dateValue(b) - this.dateValue(a))
      .slice(0, 6);
  }

  get kpiCards(): { key: string; title: string; count: number; iconColor: string }[] {
    return [
      { key: 'total', title: 'Total Trials Raised', count: this.totalTrials, iconColor: '#3b82f6' },
      { key: 'pending', title: 'Pending Trial', count: this.pendingTrials, iconColor: '#f59e0b' },
      { key: 'approved', title: 'Approved Trial', count: this.approvedTrials, iconColor: '#22c55e' },
      { key: 'rejected', title: 'Returned with remarks', count: this.rejectedTrials, iconColor: '#ef4444' },
    ];
  }

  openTransactions(initiate = false): void {
    void this.router.navigate(['/afterAuth/ship-returns/trials/transaction'], {
      queryParams: initiate ? { openInitiate: 1 } : undefined,
    });
  }

  statusOf(row: TrialRecord): string {
    return String(row?.['status_name'] ?? row?.['status'] ?? row?.['workflow_status'] ?? 'Pending');
  }

  statusClass(row: TrialRecord): string {
    const status = this.statusOf(row).toLowerCase();
    if (status.includes('approv') || status.includes('complete')) return 'status-approved';
    if (status.includes('reject') || status.includes('return')) return 'status-rejected';
    return 'status-pending';
  }

  dateOf(row: TrialRecord): string {
    const raw = row?.['trial_date'] ?? row?.['created_at'] ?? row?.['created_date'] ?? row?.['date'];
    if (!raw) return '—';
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleDateString('en-GB');
  }

  private extractRows(response: any): TrialRecord[] {
    if (Array.isArray(response)) return response;
    return response?.results ?? response?.data ?? response?.records ?? [];
  }

  private countStatus(target: string): number {
    return this.trials.filter((row) => this.statusOf(row).toLowerCase().includes(target)).length;
  }

  private dateValue(row: TrialRecord): number {
    const raw = row?.['trial_date'] ?? row?.['created_at'] ?? row?.['created_date'] ?? row?.['date'];
    const value = raw ? new Date(raw).getTime() : 0;
    return Number.isNaN(value) ? 0 : value;
  }
}
