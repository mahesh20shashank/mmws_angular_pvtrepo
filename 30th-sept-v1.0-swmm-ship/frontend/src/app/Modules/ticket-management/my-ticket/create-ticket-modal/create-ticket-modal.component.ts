import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, EventEmitter, Input, Output, inject, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import {NgClass } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function noWhitespaceValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = control.value;
    if (val === null || val === undefined) {
      return { required: true };
    }
    const isWhitespace = val.toString().trim().length === 0;
    return isWhitespace ? { required: true } : null;
  };
}

export function mobileNoValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = (control.value || '').toString().trim();
    if (!val) {
      return null;
    }
    const isValid = /^[6-9]\d{9}$/.test(val);
    return isValid ? null : { invalidMobile: true };
  };
}

export function ncnEmailValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = (control.value || '').toString().trim();
    if (!val) {
      return null;
    }
    const isValid = /^[^\s@]+@[^\s@]+$/.test(val);
    return isValid ? null : { invalidEmail: true };
  };
}

export interface CreateTicketPayload {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  mobile_no: string;
  ncn_no: string;
  ncn_email_id: string;
  opening_remark: string;
  file: File | null;
}

import { ModalComponent } from '../../../../shared/components/modal/modal.component';

@Component({
  selector: 'app-create-ticket-modal',
  standalone: true,
  imports: [NgClass, ReactiveFormsModule, ButtonComponent, ModalComponent],
  templateUrl: './create-ticket-modal.component.html',
  styleUrls: ['./create-ticket-modal.component.css']
})
export class CreateTicketModalComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);

  @Input() isOpen = false;
  @Input() shipName = '';
  @Input() department = '';

  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<CreateTicketPayload>();

  ticketForm!: FormGroup;
  selectedFile: File | null = null;
  selectedFileName = '';
  fileError: string | null = null;
  isSubmitted = false;

  ngOnInit(): void {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && changes['isOpen'].currentValue === true) {
      this.resetForm();
    }
  }

  private initForm(): void {
    this.ticketForm = this.fb.group({
      title: ['', [noWhitespaceValidator()]],
      description: ['', [noWhitespaceValidator()]],
      priority: ['medium'],
      mobileNo: ['', [mobileNoValidator()]],
      ncnNo: [''],
      ncnEmailId: ['', [ncnEmailValidator()]],
      openingRemark: ['']
    });
  }

  onMobileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitized = input.value.replace(/\D/g, '').slice(0, 10);
    if (input.value !== sanitized) {
      input.value = sanitized;
      this.ticketForm.get('mobileNo')?.setValue(sanitized);
    }
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const remarkControl = this.ticketForm.get('openingRemark');
    this.fileError = null;

    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf'];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (!allowedExtensions.includes(ext)) {
        this.fileError = `${file.name} is not a valid file type. Only JPG, PNG, and PDF are allowed.`;
        this.selectedFile = null;
        this.selectedFileName = '';
        input.value = '';
        remarkControl?.clearValidators();
        remarkControl?.updateValueAndValidity();
        return;
      }

      this.selectedFile = file;
      this.selectedFileName = file.name;
      
      remarkControl?.setValidators([noWhitespaceValidator()]);
    } else {
      this.selectedFile = null;
      this.selectedFileName = '';
      remarkControl?.clearValidators();
    }
    remarkControl?.updateValueAndValidity();
  }

  onClose(): void {
    this.resetForm();
    this.close.emit();
  }

  onSubmit(): void {
    this.isSubmitted = true;
    this.ticketForm.markAllAsTouched();

    if (this.ticketForm.invalid || this.fileError) {
      return;
    }

    const val = this.ticketForm.value;
    this.submit.emit({
      title: (val.title || '').trim(),
      description: (val.description || '').trim(),
      priority: val.priority || 'medium',
      mobile_no: (val.mobileNo || '').trim(),
      ncn_no: (val.ncnNo || '').trim(),
      ncn_email_id: (val.ncnEmailId || '').trim(),
      opening_remark: (val.openingRemark || '').trim(),
      file: this.selectedFile
    });

    this.resetForm();
  }

  resetForm(): void {
    this.isSubmitted = false;
    this.selectedFile = null;
    this.selectedFileName = '';
    this.fileError = null;
    if (this.ticketForm) {
      this.ticketForm.reset({
        title: '',
        description: '',
        priority: 'medium',
        mobileNo: '',
        ncnNo: '',
        ncnEmailId: '',
        openingRemark: ''
      });
      const remarkControl = this.ticketForm.get('openingRemark');
      remarkControl?.clearValidators();
      remarkControl?.updateValueAndValidity();
    }
  }

  isControlInvalid(controlName: string): boolean {
    const control = this.ticketForm.get(controlName);
    return !!(control && control.invalid && (control.touched || this.isSubmitted));
  }
}


