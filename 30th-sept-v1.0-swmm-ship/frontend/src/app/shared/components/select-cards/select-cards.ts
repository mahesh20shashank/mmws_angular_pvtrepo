import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";

export interface SelectCard {
  id: string;
  title: string;
  /** Secondary line (description / purpose). Optional. */
  desc?: string;
  /** Count badge (e.g. Configuration sections). Optional. */
  count?: number | string;
  /** Accent colour for the leading dot (e.g. SFD categories). Optional. */
  color?: string;
}

/**
 * A row of clickable radio-style cards (reason pickers, category pickers, RA-type
 * pickers, etc.) — one selected at a time. Each card shows an accent dot/radio,
 * title, and optional description/count badge.
 */
@Component({
  selector: "app-select-cards",
  standalone: true,
  imports: [],
  templateUrl: "./select-cards.html",
  styleUrls: ["./select-cards.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectCards {
  @Input() cards: SelectCard[] = [];
  @Input() value: string | null = null;
  @Input() disabledIds: string[] = [];
  @Output() valueChange = new EventEmitter<string>();

  private static nextId = 0;
  /** Unique per instance so multiple `<app-select-cards>` on the same page don't
   * cross-group their native radio inputs (native `name` grouping is document-wide). */
  readonly groupName = `sel-cards-${SelectCards.nextId++}`;

  isDisabled(card: SelectCard): boolean {
    return this.disabledIds.includes(card.id);
  }

  pick(card: SelectCard): void {
    if (this.isDisabled(card) || card.id === this.value) return;
    this.value = card.id;
    this.valueChange.emit(card.id);
  }
}
