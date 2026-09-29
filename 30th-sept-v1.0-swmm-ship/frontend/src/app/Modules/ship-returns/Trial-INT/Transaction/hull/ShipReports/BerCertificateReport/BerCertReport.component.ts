// ber-certificate-report.component.ts

import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { ApiService } from '../../../../api.service';
import { Apiendpoints } from '../../../../ApiEndPoints';

@Component({
  selector: 'app-ber-certificate-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './BerCertReport.component.html',
  styleUrls: ['../report.module.css'],
})
export class BerCertificateReportComponent implements OnInit {
  @ViewChild('reportContainer', {
    static: false,
  })
  reportContainer!: ElementRef;

  rowId!: string;

  /* HEADER DATA */
  shipName = '';
  dateOfReport = '';
  reportNo = '';
  equipmentType = '';
  berFor = '';
  serialNo = '';
  dockyard = '';
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
    this.apiService.get(`${Apiendpoints.BER_CERTIFICATE}${id}/`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          const data = res.data;

          this.shipName = data?.ship?.name || data?.ship_name || (typeof data?.ship === 'string' ? data.ship : '-');
          this.dateOfReport = data?.date_of_return
            ? new Date(data.date_of_return).toLocaleDateString('en-GB')
            : '-';
          this.reportNo = data?.report_no || data?.return_no || '-';
          this.equipmentType = data?.equipment_type || data?.equipment_name || '-';
          this.berFor = data?.ber_for || data?.berFor || '-';
          this.serialNo = data?.serial_no || data?.sl_no || '-';
          this.dockyard = data?.dockyard_name || data?.dockyard?.name || '-';
          this.refAuth = data?.ref_auth || data?.reference_authority || '-';
          this.draftStatus = data?.draft_status || data?.status || '';
          this.documentUrl =
            data?.document || data?.document_url || data?.file_url || data?.reference_document || data?.ref_auth || '';

          const shipNameVal = this.shipName;
          const commandVal = data?.ship?.command?.name || data?.command?.name || (typeof data?.command === 'string' ? data.command : '-') || '-';
          const initiatedByVal = data?.initiated_by_name || data?.initiatedBy?.name || (typeof data?.initiatedBy === 'string' ? data.initiatedBy : '-') || (typeof data?.initiated_by === 'string' ? data.initiated_by : '-') || '-';
          const typeOfBoatVal = data?.type_of_boat || data?.typeOfBoat || data?.bhs_type_of_boat || '-';
          const boatRegNoVal = data?.registration_no || data?.boatRegistrationNo || data?.bhs_reg_no?.oem_reg_no || data?.bhs_reg_no?.name || (typeof data?.bhs_reg_no === 'string' ? data.bhs_reg_no : '-') || '-';
          const berForVal = this.berFor;
          const berHullVal = data?.ber_hull?.name || (typeof data?.ber_hull === 'string' ? data.ber_hull : '-') || '-';
          const berEngineVal = data?.ber_engine?.name || (typeof data?.ber_engine === 'string' ? data.ber_engine : '-') || '-';
          const dgVal = data?.dg?.name || (typeof data?.dg === 'string' ? data.dg : '-') || '-';
          const remarksVal = data?.remarks || '-';

          this.reportData = {
            ...data,
            shipName: shipNameVal,
            command: commandVal,
            initiatedBy: initiatedByVal,
            typeOfBoat: typeOfBoatVal,
            boatRegistrationNo: boatRegNoVal,
            berFor: berForVal,
            berHull: berHullVal,
            berEngine: berEngineVal,
            dg: dgVal,
            remarks: remarksVal,
            authorityImage: this.documentUrl,
          };

          this.cdr.detectChanges();
        }
      },
      error: (err: any) => {
        console.error('Error fetching BER report:', err);
      },
    });
  }

  /* DOWNLOAD REPORT */
  downloadReport(): void {
    window.print();
  }
}
