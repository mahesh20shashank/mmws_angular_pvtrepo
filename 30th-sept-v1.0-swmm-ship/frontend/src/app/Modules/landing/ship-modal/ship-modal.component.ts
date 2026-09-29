import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, Input, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseModalComponent } from '../../../shared/components/modal/base-modal.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThisShipService } from '../../../Core/services/ship/this-ship.service';

export interface ShipSpecification {
  theme?: string;
  label?: string;
  value?: string | number;
  icon?: string;
}

export interface ShipData {
  ship_image?: string;
  name?: string;
  ship_description?: string;
  specifications?: ShipSpecification[];
}

@Component({
  selector: 'app-ship-modal',
  standalone: true,
  imports: [CommonModule, IconComponent, ButtonComponent],
  templateUrl: './ship-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./ship-modal.component.scss'],
})
export class ShipModalComponent extends BaseModalComponent {

  @Input() shipData?: ShipData;

  // Developed with Understanding: this ship's display name for the modal heading and image alt,
  // read from the signal the landing page loads.
  readonly thisShip = inject(ThisShipService);

  /** Values are Lucide icon names (see shared/components/icon). */
  iconMap: Record<string, string> = {
    Ship: 'ship',
    Box: 'box',
    Anchor: 'anchor',
    Navigation: 'navigation'
  };

  getIcon(icon: string | undefined) {
    if (!icon) return 'ship';
    return this.iconMap[icon] || 'ship';
  }

}
