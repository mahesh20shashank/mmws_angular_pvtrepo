import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";

import { FormsModule } from "@angular/forms";

export interface GridDateParams extends ICellRendererParams {
    onValueChange?: (row: RowData, field: string, newValue: unknown) => void;
}

@Component({
    selector: "app-grid-date-cell",
    standalone: true,
    imports: [FormsModule],
    styles: [`
:host {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.date-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.grid-inline-date {
  width: 100%;
  max-width: 150px;
  height: 32px;

  padding: 0 10px;

  border: 1px solid var(--border-input);
  border-radius: 6px;

  background-color: var(--bg-input);
  color: var(--text-primary);

  font-size: 13px;
  text-align: left;
  outline: none;

  appearance: none;
  -webkit-appearance: none;
  color-scheme: light dark;

  transition: border-color 0.15s;
}

.grid-inline-date:hover,
.grid-inline-date:focus {
  border-color: var(--text-muted);
}

/* Date text */
.grid-inline-date::-webkit-datetime-edit,
.grid-inline-date::-webkit-datetime-edit-text,
.grid-inline-date::-webkit-datetime-edit-month-field,
.grid-inline-date::-webkit-datetime-edit-day-field,
.grid-inline-date::-webkit-datetime-edit-year-field {
  color: var(--text-primary);
}

/* Calendar icon — follows the same currentColor as the input text via color-scheme,
   rather than a hardcoded invert() that assumed a dark input background. */
.grid-inline-date::-webkit-calendar-picker-indicator {
  cursor: pointer;
}

`],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<div class="date-wrapper">
  <input
    type="date"
    class="grid-inline-date"
    [(ngModel)]="dateValue"
    (change)="onChange()"
  />
</div>`,
})
export class GridDateCell implements ICellRendererAngularComp {
    params!: GridDateParams;
    dateValue = "";

    agInit(params: GridDateParams): void {
        this.params = params;
        this.dateValue = String(params.value ?? "");
    }

    refresh(params: GridDateParams): boolean {
        this.params = params;
        this.dateValue = String(params.value ?? "");
        return true;
    }

    onChange() {
        this.params.node.setDataValue(this.params.colDef!.field!, this.dateValue);
        this.params.onValueChange?.(this.params.data, this.params.colDef!.field!, this.dateValue);
    }
}
