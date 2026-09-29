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
  selector: 'app-quarterly-hull-survey-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './HullSurveyReport.module.html',
  styleUrls: ['../report.module.css'],
})
export class QuarterlyHullSurveyReportComponent implements OnInit {
  rowId!: string;

  /* ── Header data ──────────────────────────────────────────── */
  shipName = '';
  year = '';
  quarterEnding = '';
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

  /* ── Table data ───────────────────────────────────────────── */
  reportTableData: any[] = [];

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
      .get(`${Apiendpoints.SHIP_STAFF_REPORT_ON_HULL_INSPECTION}${id}/`)
      .subscribe({
        next: (res: any) => {
          if (res?.data) {
            const data = res.data;

            this.shipName = data?.ship_name || data?.ship?.name || '-';
            this.year = data?.year || '-';
            this.quarterEnding = data?.quarter_ending || data?.quarter || '-';
            this.returnDate = data?.return_date ? new Date(data.return_date) : null;
            this.draftStatus = data?.draft_status || data?.status || '';
            this.documentUrl =
              data?.document ||
              data?.document_url ||
              data?.file_url ||
              data?.reference_document ||
              '';

            this.reportTableData = (data?.inspection_report_table || []).map(
              (item: any, index: number) => ({
                id: item?.id || null,
                s_no: index + 1,
                strake_deck_no: item?.strake_deck_no || '-',
                compartment_name: item?.compartment_name || '-',
                port_stbd_cl: item?.port_stbd_cl || '-',
                frame_station_from: item?.location_survey_frame_from || item?.frame_station_from || '-',
                frame_station_to: item?.location_survey_frame_to || item?.frame_station_to || '-',
                ot_mm: item?.ot_mm || '-',
                extent_corrosion_pitting_thinning: item?.corrosion_extent || item?.extent_corrosion_pitting_thinning || '-',
                avg_residual_t1: item?.t1 || item?.avg_residual_t1 || '-',
                avg_residual_t2: item?.t2 || item?.avg_residual_t2 || '-',
                mean_thickness: item?.mean_thickness || '-',
                reduction_thickness: item?.percentage_reduction || item?.reduction_thickness || '-',
                grading: item?.grading || '-',
                defect_yes_no: item?.defect || item?.defect_yes_no || '-',
                type_of_defect: item?.type_of_defect || '-',
                location_of_defect: item?.location_defect || item?.location_of_defect || '-',
                frame_stn_from: item?.defect_frame_from || item?.frame_stn_from || '-',
                frame_stn_to: item?.defect_frame_to || item?.frame_stn_to || '-',
                height_from_deck: item?.height_from_deck || '-',
                structural_member_name: item?.structural_member_name || '-',
                structural_member_description: item?.structural_member_description || '-',
                action_taken: item?.repair_action_taken || item?.action_taken || '-',
                frame_from: item?.repair_frame_from || item?.frame_from || '-',
                frame_to: item?.repair_frame_to || item?.frame_to || '-',
                size_l: item?.length_l || item?.size_l || '-',
                size_b: item?.breadth_b || item?.size_b || '-',
                size_t: item?.size_t || '-',
              }),
            );

            this.cdr.detectChanges();
          }
        },
        error: (err: any) => {
          console.error('Error fetching Hull Survey report:', err);
        },
      });
  }

  downloadReport(): void {
    window.print();
  }
}