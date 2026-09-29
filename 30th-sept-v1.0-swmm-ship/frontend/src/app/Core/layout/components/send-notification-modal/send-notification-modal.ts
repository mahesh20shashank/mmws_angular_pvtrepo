import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import {
  InputField,
  SelectInput,
  DropdownOption,
  TextareaInput,
} from "../../../../shared/components";

import { NotificationService } from '../../../services/notification/notification.service';
import { NotificationCategory } from '../../../services/notification/notification.model';
import { CommonApiService } from '../../../http/services/api.service';

const CATEGORY_OPTIONS: DropdownOption[] = [
  { label: 'Information', value: 'info' as NotificationCategory },
  { label: 'Approval Request', value: 'approval_request' as NotificationCategory },
  { label: 'Approval Granted', value: 'approval_granted' as NotificationCategory },
  { label: 'Approval Rejected', value: 'approval_rejected' as NotificationCategory },
  { label: 'Sync Status', value: 'sync_status' as NotificationCategory },
];

@Component({
  selector: 'app-send-notification-modal',
  standalone: true,
  imports: [ReactiveFormsModule, SelectInput, InputField, TextareaInput, ButtonComponent],
  templateUrl: './send-notification-modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './send-notification-modal.css',
})
export class SendNotificationModal implements OnInit {
  @Output() closed = new EventEmitter<void>();

  readonly fb = inject(FormBuilder);
  readonly commonApiService = inject(CommonApiService);
  readonly toast = inject(NotificationService);

  readonly recipientOptions = signal<DropdownOption[]>([]);
  readonly categoryOptions = CATEGORY_OPTIONS;
  readonly submitting = signal(false);

  form = this.fb.group({
    recipient: this.fb.control<number | null>(null, Validators.required),
    title: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(255),
    ]),
    body: this.fb.nonNullable.control(''),
    category: this.fb.nonNullable.control<NotificationCategory>(
      'info',
      Validators.required,
    ),
  });

  ngOnInit(): void {
    this.commonApiService.getUsers().subscribe({
      next: (users) =>
        this.recipientOptions.set(
          (users ?? []).map((u) => ({
            label: u.personnel_number
              ? `${u.full_name} (${u.personnel_number})`
              : u.full_name,
            value: u.id,
          })),
        ),
      error: () => this.recipientOptions.set([]),
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.submitting.set(true);
    try {
      await firstValueFrom(
        this.commonApiService.sendNotification({
          recipients: [v.recipient as number],
          title: v.title,
          body: v.body,
          category: v.category,
        }),
      );
      this.closed.emit();
    } catch {
      // error toast is raised automatically by the feedback interceptor
    } finally {
      this.submitting.set(false);
    }
  }

  cancel(): void {
    this.closed.emit();
  }
}
