import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { ColDef, RowData } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../shared/components/data-grid/grid-action-icons";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { ExportKind, ExportToolbar } from "../../../../shared/components/export-toolbar/export-toolbar";
import { ToolbarSearch } from "../../../../shared/components/toolbar-search/toolbar-search";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { getErrorMessage } from "../../../../Core/http/services/http-feedback";
import { MoApiService, MoCartKind } from "../services/mo-api.service";
import { MoCartEntry } from "../models/mo.model";

interface CartListRouteData {
  kind: MoCartKind;
  title: string;
  columns: ColDef[];
  helpHtml: string;
  showApprovalButton?: boolean;
  showSyncButton?: boolean;
  syncButtonLabel?: string;
}

/** Row label -> `MoCartEntry` field, for the "View" action's detail modal. Shared by all 6 cart
 * kinds — each kind only populates a subset of these fields, so the modal renders whichever the
 * loaded entry actually has. */
const DETAIL_FIELDS: { label: string; field: keyof MoCartEntry }[] = [
  { label: "Item Code", field: "itemCode" },
  { label: "Item Description", field: "itemDescription" },
  { label: "ILMS Sync Status", field: "syncStatus" },
  { label: "HOD Approval Status", field: "hodApprovalStatus" },
  { label: "Denomination", field: "denomination" },
  { label: "Category", field: "category" },
  { label: "Equipment Class", field: "equipmentClass" },
  { label: "Equipment Nomenclature", field: "equipmentNomenclature" },
  { label: "DART No", field: "dartNo" },
  { label: "Demand No", field: "demandNo" },
  { label: "ILMS Demand No.", field: "ilmsDemandNo" },
  { label: "Survey No.", field: "surveyNo" },
  { label: "Demand Type", field: "demandType" },
  { label: "MO Item Issue Status", field: "moIssueStatus" },
  { label: "INcatting Status", field: "incattingStatus" },
  { label: "MO Vetting Remarks", field: "moVettingRemarks" },
];

@Component({
  selector: "app-mo-cart-list",
  standalone: true,
  imports: [DataGrid, ModalComponent, ExportToolbar, ToolbarSearch, HelpGuidance, ButtonComponent],
  templateUrl: "./cart-list.html",
  styleUrl: "./cart-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartList implements OnInit {
  private readonly api = inject(MoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);

  private kind: MoCartKind = "survey";
  title = "";
  helpHtml = "";
  columnDefs: ColDef[] = [];
  printColumns: PrintColumn[] = [];
  showApprovalButton = true;
  showSyncButton = false;
  syncButtonLabel = "Sync with ILMS";

  readonly entries = signal<MoCartEntry[]>([]);
  readonly selectedRows = signal<MoCartEntry[]>([]);
  readonly syncing = signal(false);
  readonly sending = signal(false);
  readonly searchText = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly activeEntry = signal<MoCartEntry | null>(null);

  readonly detailRows = computed(() => {
    const entry = this.activeEntry();
    if (!entry) return [];
    return DETAIL_FIELDS.map(({ label, field }) => ({ label, value: entry[field] })).filter((row) => !!row.value);
  });

  readonly filteredEntries = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    if (!query) return this.entries();
    return this.entries().filter((entry) =>
      Object.values(entry).some((value) => typeof value === "string" && value.toLowerCase().includes(query)),
    );
  });

  ngOnInit(): void {
    const data = this.route.snapshot.data as CartListRouteData;
    this.kind = data.kind;
    this.title = data.title;
    this.helpHtml = data.helpHtml;
    this.columnDefs = [...data.columns, this.buildActionsColumn()];
    this.printColumns = this.columnDefs
      .filter((c): c is ColDef & { field: string } => !!c.field)
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
    this.showApprovalButton = data.showApprovalButton ?? true;
    this.showSyncButton = data.showSyncButton ?? false;
    this.syncButtonLabel = data.syncButtonLabel ?? "Sync with ILMS";
    void this.load();
  }

  /** IIF rows get a second "Edit" action alongside "View" — the only cart kind whose
   * `IIF` model carries real, editable detail fields (`iif-details/`, `GET/PATCH ilms/iif/<pk>/`)
   * beyond what the cart's own summary columns already show. */
  private buildActionsColumn(): ColDef {
    return {
      headerName: "Actions",
      width: this.kind === "iif" ? 140 : 100,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => {
          const actions = [
            { icon: "view", label: "View", color: "#1d96e9", action: () => this.activeEntry.set(row as unknown as MoCartEntry) },
          ];
          if (this.kind === "iif") {
            actions.push({
              icon: "edit",
              label: "Edit IIF Details",
              color: "#2563eb",
              action: () => void this.router.navigate([(row as unknown as MoCartEntry).id, "details"], { relativeTo: this.route }),
            });
          }
          return actions;
        },
      },
    };
  }

  closeDetail(): void {
    this.activeEntry.set(null);
  }

  private async load(): Promise<void> {
    this.entries.set(await firstValueFrom(this.api.getCart(this.kind)));
  }

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as unknown as MoCartEntry[]);
  }

  async sendForHodApproval(): Promise<void> {
    if (!this.selectedRows().length) return;
    this.sending.set(true);
    try {
      await firstValueFrom(
        this.api.sendCartForHodApproval(this.kind, this.selectedRows().map((e) => e.id)),
      );
      this.notifications.success("Sent for HOD approval.");
      void this.load();
    } catch (error) {
      // `sendCartForHodApproval` is a client-side stub for kinds with no backend approval step
      // (e.g. "iif") — it never reaches the HTTP interceptor, so this is the only feedback surface.
      this.notifications.error(getErrorMessage(error));
    } finally {
      this.sending.set(false);
    }
  }

  async sync(): Promise<void> {
    this.syncing.set(true);
    try {
      const result = await firstValueFrom(this.api.syncCartWithIlms(this.kind, this.entries()));
      this.notifications.success(
        result.updated ? `Sync complete — ${result.updated} record(s) synced.` : result.message,
      );
      void this.load();
    } catch (error) {
      // `syncCartWithIlms` is a client-side stub for kinds with no backend sync endpoint ("receive")
      // — it never reaches the HTTP interceptor, so this is the only feedback surface.
      this.notifications.error(getErrorMessage(error));
    } finally {
      this.syncing.set(false);
    }
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredEntries() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, `${this.kind}-cart.csv`);
      return;
    }
    this.exportService.printRows(this.title, this.printColumns, rows);
  }
}
