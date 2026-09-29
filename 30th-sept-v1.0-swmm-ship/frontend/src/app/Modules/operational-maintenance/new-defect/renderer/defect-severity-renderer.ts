import { Component, ChangeDetectionStrategy } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams } from "ag-grid-community";

interface ToneStyle {
  color: string;
  bg: string;
  border: string;
}

const SEVERITY_TONES: Record<string, ToneStyle> = {
  OPDEF: {
    color: "#F87171",
    bg: "rgba(248, 44, 54, 0.16)",
    border: "rgba(248, 44, 54, 0.4)",
  },
  "OPDEF (STA)": {
    color: "#F59E0B",
    bg: "rgba(245, 158, 11, 0.14)",
    border: "rgba(245, 158, 11, 0.4)",
  },
  "Normal Defect": {
    color: "#3B82F6",
    bg: "rgba(59, 130, 246, 0.14)",
    border: "rgba(59, 130, 246, 0.4)",
  },
};

const DEFAULT_TONE: ToneStyle = {
  color: "#9db6cc",
  bg: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.14)",
};

/**
 * ag-grid cell renderer for the DART "Severity" column — OPDEF / OPDEF (STA) /
 * Normal Defect each carry a fixed brand colour (matching the Defect/DART
 * Management mock), unlike the generic status chip whose tone is guessed from
 * keywords. Sizing is plain CSS (not Tailwind utilities) — mirrors
 * shared/components/status-chip's own .css so it renders at the same compact
 * size as every other chip in the grid regardless of Tailwind's JIT picking up
 * arbitrary-value classes inside a dynamically-mounted ag-grid renderer.
 * Wire via columnDef: { cellRenderer: DefectSeverityRenderer }.
 */
@Component({
  selector: "app-defect-severity-renderer",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cell-wrap">
      <span
        class="severity-chip"
        [style.color]="tone.color"
        [style.background]="tone.bg"
        [style.borderColor]="tone.border"
      >
        {{ text }}
      </span>
    </div>
  `,
  styles: [
    `
    .cell-wrap {
      display: flex;
      align-items: center;
      height: 100%;
    }

    .severity-chip {
      display: inline-flex;
      align-items: center;
      padding: 3px 11px;
      border-radius: 100px;
      border: 1px solid transparent;
      font-family: "Inter", sans-serif;
      font-size: 11px;
      line-height: 16px;
      font-weight: 500;
      white-space: nowrap;
    }
  `,
  ],
})
export class DefectSeverityRenderer implements ICellRendererAngularComp {
  text = "";
  tone: ToneStyle = DEFAULT_TONE;

  agInit(params: ICellRendererParams): void {
    this.text = String(params.value ?? "");
    this.tone = SEVERITY_TONES[this.text] ?? DEFAULT_TONE;
  }

  refresh(): boolean {
    return false;
  }
}
