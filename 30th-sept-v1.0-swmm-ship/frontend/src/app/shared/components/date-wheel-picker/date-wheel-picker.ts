import { ButtonComponent } from '../button/button.component';
import { Component, EventEmitter, Output , ViewEncapsulation} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-date-wheel-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  templateUrl: './date-wheel-picker.html',
  styleUrl: './date-wheel-picker.css',
  encapsulation: ViewEncapsulation.None
})
export class DateWheelPicker {

  @Output() dateRangeSelected = new EventEmitter<{
    from: string;
    to: string;
  }>();

  @Output() closePicker = new EventEmitter<void>();

    close() {
      this.closePicker.emit();
    }

  fromDate = '2001-04-04';
  toDate = '2001-04-04';

  applyDateRange() {
    this.dateRangeSelected.emit({
      from: this.fromDate,
      to: this.toDate
    });
  }
}
