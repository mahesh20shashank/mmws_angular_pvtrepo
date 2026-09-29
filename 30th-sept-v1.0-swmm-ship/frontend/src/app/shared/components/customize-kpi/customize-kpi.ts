import { ButtonComponent } from '../button/button.component';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  inject
} from '@angular/core';
import { KpiPanelService } from '../../../Core/services/kpi/kpi-panel.service';
import { IconComponent } from '../icon/icon.component';

/**
 * Minimal shape the panel needs from a KPI. Consumers may pass richer objects;
 * the component is generic so it re-emits exactly the type it was given.
 */
export interface KpiOption {
  title: string;
  count?: number | string;
  trendData?: Record<string, string>;
  /** Optional icon styling for the row swatch — usually assigned client-side
   *  by the caller (see the SFD overview screen) so it matches the KPI card. */
  iconColor?: string;
  iconBg?: string;
  /** Lucide icon name (preferred). */
  iconName?: string;
  /** @deprecated Legacy raw SVG path, kept only for API-driven data that still
   *  sends a path instead of an icon name (e.g. the SFD overview KPI feed). */
  iconPath?: string;
}

import { ModalComponent } from '../modal/modal.component';

@Component({
  selector: 'app-customize-kpi',
  standalone: true,
  imports: [IconComponent, ButtonComponent, ModalComponent],
  templateUrl: './customize-kpi.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './customize-kpi.css'
})
export class CustomizeKpi<T extends KpiOption = KpiOption> implements OnChanges, OnInit, OnDestroy {

  private readonly kpiPanel = inject(KpiPanelService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() kpis: T[] = [];

  @Input() isOpen = false;
  @Input() top = 0;
  @Input() left = 0;
  /** When true, this host keeps the shared "Customize KPIs" button visible
   *  but greyed out / non-clickable — for pages with a fixed KPI set. */
  @Input() disabled = false;

  @Output() selectedChange = new EventEmitter<T[]>();
  @Output() closeModal = new EventEmitter<void>();
  @Output() open = new EventEmitter<void>();

  /** Max KPIs that can be shown at once. Configurable so the panel stays
   *  reusable across pages with different KPI counts. */
  @Input() maxSelection = 5;
  @Input() padToMax = true;

  /** Shown when the user tries to select beyond `maxSelection`. */
  showLimitWarning = false;
  private warnTimer?: ReturnType<typeof setTimeout>;

  defaultTitles: string[] = [];
  selectedTitles: string[] = [];
  get atMaxSelection(): boolean {
    return this.selectedTitles.length >= this.maxSelection;
  }

  ngOnInit(): void {
    queueMicrotask(() => {
      this.kpiPanel.registerHost();
      if (this.disabled) this.kpiPanel.setHostDisabled(true);
    });
  }

  ngOnDestroy(): void {
    this.clearLimitWarning();
    this.kpiPanel.unregisterHost();
    if (this.disabled) this.kpiPanel.setHostDisabled(false);
  }

  ngOnChanges(changes: SimpleChanges): void {

    if (
      changes['kpis'] &&
      this.kpis.length > 0 &&
      this.selectedTitles.length === 0
    ) {

      this.selectedTitles = this.kpis
        .slice(0, this.maxSelection)
        .map(kpi => kpi.title);

      this.defaultTitles = [...this.selectedTitles];

      this.emitSelected();
    }
  }

  /** Close and apply nothing — reverts to the last applied selection. */
  closePopup(): void {
    this.selectedTitles = [...this.defaultTitles];
    this.clearLimitWarning();
    this.closeModal.emit();
    this.kpiPanel.close();
  }

  toggleKpi(title: string): void {

    if (this.selectedTitles.includes(title)) {

      this.selectedTitles =
        this.selectedTitles.filter(item => item !== title);
      this.clearLimitWarning();

    } else {

      if (this.atMaxSelection) {
        this.triggerLimitWarning();
        return;
      }

      this.selectedTitles = [
        ...this.selectedTitles,
        title
      ];
      this.clearLimitWarning();
    }
  }

  private triggerLimitWarning(): void {
    this.showLimitWarning = true;
    if (this.warnTimer) {
      clearTimeout(this.warnTimer);
    }
    this.warnTimer = setTimeout(() => {
      this.showLimitWarning = false;
      this.warnTimer = undefined;
      this.cdr.markForCheck();
    }, 3000);
  }

  private clearLimitWarning(): void {
    this.showLimitWarning = false;
    if (this.warnTimer) {
      clearTimeout(this.warnTimer);
      this.warnTimer = undefined;
    }
  }

  /** Trend badge value for a KPI row — prefers the "all" period. */
  trendFor(kpi: T): string {
    const trend = kpi?.trendData;
    if (!trend) {
      return '';
    }
    return trend['all'] ?? trend['6m'] ?? Object.values(trend)[0] ?? '';
  }

  isNegativeTrend(kpi: T): boolean {
    return this.trendFor(kpi).trim().startsWith('-');
  }

  applySelection(): void {

    const finalSelection = [...this.selectedTitles];

    if (this.padToMax) {
      while (finalSelection.length < this.maxSelection) {

        const nextKpi = this.kpis.find(
          k => !finalSelection.includes(k.title)
        );

        if (!nextKpi) {
          break;
        }

        finalSelection.push(nextKpi.title);
      }
    }

    const selected = this.kpis.filter(kpi =>
      finalSelection.includes(kpi.title)
    );

    this.selectedTitles = finalSelection;
    // Remember the applied selection so a later Cancel reverts to it.
    this.defaultTitles = [...finalSelection];
    this.clearLimitWarning();

    this.selectedChange.emit(selected);

    this.closeModal.emit();
    this.kpiPanel.close();
  }

  emitSelected(): void {

    const selected = this.kpis.filter(kpi =>
      this.selectedTitles.includes(kpi.title)
    );

    this.selectedChange.emit(selected);
  }

  isChecked(title: string): boolean {
    return this.selectedTitles.includes(title);
  }

  isDisabled(title: string): boolean {

    return (
      !this.selectedTitles.includes(title) &&
      this.selectedTitles.length >= this.maxSelection
    );
  }
}
