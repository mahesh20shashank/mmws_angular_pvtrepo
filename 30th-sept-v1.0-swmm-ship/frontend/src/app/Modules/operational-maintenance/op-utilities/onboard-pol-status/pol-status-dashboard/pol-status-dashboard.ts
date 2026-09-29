import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ColDef } from 'ag-grid-community';
import { MasterCard } from '../../../../refit-maintenance/master-card/master-card';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { GridStatusChipRenderer } from '../../../../../shared/components/data-grid/grid-status-chip-renderer';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { PolStatusDashboardApiService } from '../../services/pol-status-dashboard-api.service';
import {
  ChartSlot,
  SlotMeta,
  SoundingRow,
  TankCategoryOption,
  TankDashboardResponse,
  TankEditState,
  TankItem,
  TooltipState,
} from '../../models/pol-status-dashboard.model';

const SLOT_META: SlotMeta[] = [
  { icon: 'fuel', accent: 'text-amber-400', iconBg: 'bg-amber-400/15 text-amber-400' },
  { icon: 'plane', accent: 'text-emerald-400', iconBg: 'bg-emerald-400/15 text-emerald-400' },
  { icon: 'droplet', accent: 'text-pink-400', iconBg: 'bg-pink-400/15 text-pink-400' },
  { icon: 'waves', accent: 'text-violet-400', iconBg: 'bg-violet-400/15 text-violet-400' },
];

const Y_AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1];

function formatLastUpdated(date: string | null, time: string | null): string {
  if (!date) return 'No Record';
  return time ? `${date} ${time}` : date;
}

function toTankItem(raw: TankDashboardResponse['graphs'][number]['tanks'][number]): TankItem {
  const fillPercent = raw.c100 > 0 ? Math.round((raw.T / raw.c100) * 1000) / 10 : 0;
  return {
    id: raw.sno,
    name: raw.n,
    capacity100: raw.c100,
    capacity95: raw.c95,
    sounding: raw.mm,
    held: raw.T,
    fillPercent,
    status: fillPercent >= 90 ? 'GOOD' : 'LOW',
    lastUpdated: formatLastUpdated(raw.d, raw.ti),
  };
}

/** Wraps a tank name onto up to 3 short lines for the label under its bar — mirrors
 *  Django's formatTankNameLabel (tank_main_page.html). */
function formatNameLines(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= 2) return words;
  const line3 = words.slice(2, 4).join(' ') + (words.length > 4 ? '…' : '');
  return [words[0], words[1], line3];
}

function toChartSlot(raw: TankDashboardResponse['graphs'][number]): ChartSlot {
  const tanks = raw.tanks.map(toTankItem).sort((a, b) => a.held - b.held);
  return {
    slot: raw.slot,
    categoryId: raw.category_id,
    tankType: raw.category_name,
    tanks,
    maxCapacity: Math.max(...tanks.map((t) => t.capacity100), 0.001),
    count: raw.summary.count,
    total95: raw.summary.total_95,
    totalHeld: raw.summary.total_held,
    filledPct: raw.summary.filled_pct,
    topupPct: raw.summary.topup_pct,
  };
}

@Component({
  selector: 'app-pol-status-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, MasterCard, IconComponent, ModalComponent, DataGrid, ButtonComponent],
  templateUrl: './pol-status-dashboard.html',
  styleUrl: './pol-status-dashboard.css',
})
export class PolStatusDashboard implements OnInit {
  private readonly toastr = inject(NotificationService);
  private readonly api = inject(PolStatusDashboardApiService);

  /** Lets the parent (OnboardPolStatus) switch to the Tank Masters tab when the
   *  user clicks through an empty chart slot's "add a record" prompt. */
  @Output() readonly goToTankMasters = new EventEmitter<void>();

  readonly yAxisTicks = Y_AXIS_TICKS;
  readonly slotMeta = SLOT_META;
  readonly formatNameLines = formatNameLines;

  chartSlots: ChartSlot[] = [];
  /** Categories not occupying any of the 4 slots right now — from the dashboard response. */
  unassignedCategories: TankCategoryOption[] = [];

  openSlotSwitcher: number | null = null;

  ngOnInit(): void {
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.api.getDashboard().subscribe((res) => {
      this.chartSlots = res.graphs.map(toChartSlot);
      this.unassignedCategories = res.unassigned_categories;
    });
  }

  openDetailsForSlot(slot: ChartSlot): void {
    this.selectedGroup = slot;
  }

  /** Categories this slot could switch to: its own current category plus anything
   *  not currently occupying a slot. */
  availableForSlot(slotIndex: number): TankCategoryOption[] {
    const slot = this.chartSlots[slotIndex];
    const current: TankCategoryOption[] = slot?.categoryId != null ? [{ id: slot.categoryId, tank_category: slot.tankType }] : [];
    return [...current, ...this.unassignedCategories];
  }

  toggleSlotSwitcher(slotIndex: number): void {
    this.openSlotSwitcher = this.openSlotSwitcher === slotIndex ? null : slotIndex;
  }

  switchSlotCategory(slotIndex: number, category: TankCategoryOption): void {
    this.openSlotSwitcher = null;
    this.api.reassignGraphSlot({ graph_slot: (slotIndex + 1) as 1 | 2 | 3 | 4, new_category_id: category.id }).subscribe(() => {
      this.loadDashboard();
    });
  }

  remainingTo95(tank: TankItem): number {
    return Math.round((tank.capacity95 - tank.held) * 10) / 10;
  }

  isOverLimit(tank: TankItem): boolean {
    return tank.capacity95 > 0 && tank.held >= tank.capacity95;
  }

  hoverTooltip: TooltipState | null = null;

  onTankHover(event: MouseEvent, tank: TankItem): void {
    this.hoverTooltip = { x: event.clientX + 14, y: event.clientY + 14, tank };
  }

  onTankMove(event: MouseEvent): void {
    if (!this.hoverTooltip) return;
    this.hoverTooltip = { ...this.hoverTooltip, x: event.clientX + 14, y: event.clientY + 14 };
  }

  onTankLeave(): void {
    this.hoverTooltip = null;
  }

  editingTank: TankEditState | null = null;

  openTankEdit(tank: TankItem, categoryId: number | null): void {
    const now = new Date();
    this.editingTank = {
      categoryId,
      tank,
      soundingMm: null,
      computedTons: null,
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 5),
    };
  }

  closeTankEdit(): void {
    this.editingTank = null;
  }

  onEditSoundingChange(): void {
    const editing = this.editingTank;
    if (!editing || editing.soundingMm == null) {
      if (editing) editing.computedTons = null;
      return;
    }
    this.api.getCalibrationLookup(editing.tank.id, editing.soundingMm).subscribe((res) => {
      if (this.editingTank === editing) editing.computedTons = res.calculated_tone;
    });
  }

  saveSingleSounding(): void {
    const editing = this.editingTank;
    if (!editing?.soundingMm) {
      this.toastr.warning('Enter a sounding value.');
      return;
    }
    const reading = `${editing.date}T${editing.time}:00`;
    this.api
      .bulkSaveSounding([
        { tank_id: editing.tank.id, sounding_mm: editing.soundingMm, during_ras_ton: editing.computedTons, reading_time: reading },
      ])
      .subscribe(() => {
        this.loadDashboard();
        this.closeTankEdit();
      });
  }

  selectedGroup: ChartSlot | null = null;

  readonly tankDetailColumnDefs: ColDef[] = [
    { headerName: 'S/N', valueGetter: (params) => (params.node ? params.node.rowIndex! + 1 : ''), flex: 1, minWidth: 70 },
    { headerName: 'Tank Nomenclature', field: 'name', flex: 1, minWidth: 160 },
    { headerName: '100% Cap (T)', field: 'capacity100', flex: 1, minWidth: 120 },
    { headerName: '95% Cap (T)', field: 'capacity95', flex: 1, minWidth: 120 },
    { headerName: 'Sounding (mm)', field: 'sounding', flex: 1, minWidth: 130 },
    { headerName: 'Held (T)', field: 'held', flex: 1, minWidth: 110 },
    { headerName: 'Fill %', field: 'fillPercent', flex: 1, minWidth: 100, valueFormatter: (p) => `${p['value']}%` },
    {
      headerName: 'Status',
      field: 'status',
      flex: 1,
      minWidth: 110,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { GOOD: 'success', LOW: 'warning' } },
    },
  ];

  showSoundingModal = false;
  soundingDate = '';
  soundingTime = '';
  soundingCategoryId: number | null = null;
  soundingRows: SoundingRow[] = [];

  closeDetails(): void {
    this.selectedGroup = null;
  }

  /** All categories known to the dashboard right now — the 4 assigned slots plus
   *  whatever's unassigned — for the "Add Sounding" modal's Tank Type dropdown. */
  get categoryOptions(): TankCategoryOption[] {
    const assigned = this.chartSlots
      .filter((s): s is ChartSlot & { categoryId: number } => s.categoryId != null)
      .map((s) => ({ id: s.categoryId, tank_category: s.tankType }));
    return [...assigned, ...this.unassignedCategories];
  }

  /** `presetCategoryId` mirrors Django's per-chart "Add Sounding" button, which opens
   *  the same modal pre-filtered to that chart's category (openSoundingModal(category_id)). */
  openSoundingModal(presetCategoryId?: number | null): void {
    this.showSoundingModal = true;
    this.soundingDate = '';
    this.soundingTime = '';
    this.soundingCategoryId = presetCategoryId ?? null;
    this.soundingRows = [];
    if (this.soundingCategoryId != null) this.onTankTypeChange();
  }

  closeSoundingModal(): void {
    this.showSoundingModal = false;
  }

  onTankTypeChange(): void {
    if (this.soundingCategoryId == null) {
      this.soundingRows = [];
      return;
    }
    this.api.getTanksByType(this.soundingCategoryId).subscribe((res) => {
      this.soundingRows = res.results.map((t) => ({
        tankId: t.id,
        tank_name: t.tank_name,
        limit_mm: t.limiting_sounding,
        start_ras: t.latest_tonnes,
        sounding_mm: null,
        during_ras: null,
      }));
    });
  }

  calculateDuringRas(row: SoundingRow): void {
    if (row.sounding_mm == null) {
      row.during_ras = null;
      return;
    }
    this.api.getCalibrationLookup(row.tankId, row.sounding_mm).subscribe((res) => {
      row.during_ras = res.calculated_tone;
    });
  }

  submitSounding(): void {
    const items = this.soundingRows
      .filter((r) => r.sounding_mm != null)
      .map((r) => ({
        tank_id: r.tankId,
        sounding_mm: r.sounding_mm as number,
        during_ras_ton: r.during_ras,
        reading_time: `${this.soundingDate}T${this.soundingTime}:00`,
      }));
    if (!items.length) {
      this.toastr.warning('Enter at least one sounding value.');
      return;
    }
    this.api.bulkSaveSounding(items).subscribe(() => {
      this.loadDashboard();
      this.closeSoundingModal();
    });
  }

  saveSoundingData(): void {
    this.submitSounding();
  }
}
