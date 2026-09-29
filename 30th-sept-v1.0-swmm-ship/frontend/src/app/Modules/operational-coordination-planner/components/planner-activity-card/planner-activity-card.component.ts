import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../planner-icon/planner-icon.component';
import { Activity } from '../../constants/data';

/** Single activity card rendered inside a calendar cell. */
@Component({
  selector: 'app-activity-card',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './planner-activity-card.component.scss',
  templateUrl: './planner-activity-card.component.html',

})
export class ActivityCardComponent {
  readonly a = input.required<Activity>();
  readonly selected = input<boolean>(false);
  readonly compact = input(false);
  readonly stacked = input(false);
  cls() {
  return [
    'activity',
    `cat-${this.a().cat}`,
    this.selected() ? 'selected' : '',
    this.compact() ? 'compact' : '',
    this.stacked() ? 'stacked' : '',
    this.a().conflict ? 'conflict' : '',
    this.a().delayed ? 'delayed' : ''
  ]
    .filter(Boolean)
    .join(' ');
  }
}
