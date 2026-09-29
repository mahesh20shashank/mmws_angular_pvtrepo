import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent } from '../planner-icon/planner-icon.component';
import { PlannerStore } from '../../store/planner.store';

/** Ephemeral success/info toasts. */
@Component({
  selector: 'app-toasts',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planner-toast.component.html',

})
export class ToastsComponent {
  protected readonly store = inject(PlannerStore);
}
