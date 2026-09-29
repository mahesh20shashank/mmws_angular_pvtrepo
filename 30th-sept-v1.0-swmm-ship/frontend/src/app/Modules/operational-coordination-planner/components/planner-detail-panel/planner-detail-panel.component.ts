import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../planner-icon/planner-icon.component';
import { addDays, CAT_LABEL } from '../../constants/data';
import { PlannerStore } from '../../store/planner.store';

const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Right-hand detail panel. Shows full info for the currently selected
 * activity, or an empty-state prompt when nothing is selected.
 */
@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [IconComponent, ButtonComponent, ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './planner-detail-panel.component.scss',
  templateUrl: './planner-detail-panel.component.html',

})
export class DetailComponent {
  protected readonly store = inject(PlannerStore);
  protected readonly router = inject(Router);
  protected readonly a = this.store.selectedActivity;

  protected readonly isEvent = this.store.selectedIsEvent;
  protected readonly isManual = this.store.selectedIsManual;
  protected readonly canEdit = this.store.selectedCanEdit;
  protected readonly canCancel = this.store.selectedCanCancel;

  protected readonly catLabel = computed(() => CAT_LABEL[this.a()?.cat ?? ''] ?? '');
  protected readonly selectedDayActivities = computed(() => this.store.selectedDateActivities());
  protected readonly selectedActivityIndex = computed(() => {
    const selected = this.a();
    if (!selected) {
      return -1;
    }

    return this.selectedDayActivities().findIndex((activity) => activity.id === selected.id);
  });
  protected readonly hasMultipleDayActivities = computed(
    () => this.selectedDayActivities().length > 1,
  );
  protected readonly selectedDayLabel = computed(() => {
    const selectedDate = this.store.selectedDate();

    if (!selectedDate) {
      return '';
    }

    const [year, month, day] = selectedDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayIndex = (date.getDay() + 6) % 7;
    return `${DOW[dayIndex]} ${String(day).padStart(2, '0')} ${date.toLocaleString('en-US', { month: 'short' })}`;
  });

  protected readonly dayLabel = computed(() => {
    const a = this.a();
    if (!a) return '';
    const d = addDays(this.store.rangeStart(), a.day);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${WEEKDAY_SHORT[d.getDay()]} ${pad(d.getDate())} ${d.toLocaleString('en-US', { month: 'short' })}`;
  });

  protected readonly tagCls = computed(() => {
    const a = this.a();
    if (!a) return '';
    if (a.conflict || a.delayed) return 'delayed';
    if (a.prog > 0) return 'progress';
    return 'scheduled';
  });

  protected readonly statusLabel = computed(() => {
    const a = this.a();
    if (!a) return '';
    if (a.conflict) return 'Conflict detected';
    if (a.delayed) return 'Delayed';
    if (a.prog > 0) return `In Progress · ${a.prog}%`;
    return 'Scheduled';
  });

  protected readonly priorityColor = computed(() => {
    const p = this.a()?.priority;
    if (p === 'Critical' || p === 'High') return '#f87171';
    if (p === 'Low') return '#34d399';
    return '#fbbf24';
  });

  protected readonly progressColor = computed(() => {
    const a = this.a();
    if (!a) return 'linear-gradient(90deg,#10b981,#34d399)';
    if (a.conflict) return 'linear-gradient(90deg,#ef4444,#fca5a5)';
    if (a.delayed) return 'linear-gradient(90deg,#fbbf24,#fcd34d)';
    return 'linear-gradient(90deg,#10b981,#34d399)';
  });

  protected editSelected() {
    this.store.openEditActivity();
  }

  protected showPreviousActivity() {
    this.moveActivity(-1);
  }

  protected showNextActivity() {
    this.moveActivity(1);
  }

  protected closePanel() {
    this.store.clearSelection();
  }

  private moveActivity(delta: number) {
    const list = this.selectedDayActivities();
    if (list.length <= 1) {
      return;
    }

    const current = this.a();
    const currentIndex = Math.max(
      0,
      list.findIndex((activity) => activity.id === current?.id),
    );
    const nextIndex = (currentIndex + delta + list.length) % list.length;
    const next = list[nextIndex];

    this.store.selectActivityWithDate(next.id, this.store.selectedDate());
  }

  protected readonly confirmDeleteOpen = signal(false);
  protected readonly confirmDeleteMessage = computed(() => {
    const activity = this.a();
    if (!activity) return '';
    return this.isEvent()
      ? `Cancel event "${activity.title}"? This cannot be undone.`
      : `Delete activity "${activity.title}"? This cannot be undone.`;
  });

  protected deleteSelected() {
    if (!this.a()) return;
    this.confirmDeleteOpen.set(true);
  }

  protected async confirmDelete() {
    const a = this.a();
    this.confirmDeleteOpen.set(false);
    if (!a) return;

    if (this.isEvent()) {
      await this.store.deleteEvent(a.id);
      return;
    }

    await this.store.deleteActivity(a.id);
  }

  protected navigateToDefect() {
    const a = this.a();
    if (!a || !a.defect_id) return;
    void this.router.navigate(['/afterAuth/op-maintenance/defect/overview'], {
      queryParams: { id: a.defect_id },
    });
  }

  protected navigateToDart() {
    const a = this.a();
    if (!a || !a.dart_number) return;
    void this.router.navigate(['/afterAuth/op-maintenance/defect/overview'], {
      queryParams: { dart: a.dart_number },
    });
  }

  protected navigateToRoutine() {
    const a = this.a();
    if (!a || !a.routine_id) return;
    void this.router.navigate(['/afterAuth/op-maintenance/routine/search-routines'], {
      queryParams: { id: a.routine_id },
    });
  }

  protected navigateToPlannedRoutine() {
    const a = this.a();
    if (!a || !a.routine_id) return;
    void this.router.navigate(['/afterAuth/op-maintenance/routine/planned-routine-detail'], {
      queryParams: { id: a.routine_id },
    });
  }
}
