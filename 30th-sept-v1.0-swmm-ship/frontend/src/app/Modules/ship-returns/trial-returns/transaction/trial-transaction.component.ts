import { Component, ChangeDetectionStrategy, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";

export interface ReturnMapping {
  id: string;
  name: string;
  forwardingUnit: string;
  satellites: string[];
  frequency: "Monthly Return" | "Quarterly Return" | "Half-Yearly Return" | "Annual Return" | "Periodic Return";
}

export interface TrialInitiationRecord {
  id: string;
  serNo: number;
  returnNo: string;
  agencySatellite: string;
  returnName: string;
  initiatedDate: string;
  period: string;
  status: "Draft" | "Pending Agency Review" | "Submitted" | "Approved";
  currentStep: number;
}

@Component({
  selector: "app-trial-transaction",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, PanelCard, DataGrid],
  templateUrl: "./trial-transaction.component.html",
  styleUrls: ["./trial-transaction.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialTransactionComponent {
  // Form Selections
  selectedReturnId = signal<string>("");
  selectedUnit = signal<string>("");
  selectedSatellites = signal<string[]>([]);
  selectedFrequency = signal<string>("");
  isFrequencyLocked = signal<boolean>(false);
  selectedPeriod = signal<string>("");

  // Satellite Dropdown Open State
  isSatDropdownOpen = signal<boolean>(false);

  // Global Search & Column Search Filters
  globalSearch = signal<string>("");
  searchReturnNo = signal<string>("");
  searchAgency = signal<string>("");
  searchReturnName = signal<string>("");
  searchDate = signal<string>("");

  // Progress Modal State
  selectedProgressRecord = signal<TrialInitiationRecord | null>(null);

  // Master Data Options
  returnMappings: ReturnMapping[] = [
    { id: "RM1", name: "Main Propulsion Trial Log", forwardingUnit: "Naval Dockyard Mumbai", satellites: ["Frigate Squadron 1", "Destroyer Squadron 15"], frequency: "Monthly Return" },
    { id: "RM2", name: "Steering Gear Monthly Performance Return", forwardingUnit: "Naval Dockyard Mumbai", satellites: ["Destroyer Squadron 15"], frequency: "Monthly Return" },
    { id: "RM3", name: "Auxiliary Power Monthly Log", forwardingUnit: "WEAT Command", satellites: ["Frigate Squadron 1"], frequency: "Monthly Return" },
    { id: "RM4", name: "Sonar Acoustic Sensor Return", forwardingUnit: "NSTL Visakhapatnam", satellites: ["Submarine Squadron 8"], frequency: "Quarterly Return" },
    { id: "RM5", name: "Hull Integrity Protection Return", forwardingUnit: "Naval Dockyard Kochi", satellites: ["Patrol Fleet West"], frequency: "Quarterly Return" },
    { id: "RM6", name: "WEAT Combat System Return", forwardingUnit: "WEAT Command", satellites: ["Destroyer Squadron 15", "Submarine Squadron 8"], frequency: "Half-Yearly Return" },
    { id: "RM7", name: "Annual Machinery Overhaul Return", forwardingUnit: "CQA(N) New Delhi", satellites: ["Frigate Squadron 1", "Patrol Fleet West"], frequency: "Annual Return" },
  ];

  forwardingUnits = [
    "Naval Dockyard Mumbai",
    "WEAT Command",
    "NSTL Visakhapatnam",
    "CQA(N) New Delhi",
    "Naval Dockyard Kochi",
  ];

  allSatellites = [
    "Frigate Squadron 1",
    "Destroyer Squadron 15",
    "Submarine Squadron 8",
    "Patrol Fleet West",
  ];

  periodOptions = signal<{ value: string; label: string; disabled?: boolean }[]>([]);

  // Active Initiations Table Data
  records = signal<TrialInitiationRecord[]>([
    { id: "1", serNo: 1, returnNo: "TR-INIT-2026-001", agencySatellite: "Naval Dockyard Mumbai / Frigate Squadron 1", returnName: "Main Propulsion Trial Log", initiatedDate: "05 Aug 2026", period: "Jul 2026", status: "Draft", currentStep: 1 },
    { id: "2", serNo: 2, returnNo: "TR-INIT-2026-002", agencySatellite: "WEAT Command / Destroyer Squadron 15", returnName: "WEAT Combat System Return", initiatedDate: "01 Aug 2026", period: "H1 2026", status: "Pending Agency Review", currentStep: 3 },
    { id: "3", serNo: 3, returnNo: "TR-INIT-2026-003", agencySatellite: "NSTL Visakhapatnam / Submarine Squadron 8", returnName: "Sonar Acoustic Sensor Return", initiatedDate: "28 Jul 2026", period: "Q2 2026", status: "Approved", currentStep: 4 },
  ]);

  // Column Definitions for Shared DataGrid Component
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
      headerName: "Return For Trial Agency / Satellite",
      field: "agencySatellite",
      flex: 2.5,
      minWidth: 220,
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
      headerName: "Status",
      field: "status",
      flex: 1.5,
      minWidth: 140,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        const status = String(params.value || "Draft");
        let badgeClass = "badge-status-draft";
        if (status === "Submitted" || status === "Approved") badgeClass = "badge-status-closed";
        else if (status === "Pending Agency Review") badgeClass = "badge-status-in-progress";
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

  // Computed Text for Satellite Dropdown Toggle Button
  satelliteLabelText = computed(() => {
    const selected = this.selectedSatellites();
    if (selected.length === 0) return "Select Satellite Unit(s)";
    if (selected.length === 1) return selected[0];
    return `${selected.length} Units Selected`;
  });

  // Computed Filtered Table Rows
  filteredRecords = computed(() => {
    const gs = this.globalSearch().toLowerCase();
    const rNo = this.searchReturnNo().toLowerCase();
    const ag = this.searchAgency().toLowerCase();
    const rName = this.searchReturnName().toLowerCase();
    const dt = this.searchDate().toLowerCase();

    return this.records().filter((r) => {
      const matchGlobal =
        !gs ||
        r.returnNo.toLowerCase().includes(gs) ||
        r.agencySatellite.toLowerCase().includes(gs) ||
        r.returnName.toLowerCase().includes(gs) ||
        r.initiatedDate.toLowerCase().includes(gs) ||
        r.status.toLowerCase().includes(gs);

      const matchNo = !rNo || r.returnNo.toLowerCase().includes(rNo);
      const matchAgency = !ag || r.agencySatellite.toLowerCase().includes(ag);
      const matchName = !rName || r.returnName.toLowerCase().includes(rName);
      const matchDt = !dt || r.initiatedDate.toLowerCase().includes(dt);

      return matchGlobal && matchNo && matchAgency && matchName && matchDt;
    });
  });

  onGlobalSearchChange(val: string): void {
    this.globalSearch.set(val);
  }

  onCellClicked(event: { colDef?: ColDef; event?: MouseEvent; data?: unknown }): void {
    const data = event.data as TrialInitiationRecord | undefined;
    const target = event.event?.target as HTMLElement | undefined;
    if (event.colDef?.headerName === "Action" || target?.closest('[data-action="progress"]')) {
      if (data) {
        this.openProgressModal(data);
      }
    }
  }

  // Export & Action Functions
  exportPrint(): void {
    const records = this.filteredRecords();
    const rowsHtml = records
      .map(
        (r) => `
        <tr>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${r.serNo}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #0284c7;">${r.returnNo}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.agencySatellite}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.returnName}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.initiatedDate}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${r.status}</td>
        </tr>
      `
      )
      .join("");

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Active Trial Return Initiations Printout</title>
          <style>
            @media print {
              @page { size: landscape; margin: 10mm; }
            }
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 15px; }
            h2 { margin-bottom: 4px; color: #0f172a; font-size: 18px; }
            p { color: #64748b; font-size: 12px; margin-top: 0; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background-color: #f1f5f9; color: #0f172a; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-size: 11px; text-transform: uppercase; }
            tr:nth-child(even) { background-color: #f8fafc; }
          </style>
        </head>
        <body>
          <h2>Active Trial Return Initiations Log</h2>
          <p>Printed on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">Ser No.</th>
                <th>Return No</th>
                <th>Return For Trial Agency / Satellite</th>
                <th>Return Name</th>
                <th>Initiated Date</th>
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

  // Pure Native PDF File Download
  exportPdf(): void {
    const headers = ["Ser No.", "Return No", "Return For Trial Agency / Satellite", "Return Name", "Initiated Date", "Status"];
    const rows = this.filteredRecords().map((r) => [
      r.serNo,
      r.returnNo,
      r.agencySatellite,
      r.returnName,
      r.initiatedDate,
      r.status,
    ]);

    const blob = this.generateNativePdfBlob(
      "Active Trial Return Initiations Report",
      headers,
      rows
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Trial_Returns_Initiation_Report.pdf";
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
      String(str).replace(/[\\()]/g, "");

    let streamText = `BT /F1 16 Tf 40 550 Td (${sanitize(title)}) Tj ET\n`;
    streamText += `BT /F1 10 Tf 40 532 Td (Naval Ship Returns Management System  |  Date: ${new Date().toLocaleDateString(
      "en-GB"
    )}) Tj ET\n`;

    // Divider Line
    streamText += `0.2 0.5 0.8 RG 1.5 w 40 520 m 802 520 l S\n`;

    let y = 495;
    // Table Headers
    const headerStr = headers.map(sanitize).join("   |   ");
    streamText += `BT /F1 10 Tf 40 ${y} Td (${headerStr}) Tj ET\n`;
    y -= 8;
    streamText += `0.7 0.7 0.7 RG 1 w 40 ${y} m 802 ${y} l S\n`;
    y -= 16;

    // Table Data Rows
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
    const headers = ["Ser No.", "Return No", "Return For Trial Agency / Satellite", "Return Name", "Initiated Date", "Status"];
    const rows = this.filteredRecords().map((r) => [
      r.serNo,
      `"${r.returnNo}"`,
      `"${r.agencySatellite.replace(/"/g, '""')}"`,
      `"${r.returnName.replace(/"/g, '""')}"`,
      `"${r.initiatedDate}"`,
      `"${r.status}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Trial_Returns_Initiation_Log.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportCopy(): void {
    const headers = ["Ser No.", "Return No", "Return For Trial Agency / Satellite", "Return Name", "Initiated Date", "Status"];
    const rows = this.filteredRecords().map((r) =>
      [r.serNo, r.returnNo, r.agencySatellite, r.returnName, r.initiatedDate, r.status].join("\t")
    );

    const textToCopy = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert("Table data copied to clipboard!");
    }).catch(() => {
      alert("Failed to copy data to clipboard");
    });
  }

  // Dropdown Handling
  toggleSatDropdown(): void {
    this.isSatDropdownOpen.update((v) => !v);
  }

  closeSatDropdown(): void {
    this.isSatDropdownOpen.set(false);
  }

  isSatSelected(sat: string): boolean {
    return this.selectedSatellites().includes(sat);
  }

  toggleSatCheck(sat: string): void {
    const current = this.selectedSatellites();
    if (current.includes(sat)) {
      this.selectedSatellites.set(current.filter((item) => item !== sat));
    } else {
      this.selectedSatellites.set([...current, sat]);
    }
  }

  selectAllSatellites(): void {
    this.selectedSatellites.set([...this.allSatellites]);
  }

  clearAllSatellites(): void {
    this.selectedSatellites.set([]);
  }

  // Handle Return Name Auto-fill Mapping
  onReturnNameChange(returnId: string): void {
    this.selectedReturnId.set(returnId);
    const mapping = this.returnMappings.find((m) => m.id === returnId);

    if (mapping) {
      this.selectedUnit.set(mapping.forwardingUnit);
      this.selectedSatellites.set([...mapping.satellites]);
      this.selectedFrequency.set(mapping.frequency);
      this.isFrequencyLocked.set(true);

      this.generatePeriodOptions(mapping.frequency);
    } else {
      this.selectedUnit.set("");
      this.selectedSatellites.set([]);
      this.selectedFrequency.set("");
      this.isFrequencyLocked.set(false);
      this.periodOptions.set([]);
      this.selectedPeriod.set("");
    }
  }

  generatePeriodOptions(freq: string): void {
    let opts: { value: string; label: string; disabled?: boolean }[] = [];
    if (freq === "Monthly Return") {
      opts = [
        { value: "2026-07", label: "Jul 2026" },
        { value: "2026-06", label: "Jun 2026" },
        { value: "2026-05", label: "May 2026 (Already Submitted)", disabled: true },
      ];
    } else if (freq === "Quarterly Return") {
      opts = [
        { value: "2026-Q2", label: "Q2 (Apr–Jun 2026)" },
        { value: "2026-Q1", label: "Q1 (Jan–Mar 2026) (Already Submitted)", disabled: true },
      ];
    } else if (freq === "Half-Yearly Return") {
      opts = [
        { value: "2026-H1", label: "H1 (Jan–Jun 2026)" },
      ];
    } else if (freq === "Annual Return") {
      opts = [
        { value: "2025", label: "2025" },
      ];
    }
    this.periodOptions.set(opts);
    if (opts.length > 0 && !opts[0].disabled) {
      this.selectedPeriod.set(opts[0].value);
    } else {
      this.selectedPeriod.set("");
    }
  }

  // Initiate Action
  initiateReturn(): void {
    const returnId = this.selectedReturnId();
    const unit = this.selectedUnit();
    const sats = this.selectedSatellites();
    const freq = this.selectedFrequency();
    const period = this.selectedPeriod();

    if (!returnId) {
      alert("Please select Return Name!");
      return;
    }
    if (!unit) {
      alert("Please select Return Forwarding Unit!");
      return;
    }
    if (sats.length === 0) {
      alert("Please select at least one Satellite Unit!");
      return;
    }
    if (!freq) {
      alert("Please select Frequency Type!");
      return;
    }

    const mapping = this.returnMappings.find((m) => m.id === returnId);
    const returnName = mapping ? mapping.name : "Custom Trial Return";

    const newRecord: TrialInitiationRecord = {
      id: String(Date.now()),
      serNo: this.records().length + 1,
      returnNo: `TR-INIT-2026-00${this.records().length + 1}`,
      agencySatellite: `${unit} / ${sats.join(", ")}`,
      returnName: returnName,
      initiatedDate: "07 Aug 2026",
      period: period || "Jul 2026",
      status: "Draft",
      currentStep: 1,
    };

    this.records.update((items) => [newRecord, ...items]);
    alert(`Return "${returnName}" successfully initiated!`);
  }

  // Open Progress Modal
  openProgressModal(record: TrialInitiationRecord): void {
    this.selectedProgressRecord.set(record);
  }

  closeProgressModal(): void {
    this.selectedProgressRecord.set(null);
  }
}
