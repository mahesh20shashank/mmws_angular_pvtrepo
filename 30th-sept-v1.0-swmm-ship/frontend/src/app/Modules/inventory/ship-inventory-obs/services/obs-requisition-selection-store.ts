import { Injectable, signal } from "@angular/core";
import { RequisitionEntry } from "../models/requisition.model";

/** Holds the requisition rows selected for "Initiate Issue" while routing to the issue page. */
@Injectable({ providedIn: "root" })
export class ObsRequisitionSelectionStore {
  readonly selectedEntries = signal<RequisitionEntry[]>([]);

  setSelection(entries: RequisitionEntry[]): void {
    this.selectedEntries.set(entries);
  }

  clear(): void {
    this.selectedEntries.set([]);
  }
}
