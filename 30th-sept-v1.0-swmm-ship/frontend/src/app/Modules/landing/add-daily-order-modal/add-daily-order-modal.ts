import { Component, EventEmitter, Output, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { Call } from '../../../Core/http/services/call';

@Component({
  selector: 'app-add-daily-order-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="daily-order-modal flex flex-col h-full text-slate-300 w-[700px] max-w-full">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <h2 class="text-sm font-semibold text-white">Add Daily Order</h2>
        <button (click)="closeModal.emit()" class="text-slate-400 hover:text-white transition-colors">
          <app-icon name="x" [size]="20" [strokeWidth]="2" />
        </button>
      </div>

      <div class="flex flex-col gap-6">

        <!-- Type Selection -->
        <div>
          <label for="label" class="block text-xs font-medium text-slate-400 mb-2">Select Daily Order Type</label>
          <div class="flex items-center gap-6">
            <label for="label" class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="orderType" value="single" [(ngModel)]="orderType" (ngModelChange)="onOrderTypeChange()" class="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-600 focus:ring-2">
              <span class="text-sm">Single Day</span>
            </label>
            <label for="label" class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="orderType" value="multiple" [(ngModel)]="orderType" (ngModelChange)="onOrderTypeChange()" class="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-600 focus:ring-2">
              <span class="text-sm">Multiple Day</span>
            </label>
          </div>
        </div>

        <!-- Date & Upload -->
        <div class="grid grid-cols-2 gap-4">
          @if (orderType === 'single') { <div>
            <label for="label" class="block text-xs font-medium text-slate-400 mb-1.5">Date <span class="text-red-500">*</span></label>
            <input type="date" [(ngModel)]="singleDate" [min]="today" (ngModelChange)="onSingleDateChange()" class="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors">
          </div> }
          @if (orderType === 'multiple') { <div>
            <label for="label" class="block text-xs font-medium text-slate-400 mb-1.5">Date Range <span class="text-red-500">*</span></label>
            <div class="grid grid-cols-2 gap-2">
              <input type="date" [(ngModel)]="rangeStartDate" [min]="today" (ngModelChange)="onRangeStartDateChange()" class="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors">
              <input type="date" [(ngModel)]="rangeEndDate" [min]="rangeStartDate || today" (ngModelChange)="onRangeDateChange()" class="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors">
            </div>
          </div> }

          <div>
            <label for="label" class="block text-xs font-medium text-slate-400 mb-1.5">Upload Document (PDF) <span class="text-red-500">*</span></label>
            <div class="flex items-center border border-slate-700 rounded-md overflow-hidden bg-slate-900/50 h-[38px]">
              <button type="button" (click)="fileInput.click()" class="px-4 py-2 bg-slate-700/50 text-sm text-slate-300 hover:bg-slate-600/50 transition-colors border-r border-slate-700 h-full whitespace-nowrap flex-shrink-0">Choose File</button>
              <span class="px-3 text-sm text-slate-400 truncate">{{ selectedFile?.name || 'No file chosen' }}</span>
              <input #fileInput type="file" accept="application/pdf" class="hidden" (change)="onFileSelected($event)">
            </div>
          </div>
        </div>

        <!-- Allocation Section -->
        <div>
          <h3 class="text-xs font-medium text-white mb-4">Officer & Routine Allocation <span class="text-red-500">*</span></h3>

          <div class="flex flex-col gap-4">
             @if (orderType === 'single') {
             <div class="grid gap-4 items-end grid-cols-[1fr_1fr]">
                <div>
                  <label for="label" class="block text-xs font-medium text-slate-400 mb-1.5">Officer of the Day <span class="text-red-500">*</span></label>
                  <select [(ngModel)]="selectedOfficerId" class="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors appearance-none">
                    <option value="" disabled>-- Select Officer --</option>
                    @for (officer of officerOptions(); track officer.id) {
                    <option [value]="officer.id">{{ officer.name }}</option>
                    }
                  </select>
                </div>

                <div>
                  <label for="label" class="block text-xs font-medium text-slate-400 mb-1.5">Routine <span class="text-red-500">*</span></label>
                  <select [(ngModel)]="selectedRoutine" class="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors appearance-none">
                   <option value="" disabled>-- Select Routine --</option>
                    @for (routine of routineOptions(); track routine) {
                    <option [value]="routine">{{ routine }}</option>
                    }
                  </select>
                </div>
             </div>
             } @else {
             @for (allocationDate of (allocationDates.length ? allocationDates : ['']); track allocationDate) {
             <div class="grid gap-4 items-end grid-cols-[100px_1fr_1fr]">
                <div>
                  <label for="label" class="block text-xs font-medium text-slate-400 mb-1.5">Date</label>
                  <div class="flex items-center gap-1.5 text-sm font-medium text-white">
                    <app-icon name="calendar" [size]="14" [strokeWidth]="2" />
                    {{ allocationDate ? formatDateLabel(allocationDate) : 'Select date range' }}
                  </div>
                </div>

                <div>
                  <label for="label" class="block text-xs font-medium text-slate-400 mb-1.5">Officer of the Day <span class="text-red-500">*</span></label>
                  <select [(ngModel)]="allocationSelections[allocationDate].officerId" class="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors appearance-none">
                    <option value="" disabled>-- Select Officer --</option>
                    @for (officer of officerOptions(); track officer.id) {
                    <option [value]="officer.id">{{ officer.name }}</option>
                    }
                  </select>
                </div>

                <div>
                  <label for="label" class="block text-xs font-medium text-slate-400 mb-1.5">Routine <span class="text-red-500">*</span></label>
                  <select [(ngModel)]="allocationSelections[allocationDate].routine" class="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors appearance-none">
                   <option value="" disabled>-- Select Routine --</option>
                    @for (routine of routineOptions(); track routine) {
                    <option [value]="routine">{{ routine }}</option>
                    }
                  </select>
                </div>
             </div>
             }
             }
          </div>
        </div>

        <!-- Description -->
        <div>
          <label for="label" class="block text-xs font-medium text-slate-400 mb-1.5">Description <span class="text-red-500">*</span></label>
          <textarea rows="3" [(ngModel)]="description" class="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors resize-none"></textarea>
        </div>

      </div>

      @if (saveError()) {
      <p class="mt-3 errorClass">{{ saveError() }}</p>
      }

      <!-- Footer Buttons -->
      <div class="mt-1 flex justify-end gap-3">
        <button (click)="closeModal.emit()" class="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-sm font-medium transition-colors">
          Cancel
        </button>
        <button (click)="saveOrder()" [disabled]="saving()" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white rounded-md text-sm font-medium transition-colors">
          {{ saving() ? 'Saving...' : 'Save Order' }}
        </button>
      </div>

    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    select {
      background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
      background-position: right 0.5rem center;
      background-repeat: no-repeat;
      background-size: 1.5em 1.5em;
    }

    .daily-order-modal input[type="date"] {
      color-scheme: light;
    }

    .daily-order-modal input[type="date"]::-webkit-calendar-picker-indicator {
      filter: invert(1);
      cursor: pointer;
    }

    :host-context([data-theme="light"]) .daily-order-modal {
      color: var(--text-primary) !important;
    }

    :host-context([data-theme="light"]) .daily-order-modal .text-slate-300,
    :host-context([data-theme="light"]) .daily-order-modal .text-slate-200,
    :host-context([data-theme="light"]) .daily-order-modal .text-slate-400 {
      color: var(--text-muted) !important;
    }

    :host-context([data-theme="light"]) .daily-order-modal :not(button).text-white {
      color: var(--text-primary) !important;
    }

    :host-context([data-theme="light"]) .daily-order-modal input,
    :host-context([data-theme="light"]) .daily-order-modal textarea,
    :host-context([data-theme="light"]) .daily-order-modal select {
      background-color: var(--bg-input) !important;
      border-color: var(--border-input) !important;
      color: var(--text-primary) !important;
      color-scheme: light;
    }

    :host-context([data-theme="light"]) .daily-order-modal input[type="date"]::-webkit-calendar-picker-indicator {
      filter: none;
    }

    :host-context([data-theme="light"]) .daily-order-modal .border-slate-700 {
      border-color: var(--border-input) !important;
    }

    :host-context([data-theme="light"]) .daily-order-modal .bg-slate-700\\/50,
    :host-context([data-theme="light"]) .daily-order-modal .bg-slate-900\\/50,
    :host-context([data-theme="light"]) .daily-order-modal .bg-slate-900 {
      background-color: var(--bg-input) !important;
    }

    :host-context([data-theme="light"]) .daily-order-modal button.bg-slate-600 {
      background-color: #e2e8f0 !important;
      color: var(--text-primary) !important;
    }

    :host-context([data-theme="light"]) .daily-order-modal button.bg-slate-600:hover,
    :host-context([data-theme="light"]) .daily-order-modal button.bg-slate-700\\/50:hover {
      background-color: #cbd5e1 !important;
    }
    :host-context([data-theme="light"]) .daily-order-modal button.bg-blue-500,
    :host-context([data-theme="light"]) .daily-order-modal button.bg-blue-600 {
      color: #fff !important;
    }

    .errorClass{
      color: #dc2626;
      font-size: 0.8rem;
    }

  `]
})
export class AddDailyOrderModal implements OnInit {
  private readonly call = inject(Call);

  readonly today = new Date().toLocaleDateString('en-CA');

  @Output() closeModal = new EventEmitter<void>();
  @Output() orderSaved = new EventEmitter<void>();
  orderType: 'single' | 'multiple' = 'single';

  singleDate = '';
  rangeStartDate = '';
  rangeEndDate = '';

  readonly officerOptions = signal<DutyRosterOption[]>([]);
  readonly routineOptions = signal<string[]>([]);
  readonly saving = signal(false);
  readonly saveError = signal('');

  allocationDates: string[] = [];
  allocationSelections: Record<string, { officerId: string; routine: string }> = {
    '': { officerId: '', routine: '' },
  };
  selectedFile: File | null = null;
  selectedOfficerId = '';
  selectedRoutine = '';
  description = '';

  ngOnInit(): void {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    this.singleDate = this.toIsoDate(tomorrow);
    this.rangeStartDate = this.toIsoDate(tomorrow);
    this.rangeEndDate = this.toIsoDate(dayAfterTomorrow);
    this.refreshAllocationDates();

    this.loadDutyRosters();
    this.loadRoutines();
  }

  private toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onOrderTypeChange(): void {
    if (this.orderType === 'single') {
      this.rangeStartDate = '';
      this.rangeEndDate = '';
    } else {
      this.singleDate = '';
    }

    this.refreshAllocationDates();
  }

  onSingleDateChange(): void {
    this.refreshAllocationDates();
  }

  /** Mirrors upcoming-event-modal: clear a now-invalid end date when the start date moves past it. */
  onRangeStartDateChange(): void {
    if (this.rangeEndDate && this.rangeEndDate < this.rangeStartDate) {
      this.rangeEndDate = '';
    }
    this.refreshAllocationDates();
  }

  onRangeDateChange(): void {
    this.refreshAllocationDates();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;

    this.selectedFile = file?.type === 'application/pdf' ? file : null;
    this.saveError.set(file && !this.selectedFile ? 'Please select a PDF document.' : '');
  }

  private buildAllocations(): { date: string; officerName: string; routine: string }[] | null {
    const allocations: { date: string; officerName: string; routine: string }[] = [];

    if (this.orderType === 'single') {
      if (this.singleDate && this.singleDate < this.today) {
        this.saveError.set('Past dates are not allowed.');
        return null;
      }
      const officer = this.officerOptions().find((option) => option.id === this.selectedOfficerId);
      if (!this.singleDate || !officer || !this.selectedRoutine) {
        this.saveError.set('Complete all required fields before saving the daily order.');
        return null;
      }
      allocations.push({ date: this.singleDate, officerName: officer.name, routine: this.selectedRoutine });
    } else {
      if (this.rangeStartDate && this.rangeStartDate < this.today) {
        this.saveError.set('Past dates are not allowed.');
        return null;
      }
      if (!this.allocationDates.length) {
        this.saveError.set('Complete all required fields before saving the daily order.');
        return null;
      }
      for (const date of this.allocationDates) {
        const selection = this.allocationSelections[date];
        const officer = this.officerOptions().find((option) => option.id === selection?.officerId);
        if (!officer || !selection?.routine) {
          this.saveError.set(`Select an Officer of the Day and Routine for ${this.formatDateLabel(date)}.`);
          return null;
        }
        allocations.push({ date, officerName: officer.name, routine: selection.routine });
      }
    }

    return allocations;
  }

  async saveOrder(): Promise<void> {
    if (!this.selectedFile || !this.description.trim()) {
      this.saveError.set('Complete all required fields before saving the daily order.');
      return;
    }

    const allocations = this.buildAllocations();
    if (!allocations) {
      return;
    }

    this.saving.set(true);
    this.saveError.set('');

    try {
      if (this.orderType === 'single') {
        const allocation = allocations[0];
        const payload = new FormData();
        payload.append('filename', this.selectedFile.name);
        payload.append('source', 'daily order');
        payload.append('pdf_path', this.selectedFile);
        payload.append('roster_name', allocation.officerName);
        payload.append('from_date', allocation.date);
        payload.append('to_date', allocation.date);
        payload.append('description', this.description.trim());
        payload.append('date', allocation.date);
        payload.append('date1', allocation.date);
        payload.append('date2', allocation.date);
        payload.append('officer_details', allocation.officerName);
        payload.append('routine_details', allocation.routine);

        await firstValueFrom(this.call.saveDailyOrder(payload));
      } else {
        const payload = new FormData();
        payload.append('filename', this.selectedFile.name);
        payload.append('pdf_path', this.selectedFile);
        payload.append('description', this.description.trim());
        payload.append(
          'allocations',
          JSON.stringify(
            allocations.map((a) => ({
              date: a.date,
              officer_details: a.officerName,
              routine_details: a.routine,
            }))
          )
        );

        await firstValueFrom(this.call.saveDailyOrders(payload));
      }
      this.orderSaved.emit();
      this.closeModal.emit();
    } catch {
      this.saveError.set('Unable to save the daily order. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  formatDateLabel(value: string): string {
    if (!value) {
      return '';
    }

    const date = new Date(value + 'T00:00:00');

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private async loadDutyRosters(): Promise<void> {
    try {
      const response = await firstValueFrom(this.call.getDutyRosters());
      const source = Array.isArray(response)
        ? response
        : (response as { results?: unknown[] })?.results ?? [];

      if (!Array.isArray(source)) {
        this.officerOptions.set([]);
        return;
      }

      this.officerOptions.set(
        source
          .map((item, index) => {
            const roster = item as {
              id?: number | string;
              roster_name?: string;
              firstname?: string;
              lastname?: string;
            };

            const fname = typeof roster.firstname === 'string' ? roster.firstname.trim() : '';
            const lname = typeof roster.lastname === 'string' ? roster.lastname.trim() : '';
            const rosterName = typeof roster.roster_name === 'string' ? roster.roster_name.trim() : '';

            const fullName = [fname, lname].filter((s) => s.length > 0).join(' ') || rosterName;
            const optionId = String(roster.id ?? (fullName || index));

            return {
              id: optionId,
              name: fullName,
            };
          })
          .filter((roster) => roster.id.length > 0 && roster.name.length > 0),
      );
    } catch {
      this.officerOptions.set([]);
    }
  }

  private async loadRoutines(): Promise<void> {
    try {
      const response = await firstValueFrom(this.call.getRoutines());
      const routines = Array.isArray(response?.routines) ? response.routines : [];
      this.routineOptions.set(routines);
    } catch {
      this.routineOptions.set([]);
    }
  }

  private refreshAllocationDates(): void {
    if (this.orderType === 'single') {
      this.allocationDates = this.singleDate ? [this.singleDate] : [];
      this.syncAllocationSelections();
      return;
    }

    if (!this.rangeStartDate || !this.rangeEndDate) {
      this.allocationDates = [];
      this.syncAllocationSelections();
      return;
    }

    const start = new Date(this.rangeStartDate + 'T00:00:00');
    const end = new Date(this.rangeEndDate + 'T00:00:00');

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      this.allocationDates = [];
      this.syncAllocationSelections();
      return;
    }

    const dates: string[] = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      const year = cursor.getFullYear();
      const month = String(cursor.getMonth() + 1).padStart(2, '0');
      const day = String(cursor.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
      cursor.setDate(cursor.getDate() + 1);
    }

    this.allocationDates = dates;
    this.syncAllocationSelections();
  }

  private syncAllocationSelections(): void {
    const next: Record<string, { officerId: string; routine: string }> = {
      '': { officerId: '', routine: '' },
    };

    for (const date of this.allocationDates) {
      next[date] = this.allocationSelections[date] ?? { officerId: '', routine: '' };
    }

    this.allocationSelections = next;
  }
}

interface DutyRosterOption {
  id: string;
  name: string;
}
