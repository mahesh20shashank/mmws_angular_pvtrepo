import { ButtonComponent } from '../components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MovementAndConfigurationHistory } from '../../Modules/operational-maintenance/op-maintenance-dashboard/maintenance-dashboard.model';

@Component({
  selector: 'app-movement-history',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './movement-history.html',
  styleUrl: './movement-history.css',
})
export class MovementHistory {
  @Input() data!: MovementAndConfigurationHistory;
  @Input() title = "Movement & Configuration History";

  @Input() cardHeight = '';

  isPopupOpen = false;

  openHistoryPopup(): void {
    this.isPopupOpen = true;
  }

  closeHistoryPopup(): void {
    this.isPopupOpen = false;
  }

  formatDate(date: string): string {
    if (!date) return '';

    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  historyItems = [
    {
      date: '12 May 2025',
      title: 'Relocated from ER-02-01 to ER-02-03',
      description: 'ME-04 LO Pump'
    },
    {
      date: '05 May 2025',
      title: 'Temporary fitment removed',
      description: 'Portable Filter Unit'
    },
    {
      date: '28 Apr 2025',
      title: 'Replacement Recorded',
      description: 'DG-01 replaced by DG-02'
    },
    {
      date: '20 Apr 2025',
      title: 'Configuration Modification',
      description: 'Added Bypass line to LO System'
    },
    {
      date: '05 May 2025',
      title: 'Temporary fitment removed',
      description: 'Portable Filter Unit'
    },
    {
      date: '28 Apr 2025',
      title: 'Replacement Recorded',
      description: 'DG-01 replaced by DG-02'
    },
    {
      date: '20 Apr 2025',
      title: 'Configuration Modification',
      description: 'Added Bypass line to LO System'
    },
    {
      date: '28 Apr 2025',
      title: 'Replacement Recorded',
      description: 'DG-01 replaced by DG-02'
    },
    {
      date: '20 Apr 2025',
      title: 'Configuration Modification',
      description: 'Added Bypass line to LO System'
    },
    {
      date: '05 May 2025',
      title: 'Temporary fitment removed',
      description: 'Portable Filter Unit'
    },
    {
      date: '28 Apr 2025',
      title: 'Replacement Recorded',
      description: 'DG-01 replaced by DG-02'
    },
    {
      date: '20 Apr 2025',
      title: 'Configuration Modification',
      description: 'Added Bypass line to LO System'
    }

  ];
}
