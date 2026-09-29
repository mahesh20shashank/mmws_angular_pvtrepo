import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ApiService } from '../../api.service';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { environment } from '../../../../../../environments/environment';

export interface UploadedFileItem {
  id?: string;
  name: string;
  file_path: string;
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-upload.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FileUploadComponent),
      multi: true,
    },
  ],
})
export class FileUploadComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() multiple = false;
  @Input() autoUpload = false;
  @Input() uploadEndpoint = 'api/files/upload/';
  @Input() fileFieldName = 'file';
  @Input() required = false;
  @Input() disabled = false;
  @Input() maxFiles: number | null = null;
  @Input() accept = '';
  @Input() allowedFileTypes: string[] = [];
  @Input() formOrMasterName = '';
  @Input() readOnly = false;
  @Output() fileSelected = new EventEmitter<File | null>();
  @Output() filesUploaded = new EventEmitter<UploadedFileItem[]>();

  selectedFiles: File[] = [];
  uploadedFiles: UploadedFileItem[] = [];
  isUploading = false;
  showFileSelector = true;
  showAllFiles = false;
  private lastHoverToastAt = 0;
  private lastHoverFileName = '';

  private onChange: (value: UploadedFileItem[] | UploadedFileItem | null) => void = () => { };
  private onTouched: () => void = () => { };

  private readonly apiService = inject(ApiService);
  private readonly notificationService = inject(NotificationService);

  onFileChange(event: Event): void {
    if (this.disabled || this.isUploading || this.readOnly) return;

    const input = event.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files ?? []);
    console.log('FILE UPLOAD VALIDATION', {
      accept: this.accept,
      maxFiles: this.maxFiles,
      multiple: this.multiple,
      selectedFiles: selectedFiles.map(file => file.name)
    });

    if (!selectedFiles.length) {
      input.value = '';
      return;
    }

    const validFiles = this.validateFiles(selectedFiles, this.selectedFiles.length);

    if (!validFiles.length) {
      input.value = '';
      return;
    }

    this.selectedFiles = this.multiple
      ? this.mergeSelectedFiles(validFiles)
      : [validFiles[0]];

    this.fileSelected.emit(this.selectedFiles[0] ?? null);
    this.onTouched();

    if (this.autoUpload) {
      this.uploadFiles(this.selectedFiles);
      this.showFileSelector = false;
    }

    input.value = '';
  }

  private validateFiles(files: File[], pendingFileCount = 0): File[] {
    let validFiles = this.multiple ? [...files] : files.slice(0, 1);

    const allowedExtensions = this.getAllowedExtensions();

    if (allowedExtensions.length) {
      const invalidFiles = validFiles.filter(
        file => !this.isAllowedFile(file, allowedExtensions)
      );

      if (invalidFiles.length) {
          this.notificationService.error(
          `Invalid file type: ${invalidFiles
            .map(file => file.name)
            .join(', ')}. Allowed formats: ${allowedExtensions.join(', ')}`
        );
      }

      validFiles = validFiles.filter(file =>
        this.isAllowedFile(file, allowedExtensions)
      );
    }

    if (
      this.multiple &&
      this.maxFiles !== null &&
      this.maxFiles > 0
    ) {
      const remainingSlots =
        this.maxFiles - this.uploadedFiles.length - pendingFileCount;

      if (remainingSlots <= 0) {
        this.notificationService.error(
          `You can upload a maximum of ${this.maxFiles} files.`
        );

        return [];
      }

      if (validFiles.length > remainingSlots) {
        this.notificationService.error(
          `You can upload maximum ${this.maxFiles} files.`
        );

        validFiles = validFiles.slice(0, remainingSlots);
      }
    }

    return validFiles;
  }

  private mergeSelectedFiles(files: File[]): File[] {
    const existing = new Set(
      this.selectedFiles.map(file => `${file.name}:${file.size}:${file.lastModified}`)
    );

    return [
      ...this.selectedFiles,
      ...files.filter(file => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      }),
    ];
  }

  private isAllowedFile(
    file: File,
    allowedExtensions: string[]
  ): boolean {
    const fileName = file.name.toLowerCase();

    return allowedExtensions.some(extension =>
      fileName.endsWith(extension)
    );
  }

  private getAllowedExtensions(): string[] {
    if (!this.accept) return [];

    return this.accept
      .split(',')
      .map(extension => extension.trim().toLowerCase())
      .filter(Boolean);
  }

  get canAddMoreFiles(): boolean {
    if (!this.multiple) {
      return false;
    }

    if (this.maxFiles === null || this.maxFiles <= 0) {
      return true;
    }

    return this.uploadedFiles.length < this.maxFiles;
  }

  get remainingFileSlots(): number | null {
    if (this.maxFiles === null || this.maxFiles <= 0) {
      return null;
    }

    return Math.max(
      this.maxFiles - this.uploadedFiles.length,
      0
    );
  }



  removeFile(index?: number): void {
    if (this.disabled || this.isUploading || this.readOnly) return;

    if (typeof index === 'number') {
      this.uploadedFiles.splice(index, 1);
      if (this.uploadedFiles.length <= 2) {
        this.showAllFiles = false;
      }
    } else {
      this.selectedFiles = [];
      this.uploadedFiles = [];
      this.fileSelected.emit(null);
      this.showAllFiles = false;
    }

    this.filesUploaded.emit(this.uploadedFiles);
    this.emitValueForForm();
    this.onTouched();
    if (!this.uploadedFiles.length) {
      this.showFileSelector = true;
    }
  }

  openFile(filePath: string): void {
    const url = this.buildViewUrl(filePath);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  triggerFileSelector(): void {
    if (this.disabled || this.isUploading || this.readOnly) return;
    this.showFileSelector = true;
  }

  hideFileSelector(): void {
    if (this.disabled || this.isUploading || this.readOnly || !this.uploadedFiles.length) return;
    this.showFileSelector = false;
  }

  toggleShowAllFiles(): void {
    this.showAllFiles = !this.showAllFiles;
  }

  get visibleUploadedFiles(): UploadedFileItem[] {
    if (this.showAllFiles || this.uploadedFiles.length <= 2) {
      return this.uploadedFiles;
    }
    return this.uploadedFiles.slice(0, 2);
  }

  get hiddenFilesCount(): number {
    return Math.max(this.uploadedFiles.length - 2, 0);
  }

  writeValue(value: UploadedFileItem[] | UploadedFileItem | null): void {
    if (!value) {
      this.selectedFiles = [];
      this.uploadedFiles = [];
      this.showFileSelector = true;
      this.showAllFiles = false;
      return;
    }

    const incomingFiles = Array.isArray(value)
      ? value.filter(this.isValidUploadedFile)
      : this.isValidUploadedFile(value)
        ? [value]
        : [];
    this.uploadedFiles = this.mergeUploadedFiles(incomingFiles);
    this.showFileSelector = true;
    this.showAllFiles = false;
  }

  previewSelectedFile(file: File): void {
    const fileURL = URL.createObjectURL(file);
    window.open(fileURL, '_blank');
  }

  registerOnChange(fn: (value: UploadedFileItem[] | UploadedFileItem | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  removeSelectedFile(index?: number): void {
    if (this.disabled || this.isUploading || this.readOnly) return;

    if (typeof index === 'number') {
      this.selectedFiles.splice(index, 1);
    } else {
      this.selectedFiles = [];
    }

    if (!this.selectedFiles.length) {
      this.showFileSelector = true;
    }
  }


  uploadSelectedFiles(): void {
    if (
      this.disabled ||
      !this.selectedFiles.length ||
      this.isUploading ||
      this.readOnly
    ) {
      return;
    }

    const validFiles = this.validateFiles(this.selectedFiles);

    if (!validFiles.length) {
      this.selectedFiles = [];
      return;
    }

    this.selectedFiles = validFiles;
    this.uploadFiles(validFiles);
  }

  uploadSelectedFile(index: number): void {
    if (
      this.disabled ||
      this.isUploading ||
      this.readOnly ||
      !this.selectedFiles[index]
    ) {
      return;
    }

    const file = this.selectedFiles[index];
    const validFiles = this.validateFiles([file]);

    if (validFiles.length) {
      this.uploadFiles(validFiles, [index]);
    }
  }

  private uploadFiles(files: File[], selectedIndexes?: number[]): void {

    if (
      this.multiple &&
      this.maxFiles !== null &&
      this.maxFiles > 0 &&
      this.uploadedFiles.length + files.length > this.maxFiles ||
      this.readOnly
    ) {
      this.notificationService.error(
        `You can upload a maximum of ${this.maxFiles} files.`
      );

      return;
    }

    const formData = new FormData();
    files.forEach(file => formData.append(this.fileFieldName, file));

    this.isUploading = true;
    let uploadSucceeded = false;

    this.apiService.uploadFile<any>(this.uploadEndpoint, formData).subscribe({
      next: response => {
        const mappedFiles = this.normalizeUploadResponse(response, files);

        uploadSucceeded = mappedFiles.length > 0;

        this.uploadedFiles = this.mergeUploadedFiles(mappedFiles);

        this.filesUploaded.emit(this.uploadedFiles);
        this.emitValueForForm();

        if (mappedFiles.length) {
          this.notificationService.success?.('File uploaded successfully');
        }
      },
      error: () => {
        this.notificationService.error('File upload failed');
      },
      complete: () => {
        this.isUploading = false;
        if (!uploadSucceeded) return;

        if (selectedIndexes?.length) {
          const uploadedIndexes = new Set(selectedIndexes);
          this.selectedFiles = this.selectedFiles.filter(
            (_, index) => !uploadedIndexes.has(index)
          );
        } else {
          this.selectedFiles = [];
        }
        this.showFileSelector = this.uploadedFiles.length === 0;
      },
    });
  }

  private normalizeUploadResponse(response: any, files: File[]): UploadedFileItem[] {
    const payloads = this.normalizeUploadPayloads(response);
    return payloads
      .map((item: any, index: number) => this.mapUploadItem(item, files[index]))
      .filter(this.isValidUploadedFile);
  }

  private normalizeUploadPayloads(response: any): any[] {
    if (typeof response === 'string') return [response];
    if (typeof response?.data === 'string') return [response.data];
    if (typeof response?.file === 'string') return [response.file];

    const body = this.unwrapUploadBody(response);
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.uploaded)) return body.uploaded;
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.results)) return body.results;
    if (Array.isArray(body?.files)) return body.files;
    if (typeof body === 'string') return [body];
    if (body?.id != null || body?.uuid != null || body?.file_id != null) return [body];
    return [];
  }

  private unwrapUploadBody(response: any): any {
    if (!response || typeof response !== 'object') return response;
    const data = response.data;
    if (data != null && typeof data === 'object' && !Array.isArray(data)) {
      return data;
    }
    return response;
  }

  private mapUploadItem(item: any, fallbackFile?: File): UploadedFileItem | null {
    if (!item) return null;

    if (typeof item === 'string') {
      const id = this.extractFileIdFromPath(item);
      return {
        id: id ?? undefined,
        name: fallbackFile?.name ?? 'Uploaded file',
        file_path: this.normalizeFilePath(item, id),
      };
    }

    const id =
      item?.id != null && item.id !== ''
        ? String(item.id)
        : item?.uuid != null && item.uuid !== ''
          ? String(item.uuid)
          : item?.file_id != null && item.file_id !== ''
            ? String(item.file_id)
            : this.extractFileIdFromPath(item?.file_path ?? item?.url ?? item?.file);
    const name = item?.original_name ?? item?.name ?? item?.filename ?? fallbackFile?.name;
    const filePath = this.normalizeFilePath(item?.file_path ?? item?.url ?? item?.file, id);

    if (!id && !filePath) return null;

    return {
      id,
      name: name ?? 'Uploaded file',
      file_path: filePath,
    };
  }

  private extractFileIdFromPath(filePath?: string): string | undefined {
    if (!filePath) return undefined;
    const match = String(filePath).match(/api\/files\/([^/]+)\/?$/i);
    return match?.[1];
  }

  private normalizeFilePath(filePath?: string, id?: string): string {
    const value = String(filePath ?? '').trim();
    if (!value && !id) return '';
    if (/^https?:\/\//i.test(value)) return value;

    const path = (value || id || '').replace(/^\/+|\/+$/g, '');
    if (/^api\/files\//i.test(path)) {
      return `/${path}/`.replace(/\/+/g, '/');
    }

    return `/api/files/${path}/`;
  }

  private mergeUploadedFiles(files: UploadedFileItem[]): UploadedFileItem[] {
    const existingPaths = new Set(this.uploadedFiles.map(file => file.file_path));
    const merged = [...this.uploadedFiles];

    files.forEach(file => {
      if (!existingPaths.has(file.file_path)) {
        merged.push(file);
        existingPaths.add(file.file_path);
      }
    });

    return merged;
  }

  private buildViewUrl(filePath: string): string {
    const path = (filePath || '').trim();
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;

    const base = environment.apiUrl.endsWith('/')
      ? environment.apiUrl
      : `${environment.apiUrl}/`;

    return `${base}${path.replace(/^\/+/, '')}`;
  }

  private emitValueForForm(): void {
    if (!this.uploadedFiles.length) {
      this.onChange(null);
      return;
    }

    this.onChange(this.multiple ? this.uploadedFiles : this.uploadedFiles[0]);
  }

  private isValidUploadedFile(item: any): item is UploadedFileItem {
    return !!item && typeof item.name === 'string' && typeof item.file_path === 'string';
  }
}
