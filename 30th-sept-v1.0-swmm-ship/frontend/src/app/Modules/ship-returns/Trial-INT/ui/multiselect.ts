import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

export interface MultiSelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
  /** Optional rich label (HTML) for dropdown rows */
  htmlTag?: string;
}

@Component({
  selector: 'app-multiselect',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultiSelectDropdownComponent),
      multi: true,
    },
  ],
  styles: [`
    .multiselect-option {
      color: var(--text-primary) !important;
      transition: background-color 0.15s ease;
    }
    .multiselect-option:hover {
      background-color: var(--bg-nav-child-hover);
    }
    .multiselect-option.is-selected {
      background-color: var(--bg-nav-child-hover);
      font-weight: 500;
    }
    .multiselect-option-label {
      color: var(--text-primary) !important;
    }
  `],
  template: `
     <div class="relative w-full">
      <div
        #multiSelectTrigger
        class="relative flex min-h-[45px] w-full cursor-pointer items-center rounded-[10px] px-4 py-1 transition"
        [ngClass]="triggerStateClasses"
        [class.opacity-60]="isDisabled"
        [class.pointer-events-none]="isDisabled"
        (click)="toggleDropdown($event)"
      >
        <label *ngIf="label" class="pointer-events-none absolute left-4 right-8 truncate transition-all duration-200" [ngClass]="labelStateClasses">
          {{ label }}
          <span *ngIf="required" class="text-red-500">*</span>
        </label>

        <div class="flex min-w-0 flex-1 flex-wrap gap-1 pr-8 pt-3">
           <ng-container *ngIf="selectedValues.length > 0">
            <span
              *ngFor="let item of visibleSelectedOptions"
                class="mr-1 inline-flex max-w-[180px] items-center rounded-full border border-[#4f8fd5] bg-[#1069AB] px-2 py-1 text-xs text-white"
              [title]="getOptionPlainText(item)"
            >
              <span class="truncate">{{ getOptionPlainText(item) }}</span>
              <button
                type="button"
                class="ml-1 opacity-70 hover:text-red-400 focus:outline-none"
                (click)="removeItem(item.value, $event)"
              >
                <i class="fa fa-times" aria-hidden="true"></i>
              </button>
            </span>

             <span *ngIf="extraSelectedCount > 0" class="inline-flex rounded-full border border-[var(--border-primary)] bg-[var(--bg-input)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]">
              +{{ extraSelectedCount }} more
            </span>
          </ng-container>
        </div>

         <svg
           class="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-[var(--text-muted)] transition-transform duration-200"
           [class.rotate-180]="isOpen"
           viewBox="0 0 24 24"
           fill="none"
           stroke="currentColor"
           stroke-width="2"
           stroke-linecap="round"
           stroke-linejoin="round"
           aria-hidden="true"
         >
           <path d="m6 9 6 6 6-6"></path>
         </svg>
      </div>

      <div
        #dropdownPanel
        *ngIf="isOpen"
         class="fixed z-50 overflow-hidden rounded-md border border-[var(--border-dropdown)] bg-[var(--bg-dropdown)] text-[var(--text-primary)] shadow-xl"
        [ngStyle]="dropdownStyle"
        (mousedown)="$event.stopPropagation()"
        (click)="$event.stopPropagation()"
      >
         <div *ngIf="searchable" class="border-b border-[var(--border-dropdown)] p-2">
          <input
            type="text"
            [(ngModel)]="searchTerm"
            placeholder="Search…"
             class="w-full rounded border border-[var(--border-input)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[#61C2FF]"
             (click)="$event.stopPropagation()"
          />
        </div>

        <div
          *ngIf="selectAllEnabled"
           class="flex items-center justify-between border-b border-[var(--border-dropdown)] px-3 py-2"
        >
          <button
            type="button"
             class="text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-wider hover:text-[#61C2FF]"
            (click)="selectAll($event)"
          >
            Select All
          </button>
          <button
            type="button"
             class="text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-wider hover:text-red-400"
            (click)="clearAll($event)"
          >
            Clear
          </button>
        </div>

        <div class="max-h-64 overflow-y-auto py-1">
          <div
            *ngFor="let option of filteredOptions"
            class="multiselect-option flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
            [class.opacity-50]="option.disabled"
            [class.cursor-not-allowed]="option.disabled"
            [class.is-selected]="isSelected(option.value)"
            (click)="toggleOption(option); $event.stopPropagation()"
          >
            <input
              type="checkbox"
              class="h-4 w-4 shrink-0 cursor-pointer accent-[#1069AB]"
              [checked]="isSelected(option.value)"
              [disabled]="option.disabled"
              [readonly]="readonly"
              (click)="toggleOption(option); $event.stopPropagation()"
            />
            <span *ngIf="!option.htmlTag" class="multiselect-option-label flex-1 text-sm">{{ option.label }}</span>
            <span *ngIf="option.htmlTag" class="multiselect-option-label flex-1 text-sm" [innerHTML]="option.htmlTag"></span>
          </div>

          <div
            *ngIf="filteredOptions.length === 0"
             class="px-3 py-6 text-center text-sm text-[var(--text-muted)]"
          >
            No options found
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MultiSelectDropdownComponent
  implements ControlValueAccessor, OnChanges, OnDestroy
{
  @ViewChild('multiSelectTrigger')
  multiSelectTrigger!: ElementRef<HTMLElement>;

  @ViewChild('dropdownPanel') dropdownPanel?: ElementRef<HTMLElement>;

  @Input() label = '';
  @Input() placeholder = '';
  @Input() options: MultiSelectOption[] = [];
  @Input() readonly = false;
  @Input() disabled = false;
  private _searchable = true;

  @Input()
  set searchable(value: any) {
    this._searchable = this.toBoolean(value, true);
  }

  get searchable(): boolean {
    return this._searchable;
  }

  @Input() selectAllEnabled = true;
  @Input() required = false;
  @Input() maxVisibleTags = 2;

  @Output() selectionChange = new EventEmitter<(string | number)[]>();

  isOpen = false;
  isDisabled = false;
  searchTerm = '';
  selectedValues: (string | number)[] = [];
  selectedItems: MultiSelectOption[] = [];

  /** Floating-label field surface: border/background per open state. */
  get triggerStateClasses(): string {
    return this.isOpen
      ? 'border border-[var(--accent-light,#61c2ff)] bg-[var(--bg-input)]'
      : 'border border-[var(--border-input)] bg-[var(--bg-input)]';
  }

  /** Floating-label position: raised when open or at least one value is selected. */
  get labelStateClasses(): string {
    return this.isOpen || this.selectedValues.length > 0
      ? 'top-[3px] text-[11px] text-[var(--text-muted)]'
      : 'top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]';
  }

  dropdownStyle: Record<string, string> = {};

  private readonly onScrollReposition = () => {
    if (!this.isOpen) return;

    requestAnimationFrame(() => {
      this.mountDropdownToBody();
      this.updateDropdownPosition();
    });
  };

  private onChange: (value: (string | number)[]) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly elementRef = inject(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);

  writeValue(value: (string | number)[] | null): void {
    this.selectedValues = Array.isArray(value) ? value : [];

    this.selectedItems = this.options.filter((o) =>
      this.selectedValues.includes(o.value)
    );
  }

  registerOnChange(fn: (value: (string | number)[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;

    if (isDisabled) {
      this.isOpen = false;
      this.detachScrollRepositionListener();
    }
  }

  ngOnDestroy(): void {
    this.detachScrollRepositionListener();
  }

  toggleDropdown(event?: MouseEvent): void {
    event?.stopPropagation();

    if (this.isDisabled) return;

    this.isOpen = !this.isOpen;
    this.onTouched();

    if (this.isOpen) {
      setTimeout(() => {
        this.attachScrollRepositionListener();
        this.mountDropdownToBody();
        this.updateDropdownPosition();
        this.cdr.detectChanges();
      }, 0);
    } else {
      this.detachScrollRepositionListener();
      this.searchTerm = '';
    }
  }

  get filteredOptions(): MultiSelectOption[] {
    if (!this.searchTerm.trim()) return this.options;

    const term = this.searchTerm.trim().toLowerCase();

    return this.options.filter((option) => {
      const labelText = String(option.label || '').toLowerCase();
      const htmlText = this.extractTextFromHtml(option.htmlTag || '').toLowerCase();

      return labelText.includes(term) || htmlText.includes(term);
    });
  }

  get selectedOptions(): MultiSelectOption[] {
    return this.selectedItems;
  }

  get visibleSelectedOptions(): MultiSelectOption[] {
    return this.selectedOptions.slice(0, this.maxVisibleTags);
  }

  get extraSelectedCount(): number {
    return Math.max(this.selectedOptions.length - this.maxVisibleTags, 0);
  }

  isSelected(value: string | number): boolean {
    return this.selectedValues.includes(value);
  }

  toggleOption(option: MultiSelectOption): void {
    if (option.disabled || this.isDisabled) return;

    if (this.isSelected(option.value)) {
      this.selectedValues = this.selectedValues.filter(
        (v) => v !== option.value
      );

      this.selectedItems = this.selectedItems.filter(
        (i) => i.value !== option.value
      );
    } else {
      this.selectedValues = [...this.selectedValues, option.value];

      this.selectedItems = this.options.filter((o) =>
        this.selectedValues.includes(o.value)
      );
    }

    this.isOpen = true;
    this.propagateChanges();

    setTimeout(() => {
      this.mountDropdownToBody();
      this.updateDropdownPosition();
    }, 0);
  }

  removeItem(value: string | number, event: MouseEvent): void {
    event.stopPropagation();

    this.selectedValues = this.selectedValues.filter((v) => v !== value);

    this.selectedItems = this.selectedItems.filter((i) => i.value !== value);

    this.propagateChanges();
  }

  selectAll(event: MouseEvent): void {
    event.stopPropagation();

    const enabledOptions = this.filteredOptions.filter((o) => !o.disabled);

    this.selectedValues = Array.from(
      new Set([...this.selectedValues, ...enabledOptions.map((o) => o.value)])
    );

    this.selectedItems = this.options.filter((o) =>
      this.selectedValues.includes(o.value)
    );

    this.propagateChanges();

    setTimeout(() => {
      this.mountDropdownToBody();
      this.updateDropdownPosition();
    }, 0);
  }

  clearAll(event: MouseEvent): void {
    event.stopPropagation();

    this.selectedValues = [];
    this.selectedItems = [];

    this.propagateChanges();

    setTimeout(() => {
      this.mountDropdownToBody();
      this.updateDropdownPosition();
    }, 0);
  }

  propagateChanges(): void {
    this.onChange(this.selectedValues);
    this.selectionChange.emit(this.selectedValues);
    this.onTouched();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] && this.options) {
      this.selectedValues = this.selectedValues.filter((v) =>
        this.options.some((o) => this.isSameValue(o.value, v))
      );

      this.selectedItems = this.options.filter((o) =>
        this.selectedValues.some((v) => this.isSameValue(o.value, v))
      );
    }

    if (changes['label'] && !changes['label'].firstChange) {
      setTimeout(() => this.cdr.detectChanges(), 0);
    }

    if (this.isOpen) {
      setTimeout(() => {
        this.mountDropdownToBody();
        this.updateDropdownPosition();
      }, 0);
    }
  }

  private mountDropdownToBody(): void {
    const panel = this.dropdownPanel?.nativeElement;

    if (!panel || panel.parentElement === document.body) {
      return;
    }

    document.body.appendChild(panel);
  }

  private updateDropdownPosition(): void {
    if (!this.multiSelectTrigger?.nativeElement) return;

    const rect = this.multiSelectTrigger.nativeElement.getBoundingClientRect();

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const gap = 6;
    const preferredPanelHeight = 360;
    const minimumSideGap = 8;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const top = rect.bottom + gap;
    const maxHeight = Math.min(preferredPanelHeight, spaceBelow - minimumSideGap);

    // if (spaceBelow < 240 && spaceAbove > spaceBelow) {
    //   maxHeight = Math.min(preferredPanelHeight, spaceAbove - minimumSideGap);
    //   top = Math.max(minimumSideGap, rect.top - maxHeight - gap);
    // }

    const left = Math.max(minimumSideGap, rect.left);
    const width = Math.min(rect.width, viewportWidth - left - minimumSideGap);

    this.dropdownStyle = {
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      'max-height': `${Math.max(180, maxHeight)}px`,
      'z-index': '99999',
    };
  }

  private extractTextFromHtml(html: string): string {
    if (!html) return '';

    const div = document.createElement('div');
    div.innerHTML = html;

    return div.textContent || div.innerText || '';
  }

  getOptionPlainText(option: MultiSelectOption): string {
    if (!option) return '';

    if (option.htmlTag) {
      return this.extractTextFromHtml(option.htmlTag);
    }

    return option.label || '';
  }

  private isSameValue(left: any, right: any): boolean {
    if (left === right) return true;

    if (
      left === null ||
      left === undefined ||
      right === null ||
      right === undefined
    ) {
      return false;
    }

    return String(left) === String(right);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const hostElement = this.elementRef.nativeElement as HTMLElement;
    const target = event.target as Node | null;

    const eventPath =
      typeof event.composedPath === 'function' ? event.composedPath() : [];

    const dropdownEl = this.dropdownPanel?.nativeElement;

    const clickedInside =
      eventPath.includes(hostElement) ||
      (!!dropdownEl &&
        (eventPath.includes(dropdownEl) ||
          (!!target && dropdownEl.contains(target)))) ||
      (!!target && hostElement.contains(target));

    if (!clickedInside) {
      this.isOpen = false;
      this.detachScrollRepositionListener();
      this.searchTerm = '';
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.isOpen) {
      this.mountDropdownToBody();
      this.updateDropdownPosition();
    }
  }

  private attachScrollRepositionListener(): void {
    document.addEventListener('scroll', this.onScrollReposition, true);
  }

  private detachScrollRepositionListener(): void {
    document.removeEventListener('scroll', this.onScrollReposition, true);
  }

  private toBoolean(value: any, defaultValue: boolean): boolean {
    if (value === null || value === undefined) return defaultValue;

    if (typeof value === 'boolean') return value;

    if (typeof value === 'number') return value !== 0;

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      if (['false', '0', 'no', 'off', ''].includes(normalized)) {
        return false;
      }

      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
    }

    return !!value;
  }
}
