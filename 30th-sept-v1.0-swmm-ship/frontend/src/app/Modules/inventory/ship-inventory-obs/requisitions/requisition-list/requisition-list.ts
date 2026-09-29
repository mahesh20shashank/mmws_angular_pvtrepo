import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../../shared/components/data-grid/grid-action-icons";
import { GridStatusChipRenderer } from "../../../../../shared/components/data-grid/grid-status-chip-renderer";
import { ModalComponent } from "../../../../../shared/components/modal/modal.component";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { ExportKind, ExportToolbar } from "../../../../../shared/components/export-toolbar/export-toolbar";
import { ToolbarSearch } from "../../../../../shared/components/toolbar-search/toolbar-search";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../../Core/services/export/generic-export.service";
import { ObsApiService } from "../../services/obs-api.service";
import { ObsRequisitionSelectionStore } from "../../services/obs-requisition-selection-store";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { getErrorMessage } from "../../../../../Core/http/services/http-feedback";
import { ParentInventory, RequisitionCartType, RequisitionEntry } from "../../models/requisition.model";

type RequisitionKind = "routine" | "defect";

function printColumnFormat(field: string): ((value: unknown) => string) | undefined {
  if (field === "critical") return (v) => (v ? "YES" : "NO");
  if (field === "availableWithMo") return (v) => (v === "Available Onboard" ? "HELD" : "NOT HELD");
  return undefined;
}

const CART_TYPE_OPTIONS: { label: string; value: RequisitionCartType }[] = [
  { label: "Survey Cart", value: "Survey" },
  { label: "PTS Cart", value: "PTS" },
];

@Component({
  selector: "app-obs-requisition-list",
  standalone: true,
  imports: [ReactiveFormsModule, DataGrid, ModalComponent, SelectInput, ExportToolbar, ToolbarSearch, HelpGuidance, ButtonComponent],
  templateUrl: "./requisition-list.html",
  styleUrl: "./requisition-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequisitionList implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly selectionStore = inject(ObsRequisitionSelectionStore);
  private readonly notifications = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);

  kind: RequisitionKind = "routine";
  title = "";

  readonly cartTypeOptions = CART_TYPE_OPTIONS;
  readonly entries = signal<RequisitionEntry[]>([]);
  readonly selectedRows = signal<RequisitionEntry[]>([]);
  readonly cartModalOpen = signal(false);
  readonly cartTarget = signal<ParentInventory>("ILMS");
  readonly saving = signal(false);
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly searchText = signal("");
  columnDefs: ColDef[] = [];
  printColumns: PrintColumn[] = [];
  helpHtml = "";

  readonly filteredEntries = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    if (!query) return this.entries();
    return this.entries().filter((entry) =>
      [entry.patternNumber, entry.description, entry.equipmentClass, entry.category, entry.authority, entry.dartNumber]
        .some((value) => (value ?? "").toLowerCase().includes(query)),
    );
  });

  readonly cartForm = this.fb.nonNullable.group({
    cartType: ["Survey" as RequisitionCartType, Validators.required],
  });

  ngOnInit(): void {
    const data = this.route.snapshot.data as { kind: RequisitionKind; title: string };
    this.kind = data.kind;
    this.title = data.title;
    this.helpHtml =
      this.kind === "routine"
        ? `<p class="mb-0">Spares requested by maintainers for a <strong>planned routine</strong>. Tick rows and use <strong>Initiate Issue</strong> to issue them, or <strong>Send to Cart (MO/WED)</strong> to forward for replenishment.</p>`
        : `<p class="mb-0">Spares requested by maintainers against a <strong>defect</strong>. Every item needs a <strong>DART number</strong> before it can be issued. Once a DART number is present, tick the rows and use <strong>Initiate Issue</strong>, or <strong>Send to Cart (MO/WED)</strong> to forward for replenishment.</p>`;
    this.columnDefs = this.buildColumns();
    this.printColumns = this.columnDefs
      .filter((c): c is ColDef & { field: string } => !!c.field)
      .map((c) => ({
        header: String(c.headerName ?? c.field),
        field: c.field,
        format: printColumnFormat(c.field),
      }));
    void this.load();
  }

  private buildColumns(): ColDef[] {
    // Column set mirrors the legacy "Routine Spare Requests" page's visible grid — the
    // remaining legacy fields (equipment class, critical, routine name/no/description) aren't
    // grid columns there either; they feed the eye-icon "View Details" popup, so they live in
    // `viewTarget()`'s modal here instead (see the html).
    const base: ColDef[] = [
      { field: "requestedFrom", headerName: "Parent Inventory", width: 140, filter: "agTextColumnFilter" },
      { field: "patternNumber", headerName: "Pattern Number", flex: 1, filter: "agTextColumnFilter" },
      { field: "description", headerName: "Item Description", flex: 1.3, filter: "agTextColumnFilter" },
      {
        field: "availableWithMo",
        headerName: "Onboard Availability Status",
        width: 170,
        cellRenderer: GridStatusChipRenderer,
        cellRendererParams: {
          toneMap: { "Available Onboard": "success", "Requires MO/WED": "danger" },
          labelMap: { "Available Onboard": "HELD", "Requires MO/WED": "NOT HELD" },
        },
      },
      { field: "quantityRequired", headerName: "Qty Requested By Maintainer", width: 180, filter: "agTextColumnFilter" },
      { field: "quantityAuthorised", headerName: "Qty Authorised", width: 130, filter: "agTextColumnFilter" },
      { field: "quantityAvailable", headerName: "Qty Held", width: 110, filter: "agTextColumnFilter" },
      { field: "authority", headerName: "Authority", width: 130, filter: "agTextColumnFilter" },
      { field: "dartNumber", headerName: "DART No", width: 130, filter: "agTextColumnFilter" },
      { field: "category", headerName: "Item Category", width: 130, filter: "agTextColumnFilter" },
      { field: "wedInventoryType", headerName: "WED Inventory Type", width: 160, filter: "agTextColumnFilter" },
      {
        field: "status",
        headerName: "Status",
        width: 120,
        cellRenderer: GridStatusChipRenderer,
        cellRendererParams: {
          toneMap: { HELD: "success", "NOT HELD": "danger" },
        },
      },
    ];

    const withKindColumn: ColDef[] =
      this.kind === "defect"
        ? [...base, { field: "remarks", headerName: "Remarks", flex: 1, filter: "agTextColumnFilter" }]
        : base;

    return [
      ...withKindColumn,
      {
        headerName: "Action",
        width: 150,
        sortable: false,
        filter: false,
        cellRenderer: ActionRendererComponent,
        cellRendererParams: {
          actions: (row: RowData) => [
            { icon: "view", label: "View", color: "#7fb3e0", action: () => this.viewRow(row as unknown as RequisitionEntry) },
            { icon: "edit", label: "Issue", color: "#1d96e9", action: () => this.issueRow(row as unknown as RequisitionEntry) },
            { icon: "delete", label: "Delete", color: "#dc2626", action: () => this.deleteRow(row as unknown as RequisitionEntry) },
          ],
        },
      },
    ];
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredEntries() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, `${this.kind}-requisitions.csv`);
      return;
    }
    this.exportService.printRows(this.title, this.printColumns, rows);
  }

  private async load(): Promise<void> {
    const entries =
      this.kind === "routine"
        ? await firstValueFrom(this.api.getRoutineRequisitions())
        : await firstValueFrom(this.api.getDefectRequisitions());
    this.entries.set(entries);
  }

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as unknown as RequisitionEntry[]);
  }

  get canIssue(): boolean {
    if (this.kind === "routine") return this.selectedRows().length > 0;
    // Defect items need a DART number before they can be issued.
    return this.selectedRows().length > 0 && this.selectedRows().every((r) => !!r.dartNumber);
  }

  initiateIssue(): void {
    if (!this.selectedRows().length) return;
    this.selectionStore.setSelection(this.selectedRows());
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/requisitions", this.kind, "issue"]);
  }

  issueRow(entry: RequisitionEntry): void {
    this.selectionStore.setSelection([entry]);
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/requisitions", this.kind, "issue"]);
  }

  readonly deleteTarget = signal<RequisitionEntry | null>(null);
  readonly viewTarget = signal<RequisitionEntry | null>(null);

  viewRow(entry: RequisitionEntry): void {
    this.viewTarget.set(entry);
  }

  closeViewModal(): void {
    this.viewTarget.set(null);
  }

  deleteRow(entry: RequisitionEntry): void {
    this.deleteTarget.set(entry);
  }

  closeDeleteModal(): void {
    this.deleteTarget.set(null);
  }

  async confirmDelete(): Promise<void> {
    const entry = this.deleteTarget();
    if (!entry) return;
    this.deleteTarget.set(null);
    try {
      await firstValueFrom(this.api.deleteRequisition(this.kind, entry.id));
      void this.load();
    } catch {
      // Real HTTP call — the interceptor already raises the error toast for it.
    }
  }

  openCartModal(target: ParentInventory): void {
    if (!this.selectedRows().length) return;
    this.cartTarget.set(target);
    this.cartModalOpen.set(true);
  }

  closeCartModal(): void {
    this.cartModalOpen.set(false);
  }

  async confirmSendToCart(): Promise<void> {
    this.saving.set(true);
    try {
      const raw = this.cartForm.getRawValue();
      const target = this.cartTarget();
      const { totalCount, unmatchedCount } = await firstValueFrom(
        this.api.sendRequisitionsToCart(this.kind, {
          ids: this.selectedRows().map((r) => r.id),
          parentInventory: target,
          entries: this.selectedRows().map((r) => ({
            id: r.id,
            patternNumber: r.patternNumber,
            description: r.description,
            quantity: r.quantityRequired,
          })),
          ...raw,
        }),
      );
      if (unmatchedCount > 0) {
        this.notifications.warning(
          `${unmatchedCount} of ${totalCount} row(s) sent without a catalog match — ` +
            `${target === "ILMS" ? "MO" : "WED"} staff will need to link ${unmatchedCount === 1 ? "it" : "them"} manually.`,
        );
      } else {
        this.notifications.success(`${totalCount} row(s) sent to the ${target === "ILMS" ? "MO" : "WED"} cart.`);
      }
      this.closeCartModal();
      void this.load();
    } catch (error) {
      this.notifications.error(getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
