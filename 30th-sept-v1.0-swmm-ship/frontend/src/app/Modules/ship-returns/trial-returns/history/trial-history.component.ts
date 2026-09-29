import { Component, ChangeDetectionStrategy, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";

export interface HistoryRecord {
  id: string;
  serNo: number;
  returnNo: string;
  trialAgency: string;
  returnName: string;
  initiatedBy: string;
  initiatedDate: string;
  reportGeneratedDate: string;
  reportGeneratedBy: string;
  status: "Approved" | "Completed" | "Archived";
  progressStep: number;
  shipInitiated: boolean;
  shipRecommended: boolean;
  shipApproved: boolean;
  shipReportGenerated: boolean;
  returnInitiated: boolean;
  returnRecommended: boolean;
  returnApproved: boolean;
  returnReportGenerated: boolean;
}

@Component({
  selector: "app-trial-history",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, PanelCard, DataGrid],
  templateUrl: "./trial-history.component.html",
  styleUrls: ["./trial-history.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialHistoryComponent {
  // Top Form Filters
  filterDateRange = signal<string>("");
  filterAgency = signal<string>("");
  filterReturnName = signal<string>("");

  // Global & Column Search Filters
  globalSearch = signal<string>("");
  searchReturnNo = signal<string>("");
  searchAgency = signal<string>("");
  searchReturnName = signal<string>("");
  searchInitiator = signal<string>("");
  searchInitiatedDate = signal<string>("");

  // Progress Modal State
  selectedProgressRecord = signal<HistoryRecord | null>(null);

  // Master Options
  agencies = [
    "Naval Dockyard Mumbai",
    "WEAT Command",
    "NSTL Visakhapatnam",
    "CQA(N) New Delhi",
    "Naval Dockyard Kochi",
  ];

  returnNames = [
    "Main Propulsion Trial Log",
    "Steering Gear Monthly Performance Return",
    "Auxiliary Power Monthly Log",
    "Sonar Acoustic Sensor Return",
    "Hull Integrity Protection Return",
    "WEAT Combat System Return",
    "Annual Machinery Overhaul Return",
  ];

  // Table Records
  historyRecords = signal<HistoryRecord[]>([
    {
      id: "1",
      serNo: 1,
      returnNo: "TR-HIST-2026-001",
      trialAgency: "Naval Dockyard Mumbai",
      returnName: "Main Propulsion Trial Log",
      initiatedBy: "Lt Cdr R Sharma / INS Vikramaditya",
      initiatedDate: "01 Aug 2026",
      reportGeneratedDate: "05 Aug 2026",
      reportGeneratedBy: "ND(MBI) Technical Cell",
      status: "Approved",
      progressStep: 8,
      shipInitiated: true,
      shipRecommended: true,
      shipApproved: true,
      shipReportGenerated: true,
      returnInitiated: true,
      returnRecommended: true,
      returnApproved: true,
      returnReportGenerated: true,
    },
    {
      id: "2",
      serNo: 2,
      returnNo: "TR-HIST-2026-002",
      trialAgency: "WEAT Command",
      returnName: "WEAT Combat System Return",
      initiatedBy: "Cdr V Verma / INS Kolkata",
      initiatedDate: "20 Jul 2026",
      reportGeneratedDate: "25 Jul 2026",
      reportGeneratedBy: "WEAT Evaluation Directorate",
      status: "Completed",
      progressStep: 8,
      shipInitiated: true,
      shipRecommended: true,
      shipApproved: true,
      shipReportGenerated: true,
      returnInitiated: true,
      returnRecommended: true,
      returnApproved: true,
      returnReportGenerated: true,
    },
    {
      id: "3",
      serNo: 3,
      returnNo: "TR-HIST-2026-003",
      trialAgency: "NSTL Visakhapatnam",
      returnName: "Sonar Acoustic Sensor Return",
      initiatedBy: "Lt S Nair / INS Chennai",
      initiatedDate: "15 Jun 2026",
      reportGeneratedDate: "18 Jun 2026",
      reportGeneratedBy: "NSTL Hydroacoustics Lab",
      status: "Archived",
      progressStep: 8,
      shipInitiated: true,
      shipRecommended: true,
      shipApproved: true,
      shipReportGenerated: true,
      returnInitiated: true,
      returnRecommended: true,
      returnApproved: true,
      returnReportGenerated: true,
    },
  ]);

  columnDefs: ColDef[] = [
    {
      headerName: "Ser No.",
      valueGetter: "node.rowIndex + 1",
      flex: 1,
      minWidth: 80,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="font-semibold text-white/50">${params.value}</span>`;
      },
    },
    {
      headerName: "Return No",
      field: "returnNo",
      flex: 1.5,
      minWidth: 160,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="font-mono text-xs font-bold text-sky-400">${params.value}</span>`;
      },
    },
    {
      headerName: "Return For Trial Agency",
      field: "trialAgency",
      flex: 2,
      minWidth: 180,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="font-medium text-white/90">${params.value}</span>`;
      },
    },
    {
      headerName: "Return Name",
      field: "returnName",
      flex: 2,
      minWidth: 180,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="text-white font-medium">${params.value}</span>`;
      },
    },
    {
      headerName: "Initiated By",
      field: "initiatedBy",
      flex: 2,
      minWidth: 180,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="text-xs text-white/80">${params.value}</span>`;
      },
    },
    {
      headerName: "Initiated Date",
      field: "initiatedDate",
      flex: 1.5,
      minWidth: 130,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="text-xs text-white/60">${params.value}</span>`;
      },
    },
    {
      headerName: "Report Generated Date",
      field: "reportGeneratedDate",
      flex: 1.5,
      minWidth: 150,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="text-xs text-emerald-400 font-medium">${params.value}</span>`;
      },
    },
    {
      headerName: "Report Generated By",
      field: "reportGeneratedBy",
      flex: 2,
      minWidth: 180,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="text-xs text-white/70">${params.value}</span>`;
      },
    },
    {
      headerName: "Status",
      field: "status",
      flex: 1.5,
      minWidth: 130,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        const status = String(params.value || "Completed");
        let badgeClass = "badge-status-closed";
        if (status === "Archived") badgeClass = "badge-status-archived";
        return `<span class="table-pill ${badgeClass}">${status}</span>`;
      },
    },
    {
      headerName: "Action",
      flex: 1.5,
      minWidth: 120,
      sortable: false,
      filter: false,
      cellRenderer: () => {
        return `
          <button
            class="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            data-action="progress"
          >
            <span>Progress</span>
          </button>
        `;
      },
    },
  ];

  // Computed Filtered Records
  filteredRecords = computed(() => {
    const topAgency = this.filterAgency().toLowerCase();
    const topName = this.filterReturnName().toLowerCase();
    const gs = this.globalSearch().toLowerCase();

    const rNo = this.searchReturnNo().toLowerCase();
    const ag = this.searchAgency().toLowerCase();
    const rName = this.searchReturnName().toLowerCase();
    const initBy = this.searchInitiator().toLowerCase();
    const initDt = this.searchInitiatedDate().toLowerCase();

    return this.historyRecords().filter((r) => {
      const matchTopAgency = !topAgency || r.trialAgency.toLowerCase() === topAgency;
      const matchTopName = !topName || r.returnName.toLowerCase() === topName;

      const matchGlobal =
        !gs ||
        r.returnNo.toLowerCase().includes(gs) ||
        r.trialAgency.toLowerCase().includes(gs) ||
        r.returnName.toLowerCase().includes(gs) ||
        r.initiatedBy.toLowerCase().includes(gs) ||
        r.initiatedDate.toLowerCase().includes(gs) ||
        r.reportGeneratedDate.toLowerCase().includes(gs) ||
        r.reportGeneratedBy.toLowerCase().includes(gs) ||
        r.status.toLowerCase().includes(gs);

      const matchNo = !rNo || r.returnNo.toLowerCase().includes(rNo);
      const matchAg = !ag || r.trialAgency.toLowerCase().includes(ag);
      const matchNm = !rName || r.returnName.toLowerCase().includes(rName);
      const matchInit = !initBy || r.initiatedBy.toLowerCase().includes(initBy);
      const matchDt = !initDt || r.initiatedDate.toLowerCase().includes(initDt);

      return (
        matchTopAgency &&
        matchTopName &&
        matchGlobal &&
        matchNo &&
        matchAg &&
        matchNm &&
        matchInit &&
        matchDt
      );
    });
  });

  onGlobalSearchChange(val: string): void {
    this.globalSearch.set(val);
  }

  onCellClicked(event: { colDef?: ColDef; event?: MouseEvent; data?: unknown }): void {
    const data = event.data as HistoryRecord | undefined;
    const target = event.event?.target as HTMLElement | undefined;
    if (event.colDef?.headerName === "Action" || target?.closest('[data-action="progress"]')) {
      if (data) {
        this.openProgressModal(data);
      }
    }
  }

  clearTopFilters(): void {
    this.filterDateRange.set("");
    this.filterAgency.set("");
    this.filterReturnName.set("");
  }

  // Export Actions
  exportPrint(): void {
    const records = this.filteredRecords();
    const rowsHtml = records
      .map(
        (r) => `
        <tr>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${r.serNo}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #0284c7;">${r.returnNo}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.trialAgency}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.returnName}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.initiatedBy}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.initiatedDate}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.reportGeneratedDate}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.reportGeneratedBy}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.status}</td>
        </tr>
      `
      )
      .join("");

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Return History Printout</title>
          <style>
            @media print { @page { size: landscape; margin: 10mm; } }
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 15px; }
            h2 { margin-bottom: 4px; color: #0f172a; font-size: 18px; }
            p { color: #64748b; font-size: 12px; margin-top: 0; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background-color: #f1f5f9; color: #0f172a; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-size: 11px; text-transform: uppercase; }
            tr:nth-child(even) { background-color: #f8fafc; }
          </style>
        </head>
        <body>
          <h2>Return History Log</h2>
          <p>Printed on ${new Date().toLocaleDateString('en-GB')}</p>
          <table>
            <thead>
              <tr>
                <th>Ser No.</th>
                <th>Return No</th>
                <th>Trial Agency</th>
                <th>Return Name</th>
                <th>Initiated By</th>
                <th>Initiated Date</th>
                <th>Report Generated Date</th>
                <th>Report Generated By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(printContent);
      doc.close();
      iframe.contentWindow?.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        document.body.removeChild(iframe);
      }, 300);
    }
  }

  exportPdf(): void {
    const headers = ["Ser No.", "Return No", "Trial Agency", "Return Name", "Initiated By", "Initiated Date", "Report Date", "Report By", "Status"];
    const rows = this.filteredRecords().map((r) => [
      r.serNo,
      r.returnNo,
      r.trialAgency,
      r.returnName,
      r.initiatedBy,
      r.initiatedDate,
      r.reportGeneratedDate,
      r.reportGeneratedBy,
      r.status,
    ]);

    const blob = this.generateNativePdfBlob("Return History Report", headers, rows);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Return_History_Report.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private generateNativePdfBlob(
    title: string,
    headers: string[],
    rows: (string | number)[][]
  ): Blob {
    const sanitize = (str: string | number) =>
      String(str).replace(/[()]/g, "");

    let streamText = `BT /F1 16 Tf 40 550 Td (${sanitize(title)}) Tj ET\n`;
    streamText += `BT /F1 10 Tf 40 532 Td (Naval Ship Returns Management System  |  Date: ${new Date().toLocaleDateString(
      "en-GB"
    )}) Tj ET\n`;

    streamText += `0.2 0.5 0.8 RG 1.5 w 40 520 m 802 520 l S\n`;

    let y = 495;
    const headerStr = headers.map(sanitize).join("   |   ");
    streamText += `BT /F1 10 Tf 40 ${y} Td (${headerStr}) Tj ET\n`;
    y -= 8;
    streamText += `0.7 0.7 0.7 RG 1 w 40 ${y} m 802 ${y} l S\n`;
    y -= 16;

    rows.forEach((row) => {
      const rowStr = row.map(sanitize).join("   |   ");
      streamText += `BT /F1 9 Tf 40 ${y} Td (${rowStr}) Tj ET\n`;
      y -= 16;
    });

    const encoder = new TextEncoder();
    const streamLen = encoder.encode(streamText).length;

    const header = `%PDF-1.4\n`;
    const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
    const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`;
    const obj4 = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
    const obj5 = `5 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamText}\nendstream\nendobj\n`;

    const pos1 = header.length;
    const pos2 = pos1 + obj1.length;
    const pos3 = pos2 + obj2.length;
    const pos4 = pos3 + obj3.length;
    const pos5 = pos4 + obj4.length;
    const xrefPos = pos5 + obj5.length;

    const xref =
      `xref\n0 6\n0000000000 65535 f \n` +
      `${String(pos1).padStart(10, "0")} 0000 n \n` +
      `${String(pos2).padStart(10, "0")} 0000 n \n` +
      `${String(pos3).padStart(10, "0")} 0000 n \n` +
      `${String(pos4).padStart(10, "0")} 0000 n \n` +
      `${String(pos5).padStart(10, "0")} 0000 n \n`;

    const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

    const pdfContent = header + obj1 + obj2 + obj3 + obj4 + obj5 + xref + trailer;
    return new Blob([pdfContent], { type: "application/pdf" });
  }

  exportCsv(): void {
    const headers = ["Ser No.", "Return No", "Trial Agency", "Return Name", "Initiated By", "Initiated Date", "Report Date", "Report By", "Status"];
    const rows = this.filteredRecords().map((r) => [
      r.serNo,
      `"${r.returnNo}"`,
      `"${r.trialAgency.replace(/"/g, '""')}"`,
      `"${r.returnName.replace(/"/g, '""')}"`,
      `"${r.initiatedBy.replace(/"/g, '""')}"`,
      `"${r.initiatedDate}"`,
      `"${r.reportGeneratedDate}"`,
      `"${r.reportGeneratedBy.replace(/"/g, '""')}"`,
      `"${r.status}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Return_History_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportCopy(): void {
    const headers = ["Ser No.", "Return No", "Trial Agency", "Return Name", "Initiated By", "Initiated Date", "Report Date", "Report By", "Status"];
    const rows = this.filteredRecords().map((r) =>
      [r.serNo, r.returnNo, r.trialAgency, r.returnName, r.initiatedBy, r.initiatedDate, r.reportGeneratedDate, r.reportGeneratedBy, r.status].join("\t")
    );

    const textToCopy = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert("Table data copied to clipboard!");
    }).catch(() => {
      alert("Failed to copy data to clipboard");
    });
  }

  openProgressModal(record: HistoryRecord): void {
    this.selectedProgressRecord.set(record);
  }

  closeProgressModal(): void {
    this.selectedProgressRecord.set(null);
  }
}
