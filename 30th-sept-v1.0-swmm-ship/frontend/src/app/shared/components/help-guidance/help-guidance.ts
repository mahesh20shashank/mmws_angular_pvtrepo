import { ButtonComponent } from '../button/button.component';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, input, signal } from "@angular/core";
import { IconComponent } from "../icon/icon.component";

/**
 * Collapsible "Help & Guidance" panel — reusable across every module (Inventory OBS/MO/WED, Ship
 * Crew, and beyond). Content is entirely caller-driven via `bodyHtml`; this component owns no
 * per-module knowledge, just the collapse/expand chrome.
 */
@Component({
  selector: "app-help-guidance",
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: "./help-guidance.html",
  styleUrl: "./help-guidance.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class HelpGuidance {
  /** Developer-authored guidance markup (not user input) — Angular sanitizes [innerHTML] by default. */
  readonly bodyHtml = input<string>("");
  readonly expanded = signal(false);

  toggle(): void {
    this.expanded.update((value) => !value);
  }
}
