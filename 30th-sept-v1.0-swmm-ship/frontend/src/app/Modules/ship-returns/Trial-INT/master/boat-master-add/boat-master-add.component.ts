import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormCardDialogComponent } from '../../ui/form-card-dialog/form-card-dialog.component';
import { CommonModule } from '@angular/common';
import { InputComponent } from '../../ui/input.component';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../api.service';
import { Apiendpoints } from '../../ApiEndPoints';
import { MasterService } from '../../services/master.service';
import { SelectComponent as NewSelectComponent } from '../../ui/select.component';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';

const monthsObj = [
  { label: 'January', value: 1 }, { label: 'February', value: 2 }, { label: 'March', value: 3 },
  { label: 'April', value: 4 }, { label: 'May', value: 5 }, { label: 'June', value: 6 },
  { label: 'July', value: 7 }, { label: 'August', value: 8 }, { label: 'September', value: 9 },
  { label: 'October', value: 10 }, { label: 'November', value: 11 }, { label: 'December', value: 12 }
];

function yearValidator() {
  return (control: any) => {
    const value = control.value;
    if (!value) return null;
    const year = Number(value);
    return year >= 1900 && year <= new Date().getFullYear() + 5 ? null : { invalidYear: true };
  };
}

@Component({
  selector: 'app-boat-master-add',
  standalone: true,
  imports: [
    CommonModule,
    FormCardDialogComponent,
    InputComponent,
    ReactiveFormsModule,
    NewSelectComponent,
  ],
  templateUrl: './boat-master-add.component.html',
})
export class BoatMasterAddComponent implements OnInit {
  form!: FormGroup;
  loading = false;
  rowId!: string | null;
  monthsOptions = monthsObj;
  shipOptions: any[] = [];
  unitOptions: any[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() addNewRequest = new EventEmitter<boolean>();
  @Input() editMode = false;
  @Input() viewMode = false;
  @Input() unitData: any | null = null;
  formSubmitted = false;
  currentYear = new Date().getFullYear();

  closeDialog() {
    this.close.emit();
  }

  get title(): string {
    return this.editMode
      ? 'Edit details'
      : this.viewMode
        ? 'View details'
        : 'Add new boat master';
  }

  get subtitle(): string {
    return this.editMode
      ? 'Edit selected boat details'
      : this.viewMode
        ? 'View selected boat master details'
        : 'Add details (* fields are mandatory)';
  }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private masterService: MasterService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    if (this.editMode && this.unitData) {
      this.rowId = this.unitData.id;
    }
    this.form = this.fb.group({
      ship: ['', Validators.required],
      boat_oem: ['', Validators.required],
      registration_no: ['', Validators.required],
      type_of_boat: ['', Validators.required],
      boat_builder: [''],
      built_year: ['', [Validators.required, yearValidator()]],
      date_of_supply: [''],
      unit: [''],
      date_of_reappropriation: [''],
      engine_serial_p: [''],
      engine_serial_s: [''],
      engine_serial_c: [''],
      remarks: [''],
      active: [false],
    });

    this.loadShips();
    this.loadUnits();

    if (this.viewMode) {
      this.form.disable();
    }

    if (this.editMode || (this.viewMode && this.unitData)) {
      this.form.patchValue(this.unitData);
    }
  }

  get yearCtrl() {
    return this.form.get('year');
  }

  loadShips() {
    this.masterService.getVessels().subscribe((res: any) => {
      this.shipOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
      this.cdr.detectChanges();
    });
  }

  loadUnits() {
    this.masterService.getUnits().subscribe((res: any) => {
      this.unitOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
      this.cdr.detectChanges();
    });
  }

  validateForm(): boolean {
    this.formSubmitted = true;

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
    const payload = {
      ...this.form.value,
      active: this.form.value.active ? 1 : 2,
    };

    if (this.editMode && this.rowId) {
      payload.id = this.rowId;
    }

    this.apiService
      .post(Apiendpoints.BOAT_MASTER, payload)
      .subscribe({
        next: (res: any) => {
          this.notificationService.success(
            res?.message || 'Boat master details saved successfully',
          );
          this.addNewRequest.emit(true);
          setTimeout(() => {
            this.closeDialog();
          }, 500);
        },
        error: (err: any) => {
          this.notificationService.error(
            'Failed to save new boat master details',
          );
        },
        complete: () => {
          this.loading = false;
        },
      });
  }
}
