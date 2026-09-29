import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-panel-card',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './panel-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './panel-card.css',
})
export class PanelCard {
  @Input() title = '';
  @Input() subtitle = '';
  /** Lucide icon name shown in the header swatch. */
  @Input() icon = '';
  @Input() iconColor = 'var(--icon-accent)';
  @Input() iconBg = 'rgba(0,136,255,0.16)';
}
