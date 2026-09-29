import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { CellCallbackParams, ColDef } from "ag-grid-community";
import { NotificationService } from '../../../../../Core/services/notification/notification.service';

import { MasterCard } from "../../../../refit-maintenance/master-card/master-card";
import { InputField } from "../../../../../shared/components/input-field/input-field";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";

import { OperationalMaintenanceApi } from "../../../services/operational-maintenance-api";

import {
  RaiseFussPayload,
  RaiseFussResponse,
  RaiseFussRoutine,
} from "../fuss-trigger-list.model";

export interface RaiseFussSaveResponse {
  message?: string;
}

@Component({
  selector: "app-fuss-triger-raise-fuss",
  standalone: true,
  imports: [CommonModule, MasterCard, ReactiveFormsModule, InputField, SelectInput, DataGrid, ButtonComponent],
  templateUrl: "./fuss-triger-raise-fuss.html",
  styleUrl: "./fuss-triger-raise-fuss.css",
})
export class FUSSTrigerRaiseFuss implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(OperationalMaintenanceApi);
  private toastr = inject(NotificationService);
  private router = inject(Router);

  selectedIds: number[] = [];

  routines = signal<RaiseFussRoutine[]>([])
  readonly isLoading = signal(false);

  columnDefs: ColDef[] = [
    {
      headerName: "Dart No.",
      field: "dart_no",
      flex: 1,
      valueGetter: (params: CellCallbackParams) =>
        (params.data as RaiseFussRoutine | undefined)?.dart_no || "NA",
    },
    {
      headerName: "Routine Details",
      field: "routine_description",
      flex: 4,
      wrapText: true,
      autoHeight: true,
    },
  ];

  raiseFussForm = this.fb.group({
    ship: [""],
    department: [""],
    serialNo: [""],
    locationOnBoard: [""],
    equipment: [""],
    locationCode: [""],
    equipmentSrNo: [""],

    maintenanceNo: [""],
    frequency: [""],

    amendmentNo: [""],
    fussDate: [""],
    lastUndertaken: [""],
    dueDate: [""],
    scheduleDate: [""],

    newEquipment: [false],

    option1: [""],
    option2: [""],
    option3: [""],

    remarks: [""],
  });

  option1: { label: string; value: string | number }[] = [
    {
      label: "Select Deferment",
      value: "",
    },
  ];

  option2: { label: string; value: string | number }[] = [
    {
      label: "Select Inability",
      value: "",
    },
  ];

  option3: { label: string; value: string | number }[] = [
    {
      label: "Select Reason",
      value: "",
    },
  ];

  ngOnInit(): void {
    this.selectedIds = history.state.selectedIds ?? [];

    if (!this.selectedIds.length) {
      this.toastr.warning("No routine selected.");
      this.router.navigate([
        "/afterAuth/op-maintenance/routine/FUSS-triger-list",
      ]);
      return;
    }

    this.getRaiseFussDetails();
  }

  getRaiseFussDetails(): void {
    this.isLoading.set(true);
    this.api
      .getRaiseFussDetails(this.selectedIds)
      .subscribe({
        next: (res: RaiseFussResponse) => {
          const row = res.routines ?? [];
          this.routines.set(row)

          const routine = row[0];

          if (!routine) {
            this.toastr.warning("No routine details found.");
            return;
          }

          this.raiseFussForm.patchValue({
            ship: routine.ship || "NA",
            department: routine.sub_department || "NA",
            serialNo: routine.serial_no || "NA",
            locationOnBoard: routine.location_on_board || "NA",
            equipment: routine.equipment_name || "NA",
            locationCode: routine.location_code || "NA",
            equipmentSrNo: routine.equipment_sr_no || "NA",

            maintenanceNo: routine.maintop_no || "NA",
            frequency: routine.frequency || "NA",
          });

          this.option1 = [
            {
              label: "Select Deferment",
              value: "",
            },
            ...res.deferments.map((x) => ({
              label: x.description,
              value: x.id,
            })),
          ];

          this.option2 = [
            {
              label: "Select Inability",
              value: "",
            },
            ...res.inabilities.map((x) => ({
              label: x.description,
              value: x.id,
            })),
          ];

          this.option3 = [
            {
              label: "Select Reason",
              value: "",
            },
            ...res.reasons.map((x) => ({
              label: x.description,
              value: x.id,
            })),
          ];
        },

        error: err => {
          console.error(err);

          this.toastr.error(
            err?.error?.message ??
              "Unable to fetch Raise FUSS details."
          );
          this.isLoading.set(false);
        },
        complete: () => {
          this.isLoading.set(false);
        },
      });
  }

  saveFUSS(): void {
    const form = this.raiseFussForm.getRawValue();

    const payload: RaiseFussPayload = {
      ship: form.ship || "NA",
      department: form.department || "NA",
      serial_no: form.serialNo || "NA",
      location_on_board: form.locationOnBoard || "NA",
      equipment: form.equipment || "NA",
      location_code: form.locationCode || "NA",
      equipment_sr_no: form.equipmentSrNo || "NA",
      maintop_no: form.maintenanceNo || "NA",
      frequency: form.frequency || "NA",

      selected_ids: this.selectedIds,

      amendment_no: form.amendmentNo || "",
      fuss_date: form.fussDate || "",
      last_undertaken: form.lastUndertaken || "",
      due_date: form.dueDate || "",
      schedule_date: form.scheduleDate || "",

      recomm_deferment: Number(form.option1),
      inability: Number(form.option2),
      reason: Number(form.option3),

      remarks: form.remarks || "",
    };

    this.api
      .raiseFuss(payload)
      .subscribe({
        next: (res: RaiseFussSaveResponse) => {
          this.toastr.success(
            res?.message ?? "FUSS raised successfully."
          );

          this.router.navigate([
            "/afterAuth/op-maintenance/routine/FUSS-triger-list",
          ]);
        },

        error: err => {
          console.error(err);

          this.toastr.error(
            err?.error?.message ?? "Failed to raise FUSS."
          );
        },
      });
  }
}
