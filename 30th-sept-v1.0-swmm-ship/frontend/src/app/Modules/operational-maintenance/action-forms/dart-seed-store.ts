import { Injectable, signal } from "@angular/core";
import { SpareItem } from "./action-forms.model";

/** What one hand-off into the DART form carries - the spares to pre-load and the route to come
 * back to when the form is finished with, whether it was saved or abandoned. The two travel
 * together in one object because they are one decision: a form that was seeded is a form that
 * has somewhere to return to, and a form that was not has not. */
export interface DartSeed {
  /** The spares to pre-load, already in the shape `SpareSelectionModal` produces on its OBS
   * tab - `sourceTab` included, because `DefactForm.submit` branches on it and a row without
   * one lands in none of its three payload arrays and is silently dropped. */
  spares: SpareItem[];
  /** The absolute Angular route the operator started from, returned to after a save and after
   * a cancel. Absent from the store means "not seeded", and the form keeps the hard-coded
   * destination an ordinary maintainer's DART has always had. */
  originRoute: string;
}

/** The hand-off channel between a queue screen and the single-DART form.
 *
 * WHY A STORE. `ActionForms` can be opened pre-loaded by nothing today - it reads one query
 * parameter, `?reason=`, and has no input, no route data and no router-state read. A list of
 * spare patterns in a URL can be pasted, bookmarked or edited into a state that does not match
 * what the operator selected, so a query parameter is the wrong carrier for this. This store is
 * the same shape as `ObsSelectionStore`
 * (`Modules/inventory/ship-inventory-obs/services/obs-selection-store.ts`), which the Item
 * Search screen already uses for exactly this pattern - it sets the selection and navigates to
 * Multi Issue - so this is the precedent the codebase already set rather than a new mechanism.
 *
 * HOW AND WHEN IT IS CLEARED. `consume()` is read-and-clear, and `ActionForms.ngOnInit` is its
 * only caller. The seed therefore survives exactly one navigation and is gone the instant the
 * form has it - so a save, a cancel, the Back button, a sidebar click or any later unrelated
 * visit to the DART form all find it empty, with no clean-up step that can be forgotten on one
 * path and remembered on another. No DART number is consumed by seeding, so abandoning the
 * form costs nothing.
 *
 * WHAT IT DOES NOT SURVIVE. A full browser refresh destroys the application and the store with
 * it, exactly as it destroys any unsaved form state today. An operator who reloads mid-form
 * gets the ordinary blank DART form and returns to the queue to start again. */
@Injectable({ providedIn: "root" })
export class DartSeedStore {
  private readonly seed = signal<DartSeed | null>(null);

  /** Called by the queue screen immediately before it navigates to the DART form. */
  set(seed: DartSeed): void {
    this.seed.set(seed);
  }

  /** Read once and clear. Returns `null` when the form was opened the ordinary way. */
  consume(): DartSeed | null {
    const current = this.seed();
    this.seed.set(null);
    return current;
  }
}
