import { Injectable, signal } from "@angular/core";

/**
 * Holds the ids of the spares Item Search last listed, in the order the grid showed them, so the
 * Spare Specific Details page can walk the same filtered set with its Previous / Next buttons.
 *
 * It exists because Item Search's own `spares` signal is component-local and is destroyed the
 * moment the router navigates away — the detail page had no way of knowing which spares the user
 * had filtered down to, and so was a dead end: back to the grid, re-find the row, open the next
 * one. Ids only, not whole spares: the detail page fetches the record it is showing anyway, and
 * a cached copy could only be a staler version of the same thing.
 *
 * Same shape and lifetime as `ObsSelectionStore`, which stands in for the reference application's
 * session-held `spares` list. This is deliberately a separate store rather than another field on
 * that one: a SELECTION is the rows a user ticked and is consumed by Multi Issue, a RESULT LIST
 * is everything their filters matched, and conflating them would make a Multi Issue selection
 * silently change what Next means.
 */
@Injectable({ providedIn: "root" })
export class ObsResultListStore {
  readonly resultIds = signal<string[]>([]);

  setResults(ids: string[]): void {
    this.resultIds.set([...ids]);
  }

  clear(): void {
    this.resultIds.set([]);
  }

  /** The spare's position in the list, or -1 when this page was not opened from the grid —
   * a deep link, a refresh, or a jump in from the dashboard. */
  indexOf(id: string): number {
    return this.resultIds().indexOf(id);
  }
}
