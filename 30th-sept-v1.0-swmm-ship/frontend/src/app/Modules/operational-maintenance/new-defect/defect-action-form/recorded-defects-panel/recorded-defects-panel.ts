import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { DUMMY_RECORDED_DEFECTS, RecordedDefect } from './recorded-defect.model';

/**
 * Floating "Recorded this session" stack — shows every defect raised so far in the
 * current multi-DART session, so the user can keep adding more before moving the
 * whole batch to the DART list. Purely presentational: `defects` is seeded with
 * static sample data for now — the caller is responsible for pushing real entries
 * into the array it passes in as each reason form is actually submitted.
 */
@Component({
  selector: 'app-recorded-defects-panel',
  standalone: true,
  imports: [ButtonComponent, IconComponent],
  templateUrl: './recorded-defects-panel.html',
  styleUrl: './recorded-defects-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordedDefectsPanel {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly defects = input<RecordedDefect[]>(DUMMY_RECORDED_DEFECTS);

  readonly closePanel = output<void>();
  readonly moveToDartList = output<void>();
  readonly raiseRa = output<RecordedDefect>();

  readonly currentlyFillingLabel = computed(() => `Defect ${this.defects().length + 1}`);

  constructor() {
    // The panel docks fixed to the viewport so it stays visible while the form beneath
    // it scrolls — but the app header's height isn't a fixed constant (it can wrap onto
    // two lines at narrow widths), so its live rendered height is measured instead of
    // assuming a pixel value, and kept below the header rather than covering it.
    afterNextRender(() => this.trackHeaderOffset());
  }

  private trackHeaderOffset(): void {
    const header = document.querySelector<HTMLElement>('app-header, app-inventory-tab-nav');
    if (!header) return;

    const applyOffset = () => {
      const offset = header.getBoundingClientRect().bottom;
      this.host.nativeElement.style.setProperty('--rdp-top-offset', `${offset}px`);
    };
    applyOffset();

    const resizeObserver = new ResizeObserver(applyOffset);
    resizeObserver.observe(header);
    window.addEventListener('resize', applyOffset);

    this.destroyRef.onDestroy(() => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', applyOffset);
    });
  }
}
