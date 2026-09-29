import { Component, ChangeDetectionStrategy, NgZone, inject } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";
import { IconComponent } from "../../../../shared/components/icon/icon.component";

interface DefectActionRow extends RowData {
  status?: string;
}

interface DefectActionParams extends ICellRendererParams {
  onEdit?: (row: DefectActionRow) => void;
  onDelete?: (row: DefectActionRow) => void;
}

/**
 * ag-grid cell renderer for the Defect / DART List "Action" column. A row in
 * "Draft" status (no saved DART yet — resuming it happens from the DART No.
 * column instead, see DefectDartNoRenderer) shows only a delete icon; every
 * other row shows the plain edit icon.
 * Wire via columnDef: { cellRenderer: DefectActionRenderer,
 *   cellRendererParams: { onEdit, onDelete } }.
 */
@Component({
  selector: "app-defect-action-renderer",
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-center h-full">
      @if (isDraft) {
        <button
          type="button"
          (click)="onDeleteClick($event)"
          title="Delete draft"
          class="w-7 h-7 rounded-md border border-red-500/40 bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors"
        >
          <app-icon name="trash-2" [size]="14" color="#F87171" />
        </button>
      } @else {
        <button
          type="button"
          (click)="onEditClick($event)"
          title="Edit"
          class="w-7 h-7 rounded-md bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <app-icon name="square-pen" [size]="14" color="#7fb3e0" />
        </button>
      }
    </div>
  `,
})
export class DefectActionRenderer implements ICellRendererAngularComp {
  private zone = inject(NgZone);

  params!: DefectActionParams;
  isDraft = false;

  agInit(params: DefectActionParams): void {
    this.params = params;
    this.isDraft = String((params.data as DefectActionRow | undefined)?.status ?? "").toLowerCase() === "draft";
  }

  refresh(params: DefectActionParams): boolean {
    this.params = params;
    this.isDraft = String((params.data as DefectActionRow | undefined)?.status ?? "").toLowerCase() === "draft";
    return true;
  }

  onEditClick(event: Event): void {
    event.stopPropagation();
    this.zone.run(() => this.params.onEdit?.(this.params.data as DefectActionRow));
  }

  onDeleteClick(event: Event): void {
    event.stopPropagation();
    this.zone.run(() => this.params.onDelete?.(this.params.data as DefectActionRow));
  }
}
