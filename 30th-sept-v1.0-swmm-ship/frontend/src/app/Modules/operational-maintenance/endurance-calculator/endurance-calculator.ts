import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MasterCard } from '../../refit-maintenance/master-card/master-card';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-endurance-calculator',
  standalone: true,
  imports: [CommonModule, MasterCard, IconComponent],
  templateUrl: './endurance-calculator.html',
  styleUrl: './endurance-calculator.css',
})
export class EnduranceCalculator {
  readonly progress = 80;
}
