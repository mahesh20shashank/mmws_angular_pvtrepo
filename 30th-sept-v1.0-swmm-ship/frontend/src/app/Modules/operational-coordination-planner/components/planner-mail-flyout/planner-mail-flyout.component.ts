import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, inject,
} from '@angular/core';
import { IconComponent } from '../planner-icon/planner-icon.component';
import { PlannerStore } from '../../store/planner.store';

/** Inbox flyout (mail icon). */
@Component({
  selector: 'app-mail-flyout',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './planner-mail-flyout.component.scss',
  templateUrl: './planner-mail-flyout.component.html',

})
export class MailFlyoutComponent {
  protected readonly store = inject(PlannerStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @HostListener('document:mousedown', ['$event'])
  protected onDocClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (this.host.nativeElement.contains(t)) return;
    if (t.closest('[data-mail]')) return;
    this.store.mailFlyoutOpen.set(false);
  }
}
