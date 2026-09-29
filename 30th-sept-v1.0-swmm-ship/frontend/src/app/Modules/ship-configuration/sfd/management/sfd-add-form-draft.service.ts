import { Injectable } from "@angular/core";
import { SfdActionRow, SfdCategory } from "./sfd-actions-fields.config";

export interface SfdAddFormDraft {
  sfdType: "Equipment" | "System" | null;
  category: SfdCategory | null;
  checkVals: Record<string, "Yes" | "No">;
  formValues: Record<string, unknown>;
  serialValue: string;
  frameFrom: string;
  frameTo: string;
  editRow: SfdActionRow | null;
}

/**
 * Keeps the in-progress "Add/Update SFD" form alive across `SfdManagementComponent` being
 * destroyed and recreated — switching to another Ship Configuration tab and back, or browser
 * back/forward within the SPA, both tear the component down. A plain root-provided singleton
 * survives that; the component's own signals don't. Cleared explicitly on "Back to List" or a
 * successful submit — it's a draft, not a permanent store, so it only outlives one navigation.
 */
@Injectable({ providedIn: "root" })
export class SfdAddFormDraftService {
  private draft: SfdAddFormDraft | null = null;

  save(draft: SfdAddFormDraft): void {
    this.draft = draft;
  }

  peek(): SfdAddFormDraft | null {
    return this.draft;
  }

  clear(): void {
    this.draft = null;
  }
}
