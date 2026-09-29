import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-master-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './master-card.html',
  styleUrl: './master-card.css',
})
export class MasterCard {
  @Input() cardTitle = '';

  @Input() showSyncButtons = false;
  @Input() cardHeight = '';

  // NEW (Optional Header Stats)
  @Input() showHeaderStats = false;

  @Input() headerStats = {
    due: 0,
    dueLessThan3M: 0,
    due3To6M: 0,
    other: 0
  };

  @Output() step1Click = new EventEmitter<void>();
  @Output() step2Click = new EventEmitter<void>();

  onStep1Click(): void {
    this.step1Click.emit();
  }

  onStep2Click(): void {
    this.step2Click.emit();
  }
}
