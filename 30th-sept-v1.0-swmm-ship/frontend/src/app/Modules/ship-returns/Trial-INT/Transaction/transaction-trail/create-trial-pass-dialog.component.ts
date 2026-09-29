import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { ApiService } from '../../api.service';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { environment } from '../../../../../../environments/environment';
import { TransactionOptionMap } from './initiate-trials-dialog.types';

/** Modal shell for the CREATE TRIAL PASS flow (`app-add-form`). */
@Component({
  selector: 'app-create-trial-pass-dialog',
  standalone: true,
  imports: [CommonModule, AddFormComponent],
  templateUrl: './create-trial-pass-dialog.component.html',
})
export class CreateTrialPassDialogComponent implements OnInit {
  @Input() readOnly = false;
  @Input() title = 'CREATE TRIAL PASS';
  /** Ship / equipment options from parent (forkJoin dropdowns). */
  @Input({ required: true }) optionMap!: TransactionOptionMap;

  @Input() open = false;
  @Output() openChange = new EventEmitter<boolean>();

  formConfigForInitiateTrialPass: any[] = [];
  editFormData: Record<string, unknown> = {};

  private trialId: unknown = null;
  processOptions: { label: string; value: unknown }[] = [];
  toolOptions: { label: string; value: unknown }[] = [];
  private fullEquipmentList: any[] = [];

  private readonly apiService = inject(ApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.loadProcessOptions();
    this.loadToolOptions();
    this.loadFullEquipmentList();
  }

  /**
   * Opens the dialog for a given trial record. Call from parent after setting context (e.g. table row).
   */
  openDialog(trialId: unknown, initialFormData: Record<string, unknown> = {}): void {
    this.trialId = trialId;
    this.editFormData = { ...initialFormData };
    this.rebuildFormConfig();
    this.openChange.emit(true);
    this.cdr.markForCheck();
  }

  onShellOpenChange(next: boolean): void {
    this.openChange.emit(next);
  }

  private loadProcessOptions(): void {
    this.apiService.get(environment.API_URL + 'api/access/processes/').subscribe({
      next: (res: any) => {
        this.processOptions = (res || []).map((item: any) => ({
          label: item.name,
          value: item.id,
        }));
        if (this.open) {
          this.rebuildFormConfig();
        }
        this.cdr.detectChanges();
      },
    });
  }

  private loadToolOptions(): void {
    this.apiService.get(environment.API_URL + 'master/tools/').subscribe({
      next: (res: any) => {
        const data = res?.data ?? res ?? [];
        this.toolOptions = data.map((item: any) => ({
          label: item.name,
          value: item.id,
        }));
        if (this.open) {
          this.rebuildFormConfig();
        }
        this.cdr.detectChanges();
      },
    });
  }

  private loadFullEquipmentList(): void {
    this.apiService.get<any>(environment.API_URL + 'master/equipments/').subscribe({
      next: (res: any) => {
        this.fullEquipmentList = res?.data ?? res ?? [];
      },
    });
  }

  private rebuildFormConfig(): void {
    this.formConfigForInitiateTrialPass = [
      {
        label: 'Trial Date',
        key: 'trialDate',
        type: 'date',
        required: true,
        placeholder: 'Select Trial Date',
        colSpan: 1,
      },
      {
        label: 'Trial Time',
        key: 'trialTime',
        type: 'time',
        required: true,
        placeholder: 'Select Trial Time',
        colSpan: 1,
      },
      {
        label: 'ship',
        key: 'ship',
        type: 'select',
        required: true,
        options: this.optionMap.ship,
        placeholder: 'Select Ship',
        colSpan: 1,
      },
      {
        label: 'Select occassion',
        key: 'occassion',
        type: 'select',
        required: true,
        options: this.processOptions,
        placeholder: 'Select Occassion',
        colSpan: 1,
      },
      {
        label: ' Equipment',
        key: 'equipment',
        type: 'select',
        required: true,
        options: this.optionMap.equipment,
        colSpan: 1,
        placeholder: 'Select Equipment',
      },
      {
        label: 'Equipment Nomenclature',
        key: 'equipment_nomenclature',
        type: 'text',
        required: true,
        colSpan: 1,
        value: this.editFormData['equipment_nomenclature'] ?? '',
      },
      {
        label: 'Trial Inspector',
        key: 'trial_inspector',
        type: 'select-multiple',
        required: true,
        placeholder: 'Select Trial Inspector',
        options: this.processOptions,
        colSpan: 1.5,
      },
      {
        label: 'Test Equipment',
        key: 'testEquipment',
        type: 'select-multiple',
        required: true,
        placeholder: 'Select Test Equipment',
        options: this.toolOptions,
        colSpan: 1.5,
      },
      {
        label: 'Comment',
        key: 'comments',
        type: 'textarea',
        required: false,
        placeholder: 'Enter comment',
        colSpan: 3,
      },
      {
        label: 'Holiday',
        key: 'holiday',
        type: 'checkbox',
        colSpan: 1.5,
      },
      {
        label: 'Type',
        key: 'trial_pass_type',
        type: 'radio',
        required: true,
        placeholder: 'Select Trial Time',
        colSpan: 1.5,
        options: [
          { label: 'Sea Trial', value: 1 },
          { label: 'Harbour Trial', value: 2 },
        ],
      },
    ];
  }

  onEquipmentFieldChange(event: { key: string; value: any }): void {
    if (event.key !== 'equipment') {
      return;
    }
    const selectedId =
      typeof event.value === 'object'
        ? event.value?.value
        : Number(event.value);

    const selected = this.fullEquipmentList.find((e: any) => e.id == selectedId);

    if (selected) {
      this.editFormData = {
        ...this.editFormData,
        equipment: selected.id,
        equipment_nomenclature: selected.nomenclature,
      };
      this.cdr.detectChanges();
    }
  }

  handleTrialPassSubmit(formValue: Record<string, unknown>): void {
    const payload = {
      trial_id: this.trialId,
      ...formValue,
    };
    this.apiService.post('api/data/trial-pass/', payload).subscribe({
      next: (response: any) => {
        if (response?.status === 200 || response?.success) {
          this.notificationService.success('Trial Pass created successfully');
          this.openChange.emit(false);
        } else {
          this.notificationService.error(response?.message || 'Failed to create trial pass');
        }
      },
      error: (err: Error) => {
        this.notificationService.error(err?.message || 'Failed to create trial pass');
      },
    });
  }
}
