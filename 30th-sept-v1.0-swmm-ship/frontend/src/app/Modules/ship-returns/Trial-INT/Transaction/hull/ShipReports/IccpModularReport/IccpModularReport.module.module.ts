import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { ApiService } from '../../../../api.service';
import { Apiendpoints } from '../../../../ApiEndPoints';

@Component({
  selector: 'app-quarterly-hull-iccp-modular-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './IccpModularReport.module.html',
  styleUrls: ['../report.module.css'],
})
export class QuarterlyHullIccpModularReportComponent implements OnInit {
  rowId!: string;

  /* ── Header data ──────────────────────────────────────────── */
  shipName = '';
  year = '';
  shipLastUndocked = '';
  briefDetails = '';
  antiCorrosivePaintRenewed = '';
  typeOfReferenceElectrodeUsed = '';
  hullMaterial = '';
  iccpAnodeMaterial = '';
  quarterEnding = '';
  returnDate: Date | null = null;
  draftStatus = '';
  documentUrl = '';
  presetPotential = '';
  presetPotentialIccpAcu = '';
  oemIccp = '';
  oemIccpSystem = '';
  noOfModules = '';
  noOfAnodesPerModule = '';
  totalNoOfAnodes = '';
  noOfREs = '';
  last_calibration_date: Date | null = null;

  visualInspectionDate: Date | null = null;
  inspectionCarriedBy = '';
  cablesObs = '';
  cablesRemarks = '';
  conduitsObs = '';
  conduitsRemarks = '';
  cofferdamsObs = '';
  cofferdamsRemarks = '';

  letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  get reportStatus(): string {
    const s = (this.draftStatus || '').toString().toLowerCase().trim();
    if (s === 'draft' || s === 'initiate' || s === 'initiated') return 'Draft';
    if (
      s === 'work in progress' ||
      s === 'work_in_progress' ||
      s === 'save' ||
      s === 'pending' ||
      s === 'in progress'
    )
      return 'Pending';
    if (s === 'approved' || s === 'complete') return 'Complete';
    return this.draftStatus || '-';
  }

  /* ── Table data ───────────────────────────────────────────── */
  iccpSystemData: any[] = [];
  iccpMeasurements: any[] = [];
  sacrificialAnodeData: any[] = [];
  sacrificalAnodes: any[] = [];
  acuOffReadings: any[] = [];
  acuOnReadings: any[] = [];
  manualChecks: any[] = [];

  constructor(
    private apiService: ApiService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.rowId = this.route.snapshot.paramMap.get('id') || '';
    if (this.rowId) {
      this.getReportData(this.rowId);
    }
  }

  getReportData(id: string): void {
    this.apiService
      .get(
        `${Apiendpoints.QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_MODULAR_ICCP_SYSTEM}${id}/`,
      )
      .subscribe({
        next: (res: any) => {
          if (res?.data) {
            const data = res.data;

            this.shipName = data?.ship_name || data?.ship?.name || '-';
            this.year = data?.year || '-';
            this.shipLastUndocked = data?.ship_last_undocked || data?.last_undocked || '-';
            this.briefDetails = data?.brief_details_paint || data?.briefDetails || '-';
            this.antiCorrosivePaintRenewed = data?.anti_corrosive_paint_renewed || data?.antiCorrosivePaintRenewed || '-';
            this.typeOfReferenceElectrodeUsed = data?.type_of_ref_electrode || data?.typeOfReferenceElectrodeUsed || '-';
            this.hullMaterial = data?.hull_material || '-';
            this.iccpAnodeMaterial = data?.iccp_anode_material || '-';
            this.quarterEnding = data?.quarter_ending || data?.quarter || '-';
            this.returnDate = data?.return_date ? new Date(data.return_date) : null;
            this.last_calibration_date = data?.last_calibration_date ? new Date(data.last_calibration_date) : null;
            this.draftStatus = data?.draft_status || data?.status || '';
            this.documentUrl =
              data?.document ||
              data?.document_url ||
              data?.file_url ||
              data?.reference_document ||
              '';
            this.presetPotential = data?.preset_potential_iccp_acu || '-';
            this.presetPotentialIccpAcu = this.presetPotential;
            this.oemIccp = data?.oem_iccp_system || '-';
            this.oemIccpSystem = this.oemIccp;
            this.noOfModules = data?.no_of_modules || '-';
            this.noOfAnodesPerModule = data?.no_of_anodes_per_module || '-';
            this.totalNoOfAnodes = this.noOfModules;
            this.noOfREs = this.noOfAnodesPerModule;

            this.visualInspectionDate = data?.visual_inspection_date
              ? new Date(data.visual_inspection_date)
              : null;
            this.inspectionCarriedBy = data?.inspection_carried_by || '-';
            this.cablesObs = data?.cables_observation || '-';
            this.cablesRemarks = data?.cables_remarks || '-';
            this.conduitsObs = data?.conduits_observation || '-';
            this.conduitsRemarks = data?.conduits_remarks || '-';
            this.cofferdamsObs = data?.cofferdams_observation || '-';
            this.cofferdamsRemarks = data?.cofferdams_remarks || '-';

            this.manualChecks = [
              {
                header: 'Cables and Junction Boxes',
                observation: this.cablesObs,
                remarks: this.cablesRemarks,
              },
              {
                header: 'Conduits / Cable Glands',
                observation: this.conduitsObs,
                remarks: this.conduitsRemarks,
              },
              {
                header: 'Cofferdams & Dielectric Shield',
                observation: this.cofferdamsObs,
                remarks: this.cofferdamsRemarks,
              },
            ];

            /* Table 1 */
            this.iccpMeasurements = (
              data?.quarterly_hull_modular_iccp_log ||
              data?.quarterly_hull_modular_iccp_log_readings ||
              []
            ).map((item: any, index: number) => ({
              id: item?.id || null,
              s_no: index + 1,
              iccp_date: item?.date
                ? new Date(item.date).toLocaleDateString('en-GB')
                : item?.iccp_date || '-',
              iccp_time: item?.time || item?.iccp_time || '-',
              iccp_port: item?.forward_port ?? item?.iccp_port ?? '-',
              iccp_stbd: item?.forward_stbd ?? item?.iccp_stbd ?? '-',
              output_anode_voltage: item?.output_anode_voltage ?? '-',
              anode1: item?.anode_1 ?? item?.anode1 ?? '-',
              anode2: item?.anode_2 ?? item?.anode2 ?? '-',
              anode3: item?.anode_3 ?? item?.anode3 ?? '-',
              anode4: item?.anode_4 ?? item?.anode4 ?? '-',
              iccp_total_current: item?.total_current ?? item?.iccp_total_current ?? '-',
              iccp_berthed_alongside: item?.ship_berthed || item?.iccp_berthed_alongside || '-',
              iccp_sailing_speed: item?.speed ?? item?.iccp_sailing_speed ?? '-',
              iccp_remarks: item?.remarks || item?.iccp_remarks || '-',
            }));
            this.iccpSystemData = this.iccpMeasurements;

            /* Table 2 */
            this.sacrificalAnodes = (
              data?.quarterly_hull_modular_iccp_anode ||
              data?.quarterly_hull_modular_iccp_anode_anodes ||
              []
            ).map((item: any, index: number) => ({
              id: item?.id || null,
              s_no: index + 1,
              type_of_anode: item?.type_of_anode || '-',
              port_stbd: item?.port_stbd || '-',
              from_frame: item?.frame_from || item?.from_frame || '-',
              to_frame: item?.frame_to || item?.to_frame || '-',
              anode_renewed: item?.renewed || item?.anode_renewed || '-',
              remarks: item?.remarks || '-',
            }));
            this.sacrificialAnodeData = this.sacrificalAnodes;

            /* Table 3 (ACU OFF) */
            this.acuOffReadings = (
              data?.quarterly_hull_modular_iccp_acu_off ||
              data?.quarterly_hull_modular_iccp_acu_off_readings ||
              []
            ).map((item: any, index: number) => ({
              id: item?.id || null,
              s_no: index + 1,
              date: item?.date
                ? new Date(item.date).toLocaleDateString('en-GB')
                : '-',
              time: item?.time || '-',
              forward_port: item?.forward_port ?? '-',
              forward_stbd: item?.forward_stbd ?? '-',
              midship_port: item?.midship_port ?? '-',
              midship_stbd: item?.midship_stbd ?? '-',
              midship_port2: item?.midship_port2 ?? '-',
              midship_stbd2: item?.midship_stbd2 ?? '-',
              aft_port: item?.aft_port ?? '-',
              aft_stbd: item?.aft_stbd ?? '-',
              remarks: item?.remarks || '-',
            }));

            /* Table 4 (ACU ON) */
            this.acuOnReadings = (
              data?.quarterly_hull_modular_iccp_acu_on ||
              data?.quarterly_hull_modular_iccp_acu_on_readings ||
              []
            ).map((item: any, index: number) => ({
              id: item?.id || null,
              s_no: index + 1,
              date: item?.ac_date
                ? new Date(item.ac_date).toLocaleDateString('en-GB')
                : item?.date
                  ? new Date(item.date).toLocaleDateString('en-GB')
                  : '-',
              time: item?.ac_time || item?.time || '-',
              forward_port: item?.ac_forward_port ?? item?.forward_port ?? '-',
              forward_stbd: item?.ac_forward_stbd ?? item?.forward_stbd ?? '-',
              midship_port: item?.ac_midship_port ?? item?.midship_port ?? '-',
              midship_stbd: item?.ac_midship_stbd ?? item?.midship_stbd ?? '-',
              midship_port2: item?.ac_midship_port2 ?? item?.midship_port2 ?? '-',
              midship_stbd2: item?.ac_midship_stbd2 ?? item?.midship_stbd2 ?? '-',
              aft_port: item?.ac_aft_port ?? item?.aft_port ?? '-',
              aft_stbd: item?.ac_aft_stbd ?? item?.aft_stbd ?? '-',
              remarks: item?.ac_remarks || item?.remarks || '-',
            }));

            this.cdr.detectChanges();
          }
        },
        error: (err: any) => {
          console.error('Error fetching ICCP Modular report:', err);
        },
      });
  }

  downloadReport(): void {
    window.print();
  }
}
