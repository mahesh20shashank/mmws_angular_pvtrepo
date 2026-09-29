import { Component, Input, HostBinding, ViewEncapsulation, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'outline' | 'danger' | 'success' | 'ghost' | 'pill' | 'none';
export type ButtonSize = 'xs' | 's' | 'sm' | 'm' | 'md' | 'L' | 'lg' | 'none';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.css']
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'none'; // Default to none so mass-migrated buttons keep their original styling untouched
  @Input() size: ButtonSize = 'none';
  @Input() customClass = '';
  @Input({ transform: booleanAttribute }) active = false;
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input({ transform: booleanAttribute }) disabled: boolean | undefined | null = false;
  @Input() icon?: string;
  @Input() iconSize?: number;
  @Input() iconClass?: string;
  @Input() label?: string;
  @Input() customStyle?: Record<string, string> | string;
  @Input() title?: string;

  @HostBinding('class')
  get buttonClasses(): string {
    const vClass = this.variant === 'none' ? '' : `btn-${this.variant}`;
    const rawSize = (this.size || '').toString().trim();
    let sClass = '';
    if (rawSize && rawSize !== 'none') {
      if (rawSize === 'L') {
        sClass = 'btn-l';
      } else {
        sClass = `btn-${rawSize.toLowerCase()}`;
      }
    }
    const hasSize = !!sClass;
    const baseClass = (this.variant === 'none' && !hasSize) ? '' : 'btn';
    return `${baseClass} ${vClass} ${sClass} ${this.customClass} ${this.active ? 'active' : ''}`.trim();
  }

  @HostBinding('attr.disabled')
  get hostDisabled() {
    return this.disabled ? '' : null;
  }
}
