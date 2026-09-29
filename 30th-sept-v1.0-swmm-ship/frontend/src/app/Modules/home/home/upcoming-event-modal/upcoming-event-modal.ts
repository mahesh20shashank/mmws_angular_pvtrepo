import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, EventEmitter, Output, signal, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { UpcomingEventUpdatePayload } from '../home.model';

@Component({
  selector: 'app-upcoming-event-modal',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent, ButtonComponent],
  templateUrl: './upcoming-event-modal.html',
  styleUrl: './upcoming-event-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpcomingEventModalComponent {
  private readonly formBuilder = inject(FormBuilder);

  readonly today = new Date().toLocaleDateString('en-CA');

  @Output() closeModal = new EventEmitter<void>();
  @Output() saveUpdate = new EventEmitter<UpcomingEventUpdatePayload>();

  readonly eventAttachmentFile = signal<File | null>(null);
  readonly eventAttachmentName = signal('No file chosen');

  readonly eventUpdateForm = this.formBuilder.group({
    eventType: this.formBuilder.nonNullable.control<'single' | 'multiple'>('single', Validators.required),
    start_date: this.formBuilder.nonNullable.control('', Validators.required),
    end_date: this.formBuilder.nonNullable.control(''),
    title: this.formBuilder.nonNullable.control('', Validators.required),
  });

  get isMultipleEventUpdate(): boolean {
    return this.eventUpdateForm.controls.eventType.value === 'multiple';
  }

  onEventTypeChange(): void {
    this.eventUpdateForm.patchValue({ start_date: '', end_date: '' });
    this.applyDateValidators();
  }

  onMultipleEventStartDateChange(): void {
    const start = this.eventUpdateForm.controls.start_date.value.trim();
    const end = this.eventUpdateForm.controls.end_date.value.trim();

    if (start && end && end < start) {
      this.eventUpdateForm.controls.end_date.setValue('');
      this.eventUpdateForm.controls.end_date.setErrors(null);
    }
  }

  openEventAttachmentPicker(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  onEventAttachmentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.eventAttachmentFile.set(file);
    this.eventAttachmentName.set(file ? file.name : 'No file chosen');
  }

  submit(): void {
    this.eventUpdateForm.markAllAsTouched();

    const rawTitle = this.eventUpdateForm.controls.title.value;
    const eventName = rawTitle.trim();
    if (!eventName) {
      this.eventUpdateForm.controls.title.setValue('');
      this.eventUpdateForm.controls.title.setErrors({ required: true });
    }

    this.applyDateValidators();

    const startDateVal = (this.eventUpdateForm.controls.start_date.value || '').trim();
    if (startDateVal && startDateVal < this.today) {
      this.eventUpdateForm.controls.start_date.setErrors({ pastDate: true });
    }

    if (this.isMultipleEventUpdate) {
      const start = (this.eventUpdateForm.controls.start_date.value || '').trim();
      const end = (this.eventUpdateForm.controls.end_date.value || '').trim();
      if (end && end < this.today) {
        this.eventUpdateForm.controls.end_date.setErrors({ pastDate: true });
        return;
      }
      if (end && start && end < start) {
        this.eventUpdateForm.controls.end_date.setErrors({ endBeforeStart: true });
        return;
      }
    }

    if (this.eventUpdateForm.invalid) {
      return;
    }

    const isMultiple = this.isMultipleEventUpdate;
    const singleDate = (this.eventUpdateForm.controls.start_date.value || '').trim();
    const startDate = (this.eventUpdateForm.controls.start_date.value || '').trim();
    const endDate = (this.eventUpdateForm.controls.end_date.value || '').trim();
    const finalStartDate = isMultiple ? startDate : singleDate;
    const finalEndDate = isMultiple ? endDate : null;

    this.saveUpdate.emit({
      title: eventName,
      start_date: finalStartDate,
      end_date: finalEndDate,
      start_time: '00:00:00.000Z',
      end_time: null,
      category: null,
      description: null,
      document: this.eventAttachmentFile(),
    });
  }

  private applyDateValidators(): void {
    const startDate = this.eventUpdateForm.controls.start_date;
    const endDate = this.eventUpdateForm.controls.end_date;

    if (this.isMultipleEventUpdate) {
      startDate.setValidators([Validators.required]);
      endDate.setValidators([Validators.required]);
    } else {
      startDate.setValidators([Validators.required]);
      endDate.clearValidators();
    }

    startDate.updateValueAndValidity({ emitEvent: false });
    endDate.updateValueAndValidity({ emitEvent: false });
  }
}
