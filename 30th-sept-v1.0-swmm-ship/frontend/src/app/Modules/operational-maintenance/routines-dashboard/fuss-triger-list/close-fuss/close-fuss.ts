import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, OnInit, inject } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { NotificationService } from '../../../../../Core/services/notification/notification.service';

import { MasterCard } from "../../../../refit-maintenance/master-card/master-card";

import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { InputField } from "../../../../../shared/components/input-field/input-field";

import { OperationalMaintenanceApi } from "../../../services/operational-maintenance-api";
import {
  CloseRaiseFussResponse,
  CompleteFussPayload,
} from "../fuss-trigger-list.model";
import { Router } from "@angular/router";

@Component({
  selector: "app-close-fuss",
  standalone: true,
  imports: [CommonModule, MasterCard, ReactiveFormsModule, SelectInput, InputField, ButtonComponent],
  templateUrl: "./close-fuss.html",
  styleUrl: "./close-fuss.css",
})
export class CloseFUSS implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(OperationalMaintenanceApi);
  private router = inject(Router);
  private toastr = inject(NotificationService);

  routineId!: number;

  closeRoutineFuss = this.fb.group({
    routineDartNo: [""],
    maintopRoutineNo: [""],
    routineDescription: [""],

    routineCompletionDate: [""],
    runningHours: [""],
    dueRunningHours: [""],
    timeConsumedHours: [""],
    timeConsumedMinutes: [""],
    completedByPno: [""],
    name: [""],
    rank: [""],
    totalManpower: [""],
    trialTeamNeeded: [false],
    recForDeletion: [false],
    notApplicable: [false],
    recDeletion: [false],
    remarks: [""],
  });

  hoursOptions: { label: string; value: number }[] = Array.from({ length: 24 }, (_, h) => ({
    label: h.toString(),
    value: h,
  }));

  minutesOptions: { label: string; value: number }[] = Array.from({ length: 6 }, (_, i) => ({
    label: (i * 10).toString(),
    value: i * 10,
  }));

  rankOptions: { label: string; value: number }[] = [];

  manpowerOptions = [
    { label: "1", value: 1 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4", value: 4 },
    { label: "5", value: 5 },
  ];

  ngOnInit(): void {
    this.routineId = history.state.routineId;

    if (this.routineId) {
      this.getCloseRoutineDetails();
    }
  }

  getCloseRoutineDetails(): void {
    this.api
      .getCloseRaiseFuss(this.routineId)
      .subscribe({
        next: (response: CloseRaiseFussResponse) => {
          this.rankOptions = response.rank_obj.map((rank) => ({
            label: rank.name,
            value: rank.id,
          }));

          this.closeRoutineFuss.patchValue({
            routineDartNo: response.planned_routine?.dart_number ?? "",
            maintopRoutineNo: response.planned_routine?.maintop_no ?? "",
            routineDescription: response.planned_routine?.routine_description ?? "",
            name: response.fullname,
            rank:
              response.rank_obj
                .find((r) => r.name === response.rankname)
                ?.id.toString() ?? null,
          });
        },
        error: (error) => {
          console.error(error);
          this.toastr.error("Failed to load routine details.");
        },
      });
  }

  backToList(): void {
    this.router.navigateByUrl(
      "/afterAuth/op-maintenance/routine/FUSS-triger-list",
    );
  }

  closeRoutine(): void {
    const form = this.closeRoutineFuss.getRawValue();

    const payload: CompleteFussPayload = {
      complete_date: form.routineCompletionDate ?? "",
      hours: form.timeConsumedHours ? Number(form.timeConsumedHours) : null,
      minutes: form.timeConsumedMinutes ? Number(form.timeConsumedMinutes) : null,
      carried_by: form.name ?? "",
      p_no: form.completedByPno ?? "",
      rank: form.rank ? Number(form.rank) : null,
      total_manpower: form.totalManpower ? Number(form.totalManpower) : null,
      running_hour: form.runningHours ? Number(form.runningHours) : null,
      due_running_hour: form.dueRunningHours ? Number(form.dueRunningHours) : null,
      completion_details: form.routineDescription ?? "",
      remarks: form.remarks ?? "",
      trial_team: !!form.trialTeamNeeded,
      rec_for_deletion: !!form.recForDeletion,
      old_dart_number: form.routineDartNo ?? "",
      not_applicable: !!form.notApplicable,
      rec_deletion: !!form.recDeletion,
      spares: [],
    };

    this.api
      .completeFuss(this.routineId, payload)
      .subscribe({
        next: () => {
          this.toastr.success("FUSS closed successfully.");
          this.router.navigateByUrl(
            "/afterAuth/op-maintenance/routine/FUSS-triger-list",
          );
        },
        error: (error: HttpErrorResponse) => {
          console.error(error);
          this.toastr.error("Failed to close FUSS.");
        },
      });
  }
}
