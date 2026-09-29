import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ColDef, RowData } from "ag-grid-community";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { NotificationService } from '../../../../../Core/services/notification/notification.service';

import { MasterCard } from "../../../../refit-maintenance/master-card/master-card";
import { RadioInput } from "../../../../../shared/components/radio-input/radio-input";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { GridActionButton } from "../../../../../shared/components/data-grid/grid-action-button/grid-action-button";
import { InputField } from "../../../../../shared/components/input-field/input-field";
import { ModalComponent } from "../../../../../shared/components/modal/modal.component";

import { OperationalMaintenanceApi } from "../../../services/operational-maintenance-api";

import {
  RoutineLookup,
  RoutinePlanResponse,
  SelectedSpare,
  SpareLookupItem,
} from "../search-routines.model";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";

const HELP_HTML = `
  <p class="mb-0">Plans a due routine before it is undertaken — set a tentative commencement date and, if spares are needed, select them from OBS, MO Inventory or WED Inventory before saving to the Planned Routine list.</p>
`;

interface SpareLookupOption extends SpareLookupItem {
  inventoryType: "OBS" | "MO" | "WED";
}

@Component({
  selector: "app-r-d-plan-routine",
  standalone: true,
  imports: [
    CommonModule,
    MasterCard,
    ReactiveFormsModule,
    InputField,
    RadioInput,
    DataGrid,
    ModalComponent,
    HelpGuidance, ButtonComponent],
  templateUrl: "./r-d-plan-routine.html",
  styleUrl: "./r-d-plan-routine.css",
})
export class RDPlanRoutine implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(OperationalMaintenanceApi);
  private readonly toastr = inject(NotificationService);
  private readonly router = inject(Router);
  lookupData: RoutineLookup | null = null;
  sparesData: SelectedSpare[] = [];

  readonly showSpareModal = signal(false);
  readonly isLoading = signal(false);
  readonly spareOptions = signal<SpareLookupOption[]>([]);
  spareQtyByCode: Record<string, number> = {};
  private readonly selectedRoutine = (history.state?.routine || { id: history.state?.routineId }) as {
    id: number;
  };
  planRoutineForm: FormGroup = this.fb.group({
    subDept: [{ value: "", disabled: true }],
    equipment: [{ value: "", disabled: true }],
    rhsi: [{ value: "", disabled: true }],
    maintopNo: [{ value: "", disabled: true }],

    routineNo: [{ value: "", disabled: true }],
    dartNo: [{ value: "", disabled: true }],
    routineName: [{ value: "", disabled: true }],
    routineDueDate: [{ value: "", disabled: true }],

    routineDueRH: [{ value: "", disabled: true }],
    routineDescription: [{ value: "", disabled: true }],

    plannedCommencementDate: [""],
    sparesRequired: [false],
  });

  readonly columnDefs: ColDef[] = [
    {
      headerName: "Pattern Number / OEM Part Number",
      field: "pattern_number",
      flex: 2,
    },
    {
      headerName: "Spare Description",
      field: "spare_description",
      flex: 2,
    },
    {
      headerName: "Inventory Type",
      field: "inventory_type",
      flex: 1,
    },
    {
      headerName: "WED Inventory Type",
      field: "wed_inventory_type",
      flex: 1,
    },
    {
      headerName: "Qty Required",
      field: "quantity_required",
      flex: 1,
    },
    {
      headerName: "Actions",
      field: "action",
      flex: 1,
      sortable: false,
      pinned: "right",
      cellRenderer: GridActionButton,
      cellRendererParams: {
        label: "Remove",
        backgroundColor: "#B42318",
        onDelete: (row: RowData) => this.removeSpare(row as unknown as SelectedSpare),
      },
    },
  ];

  ngOnInit(): void {
    const routineId = this.selectedRoutine?.id || 1;
    this.getRoutinePlan(routineId);
  }

  getRoutinePlan(id: number): void {
    this.isLoading.set(true);
    this.api.getRoutinePlanById(id).subscribe({
      next: (response: RoutinePlanResponse) => {
        const routine = response.routine;

        this.planRoutineForm.patchValue({
          subDept: routine.sub_department,
          equipment: routine.equipment_nomenclature,
          rhsi: routine.rhsi,
          maintopNo: routine.maintop_no,

          routineNo: routine.routine_no,
          dartNo: routine.dart_no || "",
          routineName: routine.routine_name,
          routineDueDate: routine.due_date,

          routineDueRH: routine.routine_due_rh || "",
          routineDescription: routine.routine_description,

          plannedCommencementDate: routine.planned_commencement_date || "",

          sparesRequired: routine.spares_required === "YES",
        });

        this.lookupData = response.lookup;
        this.sparesData = response.spares ?? [];
        this.spareOptions.set(response.lookup ? this.toSpareOptions(response.lookup) : []);
        this.isLoading.set(false);
      },

      error: () => {
        this.toastr.error("Unable to load routine details.", "Error");
        this.isLoading.set(false);
      },
    });
  }

  private toSpareOptions(lookup: RoutineLookup | undefined): SpareLookupOption[] {
    if (!lookup) return [];
    const obs = [...(lookup.obs_pil_mapped ?? []), ...(lookup.obs_pil_unmapped ?? [])].map((item) => ({
      ...item,
      inventoryType: "OBS" as const,
    }));
    const mo = (lookup.mo_all ?? []).map((item) => ({ ...item, inventoryType: "MO" as const }));
    const wed = (lookup.wed_all ?? []).map((item) => ({ ...item, inventoryType: "WED" as const }));
    return [...obs, ...mo, ...wed];
  }

  openSpareModal(): void {
    this.spareQtyByCode = {};
    this.showSpareModal.set(true);
  }

  closeSpareModal(): void {
    this.showSpareModal.set(false);
  }

  addSpare(option: SpareLookupOption): void {
    const qty = this.spareQtyByCode[option.code] || 1;
    if (this.sparesData.some((spare) => spare.pattern_number === option.code)) {
      this.toastr.warning("This spare is already added.");
      return;
    }

    this.sparesData = [
      ...this.sparesData,
      {
        pattern_number: option.code,
        oem_part_number: option.code,
        spare_description: option.description || option.name,
        inventory_type: option.inventoryType,
        wed_inventory_type: option.inventoryType === "WED" ? option.inventoryType : "",
        quantity_required: qty,
        action: "",
      },
    ];
    this.toastr.success(`${option.name} added.`);
  }

  removeSpare(row: SelectedSpare): void {
    this.sparesData = this.sparesData.filter((spare) => spare.pattern_number !== row.pattern_number);
  }

  get isSparesRequired(): boolean {
    return this.planRoutineForm.get("sparesRequired")?.value ?? false;
  }

  async save(): Promise<void> {
    const routineId = this.selectedRoutine?.id;
    if (!routineId) {
      this.toastr.error("No routine selected.", "Error");
      return;
    }

    const { plannedCommencementDate, sparesRequired } = this.planRoutineForm.getRawValue();

    try {
      const res = await firstValueFrom(
        this.api.planRoutineSave(routineId, {
          planned_commencement_date: plannedCommencementDate || undefined,
          spares_required: sparesRequired ? "YES" : "NO",
          spares: sparesRequired
            ? this.sparesData.map((spare) => ({
                pattern: spare.pattern_number,
                qty: spare.quantity_required || 1,
                inventory_type: spare.inventory_type,
              }))
            : [],
        }),
      );
      this.toastr.success(res?.message ?? "Routine planned successfully.");
      this.goBack();
    } catch (error: unknown) {
      console.error("Unable to save planned routine.", error);
      this.toastr.error("Unable to save planned routine.", "Error");
    }
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/op-maintenance/routine/due-routines"], {
      state: { routine: this.selectedRoutine },
    });
  }
}
