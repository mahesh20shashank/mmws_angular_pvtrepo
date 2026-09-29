import { Component, EventEmitter, Output, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DatePickerComponent } from '../../../shared/components';
import { IconComponent } from '../../../shared/components/icon/icon.component';

export interface DailyOrder {
  date?: string;
  description?: string;
  officer_details?: string;
  routine_details?: string;
  pdf_path?: string;
}

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

@Component({
  selector: 'app-daily-orders-history-modal',
  standalone: true,
  imports: [FormsModule, DatePickerComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full text-slate-300 w-[900px] max-w-full">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-2">
          <div class="p-1.5 rounded-md bg-white/5 border border-white/10">
            <app-icon name="file-text" [size]="18" [strokeWidth]="2" />
          </div>
          <h2 class="text-lg font-semibold text-white tracking-wide">Daily Orders History</h2>
        </div>
        <button (click)="closeModal.emit()" class="text-slate-400 hover:text-white transition-colors">
          <app-icon name="x" [size]="20" [strokeWidth]="2" />
        </button>
      </div>

      <!-- Filters -->
      <div class="mb-6">
        <div class="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
          <app-icon name="calendar" [size]="14" [strokeWidth]="2" />
          D/O Date
        </div>
        <div class="flex gap-3">
          <div class="w-[300px]">
            <app-date-picker
              [(ngModel)]="dateRange"
              label="Select Date Range..."
            ></app-date-picker>
          </div>
          <button (click)="search()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-sm font-medium transition-colors border border-slate-600 flex items-center gap-2">
            <app-icon name="search" [size]="16" [strokeWidth]="2" />
            Search
          </button>
          <button (click)="clearFilters()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
            <app-icon name="circle-x" [size]="16" [strokeWidth]="2" />
            Clear
          </button>
        </div>
      </div>

      <!-- Table Section -->
      <div class="flex-1 min-h-0 bg-slate-900/50 rounded-lg border border-white/10 flex flex-col relative">
        <!-- Table Header -->
        <div class="grid grid-cols-[1fr_120px] gap-4 p-4 border-b border-white/10 bg-black/20">
          <div class="flex items-center gap-2 text-slate-400">
            <app-icon name="table-properties" [size]="14" [strokeWidth]="2" />
            <span class="text-xs font-semibold uppercase tracking-wider">RESULTS</span>
          </div>
        </div>

        <div class="flex-1 overflow-auto p-4 flex flex-col gap-2" (scroll)="orderLeave.emit()">
            @if (filteredOrders.length === 0) {
            <div class="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                 <p class="text-sm text-slate-300">No orders found for the selected date range.</p>
            </div>
            }

            @for (order of filteredOrders; track order) {
            <div class="flex items-center justify-between p-3 rounded-md bg-white/5 border border-white/10">
                <span class="text-sm font-medium text-slate-200">{{ order.date }}</span>
                <div class="flex gap-3">
                    <button (click)="openPdf(order.pdf_path)" class="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors" title="Download PDF">
                        <app-icon name="file-text" [size]="18" [strokeWidth]="2" />
                    </button>
                    <!-- Info Button with hover events -->
                    <div class="relative" (mouseenter)="orderHover.emit({ event: $event, order: order })" (mouseleave)="orderLeave.emit()">
                        <button class="p-1.5 text-[#0ea5e9] hover:text-cyan-300 hover:bg-cyan-500/10 rounded transition-colors cursor-help">
                            <app-icon name="info" [size]="18" [strokeWidth]="2" />
                        </button>
                    </div>
                </div>
            </div>
            }
        </div>
      </div>
  `
})

export class DailyOrdersHistoryModal implements OnInit {
  @Input() dailyOrders: DailyOrder[] = [];
  @Output() closeModal = new EventEmitter<void>();
  @Output() orderHover = new EventEmitter<{ event: MouseEvent; order: DailyOrder }>();
  @Output() orderLeave = new EventEmitter<void>();

  filteredOrders: DailyOrder[] = [];
  dateRange: DateRange | null = null;

  ngOnInit() {
    this.filteredOrders = [...this.dailyOrders];
  }

  search() {
    if (!this.dateRange || (!this.dateRange.start && !this.dateRange.end)) {
      this.filteredOrders = [...this.dailyOrders];
      return;
    }

    const start = this.dateRange.start ? new Date(this.dateRange.start).getTime() : 0;
    const end = this.dateRange.end ? new Date(this.dateRange.end).getTime() : Infinity;

    this.filteredOrders = this.dailyOrders.filter(order => {
      if (!order.date) return false;
      const orderDate = new Date(order.date).getTime();
      return orderDate >= start && orderDate <= end;
    });
  }

  clearFilters() {
    this.dateRange = null;
    this.filteredOrders = [...this.dailyOrders];
  }

  openPdf(url: string | undefined) {
    if (url) {
      window.open(url, '_blank');
    }
  }
}
