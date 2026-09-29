import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams } from "ag-grid-community";
import { ChipTone, StatusChip } from "../status-chip/status-chip";

interface StatusChipParams extends ICellRendererParams {
  toneMap?: Record<string, ChipTone>;
  labelMap?: Record<string, string>;
}

/**
 * ag-grid cell renderer that shows a status value as an <app-status-chip>.
 * Reused across every SFD table (Configuration, SFD list, Approval, …).
 *
 * Tone resolution order:
 *   1. `params.toneMap` — explicit { [value]: ChipTone } lookup, or
 *   2. keyword heuristics on the value (active/approved → success, etc.).
 * Wire via columnDef: { cellRenderer: GridStatusChipRenderer,
 *   cellRendererParams: { toneMap: { Active: 'success', ... } } }.
 */
@Component({
  selector: "app-grid-status-chip",
  standalone: true,
  imports: [StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;align-items:center;height:100%;">
      <app-status-chip [text]="text" [tone]="tone"></app-status-chip>
    </div>
  `,
})
export class GridStatusChipRenderer implements ICellRendererAngularComp {
  text = "";
  tone: ChipTone = "neutral";

  agInit(params: StatusChipParams): void {
    const raw = String(params.value ?? "");
    const map = params.toneMap;
    this.tone = map?.[raw] ?? GridStatusChipRenderer.guess(raw);
    this.text = params.labelMap?.[raw] ?? raw;
  }

  refresh(): boolean {
    return false;
  }

  private static guess(value: string): ChipTone {
    const v = (value || "").toLowerCase();
    if (/(active|approved|fitted|complete|done|valid|ok)/.test(v)) {
      return "success";
    }
    if (/(pending|review|awaiting|in progress|hold)/.test(v)) {
      return "warning";
    }
    if (/(removed|rejected|inactive|failed|error|deleted)/.test(v)) {
      return "danger";
    }
    if (/(new|info|draft|submitted)/.test(v)) {
      return "info";
    }
    return "neutral";
  }
}
