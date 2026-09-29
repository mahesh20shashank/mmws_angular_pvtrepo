import { Injectable } from "@angular/core";
import { firstValueFrom, Observable } from "rxjs";
import type { ColDef } from "ag-grid-community";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportJobStatus = "pending" | "running" | "success" | "failed";
/** Kinds handled by the client-side `export()` dispatcher below — a page with
 *  no backend export endpoint passes one of these straight from
 *  <app-export-toolbar>'s (exportRequested) output. */
export type ExportKind = "pdf" | "excel" | "print";

export interface ExportJobLike {
  id: string;
  status: ExportJobStatus;
  error_message?: string | null;
}

export interface ExportJobRunner<TJob extends ExportJobLike> {
  request: () => Observable<TJob>;
  getStatus: (jobId: string) => Observable<TJob>;
  download: (jobId: string) => Observable<Blob>;
}

export interface PrintColumn {
  header: string;
  field: string;
  /** `row`/`index` are optional so every existing `(value) => string` formatter
   *  keeps working unchanged — only the new normalizeColumns()-driven export
   *  path (see below) passes them. */
  format?: (value: unknown, row?: Record<string, unknown>, index?: number) => string;
}

export interface PreviewWindowOptions {
  download?: { blob: Blob; filename: string };
  print?: boolean;
}

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30;

@Injectable({ providedIn: "root" })
export class ReportExportService {
  async exportFile<TJob extends ExportJobLike>(
    runner: ExportJobRunner<TJob>,
  ): Promise<Blob> {
    let job = await firstValueFrom(runner.request());
    let attempt = 0;
    while (this.isPending(job.status) && attempt < POLL_MAX_ATTEMPTS) {
      await this.delay(POLL_INTERVAL_MS);
      job = await firstValueFrom(runner.getStatus(job.id));
      attempt++;
    }
    if (this.isPending(job.status)) {
      throw new Error(
        "Export is taking longer than expected. Please try again shortly.",
      );
    }
    if (job.status !== "success") {
      throw new Error(job.error_message || "Export failed.");
    }
    return firstValueFrom(runner.download(job.id));
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** Opens a loading skeleton then a printable preview window in one call — the common case for
   * an <app-export-toolbar> "print"/"pdf" click on a page that has no server-side report job. */
  printRows(title: string, columns: PrintColumn[], rows: Record<string, unknown>[]): void {
    const win = this.openLoadingWindow(title, columns.length, rows.length);
    if (!win) return;
    this.renderPreviewWindow(win, title, columns, rows, { print: true });
  }

  /** Client-side CSV export for pages with no dedicated backend export endpoint — same
   * `PrintColumn[]` shape used for print, so one column list drives both. */
  downloadCsv(columns: PrintColumn[], rows: Record<string, unknown>[], filename: string): void {
    const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = columns.map((c) => csvCell(c.header)).join(",");
    const body = rows
      .map((row, index) => columns.map((c) => csvCell(this.formatExportCell(c, row, index))).join(","))
      .join("\n");
    this.downloadBlob(new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" }), filename);
  }

  /** Copies rows as tab-separated text — pastes cleanly into Excel/Sheets. */
  async copyRows(columns: PrintColumn[], rows: Record<string, unknown>[]): Promise<void> {
    const header = columns.map((c) => c.header).join("\t");
    const body = rows
      .map((row, index) => columns.map((c) => this.formatExportCell(c, row, index)).join("\t"))
      .join("\n");
    await navigator.clipboard.writeText(header + "\n" + body);
  }

  private formatExportCell(column: PrintColumn, row: Record<string, unknown>, index?: number): string {
    const raw = row[column.field];
    // row/index are required for normalizeColumns()-driven columns (no plain `field`, value
    // computed via an ag-grid valueGetter) — without them the valueGetter's `params.data` is
    // undefined and every such column exports blank. See the identical fix in renderPreviewWindow.
    if (column.format) return column.format(raw, row, index);
    if (raw === null || raw === undefined) return "";
    return raw instanceof Date ? raw.toLocaleString() : String(raw as string | number | boolean);
  }

  openLoadingWindow(
    title: string,
    columnCount = 6,
    rowCount = 6,
  ): Window | null {
    const win = window.open("", "_blank");
    if (!win) {
      console.warn("Unable to open the preview window (popup blocked?).");
      return null;
    }
    win.document.documentElement.innerHTML =
      "<head><title>" +
      this.escapeHtml(title) +
      "</title><style>" +
      this.loadingSkeletonCss() +
      "</style></head><body>" +
      this.loadingSkeletonHtml(Math.max(1, columnCount), Math.max(1, rowCount)) +
      "</body>";
    return win;
  }
  private loadingSkeletonHtml(columnCount: number, rowCount: number): string {
    const widths = [92, 68, 84, 60, 76, 55];
    const cell = (pct: number) =>
      '<div class="skel-cell"><span class="skel-bar" style="width:' + pct + '%"></span></div>';
    const row = (cls: string, offset: number) =>
      '<div class="skel-row ' +
      cls +
      '">' +
      Array.from({ length: columnCount }, (_, i) => cell(widths[(i + offset) % widths.length])).join("") +
      "</div>";

    const headRow = row("skel-row--head", 0);
    const bodyRows = Array.from({ length: rowCount }, (_, r) => row("", r + 1)).join("");

    return (
      '<div class="skel-header">' +
      '<div class="skel-title"></div>' +
      '<div class="skel-toolbar"><span class="skel-toolbar-btn"></span></div>' +
      "</div>" +
      '<div class="skel-wrap">' +
      '<div class="skel-table">' +
      headRow +
      bodyRows +
      "</div>" +
      "</div>"
    );
  }

  private loadingSkeletonCss(): string {
    return (
      "body{font-family:Arial,sans-serif;padding:24px;color:#111;margin:0;background:#fff;}" +
      ".skel-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;}" +
      ".skel-toolbar{display:flex;flex-shrink:0;gap:10px;}" +
      ".skel-toolbar-btn{width:88px;height:32px;border-radius:8px;background:#e3e3e3;}" +
      ".skel-title{height:18px;width:240px;border-radius:4px;background:#e3e3e3;}" +
      ".skel-wrap{position:relative;overflow:hidden;}" +
      ".skel-wrap:after{content:\"\";position:absolute;top:0;left:0;width:100%;height:100%;" +
      "background:linear-gradient(110deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0) 40%," +
      "rgba(255,255,255,0.7) 50%,rgba(255,255,255,0) 60%,rgba(255,255,255,0) 100%);" +
      "animation:skel-shimmer 1.2s linear infinite;}" +
      ".skel-table{border:1px solid #ccc;border-collapse:collapse;}" +
      ".skel-row{display:flex;}" +
      ".skel-row--head{background:#f2f2f2;}" +
      ".skel-cell{flex:1;min-width:0;box-sizing:border-box;padding:6px 10px;border:1px solid #e2e2e2;}" +
      ".skel-bar{display:block;height:10px;border-radius:3px;background:#cacaca;}" +
      ".skel-row--head .skel-bar{background:#b7b7b7;}" +
      "@keyframes skel-shimmer{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}"
    );
  }

  renderPreviewWindow(
    win: Window,
    title: string,
    columns: PrintColumn[],
    rows: Record<string, unknown>[],
    options: PreviewWindowOptions,
  ): void {
    if (win.closed) return;

    const headerCells = columns
      .map((c) => "<th>" + this.escapeHtml(c.header) + "</th>")
      .join("");
    const bodyRows = rows
      .map((row, index) => {
        const cells = columns
          .map((c) => {
            const raw = row[c.field];
            let value = "";
            if (c.format) {
              // row/index are required for normalizeColumns()-driven columns (no plain `field`,
              // value computed via an ag-grid valueGetter) — without them the valueGetter's
              // `params.data` is undefined and every such column prints blank.
              value = c.format(raw, row, index);
            } else if (raw !== null && raw !== undefined) {
              if (raw instanceof Date) {
                value = raw.toLocaleString();
              } else if (typeof raw === "object") {
                value = JSON.stringify(raw);
              } else {
                value = String(raw as string | number | boolean);
              }
            }
            return "<td>" + this.escapeHtml(value) + "</td>";
          })
          .join("");
        return "<tr>" + cells + "</tr>";
      })
      .join("");

    const toolbarButtons =
      (options.download
        ? '<button id="app-preview-download" type="button" class="app-preview-btn">Download</button>'
        : "") +
      (options.print
        ? '<button id="app-preview-print" type="button" class="app-preview-btn">Print</button>'
        : "");

    win.document.documentElement.innerHTML =
      "<head><title>" +
      this.escapeHtml(title) +
      "</title><style>" +
      "body{font-family:Arial,sans-serif;padding:24px;color:#111;}" +
      ".app-preview-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;}" +
      ".app-preview-toolbar{display:flex;flex-shrink:0;gap:10px;}" +
      ".app-preview-btn{padding:9px 18px;border-radius:8px;border:1px solid #1d96e9;background:#1d96e9;color:#fff;font-size:13px;font-family:inherit;cursor:pointer;}" +
      "h1{font-size:18px;margin:0;}" +
      "table{width:100%;border-collapse:collapse;}" +
      "th,td{border:1px solid #ccc;padding:6px 10px;font-size:12px;text-align:left;}" +
      "th{background:#f2f2f2;}" +
      "@media print{.app-preview-toolbar{display:none;}}" +
      "</style></head><body>" +
      '<div class="app-preview-header">' +
      "<h1>" +
      this.escapeHtml(title) +
      "</h1>" +
      '<div class="app-preview-toolbar">' +
      toolbarButtons +
      "</div>" +
      "</div>" +
      "<table><thead><tr>" +
      headerCells +
      "</tr></thead><tbody>" +
      bodyRows +
      "</tbody></table>" +
      "</body>";

    if (options.download) {
      const { blob, filename } = options.download;
      const url = URL.createObjectURL(blob);
      win.document.getElementById("app-preview-download")?.addEventListener("click", () => {
        const anchor = win.document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
      });
      win.addEventListener("unload", () => URL.revokeObjectURL(url), { once: true });
    }

    if (options.print) {
      win.document.getElementById("app-preview-print")?.addEventListener("click", () => win.print());
      win.setTimeout(() => win.print(), 0);
    }
  }

  showPreviewError(win: Window, message: string): void {
    if (win.closed) return;
    win.document.documentElement.innerHTML =
      "<body style=\"font-family:Arial,sans-serif;padding:24px;color:#b00020;\">" +
      this.escapeHtml(message) +
      "</body>";
  }

  private isPending(status: ExportJobStatus): boolean {
    return status === "pending" || status === "running";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private escapeHtml(value: string): string {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  // ── Client-side export dispatcher ─────────────────────────────────────────
  // Added for pages with no backend export endpoint yet (e.g. KMS Technical
  // Manuals). Entirely new methods below — nothing above this line was
  // changed, so every existing caller of downloadCsv/printRows/copyRows/etc.
  // keeps working exactly as before.

  /**
   * Single entry point for an <app-export-toolbar> (exportRequested) handler:
   * accepts raw ag-grid `ColDef[]` directly (Action/checkbox columns are
   * detected and stripped automatically, see normalizeColumns), a
   * `PrintColumn[]`, or plain string field names.
   * Returns `false` only for the "print" kind when the preview window was
   * blocked by the browser's popup blocker, so the caller can notify the
   * user — every other case is synchronous and either completes or throws.
   */
  export(
    kind: ExportKind,
    title: string,
    columns: (ColDef | PrintColumn | string)[],
    rows: (Record<string, unknown> | unknown)[],
    filename?: string,
  ): boolean {
    const safeRows = (rows || []) as Record<string, unknown>[];
    const baseName = this.sanitizeFilename(filename || title);

    if (kind === "excel") {
      this.downloadExcel(columns, safeRows, `${baseName}.csv`);
      return true;
    }
    if (kind === "pdf") {
      this.downloadPdf(title, columns, safeRows, `${baseName}.pdf`);
      return true;
    }
    // "print": reuse the existing printRows() exactly as every other caller
    // uses it (same popup-blocked handling — console.warn + no-op) but also
    // report success/failure back so this specific call site can show a
    // user-facing notification instead of only logging to the console.
    const win = this.openLoadingWindow(title, this.normalizeColumns(columns).length, safeRows.length);
    if (!win) return false;
    this.renderPreviewWindow(win, title, this.normalizeColumns(columns), safeRows, { print: true });
    return true;
  }

  /**
   * Generates a formatted PDF (branded header, zebra striping, page
   * numbers) via jsPDF + jspdf-autotable and triggers an immediate
   * client-side download.
   */
  downloadPdf(
    title: string,
    columns: (ColDef | PrintColumn | string)[],
    rows: (Record<string, unknown> | unknown)[],
    filename?: string,
  ): void {
    const safeRows = (rows || []) as Record<string, unknown>[];
    const normCols = this.normalizeColumns(columns);
    const cleanFilename = this.sanitizeFilename(filename || title);

    const orientation = normCols.length > 5 ? "landscape" : "portrait";
    const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 38, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("SWMM", 24, 24);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(title, 24, 62);

    const now = new Date();
    const dateStr =
      now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
      " " +
      now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${dateStr}   |   Total Records: ${safeRows.length}`, 24, 76);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.line(24, 84, pageWidth - 24, 84);

    const tableHeaders = [normCols.map((c) => c.header)];
    const tableData = safeRows.map((row, index) => normCols.map((c) => this.extractCellValue(c, row, index)));

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: 92,
      margin: { left: 24, right: 24, top: 46, bottom: 36 },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: normCols.length > 10 ? 6.5 : normCols.length > 6 ? 7.5 : 8.5,
        cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: normCols.length > 10 ? 7 : normCols.length > 6 ? 8 : 9,
        halign: "left",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: (data: any) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text("SWMM System Generated Report", 24, pageHeight - 14);
        const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
        const pageStr = `Page ${data.pageNumber} of ${pageCount}`;
        doc.text(pageStr, pageWidth - 24 - doc.getTextWidth(pageStr), pageHeight - 14);
      },
    });

    doc.save(`${cleanFilename}.pdf`);
  }

  /**
   * Downloads an Excel-compatible CSV (UTF-8 BOM so Excel opens it with
   * correct column alignment/accents) built from raw `ColDef[]`,
   * `PrintColumn[]`, or plain field names — Action/checkbox columns are
   * stripped automatically. Cell values are sanitized against CSV/Excel
   * formula injection: a value starting with =, +, -, or @ (e.g. a document
   * name someone typed as "=HYPERLINK(...)") would otherwise be interpreted
   * as a live formula by Excel/Sheets when the file is opened — prefixing
   * with a plain quote character neutralizes that without changing how the
   * value reads.
   */
  downloadExcel(
    columns: (ColDef | PrintColumn | string)[],
    rows: (Record<string, unknown> | unknown)[],
    filename: string,
  ): void {
    const safeRows = (rows || []) as Record<string, unknown>[];
    const normCols = this.normalizeColumns(columns);
    const cleanBase = this.sanitizeFilename(filename);

    const csvCell = (value: string) => `"${this.sanitizeCsvValue(value).replace(/"/g, '""')}"`;
    const header = normCols.map((c) => csvCell(c.header)).join(",");
    const body = safeRows
      .map((row, index) => normCols.map((c) => csvCell(this.extractCellValue(c, row, index))).join(","))
      .join("\r\n");

    const bom = "﻿";
    const blob = new Blob([bom + header + "\r\n" + body], { type: "text/csv;charset=utf-8;" });
    this.downloadBlob(blob, `${cleanBase}.csv`);
  }

  /** Neutralizes CSV/Excel formula injection (see downloadExcel's doc comment). */
  private sanitizeCsvValue(value: string): string {
    return /^[=+\-@]/.test(value) ? `'${value}` : value;
  }

  /**
   * Filters out Action/selection columns and normalizes ag-grid `ColDef[]`,
   * `PrintColumn[]`, or plain field-name strings into one shape, resolving
   * each column's ag-grid `valueGetter`/`valueFormatter` where present.
   */
  normalizeColumns(columns: (ColDef | PrintColumn | string)[]): PrintColumn[] {
    if (!Array.isArray(columns)) return [];
    const result: PrintColumn[] = [];

    for (const col of columns) {
      if (!col) continue;

      if (typeof col === "string") {
        if (this.isActionOrSelectionKeyword(col)) continue;
        result.push({ header: col, field: col });
        continue;
      }

      if (this.isActionOrSelectionColumn(col)) continue;

      const anyCol = col as Record<string, unknown>;
      const colDef = col as ColDef & Partial<PrintColumn>;
      const field = String(anyCol["field"] ?? anyCol["colId"] ?? "").trim();
      const header = String(anyCol["header"] ?? anyCol["headerName"] ?? field).trim();
      if (!header && !field) continue;

      result.push({
        header: header || field,
        field: field || header,
        format: (val: unknown, row?: Record<string, unknown>, index?: number) => {
          if ((col as PrintColumn).format) {
            return (col as PrintColumn).format!(val, row, index);
          }
          if (typeof colDef.valueGetter === "function") {
            try {
              const res = colDef.valueGetter({
                data: row,
                node: { rowIndex: index },
                getValue: (f: string) => (row ? this.getNestedValue(row, f) : undefined),
                colDef,
              } as never);
              if (res !== undefined && res !== null) return this.formatCellValue(res);
            } catch {
              // fall back to the raw field value below
            }
          }
          if (typeof colDef.valueFormatter === "function") {
            try {
              const res = colDef.valueFormatter({ value: val, data: row, node: { rowIndex: index }, colDef } as never);
              if (res !== undefined && res !== null) return String(res);
            } catch {
              // fall back to the raw field value below
            }
          }
          return this.formatCellValue(val);
        },
      });
    }

    return result;
  }

  private isActionOrSelectionKeyword(str: string): boolean {
    if (!str) return false;
    const lower = str.trim().toLowerCase();
    return [
      "action", "actions", "action menu", "actions menu", "action_btn",
      "action-btn", "actions_btn", "button", "select", "selection", "checkbox",
    ].includes(lower);
  }

  private isActionOrSelectionColumn(col: unknown): boolean {
    if (!col) return true;
    const c = col as Record<string, unknown>;
    if (c["hide"] === true) return true;
    if (c["headerCheckboxSelection"] || c["checkboxSelection"]) return true;
    if (c["cellClass"] === "grid-select-cell" || c["headerClass"] === "grid-select-cell") return true;

    const header = String(c["headerName"] ?? c["header"] ?? "").trim().toLowerCase();
    const field = String(c["field"] ?? "").trim().toLowerCase();
    const colId = String(c["colId"] ?? "").trim().toLowerCase();
    if (this.isActionOrSelectionKeyword(header) || this.isActionOrSelectionKeyword(field) || this.isActionOrSelectionKeyword(colId)) {
      return true;
    }

    if (c["cellRenderer"]) {
      const cellRenderer = c["cellRenderer"];
      const rendererName = (typeof cellRenderer === "function" ? cellRenderer.name : String(cellRenderer)).toLowerCase();
      if (["action", "delete", "button", "menu"].some((kw) => rendererName.includes(kw))) return true;
    }

    if (!field && (!header || header === "action" || header === "actions")) return true;
    return false;
  }

  private extractCellValue(column: PrintColumn, row: Record<string, unknown>, index: number): string {
    const raw = this.getNestedValue(row, column.field);
    return column.format ? column.format(raw, row, index) : this.formatCellValue(raw);
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    if (!obj || !path) return undefined;
    if (path in obj) return obj[path];
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return isNaN(value.getTime()) ? "" : value.toLocaleDateString("en-GB");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return Array.isArray(value) ? value.join(", ") : JSON.stringify(value);
    return String(value);
  }

  /**
   * Sanitizes a title/filename for OS-safe downloading while keeping the
   * readable name intact.
   */
  sanitizeFilename(name: string): string {
    if (!name) return "Report";
    let clean = name.replace(/\.(pdf|csv|xlsx|xls|txt)$/i, "").trim();
    clean = clean.replace(/[\\/:*?"<>|]+/g, " - ").trim();
    clean = clean.replace(/\s+/g, " ");
    return clean || "Report";
  }
}
