import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PlannerStore } from '../../store/planner.store';
import { PlannerApiService } from '../../services/planner-api.service';
import { IconComponent } from '../planner-icon/planner-icon.component';

interface ShiftRoutine {
  id: string | number;
  equipment_name: string;
  routine_name: string;
  due_date: string;
  calendar_revised_date: string | null;
  ref_code: string;
}

@Component({
  selector: 'app-shift-due-date',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planner-shift-due-date.component.html',
  styleUrl: './planner-shift-due-date.component.scss',
})
export class ShiftDueDateComponent implements OnInit {
  private api = inject(PlannerApiService);
  private store = inject(PlannerStore);

  routines = signal<ShiftRoutine[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  canShift = signal(false);
  horizonEnd = signal<string | null>(null);
  editedDates = signal<Record<string | number, string | null>>({});

  ngOnInit(): void {
    this.loadRoutines();
  }

  loadRoutines(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.getShiftRoutines().subscribe({
      next: (response: any) => {
        this.routines.set(response.routines || []);
        this.canShift.set(response.can_shift !== false);
        this.horizonEnd.set(response.horizon_end);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load routines', err);
        // Check if it's a permission error
        if (err.status === 403) {
          this.error.set(null);
          this.canShift.set(false);
          this.routines.set([]);
          this.loading.set(false);
        } else {
          this.error.set('Failed to load routines. Please try again.');
          this.loading.set(false);
        }
      },
    });
  }

  onDateChange(routineId: string | number, newDate: string): void {
    const edited = this.editedDates();
    edited[routineId] = newDate || null;
    this.editedDates.set({ ...edited });
  }

  clearDate(routineId: string | number): void {
    const edited = this.editedDates();
    edited[routineId] = null;
    this.editedDates.set({ ...edited });
  }

  saveChanges(): void {
    const edited = this.editedDates();
    const routineIds = Object.keys(edited);

    if (routineIds.length === 0) {
      this.store.pushToast('No changes to save');
      return;
    }

    this.loading.set(true);

    const changes = routineIds.map((routineId) => ({
      routineId,
      revisedDate: edited[routineId],
    }));

    this.api.setRevisedDates(changes).subscribe({
      next: (response) => {
        const results = response?.results ?? [];
        const failedIds = new Set(
          results.filter((r) => r.status === 'error').map((r) => r.routine_id.toString()),
        );
        const saved = results.length - failedIds.size;
        const failed = failedIds.size;

        const updatedRoutines = this.routines().map((r) => {
          const routineId = r.id.toString();
          if (!(routineId in edited) || failedIds.has(routineId)) {
            return r;
          }
          return { ...r, calendar_revised_date: edited[routineId] };
        });
        this.routines.set(updatedRoutines);

        this.loading.set(false);
        this.editedDates.set(
          failed === 0
            ? {}
            : Object.fromEntries(
                Object.entries(edited).filter(([routineId]) => failedIds.has(routineId)),
              ),
        );

        if (failed === 0) {
          this.store.pushToast(`${saved} revised date(s) updated`);
        } else {
          this.store.pushToast(`${saved} updated, ${failed} failed`);
        }
      },
      error: (err) => {
        console.error('Failed to save revised dates', err);
        this.loading.set(false);
        this.store.pushToast('Failed to save revised dates');
      },
    });
  }

  getDisplayDate(routine: ShiftRoutine): string {
    const edited = this.editedDates();
    const routineId = routine.id;

    if (routineId in edited) {
      const value = edited[routineId];
      return value ? this.formatDate(value) : '(clear)';
    }

    return routine.calendar_revised_date ? this.formatDate(routine.calendar_revised_date) : routine.due_date ? this.formatDate(routine.due_date) : 'N/A';
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  getHasChanges(): boolean {
    return Object.keys(this.editedDates()).length > 0;
  }

  closeModal(): void {
    this.store.closeShiftDueDateModal();
  }
}
