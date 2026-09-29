import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, NgZone, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { GridApi, GridReadyEvent, RowData } from "ag-grid-community";
import { MasterCard } from "../../refit-maintenance/master-card/master-card";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { OperationalMaintenanceApi } from "../services/operational-maintenance-api";
import { IconComponent } from "../../../shared/components/icon/icon.component";



import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import {
  DropdownOption,
  SelectInput,
} from "../../../shared/components/select-input/select-input";
import { InputField } from "../../../shared/components/input-field/input-field";
import {
  DartDetailsApiResponse,
  DefectDetail,
  FilterOption,
  OpenDefect,
  Spare,
} from "./open-defects.model";
import { ActionRenderer } from "../../operational-maintenance/action-renderer/action-renderer";
import { NotificationService } from "../../../Core/services/notification/notification.service";
import { Subject } from "rxjs";
import { debounceTime, distinctUntilChanged } from "rxjs/operators";
import { HelpGuidance } from "../../../shared/components/help-guidance/help-guidance";

const HELP_HTML = `
  <p class="mb-0">Lists open defect DARTs. Filter by department, sub-department, maintenance period, occasion, equipment or defect date range, then select rows to raise an RA or DL, or use "Sync With CMMS" / "Fetch &amp; Save" to exchange data with CMMS.</p>
`;

@Component({
  selector: "app-open-defects",
  standalone: true,
  imports: [CommonModule, MasterCard, DataGrid, ReactiveFormsModule, SelectInput, InputField, IconComponent, HelpGuidance, ButtonComponent],
  templateUrl: "./open-defects.html",
  styleUrl: "./open-defects.css",
})
export class OpenDefects implements OnInit, OnDestroy {
  private router = inject(Router);

  readonly helpHtml = HELP_HTML;

  activeTab = "defects";
  form!: FormGroup;
  popupForm!: FormGroup;

  private api = inject(OperationalMaintenanceApi);
  private fb = inject(FormBuilder);
  private toastr = inject(NotificationService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  defectsSearchText = "";
  dl3SearchText = "";
  showPopup = false;
  selectedDefect: DefectDetail | null = null;
  selectedDefects: OpenDefect[] = [];
  showFilters = false

  // Checkbox selection tracked independently of ag-grid's own reported selection, keyed by
  // DART id — a row that no longer matches the current search filter is removed from the
  // grid's row model entirely, so ag-grid can't keep reporting it as "selected" once it's
  // filtered out. Without this, selecting rows and then searching for something else drops
  // the earlier selection instead of accumulating it, so Raise RA / Create DLII only ever
  // acted on whatever the LAST search happened to show.
  private selectedIds = new Set<number>();
  private defectsGridApi?: GridApi;
  private restoringSelection = false;
  private readonly searchChanged = new Subject<void>();

  readonly isLoading = signal(false);
  openDefectsData = signal<OpenDefect[]>([]);
  dl3DefectsData = signal<OpenDefect[]>([]);
  maintenancePeriodOptions: DropdownOption[] = [];
  dartOccasionOptions: DropdownOption[] = [];
  subDepartmentOptions: DropdownOption[] = [];
  departmentOptions: DropdownOption[] = [];
  nomenclatureOptions: DropdownOption[] = [];
  sparesData: Spare[] = [];

  dateRangeOptions: DropdownOption[] = [
    { label: "All Data", value: "all" },
    { label: "Today", value: "today" },
    { label: "Yesterday", value: "yesterday" },
    { label: "Last 7 Days", value: "last_7_days" },
    { label: "Last 30 Days", value: "last_30_days" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
    { label: "Custom", value: "custom" },
  ];
  sparesColumnDefs = [
    {
      headerName: "Pattern",
      field: "pattern",
      flex: 1,
    },
    {
      headerName: "Description",
      field: "description",
      flex: 2,
    },
    {
      headerName: "Inventory Type",
      field: "inventory_type",
      flex: 1,
    },
    {
      headerName: "Quantity",
      field: "quantity",
      flex: 1,
    },
  ];

  ngOnInit(): void {
    this.form = this.fb.group({
      department: [""],
      subDepartment: [""],
      maintenancePeriod: [""],
      dartOccasion: [""],
      equipmentName: [""],
      nomenclature: [""],
      dateRange: ["all"],
      fromDate: [null],
      toDate: [null],
    });
    this.popupForm = this.fb.group({
      // Basic Details
      dart_number: [""],
      dart_date: [""],
      occasion: [""],
      maintenance_period: [""],

      // Equipment Details
      nomenclature: [""],
      equipment_code: [""],
      sub_dept: [""],
      department: [""],
      serial_no: [""],
      location: [""],
      previous_dart_no: [""],
      rha_defect: [""],
      created_date: [""],

      // Defect Details
      rectification_date: [""],
      symptoms: [""],
      severity: [""],
      assistance: [""],
      defective_component: [""],
      resolved_by: [""],
      trial_required: [""],
      trial_agency: [""],
      description: [""],

      // Spares
      sapres_required: [""],
    });

    // Every filter change re-fetches from the backend — the backend does the
    // filtering (and returns narrowed dropdown option lists to match), the
    // frontend never filters the already-fetched rows itself. This is a
    // continuous stream (not a one-shot call), so it stays subscribe-based.
    this.form.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      )
      .subscribe(() => this.loadDashboard());

    // Free-text search is also sent to the backend — debounce so it doesn't fire a
    // request per keystroke.
    this.searchChanged.pipe(debounceTime(300)).subscribe(() => this.loadDashboard());

    this.loadDashboard();
  }

  private rawOpenDefects: OpenDefect[] = [];
  private rawDl3Defects: OpenDefect[] = [];

  async loadDashboard(): Promise<void> {
    const { department, subDepartment, maintenancePeriod, dartOccasion, nomenclature, dateRange, fromDate, toDate } =
      this.form.value;

    const params: Record<string, string> = {};
    if (department) params["department"] = department;
    if (subDepartment) params["sub_department"] = subDepartment;
    if (maintenancePeriod) params["maintenance_period"] = maintenancePeriod;
    if (dartOccasion) params["dart_occasion"] = dartOccasion;
    if (nomenclature) params["equipment_nomenclature"] = nomenclature;
    if (dateRange) params["date_range"] = dateRange;
    if (dateRange === "custom") {
      if (fromDate) params["defect_date_from"] = fromDate;
      if (toDate) params["defect_date_to"] = toDate;
    }
    const searchText = this.activeTab === "defects" ? this.defectsSearchText : this.dl3SearchText;
    if (searchText) params["search"] = searchText;

    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(this.api.getOpenDartsAndABER(params));
      this.rawOpenDefects = response.open_defects || [];
      this.rawDl3Defects = response.dl_3_defects || [];

      const filters = response.filter_options;

      const mapOptions = (items: FilterOption[] = []) =>
        items
          .filter((item) => (typeof item === "string" ? item !== "" : item.name !== ""))
          .map((item) =>
            typeof item === "string"
              ? { label: item, value: item }
              : { label: item.name, value: item.id },
          );

      this.departmentOptions = (response.all_departments || []).map((d) => ({
        label: d.name,
        value: d.id,
      }));
      this.subDepartmentOptions = mapOptions(filters?.sub_departments);
      this.maintenancePeriodOptions = mapOptions(filters?.maintenance_periods);
      this.dartOccasionOptions = mapOptions(filters?.dart_occasions);
      this.nomenclatureOptions = mapOptions(filters?.equipment_nomenclatures);

      if (!this.form.value.department && response.selected_dept_id != null) {
        this.form.patchValue(
          { department: response.selected_dept_id },
          { emitEvent: false },
        );
      }

      this.openDefectsData.set(this.rawOpenDefects);
      this.dl3DefectsData.set(this.rawDl3Defects);
      queueMicrotask(() => this.restoreSelection());
    } catch (err) {
      console.error(err);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectTab(id: string): void {
    this.activeTab = id;
    this.loadDashboard();
  }

  onSelectionChanged(rows: unknown[]): void {
    // Reconciling our own restoreSelection() calls back through here would just recompute
    // the same set from itself — skip while that's in flight.
    if (this.restoringSelection) return;

    const selectedNow = new Set((rows as OpenDefect[]).map((r) => r.id));
    // Only rows currently in the (possibly search-filtered) grid can have been ticked or
    // unticked by this event — leave the selection state of every other id untouched.
    for (const row of this.openDefectsData()) {
      if (selectedNow.has(row.id)) this.selectedIds.add(row.id);
      else this.selectedIds.delete(row.id);
    }

    this.selectedDefects = this.rawOpenDefects.filter((d) => this.selectedIds.has(d.id));
  }

  onDefectsGridReady(event: GridReadyEvent): void {
    this.defectsGridApi = event.api;
    this.restoreSelection();
  }

  /** Re-applies `selectedIds` onto whatever rows are currently in the grid — needed after
   * every `rowData` reassignment, since a row that comes back into view after being
   * filtered out gets a fresh row node with no memory of its previous selection state. */
  private restoreSelection(): void {
    if (!this.defectsGridApi || this.selectedIds.size === 0) return;

    this.restoringSelection = true;
    this.defectsGridApi.forEachNode((node) => {
      const id = (node.data as OpenDefect | undefined)?.id;
      if (id == null) return;
      node.setSelected(this.selectedIds.has(id));
    });
    this.restoringSelection = false;
  }

  /** Resets the tracked checkbox selection — called once a batch action (Raise RA / Create
   * DL-II) actually goes through, so the rows just acted on aren't still sitting selected
   * (and liable to be sent again) if the user ends up back on this page. */
  private clearSelection(): void {
    this.selectedIds.clear();
    this.selectedDefects = [];
    this.defectsGridApi?.deselectAll();
  }

  ngOnDestroy(): void {
    this.clearSelection();
  }

  // Lets ag-grid match row nodes by DART id across `loadDashboard()` reassigning
  // `openDefectsData` to a new array on every backend refetch — without it, every
  // search/filter change is a brand-new dataset as far as the grid is concerned, so
  // any checkbox selection (even on a row still present after refetching) gets
  // silently dropped.
  rowId = (data: RowData): string => String((data as unknown as OpenDefect).id);

  // No selection required — createdlfun/ drafts whatever's newly selected (if
  // anything) AND always returns the full existing DRAFT DL-II list, so the
  // next page shows every already-drafted row regardless of what, if
  // anything, was checked here.
  async goToCreateDLII(): Promise<void> {
    const defectIds = this.selectedDefects.map((d) => d.id);

    try {
      const res = await firstValueFrom(this.api.createDL(defectIds));
      this.router.navigateByUrl("/afterAuth/op-maintenance/create-dlii", {
        state: {
          draftData: res.data?.draft_data ?? [],
          refitList: res.data?.refit_list ?? [],
          shipRemarksList: res.data?.ship_remarks_list ?? [],
        },
      });
      this.clearSelection();
    } catch (err) {
      const error = err as { error?: { message?: string } };
      console.error("Create DL-II failed", err);
      this.toastr.error(error?.error?.message ?? "Failed to initiate DL-II.");
    }
  }

  async goToCreateRA(): Promise<void> {
    const defectIds = this.selectedDefects.map((d) => d.id);
    if (!defectIds.length) {
      this.toastr.warning("Select at least one defect to raise an RA for.");
      return;
    }

    try {
      await firstValueFrom(this.api.createRA(defectIds));
      this.router.navigateByUrl("/afterAuth/op-maintenance/create-ra", {
        state: { selectedDefects: this.selectedDefects },
      });
      this.clearSelection();
    } catch (err) {
      const error = err as { error?: { message?: string } };
      console.error("Create RA failed", err);
      this.toastr.error(error?.error?.message ?? "Failed to initiate RA.");
    }
  }

  defectColumnDefs = [
    { headerName: "DART No.", field: "dart_number" },
    { headerName: "Defect Date", field: "dart_date" },
    { headerName: "Equipment Nomenclature", field: "nomenclature" },
    { headerName: "Defect Description", field: "defective_discriptions" },
    { headerName: "OPRA No.", field: "opra_no" },
    { headerName: "DL No.", field: "dl_no" },
    { headerName: "Status", field: "status" },
    { headerName: "Closing Date", field: "rectification_date" },
    { headerName: "Remarks", field: "remarks" },
    { headerName: "CMMS Sync Status", field: "cmms_sync_status" },
    {
      headerName: "Actions",
      field: "actions",
      // Without this, clicking an action icon still leaves ag-grid's default cell-focus
      // rectangle drawn around the whole cell — reads like an input box got selected.
      suppressCellFocus: true,
      cellRenderer: ActionRenderer,
      cellRendererParams: {
        onView: (data: OpenDefect) => this.openDefectPopup(data),
      },
      pinned: "right",
      width: 100,
    },
  ];

  dl3ColumnDefs = [
    { headerName: "DART No.", field: "dart_number" },
    { headerName: "Defect Date", field: "dart_date" },
    { headerName: "Closing Date", field: "rectification_date" },
    { headerName: "Status", field: "status" },
    { headerName: "OPRA No.", field: "opra_no" },
    { headerName: "DL No.", field: "dl_no" },
    { headerName: "CMMS Sync Status", field: "cmms_sync_status" },
    { headerName: "Equipment Nomenclature", field: "nomenclature" },
    { headerName: "Defect Description", field: "defective_discriptions" },
    { headerName: "Remarks", field: "remarks" },
    { headerName: "Action", field: "Action" },
  ];

  readonly syncingCmms = signal(false);

  /**
   * Pulls the latest open defects from CMMS, then pushes every SWMM-raised DART still
   * pending — ship-wide. Deliberately ignores the grid's current selection/department
   * filter: those used to be the only way to scope the push, which meant a filtered grid
   * silently limited what actually reached CMMS.
   */
  async syncWithCMMS(): Promise<void> {
    if (this.syncingCmms()) return;

    this.syncingCmms.set(true);
    try {
      const res = await firstValueFrom(this.api.syncAllDartsWithCmms());

      if (res.failed) {
        // Say *why* it failed. The count alone left an operator with nothing to act on
        // (and nothing to report), while the reason CMMS gave was already in the
        // response — a rejected column name, a missing ship, and so on.
        const reason = res.errors?.[0]?.error;
        this.toastr.warning(
          `Pushed ${res.pushed} of ${res.pushed + res.failed} DARTs. ${res.failed} failed.` +
            (reason ? ` ${reason}` : ""),
        );
      } else {
        // Always say what the push did, including when it did nothing. With this
        // commented out, a sync that pulled fine and pushed 0 DARTs looked identical
        // to one that pushed nothing because it was broken — the grid refreshed with
        // CMMS's rows and the push left no trace either way, which is exactly how
        // "only the pull is working" looks from the outside. The backend already
        // distinguishes the two cases in `message` ("Pushed N DART(s)" vs "Nothing to
        // push — every DART is already synced").
        this.toastr.success(res.message || `Pushed ${res.pushed} DART(s) to CMMS.`);
      }

      // Refresh so the pushed rows come back with cmms_sync_status set.
      await this.loadDashboard();
    } catch (err) {
      const error = err as { error?: { message?: string } };
      console.error("CMMS Sync Failed", err);
      this.toastr.error(error?.error?.message ?? "CMMS sync failed.");
    } finally {
      this.syncingCmms.set(false);
    }
  }

  fetchingCmms = signal(false);

  async fetchAndSaveCmmsDefects(): Promise<void> {
    this.fetchingCmms.set(true);

    try {
      await firstValueFrom(this.api.postCmmsDart(this.openDefectsData()));
      this.fetchingCmms.set(false);
      this.toastr.success('CMMS defects fetched and saved.');
    } catch (err) {
      console.error("Fetch & Save CMMS Defects Failed", err);
      this.fetchingCmms.set(false);
      this.toastr.error('Failed to fetch defects from CMMS server.');
    }
  }
  exportPendingDefects(format: 'xlsx' | 'accdb'): void {
    window.open(new URL(`api/v1/dart/export/${format}/`, this.api.baseUrl).toString(), '_blank');
  }

  print(): void {
    window.print();
  }

  clearFilters(): void {
    if (this.activeTab === "defects") {
      this.defectsSearchText = "";
    } else {
      this.dl3SearchText = "";
    }

    this.form.reset({
      department: "",
      subDepartment: "",
      maintenancePeriod: "",
      dartOccasion: "",
      nomenclature: "",
      dateRange: "all",
      fromDate: null,
      toDate: null,
    });
    this.loadDashboard();
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();

    if (this.activeTab === "defects") {
      this.defectsSearchText = value;
    } else {
      this.dl3SearchText = value;
    }

    this.searchChanged.next();
  }

  async openDefectPopup(rowData: OpenDefect): Promise<void> {
    const dartId = rowData.id;

    try {
      const response = await firstValueFrom(this.api.getDartDetails(dartId));
      const data = (response as DartDetailsApiResponse).data;

      this.selectedDefect = data;

      this.popupForm.patchValue({
        // Basic Details
        dart_number: data.dart_number,
        dart_date: data.dart_date,
        occasion: data.occasion,
        maintenance_period: data.maintenance_period,

        // Equipment Details
        nomenclature: data.nomenclature,
        equipment_code: data.equipment_code,
        sub_dept: data.sub_dept,
        department: data.department,
        serial_no: data.serial_no,
        location: data.location,
        previous_dart_no: data.previous_dart_no,
        rha_defect: data.rha_defect,
        created_date: data.created_date,

        // Defect Details
        rectification_date: data.rectification_date,
        symptoms: data.symptoms,
        severity: data.severity,
        assistance: data.assistance,
        defective_component: data.defective_component,
        resolved_by: data.resolved_by,
        trial_required: data.trial_required,
        trial_agency: data.trial_agency,
        description: data.description,

        // Spares
        sapres_required: data.sapres_required,
      });
      this.sparesData = data.spares || [];
      this.showPopup = true;

      // The eye button lives inside an ag-grid cellRenderer, whose click can land outside
      // Angular's zone depending on how ag-grid dispatched it — `zone.run` guarantees the
      // rest of this callback (including the `await` above) is treated as an Angular task,
      // and `detectChanges` forces the popup to paint on THIS click instead of waiting for
      // some unrelated later event to happen to trigger a render (which looked like the
      // popup needing a second click to appear, even though the fetch above already ran).
      this.zone.run(() => this.cdr.detectChanges());
    } catch (error) {
      console.error("Error fetching DART details:", error);
    }
  }
  closePopup(): void {
    this.showPopup = false;
  }

  goToCreateDefect(): void {
    this.router.navigateByUrl('/afterAuth/op-maintenance/defect/defect');
  }
}
