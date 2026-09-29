import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

import { PlannerStore } from '../../store/planner.store';
import { IconComponent } from '../planner-icon/planner-icon.component';
import { InputField } from '../../../../shared/components/input-field/input-field';
import { DatePickerComponent } from '../../../../shared/components/date-picker/picker';
import { TextareaInput } from '../../../../shared/components/textarea-input/textarea-input';
import { FileInput } from '../../../../shared/components/file-input/file-input';
import { Category } from '../../constants/data';
function parseIsoDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map((p) => parseInt(p, 10));
  return new Date(year, (month || 1) - 1, day || 1);
}

@Component({
  selector: 'app-new-activity-modal',
  standalone: true,
  imports: [
    IconComponent,
    CommonModule,
    ReactiveFormsModule,
    InputField,
    DatePickerComponent,
    TextareaInput,
    FileInput, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './planner-new-activity-modal.component.scss',
  templateUrl: './planner-new-activity-modal.component.html',
})
export class NewActivityModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private readonly store = inject(PlannerStore);

  eventForm!: FormGroup;
  activityForm!: FormGroup;

  protected readonly editorMode = this.store.editorMode;
  protected readonly resourceType = this.store.resourceType;
  protected readonly selectedActivity = this.store.selectedActivity;
  protected readonly customCategory = signal('');

  private readonly todayDate = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  protected readonly minSelectableDate = computed(() =>
    this.editorMode() === 'edit' ? null : this.todayDate,
  );

  protected readonly categories = computed(() => {
    const rawCategories = this.store.choices()?.categories;
    const fallback = [
      { value: 'defect', label: 'Defect' },
      { value: 'routine', label: 'Routine' },
      { value: 'trial', label: 'Trial' },
      { value: 'audit', label: 'Audit' },
      { value: 'meeting', label: 'Meeting' },
      { value: 'lecture', label: 'Lecture' },
      { value: 'others', label: 'Others' },
    ];
    return Array.isArray(rawCategories) && rawCategories.length > 0 ? rawCategories : fallback;
  });

  protected readonly lanes = [
    { value: 'eng', label: 'Engineering' },
    { value: 'elec', label: 'Electrical' },
    { value: 'wpn', label: 'Weapons' },
    { value: 'ops', label: 'Operations' },
    { value: 'fmu', label: 'Fuel Management' },
    { value: 'tri', label: 'Trials' },
    { value: 'adm', label: 'Admin' },
  ];

  protected readonly priorities = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
  ];

  ngOnInit(): void {
    this.initializeForms();
  }
  private static timeRangeValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
    const start = group.get('start_time')?.value;
    const end = group.get('end_time')?.value;
    if (start && end && end <= start) {
      group.get('end_time')?.setErrors({ ...(group.get('end_time')?.errors || {}), timeRange: true });
      return { timeRange: true };
    }
    const endControl = group.get('end_time');
    if (endControl?.errors?.['timeRange']) {
      const { timeRange, ...rest } = endControl.errors;
      endControl.setErrors(Object.keys(rest).length ? rest : null);
    }
    return null;
  };

  private initializeForms(): void {
    const isEditing = this.editorMode() === 'edit';
    const activity = isEditing ? this.selectedActivity() : null;
    const prefillDateStr = activity?.date || (!isEditing ? this.store.selectedDate() : null);
    const prefillDate = prefillDateStr ? parseIsoDateLocal(prefillDateStr) : null;

    this.eventForm = this.fb.group({
      title: [activity?.title || '', [Validators.required, Validators.maxLength(200)]],
      date: [prefillDate, Validators.required],
      start_time: [activity?.start_time || '', Validators.required],
      end_time: [activity?.end_time || '', Validators.required],
      category: [activity?.cat || '', Validators.required],
      description: [activity?.description || '', Validators.maxLength(2000)],
      document: [null],
    }, { validators: NewActivityModalComponent.timeRangeValidator });

    this.activityForm = this.fb.group({
      title: [activity?.title || '', [Validators.required, Validators.maxLength(200)]],
      date: [prefillDate, Validators.required],
      lane: [activity && 'lane' in activity ? (activity as any).lane : 'eng', Validators.required],
      category: [activity?.cat || 'others', Validators.required],
      priority: [activity && 'priority' in activity ? (activity as any).priority : 'medium', Validators.required],
      description: [activity?.description || '', Validators.maxLength(2000)],
    });
  }

  close(): void {
    this.store.closeEditor();
  }

  async create(): Promise<void> {
    const form = this.resourceType() === 'event' ? this.eventForm : this.activityForm;

    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const value = form.value;
    const dateString = value.date instanceof Date
      ? value.date.toISOString().split('T')[0]
      : value.date;

    try {
      if (this.resourceType() === 'event') {
        await this.createEvent(value, dateString);
      } else {
        await this.createActivity(value, dateString);
      }
      this.close();
    } catch (error) {
      console.error('Failed to save', error);
    }
  }

  private async createEvent(value: any, dateString: string): Promise<void> {
    let category = value.category;
    if (value.category === 'new_category') {
      const custom = this.customCategory().trim();
      if (!custom) {
        alert('Please enter a category name');
        return;
      }
      category = custom;
    }

    const formData = new FormData();
    formData.append('title', value.title.trim());
    formData.append('date', dateString);
    formData.append('start_time', value.start_time);
    formData.append('end_time', value.end_time);
    formData.append('category', category);
    formData.append('description', value.description || '');

    if (value.document) {
      formData.append('document', value.document);
    }

    if (this.editorMode() === 'edit' && this.selectedActivity()) {
      await this.store.updateEvent(this.selectedActivity()!.id, formData);
    } else {
      await this.store.createEvent(formData as any);
    }

    this.customCategory.set('');
  }

  private async createActivity(value: Record<string, unknown>, dateString: string): Promise<void> {
    const title = String(value['title'] || '').trim();
    const category = (value['category'] as Category) || 'others';
    const priority = (value['priority'] as string) || 'medium';
    const description = (value['description'] as string) || '';

    if (this.editorMode() === 'edit' && this.selectedActivity()) {
      await this.updateActivity(title, dateString, category, priority, description);
    } else {
      await this.createNewActivity(title, dateString, category, priority, description);
    }
  }

  private async createNewActivity(title: string, dateString: string, category: Category, priority: string, description: string): Promise<void> {
    const payload = { title, cat: category, t1: '08:00', t2: '17:00', priority, description, date: dateString };
    await this.store.createActivity(payload as any);
  }

  private async updateActivity(title: string, dateString: string, category: Category, priority: string, description: string): Promise<void> {
    const updatePayload = { title, date: dateString, start_time: '08:00', end_time: '17:00', category: category as any, priority, description };
    await this.store.updateActivity(this.selectedActivity()!.id, updatePayload as any);
  }
}
