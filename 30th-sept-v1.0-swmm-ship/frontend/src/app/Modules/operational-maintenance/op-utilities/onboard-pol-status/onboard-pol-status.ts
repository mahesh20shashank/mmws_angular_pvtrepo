import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';
import { PolStatusDashboard } from './pol-status-dashboard/pol-status-dashboard';
import { RasMonitor } from './ras-monitor/ras-monitor';
import { RasHistory } from './ras-history/ras-history';
import { TankMasters } from './tank-masters/tank-masters';

type PolTab = 'dashboard' | 'ras-monitor' | 'history' | 'tank-masters';

// Mirrors Django's tank/tank_main_page.html's help_guidance_body block.
const HELP_HTML = `
  <h6 class="fw-bold mb-1">What each tab is for</h6>
  <ul class="mb-0">
    <li><strong>Dashboard</strong> - summary cards and charts of holdings, capacity, and top-up required for each tank category, with "Add current sounding" to log a new reading.</li>
    <li><strong>RAS Monitor</strong> - track a Replenishment at Sea fuelling operation, from Start Fueling through completion.</li>
    <li><strong>History</strong> - past soundings and fuelling records.</li>
    <li><strong>Tank Masters</strong> - reference data for tank categories, fluids, and units.</li>
  </ul>
`;

// Mirrors Django's tank/tank_main_page.html — page-level tabs (Dashboard / RAS Monitor /
// History / Tank Masters) inside the "Onboard POL Status" header tab.
@Component({
  selector: 'app-onboard-pol-status',
  standalone: true,
  imports: [CommonModule, IconComponent, HelpGuidance, PolStatusDashboard, RasMonitor, RasHistory, TankMasters, ButtonComponent],
  templateUrl: './onboard-pol-status.html',
})
export class OnboardPolStatus {
  readonly helpHtml = HELP_HTML;

  activeTab: PolTab = 'dashboard';

  setTab(tab: PolTab): void {
    this.activeTab = tab;
  }
}
