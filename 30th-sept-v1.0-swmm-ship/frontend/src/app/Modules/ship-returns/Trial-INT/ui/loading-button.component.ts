import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-loading-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      [disabled]="disabled || loading"
      [attr.aria-busy]="loading"
      class="form-card-footer-btn inline-flex items-center justify-center gap-2 rounded-full font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50"
      [ngClass]="colorClass"
      (click)="clicked.emit()"
    >
      <span *ngIf="loading" class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
      <span>{{ label }}</span>
    </button>
  `,
  styles: [`
    :host {
      display: inline-block;
    }
  `],
})
export class LoadingButtonComponent {
  @Input() label = '';
  @Input() color = '';
  @Input() icon = '';
  @Input() loading = false;
  @Input() disabled = false;
  @Output() clicked = new EventEmitter<void>();

  get colorClass(): string {
    switch (this.color) {
      case 'submit':
      case 'green':
      case 'primary':
        return 'pt-glass-btn-primary';
      case 'blue':
        return 'pt-glass-btn-blue';
      case 'red':
      case 'danger':
        return 'pt-glass-btn-danger';
      case 'draft':
      case 'save':
      default:
        return 'pt-glass-table__control';
    }
  }
}
