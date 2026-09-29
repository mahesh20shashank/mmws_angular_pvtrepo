import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";

import { IconComponent } from "../icon/icon.component";

/** A plain value cell (e.g. a document/reference number) that ALSO renders a small icon in front
 *  of it once that value is a real, clickable link — not every row necessarily has one (e.g. no
 *  file synced down from CMMS for this particular record yet). Purely decorative/visual: the
 *  actual click handling stays on the grid's own `cellClicked`/`onCellClicked` (see the Maintop
 *  column, sfd-management.component.ts) — this renderer never stops propagation itself, so that
 *  keeps working unchanged whether or not the icon is showing. */
interface LinkIconCellParams extends ICellRendererParams {
  /** Whether THIS row's value is an actual link (icon shown) vs a plain/blank value (no icon).
   *  Defaults to "is there a non-blank value at all" when omitted. */
  isLinked?: (row: RowData) => boolean;
  /** Lucide icon name — must already be registered in `provideLucideIcons()` (app.config.ts).
   *  Defaults to "file-text" (used for a downloadable-document link, e.g. Maintop's PDF). */
  iconName?: string;
}

@Component({
  selector: "app-link-icon-cell",
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    .link-icon-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 100%;
    }
  `,
  ],
  template: `
    <div class="link-icon-cell">
      @if (linked) {
        <app-icon [name]="iconName" [size]="13" variant="danger" />
      }
      <span>{{ value }}</span>
    </div>
  `,
})
export class LinkIconCellRenderer implements ICellRendererAngularComp {
  value = "";
  linked = false;
  iconName = "file-text";

  agInit(params: LinkIconCellParams): void {
    this.refresh(params);
  }

  refresh(params: LinkIconCellParams): boolean {
    this.value = params.value ?? "";
    this.iconName = params.iconName ?? "file-text";
    this.linked = params.isLinked ? !!params.isLinked(params.data) : !!params.value;
    return true;
  }
}
