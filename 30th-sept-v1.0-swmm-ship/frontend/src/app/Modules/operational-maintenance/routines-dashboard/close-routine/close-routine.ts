import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MasterCard } from '../../../refit-maintenance/master-card/master-card';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { OperationalMaintenanceApi } from '../../services/operational-maintenance-api';
import { CloseRoutinePayload, CloseRoutineResponse } from '../fuss-triger-list/fuss-trigger-list.model';
import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';

const HELP_HTML = `
  <p class="mb-0">Closes a due routine. Fill in the completion date, running hours, manpower and remarks, then submit to close the routine's DART — a new DART opens automatically for the next cycle.</p>
`;

interface RoutineToClose {
  dart_no: string;
  equipment_class: string;
  equipment_serial_no: string;
  nomenclature: string;
  due_date: string;
  maintenance_remarks: string;
  location_on_board: string;
  maintop_no: string;
  routine_description: string;
}

const EMPTY_ROUTINE: RoutineToClose = {
  dart_no: '',
  equipment_class: '',
  equipment_serial_no: '',
  nomenclature: '',
  due_date: '',
  maintenance_remarks: '',
  location_on_board: '',
  maintop_no: '',
  routine_description: '',
};

// Manpower count is a generic small-number picker, not backend master data.
const MANPOWER_OPTIONS = ['Select', '1', '2', '3', '4', '5+'];

@Component({
  selector: 'app-close-routine',
  standalone: true,
  imports: [CommonModule, MasterCard, ReactiveFormsModule, HelpGuidance, ButtonComponent],
  templateUrl: './close-routine.html',
  styleUrl: './close-routine.css',
})
export class CloseRoutine implements OnInit {
  readonly helpHtml = HELP_HTML;

  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toastr = inject(NotificationService);
  private readonly call = inject(OperationalMaintenanceApi);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly routineId = (history.state?.routineId as number | undefined) ?? null;
  routine: RoutineToClose = EMPTY_ROUTINE;

  rankOptions: { label: string; value: number }[] = [];
  hoursOptions: { label: string; value: number }[] = [];
  minutesOptions: { label: string; value: number }[] = [];
  readonly manpowerOptions = MANPOWER_OPTIONS;

  readonly form: FormGroup = this.fb.group({
    completion_date: [''],
    running_hours: [''],
    hours_consumed: [''],
    minutes_consumed: [''],
    completed_by_pno: [''],
    completed_by_name: [''],
    rank: [null],
    manpower_used: [MANPOWER_OPTIONS[0]],
    trial_team_needed: ['No'],
    remarks: [''],
  });

  ngOnInit(): void {
    if (!this.routineId) {
      this.toastr.warning('No routine selected to close.');
      return;
    }

    this.call
      .getCloseRoutineById(this.routineId)
      .subscribe({
        next: (res: CloseRoutineResponse) => {
          this.routine = {
            dart_no: res.old_dart_number ?? '',
            equipment_class: res.equipment_class,
            equipment_serial_no: res.equipment_serial_no,
            nomenclature: res.nomenclature,
            due_date: res.due_date,
            maintenance_remarks: res.maintop_remarks,
            location_on_board: res.location_on_board,
            maintop_no: res.maintop_routine_number,
            routine_description: res.routine_description,
          };

          this.hoursOptions = res.hours_range.map((h) => ({ label: h.toString(), value: h }));
          this.minutesOptions = res.minutes_range.map((m) => ({ label: m.toString(), value: m }));
          this.rankOptions = res.rank_obj.map((r) => ({ label: r.rankdescription, value: r.rankid }));

          this.form.patchValue({
            completed_by_name: res.fullname,
            rank: res.rank_obj.find((r) => r.rankdescription === res.rankname)?.rankid ?? null,
          });
          this.cdr.detectChanges();
        },
        error: (err: unknown) => {
          console.error(err);
          this.toastr.error('Failed to load routine details.');
        },
      });
  }

  backToList(): void {
    this.router.navigate(['/afterAuth/op-maintenance/routine/dashboard/unique-maintop-routines']);
  }

  closeRoutine(): void {
    if (!this.routineId) return;

    const value = this.form.getRawValue();
    if (!value.completion_date || !value.completed_by_pno) {
      this.toastr.warning('Enter the Routine Completion Date and Completed By (PNo).');
      return;
    }

    const payload: CloseRoutinePayload = {
      date_of_completion: value.completion_date ?? '',
      running_hour: Number(value.running_hours ?? 0),
      rank_routine: Number(value.rank ?? 0),
      rank_other: '',
      hours: Number(value.hours_consumed ?? 0),
      minutes: Number(value.minutes_consumed ?? 0),
      carried_by: value.completed_by_name ?? '',
      p_no: value.completed_by_pno ?? '',
      total_manpower: Number(value.manpower_used) || 0,
      due_running_hour: 0,
      remarks: value.remarks ?? '',
      completion_details: '',
      trial_team: String(value.trial_team_needed ?? ''),
      rec_for_deletion: 'No',
      old_dart_number: this.routine.dart_no,
      spares: [],
    };

    this.call
      .updateCloseFUSSRoutine(this.routineId, payload)
      .subscribe({
        next: () => {
          this.toastr.success(`Routine ${this.routine.dart_no} closed successfully.`);
          this.backToList();
        },
        error: (err: HttpErrorResponse) => {
          console.error(err);
          this.toastr.error('Failed to close routine.');
        },
      });
  }
}
