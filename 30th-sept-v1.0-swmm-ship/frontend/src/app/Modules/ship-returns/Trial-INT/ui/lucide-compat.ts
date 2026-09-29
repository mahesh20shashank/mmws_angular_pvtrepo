import { Component, Input, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'lucide-icon',
  standalone: true,
  template: `<i></i>`,
})
export class LucideIconComponent {
  @Input() img: any;
  @Input() name: any;
  @Input() size: any;
  @Input() color: any;
  @Input() class: any;
  @Input() icon: any;
}

export const RotateCcw: any = 'RotateCcw';
export const Save: any = 'Save';
export const SaveAllIcon: any = 'SaveAllIcon';
export const Trash: any = 'Trash';
export const PenIcon: any = 'PenIcon';
export const FileText: any = 'FileText';
export const Star: any = 'Star';

@NgModule({
  imports: [CommonModule, LucideIconComponent],
  exports: [LucideIconComponent],
})
export class LucideAngularModule {}
