import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";

import { FormsModule } from "@angular/forms";

interface SearchSelectOption { label: string; value: unknown; }

/** Like `GridSelectCell`, but for a closed list too large to scan as a native `<select>` and
 * whose options depend on the ROW (e.g. equipment classes narrowed by that row's own spare
 * class) rather than being fixed for the whole column. A text input backed by a `<datalist>`
 * gives type-to-filter search over `getRowOptions(row)` while still permitting a value typed
 * that isn't in the list — some closed-list columns (e.g. Equipment Class) allow a genuinely
 * new entry to be added, and the caller decides that by what it puts in the option list, not
 * this renderer. */
export interface GridSearchSelectParams extends ICellRendererParams {
    getRowOptions: (row: RowData) => SearchSelectOption[];
    placeholder?: string;
    onValueChange?: (row: RowData, field: string, newValue: unknown) => void;
}

@Component({
    selector: "app-grid-search-select-cell",
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

        .grid-inline-input {
            width: 100%;
            max-width: 100%;
            height: 32px;
            padding: 0 10px;

            border: 1px solid var(--border-input);
            border-radius: 6px;

            background-color: var(--bg-input);
            color: var(--text-primary);

            font-size: 13px;

            outline: none;
            transition: border-color 0.15s;
        }

        .grid-inline-input:hover,
        .grid-inline-input:focus {
            border-color: var(--text-muted);
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <input
      type="text"
      class="grid-inline-input"
      [attr.list]="listId"
      [placeholder]="params.placeholder ?? ''"
      [(ngModel)]="textValue"
      (blur)="onChange()"
      (keydown.enter)="onChange()"
    />
    <datalist [id]="listId">
      @for (opt of rowOptions; track opt.value) {
        <option [value]="opt.label"></option>
      }
    </datalist>
  `,
})
export class GridSearchSelectCell implements ICellRendererAngularComp {
    params!: GridSearchSelectParams;
    textValue = "";
    rowOptions: SearchSelectOption[] = [];
    listId = "";

    agInit(params: GridSearchSelectParams): void {
        this.params = params;
        this.textValue = String(params.value ?? "");
        this.rowOptions = params.getRowOptions(params.data);
        this.listId = `grid-search-select-${params.colDef?.field ?? "cell"}-${params['rowIndex']}`;
    }

    refresh(params: GridSearchSelectParams): boolean {
        this.params = params;
        this.textValue = String(params.value ?? "");
        this.rowOptions = params.getRowOptions(params.data);
        return true;
    }

    onChange() {
        const field = this.params.colDef!.field!;
        // Typing an option's own label resolves back to its value (matches GridSelectCell's
        // value-not-label storage); a value typed that matches no option is passed through as
        // typed, since some columns permit a genuinely new entry.
        const matched = this.rowOptions.find((opt) => opt.label === this.textValue);
        const newValue = matched ? matched.value : this.textValue;

        (this.params.data as Record<string, unknown>)[field] = newValue;
        this.params.node.setDataValue(field, newValue);
        this.params.api?.refreshCells({
            rowNodes: [this.params.node],
            force: true,
        });
        this.params.onValueChange?.(this.params.data, field, newValue);
    }
}
