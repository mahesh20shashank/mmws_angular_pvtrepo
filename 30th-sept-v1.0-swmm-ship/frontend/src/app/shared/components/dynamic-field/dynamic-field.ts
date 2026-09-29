import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";

import { DropdownOption, SelectInput } from "../select-input/select-input";
import { InputField } from "../input-field/input-field";
import { FileInput } from "../file-input/file-input";
import { RichTextEditor } from "../rich-text-editor/rich-text-editor";
import { IconComponent } from "../icon/icon.component";

export type DynamicFieldKind = "select" | "text" | "number" | "date" | "radio" | "editor" | "auto" | "file";

/** Where a field's value comes from — drives the small source badge next to its label
 * (green for `User`-entered, amber for anything system/master/context sourced). */
export type DynamicFieldBadgeTone = "user" | "system";

/**
 * Render-ready description of one form field, produced by a feature's own field-spec
 * config (e.g. `opm-actions-fields.config.ts`) and rendered by `<app-dynamic-field>`.
 * One shape covers every field kind so a whole reason-driven/category-driven form can
 * be built by mapping an array of specs, instead of hand-writing per-field markup.
 */
export interface DynamicFieldSpec {
  key: string;
  label: string;
  kind: DynamicFieldKind;
  required?: boolean;
  /** Small badge next to the label (e.g. "User", "SFD", "System", "Master"). */
  badge?: string;
  badgeTone?: DynamicFieldBadgeTone;
  placeholder?: string;
  /** `select` kind only. */
  options?: DropdownOption[];
  /** `radio` kind only — defaults to `['Yes', 'No']`. */
  radioOptions?: string[];
  /** `date` kind only — native `min` attribute (e.g. today's ISO date for "must be future"). */
  minDate?: string;
  /** Short italic note shown after the label (e.g. "equipment-linked", "defaults to homeport"). */
  hint?: string;
  /** `auto` / read-only display kind — the value to show. */
  displayValue?: string;
  readonly?: boolean;
}

/**
 * One field of a spec-driven dynamic form: label + source badge + mandatory asterisk +
 * the right control for `spec().kind`, plus the shared error row. Used across every
 * reason/category-driven field grid (OPM Actions' Digital Defect Book, Raise RA,
 * Guarantee, and any future feature with the same "array of field specs" shape).
 */
@Component({
  selector: "app-dynamic-field",
  standalone: true,
  imports: [ReactiveFormsModule, SelectInput, InputField, FileInput, RichTextEditor, IconComponent],
  templateUrl: "./dynamic-field.html",
  styleUrls: ["./dynamic-field.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicField {
  readonly spec = input.required<DynamicFieldSpec>();
  readonly control = input.required<FormControl>();
  readonly submitAttempted = input(false);

  readonly invalid = computed(() => this.submitAttempted() && this.control().invalid);
  readonly badgeColor = computed(() => (this.spec().badgeTone === "user" ? "#22C55E" : "#F59E0B"));
  readonly radioOptions = computed(() => this.spec().radioOptions ?? ["Yes", "No"]);
  readonly inputType = computed<"text" | "number" | "date">(() => {
    const kind = this.spec().kind;
    return kind === "number" || kind === "date" ? kind : "text";
  });

  pickRadio(option: string): void {
    const control = this.control();
    if (control.disabled) return;
    control.setValue(option);
    control.markAsDirty();
  }
}
