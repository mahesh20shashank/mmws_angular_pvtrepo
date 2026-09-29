import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, EventEmitter, OnInit, Output, computed, inject, input, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { NgTemplateOutlet } from "@angular/common";
import { firstValueFrom } from "rxjs";
import { CellCallbackParams, ColDef, GridApi, GridReadyEvent, ICellRendererParams, RowData } from "ag-grid-community";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { DropdownOption, SelectInput } from "../../../../shared/components/select-input/select-input";
import { IconComponent } from "../../../../shared/components";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { GridSelectCell } from "../../../../shared/components/data-grid/grid-select-cell";
import { GridTextCell } from "../../../../shared/components/data-grid/grid-text-cell";
import { GridDateCell } from "../../../../shared/components/data-grid/grid-date-cell";
import { SfdReferenceDataApiService } from "../services/sfd-reference-data-api.service";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { RhsiMasterDepartmentSummary, RhsiMasterEquipment, RhsiMasterListResponse, RhsiMasterSaveRow } from "./rhsi-master.models";

/** Cell text built from API data, so escape before interpolating into a cellRenderer's HTML string. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

/** Mutable per-row working copy, plus what the operator has typed for the RHSI commit
 *  (a value in these three fields is what actually triggers the one-time lock server-side —
 *  see RHSIMasterSaveAPIView — so they're tracked separately from the row's persisted state). */
interface EditableRow extends RhsiMasterEquipment {
  rhsiStatus: "" | "YES" | "NA";
  rhsiValue: string;
  rhsiDate: string;
}

const ALL_DEPARTMENTS = "";
const ALL_SUB_DEPARTMENTS = "";

type AssignmentFilter = "all" | "assigned" | "unassigned";

@Component({
  selector: "app-rhsi-master-modal",
  standalone: true,
  imports: [FormsModule, ModalComponent, SelectInput, NgTemplateOutlet, IconComponent, DataGrid, ButtonComponent],
  templateUrl: "./rhsi-master-modal.component.html",
  styleUrl: "./rhsi-master-modal.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RhsiMasterModalComponent implements OnInit {
  private readonly sfdReferenceDataApi = inject(SfdReferenceDataApiService);
  private readonly notify = inject(NotificationService);

  @Output() readonly closed = new EventEmitter<void>();
  /** Emitted after a successful save — the sub-department gate re-checks itself on this. */
  @Output() readonly saved = new EventEmitter<void>();

  /** Renders as a plain full-width panel (no `<app-modal>` wrapper, no Close button) for the
   *  Reference Data "RHSI Master" tab, which embeds this permanently like the other master-data
   *  tabs there — instead of the floating-overlay style the sync-steps page's "Assign Sub
   *  Departments" button still opens this as (the default `false`). */
  readonly inline = input(false);

  readonly loading = signal(false);
  readonly showFilters = signal(false);
  readonly saving = signal(false);
  readonly savingRowId = signal<number | null>(null);
  readonly autoAssigning = signal(false);
  readonly rows = signal<EditableRow[]>([]);
  readonly departmentOptions = signal<{ id: number; name: string }[]>([]);
  readonly subDepartments = signal<{ id: number; name: string; department_id: number | null }[]>([]);
  readonly byDepartment = signal<RhsiMasterDepartmentSummary[]>([]);
  readonly summaryTotal = signal(0);
  readonly summaryAssigned = signal(0);
  readonly summaryUnassigned = signal(0);
  readonly canSeeAllDepartments = signal(false);
  /** ADMIN/SHIPADMIN only — same role check as canSeeAllDepartments today, but kept as its
   *  own field since RHSIMasterAutoAssignAPIView enforces it independently server-side. */
  readonly canAutoAssign = signal(false);

  private readonly dirtyIds = signal<ReadonlySet<number>>(new Set());

  readonly selectedDepartment = signal<string>(ALL_DEPARTMENTS);
  readonly selectedSubDepartment = signal<string>(ALL_SUB_DEPARTMENTS);
  readonly assignmentFilter = signal<AssignmentFilter>("all");
  readonly globalSearch = signal("");

  readonly departmentFilterOptions = computed<DropdownOption[]>(() => [
    { label: "All Departments", value: ALL_DEPARTMENTS },
    ...this.departmentOptions().map((d) => ({ label: d.name, value: String(d.id) })),
  ]);

  readonly subDepartmentFilterOptions = computed<DropdownOption[]>(() => {
    const dept = this.selectedDepartment();
    const scoped = dept
      ? this.subDepartments().filter((sd) => String(sd.department_id ?? "") === dept)
      : this.subDepartments();
    return [
      { label: "All Sub Departments", value: ALL_SUB_DEPARTMENTS },
      ...scoped.map((sd) => ({ label: sd.name, value: String(sd.id) })),
    ];
  });

  readonly assignmentFilterOptions: DropdownOption[] = [
    { label: "All Equipment", value: "all" },
    { label: "Assigned", value: "assigned" },
    { label: "Not Assigned", value: "unassigned" },
  ];

  readonly hasActiveFilters = computed(
    () =>
      this.selectedDepartment() !== ALL_DEPARTMENTS ||
      this.selectedSubDepartment() !== ALL_SUB_DEPARTMENTS ||
      this.assignmentFilter() !== "all" ||
      !!this.globalSearch(),
  );

  readonly filteredRows = computed(() => {
    const dept = this.selectedDepartment();
    const subDept = this.selectedSubDepartment();
    const assignment = this.assignmentFilter();
    const globalTerm = this.globalSearch().trim().toLowerCase();

    return this.rows().filter((r) => {
      if (dept && String(r.department_id ?? "") !== dept) return false;
      if (subDept && String(r.sub_department_id ?? "") !== subDept) return false;
      if (assignment === "assigned" && !r.sub_department_id) return false;
      if (assignment === "unassigned" && r.sub_department_id) return false;
      if (globalTerm) {
        const haystack = [
          r.equipment_code,
          r.equipment_name,
          r.nomenclature,
          r.department_name,
          r.ilms_vendor_code,
          r.system_status,
        ]
          .filter((v) => v != null)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(globalTerm)) return false;
      }
      return true;
    });
  });

  readonly dirtyCount = computed(() => this.dirtyIds().size);

  /** Every row's Sub Department picker offers the FULL scoped list, not just the row's own
   *  department's sub departments — matches the reference project's rhsi_master_view exactly
   *  (an ADMIN/SHIPADMIN can place any equipment under any sub department from this page, the
   *  label spells out which department each one belongs to since the list isn't pre-filtered). */
  readonly subDepartmentRowOptions = computed<DropdownOption[]>(() => {
    const byId = new Map(this.departmentOptions().map((d) => [d.id, d.name]));
    return this.subDepartments().map((sd) => ({
      label: `${sd.name} - ${byId.get(sd.department_id ?? -1) ?? "—"}`,
      value: sd.id,
    }));
  });

  readonly rowId = (data: RowData) => String((data as EditableRow).id);

  private gridApi?: GridApi;

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
  }

  /** Forces the given row's `columns` (default: every column that can depend on state this
   *  component just changed outside ag-grid's own knowledge, e.g. dirty/saving) to re-run their
   *  `cellRendererSelector`/renderer — plain `setDataValue` alone only repaints the one field
   *  that changed, not sibling cells whose look depends on it (RHSI Value/Date depend on RHSI
   *  status; Action's disabled state depends on the dirty set). */
  private refreshRow(id: number, columns?: string[]): void {
    const api = this.gridApi as unknown as
      | { getRowNode(id: string): unknown; refreshCells(params: Record<string, unknown>): void }
      | undefined;
    const node = api?.getRowNode(String(id));
    if (!node) return;
    api?.refreshCells({ rowNodes: [node], columns, force: true });
  }

  private readonly subDeptSelectOptions = computed(() => [
    { label: "— Select —", value: null },
    ...this.subDepartmentRowOptions(),
  ]);

  private readonly systemStatusOptions = [
    { label: "— Select —", value: "" },
    { label: "Equipment", value: "Equipment" },
    { label: "System", value: "System" },
    { label: "Weapon", value: "Weapon" },
  ];

  private readonly rhsiStatusOptions = [
    { label: "—", value: "" },
    { label: "Yes", value: "YES" },
    { label: "N/A", value: "NA" },
  ];

  private formatDisplayDate(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  readonly columnDefs = computed<ColDef[]>(() => [
    { headerName: "INS. Code", field: "equipment_code", valueFormatter: (p) => String(p["value"] ?? "—") },
    { headerName: "Equipment Name", field: "equipment_name", valueFormatter: (p) => String(p["value"] ?? "—") },
    { headerName: "Equipment Nomenclature", field: "nomenclature" },
    { headerName: "Department", field: "department_name" },
    {
      headerName: "ILMS Equipment Code",
      field: "ilms_vendor_code",
      valueFormatter: (p) => String(p["value"] || "0"),
      cellRenderer: GridTextCell,
      cellRendererParams: {
        onValueChange: (row: RowData, _field: string, value: unknown) =>
          this.onVendorCodeChange(row as EditableRow, String(value)),
      },
    },
    {
      headerName: "Sub Department",
      field: "sub_department_id",
      cellRenderer: GridSelectCell,
      cellRendererParams: {
        getOptions: () => this.subDeptSelectOptions(),
        onValueChange: (row: RowData, _field: string, value: unknown) =>
          this.onSubDepartmentChange(row as EditableRow, value as string | number | null),
      },
    },
    {
      headerName: "Sub Dept Source",
      field: "sub_dept_source",
      cellRenderer: (p: ICellRendererParams) => {
        const source = (p.data as EditableRow).sub_dept_source;
        const cls =
          source === "CMMS" ? "rhsi-master__badge--cmms" : source === "SWMM" ? "rhsi-master__badge--swmm" : "rhsi-master__badge--none";
        const label = source === "NOT_ASSIGNED" ? "Not assigned" : source;
        return `<span class="rhsi-master__badge ${cls}">${escapeHtml(label)}</span>`;
      },
    },
    {
      headerName: "System / Equipment",
      field: "system_status",
      cellRenderer: GridSelectCell,
      cellRendererParams: {
        getOptions: () => this.systemStatusOptions,
        onValueChange: (row: RowData, _field: string, value: unknown) =>
          this.onSystemStatusChange(row as EditableRow, String(value)),
      },
    },
    {
      headerName: "RHSI",
      field: "rhsiStatus",
      cellRendererSelector: (p: ICellRendererParams) => {
        const row = p.data as EditableRow;
        if (row.rhsi_initialised) {
          return {
            component: (params: ICellRendererParams) => {
              const r = params.data as EditableRow;
              return `<span class="rhsi-master__rhsi-locked" title="RHSI is a one-time commit and has already been set for this equipment">🔒 ${r.eq_rhsi ? "Yes" : "N/A"}</span>`;
            },
          };
        }
        return {
          component: GridSelectCell,
          params: {
            getOptions: () => this.rhsiStatusOptions,
            onValueChange: (r: RowData, _field: string, value: unknown) => {
              this.onRhsiStatusChange(r as EditableRow, value as "" | "YES" | "NA");
              this.refreshRow((r as EditableRow).id, ["rhsiValue", "rhsiDate"]);
            },
          },
        };
      },
    },
    {
      headerName: "RHSI Value (HH:MM)",
      field: "rhsiValue",
      cellRendererSelector: (p: ICellRendererParams) => {
        const row = p.data as EditableRow;
        if (row.rhsi_initialised) {
          return { component: (params: ICellRendererParams) => escapeHtml((params.data as EditableRow).eq_rhsi || "—") };
        }
        if (row.rhsiStatus === "YES") {
          return {
            component: GridTextCell,
            params: {
              onValueChange: (r: RowData, _field: string, value: unknown) =>
                this.onRhsiValueChange(r as EditableRow, String(value)),
            },
          };
        }
        return { component: () => "—" };
      },
    },
    {
      headerName: "RHSI Upto Date",
      field: "rhsiDate",
      cellRendererSelector: (p: ICellRendererParams) => {
        const row = p.data as EditableRow;
        if (row.rhsi_initialised) {
          return { component: (params: ICellRendererParams) => this.formatDisplayDate((params.data as EditableRow).rhsi_updated_until) };
        }
        if (row.rhsiStatus === "YES") {
          return {
            component: GridDateCell,
            params: {
              onValueChange: (r: RowData, _field: string, value: unknown) =>
                this.onRhsiDateChange(r as EditableRow, String(value)),
            },
          };
        }
        return { component: () => "—" };
      },
    },
    {
      headerName: "Action",
      colId: "action",
      sortable: false,
      cellRenderer: (p: ICellRendererParams) => {
        const row = p.data as EditableRow;
        const isSaving = this.savingRowId() === row.id;
        const disabled = isSaving || !this.dirtyIds().has(row.id);
        return `<button type="button" class="filter__btn filter__btn--primary rhsi-master__row-save-btn"${disabled ? " disabled" : ""}>${isSaving ? "Saving…" : "Save"}</button>`;
      },
    },
  ]);

  /** The Action column's Save button is plain injected HTML (see `columnDefs` above) reusing
   *  the same `.filter__btn--primary` classes as the header actions, so it can't carry an
   *  Angular `(click)` binding — this catches its clicks via the grid's own event instead. */
  onGridCellClicked(event: CellCallbackParams): void {
    if (event.colDef?.headerName !== "Action") return;
    const row = event.data as EditableRow;
    if (this.savingRowId() === row.id || !this.dirtyIds().has(row.id)) return;
    void this.saveRow(row);
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const res: RhsiMasterListResponse = await firstValueFrom(this.sfdReferenceDataApi.getRhsiMaster());
      this.canSeeAllDepartments.set(res.can_see_all_departments);
      this.canAutoAssign.set(res.can_auto_assign_sub_departments);
      this.departmentOptions.set(res.department_options);
      this.subDepartments.set(res.sub_departments);
      this.byDepartment.set(res.summary.by_department);
      this.summaryTotal.set(res.summary.total);
      this.summaryAssigned.set(res.summary.assigned);
      this.summaryUnassigned.set(res.summary.unassigned);
      this.rows.set(
        res.equipments.map((e) => ({ ...e, rhsiStatus: "", rhsiValue: "", rhsiDate: "" })),
      );
      this.dirtyIds.set(new Set());
    } catch {
      this.notify.error("Could not load the equipment masters table.", "RHSI Master");
    } finally {
      this.loading.set(false);
    }
  }

  clearFilters(): void {
    this.selectedDepartment.set(ALL_DEPARTMENTS);
    this.selectedSubDepartment.set(ALL_SUB_DEPARTMENTS);
    this.assignmentFilter.set("all");
    this.globalSearch.set("");
  }

  onDepartmentFilterChange(value: string): void {
    this.selectedDepartment.set(value);
    this.selectedSubDepartment.set(ALL_SUB_DEPARTMENTS);
  }

  private markDirty(id: number): void {
    this.dirtyIds.update((ids) => new Set(ids).add(id));
    this.refreshRow(id, ["action"]);
  }

  onVendorCodeChange(row: EditableRow, value: string): void {
    row.ilms_vendor_code = value;
    this.markDirty(row.id);
  }

  onSubDepartmentChange(row: EditableRow, value: string | number | null): void {
    row.sub_department_id = value === "" || value == null ? null : Number(value);
    this.markDirty(row.id);
  }

  onSystemStatusChange(row: EditableRow, value: string): void {
    row.system_status = value;
    this.markDirty(row.id);
  }

  onRhsiStatusChange(row: EditableRow, value: "" | "YES" | "NA"): void {
    row.rhsiStatus = value;
    this.markDirty(row.id);
  }

  onRhsiValueChange(row: EditableRow, value: string): void {
    row.rhsiValue = value;
    this.markDirty(row.id);
  }

  onRhsiDateChange(row: EditableRow, value: string): void {
    row.rhsiDate = value;
    this.markDirty(row.id);
  }

  private toSaveRow(r: EditableRow): RhsiMasterSaveRow {
    return {
      id: r.id,
      vendor_code: r.ilms_vendor_code,
      sub_department_id: r.sub_department_id,
      system_status: r.system_status,
      ...(r.rhsiStatus ? { rhsi_status: r.rhsiStatus } : {}),
      ...(r.rhsiValue ? { rhsi_value: r.rhsiValue } : {}),
      ...(r.rhsiDate ? { rhsi_date: r.rhsiDate } : {}),
    };
  }

  async saveAll(): Promise<void> {
    const dirty = this.dirtyIds();
    if (!dirty.size) {
      this.notify.error("Nothing to save — no rows were changed.", "RHSI Master");
      return;
    }
    const payload = this.rows()
      .filter((r) => dirty.has(r.id))
      .map((r) => this.toSaveRow(r));

    this.saving.set(true);
    try {
      const res = await firstValueFrom(this.sfdReferenceDataApi.saveRhsiMaster(payload));
      this.notify.success(res.message, "RHSI Master");
      await this.load();
      this.saved.emit();
    } catch {
      this.notify.error("Failed to save changes.", "RHSI Master");
    } finally {
      this.saving.set(false);
    }
  }

  async saveRow(row: EditableRow): Promise<void> {
    if (!this.dirtyIds().has(row.id)) {
      this.notify.error("Nothing to save — this row wasn't changed.", "RHSI Master");
      return;
    }
    this.savingRowId.set(row.id);
    this.refreshRow(row.id, ["action"]);
    try {
      const res = await firstValueFrom(this.sfdReferenceDataApi.saveRhsiMaster([this.toSaveRow(row)]));
      this.notify.success(res.message, "RHSI Master");
      await this.load();
      this.saved.emit();
    } catch {
      this.notify.error("Failed to save this row.", "RHSI Master");
    } finally {
      this.savingRowId.set(null);
      this.refreshRow(row.id, ["action"]);
    }
  }

  /** Load-balances every still-unassigned row across its department's existing sub
   *  departments — see RHSIMasterAutoAssignAPIView's docstring for the algorithm. Only ever
   *  touches rows this table already shows as unassigned; anything a human already picked
   *  (here or via Step 1's own CMMS-supplied value) is left exactly as it is. */
  async autoAssign(): Promise<void> {
    if (this.autoAssigning()) return;
    this.autoAssigning.set(true);
    try {
      const res = await firstValueFrom(this.sfdReferenceDataApi.autoAssignSubDepartments());
      if (!res.status) {
        this.notify.error(res.message ?? "Auto-assign failed.", "RHSI Master");
        return;
      }
      const skippedNote = res.skipped_departments.length
        ? ` (${res.skipped_departments.map((d) => d.department).join(", ")} skipped — no Sub Departments in Masters)`
        : "";
      // Without this, a click that fixed 0 of 10 "no Department at all" rows still reported a
      // plain success toast with nothing explaining why the readiness gate stayed exactly where
      // it was — see RhsiMasterAutoAssignResponse.department_less_count's own doc.
      const departmentLessNote = res.department_less_count
        ? ` ${res.department_less_count} equipment have no Department at all and could not be ` +
          `auto-assigned — pick a Sub Department for them manually in the table below.`
        : "";
      this.notify.success(
        `${res.assigned_total} equipment auto-assigned${skippedNote}.${departmentLessNote}`,
        "RHSI Master",
      );
      await this.load();
      this.saved.emit();
    } catch {
      this.notify.error("Failed to auto-assign sub departments.", "RHSI Master");
    } finally {
      this.autoAssigning.set(false);
    }
  }

  close(): void {
    this.closed.emit();
  }
}
