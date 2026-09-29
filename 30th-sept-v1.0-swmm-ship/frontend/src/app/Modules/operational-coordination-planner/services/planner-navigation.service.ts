import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import { Activity } from '../constants/data';

/**
 * Routes a calendar item (DART/routine/defect/trial/audit/meeting/lecture)
 * to its owning module's own detail page. Was duplicated identically in
 * planner-activity-details-modal's `expand()` and planner-day-events-modal's
 * `selectEvent()` - kept here once so the branch order (which matters: some
 * types overlap, e.g. `dart_raised`/`dart_closed` are gated by whether
 * `routine_id`/`defect_id` is present) only has one copy to get right.
 */
@Injectable({ providedIn: 'root' })
export class PlannerNavigationService {
  private readonly router = inject(Router);

  private navigateToDefect(defectId?: number): void {
    if (defectId != null) {
      this.router.navigate(['/afterAuth/op-maintenance/close-defects', defectId]);
    } else {
      this.router.navigate(['/afterAuth/op-maintenance/close-defects']);
    }
  }

  private navigateToRoutine(routineId?: number, path = 'r-d-plan-routine'): void {
    if (routineId) {
      this.router.navigate(['/afterAuth/op-maintenance/routine', path], { state: { routineId } });
    } else {
      this.router.navigate(['/afterAuth/op-maintenance/routine', path]);
    }
  }

  /** Navigates away when the activity's type maps to a dedicated page,
   *  returning true. Returns false when there's no such page, so the
   *  caller can fall back to its own in-app detail view. */
  navigateToRecord(activity: Pick<Activity, 'type' | 'cat' | 'routine_id' | 'defect_id'>): boolean {
    const type = activity.type || activity.cat;

    if (['dart_raised', 'dart_closed'].includes(type) && activity.routine_id && !activity.defect_id) {
      this.navigateToRoutine(activity.routine_id, 'r-d-plan-routine');
    } else if (['db_defect', 'dart_raised', 'dart_closed', 'routine_dart', 'defect'].includes(type)) {
      this.navigateToDefect(activity.defect_id);
    } else if (type === 'routine') {
      this.navigateToRoutine(activity.routine_id, 'r-d-plan-routine');
    } else if (type === 'planned_routine') {
      this.navigateToRoutine(activity.routine_id, 'close-routine');
    } else if (['running_hours_due', 'running_hours_plan', 'plan_flag', 'original_due'].includes(type)) {
      this.navigateToRoutine(activity.routine_id, 'r-d-plan-routine');
    } else if (type === 'trial') {
      this.router.navigate(['/afterAuth/op-maintenance/trials']);
    } else if (type === 'audit') {
      this.router.navigate(['/afterAuth/op-maintenance/audit']);
    } else if (type === 'meeting') {
      this.router.navigate(['/afterAuth/activity-planner/events']);
    } else if (type === 'lecture') {
      this.router.navigate(['/afterAuth/activity-planner/lectures']);
    } else {
      return false;
    }
    return true;
  }
}
