import { ButtonComponent } from '../button/button.component';
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from "@angular/core";
import { IconComponent } from "../icon/icon.component";
import { CountUpDirective } from "../count-up/count-up.directive";


export interface DrawerStat {
  value: string | number;
  label: string;
  color?: string;
}

/**
 * Right-side slide-over drawer. Header (icon + label + value + subtitle + close)
 * and an optional stat-chip row are built in; the caller projects the body
 * (breakdown bars, lists, etc.) through the default slot. Reused by every
 * screen that needs a contextual detail panel (KPI breakdown, record detail).
 */
@Component({
  selector: "app-detail-drawer",
  standalone: true,
  imports: [IconComponent, CountUpDirective, ButtonComponent],
  templateUrl: "./detail-drawer.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./detail-drawer.css"],
})
export class DetailDrawer {
  @Input() open = false;
  @Input() label = "";
  @Input() value: string | number = "";
  @Input() subtitle = "";
  /** Lucide icon name (preferred). */
  @Input() iconName = "";
  /** @deprecated Legacy raw SVG path, kept only for API-driven data that still
   *  sends a path instead of an icon name (e.g. the SFD overview KPI feed).
   *  Prefer `iconName` for anything client-controlled. */
  @Input() iconPath = "";
  @Input() iconColor = "var(--icon-accent)";
  @Input() iconBg = "rgba(0,136,255,0.16)";
  @Input() stats: DrawerStat[] = [];
  @Input() sectionTitle = "";
  @Input() sectionHint = "";
  /** Wider panel (~1040px) for content-heavy drawers (e.g. Equipment History) instead of the
   * default 440px slide-over used for compact KPI-breakdown drawers. */
  @Input() wide = false;
  /** When set, the header renders `label` as a plain bold title (no big `value` number) and
   * `subtitle` as its only supporting line — for drawers that aren't built around one KPI value. */
  @Input() titleMode = false;
  /** Optional pill shown top-right of the header, next to Close (e.g. "Read-only"). */
  @Input() badgeText = "";
  @Input() badgePosition: "top-right" | "above-title" = "top-right";
  @Input() badgeColor = "";

  @Output() closed = new EventEmitter<void>();

  close(): void {
    this.closed.emit();
  }
}
