import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { ApiService } from '../../../../api.service';
import { Apiendpoints } from '../../../../ApiEndPoints';

@Component({
  selector: 'app-load-test-cert-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loadTestCertificate.html',
  styleUrls: ['../report.module.css'],
})
export class LoadTestCertReportComponent implements OnInit {
  rowId!: string;
  isLoading = false;
  reportData: any = {};

  details = [
    { label: 'Ship Name', field: 'ship_name' },
    { label: 'Year', field: 'year' },
    { label: 'Equipment', field: 'equipment' },
    { label: 'Pattern No.', field: 'patt_no' },
    { label: 'Location', field: 'location' },
    { label: 'Mfg Date', field: 'mfg_date' },
    { label: 'Installation Date', field: 'installation_date' },
    { label: 'Equipment Status', field: 'eqpt_status' },
    { label: 'Load Tested Date', field: 'load_tested_date' },
    { label: 'Load Tested Due Date', field: 'load_tested_due_date' },
    { label: 'Static', field: 'static' },
    { label: 'Running', field: 'running' },
    { label: 'Working', field: 'working' },
    { label: 'Status', field: 'report_status' },
  ];

  columns = [
    { header: 'Sr No.', field: 'serialNumber', align: 'center' },
    { header: 'Repairs / Tests Description', field: 'repairs_description', align: 'left' },
  ];

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
    this.isLoading = true;
    this.apiService.get(`${Apiendpoints.LOAD_TEST_CERTIFICATE}${id}/`).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (res?.data) {
          const data = res.data;
          this.reportData = {
            ...data,
            ship_name: data?.ship_name || data?.ship?.name || '-',
            mfg_date: data?.mfg_date ? new Date(data.mfg_date).toLocaleDateString('en-GB') : '-',
            installation_date: data?.installation_date ? new Date(data.installation_date).toLocaleDateString('en-GB') : '-',
            load_tested_date: data?.load_tested_date ? new Date(data.load_tested_date).toLocaleDateString('en-GB') : '-',
            load_tested_due_date: data?.load_tested_due_date ? new Date(data.load_tested_due_date).toLocaleDateString('en-GB') : '-',
            report_status: this.formatStatus(data?.draft_status || data?.status),
          };

          this.tableData = (
            data?.load_test_certificate_table ||
            data?.repairs_undertaken ||
            []
          ).map((item: any, index: number) => ({
            ...item,
            serialNumber: index + 1,
            repairs_description: item?.repairs_description || '-',
          }));

          this.cdr.detectChanges();
        }
      },
      error: (err: any) => {
        this.isLoading = false;
        console.error('Error fetching Load Test Certificate report:', err);
      },
    });
  }

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

  getCellValue(data: any, field: string): string {
    return data && data[field] !== undefined && data[field] !== null ? data[field] : '-';
  }

  formatValue(row: any, column: any): string {
    if (!row || !column) return '-';
    return row[column.field] !== undefined && row[column.field] !== null ? row[column.field] : '-';
  }

  downloadReport(): void {
    window.print();
  }
}
