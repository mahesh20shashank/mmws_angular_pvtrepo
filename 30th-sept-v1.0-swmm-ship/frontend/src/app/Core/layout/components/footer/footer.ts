import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { Auth } from '../../../auth/services/auth.service';
import { AppInfo, Call, SyncAllTransactionsResponse } from '../../../http/services/call';
import { NotificationService } from '../../../services/notification/notification.service';

@Component({
  selector: 'app-footer',
  imports: [IconComponent, ModalComponent, ButtonComponent],
  templateUrl: './footer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './footer.css'
})
export class Footer implements OnInit {
  private readonly call = inject(Call);
  private readonly notification = inject(NotificationService);
  readonly authService = inject(Auth);

  private readonly LAST_SYNC_KEY = 'swmm_last_sync_completed_at';

  // App version / copyright — sourced from api/v1/master/app-info/, shown on
  // every page (landing + authenticated shell) via this shared footer.
  readonly appInfo = signal<AppInfo | null>(null);

  // "Sync All" — runs every transaction module's manual CMMS sync (SFD, Defect/DART,
  // Fuss, SRAR) in one click via SyncAllTransactionsAPIView. Each module reports
  // independently, so one module failing doesn't block or hide the others' results.
  // Relocated here from the Admin Dashboard page so it's reachable from every page.
  readonly syncingAll = signal(false);
  readonly syncAllResults = signal<SyncAllTransactionsResponse | null>(null);

  // "Sync ITTTM" — triggers external ITTTM sync API
  readonly syncingItttm = signal(false);

  // "Last Sync" — the footer's date/time chip. Sourced from the sync response's
  // own `completed_at` (not the browser's clock, since that's when the backend
  // actually finished, not when the button was clicked) and persisted across
  // reloads since it only updates when someone actually runs a sync.
  private readonly lastSyncAt = signal<string | null>(localStorage.getItem(this.LAST_SYNC_KEY));

  readonly lastSyncDisplay = computed(() => {
    const iso = this.lastSyncAt();
    if (!iso) return null;
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    const datePart = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
  });

  ngOnInit(): void {
    this.loadAppInfo();
  }

  private async loadAppInfo(): Promise<void> {
    try {
      const response = await firstValueFrom(this.call.getAppInfo());
      this.appInfo.set(response);
    } catch {
      this.appInfo.set(null);
    }
  }

  async runSyncAll(): Promise<void> {
    if (this.syncingAll()) {
      return;
    }
    this.syncingAll.set(true);
    this.syncAllResults.set(null);
    try {
      const response = await firstValueFrom(this.call.syncAllTransactions());
      this.syncAllResults.set(response);
      this.recordLastSync(response);
    } catch (err) {
      // A 207 Multi-Status (one or more modules failed) is a non-2xx response, so
      // Angular routes it through the error path even though the body — carrying
      // each module's own status/message — is exactly what the panel needs to show.
      const body = (err as { error?: SyncAllTransactionsResponse } | null)?.error;
      const results = body && Array.isArray(body.modules)
        ? body
        : {
          status: false,
          modules: [
            { module: 'sync', status: false, message: 'Sync All failed to run. Please try again.' },
          ],
        };
      this.syncAllResults.set(results);
      // Even a partial-failure sync (207) genuinely ran and finished, so its
      // completed_at still counts as the last sync attempt.
      this.recordLastSync(results);
    } finally {
      this.syncingAll.set(false);
    }
  }

  async runSyncItttm(): Promise<void> {
    if (this.syncingItttm()) {
      return;
    }
    this.syncingItttm.set(true);
    try {
      const res = await firstValueFrom(this.call.syncItttm());
      console.log(res);
      const msg = 'ITTTM Sync completed successfully.';
      this.notification.success(msg, 'Sync ITTTM');
    } catch (err) {
      console.log(err);
      const errMsg = 'Failed to complete ITTTM sync.';
      this.notification.error(errMsg, 'Sync ITTTM');
    } finally {
      this.syncingItttm.set(false);
    }
  }

  private recordLastSync(response: SyncAllTransactionsResponse): void {
    if (!response.completed_at) return;
    this.lastSyncAt.set(response.completed_at);
    localStorage.setItem(this.LAST_SYNC_KEY, response.completed_at);
  }
}
