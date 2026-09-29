import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, EventEmitter, Output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../../shared/components/icon/icon.component';

type TabType = 'one' | 'two' | 'three';

@Component({
  selector: 'app-info-modal',
  standalone: true,
  imports: [CommonModule, IconComponent, ButtonComponent],
  templateUrl: './info-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./info-modal.component.scss']
})
export class InfoModalComponent {
  @Output() closeModal = new EventEmitter<void>();

  activeTab = signal<TabType>('one');

  tabs: { id: TabType, label: string }[] = [
    { id: 'one', label: 'About SWMM' },
    { id: 'two', label: 'System Integration Tree' },
    { id: 'three', label: 'Why SWMM is Useful?' }
  ];

  /** `icon` is a Lucide icon name (see shared/components/icon). */
  capabilities = [
    {
      icon: 'ship',
      title: 'Real-Time Visibility',
      description:
        'Monitor operational readiness, material status, and workflow progress live.',
      theme: 'purple'
    },
    {
      icon: 'box',
      title: 'Integrated Logistics Management',
      description:
        'Connect demands, procurement, receipts, and inventory workflows seamlessly.',
      theme: 'pink'
    },
    {
      icon: 'anchor',
      title: 'Centralized Operations',
      description:
        'Access maintenance, logistics, defects, surveys, demands, and receipts from a single platform.',
      theme: 'blue'
    },
    {
      icon: 'navigation',
      title: 'Faster Decision-Making',
      description:
        'Improve coordination, accountability, and fleet efficiency with centralized operational data.',
      theme: 'cyan'
    }
  ];

  /** `icon` is a Lucide icon name (see shared/components/icon). */
  benefits = [
    {
      icon: 'chart-line',
      title: 'Real Time Visibility',
      description:
        'Track maintenance activities, defects, material status, and operational readiness in real time across the entire maintenance lifecycle.'
    },
    {
      icon: 'id-card',
      title: 'One Login, One Screen',
      description:
        'Access maintenance, defects, spares, surveys, demands, receipts, and logistics workflows through one integrated interface.'
    },
    {
      icon: 'scan-eye',
      title: 'Focus on your Job',
      description:
        'Minimize time spent on coordination, paperwork, and repetitive data entry so ship staff can focus on operational responsibilities.'
    },
    {
      icon: 'network',
      title: 'Coordination overhead',
      description:
        'Enable secure and silent background synchronization between ship systems, dockyard ERP, logistics, and maintenance platforms.'
    },
    {
      icon: 'shield-alert',
      title: 'Fewer Errors',
      description:
        'Reduce manual errors through prefilled data, automated validations, intelligent workflows, and standardized processes.'
    },
    {
      icon: 'calendar-sync',
      title: 'Automatic Tracking',
      description:
        'Automatically triggers and synchronizes workflows with CMMS, ILMS, WLMS, ITTTM, and other naval systems without manual intervention.'
    }
  ];

  setTab(tab: TabType) {
    this.activeTab.set(tab);
  }

  trackByIndex(index: number) {
    return index;
  }

}
