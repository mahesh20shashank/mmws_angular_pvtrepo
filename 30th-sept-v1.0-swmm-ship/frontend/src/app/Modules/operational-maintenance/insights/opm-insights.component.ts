import { ChangeDetectionStrategy, Component } from "@angular/core";

import { Chart, ChartData, ChartKind } from "../../../shared/components";

/** One insight tile: a headline visualisation plus its formula / threshold / action notes. */
interface InsightCard {
  n: number;
  title: string;
  type: ChartKind;
  data: ChartData;
  desc: string;
  formula: string;
  threshold: string;
  action: string;
}

/**
 * Operational Maintenance — Insights tab. Nine analytics tiles, each rendered
 * through the reusable `app-chart` facade (donut / line / bar / hbar / gauge /
 * stat) from static dummy data — no API.
 */
@Component({
  selector: "app-opm-insights",
  standalone: true,
  imports: [Chart],
  templateUrl: "./opm-insights.component.html",
  styleUrls: ["./opm-insights.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpmInsightsComponent {
  readonly cards: InsightCard[] = [
    {
      n: 1,
      title: "Operational Severity Snapshot",
      type: "donut",
      data: {
        segments: [
          { label: "OPDEF", value: 5, color: "#F82C36" },
          { label: "OPDEF (STA)", value: 4, color: "#F59E0B" },
          { label: "Normal Defect", value: 29, color: "#4AA8FF" },
        ],
        centerLabel: "Total",
      },
      desc: "How many critical readiness-impacting defects are currently open.",
      formula: "Count(Open DART) grouped by Severity",
      threshold: "Informational",
      action: "Filters the Open DART Register by severity.",
    },
    {
      n: 2,
      title: "Open vs Closed Trend",
      type: "line",
      data: {
        labels: ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        series: [{ label: "Opened", color: "#4AA8FF", values: [18, 24, 16, 30, 22, 38, 29, 42], area: true }],
      },
      desc: "Whether the defect backlog is rising or reducing.",
      formula: "Opened = Count(DART Raised); Closed = Count(DART Closed)",
      threshold: "Warning if Opened > Closed for two periods",
      action: "Opens the Open DART Register / Closed Defect History.",
    },
    {
      n: 3,
      title: "Repeat Defect Heat Map",
      type: "hbar",
      data: {
        bars: [
          { label: "LO Pump", value: 8, color: "#F82C36" },
          { label: "Sea Viper", value: 5, color: "#F59E0B" },
          { label: "FM Pump", value: 4, color: "#F59E0B" },
          { label: "Gyro", value: 3, color: "#4AA8FF" },
          { label: "Alternator", value: 3, color: "#A855F7" },
        ],
      },
      desc: "Equipment that is repeatedly failing.",
      formula: "Recurrence = Count(DART) grouped by Equipment Serial",
      threshold: "Warning if recurrence ≥ 3 in period",
      action: "Opens Closed Defect History filtered by equipment.",
    },
    {
      n: 4,
      title: "Guarantee Exposure Indicator",
      type: "gauge",
      data: { value: 82, unit: "Exposure", color: "#22C55E" },
      desc: "Where guarantee attention is needed, per equipment (each has its own guarantee window).",
      formula: "Exposure % = Elapsed Duration / That Equipment's Guarantee Duration",
      threshold: "Green 0–50 · Yellow 51–75 · Red 76%+",
      action: "Opens the Guarantee Monitoring report.",
    },
    {
      n: 5,
      title: "RA Progress Indicator",
      type: "bar",
      data: {
        bars: [
          { label: "RA-51", value: 92, color: "#4AA8FF" },
          { label: "RA-49", value: 78, color: "#22B8C4" },
          { label: "RA-47", value: 61, color: "#22C55E" },
          { label: "RA-44", value: 47, color: "#F59E0B" },
          { label: "RA-41", value: 33, color: "#7FB3E0" },
        ],
      },
      desc: "How many DARTs under each RA are closed versus total.",
      formula: "Progress % = Closed DART in RA / Total DART in RA",
      threshold: "Colour-coded by routing status",
      action: "Opens the DARTs Under Each RA report.",
    },
    {
      n: 6,
      title: "FMU / Yard Pending Volume",
      type: "bar",
      data: {
        bars: [
          { label: "With FMU", value: 7, color: "#4AA8FF" },
          { label: "With Yard", value: 4, color: "#A855F7" },
        ],
      },
      desc: "How many RAs are pending at FMU versus the Yard.",
      formula: "Count(RA) grouped by Routing Stage",
      threshold: "Warning if pending exceeds threshold",
      action: "Opens the RA Status Register by routing stage.",
    },
    {
      n: 7,
      title: "Certificate Summary",
      type: "stat",
      data: { value: 7, unit: "records" },
      desc: "NAC / NFC / BER / BLR certificates issued (excludes DTNR, which is a deferral, not a certificate).",
      formula: "Count(RA) grouped by Certificate Type",
      threshold: "Informational",
      action: "Opens the RA Status Register by certificate type.",
    },
    {
      n: 8,
      title: "Export Status Snapshot",
      type: "stat",
      data: { value: 3, unit: "records" },
      desc: "RA exports that succeeded, failed, or are pending retry.",
      formula: "Count(RA Export) grouped by Result",
      threshold: "Warning if Failed + Retry > threshold",
      action: "Opens the NavYojana Export Status report.",
    },
    {
      n: 9,
      title: "DTNR Deferral Summary",
      type: "stat",
      data: { value: 2, unit: "records" },
      desc: "How many defects have been deferred to the next refit (Defer Till Next Refit).",
      formula: "Count(RA) where Outcome = DTNR, grouped by equipment / department",
      threshold: "Informational — feeds refit planning, not a certificate metric",
      action: "Opens the Refit Planning / Deferred Defects report.",
    },
  ];
}
