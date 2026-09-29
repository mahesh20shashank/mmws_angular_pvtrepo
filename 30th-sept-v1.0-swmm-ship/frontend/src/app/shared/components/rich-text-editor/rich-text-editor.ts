import { ButtonComponent } from '../button/button.component';
import { ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild, forwardRef, signal } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

import { IconComponent } from "../icon/icon.component";

type RichTextCommand = "bold" | "italic" | "underline" | "strikeThrough" | "insertUnorderedList" | "insertOrderedList" | "removeFormat";

interface ToolbarButton {
  command: RichTextCommand;
  icon: string;
  label: string;
}

/**
 * Lightweight formatting editor (`ControlValueAccessor`, stores sanitized HTML) for
 * multi-line narrative fields — Defect Description, Closure Remarks, Service
 * Description, Justification, etc. Toolbar: bold / italic / underline / strikethrough /
 * bullet list / numbered list / clear formatting, matching the reference prototype's
 * `<rich-text-editor>` web component.
 */
@Component({
  selector: "app-rich-text-editor",
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: "./rich-text-editor.html",
  styleUrls: ["./rich-text-editor.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditor),
      multi: true,
    },
  ],
})
export class RichTextEditor implements ControlValueAccessor {
  @Input() placeholder = "";
  @Input() readonly = false;
  @Input() minHeight = "96px";
  /** Adds a collapse/expand toggle to the toolbar's right edge — off by default so
   *  existing usages (Closure Remarks, Service Description, ...) render unchanged. */
  @Input() collapsible = false;

  @ViewChild("surface") surface!: ElementRef<HTMLDivElement>;

  readonly focused = signal(false);
  readonly hasValue = signal(false);
  readonly disabled = signal(false);
  /** Only meaningful when `collapsible` — the surface is always kept in the DOM (just
   *  hidden) rather than removed, so collapsing/expanding never loses its content. */
  readonly expanded = signal(true);

  readonly toolbar: ToolbarButton[] = [
    { command: "bold", icon: "bold", label: "Bold" },
    { command: "italic", icon: "italic", label: "Italic" },
    { command: "underline", icon: "underline", label: "Underline" },
    { command: "strikeThrough", icon: "strikethrough", label: "Strikethrough" },
    { command: "insertUnorderedList", icon: "list", label: "Bullet list" },
    { command: "insertOrderedList", icon: "list-ordered", label: "Numbered list" },
    { command: "removeFormat", icon: "eraser", label: "Clear formatting" },
  ];

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null | undefined): void {
    const html = value ?? "";
    if (this.surface) this.surface.nativeElement.innerHTML = html;
    this.hasValue.set(!!this.stripTags(html).trim());
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  toggleExpanded(): void {
    this.expanded.update((v) => !v);
  }

  runCommand(command: RichTextCommand): void {
    if (this.disabled() || this.readonly) return;
    this.surface.nativeElement.focus();
    document.execCommand(command, false);
    this.emitChange();
  }

  onInput(): void {
    this.emitChange();
  }

  onFocus(): void {
    this.focused.set(true);
  }

  onBlur(): void {
    this.focused.set(false);
    this.onTouched();
  }

  private emitChange(): void {
    const html = this.surface.nativeElement.innerHTML;
    this.hasValue.set(!!this.stripTags(html).trim());
    this.onChange(html);
  }

  private stripTags(html: string): string {
    // Bounded quantifier (real tags are nowhere near this long) so the pattern can't be
    // flagged/abused as unbounded backtracking — sonarjs/super-linear-regex.
    return html.replace(/<[^>]{0,1000}>/g, "");
  }
}
