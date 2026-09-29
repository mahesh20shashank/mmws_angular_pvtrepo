import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { ApiService } from '../../../../api.service';
import { Apiendpoints } from '../../../../ApiEndPoints';

@Component({
  selector: 'app-in378-render-part1-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './in-378-part-I.component.html',
  styleUrls: ['../report.module.css'],
})
export class IN378RenderPart1ReportComponent implements OnInit {
  rowId!: string;

  /* HEADER */
  shipName = '';
  InitiatedBy = '';
  year = '';
  period = '';
  draftStatus = '';
  documentUrl = '';

  formatStatus(statusVal: any): string {
    if (!statusVal) return '-';
    const s = statusVal.toString().toLowerCase().trim();
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
    return statusVal;
  }

  get reportStatus(): string {
    return this.formatStatus(this.draftStatus);
  }

  /* TABLE */
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
    this.apiService.get(`${Apiendpoints.IN_378_PART_I}${id}/`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          const data = res.data;

          this.shipName = data?.ship_name || data?.ship?.name || '-';

          this.InitiatedBy =
            data?.initiated_by_name ||
            data?.initiated_by?.name ||
            data?.initiated_by ||
            '-';

          this.year = data?.year || '-';

          this.period = data?.period || '-';

          this.draftStatus = data?.draft_status || data?.status || '';

          this.documentUrl =
            data?.document ||
            data?.document_url ||
            data?.file_url ||
            data?.reference_document ||
            '';

          /* TABLE */
          this.reportTableData =
            (
              data?.in378_render_part1_table ||
              data?.in378_part1_table ||
              []
            ).map((item: any, index: number) => ({
              id: item?.id || null,
              status: this.formatStatus(item?.door_status),
              type_of_door: item?.type_of_door || '-',
              compartment: item?.compartment_name || item?.compartment || '-',
              date_of_initiation: item?.date_of_initiation
                ? new Date(item.date_of_initiation).toLocaleDateString('en-GB')
                : '-',
              type_of_test_undertaken: item?.type_of_test_undertaken || '-',
              date_of_test: item?.date_of_chalk_test
                ? new Date(item.date_of_chalk_test).toLocaleDateString('en-GB')
                : '-',
              defect_discovered: item?.defect_discovered || '-',
              action_taken: item?.action_taken || '-',
            }));

          this.cdr.detectChanges();
        }
      },

      error: (err: any) => {
        console.error('Error fetching IN 378 Part I report:', err);
      },
    });
  }

  downloadReport(): void {
    window.print();
  }
}
