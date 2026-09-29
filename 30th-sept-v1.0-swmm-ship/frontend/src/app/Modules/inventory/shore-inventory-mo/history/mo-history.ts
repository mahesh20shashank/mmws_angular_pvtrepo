import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ColDef, RowData } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../shared/components/data-grid/grid-action-icons";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { MoApiService } from "../services/mo-api.service";
import { IifHistoryEntry, NormalDemandHistoryEntry, RioHistoryEntry } from "../models/mo.model";

type HistoryRow = NormalDemandHistoryEntry | RioHistoryEntry | IifHistoryEntry;

type HistoryTab = "normal" | "pts" | "rio" | "iif";

const HELP_HTML = `<p class="mb-0">Synced Normal/PTS/RIO demands and completed IIF requisitions for
  your department. Switch tabs to see each workflow's history; use the row action to view full
  details.</p>`;

const SER_COLUMN: ColDef = { field: "ser", headerName: "Ser", width: 80 };

/** Normal Demands and PTS Demands share every column except the demand-number label — built once
 * and reused for both instead of two near-duplicate arrays. */
function buildDemandColumns(demandNoLabel: string): ColDef[] {
  return [
    SER_COLUMN,
    { field: "moItemCode", headerName: "MO Item Code", flex: 1 },
    { field: "itemDescription", headerName: "Item Description", flex: 1.2 },
    { field: "category", headerName: "Category", width: 110 },
    { field: "surveyNo", headerName: "Survey No", width: 110 },
    { field: "surveyDate", headerName: "Survey Date", width: 110 },
    { field: "demandNo", headerName: demandNoLabel, width: 130 },
    { field: "demandedQty", headerName: "Demanded Qty", width: 120 },
    { field: "demandDate", headerName: "Demand Date", width: 110 },
    { field: "moIssuedQty", headerName: "MO Issued Qty", width: 120 },
    { field: "onboardReceiptDate", headerName: "Onboard Receipt Date", width: 160 },
    { field: "onboardReceiptQty", headerName: "Onboard Receipt Qty", width: 160 },
    { field: "gatePassNo", headerName: "Gate Pass No", width: 130 },
    { field: "gatePassDate", headerName: "Gate Pass Date", width: 130 },
    { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
    { field: "equipmentNomenclature", headerName: "Equipment Nomenclature (SFD)", flex: 1.2 },
    { field: "dartNo", headerName: "DART No", width: 110 },
  ];
}

const NORMAL_COLUMNS = buildDemandColumns("Demand No");
const PTS_COLUMNS = buildDemandColumns("PTS Demand No");

/** BACKEND GAP: no RIO-specific model, field, or endpoint exists anywhere in the `ilms` app —
 * `getRioDemandHistory()` always returns `[]`, so this tab's grid never has rows regardless of
 * the columns declared here. Columns kept for parity with the reference design. */
const RIO_COLUMNS: ColDef[] = [
  SER_COLUMN,
  { field: "rioType", headerName: "RIO Type", width: 110 },
  { field: "moItemCode", headerName: "MO Item Code", flex: 1 },
  { field: "itemDescription", headerName: "Item Description", flex: 1.2 },
  { field: "rioDemandNo", headerName: "RIO Demand No", width: 130 },
  { field: "demandDate", headerName: "Demand Date", width: 110 },
  { field: "dtg", headerName: "DTG", width: 110 },
  { field: "year", headerName: "Year", width: 90 },
  { field: "dartNo", headerName: "DART No", width: 110 },
  { field: "qtyDemanded", headerName: "Qty Demanded", width: 120 },
  { field: "moIssueQty", headerName: "MO Issue Qty", width: 120 },
  { field: "onboardReceiptDate", headerName: "Onboard Receipt Date", width: 160 },
  { field: "gatePassNo", headerName: "Gate Pass No", width: 130 },
  { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
  { field: "equipmentNomenclature", headerName: "Equipment Nomenclature (SFD)", flex: 1.2 },
];

const IIF_COLUMNS: ColDef[] = [
  SER_COLUMN,
  { field: "iifRequisitionNo", headerName: "IIF Requisition No", flex: 1 },
  { field: "iifRequisitionDate", headerName: "IIF Requisition Date", width: 150 },
  { field: "ilmsSyncDate", headerName: "ILMS Sync Date", width: 130 },
  { field: "swmmItemCode", headerName: "SWMM Item Code", width: 140 },
  { field: "moItemCode", headerName: "MO Item Code", width: 130 },
  { field: "incattingCompletionDate", headerName: "INcatting Completion Date", width: 180 },
  { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
  { field: "equipmentNomenclature", headerName: "Equipment Nomenclature (SFD)", flex: 1.2 },
];

/** Field key -> display label, for the "View" action's detail modal — shared across all 4 history
 * tabs (each row shape only populates a subset; the modal renders whichever keys are present). */
const DETAIL_LABELS: Record<string, string> = {
  ser: "Ser",
  moItemCode: "MO Item Code",
  itemDescription: "Item Description",
  category: "Category",
  surveyNo: "Survey No",
  surveyDate: "Survey Date",
  demandNo: "Demand No",
  demandedQty: "Demanded Qty",
  demandDate: "Demand Date",
  moIssuedQty: "MO Issued Qty",
  onboardReceiptDate: "Onboard Receipt Date",
  onboardReceiptQty: "Onboard Receipt Qty",
  equipmentClass: "Equipment Class",
  equipmentNomenclature: "Equipment Nomenclature (SFD)",
  gatePassNo: "Gate Pass No",
  gatePassDate: "Gate Pass Date",
  dartNo: "DART No",
  rioType: "RIO Type",
  rioDemandNo: "RIO Demand No",
  dtg: "DTG",
  year: "Year",
  qtyDemanded: "Qty Demanded",
  moIssueQty: "MO Issue Qty",
  iifRequisitionNo: "IIF Requisition No",
  iifRequisitionDate: "IIF Requisition Date",
  ilmsSyncDate: "ILMS Sync Date",
  swmmItemCode: "SWMM Item Code",
  incattingCompletionDate: "INcatting Completion Date",
};

@Component({
  selector: "app-mo-history",
  standalone: true,
  imports: [DataGrid, ModalComponent, HelpGuidance, ButtonComponent],
  templateUrl: "./mo-history.html",
  styleUrl: "./mo-history.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoHistory implements OnInit {
  private readonly api = inject(MoApiService);

  readonly helpHtml = HELP_HTML;
  readonly activeTab = signal<HistoryTab>("normal");
  readonly rows = signal<HistoryRow[]>([]);
  readonly baseColumnDefs = signal<ColDef[]>(NORMAL_COLUMNS);
  readonly activeEntry = signal<HistoryRow | null>(null);

  readonly columnDefs = computed<ColDef[]>(() => [...this.baseColumnDefs(), this.buildActionsColumn()]);

  readonly detailRows = computed(() => {
    const entry = this.activeEntry();
    if (!entry) return [];
    return Object.entries(entry)
      .filter(([key, value]) => key !== "id" && value !== "" && value != null && DETAIL_LABELS[key])
      .map(([key, value]) => ({ label: DETAIL_LABELS[key], value: String(value) }));
  });

  ngOnInit(): void {
    void this.load();
  }

  selectTab(tab: HistoryTab): void {
    this.activeTab.set(tab);
    void this.load();
  }

  closeDetail(): void {
    this.activeEntry.set(null);
  }

  private buildActionsColumn(): ColDef {
    return {
      headerName: "Actions",
      width: 100,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          { icon: "view", label: "View", color: "#1d96e9", action: () => this.activeEntry.set(row as unknown as HistoryRow) },
        ],
      },
    };
  }

  /** "Ser" is a row-position label, not backend data — assigned here from the loaded list's order
   * rather than carried through the API layer. */
  private withSer<T extends { ser: number }>(rows: T[]): T[] {
    return rows.map((row, index) => ({ ...row, ser: index + 1 }));
  }

  private async load(): Promise<void> {
    switch (this.activeTab()) {
      case "normal":
        this.baseColumnDefs.set(NORMAL_COLUMNS);
        this.rows.set(this.withSer(await firstValueFrom(this.api.getNormalDemandHistory())));
        break;
      case "pts":
        this.baseColumnDefs.set(PTS_COLUMNS);
        this.rows.set(this.withSer(await firstValueFrom(this.api.getPtsDemandHistory())));
        break;
      case "rio":
        this.baseColumnDefs.set(RIO_COLUMNS);
        this.rows.set(this.withSer(await firstValueFrom(this.api.getRioDemandHistory())));
        break;
      case "iif":
        this.baseColumnDefs.set(IIF_COLUMNS);
        this.rows.set(this.withSer(await firstValueFrom(this.api.getIifHistory())));
        break;
    }
  }
}
