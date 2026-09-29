import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { Component, NgZone, inject } from "@angular/core";
import { Router } from "@angular/router";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams } from "ag-grid-community";
import { IconComponent } from "../../../shared/components/icon/icon.component";

interface ActionRendererData {
  dart_number?: string;
  opra_no?: string;
  dl_no?: string;
  id?: string | number;
}

interface ActionRendererParams extends ICellRendererParams {
  onView?: (data: ActionRendererData | undefined) => void;
}

@Component({
  selector: "app-action-renderer",
  standalone: true,
  imports: [CommonModule, IconComponent, ButtonComponent],
  templateUrl: "./action-renderer.html",
  styleUrl: "./action-renderer.css",
})
export class ActionRenderer implements ICellRendererAngularComp {
  private router = inject(Router);
  private zone = inject(NgZone);

  params!: ActionRendererParams;
  showActions = false;

  agInit(params: ActionRendererParams): void {
    this.params = params;

    const data = params.data as ActionRendererData | undefined;

    this.showActions =
      !!data?.dart_number ||
      !!data?.opra_no ||
      !!data?.dl_no;
  }

  refresh(): boolean {
    return false;
  }

  // ag-grid mounts cellRenderer components outside Angular's zone (its own perf
  // optimization), so a click here can fire the host page's callback and update its
  // state without Angular ever scheduling a re-render — the API call goes out, but the
  // UI (e.g. a modal) only appears once some unrelated event happens to re-enter the
  // zone. Explicitly running back inside the zone makes the very same click render
  // immediately, without needing a second click.
  openDetails(): void {
    this.zone.run(() => this.params.onView?.(this.params.data as ActionRendererData | undefined));
  }

  closeDart(): void {
    this.zone.run(() =>
      this.router.navigate([
        "/afterAuth/op-maintenance/close-defects",
        (this.params.data as ActionRendererData | undefined)?.id,
      ]),
    );
  }
}
