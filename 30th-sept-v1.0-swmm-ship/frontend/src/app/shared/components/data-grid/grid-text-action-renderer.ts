import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";

/** Labeled text-button cell action (e.g. "+ Add", "Reject", "Select Action") — for grids whose
 * reference design shows a text pill/link rather than an icon (see `ActionRendererComponent` for
 * the icon-button equivalent). */
export interface TextGridAction {
  label: string;
  color?: string;
  /** `"link"` (default) keeps the borderless text-pill look every existing caller relies on.
   * `"button"` renders a real filled button — for grids where the action is the point of the
   * row (e.g. Return), not an afterthought, and a bare coloured word reads as decoration. */
  variant?: "link" | "button";
  /** Renders the action non-interactive (kept visible so the row still explains itself).
   * `title` supplies the reason on hover. */
  disabled?: boolean;
  title?: string;
  action: (row: RowData) => void;
}

interface TextActionRendererParams extends ICellRendererParams {
  actions: TextGridAction[] | ((row: RowData) => TextGridAction[]);
}

@Component({
  selector: "app-text-action-renderer",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    .text-action-btn {
      border: none;
      background: transparent;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      white-space: nowrap;
    }

    .text-action-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .text-action-btn:focus-visible {
      outline: 2px solid rgba(127, 179, 224, 0.5);
      outline-offset: 2px;
    }

    /* Filled variant — an actual button, with its fill taken from the same action colour the
       link variant paints its text with, so a caller only ever specifies one colour. */
    .text-action-btn.is-button {
      background: #1d96e9;
      color: #fff;
      border: 1px solid transparent;
      padding: 0.3rem 0.9rem;
      border-radius: 6px;
      line-height: 1.2;
      box-shadow: 0 1px 2px rgba(15, 28, 46, 0.18);
      transition: filter .15s ease, box-shadow .15s ease;
    }

    .text-action-btn.is-button:hover {
      filter: brightness(1.08);
      box-shadow: 0 2px 6px rgba(15, 28, 46, 0.24);
    }

    .text-action-btn.is-button:active {
      filter: brightness(0.94);
      box-shadow: none;
    }

    .text-action-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      box-shadow: none;
      filter: none;
    }
  `,
  ],
  template: `
    <div class="flex items-center gap-1 h-full">
      @for (action of actions; track action.label) {
        <button
          type="button"
          class="text-action-btn"
          [class.is-button]="action.variant === 'button'"
          [style.color]="action.variant === 'button' ? null : (action.color ?? '#1d96e9')"
          [style.background]="action.variant === 'button' ? (action.color ?? '#1d96e9') : null"
          [disabled]="!!action.disabled"
          [attr.title]="action.title ?? null"
          (click)="onClick(action, $event)"
        >
          {{ action.label }}
        </button>
      }
    </div>
  `,
})
export class TextActionRenderer implements ICellRendererAngularComp {
  params!: TextActionRendererParams;
  actions: TextGridAction[] = [];

  agInit(params: TextActionRendererParams): void {
    this.params = params;
    this.actions = typeof params.actions === "function" ? params.actions(params.data) : params.actions;
  }

  refresh(params: TextActionRendererParams): boolean {
    this.params = params;
    this.actions = typeof params.actions === "function" ? params.actions(params.data) : params.actions;
    return true;
  }

  onClick(action: TextGridAction, event: Event): void {
    event.stopPropagation();
    if (action.disabled) return;
    action.action(this.params.data);
  }
}
