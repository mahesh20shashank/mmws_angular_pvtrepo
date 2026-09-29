import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MasterCard } from '../../refit-maintenance/master-card/master-card';
import { IconComponent } from '../../../shared/components/icon/icon.component';

// Mirrors the Django source exactly: ops_maintainance's "Other Utilities" page is itself
// a "Development in Progress" placeholder (byte-identical to endurance_calculator.html).
@Component({
  selector: 'app-other-utilities',
  standalone: true,
  imports: [CommonModule, MasterCard, IconComponent],
  templateUrl: './other-utilities.html',
  styleUrl: './other-utilities.css',
})
export class OtherUtilities {}
