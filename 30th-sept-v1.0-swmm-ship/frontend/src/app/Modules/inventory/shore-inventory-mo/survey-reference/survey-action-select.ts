import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams, RowData } from "ag-grid-community";

export interface SurveyActionOption {
  value: string;
  label: string;
}

interface SurveyActionSelectParams extends ICellRendererParams {
  options: SurveyActionOption[];
  onSelect: (row: RowData, value: string) => void;
}

/**
 * Native `<select>` per-row action — matches the reference's `action-dropdown-survey` control
 * (Add / Update & Approve / Pre-approval Delete / Close / Vet FCL / Authorize), which has no
 * equivalent anywhere else in the app. Kept local to this one page rather than a new shared
 * component, since nothing else needs a select-cell-renderer.
 */
@Component({
  selector: "app-survey-action-select",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    select {
      width: 100%;
      height: 30px;
      border-radius: 6px;
      border: 1px solid var(--border-primary);
      background: var(--bg-card);
      color: var(--text-primary);
      font-size: 0.78rem;
      padding: 0 0.4rem;
    }
  `,
  ],
  template: `
    <select (click)="$event.stopPropagation()" (change)="onChange($event)">
      <option value="" selected>Select Action</option>
      @for (option of params.options; track option.value) {
        <option [value]="option.value">{{ option.label }}</option>
      }
    </select>
  `,
})
export class SurveyActionSelect implements ICellRendererAngularComp {
  params!: SurveyActionSelectParams;

  agInit(params: SurveyActionSelectParams): void {
    this.params = params;
  }

  refresh(params: SurveyActionSelectParams): boolean {
    this.params = params;
    return true;
  }

  onChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) return;
    this.params.onSelect(this.params.data, value);
    (event.target as HTMLSelectElement).value = "";
  }
}
