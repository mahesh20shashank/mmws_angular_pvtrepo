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
  selector: 'app-in-305-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './In305.component.html',
  styleUrls: ['../report.module.css'],
})
export class In305ReportComponent implements OnInit {
  rowId!: string;

  /* ── Header data ──────────────────────────────────────────── */
  shipName = '';
  year = '';
  returnDate: Date | null = null;
  draftStatus = '';
  documentUrl = '';
  forwardTo = '';
  dated = '';

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
  tableData: any[] = [];

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
    this.apiService.get(`${Apiendpoints.IN_305}${id}/`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          const data = res.data;

          this.shipName = data?.ship_name || data?.ship?.name || '-';
          this.year = data?.year || '-';
          this.returnDate = data?.return_date ? new Date(data.return_date) : null;
          this.draftStatus = data?.draft_status || data?.status || '';
          this.documentUrl =
            data?.document ||
            data?.document_url ||
            data?.file_url ||
            data?.reference_document ||
            '';
          this.forwardTo = data?.forward_to || '-';
          this.dated = data?.dated ? new Date(data.dated).toLocaleDateString('en-GB') : '-';

          this.reportTableData = (
            data?.in_305_table_data ||
            data?.in_305_table ||
            []
          ).map((item: any, index: number) => ({
            id: item?.id || null,
            s_no: index + 1,
            chain_cable_fitting: item?.chain_cable_fitting || '-',
            quantity: item?.quantity || '-',
            thickness_weight: item?.thickness_weight || '-',
            initially_supplied_by: item?.initially_supplied_by || '-',
            initialy_supplied_on: item?.initialy_supplied_on
              ? new Date(item.initialy_supplied_on).toLocaleDateString('en-GB')
              : '-',
            dockyard: item?.dockyard_name || item?.dockyard?.name || item?.dockyard || '-',
            dockyard_retest_date: item?.dockyard_retest_date
              ? new Date(item.dockyard_retest_date).toLocaleDateString('en-GB')
              : '-',
            half_yearly_survey: item?.half_yearly_survey
              ? new Date(item.half_yearly_survey).toLocaleDateString('en-GB')
              : '-',
            annealing: item?.annealing
              ? new Date(item.annealing).toLocaleDateString('en-GB')
              : '-',
          }));

          this.cdr.detectChanges();
        }
      },
      error: (err: any) => {
        console.error('Error fetching IN 305 report:', err);
      },
    });
  }

  downloadReport(): void {
    window.print();
  }
}
