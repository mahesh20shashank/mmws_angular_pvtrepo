import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { IconComponent } from '../planner-icon/planner-icon.component';
import { CAT_COLOR, Category } from '../../constants/data';
import { PlannerStore } from '../../store/planner.store';

const CATEGORY_ICON: Record<string, string> = {
  defect: 'wrench',
  routine: 'clock',
  planned_routine: 'doc',
  trial: 'plane2',
  audit: 'book',
  others: 'box',
  meeting: 'users',
  lecture: 'book',
  plan_flag: 'flag',
  planner_activity: 'pin',
};

/**
 * Persistent left-hand filter sidebar for the Ship Activity Calendar:
 * an "All Events" master checkbox, per-category checkboxes, and a legend
 * shortcut to the overdue-pending-DARTs modal.
 */
@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './planner-filter-panel.component.scss',
  templateUrl: './planner-filter-panel.component.html',
})
export class FilterPanelComponent {
  protected readonly store = inject(PlannerStore);

  // Show New Event button only if user has permission (from user's role)
  protected readonly canCreateEvent = computed(() => this.store.canCreateEvent());
  protected readonly canAddActivity = computed(() => this.store.choices()?.can_add_planner_activity ?? false);
  protected readonly canShiftDueDate = computed(() => this.store.choices()?.can_shift_due_date ?? false);
  protected readonly newActivityTitle = signal('');
  protected readonly newActivityDate = signal('');
  protected readonly addingActivity = signal(false);

  protected readonly departments = [
    { value: 'All Departments', label: 'All Departments' },
    { value: 'Engineering', label: 'Engineering' },
    { value: 'Electrical', label: 'Electrical' },
    { value: 'Weapon', label: 'Weapon' },
    { value: 'Operations', label: 'Operations' },
    { value: 'FMU / Support', label: 'FMU / Support' },
    { value: 'Trials & Inspection', label: 'Trials & Inspection' },
    { value: 'Admin', label: 'Admin' },
  ];

  protected readonly searchQuery = signal('');

  constructor() {
    effect(() => {
      this.store.searchQuery.set(this.searchQuery());
    });
  }

  protected readonly categories = computed<{ id: Category; label: string; swatch: string; icon: string }[]>(() => {
    const rawCategories = this.store.choices()?.filter_categories;

    const fallbackCategories = [
      { value: 'defect', label: 'Defect' },
      { value: 'routine', label: 'Routine' },
      { value: 'planned_routine', label: 'Planned Routine' },
      { value: 'trial', label: 'Trial' },
      { value: 'audit', label: 'Audit' },
      { value: 'meeting', label: 'Meeting' },
      { value: 'lecture', label: 'Lecture' },
      { value: 'plan_flag', label: 'Plan Routine' },
      { value: 'planner_activity', label: 'My Activities' },
      { value: 'others', label: 'Others' },
    ];

    const list: unknown[] = Array.isArray(rawCategories) && rawCategories.length > 0
      ? rawCategories
      : fallbackCategories;

    return list.map((item: unknown) => {
      let val = '';
      let lbl = '';
      if (Array.isArray(item)) {
        val = String(item[0] ?? '');
        lbl = String(item[1] ?? item[0] ?? val);
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        val = String(obj['value'] ?? obj['id'] ?? obj['key'] ?? obj['code'] ?? '');
        lbl = String(obj['label'] ?? obj['name'] ?? obj['display_name'] ?? obj['title'] ?? val);
      } else {
        val = String(item ?? '');
        lbl = val;
      }

      return {
        id: val as Category,
        label: lbl,
        swatch: CAT_COLOR[val as Category] ?? '#94a3b8',
        icon: CATEGORY_ICON[val] ?? 'doc',
      };
    });
  });

  protected readonly allChecked = computed(() => this.store.allEventsChecked());

  protected readonly totalCount = computed(() => this.store.filteredActivities().length);

  protected readonly pendingPlanningCount = computed(() => {
    const activities = this.store.filteredActivities();
    return activities.filter((a) => a.status?.toLowerCase() === 'cancelled').length;
  });

  protected isChecked(id: Category): boolean {
    return !this.store.allEventsChecked() && this.store.catFilter().includes(id);
  }

  protected toggleAll(): void {
    this.store.toggleAllEvents();
  }

  protected toggle(id: Category): void {
    this.store.toggleCategory(id);
  }

  protected setDepartment(dept: string): void {
    this.store.deptFilter.set(dept);
  }

  protected onDeptChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.setDepartment(target.value);
  }

  protected toggleChip(chip: 'active' | 'delayed' | 'conflict' | 'trial' | 'today'): void {
    const current = this.store.chipFilter();
    this.store.chipFilter.set(current === chip ? null : chip);
  }

  protected openOverdueDarts(): void {
    this.store.openOverdueDartsModal();
  }

  protected openShiftDueDate(): void {
    this.store.openShiftDueDateModal();
  }

  protected openNewEvent(): void {
    this.store.openNewEventModal();
  }

  protected async submitNewActivity(): Promise<void> {
    const title = this.newActivityTitle().trim();
    const date = this.newActivityDate();
    if (!title || !date) {
      return;
    }

    this.addingActivity.set(true);
    try {
      await this.store.createActivity({
        title,
        date,
        cat: 'others',
        t1: '08:00',
        t2: '17:00',
        priority: 'medium',
        description: '',
      });
      this.newActivityTitle.set('');
      this.newActivityDate.set('');
    } finally {
      this.addingActivity.set(false);
    }
  }
}
