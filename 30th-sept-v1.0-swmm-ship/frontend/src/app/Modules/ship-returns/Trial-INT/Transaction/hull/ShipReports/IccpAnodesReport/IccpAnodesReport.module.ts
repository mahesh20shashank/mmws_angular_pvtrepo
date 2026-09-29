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
  selector: 'app-quarterly-hull-iccp-anodes-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './IccpAnodesReport.module.html',
  styleUrls: ['../report.module.css'],
})
export class QuarterlyHullIccpAnodesReportComponent implements OnInit {
  rowId!: string;

  /* ── Header data ──────────────────────────────────────────── */
  shipName = '';
  year = '';
  shipLastUndocked = '';
  briefDetails = '';
  antiCorrosivePaintRenewed = '';
  typeOfSacrificialAnode = '';
  referenceElectrodeUsed = '';
  referenceElectrodeLastCalibrated: Date | null = null;
  quarterEnding = '';
  remarks = '';
  returnDate: Date | null = null;
  draftStatus = '';
  documentUrl = '';

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

  /* ── Table 1 data ──────────────────────────────────────────── */
  anodesData: any[] = [];
  sacrificalAnodes: any[] = [];

  /* ── Table 2 data ──────────────────────────────────────────── */
  potentialData: any[] = [];
  portable_reference_electrodes: any[] = [];

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
        `${Apiendpoints.QUARTERLY_HULL_POTENTIAL_FITTED_WITH_SACRIFICIAL_ANODES}${id}/`,
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
            this.typeOfSacrificialAnode = data?.type_of_sacrificial_anode || data?.typeOfSacrificialAnode || '-';
            this.referenceElectrodeUsed = data?.type_of_ref_electrode || data?.referenceElectrodeUsed || '-';
            this.referenceElectrodeLastCalibrated = data?.reference_electrode_last_calibrated
              ? new Date(data.reference_electrode_last_calibrated)
              : null;
            this.remarks = data?.remarks || '-';
            this.quarterEnding = data?.quarter_ending || data?.quarter || '-';
            this.returnDate = data?.return_date ? new Date(data.return_date) : null;
            this.draftStatus = data?.draft_status || data?.status || '';
            this.documentUrl =
              data?.document ||
              data?.document_url ||
              data?.file_url ||
              data?.reference_document ||
              '';

            /* Table 1 */
            this.sacrificalAnodes = (
              data?.sacrificial_anodes_replaced ||
              data?.sacrificial_anodes_replaced_replaced ||
              []
            ).map((item: any, index: number) => ({
              id: item?.id || null,
              s_no: index + 1,
              name: item?.name || '-',
              port_stbd: item?.port_stbd || '-',
              frame_station_from: item?.from_location || item?.frame_station_from || '-',
              frame_station_to: item?.to_location || item?.frame_station_to || '-',
              remarks: item?.remarks || '-',
              replaced_during_last_docking:
                item?.replaced_during_last_docking || '-',
            }));
            this.anodesData = this.sacrificalAnodes;

            /* Table 2 */
            this.portable_reference_electrodes = (
              data?.hull_potential_sacrificial_anodes_readings ||
              data?.quarterly_hull_potential_sacrificial_anodes_readings_readings ||
              []
            ).map((item: any, index: number) => ({
              id: item?.id || null,
              s_no: index + 1,
              date: item?.date
                ? new Date(item.date).toLocaleDateString('en-GB')
                : '-',
              time: item?.time || '-',
              forward_port: item?.forward_port || '-',
              forward_stbd: item?.forward_stbd || '-',
              midship_port: item?.midship_port || '-',
              midship_stbd: item?.midship_stbd || '-',
              aft_port: item?.aft_port || '-',
              aft_stbd: item?.aft_stbd || '-',
              ship_berthed: item?.ship_berthed || '-',
              remarks: item?.remarks || '-',
            }));
            this.potentialData = this.portable_reference_electrodes;

            this.cdr.detectChanges();
          }
        },
        error: (err: any) => {
          console.error('Error fetching ICCP Anodes report:', err);
        },
      });
  }

  downloadReport(): void {
    window.print();
  }
}