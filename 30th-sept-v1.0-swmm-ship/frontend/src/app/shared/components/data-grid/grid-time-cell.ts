import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";

import { FormsModule } from "@angular/forms";

export interface GridTimeParams extends ICellRendererParams {
    onValueChange?: (row: RowData, field: string, newValue: unknown) => void;
}

@Component({
    selector: "app-grid-time-cell",
    standalone: true,
    imports: [FormsModule],
    styles: [`
    .grid-inline-input {
      width: 130px;
      height: 32px;
      padding: 0 10px;

      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;

      background: rgba(255,255,255,0.10);
      color: #fff;

      color-scheme: dark; /* makes native picker dark */
      outline: none;
    }

    /* Time text */
    .grid-inline-input::-webkit-datetime-edit,
    .grid-inline-input::-webkit-datetime-edit-hour-field,
    .grid-inline-input::-webkit-datetime-edit-minute-field,
    .grid-inline-input::-webkit-datetime-edit-ampm-field {
      color: #fff;
    }

    /* Clock icon */
    .grid-inline-input::-webkit-calendar-picker-indicator {
      filter: brightness(0) invert(1);
      cursor: pointer;
      opacity: 1;
    }
  `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <input
      type="time"
      class="grid-inline-input"
      [(ngModel)]="timeValue"
      (change)="onChange()"
    />
  `
})
export class GridTimeCell implements ICellRendererAngularComp {
    params!: GridTimeParams;
    timeValue = "";

    agInit(params: GridTimeParams): void {
        this.params = params;
        this.timeValue = String(params.value ?? "");
    }

    refresh(params: GridTimeParams): boolean {
        this.params = params;
        return true;
    }

    onChange() {
        const field = this.params.colDef!.field!;

        (this.params.data as Record<string, unknown>)[field] = this.timeValue;

        this.params.node.setDataValue(field, this.timeValue);

        this.params.onValueChange?.(
            this.params.data,
            field,
            this.timeValue
        );
    }
}
