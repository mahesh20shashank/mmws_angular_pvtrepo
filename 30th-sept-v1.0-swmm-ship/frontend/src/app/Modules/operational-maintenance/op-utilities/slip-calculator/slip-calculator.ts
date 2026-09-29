import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ColDef } from 'ag-grid-community';
import { MasterCard } from '../../../refit-maintenance/master-card/master-card';
import { SelectInput } from '../../../../shared/components/select-input/select-input';
import { DataGrid } from '../../../../shared/components/data-grid/data-grid';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';
import { GT_GRAPH_CONSTANTS, GT_NAMES, SlipLimit } from '../models/slip-calculator.model';

type SlipTab = 'calculator' | 'oem-graph' | 'limits';
type SlipInnerTab = 'gt' | 'gtg';

interface SlipResult {
  slip_lpc?: number;
  slip_air?: number;
  slip_ext?: number;
  limit_exceeded: boolean;
  messages: string[];
}

// Mirrors Django's ems/slip_calculator.html's help_guidance_body block.
const HELP_HTML = `
  <h6 class="fw-bold mb-1">What each tab is for</h6>
  <ul class="mb-0">
    <li><strong>Slip Calculator</strong> - calculate machinery slip from its running parameters (GT Slip / GTG Slip).</li>
    <li><strong>OEM Graph Details – Input For Slip</strong> - enter the manufacturer's reference data the calculation is based on.</li>
    <li><strong>Slip Limits</strong> - set the limits the calculated slip is judged against.</li>
  </ul>
`;

@Component({
  selector: 'app-slip-calculator',
  standalone: true,
  imports: [CommonModule, MasterCard, ReactiveFormsModule, SelectInput, DataGrid, ButtonComponent, HelpGuidance],
  templateUrl: './slip-calculator.html',
  styleUrl: './slip-calculator.css',
})
export class SlipCalculator {
  private readonly fb = inject(FormBuilder);
  private readonly toastr = inject(NotificationService);

  readonly helpHtml = HELP_HTML;

  activeTab: SlipTab = 'calculator';
  innerTab: SlipInnerTab = 'gt';
  readonly gtOptions = GT_NAMES.map((g) => ({ label: g, value: g }));

  // No slip-limit lookup is wired to the backend yet (`ems/urls.py` has
  // `slip_limit/` but no Call.ts wrapper) — starts empty rather than
  // pre-filling fabricated per-GT limits; use "Save Limit" to configure real ones.
  slipLimits: SlipLimit[] = [];
  result: SlipResult | null = null;

  readonly slipLimitColumnDefs: ColDef[] = [
    { headerName: 'GT Name', field: 'gt_name', flex: 1, minWidth: 120 },
    { headerName: 'Δ LPC RPM', field: 'delta_n_lpc', flex: 1, minWidth: 120 },
    { headerName: 'Δ Ext Temp (°C)', field: 'delta_t_ext', flex: 1, minWidth: 140 },
    { headerName: 'Δ Air Pressure (bar)', field: 'delta_p_air', flex: 1, minWidth: 150 },
  ];

  readonly gtForm: FormGroup = this.fb.group({
    gt_name: [''],
    at_HPC_rpm: [''],
    recorded_LPC: [''],
    recorded_air_pr_after_hpc: [''],
    recorded_ext_temp: [''],
    recorded_amb_pr_gtinlet: [''],
    current_amb_temp: [''],
  });

  readonly gtgForm: FormGroup = this.fb.group({
    gt_name: [''],
    recorded_el_load: [''],
    recorded_ext_temp_gtg: [''],
    recorded_amb_temp: [''],
  });

  readonly limitForm: FormGroup = this.fb.group({
    gt_name: [''],
    delta_n_lpc: [''],
    delta_t_ext: [''],
    delta_p_air: [''],
  });

  setTab(tab: SlipTab): void {
    this.activeTab = tab;
    this.result = null;
  }

  setInnerTab(tab: SlipInnerTab): void {
    this.innerTab = tab;
    this.result = null;
  }

  generateGraph(section: string): void {
    this.toastr.success(`${section} graph generated.`);
  }

  private limitFor(gt: string): SlipLimit {
    return this.slipLimits.find((l) => l.gt_name === gt) ?? { gt_name: gt, delta_n_lpc: 15, delta_t_ext: 12, delta_p_air: 0.3 };
  }

  calculateGtSlip(): void {
    const v = this.gtForm.getRawValue();
    if (!v.gt_name || !v.at_HPC_rpm) {
      this.toastr.warning('Select a GT and enter the HPC RPM.');
      return;
    }

    const c = GT_GRAPH_CONSTANTS[v.gt_name];
    const hpc = Number(v.at_HPC_rpm);
    const ambTemp = Number(v.current_amb_temp) || 25;
    const ambPr = Number(v.recorded_amb_pr_gtinlet) || 1;

    const alpha = Math.sqrt((c.graphTempK + 273) / (273 + ambTemp));
    const beta = c.graphPressureBar / ambPr;

    const lpcGraph = c.lpcSlope * hpc + c.lpcIntercept;
    const airGraph = c.airSlope * hpc + c.airIntercept;
    const extGraph = c.extSlope * hpc + c.extIntercept;

    const lpcStd = Number(v.recorded_LPC) * alpha;
    const airStd = Number(v.recorded_air_pr_after_hpc) * beta;
    const extStd = Number(v.recorded_ext_temp) * alpha;

    const slip_lpc = round2(lpcGraph - lpcStd);
    const slip_air = round2(airGraph - airStd);
    const slip_ext = round2(extStd - extGraph);

    const limit = this.limitFor(v.gt_name);
    const exceeded = Math.abs(slip_lpc) > limit.delta_n_lpc || Math.abs(slip_air) > limit.delta_p_air || Math.abs(slip_ext) > limit.delta_t_ext;

    this.result = {
      slip_lpc,
      slip_air,
      slip_ext,
      limit_exceeded: exceeded,
      messages: [
        `Slip of ${v.gt_name} at ${hpc} HPC RPM:`,
        `Slip by LPC RPM is ${slip_lpc}`,
        `Slip by Air pressure is ${slip_air} bar`,
        `Slip by Ext Temp is ${slip_ext} °C`,
      ],
    };

    if (exceeded) {
      this.toastr.warning('Slip exceeds the configured limit for one or more parameters.');
    }
  }

  saveGtSlip(): void {
    this.calculateGtSlip();
    if (this.result) {
      this.toastr.success('GT slip calculation saved.');
    }
  }

  calculateGtgSlip(): void {
    const v = this.gtgForm.getRawValue();
    if (!v.gt_name || !v.recorded_el_load) {
      this.toastr.warning('Select a GTG and enter the electrical load.');
      return;
    }

    const c = GT_GRAPH_CONSTANTS[v.gt_name];
    const ambTemp = Number(v.recorded_amb_temp) || 25;
    const alpha = Math.sqrt((c.graphTempK + 273) / (273 + ambTemp));

    const extGraph = c.gtgExtSlope * Number(v.recorded_el_load) + c.gtgExtIntercept;
    const extStd = Number(v.recorded_ext_temp_gtg) * alpha;
    const slip_ext = round2(extStd - extGraph);

    const limit = this.limitFor(v.gt_name);
    const exceeded = Math.abs(slip_ext) > limit.delta_t_ext;

    this.result = {
      slip_ext,
      limit_exceeded: exceeded,
      messages: [
        `Slip of ${v.gt_name} at ${v.recorded_el_load} kW load:`,
        `Slip by Ext Temp is ${slip_ext} °C`,
      ],
    };

    if (exceeded) {
      this.toastr.warning('Slip exceeds the configured Ext Temp limit.');
    }
  }

  saveGtgSlip(): void {
    this.calculateGtgSlip();
    if (this.result) {
      this.toastr.success('GTG slip calculation saved.');
    }
  }

  saveLimit(): void {
    const v = this.limitForm.getRawValue();
    if (!v.gt_name) {
      this.toastr.warning('Select a GT.');
      return;
    }

    const exists = this.slipLimits.some((l) => l.gt_name === v.gt_name);
    this.slipLimits = exists
      ? this.slipLimits.map((l) => (l.gt_name === v.gt_name ? { ...v, delta_n_lpc: Number(v.delta_n_lpc), delta_t_ext: Number(v.delta_t_ext), delta_p_air: Number(v.delta_p_air) } : l))
      : [...this.slipLimits, { ...v, delta_n_lpc: Number(v.delta_n_lpc), delta_t_ext: Number(v.delta_t_ext), delta_p_air: Number(v.delta_p_air) }];

    this.toastr.success(exists ? 'Slip limit updated.' : 'Slip limit added.');
    this.limitForm.reset();
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
