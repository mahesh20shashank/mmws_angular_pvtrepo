import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PlannerStore } from '../../store/planner.store';
import { ViewMode, formatRangeFromDate } from '../../constants/data';
import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';

import { FilterPanelComponent } from '../../components/planner-filter-panel/planner-filter-panel.component';
import { ControlsComponent } from '../../components/planner-controls/planner-controls.component';
import { CalendarComponent } from '../../components/planner-calendar/planner-calendar.component';
import { DetailComponent } from '../../components/planner-detail-panel/planner-detail-panel.component';
import { ActivityDetailsModalComponent } from '../../components/planner-activity-details-modal/planner-activity-details-modal.component';
import { NewActivityModalComponent } from '../../components/planner-new-activity-modal/planner-new-activity-modal.component';
import { NotifFlyoutComponent } from '../../components/planner-notification-flyout/planner-notification-flyout.component';
import { MailFlyoutComponent } from '../../components/planner-mail-flyout/planner-mail-flyout.component';
import { OverdueDartsModalComponent } from '../../components/planner-overdue-darts-modal/planner-overdue-darts-modal.component';
import { ShiftDueDateComponent } from '../../components/planner-shift-due-date/planner-shift-due-date.component';
import { DayEventsModalComponent } from '../../components/planner-day-events-modal/planner-day-events-modal.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { Input } from '@angular/core';

@Component({
  selector: 'app-operational-coordination-planner',
  standalone: true,
  imports: [
    FilterPanelComponent,
    ControlsComponent,
    CalendarComponent,
    DetailComponent,
    ActivityDetailsModalComponent,
    NewActivityModalComponent,
    NotifFlyoutComponent,
    MailFlyoutComponent,
    OverdueDartsModalComponent,
    ShiftDueDateComponent,
    DayEventsModalComponent,
    HelpGuidance,
    ModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planner.component.html',
  styleUrls: ['./planner.component.scss'],
})
export class OperationalCoordinationPlannerComponent implements OnInit {
  protected readonly store = inject(PlannerStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  @Input() compact = false;
  protected readonly rangeLabel = computed(() =>
    formatRangeFromDate(this.store.rangeStart())
  );
  private static readonly CALENDAR_PATH = '/afterAuth/activity/calendar';

  private readonly urlSyncEffect = effect(() => {
    const view = this.store.view();
    const date = this.store.rangeStart();
    const search = this.store.searchQuery();
    if (isNaN(date.getTime())) {
      return;
    }
    const dateStr = date.toISOString().split('T')[0];
    const query = new URLSearchParams();

    if (view !== 'Week') query.set('view', view);
    if (dateStr) query.set('date', dateStr);
    if (search) query.set('search', search);
    if (!location.pathname.startsWith(OperationalCoordinationPlannerComponent.CALENDAR_PATH)) {
      return;
    }

    const queryStr = query.toString();
    const url = queryStr
      ? `${OperationalCoordinationPlannerComponent.CALENDAR_PATH}?${queryStr}`
      : OperationalCoordinationPlannerComponent.CALENDAR_PATH;
    window.history.replaceState({}, '', url);
  });

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    // Skip if modal/input is focused
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'n':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.store.openCreateActivity();
        }
        break;
      case 'y':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.store.view.set(this.store.view() === 'Year' ? 'Week' : 'Year');
        }
        break;
      case 'm':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.store.view.set('Month');
        }
        break;
      case 'w':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.store.view.set('Week');
        }
        break;
      case 'd':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.store.view.set('Day');
        }
        break;
      case 'arrowleft':
        event.preventDefault();
        this.store.view() === 'Year' ? this.store.stepYear(-1) : this.store.stepWeek(-1);
        break;
      case 'arrowright':
        event.preventDefault();
        this.store.view() === 'Year' ? this.store.stepYear(1) : this.store.stepWeek(1);
        break;
      case 't':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.store.goToday();
        }
        break;
      case '/':
      case '?':
        event.preventDefault();
        alert('Keyboard Shortcuts:\nCtrl+N: New Activity\nCtrl+Y: Toggle Year View\nCtrl+M: Month View\nCtrl+W: Week View\nCtrl+D: Day View\n←/→: Previous/Next\nCtrl+T: Today');
        break;
    }
  }

  readonly helpGuidanceHtml = `
    <h6>What this calendar is for</h6>
    <p>A single forward view of everything your department must act on &mdash; routines falling due, the point at which each must be planned, DARTs that must be closed, trials, and any activity the HOD adds. It is department-scoped: you see your own department's work.</p>

    <h6>Who can do what</h6>
    <table style="font-size: 0.9rem; width: 100%; border: 1px solid #ddd;">
      <tr style="background-color: #f5f5f5;">
        <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Action</th>
        <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">HOD</th>
        <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">HOD Writer</th>
        <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Everyone else</th>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">View calendar, legend and all details</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Yes</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Yes</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Yes</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">Add a departmental activity</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Yes</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Yes</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">No</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">Shift a routine's calendar date</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Yes</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Yes</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">No</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">Add a general event (+ New Event)</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Yes</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Yes</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">Dy HOD only</td>
      </tr>
    </table>
    <p style="margin-top: 12px;">The HOD Writer works <strong>on the HOD's instructions</strong> and holds the same rights on this page. Every other role has full visibility but cannot change anything here.</p>

    <h6>Reading the colours</h6>
    <ul>
      <li><strong>Steel blue</strong> &mdash; upcoming, nothing to do yet.</li>
      <li><strong>Orange</strong> &mdash; action is now due: a routine needs planning, or a DART is open with time still in hand.</li>
      <li><strong>Red</strong> &mdash; the date has passed and the work is not done. <strong>This is the HOD's alarm.</strong></li>
      <li><strong>Grey</strong> &mdash; done, planned, or closed. Nothing outstanding.</li>
      <li><strong>Teal</strong> &mdash; a running-hours routine with a tentative date.</li>
      <li><strong>Slate</strong> &mdash; a departmental activity added by the HOD or HOD Writer.</li>
    </ul>

    <h6>How to plan the next six months</h6>
    <ol>
      <li><strong>Start with red.</strong> Anything red is already late &mdash; unplanned routines past their planning point, or DARTs past their closing date. Clear these first.</li>
      <li><strong>Then work the orange plan flags.</strong> A routine must be planned <strong>six months before</strong> it falls due. Use Shift Due Date to stagger crowded days.</li>
      <li><strong>Look for crowded days.</strong> A number at the top right of a day cell means several routines fall due together. Click the day to see them listed, then use <strong>Shift Due Date</strong> to stagger them.</li>
      <li><strong>Check DARTs are closing.</strong> Every DART shows its opening date, its tentative closing date and, once closed, the actual closing date.</li>
      <li><strong>Treat teal as an estimate.</strong> Running-hours routines have no fixed calendar date. Their date is worked out at an assumed <strong>eight running hours per day</strong>.</li>
    </ol>

    <h6>Things worth knowing</h6>
    <ul>
      <li>Only routines of <strong>quarterly periodicity and longer</strong> appear on the calendar.</li>
      <li>Use the filter checkboxes to show one category at a time.</li>
      <li>Click any marker for its detail popup to see more information.</li>
      <li>A routine tagged <strong>"calc"</strong> has its date computed from its own completion history.</li>
    </ul>
  `;


  ngOnInit() {
    const initialView = this.route.snapshot.data['initialView'] as ViewMode | undefined;
    if (initialView) {
      this.store.view.set(initialView);
      if (initialView === 'Year') {
        void this.store.loadYear(this.store.yearRef());
      }
    }

    const params = new URLSearchParams(window.location.search);
    const urlView = params.get('view') as ViewMode | null;
    const urlDate = params.get('date');
    const urlSearch = params.get('search');

    if (urlView) this.store.view.set(urlView);
    if (urlDate) {
      const parsedUrlDate = new Date(urlDate);
      if (!isNaN(parsedUrlDate.getTime())) {
        this.store.setRangeStart(parsedUrlDate);
      }
    }
    if (urlSearch) this.store.searchQuery.set(urlSearch);

    void this.store.init();
  }
}
