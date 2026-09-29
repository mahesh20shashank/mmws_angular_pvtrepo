import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DropdownOption } from '../../../../shared/components/select-input/select-input';
import { FileInput } from '../../../../shared/components/file-input/file-input';
import { InputField } from '../../../../shared/components/input-field/input-field';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { RichTextEditor } from '../../../../shared/components/rich-text-editor/rich-text-editor';
import { SelectInput } from '../../../../shared/components/select-input/select-input';

/** Digital Defect Book — Services reason. Explicit, named reactive form controls (not
 *  spec-driven) so every field's value/validity is directly addressable. No Trial /
 *  Spare Details for this reason. */
@Component({
  selector: 'app-services-form',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonComponent, SelectInput, InputField, RichTextEditor, FileInput],
  templateUrl: './services-form.html',
  styleUrl: './services-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesForm {
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);

  /** Emitted when the user clicks Cancel. */
  readonly back = output<void>();
  /** Emitted after a successful "Raise DART" submit — the session stays open (see
   *  `RecordedDefectsPanel`) instead of navigating away like Cancel does. */
  readonly raiseDart = output<void>();

  readonly submitAttempted = signal(false);

  readonly serviceOptions: DropdownOption[] = [
    { label: 'Overhaul', value: 'Overhaul' },
    { label: 'Calibration', value: 'Calibration' },
    { label: 'Inspection', value: 'Inspection' },
    { label: 'Repair', value: 'Repair' },
  ];

  readonly linkedEquipmentOptions: DropdownOption[] = [
    { label: 'LO Pump - ME No.1', value: 'LO Pump - ME No.1' },
    { label: 'Sea Viper Director', value: 'Sea Viper Director' },
    { label: '440V Switchboard', value: '440V Switchboard' },
  ];

  readonly form = this.fb.nonNullable.group({
    service: ['', Validators.required],
    linkedEquipment: [''],
    dateRequired: ['', Validators.required],
    serviceDescription: ['', Validators.required],
    placeOfShipAvailability: ['', Validators.required],
    attachment: this.fb.control<File | null>(null),
  });

  cancel(): void {
    this.back.emit();
  }

  saveDraft(): void {
    this.notification.info('Draft saved');
  }

  submit(): void {
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notification.error('Some mandatory fields are still required.');
      return;
    }

    this.notification.success('Digital Defect Book saved — hidden DART generated');
    this.raiseDart.emit();
  }
}
