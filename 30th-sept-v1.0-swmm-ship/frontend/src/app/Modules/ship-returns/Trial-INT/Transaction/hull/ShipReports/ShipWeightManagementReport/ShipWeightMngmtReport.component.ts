import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { ApiService } from '../../../../api.service';
import { Apiendpoints } from '../../../../ApiEndPoints';

@Component({
  selector: 'app-ship-weight-management-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ShipWeightMngmtReport.component.component.html',
  styleUrls: ['../report.module.css'],
})
export class ShipWeightManagementReportComponent implements OnInit {
  rowId!: string;

  /* HEADER DATA */
  commandName = '';
  classOfShip = '';
  shipName = '';
  shipStatus = '';
  refitStatus = '';
  refitRecommencementDate = '';
  dateOfReturn = '';
  refAuth = '';
  draftStatus = '';
  documentUrl = '';

  reportData: any = {};

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

  isUrl(str: any): boolean {
    if (!str || typeof str !== 'string') return false;
    return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/');
  }

  /* TABLES */
  opsTableData: any[] = [];
  refitTableData: any[] = [];

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
      .get(`${Apiendpoints.SHIP_WEIGHT_MANAGEMENT}${id}/`)
      .subscribe({
        next: (res: any) => {
          if (res?.data) {
            const data = res.data;

            this.commandName = data?.ship?.command?.name || data?.command || '-';
            this.classOfShip = data?.ship?.classofship?.name || data?.class_of_ship || '-';
            this.shipName = data?.ship?.name || data?.ship_name || '-';
            this.shipStatus = data?.ship_status || data?.status || '-';
            this.refitStatus = data?.refit?.name || data?.refit_status || data?.refit || '-';

            this.refitRecommencementDate = data?.refit_recommencement_date
              ? new Date(data.refit_recommencement_date).toLocaleDateString('en-GB')
              : '-';

            this.dateOfReturn = data?.date_of_return
              ? new Date(data.date_of_return).toLocaleDateString('en-GB')
              : '-';

            this.refAuth = data?.ref_auth || data?.reference_authority || '-';
            this.draftStatus = data?.draft_status || data?.status || '';

            this.documentUrl =
              data?.document ||
              data?.document_url ||
              data?.file_url ||
              data?.reference_document ||
              '';

            this.reportData = {
              ...data,
              command: this.commandName,
              classOfShip: this.classOfShip,
              shipName: this.shipName,
              status: this.shipStatus,
              refit: this.refitStatus,
              refitDate: this.refitRecommencementDate,
              referenceAuthority: this.refAuth,
              reportStatus: this.reportStatus,
            };

            /* OPS TABLE */
            this.opsTableData = (
              data?.ship_weight_management_ops ||
              []
            ).map((item: any, index: number) => ({
              id: item?.id || null,
              s_no: index + 1,
              lightship_displacement: item?.lightship_displacement || '-',
              ref_load_condition: item?.ref_load_condition || '-',
              disp_c: item?.disp_c || '-',
              disp_d: item?.disp_d || '-',
              net_diff: item?.net_diff || '-',
              corrected_disp: item?.corrected_disp || '-',
              net_increase: item?.net_increase || '-',
              percentage_increase: item?.percentage_increase || '-',
              net_weight_add: item?.net_weight_add || '-',
              net_kg_add: item?.net_kg_add || '-',
            }));

            /* REFIT TABLE */
            this.refitTableData = (
              data?.ship_weight_management_refit ||
              []
            ).map((item: any, index: number) => ({
              id: item?.id || null,
              s_no: index + 1,
              lightship_displacement: item?.lightship_displacement || '-',
              wght_change_prior_refit: item?.wght_change_prior_refit || '-',
              net_wght_change_refit: item?.net_wght_change_refit || '-',
              net_kg: item?.net_kg || '-',
            }));

            this.cdr.detectChanges();
          }
        },

        error: (err: any) => {
          console.error('Error fetching Ship Weight Management report:', err);
        },
      });
  }

  downloadReport(): void {
    window.print();
  }
}
