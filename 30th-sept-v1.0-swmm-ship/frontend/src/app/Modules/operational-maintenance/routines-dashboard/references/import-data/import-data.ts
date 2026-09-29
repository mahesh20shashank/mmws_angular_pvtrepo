import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';

export interface SyncCmmsResponse {
  message?: string;
}

@Component({
  selector: 'app-import-data',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './import-data.html',
  styleUrl: './import-data.css',
})
export class ImportData implements OnDestroy {
  private call = inject(OperationalMaintenanceApi);

  progress = 0;
  processedItems = 0;
  logs = signal('');
  statusText = 'Ready to Synchronize Ship 303 data...';

  private syncSub?: Subscription;

  startSync() {
    this.logs.set(
      '[INFO] Starting Routine synchronization process... Fetching data from CMMS API...\n',
    );
    this.progress = 50;
    this.statusText = 'Synchronizing...';

    this.syncSub = this.call.syncCmmsRoutine().subscribe({
      next: (response: SyncCmmsResponse) => {
        this.statusText = response.message || 'Synchronization completed.';
        this.logs.set(this.statusText);
        this.progress = 100;
      },
      error: (error: HttpErrorResponse) => {
        const errorMsg =
          error.error?.message ||
          '[INFO] Starting Routine synchronization process... Fetching data from CMMS API...\n[FATAL] Connection error: TypeError: network error';
        this.statusText = 'Connection error';
        this.logs.set(errorMsg);
        this.progress = 0;
      },
    });
  }

  async generateRoutines() {
    this.logs.set(
      'Starting Routine synchronization process... Fetching data from CMMS API...\n',
    );
    this.progress = 100;
    this.statusText = 'Routine generation completed (Mocked)';
  }

  ngOnDestroy(): void {
    this.syncSub?.unsubscribe();
  }
}
