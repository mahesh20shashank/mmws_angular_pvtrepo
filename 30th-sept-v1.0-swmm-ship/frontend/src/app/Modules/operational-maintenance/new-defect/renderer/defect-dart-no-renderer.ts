import { Component, ChangeDetectionStrategy, NgZone, inject } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";
import { IconComponent } from "../../../../shared/components/icon/icon.component";

interface DartNoRow extends RowData {
  status?: string;
}

interface DartNoParams extends ICellRendererParams {
  onResume?: (row: DartNoRow) => void;
  onView?: (row: DartNoRow) => void;
}

/**
 * ag-grid cell renderer for the Defect / DART List "DART No." column. A row in
 * "Draft" status renders as plain text (it has no saved DART yet) with a
 * "Resume →" pill next to it; every other row renders the DART number as a
 * clickable blue link that opens the record details modal. Wire via columnDef:
 * { cellRenderer: DefectDartNoRenderer, cellRendererParams: { onResume, onView } }.
 */
@Component({
  selector: "app-defect-dart-no-renderer",
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2 h-full">
      @if (isDraft) {
        <span class="text-white/60">{{ text }}</span>
        <button
          type="button"
          (click)="onResumeClick($event)"
          class="flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-400 hover:bg-sky-500/20 transition-colors"
        >
          Resume
          <app-icon name="arrow-right" [size]="11" variant="inherit" />
        </button>
      } @else {
        <button
          type="button"
          (click)="onViewClick($event)"
          class="font-medium text-sky-400 hover:underline cursor-pointer"
        >
          {{ text }}
        </button>
      }
    </div>
  `,
})
export class DefectDartNoRenderer implements ICellRendererAngularComp {
  private zone = inject(NgZone);

  params!: DartNoParams;
  text = "";
  isDraft = false;

  agInit(params: DartNoParams): void {
    this.params = params;
    this.text = String(params.value ?? "");
    this.isDraft = String((params.data as DartNoRow | undefined)?.status ?? "").toLowerCase() === "draft";
  }

  refresh(params: DartNoParams): boolean {
    this.params = params;
    this.text = String(params.value ?? "");
    this.isDraft = String((params.data as DartNoRow | undefined)?.status ?? "").toLowerCase() === "draft";
    return true;
  }

  onResumeClick(event: Event): void {
    event.stopPropagation();
    this.zone.run(() => this.params.onResume?.(this.params.data as DartNoRow));
  }

  onViewClick(event: Event): void {
    event.stopPropagation();
    this.zone.run(() => this.params.onView?.(this.params.data as DartNoRow));
  }
}
