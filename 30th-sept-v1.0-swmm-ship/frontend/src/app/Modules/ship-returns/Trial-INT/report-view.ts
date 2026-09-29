import { ChangeDetectorRef, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Location, CommonModule } from '@angular/common';
import { ApiService } from './api.service';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,

  template: `
    <div class="report-container min-h-screen bg-[var(--bg-primary,#f8fafc)] dark:bg-slate-900/90 p-4 md:p-8">

      <!-- Top Toolbar (Print / Back) -->
      <div class="no-print max-w-[1400px] mx-auto mb-4 flex items-center justify-between bg-[var(--bg-card,#ffffff)] dark:bg-slate-800/90 p-3 rounded-lg border border-[var(--border-card,rgba(15,28,46,0.1))] dark:border-slate-700/60 shadow-md">
        <button (click)="goBack()" type="button" class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[var(--border-input,rgba(15,28,46,0.15))] dark:border-slate-600 bg-[var(--bg-input,#f1f5f9)] dark:bg-slate-700 hover:bg-[var(--bg-hover,#e2e8f0)] dark:hover:bg-slate-600 text-[var(--text-primary,#0f172a)] dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
            <path d="M12.5 15L7.5 10L12.5 5"></path>
          </svg>
          Back
        </button>
        <span class="text-sm font-bold text-[var(--text-primary,#0f172a)] dark:text-white">Trial Report Preview</span>
        <button (click)="printReport()" type="button" class="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg border border-[#4f8fd5] bg-[#1069AB] hover:bg-[#195d95] text-white text-xs font-semibold shadow transition-colors cursor-pointer">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
            <path d="M5 7V3h10v4M5 14H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M5 11h10v6H5v-6z"></path>
          </svg>
          Print / Save PDF
        </button>
      </div>

      <!-- Loading State -->
      <div *ngIf="isLoading" class="max-w-[1400px] mx-auto bg-[var(--bg-card,#ffffff)] dark:bg-slate-800/50 rounded-xl p-12 text-center border border-[var(--border-card,rgba(15,28,46,0.1))] dark:border-slate-700/50 text-[var(--text-primary,#334155)] dark:text-slate-300 shadow-sm">
        <div class="w-8 h-8 border-3 border-[#1069AB]/30 border-t-[#1069AB] rounded-full animate-spin mx-auto mb-2"></div>
        Loading report data...
      </div>

      <!-- Empty State -->
      <div *ngIf="!isLoading && reportData.length === 0" class="max-w-[1400px] mx-auto bg-[var(--bg-card,#ffffff)] dark:bg-slate-800/50 rounded-xl p-12 text-center border border-[var(--border-card,rgba(15,28,46,0.1))] dark:border-slate-700/50 text-[var(--text-primary,#334155)] dark:text-slate-300 shadow-sm">
        No report data found.
      </div>

      <!-- Report Paper Page -->
      <div *ngIf="reportHtml" class="report-paper-card max-w-[1400px] mx-auto bg-white rounded-xl shadow-2xl p-4 sm:p-8 border border-slate-200 min-h-[800px]">
        <div
          class="report-content"
          [innerHTML]="reportHtml">
        </div>
      </div>

    </div>
  `,

  styles: [`
    .report-container {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    /* Force default text color to black inside report paper card */
    .report-paper-card,
    .report-content,
    .report-content p,
    .report-content span,
    .report-content div,
    .report-content h1,
    .report-content h2,
    .report-content h3,
    .report-content h4,
    .report-content h5,
    .report-content h6,
    .report-content table,
    .report-content th,
    .report-content td,
    .report-content tr,
    .report-content article,
    .report-content section,
    .report-content label {
      color: #000000 !important;
    }

    /* Preserve white text on dark badge containers (like blue banners) */
    .report-content .text-white,
    .report-content [class*="text-white"],
    .report-content [class*="bg-[#2874c6]"],
    .report-content [class*="bg-[#2874c6]"] *,
    .report-content [class*="bg-blue"],
    .report-content [class*="bg-blue"] * {
      color: #ffffff !important;
    }

    /* Preserve red alert text */
    .report-content .text-red-700,
    .report-content [class*="text-red-700"] {
      color: #b91c1c !important;
    }

    .report-content .text-slate-700,
    .report-content [class*="text-slate-700"] {
      color: #334155 !important;
    }

    .report-content .text-slate-800,
    .report-content [class*="text-slate-800"] {
      color: #1e293b !important;
    }

    /* Force all report logos/images to be properly sized and constrained at the top */
    .report-content img {
      max-height: 68px !important;
      max-width: 68px !important;
      width: 68px !important;
      height: 68px !important;
      object-fit: contain !important;
      display: inline-block !important;
      vertical-align: middle !important;
    }

    /* Ensure dynamic HTML flex wrappers position logos side-by-side with header text */
    .report-content .flex,
    .report-content [class*="flex"] {
      display: flex !important;
    }

    .report-content .justify-between,
    .report-content [class*="justify-between"] {
      justify-content: space-between !important;
    }

    .report-content .items-center,
    .report-content [class*="items-center"] {
      align-items: center !important;
    }

    /* Fix un-decoded text blocks */
    .report-content .block,
    .report-content [class*="block"] {
      display: block !important;
    }

    .report-content .text-center,
    .report-content [class*="text-center"] {
      text-align: center !important;
    }

    /* Table styling for report data */
    .report-content table {
      width: 100% !important;
      border-collapse: collapse !important;
      margin-top: 12px !important;
      margin-bottom: 12px !important;
    }

    .report-content th,
    .report-content td {
      padding: 6px 8px !important;
      border: 1px solid #cbd5e1 !important;
    }

    .report-content th {
      background-color: #f1f5f9 !important;
      font-weight: 600 !important;
    }

    /* Print styles */
    @media print {
      .no-print {
        display: none !important;
      }
      body, .report-container {
        background: #ffffff !important;
        padding: 0 !important;
      }
      .report-paper-card {
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
        max-width: 100% !important;
      }
    }
  `]
})
export class ReportComponent implements OnInit {

  reportData: any[] = [];
  reportHtml: SafeHtml | null = null;
  isLoading = false;

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private location: Location
  ) { }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const formId = params['trial'];
      if (!formId) {
        return;
      }

      this.isLoading = true;
      this.cdr.detectChanges();

      this.api
        .get('api/reports/trial-reports/', {
          trial_id: formId
        })
        .subscribe({
          next: (res: any) => {
            this.isLoading = false;

            const reports = Array.isArray(res)
              ? res
              : (res?.data ?? []);

            this.reportData = reports;

            const rawHtml = reports[0]?.json_data;

            console.log('Report API Response:', rawHtml);

            if (typeof rawHtml === 'string' && rawHtml.trim()) {
              this.reportHtml = this.prepareReportHtml(rawHtml);
            } else {
              this.reportHtml = null;
            }

            this.cdr.detectChanges();
          },

          error: (error) => {
            this.isLoading = false;
            console.error('Report API Error:', error);
            this.reportData = [];
            this.reportHtml = null;
            this.cdr.detectChanges();
          }
        });
    });
  }

  private prepareReportHtml(rawHtml: string): SafeHtml {
    // 1. Un-escape HTML entities like &lt;span...&gt; so they parse as real DOM tags
    let cleaned = rawHtml.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    // 2. Bypass Angular security sanitizer for innerHTML
    return this.sanitizer.bypassSecurityTrustHtml(cleaned);
  }

  goBack(): void {
    this.location.back();
  }

  printReport(): void {
    window.print();
  }

  get reportJson(): any {
    return this.reportData.length > 0
      ? this.reportData[0].json_data
      : null;
  }
}
