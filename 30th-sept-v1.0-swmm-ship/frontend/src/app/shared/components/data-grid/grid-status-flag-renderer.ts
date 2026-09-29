import { ChangeDetectionStrategy, Component } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";

/** What one row's status flag looks like. `color` fills the flag AND paints the row's leading
 * accent border, so a caller states the colour once. */
export interface GridStatusFlag {
  color: string;
  label: string;
}

interface StatusFlagRendererParams extends ICellRendererParams {
  flag: (row: RowData) => GridStatusFlag;
}

/** Filled-flag status cell — a solid pennant in the row's status colour, with the status
 * spelled out beside it and a matching accent bar down the leading edge of the row.
 *
 * The flag is drawn rather than pulled from `app-icon` because it has to be *filled* in an
 * arbitrary per-row colour; the shared icon set is stroke-based and single-toned.
 */
@Component({
  selector: "app-grid-status-flag",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    :host {
      display: flex;
      align-items: center;
      height: 100%;
      width: 100%;
    }

    .status-flag {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      min-width: 0;
    }

    .status-flag__icon {
      flex: none;
      display: block;
    }

    .status-flag__label {
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
  ],
  template: `
    <span class="status-flag" [title]="flag.label">
      <svg
        class="status-flag__icon"
        width="14"
        height="16"
        viewBox="0 0 14 16"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M2 1h10l-2.6 3.6L12 8.2H2z" [attr.fill]="flag.color" />
        <rect x="0.6" y="0.6" width="1.6" height="14.8" rx="0.8" [attr.fill]="flag.color" />
      </svg>
      <span class="status-flag__label" [style.color]="flag.color">{{ flag.label }}</span>
    </span>
  `,
})
export class StatusFlagRenderer implements ICellRendererAngularComp {
  flag: GridStatusFlag = { color: "transparent", label: "" };

  agInit(params: StatusFlagRendererParams): void {
    this.flag = params.flag(params.data);
  }

  refresh(params: StatusFlagRendererParams): boolean {
    this.flag = params.flag(params.data);
    return true;
  }
}
