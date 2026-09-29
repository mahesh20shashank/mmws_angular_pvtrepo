import { Injectable, signal } from "@angular/core";
import { Spare } from "../models/spare.model";

/**
 * Holds the spares selected in Item Search's grid while the user is routed to
 * Multi Issue. Stands in for Django's session-based `spares` list.
 */
@Injectable({ providedIn: "root" })
export class ObsSelectionStore {
  readonly selectedSpares = signal<Spare[]>([]);

  setSelection(spares: Spare[]): void {
    this.selectedSpares.set(spares);
  }

  clear(): void {
    this.selectedSpares.set([]);
  }
}
