import { ButtonComponent } from '../../../../../../shared/components/button/button.component';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';

import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule
} from '@angular/forms';
import { OperationalMaintenanceApi } from '../../../../services/operational-maintenance-api';
import { NotificationService } from '../../../../../../Core/services/notification/notification.service';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MaintenanceRow } from '../../maintenance-period.model';

@Component({
  selector: 'app-amend-nomenclature-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  , ButtonComponent],
  templateUrl: './amend-nomenclature-modal.component.html',
  styleUrl: './amend-nomenclature-modal.component.scss'
})
export class AmendNomenclatureModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private call = inject(OperationalMaintenanceApi);
  private toastr = inject(NotificationService);


  @Input() row: MaintenanceRow | null = null;

  @Output() modalClosed = new EventEmitter<void>();

  @Output() save = new EventEmitter<MaintenanceRow>();

  form!: FormGroup;

  ngOnInit(): void {
    this.form = this.fb.group({
      name: [this.row?.name || this.row?.nomenclatureName || ''],
      plannedStartDate: [this.row?.actualStartDate || this.row?.plannedStartDate || ''],
      plannedEndDate: [this.row?.actualEndDate || this.row?.plannedEndDate || '']
    });
  }

  closeAmendModal(): void {
    this.modalClosed.emit();
  }
  async saveChanges(): Promise<void> {
    if (!this.row) {
      return;
    }

    const payload = {
      period_id: this.row.id as number,
      start_date: this.form.value.plannedStartDate,
      completion_date: this.form.value.plannedEndDate,
    };

    try {
      await firstValueFrom(this.call.editRefitOccasionDates(payload));
      this.toastr.success(
        'Nomenclature updated successfully',
        'Success'
      );
      this.save.emit({
        ...this.row,
        ...this.form.value
      });

      this.modalClosed.emit();
    } catch (err) {
      const error = err as HttpErrorResponse;
      const message =
        error?.error?.message ||
        error?.error?.detail ||
        error?.error?.error ||
        error?.message ||
        'Failed to update nomenclature';

      this.toastr.error(message, 'Error');
    }
  }
}
