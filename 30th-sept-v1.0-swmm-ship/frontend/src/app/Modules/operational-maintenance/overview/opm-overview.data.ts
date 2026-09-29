import { BarDatum } from "../../../shared/components";
import { OpmDeptDatum } from "./opm-overview.model";

/** Lucide icon names for the Overview panel headers (reused by the component). */
export const OPM_OVERVIEW_PANEL_ICONS = {
  alerts: "triangle-alert",
  quickActions: "zap",
  deptBar: "chart-column",
  trend: "chart-line",
  activity: "upload",
  severity: "chart-pie",
  deptLoad: "chart-bar",
} as const;

/** Presentation metadata (icon/colour) for each backend `cards` key — the API
 *  only returns raw counts, so look/feel stays a frontend concern. */
export const OPM_KPI_PRESENTATION: Record<string, { title: string; iconName: string; iconColor: string; iconBg: string }> = {
  total_active_defects: {
    title: "Total Active Defects",
    iconName: "triangle-alert",
    iconColor: "#F82C36",
    iconBg: "rgba(248,44,54,0.16)",
  },
  opdef_opdef_sta: {
    title: "OPDEF / OPDEF (STA) Count",
    iconName: "triangle-alert",
    iconColor: "#F82C36",
    iconBg: "rgba(248,44,54,0.16)",
  },
  ra_with_fmu_yard: {
    title: "RAs With FMU / With Yard",
    iconName: "house",
    iconColor: "#4AA8FF",
    iconBg: "rgba(0,136,255,0.16)",
  },
  guarantee_exposure_alerts: {
    title: "Guarantee Exposure Alerts",
    iconName: "shield-alert",
    iconColor: "#F82C36",
    iconBg: "rgba(248,44,54,0.16)",
  },
  certificates_issued: {
    title: "Certificates Issued",
    iconName: "award",
    iconColor: "#22C55E",
    iconBg: "rgba(34,197,94,0.16)",
  },
};

/** Quick-action button icon by backend `action` key. */
export const OPM_QUICK_ACTION_ICONS: Record<string, string> = {
  ADD_DEFECT: "plus",
  VIEW_RA_STATUS: "square-check-big",
  ADD_GUARANTEE: "shield-check",
};

/** Alert accent colour by severity band returned by the API. */
export function alertColorForSeverity(severity: string | null): string {
  const s = (severity ?? "").toLowerCase();
  if (s.includes("opdef")) return "#F82C36";
  if (s.includes("caution") || s.includes("watch")) return "#F59E0B";
  return "#4AA8FF";
}

/** Severity-band colour for the "Open DARTs by Operational Severity" donut. */
export function severityColor(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "opdef") return "#F82C36";
  if (s.includes("opdef")) return "#F59E0B";
  return "#4AA8FF";
}

/** Bar chart helper — mark the tallest bar as primary (accent colour). */
export function toBarData(rows: OpmDeptDatum[]): BarDatum[] {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return rows.map((r) => ({ label: r.short, value: r.value, primary: r.value === max }));
}
