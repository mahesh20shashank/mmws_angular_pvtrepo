import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ApiService } from '../../api.service';
import { Apiendpoints } from '../../ApiEndPoints';
import { CommonModule } from '@angular/common';
import { FormCardDialogComponent } from '../../ui/form-card-dialog/form-card-dialog.component';
import { SelectComponent as NewSelectComponent } from '../../ui/select.component';
import { InputComponent } from '../../ui/input.component';
import { MasterService } from '../../services/master.service';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';

@Component({
  selector: 'app-strakes-master-add',
  templateUrl: './strakes-master-add.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardDialogComponent,
    NewSelectComponent,
    InputComponent,
  ],
})
export class StrakeDialogComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() addNewRequest = new EventEmitter<boolean>();
  @Input() editMode = false;
  @Input() viewMode = false;
  @Input() unitData: any | null = null;

  form!: FormGroup;
  shipOptions: any[] = [];
  strakeOptions: any[] = [];
  commandOptions: any[] = [];
  classOptions: any[] = [];

  checkingStrakes = false;
  hasExistingStrakes = false;

  loading = false;
  rowId: any;

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private notificationService: NotificationService,
    private masterService: MasterService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      command_id: ['', Validators.required],
      classofship_id: ['', Validators.required],
      strakeRows: this.fb.array([]),
    });
  }

  get title(): string {
    return this.editMode
      ? 'Edit details'
      : this.viewMode
        ? 'View details'
        : 'Add ship strakes';
  }

  get subtitle(): string {
    return this.editMode
      ? 'Edit selected strake details'
      : this.viewMode
        ? 'View selected strake details'
        : 'Add details (* fields are mandatory)';
  }

  ngOnInit(): void {
  if (this.editMode) {
    this.rowId = this.unitData?.id;
  }

  this.loadCommands();
  this.loadClasses();

  if (this.viewMode) {
    this.form.disable();
  }

  if (this.editMode || this.viewMode) {
  this.form.patchValue({
    command_id: this.unitData.command,
    classofship_id: this.unitData.classofship,
  });

  this.strakeRowsArray.clear();

  this.strakeRowsArray.push(
    this.createRow(
      this.unitData.strake_no,
      !!this.unitData.active
    )
  );
  }
  else {
    this.addStrake();
  }
}

  loadCommands() {
    this.masterService.getCommands().subscribe((res) => {
      this.commandOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));

      if ((this.editMode || this.viewMode) && this.unitData) {
        this.form.patchValue({
          command_id: this.unitData.command,
        });

        this.cdr.detectChanges();
      }
    });
  }

    loadClasses() {
    this.masterService.getClasses().subscribe((res) => {
      this.classOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));

      if ((this.editMode || this.viewMode) && this.unitData) {
        this.form.patchValue({
          classofship_id: this.unitData.classofship,
        });

        this.cdr.detectChanges();
      }
    });
  }

  get selectionCompleted(): boolean {
  return !!(
    this.form.get('command_id')?.value &&
    this.form.get('classofship_id')?.value
  );
}

  get strakeRowsArray(): FormArray {
    return this.form.get('strakeRows') as FormArray;
  }

  createRow(strakeName = '', active = true): FormGroup {
    return this.fb.group({
      strake_name: [strakeName, Validators.required],
      active: [active]
    });
  }

  addStrake(): void {
    this.strakeRowsArray.push(this.createRow());
  }

  removeStrake(index: number): void {
  this.strakeRowsArray.removeAt(index);
}


  loadShips(): void {
    this.masterService.getVessels().subscribe({
      next: (res: any) => {
        this.shipOptions = (res?.data || []).map((item: any) => ({
          label: item.name,
          value: item.id,
        }));
      },
      error: (err: any) => {
        console.error(err);
        this.notificationService.error('Failed to load ships.');
      },
    });
  }

  validateForm(): boolean {
    if (this.form.invalid || this.strakeRowsArray.length === 0) {
      this.form.markAllAsTouched();
      this.notificationService.error('Please fill all required fields and add at least one strake.');
      return false;
    }
    return true;
  }

  handleSave(): void {
    if (!this.validateForm()) {
      return;
    }

    this.loading = true;

    const payload = {
      command_id: this.form.get('command_id')?.value,
      classofship_id : this.form.get('classofship_id')?.value,
      strakes: this.strakeRowsArray.value,
      ...(this.editMode && this.rowId ? { id: this.rowId } : {}),
    };
    this.apiService.post(Apiendpoints.MASTER_STRAKES, payload).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.notificationService.success(res?.message || 'Strakes saved successfully');
        this.addNewRequest.emit(true);
        setTimeout(() => this.closeDialog(), 100);
      },
      error: (err: any) => {
        console.error(err);
        this.notificationService.error('Failed to save strakes.');
      },
      complete: () => {
        this.loading = false;
      },
    });
  }

  closeDialog(): void {
    this.close.emit();
  }
}