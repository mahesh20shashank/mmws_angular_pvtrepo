import { PersonnelStatus } from "../models/crew.model";

/** Query-param tab keys — mirrors Django's `crew/personnel_status/?tab=...`. */
export type PersonnelStatusTab = "all" | "present" | "leave" | "ty";

export const STATUS_TAB_LABELS: Record<PersonnelStatusTab, string> = {
  all: "All Personnel",
  present: "Present",
  leave: "On Leave",
  ty: "Ty Duty",
};

/** Maps a status tab to the `CrewPersonnel.status` value it filters for ("all" has none). */
export const STATUS_TAB_TO_STATUS: Partial<Record<PersonnelStatusTab, PersonnelStatus>> = {
  present: "Present",
  leave: "On Leave",
  ty: "Ty Duty",
};
