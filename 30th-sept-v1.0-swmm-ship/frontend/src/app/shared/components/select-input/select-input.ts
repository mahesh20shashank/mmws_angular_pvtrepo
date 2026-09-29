import { ButtonComponent } from '../button/button.component';
import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  HostListener,
  signal,
  computed,
  forwardRef,
  input,
  effect,
  inject, OnInit, OnDestroy,
  ChangeDetectionStrategy,
  output,
  Renderer2
} from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { IconComponent } from "../icon/icon.component";

export interface DropdownOption {
  label: string;
  value: string | number | boolean;
}

@Component({
  selector: "app-select-input",
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: "./select-input.html",
  styleUrls: ["./select-input.css"],
  host: {
    '[class.glass-popup]': 'glassPopup',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectInput),
      multi: true,
    },
  ],
})
export class SelectInput implements ControlValueAccessor, OnInit, OnDestroy {
  @Input() label = "";
  @Input() placeholder = "Search...";
  @Input() glassPopup = false;
  required = input(false);
  options = input<DropdownOption[]>([]);
  @ViewChild("searchBox")
  searchBox!: ElementRef<HTMLInputElement>;
  @ViewChild("menuRef")
  menuRef!: ElementRef<HTMLElement>;
  isOpen = signal(false);
  menuTop = signal(0);
  menuLeft = signal(0);
  menuWidth = signal(0);
  searchText = signal("");
  selectedLabel = signal("");
  serverSearch = input(false);
  searchChange = output<string>();
  public static readonly openedDropdown = signal<string | null>(null);
  // dropdownId = crypto.randomUUID();
  private static nextId = 0;
  error = input(false);
  /** Red placeholder text only (no border) — the live "this is required" hint shown before the
   * user has attempted to submit. `error` is the fuller post-submit treatment (border + placeholder). */
  placeholderError = input(false);
  dropdownId = `dropdown-${SelectInput.nextId++}`;
  // dropdownId = "124";
  // A signal (not a plain field) — see the constructor's effect for why: it's the single source
  // of truth for what gets *displayed*, and needs to be a real reactive dependency so that effect
  // re-derives correctly regardless of write order relative to `options()` settling.
  value = signal<unknown>(null);
  readonly = input(false);
  /** Lets the search box's typed text become the live value even when it doesn't match any
   *  option, instead of only ever accepting a value picked from the list — a combo box, not a
   *  strict picklist. Off by default so every other existing usage of this shared component is
   *  unaffected. */
  allowCustomValue = input(false);
  /** Developed with Understanding: shows a visible search box at the top of the open menu and
   *  keeps the trigger showing the current choice, for long lists such as the 302 ship names on
   *  the Sync HRCDF page. Off by default so every other usage renders exactly as before. */
  searchInMenu = input(false);
  /** Developed with Understanding: placeholder of that search box. */
  searchPlaceholder = input("Type to search");

  readonly elementRef = inject(ElementRef);
  private readonly renderer = inject(Renderer2);
  disabledState = signal(false);

  /** Lets a parent template disable this control directly, e.g. `[disabled]="!parentField"`
   * for cascading dropdowns — independent of the ControlValueAccessor disabled state. */
  @Input()
  set disabled(value: boolean | undefined | null) {
    this.disabledState.set(!!value);
  }

  formatLabel(label: string): string {
    if (!label) {
      return '';
    }

    const formatted = label
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }


  constructor() {

    // Single source of truth for what's displayed — reactively re-derives whenever EITHER the
    // options list or the raw value changes, in either order, regardless of which one settles
    // first (e.g. a value landing on the control before its options have finished loading from
    // the API, or an options array being rebuilt from a fresh computed() after the value was
    // already set). Previously `value` was a plain class field, not a signal — reading it here
    // didn't register as a dependency, so this effect only ever re-ran when `options()` itself
    // changed reference; every call site that changed `value` (writeValue/selectOption/
    // updateSearch/clearSelection) had to separately remember to also call selectedLabel.set(...)
    // itself, and a value landing while `options()` happened to still be empty/stale had no other
    // trigger to ever re-derive the label once the real options showed up — the field looked
    // blank/unselected despite the underlying FormControl holding a real, correct value the whole
    // time. Making `value` a signal turns this into a single, always-correct reactive derivation.
    effect(() => {
      const options = this.options();
      const currentValue = this.value();

      const selected = options.find(
        option => String(option.value) === String(currentValue)
      );

      this.selectedLabel.set(selected?.label ?? this.customValueLabel());
    });

    effect(() => {
      const active = SelectInput.openedDropdown();
      const open = active === this.dropdownId;

      this.isOpen.set(open);

      if (open) {
        // Move the menu out to <body> so it's never clipped by a scrollable/overflow
        // ancestor (a table wrapper, a modal body, a page-level scroll panel, ...) —
        // the same problem Angular CDK's Overlay solves, without pulling in that
        // dependency for one component. Position is computed from the trigger's real
        // viewport rect, so `position: fixed` on the moved node lines up exactly with
        // where it would have rendered in place. Run synchronously (not deferred, unlike
        // the focus() call below) so a rapid open->close in the same tick can't race
        // openMenu()/closeMenu() out of order and strand the node under <body>.
        this.openMenu();
        setTimeout(() => {
          this.searchBox?.nativeElement?.focus();
        });
      } else {
        this.closeMenu();
      }
    });
  }

  private readonly repositionMenu = (): void => {
    if (!this.isOpen()) return;
    const trigger = this.elementRef.nativeElement.querySelector(".dropdown-trigger") as HTMLElement | null;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    this.menuTop.set(rect.bottom + 8);
    this.menuLeft.set(rect.left);
    this.menuWidth.set(rect.width);
  };

  private openMenu(): void {
    const menu = this.menuRef?.nativeElement;
    if (!menu || menu.parentElement === document.body) return;
    this.repositionMenu();
    this.renderer.appendChild(document.body, menu);
    window.addEventListener("scroll", this.repositionMenu, true);
    window.addEventListener("resize", this.repositionMenu);
  }

  private closeMenu(): void {
    const menu = this.menuRef?.nativeElement;
    window.removeEventListener("scroll", this.repositionMenu, true);
    window.removeEventListener("resize", this.repositionMenu);
    if (menu && menu.parentElement === document.body) {
      this.renderer.appendChild(this.elementRef.nativeElement.querySelector(".dropdown-wrapper"), menu);
    }
  }

  ngOnInit(): void {
    document.addEventListener(
      'close-all-select-dropdowns',
      this.handleCloseDropdown
    );
  }
  ngOnDestroy(): void {
    this.closeMenu();
    document.removeEventListener(
      'close-all-select-dropdowns',
      this.handleCloseDropdown
    );
  }
  handleCloseDropdown = () => {
    SelectInput.openedDropdown.set(null);
  };



  filteredOptions = computed(() => {
    if (this.serverSearch()) {
      return this.options();
    }
    const search = this.searchText()?.toLowerCase() || '';

    return this.options().filter((option) =>
      (option?.label ?? '').toLowerCase().includes(search)
    );
  });


  private onChange: (value: unknown) => void = () => undefined;
  private onTouched: () => void = () => undefined;



  writeValue(value: unknown): void {
    // Setting the signal alone is enough — the constructor's effect re-derives selectedLabel
    // from it (and the current options()) automatically, in a fresh reactive pass, so it stays
    // correct even if `options()` hasn't finished loading yet and only arrives later.
    this.value.set(value as DropdownOption['value'] | null);
    this.searchText.set('');
  }

  /** allowCustomValue() only: a value with no matching option is still real, hand-typed input —
   *  show it as-is instead of blanking the field out just because nothing in the list matches. */
  private customValueLabel(): string {
    const current = this.value();
    if (!this.allowCustomValue() || current == null || current === '') return '';
    return String(current);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabledState.set(isDisabled);
  }
  toggleDropdown(): void {
    if (this.disabledState() || this.readonly()) {
      return;
    }
    if (SelectInput.openedDropdown() === this.dropdownId) {
      SelectInput.openedDropdown.set(null);
    } else {
      SelectInput.openedDropdown.set(this.dropdownId);
    }
  }

  updateSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.searchText.set(value);

    if (this.serverSearch()) {
      this.searchChange.emit(value);
    }

    // Every keystroke commits as the live value — selectOption() below still wins if the user
    // goes on to actually click a real option (fires after this, overwrites it), but nothing
    // typed is lost just because it never matched one. `value` being a signal means setting it
    // here is enough on its own — the constructor's effect picks it up and re-derives
    // selectedLabel itself, same as writeValue()/selectOption()/clearSelection().
    if (this.allowCustomValue()) {
      this.value.set(value);
      this.onChange(value);
    }
  }

  selectOption(option: DropdownOption): void {
    if (this.disabledState() || this.readonly()) {
      return;
    }
    this.value.set(option.value);
    this.onChange(option.value);
    this.onTouched();
    this.searchText.set("");
    // this.isOpen.set(false);
    SelectInput.openedDropdown.set(null);
  }

  clearSelection(event: MouseEvent): void {
    event.stopPropagation();

    if (this.disabledState() || this.readonly()) {
      return;
    }

    this.value.set(null);
    this.searchText.set('');

    this.onChange(null);
    this.onTouched();

    SelectInput.openedDropdown.set(null);
  }

  preventClose(event: Event): void {
    event.stopPropagation();
  }

  @HostListener("document:click", ["$event"])
  closeDropdown(event: MouseEvent): void {
    // Developed with Understanding: the open menu lives under <body>, so a click in its search
    // box is outside this host. With searchInMenu that click must not close the menu.
    if (this.searchInMenu() && this.menuRef?.nativeElement?.contains(event.target as Node)) {
      return;
    }
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      if (SelectInput.openedDropdown() === this.dropdownId) {
        SelectInput.openedDropdown.set(null);
      }
    }
  }
}
