import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Output, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';

import { BaseModalComponent } from '../../../shared/components/modal/base-modal.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { FormBuilder } from '@angular/forms';
import { AppService } from '../../../Core';

export interface HrcdfData {
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  rank?: string;
  unit?: string;
  nudMail?: string;
  nud_mail?: string;
  ncn_mail_id?: string;
  email?: string;
  role?: string;
  designation?: string;
  data?: HrcdfData;
  [key: string]: unknown;
}

@Component({
  selector: 'app-signup-modal',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './signup-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./signup-modal.component.scss']
})
export class SignupModalComponent extends BaseModalComponent {

  readonly fb = inject(FormBuilder);
  readonly appService = inject(AppService);
  readonly cdr = inject(ChangeDetectorRef);

  @Output() switchToLogin = new EventEmitter<void>();

  isFetched = false;
  isLoading = false;
  personalNumber = '';
  readonly userFields = [
    { label: 'First Name', control: 'firstName' },
    { label: 'Last Name', control: 'lastName' },
    { label: 'Rank', control: 'rank' },
    { label: 'Unit', control: 'unit' },
    { label: 'NCN Mail ID', control: 'nudMail' },
    { label: 'Designation', control: 'designation' },
  ];

  readonly roles = [
    'Commanding Officer (CO)',
    'Executive Officer (EXO)',
    'Head of Department (E)',
    'Head of Department (L)',
    'Head of Department (Log)',
    'Head of Department (Med)',
    'Engineering Officer',
    'Electrical Officer',
    'Logistics Officer',
    'Engineering Sailor',
    'Electrical Sailor',
    'Logistics Sailor',
    'Medical Sailor',
    'Storekeeper (E)',
    'Storekeeper (L)',
    'Storekeeper (Log)',
    'Storekeeper (Med)',
    'Maintainer (E)',
    'Maintainer (L)',
    'Maintainer (Log)',
    'Maintainer (Med)',
    'Writer (E)',
    'Writer (L)',
    'Writer (Log)',
    'Writer (Med)',
    'Writer (EXO)',
    'Ship Admin',
    'Miscellaneous'
  ];

  readonly signupForm = this.fb.nonNullable.group({
    firstName: [''],
    lastName: [''],
    rank: [''],
    unit: [''],
    nudMail: [''],
    designation: [''],
    role: [''],
    reason: [''],
  });

  get f() {
    return this.signupForm.controls;
  }

  onPersonalNumberChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.personalNumber = target.value;
  }

  errorMessage: string | null = null;

  get isPersonalNumberValid(): boolean {
    return /^\d{5,6}[a-zA-Z]$/.test(this.personalNumber);
  }

  onRequestCredentials(): void {
    this.errorMessage = null;

    if (!this.personalNumber || this.personalNumber.trim() === '') {
      this.errorMessage = 'Please enter your Personal Number first.';
      return;
    }

    if (!this.isPersonalNumberValid) {
      this.errorMessage = 'Personal Number must be 5 or 6 digits followed by a single letter (e.g. 12345A).';
      return;
    }

    this.isLoading = true;

    this.appService.post<HrcdfData>('api/v1/user/hrcdf-lookup/', { personnel_number: this.personalNumber }).subscribe({
      next: (response) => {
        this.isFetched = true;
        this.isLoading = false;

        const data = response.data || response;

        // Auto-populate data from response
        this.signupForm.patchValue({
          firstName: data.firstName || data.first_name || '',
          lastName: data.lastName || data.last_name || '',
          rank: data.rank || '',
          unit: data.unit || '',
          nudMail: data.nudMail || data.nud_mail || data.ncn_mail_id || data.email || '',
          designation: data.designation || '',
        });
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error fetching data from HRCDF', error);

        const errData = error?.error;
        if (errData && typeof errData === 'object') {
          if (errData.message) this.errorMessage = errData.message;
          else {
            const firstKey = Object.keys(errData)[0];
            const val = errData[firstKey];
            // remove nested ternary operator which is giving warning in sonar
            if (Array.isArray(val)) {
              this.errorMessage = val[0];
            } else if (typeof val === 'string') {
              this.errorMessage = val;
            } else {
              this.errorMessage = 'Failed to fetch data from HRCDF.';
            }
          }
        } else {
          this.errorMessage = 'Failed to fetch data from HRCDF.';
        }
        this.cdr.markForCheck();
      }
    });
  }

  isSignupSuccessful = false;

  isRoleDropdownOpen = false;
  roleSearchQuery = '';

  get filteredRoles(): string[] {
    if (!this.roleSearchQuery || this.roleSearchQuery === this.signupForm.get('role')?.value) {
      return this.roles;
    }
    const query = this.roleSearchQuery.toLowerCase();
    return this.roles.filter(r => r.toLowerCase().includes(query));
  }

  openRoleDropdown(): void {
    if (this.isFetched && !this.isRoleDropdownOpen) {
      this.isRoleDropdownOpen = true;
      this.roleSearchQuery = this.signupForm.get('role')?.value || '';
    }
  }

  toggleRoleDropdownIcon(event: Event): void {
    event.stopPropagation();
    if (!this.isFetched) return;

    if (this.isRoleDropdownOpen) {
      this.isRoleDropdownOpen = false;
    } else {
      this.isRoleDropdownOpen = true;
      this.roleSearchQuery = this.signupForm.get('role')?.value || '';
    }
  }

  onRoleBlur(): void {
    setTimeout(() => {
      this.isRoleDropdownOpen = false;
    }, 200);
  }

  selectRole(role: string, event: Event): void {
    event.stopPropagation();
    this.signupForm.patchValue({ role });
    this.isRoleDropdownOpen = false;
  }

  onRoleSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.roleSearchQuery = target.value;
  }

  onSignUp(event: Event): void {
    event.preventDefault();
    this.errorMessage = null;

    if (!this.isFetched) {
      this.errorMessage = 'Please request and fetch credentials first.';
      return;
    }

    const payload = {
      ...this.signupForm.getRawValue(),
      personnel_number: this.personalNumber
    };

    this.appService.post('api/v1/user/register/', payload).subscribe({
      next: () => {
        this.isSignupSuccessful = true;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error during sign up', error);

        const errData = error?.error;
        if (errData && typeof errData === 'object') {
          if (errData.message) this.errorMessage = errData.message;
          else {
            const firstKey = Object.keys(errData)[0];
            const val = errData[firstKey];
            // remove nested ternary operator which is giving warning in sonar
            if (Array.isArray(val)) {
              this.errorMessage = val[0];
            } else if (typeof val === 'string') {
              this.errorMessage = val;
            } else {
              this.errorMessage = 'Failed to register user.';
            }
          }
        } else {
          this.errorMessage = 'Failed to register user.';
        }
        this.cdr.markForCheck();
      }
    });
  }

  onSwitchToLoginClick(): void {
    this.switchToLogin.emit();
  }
}
