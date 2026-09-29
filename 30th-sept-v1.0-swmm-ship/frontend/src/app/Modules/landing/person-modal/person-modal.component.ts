import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy } from '@angular/core';

import { BaseModalComponent } from '../../../shared/components/modal/base-modal.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-person-modal',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './person-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./person-modal.component.scss'],
})
export class PersonModalComponent extends BaseModalComponent {


}
