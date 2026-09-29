import { ButtonComponent } from '../button/button.component';
import { ChangeDetectorRef, Component, Input, forwardRef, HostListener, Output, EventEmitter, ChangeDetectionStrategy, inject } from "@angular/core";

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

import { IconComponent } from "../icon/icon.component";
import { NotificationService } from "../../../Core/services/notification/notification.service";

@Component({
  selector: "app-file-input",
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: "./file-input.html",
  styleUrl: "./file-input.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FileInput),
      multi: true,
    },
  ],
})
export class FileInput implements ControlValueAccessor {
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() id?: string;
  @Input() label = "";
  /** Shows a red asterisk after `label` — purely visual, doesn't add/replace form validation. */
  @Input() required = false;
  @Input() placeholder = "Choose File";
  @Input() readonly = false;
  /** Comma-separated extensions/MIME types (e.g. ".pdf,.docx,application/pdf") — actually
   *  enforced in `fileChanged()`, not just a picker-dialog hint. Empty means unrestricted,
   *  which is also this component's real-world behavior for any caller that leaves it unset
   *  (a browser's file picker "All Files" option always bypasses a plain hint anyway). */
  @Input() accept = "";
  @Input() enablePreview = true;
  @Input() allowRemove = true;
  /** Renders `label` as a plain block label above the input box (matching
   * app-select-input/app-input-field) instead of the default floating label
   * inside the box. */
  @Input() outsideLabel = false;
  @Output() previewRequested = new EventEmitter<string[]>();

  private static nextId = 0;
  private readonly autoId = `file-input-${FileInput.nextId++}`;

  /** Unique per instance so the floating `<label>` always associates with this
   * instance's own file input, or custom id if passed. */
  get inputId(): string {
    return this.id || this.autoId;
  }

  fileName = "";
  focused = false;

  selectedFile: File | null = null;

  showPreview = false;
  activeImage = 0;

  previewImages: string[] = [];

  onChange: (value: File | null) => void = (value) => value;
  onTouched: () => void = () => {
    return
  };

  writeValue(value: File | null): void {
    this.selectedFile = value;
    this.fileName = value?.name || "";
    // Called by Angular Forms from outside this component's own template (e.g. a caller's
    // `form.reset()`/`.setValue(null)`) — with `OnPush`, mutating these fields alone doesn't
    // schedule a re-render, so the displayed filename would keep showing the just-cleared file.
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: File | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.readonly = isDisabled;
  }

  onFocus(): void {
    this.focused = true;
  }

  onBlur(): void {
    this.focused = false;
    this.onTouched();
  }

  openPreview(event: MouseEvent) {
    event.stopPropagation();

    // `enablePreview: false` means the caller listens to `previewRequested` and shows its
    // own preview modal (e.g. defact-form's shared `<app-image-preview>`) — opening this
    // component's own overlay too would stack two preview modals, so closing the caller's
    // (the one actually visible, since it renders on top) left this one still underneath.
    if (this.enablePreview) {
      this.showPreview = true;
    }
    this.previewRequested.emit(this.previewImages);
  }

  /** `accept` is just a picker hint — browsers still let users pick any file via
   *  "All Files", so it doesn't actually block anything on its own. Re-check the
   *  chosen file's extension/MIME type against `accept` here for real enforcement. */
  private isAcceptedFile(file: File): boolean {
    const tokens = this.accept
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    if (!tokens.length) return true;

    const fileName = file.name.toLowerCase();
    const fileType = (file.type || "").toLowerCase();

    return tokens.some((token) => {
      if (token.startsWith(".")) return fileName.endsWith(token);
      if (token.endsWith("/*")) return fileType.startsWith(token.slice(0, -1));
      return fileType === token;
    });
  }

  fileChanged(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files?.length) {
      return;
    }

    const file = input.files[0];

    if (!this.isAcceptedFile(file)) {
      input.value = "";
      this.notify.error(`"${file.name}" isn't an accepted file type.`);
      return;
    }

    this.selectedFile = file;
    this.fileName = file.name;

    this.onChange(file);

    const reader = new FileReader();

    reader.onload = () => {
      this.previewImages = [reader.result as string];
      this.activeImage = 0;
    };

    reader.readAsDataURL(file);
  }
  openFilePicker(event: MouseEvent, fileInput: HTMLInputElement): void {
    event.stopPropagation();

    if (this.readonly) {
      return;
    }

    fileInput.click();
  }



  closePreview(): void {
    this.showPreview = false;
  }

  @HostListener("document:keydown.escape")
  onEscPressed() {
    this.closePreview();
  }
}
