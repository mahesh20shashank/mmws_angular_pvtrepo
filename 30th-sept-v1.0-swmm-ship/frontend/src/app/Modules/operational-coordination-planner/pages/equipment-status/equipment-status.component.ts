import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { EQUIPMENT_SECTIONS, EquipmentSection } from '../../constants/data';
import { EquipmentStatusApiService, EquipmentStatusItem } from '../../services/equipment-status-api.service';

@Component({
  selector: 'app-equipment-status',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equipment-status.component.html',
  styleUrl: './equipment-status.component.css',
})
export class EquipmentStatusComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(EquipmentStatusApiService);

  protected readonly sections = EQUIPMENT_SECTIONS;
  protected readonly items = signal<Map<string, EquipmentStatusItem[]>>(new Map());
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly expandedLabel = signal<string>(
    this.route.snapshot.queryParamMap.get('section') ?? EQUIPMENT_SECTIONS[0].label,
  );

  constructor() {
    this.loadEquipmentStatus();
  }

  private async loadEquipmentStatus(): Promise<void> {
    try {
      const data = await firstValueFrom(this.api.getEquipmentStatus());
      const map = new Map<string, EquipmentStatusItem[]>([
        ['AER', data.AER_equipment_list],
        ['FER', data.FER_equipment_list],
        ['OMS', data.OMS_equipment_list],
        ['AMR', data.AMR_equipment_list],
      ]);
      this.items.set(map);
      this.error.set(null);
    } catch (err) {
      this.error.set('Failed to load equipment status');
      console.error('Equipment status load failed:', err);
    } finally {
      this.loading.set(false);
    }
  }

  protected isExpanded(section: EquipmentSection): boolean {
    return this.expandedLabel() === section.label;
  }

  protected toggle(section: EquipmentSection): void {
    this.expandedLabel.set(this.isExpanded(section) ? '' : section.label);
  }
}
