import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { HomeApi } from '../../services/home-api';
import {
  AnniversaryModalPayload,
  PersonnelOption,
  StoredUserData,
  UserByIdResponse,
} from '../home.model';

@Component({
  selector: 'app-anniversary-modal',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent, ButtonComponent],
  templateUrl: './anniversary-modal.html',
  styleUrl: './anniversary-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnniversaryModalComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly homeApi = inject(HomeApi);

  @Output() closeModal = new EventEmitter<void>();
  @Output() saveAnniversary = new EventEmitter<AnniversaryModalPayload>();

  readonly personnelOptions = signal<PersonnelOption[]>([]);
  readonly isLoadingPersonnel = signal(false);

  private readonly currentUserProfile = signal<{
    name: string;
    personalNo: string;
    date_of_marriage: string;
  } | null>(null);

  readonly isSaving = signal(false);
  readonly saveError = signal('');

  readonly anniversaryForm = this.formBuilder.nonNullable.group({
    selectType: this.formBuilder.nonNullable.control<'personal' | 'other'>('personal', Validators.required),
    personnelId: this.formBuilder.nonNullable.control(''),
    name: this.formBuilder.nonNullable.control(''),
    personalNo: this.formBuilder.nonNullable.control(''),
    dateOfMarriage: this.formBuilder.nonNullable.control('', Validators.required),
  });

  async ngOnInit(): Promise<void> {
    await this.loadCurrentUserProfile();
  }

  get isOtherType(): boolean {
    return this.anniversaryForm.controls.selectType.value === 'other';
  }

  onSelectTypeChange(): void {
    const personnelIdControl = this.anniversaryForm.controls.personnelId;

    this.anniversaryForm.patchValue({ personnelId: '', name: '', personalNo: '', dateOfMarriage: '' });
    this.anniversaryForm.controls.dateOfMarriage.markAsUntouched();

    if (this.isOtherType) {
      personnelIdControl.setValidators([Validators.required]);
      void this.loadPersonnelOptions();
    } else {
      personnelIdControl.clearValidators();
      this.applyCurrentUserProfile();
    }

    personnelIdControl.updateValueAndValidity({ emitEvent: false });
  }

  async onPersonnelChange(): Promise<void> {
    const selectedId = this.anniversaryForm.controls.personnelId.value;

    if (!selectedId) {
      this.anniversaryForm.patchValue({
        name: '',
        personalNo: '',
        dateOfMarriage: '',
      });
      return;
    }

    const parsedId = Number(selectedId);

    if (!Number.isFinite(parsedId)) {
      return;
    }

    try {
      const response = await firstValueFrom(this.homeApi.getUserById(parsedId));
      this.applyProfileToForm(response);
      return;
    } catch {
    }

    const selected = this.personnelOptions().find((option) => option.id === selectedId);

    this.anniversaryForm.patchValue({
      name: selected?.name ?? '',
      personalNo: selected?.personalNo ?? '',
      dateOfMarriage: '',
    });
  }

  private async loadPersonnelOptions(): Promise<void> {
    this.isLoadingPersonnel.set(true);

    try {
      const users = await firstValueFrom(this.homeApi.getAllUsers());

      const options = users.map((user) => {
        const firstname = user.profile?.firstname?.trim() ?? '';
        const lastname = user.profile?.lastname?.trim() ?? '';
        const fullName = [firstname, lastname].filter(Boolean).join(' ').trim();

        return {
          id: String(user.id),
          name: fullName || user.username,
          personalNo: user.profile?.personal_number?.trim() ?? '',
        };
      });

      this.personnelOptions.set(options);
    } catch {
      this.personnelOptions.set([]);
    } finally {
      this.isLoadingPersonnel.set(false);
    }
  }

  private async loadCurrentUserProfile(): Promise<void> {
    const userId = this.getStoredUserId();

    if (!userId) {
      return;
    }

    try {
      const response = await firstValueFrom(this.homeApi.getUserById(userId));
      const profile = this.toProfileState(response);
      this.currentUserProfile.set(profile);

      if (!this.isOtherType) {
        this.applyCurrentUserProfile();
      }
    } catch {
      this.currentUserProfile.set(null);
    }
  }

  private applyCurrentUserProfile(): void {
    const profile = this.currentUserProfile();

    if (!profile) {
      return;
    }

    this.anniversaryForm.patchValue({
      name: profile.name,
      personalNo: profile.personalNo,
      dateOfMarriage: profile.date_of_marriage,
    });
  }

  private applyProfileToForm(response: UserByIdResponse): void {
    const profile = this.toProfileState(response);

    this.anniversaryForm.patchValue({
      name: profile.name,
      personalNo: profile.personalNo,
      dateOfMarriage: profile.date_of_marriage,
    });
  }

  private toProfileState(response: UserByIdResponse): {
    name: string;
    personalNo: string;
    date_of_marriage: string;
  } {
    const profile = response.profile;
    const name = [profile?.firstname, profile?.lastname].filter(Boolean).join(' ').trim();
    const marriageDate =
      profile?.date_of_marrige?.trim() ?? profile?.marriage_date?.trim() ?? '';

    return {
      name,
      personalNo: profile?.personal_number?.trim() ?? '',
      date_of_marriage: marriageDate,
    };
  }

  private getStoredUserId(): number | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const storedUser = localStorage.getItem('user_data');

    if (!storedUser) {
      return null;
    }

    try {
      const parsed = JSON.parse(storedUser) as StoredUserData;
      return typeof parsed.id === 'number' ? parsed.id : null;
    } catch {
      return null;
    }
  }

  async submit(): Promise<void> {
    this.anniversaryForm.markAllAsTouched();
    this.saveError.set('');

    if (this.anniversaryForm.invalid) {
      return;
    }

    const value = this.anniversaryForm.getRawValue();
    const selectedPersonnelId = value.personnelId ? Number(value.personnelId) : Number.NaN;
    const targetUserId = this.isOtherType
      ? selectedPersonnelId
      : this.getStoredUserId();

    if (!targetUserId || Number.isNaN(targetUserId)) {
      this.saveError.set(
        this.isOtherType
          ? 'Please select a valid personnel.'
          : 'User id not found in local storage.',
      );
      return;
    }

    this.isSaving.set(true);

    try {
      await firstValueFrom(
        this.homeApi.updateMarriageDate(targetUserId, value.dateOfMarriage.trim()),
      );

      this.saveAnniversary.emit({
        selectType: value.selectType,
        personnelId: value.personnelId || null,
        name: value.name.trim(),
        personalNo: value.personalNo.trim(),
        dateOfMarriage: value.dateOfMarriage.trim(),
      });
    } catch {
      this.saveError.set('Failed to save marriage date. Please try again.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
