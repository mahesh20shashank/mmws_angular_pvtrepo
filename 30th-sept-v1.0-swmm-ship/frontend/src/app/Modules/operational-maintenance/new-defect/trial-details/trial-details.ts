import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DropdownOption, SelectInput } from '../../../../shared/components/select-input/select-input';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputField } from '../../../../shared/components/input-field/input-field';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { NotificationService } from '../../../../Core/services/notification/notification.service';

interface SavedTrial {
  agency: string;
}

interface TrialAutoField {
  label: string;
  value: string;
  source: string;
}

/**
 * Digital Defect Book — Trial Details panel + "Add Trials" modal, shown when the
 * host form's "Trials Required" field is Yes. Self-contained: owns its own reactive
 * form and saved-trial state, so any reason form (As&As / ABER / Defect) can drop it
 * in with just `[show]`.
 */
@Component({
  selector: 'app-trial-details',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, ButtonComponent, IconComponent, SelectInput, InputField, ModalComponent],
  templateUrl: './trial-details.html',
  styleUrl: './trial-details.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialDetails {
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);

  /** Whether "Trials Required" is Yes on the host form — controls whether the panel renders. */
  readonly show = input(false);

  readonly trialAgencyOptions: DropdownOption[] = [
    { label: 'Fleet Maintenance Unit', value: 'Fleet Maintenance Unit' },
    { label: 'Naval Dockyard', value: 'Naval Dockyard' },
    { label: 'OEM Representative', value: 'OEM Representative' },
    { label: 'ITTTM Cell', value: 'ITTTM Cell' },
  ];

  readonly trialAutoFields: TrialAutoField[] = [
    { label: 'Equipment Name', value: 'LO Pump - ME No.1', source: 'SFD' },
    { label: 'Equipment Code', value: 'ME-LO-0142', source: 'SFD' },
    { label: 'Equipment Nomenclature', value: 'LO Circulating Pump', source: 'SFD' },
    { label: 'Equipment Serial Number', value: 'KSB-2291-A', source: 'SFD' },
    { label: 'Routine Name', value: 'Quarterly Trial — LO System', source: 'SFD / Routine Master' },
    { label: 'Routine Description', value: 'Post-repair performance & pressure trial', source: 'SFD / Routine Master' },
  ];

  readonly trialForm = this.fb.nonNullable.group({
    trialAgency: ['', Validators.required],
  });

  readonly isTrialModalOpen = signal(false);
  readonly savedTrial = signal<SavedTrial | null>(null);
  readonly trialSubmitAttempted = signal(false);

  openTrialModal(): void {
    this.trialSubmitAttempted.set(false);
    this.trialForm.setValue({ trialAgency: this.savedTrial()?.agency ?? '' });
    this.isTrialModalOpen.set(true);
  }

  closeTrialModal(): void {
    this.isTrialModalOpen.set(false);
  }

  submitTrial(): void {
    this.trialSubmitAttempted.set(true);
    if (this.trialForm.invalid) {
      this.trialForm.markAllAsTouched();
      this.notification.info('Select a Trial Agency before submitting');
      return;
    }

    this.savedTrial.set({ agency: this.trialForm.controls.trialAgency.value });
    this.isTrialModalOpen.set(false);
    this.notification.success('Request sent to the Trials Module inbox');
  }

  removeTrial(): void {
    this.savedTrial.set(null);
  }
}
