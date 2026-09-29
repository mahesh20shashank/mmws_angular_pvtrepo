import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormCardDialogComponent } from '../../ui/form-card-dialog/form-card-dialog.component';
import { CommonModule } from '@angular/common';
import { InputComponent } from '../../ui/input.component';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ApiService } from '../../api.service';
import { Apiendpoints } from '../../ApiEndPoints';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';

@Component({
  selector: 'app-refit-add',
  imports: [
    CommonModule,
    FormCardDialogComponent,
    InputComponent,
    ReactiveFormsModule,
  ],
  standalone: true,
  templateUrl: './refit-add.component.html',
})
export class RefitAddComponent implements OnInit, OnChanges {
  form!: FormGroup;
  loading = false;
  rowId!: string | null;

  @Output() close = new EventEmitter<void>();
  @Input() editMode = false;
  @Input() viewMode = false;
  @Input() unitData: any | null = null;

  closeDialog() {
    this.close.emit();
  }

  get title(): string {
    return this.editMode
      ? 'Edit details'
      : this.viewMode
        ? 'View details'
        : 'Add new Refit';
  }

  get subtitle(): string {
    return this.editMode
      ? 'Edit selected refit details'
      : this.viewMode
        ? 'View selected refit details'
        : 'Add new Refit details';
  }

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.initForm();

    if (this.editMode && this.unitData) {
      this.rowId = this.unitData.id;
    }

    if (this.editMode || this.viewMode) {
      this.populateForm();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['unitData'] && this.form) {
      this.populateForm();
    }
  }

  initForm(): void {
    this.form = this.fb.group({
      name: ['', Validators.required],
      code: [''],
      active: [true],
    });

    if (this.viewMode) {
      this.form.disable();
    }
  }

  populateForm(): void {
    if (!this.unitData) return;

    this.form.patchValue({
      name: this.unitData?.name ?? '',
      code: this.unitData?.code ?? '',
      active: this.unitData?.active === 1 || this.unitData?.active === true,
    });

    if (this.viewMode) {
      this.form.disable();
    }

    this.cdr.detectChanges();
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notificationService.error('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  handleSave() {
    if (!this.validateForm()) {
      return;
    }
    this.loading = true;
    const payload: any = {
      ...this.form.value,
      active: this.form.value.active ? 1 : 2,
    };

    if (this.editMode && this.rowId) {
      payload.id = this.rowId;
    }

    this.apiService.post(Apiendpoints.MASTER_REFITS, payload).subscribe({
      next: (res: any) => {
        this.notificationService.success(
          res?.message || 'Refit saved successfully',
        );

        setTimeout(() => {
          this.closeDialog();
        }, 500);
      },
      error: () => {
        this.notificationService.error('Failed to save Refit data.');
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
