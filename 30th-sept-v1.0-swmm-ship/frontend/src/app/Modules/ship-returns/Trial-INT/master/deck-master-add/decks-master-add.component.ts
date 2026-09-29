import { ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormCardDialogComponent } from '../../ui/form-card-dialog/form-card-dialog.component';
import { CommonModule } from '@angular/common';
import { InputComponent } from '../../ui/input.component';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../api.service';
import { Apiendpoints } from '../../ApiEndPoints';
import { MasterService } from '../../services/master.service';
import { SelectComponent as NewSelectComponent } from '../../ui/select.component';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';

@Component({
  selector: 'app-decks-master-add',
  imports: [
    CommonModule,
    FormCardDialogComponent,
    InputComponent,
    ReactiveFormsModule,
    NewSelectComponent,
  ],
  standalone: true,
  templateUrl: './decks-master-add.component.html',
})
export class DecksMasterAddComponent {
  form!: FormGroup;
  loading = false;
  rowId!: string | null;

  @Output() close = new EventEmitter<void>();
  @Output() addNewRequest = new EventEmitter<boolean>();
  @Input() editMode = false;
  @Input() viewMode = false;

  @Input() unitData: any | null = null;
  commandOptions: any[] = [];
  classOptions: any[] = [];

  closeDialog() {
    this.close.emit();
  }

  get title(): string {
    return this.editMode
      ? 'Edit details'
      : this.viewMode
        ? 'View details'
        : 'Add new deck';
  }

  get subtitle(): string {
    return this.editMode
      ? 'Edit selected deck details'
      : this.viewMode
        ? 'View selected deck details'
        : 'Add details (* fields are mandatory)';
  }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private apiService: ApiService,
    private notificationService: NotificationService,
    private masterService: MasterService,
    private cdr: ChangeDetectorRef
    
  ) {}


  ngOnInit(): void {
    this.loadCommands();
    this.loadClasses();
    if (this.editMode) {
      this.rowId = this.unitData.id;
    }

    this.form = this.fb.group({
      command_id: ['', Validators.required],
      classofship_id: ['', Validators.required],
      deck_no: [''],
      active: [true],
    });
    if (this.viewMode) {
      this.form.disable();
    }

     if (this.editMode || this.viewMode) {
      this.form.patchValue({
        command_id: this.unitData.command,
        classofship_id: this.unitData.class_id ?? this.unitData.classofship,
        deck_no: this.unitData.deck_no,
        active: !!this.unitData.active
      });
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
          command: this.unitData.command,
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
          command: this.unitData.command,
        });
        this.cdr.detectChanges();
      }
    });
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

    this.apiService.post(Apiendpoints.MASTER_DECKS, payload).subscribe({
      next: (res: any) => {
        this.notificationService.success(
          res?.message || 'New Deck saved successfully',
        );
        this.addNewRequest.emit(true);
        setTimeout(() => {
          this.closeDialog();
        }, 100);
      },
      error: (err: any) => {
        this.notificationService.error('Failed to save deck.');
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
