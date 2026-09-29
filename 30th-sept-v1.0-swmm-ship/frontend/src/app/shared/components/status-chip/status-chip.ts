import { Component, Input, ChangeDetectionStrategy } from "@angular/core";


export type ChipTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

interface ToneStyle {
  color: string;
  bg: string;
  border: string;
}

/**
 * Small status / count pill used across every SFD screen (tables, headers,
 * category tags). Tone drives the colour set; `dot` renders a leading marker.
 */
@Component({
  selector: "app-status-chip",
  standalone: true,
  imports: [],
  templateUrl: "./status-chip.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./status-chip.css"],
})
export class StatusChip {
  @Input() text = "";
  @Input() tone: ChipTone = "neutral";
  @Input() dot = false;

  private static readonly TONES: Record<ChipTone, ToneStyle> = {
    success: {
      color: "#22C55E",
      bg: "rgba(34,197,94,0.14)",
      border: "rgba(34,197,94,0.40)",
    },
    warning: {
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.14)",
      border: "rgba(245,158,11,0.40)",
    },
    danger: {
      color:" rgb(222, 203, 239)",
      bg: "rgba(248, 44, 54, 0.82)",
      border: "rgba(248,44,54,0.40)",
    },
    info: {
      color: "rgb(201, 155, 245)",
      bg: "rgba(168, 85, 247, 0.14)",
      border: "rgba(168, 85, 247, 0.4)",
    },

    neutral: {
      color: "#9db6cc",
      bg: "rgba(255,255,255,0.06)",
      border: "rgba(255,255,255,0.14)",
    },
  };

  get style(): ToneStyle {
    return StatusChip.TONES[this.tone] ?? StatusChip.TONES["neutral"];
  }
}
