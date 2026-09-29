import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { NotificationService } from '../../../../Core/services/notification/notification.service';

interface SpareRow {
  pattern: string;
  desc: string;
  qtyIssued: string;
  qtyHeld: string;
  denom: string;
  issueDate: string;
  issuedTo: string;
  invType: string;
  crp: string;
  authority: string;
}

const UNMAPPED_SPARES: SpareRow[] = [
  { pattern: 'PT-4471-A', desc: 'Ball Bearing 6205-2RS', qtyIssued: '2', qtyHeld: '6', denom: 'Nos', issueDate: '20-Jun-2026', issuedTo: 'PO(ME) Ramesh K', invType: 'Naval Store', crp: 'Consumable', authority: 'DT-87 / DMD-2026-0442' },
  { pattern: 'PT-2288-C', desc: 'Mechanical Seal Kit 45mm', qtyIssued: '1', qtyHeld: '2', denom: 'Set', issueDate: '19-Jun-2026', issuedTo: 'PO(ME) Ramesh K', invType: 'Naval Store', crp: 'Returnable', authority: 'DT-87 / DMD-2026-0439' },
  { pattern: 'PT-9017-B', desc: 'Gasket, Flange DN65', qtyIssued: '4', qtyHeld: '12', denom: 'Nos', issueDate: '18-Jun-2026', issuedTo: 'LME Suresh P', invType: 'Weapon Store', crp: 'Consumable', authority: 'DT-87 / DMD-2026-0431' },
  { pattern: 'PT-3355-A', desc: 'O-Ring Set, Nitrile', qtyIssued: '1', qtyHeld: '8', denom: 'Set', issueDate: '16-Jun-2026', issuedTo: 'LME Suresh P', invType: 'Naval Store', crp: 'Consumable', authority: 'DT-87 / DMD-2026-0420' },
];

/**
 * Digital Defect Book — Spare Details panel + "Add Spares" modal, shown when the
 * host form's "Spares Used / Spare Required" field is Yes. Self-contained: owns its
 * own selection/saved-spares state, so any reason form (As&As / ABER / Defect) can
 * drop it in with just `[show]`.
 */
@Component({
  selector: 'app-spare-details',
  standalone: true,
  imports: [ButtonComponent, IconComponent, ModalComponent],
  templateUrl: './spare-details.html',
  styleUrl: './spare-details.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpareDetails {
  private readonly notification = inject(NotificationService);

  /** Whether "Spares Used / Spare Required" is Yes on the host form — controls whether the panel renders. */
  readonly show = input(false);

  readonly spareRows = UNMAPPED_SPARES;
  readonly isSpareModalOpen = signal(false);
  readonly spareSelection = signal<string[]>([]);
  readonly spareIssuedFilter = signal('');
  readonly savedSpares = signal<SpareRow[]>([]);

  readonly spareIssuedOptions = computed(() => Array.from(new Set(this.spareRows.map((r) => r.issuedTo))));
  readonly filteredSpareRows = computed(() => {
    const f = this.spareIssuedFilter();
    return f ? this.spareRows.filter((r) => r.issuedTo === f) : this.spareRows;
  });

  openSpareModal(): void {
    this.spareSelection.set(this.savedSpares().map((s) => s.pattern));
    this.spareIssuedFilter.set('');
    this.isSpareModalOpen.set(true);
  }

  closeSpareModal(): void {
    this.isSpareModalOpen.set(false);
  }

  toggleSpare(pattern: string): void {
    this.spareSelection.update((sel) => (sel.includes(pattern) ? sel.filter((p) => p !== pattern) : [...sel, pattern]));
  }

  isSpareSelected(pattern: string): boolean {
    return this.spareSelection().includes(pattern);
  }

  saveSpares(): void {
    const selection = this.spareSelection();
    if (!selection.length) {
      this.notification.info('Select one or more spares to map');
      return;
    }

    this.savedSpares.set(this.spareRows.filter((r) => selection.includes(r.pattern)));
    this.isSpareModalOpen.set(false);
    this.notification.success(`${selection.length} spare${selection.length > 1 ? 's' : ''} mapped to this transaction`);
  }

  removeSavedSpare(pattern: string): void {
    this.savedSpares.update((list) => list.filter((s) => s.pattern !== pattern));
  }
}
