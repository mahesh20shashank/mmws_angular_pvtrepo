import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../shared/components/data-grid/grid-action-icons";
import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";
import { DynamicField, DynamicFieldSpec } from "../../../../shared/components/dynamic-field/dynamic-field";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";

interface CreateCartRow extends RowData {
  srNo: number;
  authorityType: string;
  itemCode: string;
  itemDescription: string;
  status: string;
  crpCategory: string;
  deno: string;
  crp: string;
  priceRs: number;
  incatYn: string;
  myStock: string;
  logoStk: number;
  qtyRequired: number;
}

interface ConversationEntry {
  lNo: number;
  department: string;
  type: string;
  remark: string;
  convBy: string;
  dtm: string;
}

type CartStage = "item" | "demand" | "conversation";

const FIELDS: DynamicFieldSpec[] = [
  {
    key: "authorityType",
    label: "Authority Type",
    kind: "select",
    options: [
      { label: "REP-Replenishment", value: "rep" },
      { label: "ARS-Auto Replenishment Store", value: "ars" },
      { label: "SPL-Special Demand", value: "spl" },
      { label: "PTS-Prior To Survey", value: "pts" },
    ],
  },
  { key: "itemCode", label: "Item Code", kind: "text" },
  { key: "itemDescription", label: "Item Description", kind: "text" },
  { key: "status", label: "Status", kind: "text" },
  { key: "crpCategory", label: "CRP Category", kind: "text" },
];

const ROWS: CreateCartRow[] = [
  { srNo: 1, authorityType: "REP", itemCode: "IT-001", itemDescription: "PC", status: "Active", crpCategory: "CR-105", deno: "PC", crp: "CR-105", priceRs: 45000, incatYn: "Y", myStock: "CR-105", logoStk: 10, qtyRequired: 10 },
  { srNo: 2, authorityType: "ARS", itemCode: "IT-002", itemDescription: "Monitor", status: "Active", crpCategory: "CR-205", deno: "Monitor", crp: "CR-205", priceRs: 15000, incatYn: "Y", myStock: "CR-105", logoStk: 5, qtyRequired: 5 },
];

const DEPARTMENT_OPTIONS = [
  { label: "DP001 - IT Department", value: "DP001" },
  { label: "DP002 - HR Department", value: "DP002" },
];
const TYPE_OPTIONS = [
  { label: "Clarify", value: "Clarify" },
  { label: "Forward", value: "Forward" },
];

const HELP_HTML = `<p class="mb-0">Search for an item and pick the demand authority type. Enter the required
  quantity and click Add to place the item in the cart, then work through Generate Demand and Approve to
  raise the internal demand.</p>`;

function nowStamp(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Reference: `ilms/transaction/create_cart.html`. `add_to_cart`'s real backend only writes to
 * `request.session` (no persisted model) — this stays local/demo, matching the reference's own
 * 3-stage "Cart View" sidebar (Item Information -> Generate Demand -> Approve -> Internal
 * Conversation), all local component state.
 */
@Component({
  selector: "app-mo-create-cart",
  standalone: true,
  imports: [ReactiveFormsModule, DynamicField, DataGrid, HelpGuidance, DetailDrawer, ButtonComponent],
  templateUrl: "./create-cart.html",
  styleUrl: "./create-cart.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCart {
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  readonly fields = FIELDS;
  readonly departmentOptions = DEPARTMENT_OPTIONS;
  readonly typeOptions = TYPE_OPTIONS;
  readonly rows = signal<CreateCartRow[]>(ROWS);
  readonly form = new FormGroup(Object.fromEntries(FIELDS.map((f) => [f.key, new FormControl("")])));

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.value as Record<string, string | null>,
  });

  readonly filteredRows = computed<CreateCartRow[]>(() => {
    const f = this.formValue();
    const authorityType = (f["authorityType"] ?? "").trim().toLowerCase();
    const itemCode = (f["itemCode"] ?? "").trim().toLowerCase();
    const itemDescription = (f["itemDescription"] ?? "").trim().toLowerCase();
    const status = (f["status"] ?? "").trim().toLowerCase();
    const crpCategory = (f["crpCategory"] ?? "").trim().toLowerCase();
    return this.rows().filter(
      (row) =>
        (!authorityType || row.authorityType.toLowerCase() === authorityType) &&
        (!itemCode || row.itemCode.toLowerCase().includes(itemCode)) &&
        (!itemDescription || row.itemDescription.toLowerCase().includes(itemDescription)) &&
        (!status || row.status.toLowerCase().includes(status)) &&
        (!crpCategory || row.crpCategory.toLowerCase().includes(crpCategory)),
    );
  });

  readonly activeRow = signal<CreateCartRow | null>(null);
  readonly stage = signal<CartStage>("item");
  readonly internalDemandNo = signal("");
  readonly conversationEntries = signal<ConversationEntry[]>([]);

  readonly conversationForm = this.fb.nonNullable.group({
    department: ["", Validators.required],
    type: ["", Validators.required],
    remark: ["", Validators.required],
  });

  readonly columnDefs: ColDef[] = [
    { field: "srNo", headerName: "Sr No", width: 80 },
    { field: "itemCode", headerName: "Item Code" },
    { field: "deno", headerName: "Deno" },
    { field: "crp", headerName: "CRP" },
    { field: "priceRs", headerName: "Price Rs" },
    { field: "incatYn", headerName: "INCATYN", width: 100 },
    { field: "myStock", headerName: "My Stock" },
    { field: "logoStk", headerName: "Logo Stk" },
    { field: "qtyRequired", headerName: "Quantity Required", width: 150 },
    {
      headerName: "Action",
      width: 100,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          { icon: "add", label: "Add", color: "#1d96e9", action: () => this.openCart(row as CreateCartRow) },
        ],
      },
    },
  ];

  getControl(key: string): FormControl {
    return this.form.get(key) as FormControl;
  }

  clear(): void {
    this.form.reset();
  }

  get nowStamp(): string {
    return nowStamp();
  }

  openCart(row: CreateCartRow): void {
    this.activeRow.set(row);
    this.stage.set("item");
    this.internalDemandNo.set("");
    this.conversationEntries.set([]);
    this.conversationForm.reset({ department: "", type: "", remark: "" });
  }

  closeCart(): void {
    this.activeRow.set(null);
  }

  generateDemand(): void {
    const row = this.activeRow();
    if (!row) return;
    this.internalDemandNo.set(`DEMAND_${row.itemCode}_${Date.now().toString().slice(-6)}`);
    this.stage.set("demand");
  }

  approveDemand(): void {
    this.stage.set("conversation");
    this.notifications.success(`Internal demand ${this.internalDemandNo()} approved.`);
  }

  upload(): void {
    this.notifications.success("File queued for upload.");
  }

  addConversation(): void {
    if (this.conversationForm.invalid) {
      this.conversationForm.markAllAsTouched();
      return;
    }
    const { department, type, remark } = this.conversationForm.getRawValue();
    this.conversationEntries.update((entries) => [
      ...entries,
      { lNo: entries.length + 1, department, type, remark, convBy: "You", dtm: nowStamp() },
    ]);
    this.conversationForm.reset({ department: "", type: "", remark: "" });
    this.notifications.success("Conversation entry added.");
  }
}
