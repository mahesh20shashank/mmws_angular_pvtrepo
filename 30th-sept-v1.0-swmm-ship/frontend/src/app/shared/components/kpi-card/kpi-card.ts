import { ButtonComponent } from '../button/button.component';
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { CountUpDirective } from '../count-up/count-up.directive';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, IconComponent, CountUpDirective, RouterLink, ButtonComponent],
  templateUrl: './kpi-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./kpi-card.css']
})
export class KpiCard {

  @Input() cardHeight = '24.50rem';
  @Input() showDetailArrow = false;
  @Output() detailClick = new EventEmitter<void>();
  @Output() periodChange = new EventEmitter<string>();
  @Input() title = '';
  /** Optional single-line caption shown under the title (e.g. "Active as of today"). */
  @Input() description = '';
  /** Optional top-border accent colour (e.g. '#0095ff') — omit for the plain card. */
  @Input() accentColor = '';
  @Input() count = 0;
  @Input() iconColor = '#9b7fe8';
  @Input() trendData: Record<string, string> = {};
  @Input() showTimelineTab = true;
  @Input() showTrends = true;
  @Input() selectedPeriod = 'all';

  @Input() trendDetails: Record<string, unknown> = {};
  /** Lucide icon name (preferred). */
  @Input() iconName = '';
  /** @deprecated Legacy raw SVG path, kept only for API-driven data that still
   *  sends a path instead of an icon name (e.g. the SFD overview KPI feed).
   *  Prefer `iconName` for anything client-controlled. */
  @Input() iconPath = '';
  @Input() iconBg = '';
  @Input() trendUp = true;
  @Input() displayValue: string | number = '';
  @Input() accentPills = false;
  @Input() showViewMore = false;
  /** Route for an optional "View More" pill link shown in the bottom row (in place of
   *  the timeline tabs/trend, which most "View More" consumers disable). Omit to hide it. */
  @Input() viewMoreRoute: string | null = null;
  @Input() viewMoreLabel = 'View More';
  /** `left` (default) — icon beside the count at the top, this app's usual KPI layout.
   *  `right` — count/title/bottom-row stacked on the left, icon badge on the right. */
  @Input() iconPosition: 'left' | 'right' = 'left';


  @Input() timelineOptions = [
    { key: 'all', label: 'ALL' },
    { key: '6m', label: '6M' },
    { key: '1y', label: '1Y' },
    { key: '2y', label: '2Y' }
  ];



  showTrandDetailedModal = false;

  changeTab(tab: string): void {
    this.selectedPeriod = tab;
    this.periodChange.emit(tab);
  }

  get activeTab(): string {
    return this.selectedPeriod;
  }

  get currentTrend(): string {
    return this.trendData?.[this.activeTab] || '+0%';
  }

  /** Numeric value behind `currentTrend` (e.g. "+12.5%" -> 12.5, "-3%" -> -3, "0%" -> 0). */
  get trendValue(): number {
    const match = this.currentTrend.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
  }

  get trendState(): 'up' | 'down' | 'neutral' {
    if (this.trendValue === 0) return 'neutral';
    return this.trendValue > 0 ? 'up' : 'down';
  }

  get trendColor(): string {
    if (this.trendState === 'neutral') return 'var(--text-muted)';
    return this.trendState === 'up' ? '#22c55e' : '#F82C36';
  }

  get trendPoints(): string {
    if (this.trendState === 'neutral') return '2,7 22,7';
    return this.trendState === 'up' ? '2,12 8,6 13,9 22,2' : '2,2 8,8 13,5 22,12';
  }

  get displayCount(): string | number {
    return this.displayValue !== '' && this.displayValue !== null && this.displayValue !== undefined
      ? this.displayValue
      : this.count;
  }

  onHoverOnTrendPercentage(): void {
    this.showTrandDetailedModal = true;
  }

  onLeaveMouseOnTrendPercentae(): void {
    this.showTrandDetailedModal = false;
  }

  onDetailClick(event: MouseEvent): void {
    event.stopPropagation();
    this.detailClick.emit();
  }
}
