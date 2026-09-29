import { ButtonComponent } from '../button/button.component';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { IconComponent } from "../icon/icon.component";

export type ExportKind = "pdf" | "excel" | "print";


@Component({
  selector: "app-export-toolbar",
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: "./export-toolbar.html",
  styleUrl: "./export-toolbar.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportToolbar {
  /** Which action is currently in flight (disables all buttons and spins its icon), or null when idle. */
  readonly busy = input<ExportKind | null>(null);
  /** Hide the Print button for screens that don't support it. */
  readonly showPrint = input(true);
  /** Disables every button — pass e.g. `rows().length === 0` so Export can't be clicked on an
   * empty table. */
  readonly disabled = input(false);

  readonly exportRequested = output<ExportKind>();

  onClick(kind: ExportKind): void {
    if (this.busy() || this.disabled()) return;
    this.exportRequested.emit(kind);
  }
}
