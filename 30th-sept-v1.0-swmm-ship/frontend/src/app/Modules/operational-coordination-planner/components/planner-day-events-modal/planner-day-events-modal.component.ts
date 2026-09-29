import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Activity, CAT_COLOR } from '../../constants/data';
import { PlannerNavigationService } from '../../services/planner-navigation.service';
import { PlannerStore } from '../../store/planner.store';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';

@Component({
  selector: 'app-day-events-modal',
  standalone: true,
  imports: [CommonModule, ModalComponent],
  template: `
    @if (store.dayEventsModalOpen()) {
      <app-modal (closeModal)="close()" [title]="'Events for ' + (store.dayEventsModalDate() | date:'MMM dd, yyyy')" size="md">
        <div class="events-list pt-0">
          @for (event of store.dayEventsModalActivities(); track event.id) {
            <div class="event-item" (click)="selectEvent(event)">
              <div class="event-main">
                <div class="event-title">{{ event.title }}</div>
                @if (event.t) {
                  <div class="event-time">{{ event.t }}</div>
                }
              </div>
              <div class="event-category" [style.background]="getCategoryColor(event)">
                {{ event.cat }}
              </div>
            </div>
          }
        </div>
      </app-modal>
    }
  `,
  styles: [`
    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center;
      z-index: 9999;
    }
    .modal-content {
      background: #1f2937; border-radius: 12px; width: 90%; max-width: 450px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      max-height: 80vh; display: flex; flex-direction: column;
    }
    .modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px; border-bottom: 1px solid #374151;
      flex-shrink: 0;
    }
    .modal-header h2 {
      margin: 0; font-size: 18px; font-weight: 600; color: #f3f4f6;
    }
    .close-btn {
      background: none; border: none; font-size: 28px; cursor: pointer; color: #9ca3af;
      padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
      border-radius: 4px; transition: all 0.2s;
    }
    .close-btn:hover {
      background: #374151; color: #f3f4f6;
    }
    .events-list {
      overflow-y: auto; padding: 12px 16px;
      flex: 1;
    }
    .event-item {
      padding: 12px 14px; margin-bottom: 10px; background: #374151; border-radius: 8px;
      cursor: pointer; transition: all 0.2s; border-left: 4px solid #6366f1;
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
    }
    .event-item:hover {
      background: #4b5563; transform: translateX(4px);
    }
    .event-main {
      flex: 1; min-width: 0;
    }
    .event-title {
      color: #f3f4f6; font-size: 14px; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .event-time {
      color: #9ca3af; font-size: 12px; margin-top: 2px;
    }
    .event-category {
      padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;
      color: white; white-space: nowrap; flex-shrink: 0;
    }
  `]
})
export class DayEventsModalComponent {
  protected readonly store = inject(PlannerStore);
  private readonly navService = inject(PlannerNavigationService);

  close() {
    this.store.closeDayEventsModal();
  }

  selectEvent(event: Activity) {
    if (!this.navService.navigateToRecord(event)) {
      this.store.selectActivity(event.id);
    }
    this.close();
  }

  getCategoryColor(event: Activity): string {
    return CAT_COLOR[event.cat] || '#94a3b8';
  }
}
