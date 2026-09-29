import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';

import { ApiService } from '../../../api.service';
import { Apiendpoints } from '../../../ApiEndPoints';
import { SelectComponent } from '../../../ui/select.component';

/* ----------------------------- Interfaces ----------------------------- */

export interface WorkflowOption {
  label: string;
  value: any;
}

export interface WorkflowStep {
  type: 'ship' | 'dropdown' | 'radio' | 'checkbox' | 'download' | 'upload';

  /** Form control key */
  key?: string;

  /** Label shown in dialog */
  label?: string;

  /** For dropdown/radio/checkbox */
  options?: WorkflowOption[];

  /** Download dependency */
  dependsOn?: string;

  /** Static template */
  file?: string;

  /** Dynamic templates */
  files?: {
    [key: string]: {
      label: string;
      file: string;
    };
  };

  /** Upload */
  accept?: string;

  multiple?: boolean;
}

export interface ImportConfig {
  enabled: boolean;
  title: string;
  uploadApi: string;
  formName: string;
  extraPayload?: Array<string>;
  workflow: WorkflowStep[];
}

/* -------------------------------------------------------------------- */

@Component({
  selector: 'app-import-export-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SelectComponent],
  templateUrl: './import-export-dialog.component.html',
  styleUrl: './import-export-dialog.component.css',
})
export class ImportExportDialogComponent implements OnInit, OnChanges {
  @ViewChild('fileInput')
  fileInput!: ElementRef<HTMLInputElement>;

  @Input() open = false;
  @Input() config!: ImportConfig;
  @Input() loading = false;

  @Output() close = new EventEmitter<void>();
  @Output() import = new EventEmitter<FormData>();

  shipOptions: WorkflowOption[] = [];
  user: any = null;
  LoggedInUser = '';

  form!: FormGroup;
  selectedFile: File | null = null;

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
  ) {}

  ngOnInit(): void {
    this.user = this.getUser();
    this.LoggedInUser =
      this.user?.user_roles?.[0]?.process_name || this.user?.process_name || '';
    this.loadShips();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['config'] || changes['open']) &&
      this.open &&
      this.config?.workflow
    ) {
      this.buildDynamicForm();
    }
  }

  getUser(): any {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  loadShips(): void {
    this.apiService.get(Apiendpoints.MASTER_SHIP).subscribe({
      next: (res: any) => {
        const allShips: WorkflowOption[] = (res?.data ?? []).map(
          (item: any) => ({
            label: item.name,
            value: item.id,
          }),
        );

        const shipId =
          this.user?.ship_id ??
          this.user?.user_roles?.[0]?.ship_id ??
          this.user?.ship;

        if (this.LoggedInUser === 'Ship Staff' && shipId) {
          this.shipOptions = allShips.filter(
            (ship) => String(ship.value) === String(shipId),
          );
        } else {
          this.shipOptions = allShips;
        }

        // Patch after ship options are available
        this.patchLoggedInShip();
      },
      error: (error: any) => {
        console.error('Failed to load ships:', error);
        this.shipOptions = [];
      },
    });
  }

  /* -------------------------------------------------------------------------- */
  /*                                  FORM                                      */
  /* -------------------------------------------------------------------------- */

  isShip(step: WorkflowStep): boolean {
    return step.type === 'ship';
  }

  buildDynamicForm(): void {
    const controls: any = {};

    (this.config?.workflow ?? []).forEach((step) => {
      if (
        ['ship', 'dropdown', 'radio', 'checkbox'].includes(step.type) &&
        step.key
      ) {
        controls[step.key] = new FormControl('');
      }
    });

    this.form = this.fb.group(controls);
    this.patchLoggedInShip();
  }

  patchLoggedInShip(): void {
    if (!this.form || !this.config?.workflow) {
      return;
    }

    const shipStep = this.config.workflow.find((step) => step.type === 'ship');

    if (!shipStep?.key) {
      return;
    }

    const shipId =
      this.user?.ship_id ??
      this.user?.user_roles?.[0]?.ship_id ??
      this.user?.ship;

    if (shipId === null || shipId === undefined || shipId === '') {
      return;
    }

    const control = this.form.get(shipStep.key);
    if (!control) return;

    // Get the exact value matching shipOptions if loaded, else use shipId directly
    const matchedShip = this.shipOptions.find(
      (ship) => String(ship.value) === String(shipId),
    );

    const targetValue = matchedShip ? matchedShip.value : shipId;

    control.setValue(targetValue, { emitEvent: false });

    // Prevent Ship Staff from modifying ship selection if logged in as Ship Staff
    if (this.LoggedInUser === 'Ship Staff') {
      control.disable({ emitEvent: false });
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                               FILE UPLOAD                                  */
  /* -------------------------------------------------------------------------- */

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (input.files?.length) {
      this.selectedFile = input.files[0];
    }
  }

  removeFile(): void {
    this.selectedFile = null;

    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  isSubmitDisabled(): boolean {
    if (this.loading || !this.selectedFile || !this.form) {
      return true;
    }

    const rawValues = this.form.getRawValue();

    const requiredSteps = (this.config?.workflow ?? []).filter(
      (step) => ['ship', 'dropdown', 'radio'].includes(step.type) && step.key,
    );

    return requiredSteps.some((step) => {
      const val = rawValues[step.key!];
      return val === null || val === undefined || val === '';
    });
  }

  /* -------------------------------------------------------------------------- */
  /*                              DOWNLOAD FILE                                 */
  /* -------------------------------------------------------------------------- */

  getDownloadFile(step: WorkflowStep): { label: string; file: string } | null {
    if (step.file) {
      return {
        label: 'Download Template',
        file: step.file,
      };
    }

    if (!step.dependsOn || !this.form) return null;

    const rawValues = this.form.getRawValue();
    const selectedValue = rawValues[step.dependsOn];

    if (!selectedValue) return null;

    return step.files?.[selectedValue] ?? null;
  }

  downloadTemplate(step: WorkflowStep): void {
    const template = this.getDownloadFile(step);

    if (!template) return;

    const link = document.createElement('a');
    link.href = template.file;
    link.download = template.file.split('/').pop() ?? 'template.xlsx';
    link.click();
  }

  /* -------------------------------------------------------------------------- */
  /*                                 SUBMIT                                     */
  /* -------------------------------------------------------------------------- */

  submit(): void {
    if (!this.selectedFile || (this.form && this.form.invalid)) {
      if (this.form) {
        this.form.markAllAsTouched();
      }
      return;
    }

    const rawValues = this.form.getRawValue();
    const formData = new FormData();

    const shipStep = this.config?.workflow?.find((step) => step.type === 'ship');
    const shipVal = shipStep?.key
      ? rawValues[shipStep.key]
      : (rawValues['ship'] || rawValues['ship_id']);

    if (shipVal) {
      formData.append('ship_id', String(shipVal));
    }
    if (this.config?.formName) {
      formData.append('form_name', this.config.formName);
    }
    formData.append('file', this.selectedFile);

    if (this.form) {
      Object.keys(rawValues).forEach((key) => {
        if (key === (shipStep?.key || 'ship')) return;

        const value = rawValues[key];

        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, String(value));
        }
      });
    }

    this.import.emit(formData);
  }

  cancel(): void {
    if (this.form) {
      this.form.reset();
    }

    this.patchLoggedInShip();
    this.selectedFile = null;

    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }

    this.close.emit();
  }

  /* -------------------------------------------------------------------------- */
  /*                               HELPERS                                      */
  /* -------------------------------------------------------------------------- */

  isDropdown(step: WorkflowStep): boolean {
    return step.type === 'dropdown';
  }

  isRadio(step: WorkflowStep): boolean {
    return step.type === 'radio';
  }

  isCheckbox(step: WorkflowStep): boolean {
    return step.type === 'checkbox';
  }

  isDownload(step: WorkflowStep): boolean {
    return step.type === 'download';
  }

  isUpload(step: WorkflowStep): boolean {
    return step.type === 'upload';
  }

  trackByIndex(index: number): number {
    return index;
  }
}
