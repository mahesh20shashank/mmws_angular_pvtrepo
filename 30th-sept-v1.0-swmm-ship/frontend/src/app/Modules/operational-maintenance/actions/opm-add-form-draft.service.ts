import { Injectable } from "@angular/core";
import { OpmSavedSpare } from "./opm-actions.models";

export interface OpmAddFormDraft {
  reason: string;
  isEditing: boolean;
  editItem: string;
  rectified: "Yes" | "No" | "";
  guaranteeDefect: "Yes" | "No" | "";
  baseValues: Record<string, unknown>;
  closureValues: Record<string, unknown>;
  raiseDartValues: Record<string, unknown>;
  gdValues: Record<string, unknown>;
  savedSpares: OpmSavedSpare[];
  savedTrial: { agency: string } | null;
}

/**
 * Keeps the in-progress "Add Defect / DART" form alive across `OpmActionsComponent`
 * being destroyed and recreated — switching to another Operational Maintenance tab
 * and back, or browser back/forward, both tear the component down. A plain
 * root-provided singleton survives that; the component's own signals don't. Cleared
 * explicitly on "Back to List" or a successful submit — it's a draft, not a
 * permanent store, so it only outlives one navigation. Mirrors
 * `SfdAddFormDraftService` in the sibling `sfd/management` module.
 */
@Injectable({ providedIn: "root" })
export class OpmAddFormDraftService {
  private draft: OpmAddFormDraft | null = null;

  save(nextDraft: OpmAddFormDraft): void {
    this.draft = nextDraft;
  }

  peek(): OpmAddFormDraft | null {
    return this.draft;
  }

  clear(): void {
    this.draft = null;
  }
}
