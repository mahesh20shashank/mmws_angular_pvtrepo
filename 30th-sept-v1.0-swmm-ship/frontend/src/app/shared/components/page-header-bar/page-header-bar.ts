import { Component, ChangeDetectionStrategy, input } from "@angular/core";
import { IconComponent } from "../icon/icon.component";

/**
 * Screen-level header bar: icon + title + an optional descriptor badge on the left,
 * with a projected actions slot (primary buttons, toggles, etc.) on the right.
 * Reuse this instead of hand-rolling a title row per screen.
 */
@Component({
  selector: "app-page-header-bar",
  standalone: true,
  imports: [IconComponent],
  templateUrl: "./page-header-bar.html",
  styleUrl: "./page-header-bar.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderBar {
  /** Lucide icon name shown before the title. Omit to hide the icon slot entirely. */
  readonly icon = input("");
  readonly iconVariant = input<"default" | "inherit" | "muted" | "accent" | "success" | "warning" | "danger">("accent");
  readonly title = input.required<string>();
  /** Optional pill badge after the title (e.g. a short descriptor). Omit to hide it. */
  readonly badgeText = input("");
  readonly badgeColor = input("#c9a3f7");
  readonly badgeBg = input("rgba(168,85,247,0.14)");
  readonly badgeBorder = input("rgba(168,85,247,0.35)");
}
