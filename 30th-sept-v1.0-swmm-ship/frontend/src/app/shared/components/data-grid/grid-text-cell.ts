import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";

import { FormsModule } from "@angular/forms";

export interface GridTextParams extends ICellRendererParams {
    onValueChange?: (row: RowData, field: string, newValue: unknown) => void;
}

@Component({
    selector: "app-grid-text-cell",
    standalone: true,
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <input
      style="background-color: rgba(255, 255, 255, 0.10)"
      type="text"
      class="grid-inline-input"
      [(ngModel)]="textValue"
      (blur)="onChange()"
      (keydown.enter)="onChange()"
    />
  `,
})
export class GridTextCell implements ICellRendererAngularComp {
    params!: GridTextParams;
    textValue = "";

    agInit(params: GridTextParams): void {
        this.params = params;
        this.textValue = String(params.value ?? "");
    }

    refresh(params: GridTextParams): boolean {
        this.params = params;
        return true;
    }

    onChange() {
        const field = this.params.colDef!.field!;

        (this.params.data as Record<string, unknown>)[field] = this.textValue;

        this.params.node.setDataValue(field, this.textValue);

        this.params.onValueChange?.(
            this.params.data,
            field,
            this.textValue
        );
    }
}
