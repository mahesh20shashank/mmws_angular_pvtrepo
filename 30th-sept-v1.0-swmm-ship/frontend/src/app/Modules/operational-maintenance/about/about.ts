import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MasterCard } from '../../refit-maintenance/master-card/master-card';

@Component({
  selector: 'app-about-op-maintenance',
  standalone: true,
  imports: [CommonModule, MasterCard],
  templateUrl: './about.html',
})
export class About {}
