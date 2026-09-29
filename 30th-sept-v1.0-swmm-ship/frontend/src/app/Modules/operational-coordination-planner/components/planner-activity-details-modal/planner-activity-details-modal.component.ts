import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { addDays, CAT_LABEL } from '../../constants/data';
import { PlannerNavigationService } from '../../services/planner-navigation.service';
import { PlannerStore } from '../../store/planner.store';
import { IconComponent } from '../planner-icon/planner-icon.component';

const NA = 'N/A';

/**
 * Compact "Details" popup shown when an activity is clicked - the quick-glance
 * equivalent of the mock (Equipment / Due Date / Routine / Section / Category /
 * Created By / Frequency / Last Completion / Maintop No). The Activity model
 * doesn't carry most of those fields yet (no backend support), so anything
 * missing renders as "N/A" rather than being invented.
 *
 * The expand button switches to the fuller read-only side panel
 * (`app-detail`) for activities that need the richer linked-info/coordination
 * view already built there.
 */
@Component({
  selector: 'app-activity-details-modal',
  standalone: true,
  imports: [IconComponent, ButtonComponent, ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './planner-activity-details-modal.component.scss',
  templateUrl: './planner-activity-details-modal.component.html',
})
export class ActivityDetailsModalComponent {
  protected readonly store = inject(PlannerStore);
  private readonly navService = inject(PlannerNavigationService);
  protected readonly a = this.store.selectedActivity;

  protected readonly dueDate = computed(() => {
    const activity = this.a();
    if (!activity) return null;
    const d = addDays(this.store.rangeStart(), activity.day);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  protected readonly categoryLabel = computed(() => CAT_LABEL[this.a()?.cat ?? ''] ?? NA);
  protected readonly equipment = computed(() => this.a()?.equipment || null);
  protected readonly section = computed(() => this.a()?.loc || null);
  protected readonly routineName = computed(() => this.a()?.title || null);
  protected readonly maintopNo = computed(() => this.a()?.ref || null);

  protected readonly showRedirect = computed(() => {
    const activity = this.a();
    if (!activity) return false;
    const type = activity.type || activity.cat;
    return [
      'routine', 'routine_dart', 'planned_routine',
      'db_defect', 'dart_raised', 'dart_closed', 'defect',
    ].includes(type);
  });
  protected readonly isEvent = this.store.selectedIsEvent;
  protected readonly isManual = this.store.selectedIsManual;
  protected readonly canEdit = this.store.selectedCanEdit;
  protected readonly canCancel = this.store.selectedCanCancel;

  protected close(): void {
    this.store.clearSelection();
  }

  protected expand(): void {
    const activity = this.a();
    if (!activity) return;
    if (!this.navService.navigateToRecord(activity)) {
      this.store.openFullDetail();
    }
    this.close();
  }

  protected editSelected(): void {
    this.store.openEditActivity();
  }

  protected readonly confirmDeleteOpen = signal(false);
  protected readonly confirmDeleteMessage = computed(() => {
    const activity = this.a();
    if (!activity) return '';
    return this.isEvent()
      ? `Cancel event "${activity.title}"? This cannot be undone.`
      : `Delete activity "${activity.title}"? This cannot be undone.`;
  });

  protected deleteSelected(): void {
    if (!this.a()) return;
    this.confirmDeleteOpen.set(true);
  }

  protected async confirmDelete(): Promise<void> {
    const activity = this.a();
    this.confirmDeleteOpen.set(false);
    if (!activity) return;

    if (this.isEvent()) {
      await this.store.deleteEvent(activity.id);
    } else {
      await this.store.deleteActivity(activity.id);
    }
  }
}
