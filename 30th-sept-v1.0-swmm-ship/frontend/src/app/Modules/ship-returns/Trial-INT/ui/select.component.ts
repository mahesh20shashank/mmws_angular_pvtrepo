import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Injector,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  afterNextRender,
  forwardRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject, Subscription, of } from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  switchMap,
  map,
} from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';

export interface SelectOption {
  label: string;
  htmlTag?: string;
  value: any;
  isTrigger?: boolean;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true,
    },
  ],
  styles: [`
    .select-option {
      color: var(--text-primary) !important;
      transition: background-color 0.15s ease;
    }
    .select-option:hover {
      background-color: var(--bg-nav-child-hover);
    }
    .select-option.is-selected {
      background-color: var(--bg-nav-child-hover);
      font-weight: 500;
    }
    .select-option-label {
      color: var(--text-primary) !important;
    }
  `],
  template: `
       <div class="relative w-full">
      <!-- SELECT TRIGGER -->
      <div
        #selectTrigger
        class="relative flex h-[45px] w-full cursor-pointer items-center rounded-[10px] pl-4 pr-10 transition"
        [ngClass]="triggerStateClasses"
        [class.opacity-60]="disabled"
        [class.pointer-events-none]="disabled"
        (click)="toggle($event)"
      >
        <label *ngIf="label" class="pointer-events-none absolute left-4 right-10 truncate transition-all duration-200" [ngClass]="labelStateClasses">
          {{ label }}
          <span *ngIf="required" class="text-red-500">*</span>
        </label>

        <div class="flex min-w-0 flex-1 flex-wrap gap-2" [class.pt-3]="label">
          <span
            *ngIf="hasSelectedOption"
            class="truncate text-sm text-[var(--text-primary)]"
          >
            {{ selectedLabel }}
          </span>
          <span
            *ngIf="!hasSelectedOption && !label"
            class="truncate text-sm text-[var(--text-muted)]"
          >
            {{ placeholder }}
          </span>
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
         class="absolute left-0 right-0 z-50 flex flex-col overflow-hidden rounded-md border border-[var(--border-dropdown)] bg-[var(--bg-dropdown)] text-[var(--text-primary)] shadow-xl"
        [ngClass]="panelClass"
        [ngStyle]="dropdownStyle"
        (mousedown)="$event.stopPropagation()"
        (click)="$event.stopPropagation()"
      >
         <div *ngIf="searchable" class="border-b border-[var(--border-dropdown)] bg-[var(--bg-input)] p-2">
          <input
            type="text"
            class="w-full bg-transparent border-none outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            [(ngModel)]="searchTerm"
            placeholder="Search…"
            (click)="$event.stopPropagation()"
            (ngModelChange)="onSearchChange()"
          />
        </div>

        <div class="overflow-y-auto py-1" [style.maxHeight.px]="dropdownMaxHeight">
          <div
            *ngIf="isLoading"
           class="px-3 py-5 text-center text-sm text-[var(--text-muted)]"
          >
            Loading…
          </div>

          <ng-container *ngIf="!isLoading">
            <div
              *ngFor="let option of displayedOptions"
              class="select-option flex cursor-pointer items-center gap-2 px-3 py-2 text-sm"
              [class.is-selected]="isSameValue(optionValue(option), value)"
              (click)="select(option)"
            >
              <span
                 class="h-2 w-2 shrink-0 rounded-full bg-[#1069AB] opacity-0"
                 [class.opacity-100]="isSameValue(optionValue(option), value)"
              ></span>
              <span class="select-option-label flex-1" *ngIf="option.htmlTag" [innerHTML]="option.htmlTag"></span>
              <span class="select-option-label flex-1" *ngIf="!option.htmlTag"> {{ optionLabel(option) }}</span>
            </div>

            <div
              *ngIf="displayedOptions.length === 0"
               class="px-3 py-6 text-center text-sm text-[var(--text-muted)]"
            >
              No options found
            </div>
          </ng-container>
        </div>
      </div>
    </div>
  `,
})
export class SelectComponent
  implements ControlValueAccessor, OnInit, OnChanges, OnDestroy
{
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  @ViewChild('selectTrigger') selectTrigger!: ElementRef<HTMLElement>;
  @ViewChild('dropdownPanel') dropdownPanel?: ElementRef<HTMLElement>;

  @Input() options: SelectOption[] = [];
  @Input() placeholder = '--Select--';
  @Input() label = '';
  @Input() required = false;
  @Input() searchable = true;
  @Input() disabled = false;

  @Input() apiUrl = '';

  @Input() labelKey = 'label';
  @Input() valueKey = 'value';

  @Input() minSearchLength = 1;

  /** When `top`, panel opens above the trigger (use for fields near the bottom of modals). */
  @Input() dropdownPlacement: 'auto' | 'top' | 'bottom' = 'auto';

  /** Optional extra class on the portaled dropdown panel. */
  @Input() panelClass = '';

  @Output() valueChange = new EventEmitter<any>();

  isOpen = false;
  isLoading = false;

  /** Floating-label field surface: border/background per open state. */
  get triggerStateClasses(): string {
    return this.isOpen
      ? 'border border-[var(--accent-light,#61c2ff)] bg-[var(--bg-input)]'
      : 'border border-[var(--border-input)] bg-[var(--bg-input)]';
  }

  /** Floating-label position: raised when open or a value is already selected. */
  get labelStateClasses(): string {
    return this.isOpen || this.hasSelectedOption
      ? 'top-[3px] text-[11px] text-[var(--text-muted)]'
      : 'top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]';
  }

  searchTerm = '';
  value: any = '';

  displayedOptions: any[] = [];
  selectedOption: SelectOption | null = null;

  dropdownStyle: Record<string, string> = {};
  dropdownMaxHeight = 260;
  dropdownOpensUpward = false;

  private readonly onScrollReposition = () => {
    if (!this.isOpen) return;

    requestAnimationFrame(() => this.scheduleDropdownPositionUpdate(false));
  };

  private searchSubject = new Subject<string>();
  private subscription = new Subscription();

  private onChange = (value: any) => {};
  private onTouched = () => {};

  ngOnInit(): void {
    this.displayedOptions = [...this.options];
    this.initSearchStream();
    this.syncSelectedOption();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      if (!this.useRemoteSearch) {
        this.displayedOptions = this.filterLocalOptions(this.searchTerm);
      }

      this.syncSelectedOption();
    }

    if (changes['label'] && !changes['label'].firstChange) {
      setTimeout(() => this.cdr.detectChanges(), 0);
    }
  }

  ngOnDestroy(): void {
    this.detachScrollRepositionListener();
    this.subscription.unsubscribe();
  }

  get useRemoteSearch(): boolean {
    return !!this.apiUrl?.trim();
  }

  private initSearchStream(): void {
    const sub = this.searchSubject
      .pipe(
        distinctUntilChanged(),
        switchMap((term: string) => {
          if (this.useRemoteSearch) {
            return this.searchFromApi(term);
          }

          return of(this.filterLocalOptions(term));
        })
      )
      .subscribe((result: SelectOption[]) => {
        this.displayedOptions = result;
        this.isLoading = false;

        if (this.isOpen) {
          this.scheduleDropdownPositionUpdate();
        }
      });

    this.subscription.add(sub);
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchTerm);
  }

  private filterLocalOptions(term: string): SelectOption[] {
    const search = term.trim().toLowerCase();

    if (!search) return [...this.options];

    return this.options.filter((option) => {
      const labelText = String(option.label || '').toLowerCase();

      const htmlText = this.extractTextFromHtml(
        option.htmlTag || ''
      ).toLowerCase();

      return labelText.includes(search) || htmlText.includes(search);
    });
  }

  private searchFromApi(term: string) {
    const search = term.trim();

    if (search.length < this.minSearchLength) {
      this.isLoading = false;
      return of([]);
    }

    this.isLoading = true;

    const finalUrl = `${this.apiUrl}${encodeURIComponent(search)}`;

    return this.http.get<any>(environment.apiUrl + finalUrl).pipe(
      map((response) => this.normalizeApiResponse(response)),
      catchError((error) => {
        console.error('Select search API error:', error);
        this.isLoading = false;
        return of([]);
      })
    );
  }

  private normalizeApiResponse(response: any): SelectOption[] {
    let data: any[] = [];

    if (Array.isArray(response)) {
      data = response;
    } else if (Array.isArray(response?.results)) {
      data = response.results;
    } else if (Array.isArray(response?.data)) {
      data = response.data;
    }

    return data.map((item: any) => ({
      label: item?.[this.labelKey] ?? item?.label ?? '',
      htmlTag: item?.htmlTag ?? item?.html_tag ?? undefined,
      value: item?.[this.valueKey] ?? item?.value ?? '',
    }));
  }

  toggle(event?: MouseEvent): void {
    event?.stopPropagation();

    if (this.disabled) return;

    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      if (this.useRemoteSearch) {
        if (this.searchTerm.trim().length >= this.minSearchLength) {
          this.searchSubject.next(this.searchTerm);
        } else {
          this.displayedOptions = [];
        }
      } else {
        this.displayedOptions = this.filterLocalOptions(this.searchTerm);
      }

      this.scheduleDropdownPositionUpdate();
    } else {
      this.detachScrollRepositionListener();
      this.resetDropdown();
    }
  }

  select(option: SelectOption): void {
    if (this.disabled) return;

    this.value = this.optionValue(option);
    this.selectedOption = option;

    this.onChange(this.value);
    this.valueChange.emit(this.value);
    this.onTouched();

    this.isOpen = false;
    this.detachScrollRepositionListener();

    this.searchTerm = '';
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  clearSelection(event?: MouseEvent): void {
    event?.stopPropagation();

    if (this.disabled) return;

    this.value = '';
    this.selectedOption = null;

    this.onChange(this.value);
    this.valueChange.emit(this.value);
    this.onTouched();

    this.isOpen = false;
    this.detachScrollRepositionListener();

    this.resetDropdown();
  }

  writeValue(value: any): void {
    this.value = value;
    this.syncSelectedOption();
    this.cdr.markForCheck();
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.isOpen = false;
    this.detachScrollRepositionListener();
    this.isLoading = false;
    this.cdr.markForCheck();
  }

  private syncSelectedOption(): void {
    if (
      this.value === null ||
      this.value === undefined ||
      this.value === ''
    ) {
      this.selectedOption = null;
      return;
    }

    const matchedOption =
      this.options.find((o) => this.isSameValue(this.optionValue(o), this.value)) ||
      this.displayedOptions.find((o) =>
        this.isSameValue(this.optionValue(o), this.value)
      ) ||
      null;

    this.selectedOption = matchedOption;
  }

  private resetDropdown(): void {
    this.searchTerm = '';
    this.isLoading = false;

    if (!this.useRemoteSearch) {
      this.displayedOptions = [...this.options];
    } else {
      this.displayedOptions = [];
    }
  }

  private attachScrollRepositionListener(): void {
    document.addEventListener('scroll', this.onScrollReposition, true);
  }

  private detachScrollRepositionListener(): void {
    document.removeEventListener('scroll', this.onScrollReposition, true);
  }

  private scheduleDropdownPositionUpdate(attachListener = true): void {
    afterNextRender(
      () => {
        if (!this.isOpen) return;

        if (attachListener) {
          this.attachScrollRepositionListener();
        }

        this.mountDropdownToBody();
        this.updateDropdownPosition();
        this.cdr.detectChanges();

        requestAnimationFrame(() => {
          if (!this.isOpen) return;
          this.mountDropdownToBody();
          this.updateDropdownPosition();
          this.cdr.detectChanges();
        });
      },
      { injector: this.injector },
    );
  }

  private getTriggerRect(): DOMRect {
    const trigger = this.selectTrigger?.nativeElement;
    const host = this.host.nativeElement;

    const rect = trigger?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return rect;
    }

    return host.getBoundingClientRect();
  }

  /** Escape backdrop-filter/transform containing blocks from parent layout. */
  private mountDropdownToBody(): void {
    const panel = this.dropdownPanel?.nativeElement;

    if (!panel || panel.parentElement === document.body) {
      return;
    }

    document.body.appendChild(panel);
  }

  private updateDropdownPosition(): void {
    const rect = this.getTriggerRect();
    if (!rect.width && !rect.height) return;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const gap = 6;
    const minGap = 8;
    const preferredListHeight = 260;
    const minListHeight = 120;
    const searchHeight = this.searchable ? 48 : 0;

    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - minGap);
    const spaceAbove = Math.max(0, rect.top - minGap);

    let openUpward = false;
    if (this.dropdownPlacement === 'top') {
      openUpward = true;
    } else if (this.dropdownPlacement === 'bottom') {
      openUpward = false;
    } else {
      const preferredTotal = preferredListHeight + searchHeight + gap;
      openUpward =
        spaceBelow < preferredTotal &&
        (spaceAbove > spaceBelow || spaceBelow < minListHeight + searchHeight);
    }

    this.dropdownOpensUpward = openUpward;

    const availableSpace = openUpward
      ? spaceAbove - gap - searchHeight
      : spaceBelow - gap - searchHeight;

    const listMaxHeight = Math.min(
      preferredListHeight,
      Math.max(minListHeight, availableSpace),
    );

    let left = rect.left;
    const width = Math.max(
      rect.width,
      this.host.nativeElement.getBoundingClientRect().width,
    );

    if (left + width > viewportWidth - minGap) {
      left = viewportWidth - width - minGap;
    }

    if (left < minGap) {
      left = minGap;
    }

    this.dropdownMaxHeight = listMaxHeight;

    if (openUpward) {
      this.dropdownStyle = {
        position: 'fixed',
        left: `${left}px`,
        width: `${width}px`,
        bottom: `${viewportHeight - rect.top + gap}px`,
        top: 'auto',
        zIndex: '99999',
      };
      return;
    }

    this.dropdownStyle = {
      position: 'fixed',
      top: `${rect.bottom + gap}px`,
      left: `${left}px`,
      width: `${width}px`,
      bottom: 'auto',
      zIndex: '99999',
    };
  }

  private extractTextFromHtml(html: string): string {
    if (!html) return '';

    const div = document.createElement('div');

    div.innerHTML = html;

    return div.textContent || div.innerText || '';
  }

  @HostListener('document:mousedown', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (this.disabled) return;

    const hostElement = this.host.nativeElement as HTMLElement;

    const target = event.target as Node | null;

    const eventPath =
      typeof event.composedPath === 'function'
        ? event.composedPath()
        : [];

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
      this.resetDropdown();
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.isOpen) {
      this.scheduleDropdownPositionUpdate(false);
    }
  }

  get selectedLabel(): string {
    if (this.selectedOption) return this.optionLabel(this.selectedOption);

    const option =
      this.options.find((o) => this.isSameValue(this.optionValue(o), this.value)) ??
      this.displayedOptions.find((o) => this.isSameValue(this.optionValue(o), this.value));

    return this.optionLabel(option);
  }

  get hasSelectedOption(): boolean {
    return (
      this.options.some((o) =>
        this.isSameValue(this.optionValue(o), this.value)
      ) ||
      this.displayedOptions.some((o) =>
        this.isSameValue(this.optionValue(o), this.value)
      )
    );
  }

  isSameValue(left: any, right: any): boolean {
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

  optionValue(option: any): any {
    return option?.[this.valueKey] ?? option?.value;
  }

  optionLabel(option: any): string {
    return String(option?.[this.labelKey] ?? option?.label ?? '');
  }
}
