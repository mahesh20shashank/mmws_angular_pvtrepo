import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";

import { FormsModule } from "@angular/forms";

interface SelectOption { label: string; value: unknown; }

export interface GridSelectParams extends ICellRendererParams {
    getOptions: () => SelectOption[];
    onValueChange?: (row: RowData, field: string, newValue: unknown) => void;
}

@Component({
    selector: "app-grid-select-cell",
    standalone: true,
    imports: [FormsModule],
    styles: [`
        :host {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100%;
            width: 100%;
        }

        .select-wrapper {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
        }

        .grid-inline-select {
            width: 100%;
            max-width: 100%;
            height: 32px;
            padding: 0 28px 0 10px;

            border: 1px solid var(--border-input);
            border-radius: 6px;

            background-color: var(--bg-input);
            color: var(--text-primary);

            font-size: 13px;

            appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;

            text-align: left;
            text-overflow: ellipsis;

            outline: none;
            cursor: pointer;
            transition: border-color 0.15s;

            /* Tells the browser which UI palette this control belongs to, so the native
               option-list popup (which ignores our translucent --bg-input background and
               would otherwise paint itself white) picks a matching dark/light chrome
               instead of defaulting to a white dropdown in dark mode. */
            color-scheme: var(--native-color-scheme);
        }

        .grid-inline-select:hover,
        .grid-inline-select:focus {
            border-color: var(--text-muted);
        }

        /* Solid (not translucent) so the native popup list — which composites option
           background over its own opaque backing, not over the page — actually shows
           the theme color instead of var(--bg-input)'s see-through white/black. */
        .grid-inline-select option {
            background-color: var(--bg-dropdown);
            color: var(--text-primary);
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <!-- <select class="grid-inline-select" [(ngModel)]="selectedValue" (ngModelChange)="onChange($event)"   style="background-color: rgba(255, 255, 255, 0.10)">
      <option *ngFor="let opt of params.getOptions()" [ngValue]="opt.value">
        {{ opt.label }}
      </option>
    </select> -->

    <div class="select-wrapper">
        <select
            class="grid-inline-select"
            [(ngModel)]="selectedValue"
            (ngModelChange)="onChange($event)"
        >
            @for (opt of params.getOptions(); track $index) {
  <option [ngValue]="opt.value">
    {{ opt.label }}
  </option>
}
        </select>
    </div>
  `,
})
export class GridSelectCell implements ICellRendererAngularComp {
    params!: GridSelectParams;
    selectedValue: unknown;

    agInit(params: GridSelectParams): void {
        this.params = params;
        // auto-bind: pre-select whatever value came back from the API
        this.selectedValue = params.value;
    }

    refresh(params: GridSelectParams): boolean {
        this.params = params;
        this.selectedValue = params.value;
        return true;
    }

    onChange(newValue: unknown) {
        const field = this.params.colDef!.field!;
        // Belt-and-braces alongside setDataValue below: keeps the caller's own row
        // object (e.g. a component's `rows` array used directly when building a
        // save/export payload) in sync even if ag-grid's row-id / immutable-data
        // mode ever stops writing straight back to that same object reference —
        // matches GridTextCell's identical direct-mutation pattern.
        (this.params.data as Record<string, unknown>)[field] = newValue;
        this.params.node.setDataValue(field, newValue);
        this.params.api?.refreshCells({
            rowNodes: [this.params.node],
            force: true,
        });
        this.params.onValueChange?.(this.params.data, this.params.colDef!.field!, newValue);
    }
}
