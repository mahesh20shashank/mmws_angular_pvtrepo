import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, inject,
} from '@angular/core';
import { IconComponent } from '../planner-icon/planner-icon.component';
import { PlannerStore } from '../../store/planner.store';

/** Notifications flyout (bell icon). */
@Component({
  selector: 'app-notif-flyout',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './planner-notification-flyout.component.scss',
  templateUrl: './planner-notification-flyout.component.html',

})
export class NotifFlyoutComponent {
  protected readonly store = inject(PlannerStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @HostListener('document:mousedown', ['$event'])
  protected onDocClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (this.host.nativeElement.contains(t)) return;
    if (t.closest('[data-bell]')) return;
    this.store.notifFlyoutOpen.set(false);
  }
}
