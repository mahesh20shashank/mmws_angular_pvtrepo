import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

// Developed with Understanding: shared determinate or indeterminate progress bar, added to the
// design system under doctrine 5.11.3 by decision D18 because the verified shared inventory
// (doctrine 5.11.2) had none and the Sync HRCDF page needed one (R1 F-4 item 8). A number in
// value draws that percentage, clamped to 0..100. null draws the indeterminate state, used
// while the total is not yet known. The element carries role progressbar with aria-valuemin,
// aria-valuemax, aria-valuenow (left off when indeterminate, as ARIA requires) and aria-label.
// Colours are theme tokens only, and the motion stops under prefers-reduced-motion.
@Component({
  selector: "app-progress-bar",
  standalone: true,
  templateUrl: "./progress-bar.html",
  styleUrl: "./progress-bar.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressBar {
  // Developed with Understanding: percent complete, or null for the indeterminate state.
  readonly value = input<number | null>(null);
  // Developed with Understanding: accessible name of the bar, required so it is never unnamed.
  readonly label = input.required<string>();
  // Developed with Understanding: optional id of the visible text that describes the progress.
  readonly describedBy = input("");

  // Developed with Understanding: the value clamped to 0..100, or null when indeterminate or
  // not a finite number.
  protected readonly clamped = computed<number | null>(() => {
    const raw = this.value();
    if (raw === null || !Number.isFinite(raw)) {
      return null;
    }
    return Math.min(100, Math.max(0, raw));
  });

  // Developed with Understanding: the spoken value, so a screen reader hears words rather than
  // a bare number, and hears that the amount is unknown in the indeterminate state.
  protected readonly valueText = computed(() => {
    const value = this.clamped();
    return value === null ? "In progress, amount not yet known" : `${Math.round(value)} percent`;
  });
}
