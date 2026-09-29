import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Activity,
  Category,
  InboxMessage,
  MS_PER_DAY,
  Notification,
  ThemeMode,
  ViewMode,
  addDays,
  getWeekStart,
  startOfDay,
} from '../constants/data';
import { PlannerApiService } from '../services/planner-api.service';
import { LandingPageService } from '../../../Modules/landing/services/landing-page.service';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { getErrorMessage } from '../../../Core/http/services/http-feedback';
import {
  PlannerActivityDto,
  PlannerActivityPayload,
  PlannerActivityQuery,
  PlannerChoicesDto,
  PlannerDashboardDto,
  PlannerInboxMessageDto,
  PlannerNotificationDto,
  PlannerOverdueDartRowDto,
  PlannerSummaryDto,
} from '../models/planner-api.models';

type ChipFilter = 'active' | 'delayed' | 'conflict' | 'others' | 'trial' | 'today' | null;

@Injectable({ providedIn: 'root' })
export class PlannerStore {
  private readonly api = inject(PlannerApiService);
  private readonly landingService = inject(LandingPageService);
  private readonly notification = inject(NotificationService);
  private loadSeq = 0;
  private readonly today = startOfDay(new Date());
  readonly currentWeekDayIndex = (new Date().getDay() + 6) % 7;
  private readonly hasEventManagerRole = computed(() => {
    const user = this.landingService.user();
    if (!user) return false;
    const roleName = (user as any)?.profile?.role_master_detail?.role_name;
    return ['Head of Department', 'DY HOD', 'HODWRITER'].includes(roleName);
  });
  readonly canCreateEvent = this.hasEventManagerRole;
  readonly canEditEvent = this.hasEventManagerRole;
  readonly canCancelEvent = this.hasEventManagerRole;

  readonly activities = signal<Activity[]>([]);
  /** Whole-year activities for the Year view (not clamped to a single week like `activities`). */
  readonly yearActivities = signal<Activity[]>([]);
  readonly yearRef = signal(this.today.getFullYear());
  readonly yearLoading = signal(false);
  private loadedYear: number | null = null;
  readonly notifications = signal<Notification[]>([]);
  readonly inbox = signal<InboxMessage[]>([]);
  readonly dashboard = signal<PlannerDashboardDto | null>(null);
  readonly choices = signal<PlannerChoicesDto | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly lastSyncedAt = signal<Date | null>(null);

  readonly selectedId = signal<string | null>(null);
  readonly selectedDate = signal<string | null>(null);
  /** When true, the expanded read-only side panel shows instead of the compact details popup. */
  readonly detailFullView = signal(false);
  readonly view = signal<ViewMode>('Month');
  readonly rangeStart = signal(this.today);
  readonly currentRangeDayIndex = computed(() =>
    Math.floor((this.today.getTime() - startOfDay(this.rangeStart()).getTime()) / MS_PER_DAY),
  );
  readonly navActive = signal('planner');
  readonly sidebarCollapsed = signal(false);

  readonly chipFilter = signal<ChipFilter>(null);
  readonly deptFilter = signal('All Departments');
  readonly searchQuery = signal('');
  // Reference-parity master switch (see plan_activity.html's getSelectedCategories()):
  // checked = no category filter at all, sent to the server as an absent `categories`
  // param so every category comes back unfiltered - not "all known categories listed
  // explicitly". Individual category checkboxes start unchecked and only take over once
  // this is unchecked (matching the reference's mutual-exclusion behavior).
  readonly allEventsChecked = signal(true);
  readonly catFilter = signal<Category[]>([]);

  readonly newModalOpen = signal(false);
  readonly editorMode = signal<'create' | 'edit'>('create');
  readonly resourceType = signal<'event' | 'activity'>('activity');
  readonly notifFlyoutOpen = signal(false);
  readonly mailFlyoutOpen = signal(false);

  readonly overdueDartsModalOpen = signal(false);
  readonly overdueDartsLoading = signal(false);
  readonly overdueDarts = signal<PlannerOverdueDartRowDto[]>([]);

  readonly shiftDueDateModalOpen = signal(false);

  readonly dayEventsModalOpen = signal(false);
  readonly dayEventsModalDate = signal<Date | null>(null);
  readonly dayEventsModalActivities = signal<Activity[]>([]);

  readonly theme = signal<ThemeMode>('dark');
  readonly toasts = signal<{ id: string; text: string }[]>([]);

  readonly filteredActivities = computed<Activity[]>(() => {
    const allChecked = this.allEventsChecked();
    const cats = this.catFilter();
    const chip = this.chipFilter();
    const query = this.searchQuery().toLowerCase().trim();

    return this.activities().filter((a) => {
      if (!allChecked && !cats.includes(a.cat)) return false;
      if (query && !a.title.toLowerCase().includes(query) && !(a.description?.toLowerCase().includes(query))) return false;
      if (chip === 'active') return a.status?.toLowerCase() === 'active' || !!a.prog || !!a.selected;
      if (chip === 'delayed') return !!a.delayed;
      if (chip === 'conflict') return !!a.conflict;
      if (chip === 'others') return a.cat === 'others';
      if (chip === 'trial') return a.cat === 'trial';
      if (chip === 'today') return a.day === this.currentRangeDayIndex();
      return true;
    });
  });

  readonly yearFilteredActivities = computed<Activity[]>(() => {
    const allChecked = this.allEventsChecked();
    const cats = this.catFilter();

    return this.yearActivities().filter((a) => allChecked || cats.includes(a.cat));
  });

  readonly selectedActivity = computed<Activity | null>(() => {
    const id = this.selectedId();
    if (id) {
      const matched = this.filteredActivities().find((a) => a.id === id);
      if (matched) {
        return matched;
      }
    }

    return this.selectedDateActivities()[0] ?? null;
  });

  // Shared by planner-detail-panel and planner-activity-details-modal - both
  // used to redefine these identically; kept here once next to
  // selectedActivity so there's a single source of truth for "can the
  // currently selected item be edited/cancelled from here".
  readonly selectedIsEvent = computed(() => this.selectedActivity()?.type === 'event');
  readonly selectedIsManual = computed(
    () => this.selectedIsEvent() || (this.selectedActivity()?.id ?? '').startsWith('activity_'),
  );
  readonly selectedCanEdit = computed(() => (this.selectedIsEvent() ? this.canEditEvent() : true));
  readonly selectedCanCancel = computed(() => (this.selectedIsEvent() ? this.canCancelEvent() : true));

  readonly selectedDateActivities = computed<Activity[]>(() => {
    const selectedDate = this.selectedDate();
    if (!selectedDate) {
      return [];
    }

    return this.filteredActivities().filter(
      (activity) => this.getActivityDateKey(activity) === selectedDate,
    );
  });

  readonly unreadMailCount = computed(() => this.inbox().filter((m) => m.unread).length);

  selectActivity(id: string | null) {
    if (id === null) {
      this.clearSelection();
      return;
    }

    this.selectedId.set(id);
    this.detailFullView.set(false);
  }

  selectActivityWithDate(id: string | null, date: string | null = null) {
    this.selectedId.set(id);
    this.selectedDate.set(date);
    this.detailFullView.set(false);
  }

  selectDate(date: string, activityId: string | null = null) {
    this.selectedDate.set(date);
    this.selectedId.set(activityId);
    this.detailFullView.set(false);
  }

  clearSelection() {
    this.selectedId.set(null);
    this.selectedDate.set(null);
    this.detailFullView.set(false);
  }

  openFullDetail() {
    this.detailFullView.set(true);
  }

  openCreateActivity() {
    this.editorMode.set('create');
    this.resourceType.set('activity');
    this.newModalOpen.set(true);
  }

  openEditActivity() {
    const selected = this.selectedActivity();
    if (!selected) {
      return;
    }

    this.resourceType.set(selected.type === 'event' ? 'event' : 'activity');
    this.editorMode.set('edit');
    this.newModalOpen.set(true);
  }

  closeEditor() {
    const wasCreatingEvent = this.editorMode() === 'create' && this.resourceType() === 'event';
    this.newModalOpen.set(false);
    this.editorMode.set('create');
    if (wasCreatingEvent) {
      this.clearSelection();
    }
  }

  async init() {
    if (!this.choices()) {
      try {
        const choicesData = await firstValueFrom(this.api.getChoices());
        this.choices.set(choicesData);
      } catch (error) {
        console.error('Failed to load choices', error);
      }
    }
    // Load data for the default Month view
    const defaultView = this.view();
    if (defaultView === 'Month' || defaultView === 'Week' || defaultView === 'Day') {
      await this.reloadCurrentRange();
    } else if (defaultView === 'Year') {
      await this.loadYear(this.yearRef());
    }
  }

  toggleChip(id: Exclude<ChipFilter, null>) {
    this.chipFilter.update((cur) => (cur === id ? null : id));
    void this.reloadCurrentRange();
  }

  setDept(d: string) {
    this.deptFilter.set(d);
    void this.reloadCurrentRange();
  }

  toggleCategory(c: Category) {
    this.catFilter.update((cats) =>
      cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c],
    );
    // Reference parity: checking any individual category clears "All Events" - the two
    // are mutually exclusive there (see plan_activity.html's checkbox change handler).
    this.allEventsChecked.set(false);
    void this.reloadCurrentRange();
  }

  toggleAllEvents() {
    // Reference parity: clicking "All Events" actually toggles it - unchecking it while
    // no individual category is checked either leaves nothing selected (show nothing),
    // exactly like unchecking filterAllEvents in the reference with every other checkbox
    // already unchecked. Only re-checking it clears the individual filters back out.
    const next = !this.allEventsChecked();
    this.allEventsChecked.set(next);
    if (next) {
      this.catFilter.set([]);
    }
    void this.reloadCurrentRange();
  }

  toggleSidebar() {
    this.sidebarCollapsed.update((v) => !v);
  }

  toggleTheme() {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  openNotifFlyout() {
    this.notifFlyoutOpen.set(true);
    this.mailFlyoutOpen.set(false);
  }

  openMailFlyout() {
    this.mailFlyoutOpen.set(true);
    this.notifFlyoutOpen.set(false);
  }

  closeFlyouts() {
    this.notifFlyoutOpen.set(false);
    this.mailFlyoutOpen.set(false);
  }

  openOverdueDartsModal() {
    this.overdueDartsModalOpen.set(true);
    void this.loadOverdueDarts();
  }

  closeOverdueDartsModal() {
    this.overdueDartsModalOpen.set(false);
  }

  openShiftDueDateModal() {
    this.shiftDueDateModalOpen.set(true);
  }

  closeShiftDueDateModal() {
    this.shiftDueDateModalOpen.set(false);
  }

  openDayEventsModal(date: Date, activities: Activity[]) {
    this.dayEventsModalDate.set(date);
    this.dayEventsModalActivities.set(activities);
    this.dayEventsModalOpen.set(true);
  }

  closeDayEventsModal() {
    this.dayEventsModalOpen.set(false);
  }

  openNewEventModal() {
    const selected = this.selectedDate();
    if (selected && this.parseDate(selected) < this.startOfDay(new Date())) {
      this.selectedDate.set(null);
    }
    this.editorMode.set('create');
    this.resourceType.set('event');
    this.newModalOpen.set(true);
  }
  openNewEventForDate(dateStr: string) {
    this.selectDate(dateStr, null);
    if (this.parseDate(dateStr) < this.startOfDay(new Date())) {
      return;
    }
    this.openNewEventModal();
  }

  private async loadOverdueDarts() {
    this.overdueDartsLoading.set(true);
    try {
      const response = await firstValueFrom(this.api.getOverdueDarts());
      this.overdueDarts.set(response.results);
    } catch (error) {
      console.error('Overdue DARTs load failed', error);
      this.pushToast('Unable to load overdue DARTs');
    } finally {
      this.overdueDartsLoading.set(false);
    }
  }

  stepWeek(delta: number) {
    this.rangeStart.update((start) => addDays(start, delta * 7));
    this.clearSelection();
    void this.reloadCurrentRange();
  }

  stepMonth(delta: number) {
    this.rangeStart.update((start) => {
      const newDate = new Date(start.getFullYear(), start.getMonth() + delta, 1);
      return this.startOfDay(newDate);
    });
    this.clearSelection();
    void this.reloadCurrentRange();
  }

  stepDay(delta: number) {
    this.rangeStart.update((start) => addDays(start, delta));
    this.clearSelection();
    void this.reloadCurrentRange();
  }

  stepYear(delta: number) {
    const next = this.yearRef() + delta;
    this.yearRef.set(next);
    void this.loadYear(next);
  }

  /** Loads the year for `yearRef()` only if it hasn't been loaded yet. */
  ensureYearLoaded() {
    if (this.loadedYear !== this.yearRef()) {
      void this.loadYear(this.yearRef());
    }
  }

  private extractArray<T>(response: unknown): T[] {
    if (Array.isArray(response)) {
      return response;
    }
    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
      if (Array.isArray(obj['results'])) return obj['results'] as T[];
      if (Array.isArray(obj['data'])) return obj['data'] as T[];
      if (Array.isArray(obj['activities'])) return obj['activities'] as T[];
    }
    return [];
  }

  async loadYear(year: number) {
    if (this.hasNoCategoriesSelected()) {
      this.yearActivities.set([]);
      this.loadedYear = year;
      return;
    }

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const query = this.buildQuery(start, end);

    this.yearLoading.set(true);
    try {
      const feedData = await firstValueFrom(this.api.getFeed(query));
      const allActivities = this.extractArray<PlannerActivityDto>(feedData);

      this.yearActivities.set(
        allActivities
          .map((activity) => this.mapActivityForYear(activity))
          .filter((activity): activity is Activity => activity !== null),
      );
      this.loadedYear = year;
    } catch (error) {
      console.error('Year activities load failed', error);
      this.pushToast('Unable to load the year view');
    } finally {
      this.yearLoading.set(false);
    }
  }

  setWeek(offset: number) {
    const newStart = addDays(getWeekStart(offset), 0);
    this.rangeStart.set(newStart);
    this.clearSelection();
    void this.reloadCurrentRange();
  }

  goToday() {
    this.rangeStart.set(this.today);
    this.clearSelection();
    void this.reloadCurrentRange();
  }

  setRangeStart(date: Date) {
    this.rangeStart.set(startOfDay(isNaN(date.getTime()) ? this.today : date));
    this.clearSelection();
    void this.reloadCurrentRange();
  }

  pushToast(text: string) {
    const id = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 5);
    this.toasts.update((t) => [...t, { id, text }]);
    setTimeout(() => this.toasts.update((t) => t.filter((x) => x.id !== id)), 2400);
  }

  async createEvent(input: FormData | any) {
    try {
      await firstValueFrom(this.api.createEvent(input));
      this.notification.success('Event created successfully');
      void this.reloadCurrentWeek();
    } catch (err) {
      console.error('Failed to create event', err);
      this.notification.error(getErrorMessage(err));
      throw err;
    }
  }

  async updateEvent(id: string | number, input: FormData | { title: string; category: string; date: string; start_time: string; end_time: string; description?: string }) {
    try {
      const payload = input instanceof FormData ? input : {
        title: input.title,
        category: input.category,
        date: input.date,
        start_time: input.start_time,
        end_time: input.end_time,
        description: input.description || '',
      };
      const updatedRaw = await firstValueFrom(this.api.updateEvent(id, payload));
      this.notification.success('Event updated successfully');
      const updatedObj = (updatedRaw as any)?.data ?? (updatedRaw as any)?.result ?? updatedRaw;
      const newDateStr = updatedObj?.date ? this.formatDate(this.parseDate(updatedObj.date)) : null;
      if (newDateStr && !this.activities().some((act) => act.date === newDateStr)) {
        this.rangeStart.set(this.startOfDay(this.parseDate(newDateStr)));
      }
      this.clearSelection();
      void this.reloadCurrentWeek();
    } catch (err) {
      console.error('Failed to update event', err);
      this.notification.error(getErrorMessage(err));
      throw err;
    }
  }

  async deleteEvent(id: string | number) {
    try {
      await firstValueFrom(this.api.deleteEvent(id));
      this.notification.success('Event cancelled');
      this.clearSelection();
      void this.reloadCurrentWeek();
    } catch (err) {
      console.error('Failed to cancel event', err);
      this.notification.error(getErrorMessage(err));
      throw err;
    }
  }

  createActivity(input: {
    title: string;
    cat: Category;
    t1: string;
    t2: string;
    date?: string;
    description?: string;
    priority?: string;
    status?: string;
    progress?: number;
  }): Promise<void> {
    const payload: PlannerActivityPayload = {
      title: input.title || 'Untitled Event',
      category: input.cat,
      date: input.date || this.formatDate(this.getAnchorDate()),
      start_time: this.normalizeTime(input.t1),
      end_time: this.normalizeTime(input.t2),
      progress: input.progress ?? 0,
      status: (input.status as any) || 'scheduled',
      priority: (input.priority as any) || null,
      description: input.description || '',
    };

    return this.createActivityOnServer(payload);
  }

  async updateActivity(id: string | number, payload: PlannerActivityPayload) {
    try {
      await firstValueFrom(this.api.updateActivity(id, payload));
      await this.reloadCurrentWeek();
      this.pushToast('Event updated');
    } catch (error) {
      console.error('Activity update failed', error);
      this.pushToast('Unable to update event');
      throw error;
    }
  }

  async deleteActivity(id: string | number) {
    try {
      await firstValueFrom(this.api.deleteActivity(id));
      await this.reloadCurrentWeek();
      this.selectActivity(null);
      this.pushToast('Event deleted');
    } catch (error) {
      console.error('Activity delete failed', error);
      this.pushToast('Unable to delete event');
    }
  }

  reloadCurrentRange() {
    return this.reloadCurrentWeek();
  }

  private async reloadCurrentWeek() {
    const token = ++this.loadSeq;

    if (this.hasNoCategoriesSelected()) {
      this.activities.set([]);
      return;
    }

    const rangeStart = this.startOfDay(this.rangeStart());

    // Calculate query range based on current view
    let queryStart: Date;
    let queryEnd: Date;

    const currentView = this.view();
    if (currentView === 'Day') {
      // Day view: fetch just that day
      queryStart = rangeStart;
      queryEnd = rangeStart;
    } else if (currentView === 'Month') {
      // Month view: fetch the full month
      queryStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      queryEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0);
    } else {
      // Week view (default): fetch just the 7-day week
      queryStart = rangeStart;
      queryEnd = addDays(rangeStart, 6);
    }

    const query = this.buildQuery(queryStart, queryEnd);

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const [feedData, dashboardData] = await Promise.all([
        firstValueFrom(this.api.getFeed(query)),
        firstValueFrom(this.api.getDashboard(query)),
      ]);

      if (token !== this.loadSeq) {
        return;
      }

      const allActivities = this.extractArray<PlannerActivityDto>(feedData);
      this.activities.set(
        allActivities
          .map((activity) => this.mapActivity(activity, rangeStart))
          .filter((activity): activity is Activity => activity !== null),
      );

      // Merge computed summary with dashboard data
      const computedSummary = this.computeSummaryFromActivities(allActivities);
      const notifications = this.extractArray<PlannerNotificationDto>(dashboardData?.notifications ?? []);
      const inbox = this.extractArray<PlannerInboxMessageDto>(dashboardData?.inbox ?? []);

      this.notifications.set(
        notifications.map((n) => ({
          id: n.id,
          kind: n.kind,
          icon: n.icon,
          title: n.title,
          body: n.body,
          when: n.when,
        })),
      );

      this.inbox.set(
        inbox.map((msg) => ({
          id: msg.id,
          unread: msg.unread,
          from: msg.sender,
          subject: msg.subject,
          preview: msg.preview,
          when: msg.when,
        })),
      );

      this.dashboard.set({
        summary: computedSummary,
        notifications: notifications,
        inbox: inbox,
        conflicts: dashboardData?.conflicts ?? [],
        overdue: dashboardData?.overdue ?? [],
        upcoming: dashboardData?.upcoming ?? [],
      } as any);

      this.lastSyncedAt.set(new Date());
    } catch (error) {
      if (token === this.loadSeq) {
        this.loadError.set('Unable to load planner data.');
        console.error('Planner data load failed', error);
      }
    } finally {
      if (token === this.loadSeq) {
        this.loading.set(false);
      }
    }
  }

  private buildQuery(start: Date, end: Date): PlannerActivityQuery {
    const query: PlannerActivityQuery = {
      start: this.formatDate(start),
      end: this.formatDate(end),
    };
    // Reference parity: "All Events" checked means no `categories` param at all (not
    // "every known category listed"), so the server's own "if not selected_categories"
    // fallback returns literally everything - including any category this app doesn't
    // enumerate client-side.
    if (!this.allEventsChecked()) {
      query.categories = this.catFilter().join(',');
    }
    return query;
  }

  /** Reference parity: zero categories selected (and "All Events" off) means show
   * nothing, without even calling the API - matching the reference JS's early
   * `successCallback([])` return in its events fetch function. */
  private hasNoCategoriesSelected(): boolean {
    return !this.allEventsChecked() && this.catFilter().length === 0;
  }

  private computeSummaryFromActivities(activities: PlannerActivityDto[]): PlannerSummaryDto {
    const categoryCount = {
      defect: 0,
      routine: 0,
      planned_routine: 0,
      trial: 0,
      audit: 0,
      others: 0,
    };

    let conflictCount = 0;
    let delayedCount = 0;
    let activeCount = 0;
    let upcomingCount = 0;
    const today = new Date();

    for (const activity of activities) {
      const cat = activity.category as keyof typeof categoryCount;
      if (cat in categoryCount) {
        categoryCount[cat]++;
      }

      if (activity.conflict) conflictCount++;
      if (activity.delayed) delayedCount++;
      if (activity.active) activeCount++;

      if (activity.date) {
        const actDate = new Date(activity.date);
        if (actDate >= today) upcomingCount++;
      }
    }

    return {
      category_cards: [
        { key: 'defect', label: 'Defect', count: categoryCount.defect },
        { key: 'routine', label: 'Routine', count: categoryCount.routine },
        { key: 'planned_routine', label: 'Planned Routine', count: categoryCount.planned_routine },
        { key: 'trial', label: 'Trials / Inspections', count: categoryCount.trial },
        { key: 'audit', label: 'Audit', count: categoryCount.audit },
        { key: 'others', label: 'Others', count: categoryCount.others },
      ],
      conflict_count: conflictCount,
      delayed_count: delayedCount,
      active_count: activeCount,
      upcoming_count: upcomingCount,
    };
  }

  private async createActivityOnServer(payload: PlannerActivityPayload) {
    try {
      const createdRaw = await firstValueFrom(this.api.createActivity(payload));
      const createdObj = (createdRaw as any)?.data ?? (createdRaw as any)?.result ?? createdRaw;

      if (createdObj && (createdObj.id || createdObj.id === 0)) {
        const rangeStart = this.startOfDay(this.rangeStart());
        const mapped = this.mapActivity(createdObj, rangeStart);
        if (mapped) {
          this.activities.update((cur) => [...cur.filter((a) => a.id !== mapped.id), mapped]);
        }
      }

      await this.reloadCurrentWeek();

      const createdId = String(createdObj?.id ?? '');
      if (createdId) {
        this.selectActivityWithDate(createdId, createdObj?.date ? this.formatDate(this.parseDate(createdObj.date)) : null);
      }
      this.pushToast('Event created');
    } catch (error) {
      console.error('Activity create failed', error);
      this.pushToast('Unable to create event');
      throw error;
    }
  }

  private mapActivity(dto: any, weekStart: Date): Activity | null {
    if (!dto) return null;

    const activityDate = this.parseDate(dto.date || dto.start);
    const isoDate = this.formatDate(activityDate);
    const diffMs = this.startOfDay(activityDate).getTime() - this.startOfDay(weekStart).getTime();
    const calculatedDay = Math.round(diffMs / MS_PER_DAY);
    const day = isNaN(calculatedDay) ? 0 : calculatedDay;

    // Normalize category based on feed response 'type' field
    let category: Category = (dto.category as Category) || 'others';
    if (dto.type === 'plan_flag') {
      category = 'plan_flag';
    } else if (dto.type === 'routine_dart' || dto.type === 'dart_raised' || dto.type === 'db_defect' || dto.type === 'dart_closed') {
      category = 'defect';
    } else if (dto.type === 'routine' || dto.type === 'planned_routine' || dto.type === 'running_hours_due' || dto.type === 'running_hours_plan') {
      category = dto.category || 'routine';
    } else if (dto.type === 'trial') {
      category = 'trial';
    } else if (dto.type === 'event') {
      category = (dto.category as Category) || 'others';
    } else if (dto.type === 'planner_activity') {
      category = (dto.category as Category) || 'others';
    }

    return {
      id: String(dto.id),
      day,
      date: isoDate,
      cat: category,
      type: dto.type,
      title: dto.title || 'Untitled Event',
      sub: dto.subtitle?.trim() || dto.department || dto.lane_label || '',
      description: dto.description?.trim() || dto.subtitle?.trim() || '',
      t: dto.time_label || this.buildTimeLabel(
        dto.start_time || (dto.start ? this.extractTimeFromTimestamp(dto.start) : null),
        dto.end_time || (dto.end ? this.extractTimeFromTimestamp(dto.end) : null)
      ),
      start_time: dto.start_time || (dto.start ? this.extractTimeFromTimestamp(dto.start) ?? undefined : undefined),
      end_time: dto.end_time || (dto.end ? this.extractTimeFromTimestamp(dto.end) ?? undefined : undefined),
      prog: dto.progress ?? 0,
      status: dto.status_label || (dto.status || dto.routine_state ? this.titleCase(dto.status || dto.routine_state) : undefined),
      priority: (dto.priority_label as Activity['priority']) ?? undefined,
      conflict: !!dto.conflict,
      delayed: !!dto.delayed,
      selected: !!dto.selected,
      isolation: !!dto.isolation,
      equipment: dto.equipment ?? undefined,
      ref: dto.ref_code || dto.reference || undefined,
      loc: dto.location ?? undefined,
      routine_id: dto.routine_id,
      defect_id: dto.defect_id,
      detail_pk: dto.detail_pk,
      dart_number: dto.dart_number,
      dart_state: dto.dart_state,
      plan_state: dto.plan_state,
      rh_state: dto.rh_state,
      created_by: dto.created_by,
      frequency: dto.frequency,
      spares_required: dto.spares_required,
      trial_type: dto.trial_type,
      trial_mode: dto.trial_mode,
      routine_name: dto.routine_name,
      section: dto.section,
      last_completion: dto.last_completion,
      maintop_no: dto.maintop_no,
    };
  }

  /** Like `mapActivity`, but keyed by absolute date instead of a day-offset
   *  from a loaded week - for the Year view, which spans many weeks/months. */
  private mapActivityForYear(dto: PlannerActivityDto): Activity | null {
    if (!dto) return null;

    const activityDate = this.parseDate(dto.date || dto.start);
    const isoDate = this.formatDate(activityDate);

    return {
      id: String(dto.id),
      day: 0,
      date: isoDate,
      cat: dto.category,
      type: dto.type as any,
      title: dto.title || 'Untitled Event',
      sub: dto.subtitle?.trim() || dto.department || dto.lane_label || '',
      description: dto.description?.trim() || dto.subtitle?.trim() || '',
      t: dto.time_label || this.buildTimeLabel(
        dto.start_time || (dto.start ? this.extractTimeFromTimestamp(dto.start) : null),
        dto.end_time || (dto.end ? this.extractTimeFromTimestamp(dto.end) : null)
      ),
      start_time: dto.start_time || (dto.start ? this.extractTimeFromTimestamp(dto.start) ?? undefined : undefined),
      end_time: dto.end_time || (dto.end ? this.extractTimeFromTimestamp(dto.end) ?? undefined : undefined),
      prog: dto.progress ?? 0,
      status: dto.status_label || (dto.status ? this.titleCase(dto.status.toString()) : undefined),
      priority: (dto.priority_label as Activity['priority']) ?? undefined,
      conflict: !!dto.conflict,
      delayed: !!dto.delayed,
      selected: !!dto.selected,
      isolation: !!dto.isolation,
      equipment: dto.equipment ?? undefined,
      ref: dto.reference ?? undefined,
      loc: dto.location ?? undefined,
      routine_id: dto.routine_id,
      defect_id: dto.defect_id,
      detail_pk: dto.detail_pk,
      dart_number: (dto as any).dart_number,
      dart_state: (dto as any).dart_state,
      plan_state: (dto as any).plan_state,
      rh_state: (dto as any).rh_state,
      created_by: dto.created_by ? dto.created_by : undefined,
      frequency: (dto as any).frequency,
      spares_required: (dto as any).spares_required,
      trial_type: (dto as any).trial_type,
      trial_mode: (dto as any).trial_mode,
      routine_name: (dto as any).routine_name,
      section: (dto as any).section,
      last_completion: (dto as any).last_completion,
      maintop_no: (dto as any).maintop_no,
    };
  }

  private mapNotification(dto: PlannerNotificationDto): Notification {
    return {
      id: dto.id,
      kind: dto.kind,
      icon: dto.icon,
      title: dto.title,
      body: dto.body,
      when: dto.when,
    };
  }

  private mapInbox(dto: PlannerInboxMessageDto): InboxMessage {
    return {
      id: dto.id,
      unread: dto.unread,
      from: dto.sender,
      subject: dto.subject,
      preview: dto.preview,
      when: dto.when,
    };
  }

  private parseDate(value: string | Date | null | undefined): Date {
    if (!value) {
      return new Date();
    }
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? new Date() : value;
    }
    const cleanStr = String(value).split('T')[0].trim();
    const parts = cleanStr.split('-').map((p) => parseInt(p, 10));
    if (parts.length >= 3 && !parts.some(isNaN)) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  private startOfDay(value: Date): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private formatDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private extractTimeFromTimestamp(timestamp: string): string | null {
    if (!timestamp) return null;
    const parts = timestamp.split('T');
    return parts.length > 1 ? parts[1].substring(0, 5) : null;
  }

  private buildTimeLabel(start?: string | null, end?: string | null): string {
    const startLabel = this.formatClock(start);
    const endLabel = this.formatClock(end);
    if (!startLabel && !endLabel) {
      return '';
    }
    if (!endLabel) {
      return startLabel;
    }
    if (!startLabel) {
      return endLabel;
    }
    return `${startLabel} - ${endLabel}`;
  }

  private formatClock(value?: string | null): string {
    if (!value) {
      return '';
    }

    const trimmed = value.trim();
    if (/am|pm/i.test(trimmed)) {
      return trimmed;
    }

    const parts = trimmed.split(':');
    if (parts.length < 2) {
      return trimmed;
    }

    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].padStart(2, '0');

    if (isNaN(hours)) {
      return value;
    }

    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) {
      hours = 12;
    }

    const hoursStr = String(hours).padStart(2, '0');
    return `${hoursStr}:${minutes} ${period}`;
  }

  private titleCase(value: string): string {
    if (!value) return '';
    return value
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private normalizeTime(value: string): string {
    if (!value) {
      return '00:00:00';
    }

    const trimmed = value.trim();
    const matchAmPm = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (matchAmPm) {
      let hours = parseInt(matchAmPm[1], 10);
      const minutes = matchAmPm[2];
      const seconds = matchAmPm[3] || '00';
      const period = matchAmPm[4].toUpperCase();

      if (period === 'PM' && hours < 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }

      return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
    }

    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
      const [h, m] = trimmed.split(':');
      return `${h.padStart(2, '0')}:${m}:00`;
    }

    if (/^\d{4}$/.test(trimmed)) {
      return `${trimmed.slice(0, 2)}:${trimmed.slice(2)}:00`;
    }

    return '00:00:00';
  }

  private getAnchorDate(): Date {
    return this.startOfDay(this.rangeStart());
  }

  getActivityDateKey(activity: Activity): string {
    const rangeStart = this.startOfDay(this.rangeStart());
    const date = addDays(rangeStart, activity.day);
    return this.formatDate(date);
  }
}
