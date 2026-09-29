import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';

// Mirrors Django's ops_maintainance/endurance_calculator.html's help_guidance_body block.
const HELP_HTML = `
  <p class="mb-0">This page is under development - the endurance calculator is not available yet.</p>
`;

// Mirrors Django's ops_maintainance/endurance_calculator.html exactly — the source page
// itself is an unimplemented "Development in Progress" stub, not a real calculator.
@Component({
  selector: 'app-endurance-calculator',
  standalone: true,
  imports: [CommonModule, IconComponent, HelpGuidance],
  templateUrl: './endurance-calculator.html',
  styleUrl: './endurance-calculator.css',
})
export class EnduranceCalculator {
  readonly helpHtml = HELP_HTML;
}
