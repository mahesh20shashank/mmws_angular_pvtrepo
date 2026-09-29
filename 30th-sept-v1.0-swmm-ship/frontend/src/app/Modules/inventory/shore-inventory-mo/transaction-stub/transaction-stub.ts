import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../shared/components/data-grid/grid-action-icons";
import { TextActionRenderer } from "../../../../shared/components/data-grid/grid-text-action-renderer";
import { DynamicField, DynamicFieldSpec } from "../../../../shared/components/dynamic-field/dynamic-field";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";

export interface TransactionStubActionButton {
  icon?: string;
  label: string;
  color?: string;
}

/** A row-action column for the demo grid — `kind: "icon"` renders via the shared icon-button
 * renderer (`ActionRendererComponent`, e.g. a "Details" info icon), `kind: "text"` renders visible
 * text pills (e.g. "+ Add", "Reject") via `TextActionRenderer`. Every button just raises a toast —
 * these pages have no backend (see class doc below), so there's nothing real to wire a click to. */
export interface TransactionStubActionColumn {
  headerName: string;
  width?: number;
  kind: "icon" | "text";
  buttons: TransactionStubActionButton[] | ((row: RowData) => TransactionStubActionButton[]);
}

export interface TransactionStubConfig {
  title: string;
  fields: DynamicFieldSpec[];
  columns: ColDef[];
  rows: RowData[];
  primaryButtonLabel?: string;
  actionColumns?: TransactionStubActionColumn[];
}

/**
 * Generic filter-form + read-only-table page used for the "As is Transaction"
 * references (Create Cart, Demand Action, Issue Authorise, ...). The Django
 * originals are themselves static/demo pages (hardcoded sample rows, no real
 * backend wiring) — this renders the same shape from a per-route config
 * instead of eight near-identical hand-written components.
 */
@Component({
  selector: "app-mo-transaction-stub",
  standalone: true,
  imports: [ReactiveFormsModule, DynamicField, DataGrid, HelpGuidance, ButtonComponent],
  templateUrl: "./transaction-stub.html",
  styleUrl: "./transaction-stub.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionStub implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);

  title = "";
  fields: DynamicFieldSpec[] = [];
  columnDefs: ColDef[] = [];
  primaryButtonLabel: string | null = null;
  readonly rows = signal<RowData[]>([]);
  form = new FormGroup({});

  ngOnInit(): void {
    const data = this.route.snapshot.data as { config: TransactionStubConfig };
    this.title = data.config.title;
    this.fields = data.config.fields;
    this.primaryButtonLabel = data.config.primaryButtonLabel ?? null;
    this.rows.set(data.config.rows);
    this.columnDefs = [
      ...data.config.columns,
      ...(data.config.actionColumns ?? []).map((spec) => this.buildActionColumn(spec)),
    ];
    this.form = new FormGroup(
      Object.fromEntries(this.fields.map((f) => [f.key, new FormControl("")])),
    );
  }

  getControl(key: string): FormControl {
    return this.form.get(key) as FormControl;
  }

  clear(): void {
    this.form.reset();
  }

  runPrimaryAction(): void {
    if (this.primaryButtonLabel) {
      this.notifications.success(`${this.primaryButtonLabel} — done.`);
    }
  }

  private buildActionColumn(spec: TransactionStubActionColumn): ColDef {
    const resolveButtons = (row: RowData): TransactionStubActionButton[] =>
      typeof spec.buttons === "function" ? spec.buttons(row) : spec.buttons;

    const base: ColDef = {
      headerName: spec.headerName,
      width: spec.width ?? (spec.kind === "text" ? 110 : 90),
      sortable: false,
      filter: false,
    };

    if (spec.kind === "text") {
      return {
        ...base,
        cellRenderer: TextActionRenderer,
        cellRendererParams: {
          actions: (row: RowData) =>
            resolveButtons(row).map((button) => ({
              label: button.label,
              color: button.color,
              action: () => this.notifications.success(`${button.label} — done.`),
            })),
        },
      };
    }

    return {
      ...base,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) =>
          resolveButtons(row).map((button) => ({
            icon: button.icon ?? "view",
            label: button.label,
            color: button.color,
            action: () => this.notifications.success(`${button.label} — done.`),
          })),
      },
    };
  }
}
