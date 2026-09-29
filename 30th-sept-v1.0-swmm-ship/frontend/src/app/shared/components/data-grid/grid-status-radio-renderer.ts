import { ChangeDetectionStrategy, Component } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams } from "ag-grid-community";

/** Row shape this renderer needs — kept minimal/structural so it isn't coupled to any one
 * feature's model type. */
interface StatusRadioRow {
  status: string;
}

interface StatusRadioParams extends ICellRendererParams {
  /** The selectable status values, in display order (e.g. ["Present", "On Leave", "Ty Duty"]). */
  options: string[];
  /** Re-evaluated on every render — lets the caller gate editability by a live role/permission
   * signal rather than a value frozen at grid-init time. */
  canEdit?: () => boolean;
  onChange?: (row: StatusRadioRow, newStatus: string) => void;
  /** Shown as the disabled radios' title/tooltip — mirrors legacy's "Only HOD, DY HOD can update
   * status" hint. */
  disabledHint?: string;
}

/**
 * ag-grid cell renderer showing an inline radio group for a row's status, editable only when
 * `canEdit()` returns true (otherwise rendered disabled with `disabledHint` as a tooltip).
 * Wire via columnDef: { cellRenderer: GridStatusRadioRenderer,
 *   cellRendererParams: { options: [...], canEdit: () => ..., onChange: (row, status) => ... } }.
 */
@Component({
  selector: "app-grid-status-radio",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    .status-radio-group {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      height: 100%;
    }
    .status-radio {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.8rem;
      color: var(--text-primary, inherit);
      cursor: pointer;
      white-space: nowrap;
    }
    .status-radio--disabled {
      cursor: default;
      opacity: 0.55;
    }
    .status-radio input {
      cursor: inherit;
    }
  `,
  ],
  template: `
    <div class="status-radio-group">
      @for (opt of options; track opt) {
        <label class="status-radio" [class.status-radio--disabled]="disabled" [title]="disabled ? disabledHint : ''">
          <input type="radio" [name]="groupName" [value]="opt" [checked]="row?.status === opt" [disabled]="disabled" (change)="select(opt)" />
          {{ opt }}
        </label>
      }
    </div>
  `,
})
export class GridStatusRadioRenderer implements ICellRendererAngularComp {
  private params!: StatusRadioParams;
  row: StatusRadioRow | null = null;
  options: string[] = [];
  disabled = true;
  disabledHint = "";
  groupName = "";

  agInit(params: StatusRadioParams): void {
    this.params = params;
    this.apply(params);
  }

  refresh(params: StatusRadioParams): boolean {
    this.params = params;
    this.apply(params);
    return true;
  }

  private apply(params: StatusRadioParams): void {
    this.row = (params.data as StatusRadioRow) ?? null;
    this.options = params.options ?? [];
    this.disabled = !(params.canEdit?.() ?? false);
    this.disabledHint = params.disabledHint ?? "";
    this.groupName = `grid-status_${params["rowIndex"]}`;
  }

  select(status: string): void {
    if (this.disabled || !this.row || this.row.status === status) return;
    this.params.onChange?.(this.row, status);
  }
}
