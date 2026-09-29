import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, EventEmitter, Output, ChangeDetectionStrategy } from '@angular/core';

import { IconComponent } from '../../../shared/components/icon/icon.component';


@Component({
  selector: 'app-sync-modal',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: './sync-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./sync-modal.component.scss'],
})
export class SyncModalComponent {

  @Output() closeModal = new EventEmitter<void>();

  syncData = [
    {
      name: 'CMMS',
      lastSync: '05-08-2025 At 10:58 AM'
    },
    {
      name: 'ILMS',
      lastSync: '05-08-2025 At 10:58 AM'
    },
    {
      name: 'HRCDF',
      lastSync: '05-08-2025 At 10:58 AM'
    },
    {
      name: 'HULL INSIGHTS',
      lastSync: '05-08-2025 At 10:58 AM'
    },
    {
      name: 'ACQCDF',
      lastSync: '05-08-2025 At 10:58 AM'
    },
    {
      name: 'ITTM',
      lastSync: '05-08-2025 At 10:58 AM'
    }
  ];
}
