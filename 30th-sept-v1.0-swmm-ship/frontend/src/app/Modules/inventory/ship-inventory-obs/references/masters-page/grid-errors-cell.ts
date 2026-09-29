import { ChangeDetectionStrategy, Component } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams } from "ag-grid-community";

import { ImportGridRow } from "./import-columns";

/**
 * THE ERRORS CELL, saying which of its lines the operator has to act on.
 *
 * The column was a plain text cell rendering one joined string, and every line in it was the
 * same colour. That put two quite different kinds of sentence side by side with nothing to
 * separate them:
 *
 *   "Pattern number did not match ILMS/WLMS. Please check and try again."   <- fix this
 *   "EQUIPMENT CLASS 'AIR CONDITIONING PLANT' is not yet on your department's
 *    Masters list and will be added when you save."                        <- fix nothing
 *
 * A rating reading a red block of three sentences has no way to know that only the first is
 * theirs. This renderer takes the two lists the row now carries separately and gives them two
 * treatments: the broken rules in the danger colour, the advisories in the ordinary text
 * colour with a quieter weight.
 *
 * COLOUR IS NOT THE ONLY SIGNAL - WCAG 1.4.1. Each error line is prefixed with a bullet and the
 * advisory lines are not, and the advisories keep their own wording ("will be added when you
 * save"), which says what they are in words.
 *
 * Built as DOM rather than an HTML string. Every line here is a server-side message that
 * INTERPOLATES A WORKBOOK CELL the operator typed - `{column} {value!r}` - so an HTML-string
 * renderer would be injecting user content into the page. `textContent` cannot.
 */
@Component({
  selector: "app-obs-grid-errors-cell",
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="obs-errors-cell">
      @for (line of errors; track $index) {
        <p class="obs-errors-cell__error">{{ line }}</p>
      }
      @for (line of advisories; track $index) {
        <p class="obs-errors-cell__advisory">{{ line }}</p>
      }
      @if (suggestion) {
        <p class="obs-errors-cell__suggestion">{{ suggestion }}</p>
      }
    </div>
  `,
  styles: [
    `
      .obs-errors-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 2px 0;
        line-height: 1.35;
      }

      /* The broken rules. --cell-unmatched-text is the token this screen already uses for the
         one other "you must fix this" treatment it has - the unmatched pattern number - so the
         two speak in one voice and no new colour is introduced. */
      .obs-errors-cell__error {
        margin: 0;
        color: var(--cell-unmatched-text);
        font-weight: 600;
      }

      /* the bullet is the NON-COLOUR half of the distinction, so the
         difference survives a monochrome print and a reader who cannot separate the two hues. */
      .obs-errors-cell__error::before {
        content: "• ";
      }

      /* Nothing here is wrong, so nothing here is red. Ordinary text, ordinary weight. */
      .obs-errors-cell__advisory {
        margin: 0;
        color: var(--text-primary);
        font-weight: 400;
      }

      /* the near-match line. Not red - it is not a second thing wrong
         with the row, it is help with the one thing already named above it - and set quieter
         and smaller than both lists so it reads as a footnote to the error rather than as
         another error. It carries no bullet, which is the non-colour signal separating it
         from the broken rules. */
      .obs-errors-cell__suggestion {
        margin: 0;
        color: var(--text-secondary, var(--text-primary));
        font-weight: 400;
        font-size: 0.92em;
        opacity: 0.9;
      }
    `,
  ],
})
export class GridErrorsCell implements ICellRendererAngularComp {
  errors: string[] = [];
  advisories: string[] = [];
  /** composed on the row by `toGridRow`, not here. This renderer's job
   * is to paint the three kinds of line, not to decide what any of them says. */
  suggestion = "";

  agInit(params: ICellRendererParams): void {
    this.read(params);
  }

  refresh(params: ICellRendererParams): boolean {
    this.read(params);
    return true;
  }

  private read(params: ICellRendererParams): void {
    const row = params.data as ImportGridRow | undefined;
    this.errors = row?.errorList ?? [];
    this.advisories = row?.advisoryList ?? [];
    this.suggestion = row?.patternSuggestion ?? "";
  }
}
