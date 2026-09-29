import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  OnDestroy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';

import { Subscription } from 'rxjs';
import { environment } from '../../../../../../environments/environment';
import { ApiService } from '../../api.service';
import { CalenderComponent } from '../calender.component';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { HtmlEditorFieldComponent } from '../html-editor-field.component';
import { InputComponent } from '../input.component';
import { MultiSelectDropdownComponent } from '../multiselect';
import { SelectComponent } from '../select.component';
import { TextareaComponent } from '../textarea';
import { TimePickerComponent } from '../time-picker';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-add-form',
  standalone: true, // Ensure standalone is true if it's a standalone component
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    MultiSelectDropdownComponent,
    SelectComponent,
    InputComponent,
    TextareaComponent,
    TimePickerComponent,
    CalenderComponent,
    HtmlEditorFieldComponent,
    FileUploadComponent,
    IconComponent,
  ], // Add FormsModule for ngModel if used elsewhere
  templateUrl: './add-form.component.html',
  styles: [`
    :host {
      display: contents;
    }

    @media (max-width: 767px) {
      .add-form-dialog {
        max-width: calc(100vw - 1rem) !important;
      }
    }
  `],

})
export class AddFormComponent implements OnInit, OnChanges, OnDestroy {
  @Input() open = false;
  @Input() submitLabel = 'Save';
  @Input() position: 'top' | 'bottom' | 'center' = 'top';
  @Input() fromTitle = '';
  @Input() formDescription = '';
  @Input() isEditMode = false;
  @Input() isShowPopup = true;
  @Input() isButtonShoeWithoutPopup = false;
  @Input() isAddinational = false;
  @Input() showSubmitButton = true;
  @Input() additionalLabel = 'Approve';
  @Input() formData: any = {};
  @Input() formConfig: any[] = [];
  @Input() mode = 'add';
  @Input() context: 'maintop' | null | 'sfd' = null;
  @Input() isSingleColumn = false;
  @Input() width = '60vw';
  @Input() tabs: any[] = [];
  @Output() onTabChange = new EventEmitter<any>();
  @Output() onFieldChange = new EventEmitter<any>();
  @Output() onGroupChange = new EventEmitter<number>();
  @Output() onOpenChange = new EventEmitter<boolean>();
  @Output() onSubmit = new EventEmitter<{
    formData: any;
    type: 'save' | 'draft';
  }>();  /** Emits the value written to the file control after upload (UUID or files URL, depending on field config). */
  @Output() fileSelected = new EventEmitter<{ key: string; value: string }>();
  @Output() fileDeleted: EventEmitter<number> = new EventEmitter<number>();
  @Output() documentFileDeleted: EventEmitter<number> = new EventEmitter<number>();
  @Output() onSelectChange = new EventEmitter<{ key: string; value: any; selectedOption: any; formData: any }>();
  @Output() additionalButton = new EventEmitter<any>();

  form!: FormGroup;
  isFullScreen = true;
  isDragging = false;
  @Input() isReadonly = false;
  activeTab: any;

  maintopHeaderList: any[] = [];
  maintopDetailList: any[] = [];

  mediaFiles: { id: number; file: string }[] = [];
  documentFiles: { id: number; file: string }[] = [];

  // New property to store resolved options for each field
  resolvedOptions: Record<string, any[]> = {};
  private optionsSubscriptions: Subscription[] = [];
  private inputFieldChangeSubscriptions: Subscription[] = [];

  /** Original / local file name for file fields (shown after pick or upload). */
  fileUploadDisplayNames: Record<string, string> = {};
  /** Uploaded files for multi-select file fields (id + display name). */
  multiFileUploadItems: Record<string, { id: string; name: string }[]> = {};
  previewMap: Record<string, string> = {};
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private readonly fb = inject(FormBuilder);
  private readonly apiService = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notificationService = inject(NotificationService);

  constructor() { }

  ngOnInit() {
    this.isReadonly = this.mode === 'view';

    this.activeTab = this.tabs[0];
    setTimeout(() => {
      if (!this.form && this.formConfig?.length) {
        this.buildForm();
        this.resolveOptions();
      }
    }, 0);

    this.initializeFiles();
  }


  handlePrimeSelectChange(event: any, fieldKey: string): void {
    const selectedValue = event?.value ?? event;
    console.log('Selected value for field', fieldKey, ':', selectedValue);

    const options = this.resolvedOptions[fieldKey];
    const selectedOption = options?.find(
      opt => String(opt.value) === String(selectedValue)
    );

    this.form.get(fieldKey)?.setValue(selectedValue);

    this.onSelectChange.emit({
      key: fieldKey,
      value: selectedValue,
      selectedOption: selectedOption || null,
      formData: this.form.getRawValue(),
    });

    // Keep legacy field-change listeners working for select fields too.
    this.onFieldChange.emit({
      key: fieldKey,
      value: selectedValue,
      form: this.form.getRawValue(),
    });
  }




  ngOnChanges(changes: SimpleChanges): void {
    const formConfigChanged =
      !!changes['formConfig'] && this.formConfig?.length > 0;
    const openBecameTrue =
      !!changes['open'] && changes['open'].currentValue === true;

    // formConfig ya open badalne par pura form dubara banta hai — bina save kiye user input mit jata tha.
    // Pehle wali values wapas patch karte hain (dependent dropdown options update ke case mein zaroori).
    if ((formConfigChanged || openBecameTrue) && this.formConfig?.length) {
      const previous = this.form ? this.form.getRawValue() : null;
      this.buildForm();
      this.resolveOptions();
      if (previous) {
        this.form.patchValue(previous, { emitEvent: false });
      }
    }

    if (changes['formData'] && this.form && this.formConfig?.length) {
      this.patchFormValues();
      this.initializeFiles();
    }

    if (openBecameTrue) {
      this.fileUploadDisplayNames = {};
      this.multiFileUploadItems = {};
      this.cdr.markForCheck();
    }

    if (
      changes['open'] &&
      changes['open'].currentValue === false &&
      changes['open'].previousValue === true
    ) {
      this.fileUploadDisplayNames = {};
      this.multiFileUploadItems = {};
      this.cdr.markForCheck();
    }

    if (changes['formData'] && this.formData) {
      setTimeout(() => {
        const updatedPreview: any = {};

        this.formConfig?.forEach(field => {
          if (field.type === 'file' || field.type === 'file-multiple') {
            const value = this.formData[field.key];

            if (value && typeof value === 'string') {
              updatedPreview[field.key] = value;
            }

            if (this.isMultiFileField(field) && Array.isArray(value) && value.length) {
              this.multiFileUploadItems = {
                ...this.multiFileUploadItems,
                [field.key]: value.map((id: unknown) => ({
                  id: String(id),
                  name: this.getFileName(String(id)),
                })),
              };
            }
          }
        });

        this.previewMap = updatedPreview;


        this.cdr.detectChanges();
      });
    }
  }


  ngOnDestroy(): void {
    // Clean up all option subscriptions
    this.optionsSubscriptions.forEach(sub => sub.unsubscribe());
    this.inputFieldChangeSubscriptions.forEach(sub => sub.unsubscribe());
  }

  // New method to resolve observable options
  private resolveOptions(): void {
    // Clear existing subscriptions
    this.optionsSubscriptions.forEach(sub => sub.unsubscribe());
    this.optionsSubscriptions = [];
    this.resolvedOptions = {};

    this.formConfig.forEach(field => {
      // Handle both 'select' and 'select-multiple' types
      if ((field.type === 'select' || field.type === 'select-multiple') && field.options) {
        if (field.options && typeof field.options.subscribe === 'function') {
          // It's an Observable
          const subscription = field.options.subscribe((options: any[]) => {
            this.resolvedOptions[field.key] = options || [];

          });
          this.optionsSubscriptions.push(subscription);
        } else if (Array.isArray(field.options)) {
          // It's already an array
          this.resolvedOptions[field.key] = field.options;
        } else {
          // Fallback to empty array
          this.resolvedOptions[field.key] = [];
        }
      }
    });
  }

  // Method to get resolved options for a field
  getOptionsForField(fieldKey: string): any[] {

    return this.resolvedOptions[fieldKey] || [];
  }

  // Handle select dropdown changes
  handleSelectChange(event: Event, fieldKey: string): void {
    const selectElement = event.target as HTMLSelectElement;
    const selectedValue = selectElement.value;

    // Find the selected option object from resolved options
    const options = this.resolvedOptions[fieldKey];
    const selectedOption = options?.find(opt => String(opt.value) === String(selectedValue));

    // Update form value
    this.form.get(fieldKey)?.setValue(selectedValue);

    // Emit the change event to parent component
    this.onSelectChange.emit({
      key: fieldKey,
      value: selectedValue,
      selectedOption: selectedOption || null,
      formData: this.form.value
    });
  }

  // Helper method to clean field values and prevent 'undefined' strings
  private cleanFieldValue(value: any, fieldType: string): any {
    // Handle null, undefined, or 'undefined' string
    if (value === undefined || value === null || value === 'undefined' || value === '') {
      // Return null to indicate no value provided, let buildForm handle defaults
      return null;
    }

    // Type-specific cleaning
    if (fieldType === 'checkbox') {
      return Boolean(value);
    } else if (fieldType === 'text' || fieldType === 'textarea' || fieldType === 'editor') {
      return String(value || '');
    } else if (fieldType === 'number') {
      // For number fields, ensure we get a valid number
      const numValue = parseInt(value);
      return isNaN(numValue) ? 0 : numValue;
    } else if (fieldType === 'select-multiple') {
      // Handle select-multiple values
      if (Array.isArray(value)) {
        return value;
      } else if (typeof value === 'string' && value) {
        // If it's a comma-separated string, split it
        return value.split(',').map(v => v.trim());
      } else {
        return []; // Default to empty array
      }
    } else if (fieldType === 'date' && value) {
      return new Date(value).toISOString().substring(0, 10);
    } else if (fieldType === 'select') {
      if (typeof value === 'object' && value !== null) {
        return value.id ?? value.value ?? '';
      }
      return value || '';
    }

    return value;
  }

  getFileName(pathOrFile: string | File): string {
    if (typeof pathOrFile === 'string') {
      const parts = pathOrFile.split('/');
      return parts[parts.length - 1];
    } else if (pathOrFile instanceof File) {
      return pathOrFile.name;
    }
    return '';
  }

  /** Show upload/selection feedback only when we have a local display label (new pick or post-upload label). */
  showUploadedFileRow(fieldKey: string): boolean {
    return !!this.fileUploadDisplayNames[fieldKey];
  }

  /** Prefer server `original_name`, then map, then last URL/UUID segment. */
  displayNameForFileField(fieldKey: string): string {
    const fromMap = this.fileUploadDisplayNames[fieldKey];
    if (fromMap) return fromMap;
    const raw = this.form?.get(fieldKey)?.value;
    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      return this.getFileName(String(raw));
    }
    return '';
  }

  private setFileUploadLabel(fieldKey: string, label: string): void {
    if (!label) return;
    this.fileUploadDisplayNames = {
      ...this.fileUploadDisplayNames,
      [fieldKey]: label,
    };
    this.cdr.markForCheck();
  }

  private clearFileUploadLabel(fieldKey: string): void {
    if (!this.fileUploadDisplayNames[fieldKey]) return;
    const next = { ...this.fileUploadDisplayNames };
    delete next[fieldKey];
    this.fileUploadDisplayNames = next;
    this.cdr.markForCheck();
  }

  /** Avoid using `res.data` when it is not the upload object (e.g. wrong shape). */
  private unwrapUploadBody(res: any): any {
    if (!res || typeof res !== 'object') return res;
    const d = res.data;
    if (d != null && typeof d === 'object' && !Array.isArray(d)) {
      return d;
    }
    return res;
  }

  deleteFile(fileId: number): void {

    this.fileDeleted.emit(fileId);
  }

  deleteDocumentFile(fileId: number): void {

    this.documentFileDeleted.emit(fileId);
  }

  removeImage(fieldKey: string): void {
    // remove preview
    delete this.previewMap[fieldKey];

    // reset form control value
    this.form.get(fieldKey)?.reset();



    // mark field touched for validation
    this.form.get(fieldKey)?.markAsTouched();
    this.form.get(fieldKey)?.updateValueAndValidity();
  }
  private initializeFiles(): void {
    const mediaField = this.formConfig?.find(f => f.key === 'file');
    const documentField = this.formConfig?.find(f => f.key === 'document');

    this.mediaFiles = [];
    if (this.isEditMode && mediaField) {
      const mediaData = this.formData[mediaField.key];
      if (Array.isArray(mediaData)) {
        this.mediaFiles = mediaData;
      } else if (typeof mediaData === 'string' && mediaData) {
        this.mediaFiles = [{ id: Date.now(), file: mediaData }];
      }
    }

    this.documentFiles = [];
    if (this.isEditMode && documentField) {
      const documentData = this.formData[documentField.key];
      if (Array.isArray(documentData)) {
        this.documentFiles = documentData;
      } else if (typeof documentData === 'string' && documentData) {
        this.documentFiles = [{ id: Date.now(), file: documentData }];
      }
    }
  }

  patchFormValues() {
    const patchObj: Record<string, any> = {};

    this.formConfig.forEach((field) => {
      const rawValue = this.formData?.[field.key];
      const cleanValue = this.cleanFieldValue(rawValue, field.type);

      // Ensure we never set undefined values
      if (cleanValue === undefined || cleanValue === null) {
        if (field.type === 'number') {
          patchObj[field.key] = 0;
        } else if (field.type === 'checkbox') {
          patchObj[field.key] = false;
        } else if (field.type === 'select-multiple') {
          patchObj[field.key] = []; // Empty array for multi-select
        } else if (field.type === 'text') {
          patchObj[field.key] = '';
        } else {
          patchObj[field.key] = '';
        }
      } else {
        patchObj[field.key] = cleanValue;
      }
    });

    this.form.patchValue(patchObj, { emitEvent: false });
    this.form.markAsTouched(); // Mark as touched to show validation errors if any
    // emitEvent: false — otherwise valueChanges re-fires, parent updates formData, ngOnChanges loops
    this.form.updateValueAndValidity({ emitEvent: false });
  }

  buildForm() {
    const group: Record<string, any> = {};

    this.formConfig.forEach((field) => {
      // Get raw value from formData and clean it
      const rawValue = this.formData?.[field.key];
      let initialValue = this.cleanFieldValue(rawValue, field.type);

      // Set default values based on field type if no value provided
      if (initialValue === undefined || initialValue === null) {
        if (field.type === 'number') {
          initialValue = 0;
        } else if (field.type === 'checkbox') {
          // Use provided value or default to false
          initialValue = this.formData?.[field.key] !== undefined ? Boolean(this.formData[field.key]) : false;
        } else if (field.type === 'select-multiple') {
          // Use provided value or default to empty array
          initialValue = this.formData?.[field.key] || [];
        } else if (field.type === 'select') {
          initialValue = ''; // Empty string for single select
        } else if (field.type === 'date') {
          initialValue = ''; // Empty string for date
        } else if (this.isMultiFileField(field)) {
          initialValue = Array.isArray(this.formData?.[field.key])
            ? this.formData[field.key]
            : [];
        } else {
          initialValue = ''; // Empty string for text inputs
        }
      }

      // Additional check to prevent 'undefined' strings
      if (initialValue === 'undefined') {
        if (field.type === 'select-multiple') {
          initialValue = [];
        } else {
          initialValue = '';
        }
      }

      // Build validators array
      const validators: any[] = [];

      // Hidden fields stay in the form but must not block submit
      if (field.required && !field.hide) {
        if (this.isMultiFileField(field)) {
          validators.push(Validators.minLength(1));
        } else {
          validators.push(Validators.required);
        }
      }

      // Add email validator for email type fields
      if (field.type === 'email') {
        validators.push(Validators.email);
      }

      // Add pattern validator if provided
      if (field.pattern) {
        validators.push(Validators.pattern(field.pattern));
      }

      if (field.type === 'number') {
        if (field.min !== undefined && field.min !== null && field.min !== '') {
          const m = Number(field.min);
          if (Number.isFinite(m)) {
            validators.push(Validators.min(m));
          }
        }
        if (field.max !== undefined && field.max !== null && field.max !== '') {
          const m = Number(field.max);
          if (Number.isFinite(m)) {
            validators.push(Validators.max(m));
          }
        }
      }

      group[field.key] = new FormControl(
        { value: initialValue, disabled: !!field.disabled },
        validators,
      );
    });

    this.form = this.fb.group(group);
    this.setupInputFieldChangeListeners();
  }

  private setupInputFieldChangeListeners(): void {
    this.inputFieldChangeSubscriptions.forEach(sub => sub.unsubscribe());
    this.inputFieldChangeSubscriptions = [];

    this.formConfig.forEach((field) => {
      if (!this.isBasicInput(field) && field.type !== 'textarea' && field.type !== 'address') return;

      const control = this.form.get(field.key);
      if (!control) return;

      this.inputFieldChangeSubscriptions.push(
        control.valueChanges.subscribe((value) => {
          const formValue = { ...this.form.getRawValue(), [field.key]: value };
          this.onFieldChange.emit({
            key: field.key,
            value,
            form: formValue,
            formValue,
          });
        }),
      );
    });
  }

  private loadMaintopDataForEditMode(): void {
    const equipmentId = this.formData?.equipment;
    const headerId = this.formData?.maintop_header;
    const detailId = this.formData?.maintop_detail;

    if (equipmentId) {
      this.apiService
        .get(`maintop/maintop-header/?equipment=${equipmentId}&dropdown=true`)
        .subscribe((headerData: any) => {
          const headerField = this.formConfig.find(
            (f) => f.key === 'maintop_header'
          );
          if (headerField) {
            headerField.options = headerData.map((h: any) => ({
              label: h.code,
              value: h.id,
            }));
          }

          if (headerId) {
            const match = headerField?.options?.find(
              (opt: any) => opt.value === headerId
            );
            if (match) {
              this.form.get('maintop_header')?.setValue(match.value, { emitEvent: false });
            }

            this.apiService
              .get(
                `maintop/maintop-detail?maintop_header=${headerId}&dropdown=true`
              )
              .subscribe((detailData: any) => {
                const detailField = this.formConfig.find(
                  (f) => f.key === 'maintop_detail'
                );
                if (detailField) {
                  detailField.options = detailData.map((d: any) => ({
                    label: d.no,
                    value: d.id,
                  }));
                }

                if (detailId) {
                  const matchDetail = detailField?.options?.find(
                    (opt: any) => opt.value === detailId
                  );
                  if (matchDetail) {
                    this.form
                      .get('maintop_detail')
                      ?.setValue(matchDetail.value, { emitEvent: false });
                  }
                }
              });
          }
        });
    }
  }

  setupMaintopListeners() {
    this.form.get('equipment')?.valueChanges.subscribe((equipmentId) => {
      if (equipmentId) {
        this.apiService
          .get(
            `maintop/maintop-header/?equipment=${equipmentId}&dropdown=${true}`
          )
          .subscribe((data: any) => {

            const headerField = this.formConfig.find(
              (f) => f.key === 'maintop_header'
            );
            if (headerField) {
              headerField.options = data.map((h: any) => ({
                label: h.title,
                value: h.id,
              }));
            }
            this.form.get('maintop_header')?.setValue('');
            this.form.get('maintop_detail')?.setValue('');
          });
      }
    });

    this.form.get('maintop_header')?.valueChanges.subscribe((headerId) => {
      if (headerId) {

        this.apiService
          .get(
            `maintop/maintop-detail?maintop_header=${headerId}&dropdown=${true}`
          )
          .subscribe((data: any) => {

            const detailField = this.formConfig.find(
              (f) => f.key === 'maintop_detail'
            );
            if (detailField) {
              detailField.options = data.map((d: any) => ({
                label: d.no,
                value: d.id,
              }));
            }
            this.form.get('maintop_detail')?.setValue('');
          });
      }
    });
  }

  closeSidebar() {
    this.onOpenChange.emit(false);
    this.isFullScreen = false;
  }

  closeAllDropdowns(): void {
    this.closeSidebar();
  }

  toggleFullScreen() {
    this.isFullScreen = !this.isFullScreen;
  }

  triggerFileInputClick(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  openExistingPreviewInNewTab(url: string | null | undefined): void {
    const u = url?.trim();
    if (!u) return;
    window.open(u, '_blank', 'noopener,noreferrer');
  }

  handleFileInput(event: Event, key: string) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const files = Array.from(input.files);
    if (this.isMultipleFileField(key)) {
      this.emitFiles(key, files);
    } else {
      this.emitFile(key, files[0]);
    }
    input.value = '';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
  }

  onFileDrop(event: DragEvent, key: string) {
    event.preventDefault();
    this.isDragging = false;

    if (!event.dataTransfer?.files.length) return;

    const files = Array.from(event.dataTransfer.files);
    if (this.isMultipleFileField(key)) {
      this.emitFiles(key, files);
    } else {
      this.emitFile(key, files[0]);
    }
  }

  /**
   * After POST api/files/upload/ (multipart field `file`), map response into the form control.
   * Use `fileUploadPayload: 'file_path'` on the file field to store `{API_URL}api/files/{file_path}`.
   * Default keeps `id` (UUID) for existing screens.
   */
  private valueFromUploadPayload(key: string, payload: any): string {
    const field = this.formConfig?.find(
      (f) => f.key === key && (f.type === 'file' || f.type === 'file-multiple'),
    );
    const mode = field?.fileUploadPayload ?? 'id';

    if (mode === 'file_path') {
      const fp = payload?.file_path;
      if (fp != null && String(fp).trim() !== '') {
        const base = environment.apiUrl.replace(/\/+$/, '');
        const sub = String(fp).replace(/^\/+/, '');
        return `${base}/api/files/${sub}`;
      }
      if (payload?.id != null) {
        return String(payload.id);
      }
      return '';
    }

    return payload?.id != null ? String(payload.id) : '';
  }

  private getFileFieldConfig(key: string): any {
    return this.formConfig?.find(
      (f) => f.key === key && (f.type === 'file' || f.type === 'file-multiple'),
    );
  }

  private buildUploadFormData(key: string, files: File[]): FormData {
    const field = this.getFileFieldConfig(key);
    const formData = new FormData();
    const fieldName = field?.fileFieldName ?? 'file';
    files.forEach((file) => formData.append(fieldName, file));
    if (field?.reference_type) {
      formData.append('reference_type', String(field.reference_type));
    }
    return formData;
  }

  private normalizeUploadPayloads(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.uploaded)) return res.uploaded;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.results)) return res.results;
    if (Array.isArray(res?.files)) return res.files;

    const body = this.unwrapUploadBody(res);
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.uploaded)) return body.uploaded;
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.results)) return body.results;
    if (Array.isArray(body?.files)) return body.files;
    if (body?.id != null) return [body];
    return [];
  }

  /** Upload multiple files in a single request; stores returned ids in the form control array. */
  private emitFiles(key: string, files: File[]) {
    if (!files.length) return;

    const field = this.getFileFieldConfig(key);

    // ===== NEW VALIDATION START =====

    const minWidth = field?.minWidth;
    const minHeight = field?.minHeight;

    const validationPromises = files.map((file) => {
      return new Promise<boolean>((resolve) => {

        if (!file.type.startsWith('image/')) {
          resolve(true);
          return;
        }

        const reader = new FileReader();

        reader.onload = (e: any) => {
          const img = new Image();

          img.onload = () => {

            const width = img.width;
            const height = img.height;

            if (
              minWidth &&
              minHeight &&
              (width < minWidth || height < minHeight)
            ) {
              this.notificationService.error(
                `Image resolution must be at least ${minWidth} × ${minHeight}px`
              );
              resolve(false);
              return;
            }

            resolve(true);
          };

          img.onerror = () => {
            this.notificationService.error(`Unable to read image: ${file.name}`);
            resolve(false);
          };

          img.src = e.target.result;
        };

        reader.readAsDataURL(file);
      });
    });

    Promise.all(validationPromises).then((results) => {

      if (results.includes(false)) {
        return;
      }
      const endpoint =
        field?.uploadEndpoint ?? environment.apiUrl + 'api/files/upload/';

      const formData = this.buildUploadFormData(key, files);

      this.apiService.uploadFile(endpoint, formData).subscribe({
        next: (res: any) => {
          const payloads = this.normalizeUploadPayloads(res);
          const control = this.form.get(key);
          const current = Array.isArray(control?.value)
            ? [...control.value]
            : [];

          const newItems: { id: string; name: string }[] = [];

          payloads.forEach((payload, index) => {
            const value = this.valueFromUploadPayload(key, payload);
            if (!value) return;

            current.push(value);

            const serverLabel =
              payload?.original_name ??
              payload?.stored_name ??
              files[index]?.name ??
              value;

            newItems.push({
              id: value,
              name: String(serverLabel),
            });
          });

          if (!newItems.length) return;

          this.multiFileUploadItems = {
            ...this.multiFileUploadItems,
            [key]: [...(this.multiFileUploadItems[key] ?? []), ...newItems],
          };

          control?.setValue(current, { emitEvent: true });
          control?.updateValueAndValidity();

          this.cdr.detectChanges();

          this.fileSelected.emit({
            key,
            value: current.join(','),
          });
        },
        error: (err: any) => {
          console.error('Upload failed', err);
        },
      });
    });
  }

  private emitFile(key: string, file: File) {

    const field = this.getFileFieldConfig(key);

    if (file.type.startsWith('image/')) {

      const reader = new FileReader();

      reader.onload = (e: any) => {

        const img = new Image();

        img.onload = () => {

          const width = img.width;
          const height = img.height;

          const minWidth = field?.minWidth;
          const minHeight = field?.minHeight;

          if (
            minWidth &&
            minHeight &&
            (width < minWidth || height < minHeight)
          ) {
            this.notificationService.error(
              `Image resolution must be at least ${minWidth} × ${minHeight} pixels`
            );

            this.clearFileUploadLabel(key);
            return;
          }

          this.uploadFileAfterValidation(key, file);
        };

        img.onerror = () => {
          this.notificationService.error('Invalid image file');
        };

        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
      return;
    }

    this.uploadFileAfterValidation(key, file);
  }

  private uploadFileAfterValidation(key: string, file: File): void {

    const formData = this.buildUploadFormData(key, [file]);

    this.setFileUploadLabel(key, file.name);

    const field = this.getFileFieldConfig(key);
    const endpoint =
      field?.uploadEndpoint ??
      environment.apiUrl + 'api/files/upload/';

    this.apiService.uploadFile(endpoint, formData).subscribe({
      next: (res: any) => {

        const payloads = this.normalizeUploadPayloads(res);
        const payload = payloads[0] ?? this.unwrapUploadBody(res);

        const value = this.valueFromUploadPayload(key, payload);

        const serverLabel =
          payload?.original_name ??
          payload?.stored_name ??
          file.name;

        const control = this.form.get(key);

        if (serverLabel) {
          this.setFileUploadLabel(key, String(serverLabel));
        } else if (value) {
          this.setFileUploadLabel(
            key,
            this.getFileName(value)
          );
        }

        control?.setValue(value, { emitEvent: true });
        control?.updateValueAndValidity();

        this.cdr.detectChanges();

        this.fileSelected.emit({
          key,
          value,
        });
      },
      error: (err: any) => {
        console.error('Upload failed', err);
        this.clearFileUploadLabel(key);
      },
    });
  }

  isMultiFileField(field: { type?: string; multiple?: boolean } | null | undefined): boolean {
    if (!field) return false;
    return field.type === 'file-multiple' || (field.type === 'file' && !!field.multiple);
  }

  isMultipleFileField(key: string): boolean {
    const field = this.formConfig?.find((f) => f.key === key);
    return this.isMultiFileField(field);
  }

  getMultiFileUploadItems(key: string): { id: string; name: string }[] {
    return this.multiFileUploadItems[key] ?? [];
  }

  hasMultiFileUploads(key: string): boolean {
    return this.getMultiFileUploadItems(key).length > 0;
  }

  removeMultiUploadedFile(key: string, index: number): void {
    const items = [...(this.multiFileUploadItems[key] ?? [])];
    if (index < 0 || index >= items.length) return;

    items.splice(index, 1);
    this.multiFileUploadItems = {
      ...this.multiFileUploadItems,
      [key]: items,
    };

    const control = this.form.get(key);
    const current = Array.isArray(control?.value) ? [...control.value] : [];
    current.splice(index, 1);
    control?.setValue(current, { emitEvent: true });
    control?.updateValueAndValidity();
    this.cdr.markForCheck();
  }

  private clearMultiFileUploadItems(key?: string): void {
    if (key) {
      if (!this.multiFileUploadItems[key]) return;
      const next = { ...this.multiFileUploadItems };
      delete next[key];
      this.multiFileUploadItems = next;
      return;
    }
    this.multiFileUploadItems = {};
  }

  handleSubmit(event: Event, type: 'save'| 'draft') {
    event.preventDefault();

    if (this.form.invalid) {

      this.notificationService.error('Please fill all required fields.'); // Consider a PrimeNG Toast for better UX
      this.markAllAsTouched(this.form);
      return;
    }
    const formData = this.form.getRawValue();
    // console.log(this.form.invalid, this.form.getRawValue(), '------------this.form.invalid--------------------------------------------')

    this.onSubmit.emit({
      ...formData,
      type
    });

    if (!this.isEditMode) {
      this.form.reset();
      this.formConfig.filter(f => f.type === 'file' || f.type === 'file-multiple').forEach(f => {
        this.form.get(f.key)?.setValue(this.isMultiFileField(f) ? [] : null);
        this.clearFileUploadLabel(f.key);
        this.clearMultiFileUploadItems(f.key);
      });
    }
  }

  private markAllAsTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markAllAsTouched(control);
      }
    });
  }

  /**
   * Get fields for the left column
   * This creates exactly equal field distribution between left and right columns
   */
  getLeftColumnFields() {
    if (!this.formConfig || this.formConfig.length === 0) return [];

    // Calculate exactly half the fields for left column
    const halfIndex = Math.ceil(this.formConfig.length / 2);
    return this.formConfig.slice(0, halfIndex);
  }

  /**
   * Get fields for the right column
   * This creates exactly equal field distribution between left and right columns
   */
  getRightColumnFields() {
    if (!this.formConfig || this.formConfig.length === 0) return [];

    // Calculate exactly half the fields for right column
    const halfIndex = Math.ceil(this.formConfig.length / 2);
    return this.formConfig.slice(halfIndex);
  }

  isSelectMultiple(fieldKey: string): boolean {
    return this.formConfig.find(f => f.key === fieldKey)?.type === 'select-multiple';
  }

  fileDropHint(field: { type?: string; multiple?: boolean; existingPreviewUrl?: string | null }): string {
    const multi = this.isMultiFileField(field);
    if (field.existingPreviewUrl) {
      return multi ? 'Add more images' : 'Replace file';
    }
    return multi ? 'Drag & drop images here' : 'Drag & drop file here';
  }

  trackByKey = (_: number, item: any) => {
    if (!item?.key) return _;
    const multi = this.isMultiFileField(item) ? 'multi' : 'single';
    return `${item.key}-${item.type ?? 'field'}-${multi}`;
  };

  isInvalid(key: string): boolean {
    const c = this.form?.get(key);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }

  // Inputs where we want normal <input> floating label
  isBasicInput(field: any): boolean {
    return (
      field.type !== 'checkbox' &&
      field.type !== 'select' &&
      field.type !== 'select-multiple' &&
      field.type !== 'radio' &&
      field.type !== 'file' &&
      field.type !== 'file-multiple' &&
      field.type !== 'tabs' &&
      field.type !== 'textarea' &&
      field.type !== 'editor' &&
      field.type !== 'address' &&
      field.type !== 'date' &&
      field.type !== 'time' &&
      field.type !== 'button' &&
      field.type !== 'spacer'
    );
  }

  @Output() valueChange = new EventEmitter<any>();

  onChange(event: any) {
    const value = event.value ?? event.target.value;
    this.valueChange.emit(value);
  }

  // handleChange(key: string, value: any) {
  //   // update form value
  //   this.form.patchValue({ [key]: value });

  //   const formData = this.form.getRawValue();

  //   // emit to parent — full snapshot for cascade APIs (ship_id / trial_unit_id on equipments)
  //   this.onFieldChange.emit({
  //     key: key,
  //     value: value,
  //     form: formData,
  //   });

  //   this.onSelectChange.emit({
  //     key,
  //     value,
  //     selectedOption: null,
  //     formData,
  //   });
  // }
  handleChange(key: string, value: any): void {
    const control = this.form?.get(key);

    if (control) {
      control.setValue(value);
      control.markAsDirty();
      control.markAsTouched();
      control.updateValueAndValidity();
    }

    this.onFieldChange.emit({
      key,
      value,
      form: this.form?.getRawValue(),
      formValue: this.form?.getRawValue(),
    });

    this.cdr.markForCheck();
  }

  /** Full form snapshot for parent listeners (e.g. master/equipments query params) */
  getFormSnapshot(): Record<string, any> {
    return this.form?.getRawValue() ?? {};
  }

  /** Parent se dependent dropdown reset (cascade) ke liye */
  patchFormPartial(partial: Record<string, any>): void {
    if (!this.form) return;
    this.form.patchValue(partial, { emitEvent: false });
  }

  submitForm(): any {
    return this.form.value;
  }

}
