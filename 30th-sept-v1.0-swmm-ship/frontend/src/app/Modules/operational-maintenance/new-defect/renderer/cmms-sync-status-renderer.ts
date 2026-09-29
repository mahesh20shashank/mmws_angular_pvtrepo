import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams } from "ag-grid-community";
import { IconComponent } from "../../../../shared/components/icon/icon.component";

/**
 * ag-grid cell renderer for the Defect / DART List "Shore Sync" column
 * (`cmms_sync_status` — boolean, true once the row has connected and synced to the
 * shore CMMS). Not-yet-synced rows show a "refresh" pill ("Awaiting sync"); synced
 * rows show a "locked" pill ("Synced to shore") since a synced record becomes
 * immutable (see the Data Sync Status banner above this grid). Wire via columnDef:
 * { field: "cmms_sync_status", cellRenderer: CmmsSyncStatusRenderer }.
 */
@Component({
  selector: "app-cmms-sync-status-renderer",
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center h-full">
      @if (isSynced) {
        <span
          class="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60"
        >
          <app-icon name="lock" [size]="11" variant="inherit" />
          Synced to shore
        </span>
      } @else {
        <span
          class="flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-400"
        >
          <app-icon name="refresh-cw" [size]="11" variant="inherit" />
          Awaiting sync
        </span>
      }
    </div>
  `,
})
export class CmmsSyncStatusRenderer implements ICellRendererAngularComp {
  isSynced = false;

  agInit(params: ICellRendererParams): void {
    this.isSynced = params.value === true;
  }

  refresh(params: ICellRendererParams): boolean {
    this.isSynced = params.value === true;
    return true;
  }
}
