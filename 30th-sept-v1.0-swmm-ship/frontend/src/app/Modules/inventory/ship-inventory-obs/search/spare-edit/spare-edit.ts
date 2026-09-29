import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { IconComponent } from "../../../../../shared/components/icon/icon.component";
import { SpareForm } from "../../components/spare-form/spare-form";
import { ObsApiService } from "../../services/obs-api.service";
import { Spare, SpareFormPayload } from "../../models/spare.model";

/** `loading` / `ready` / `error`, the same three states (minus `spare-detail`'s "missing" -
 * this page is only ever reached from a spare that already resolved on that screen or on
 * Search Spare, so a 404 here is not a state this screen has to explain, only a failed call is)
 * `spare-detail.ts` already carries for the identical problem: `@if (spare(); as s)` alone left
 * this screen a bare "Update Spare Details" title over a blank panel for however long `getSpare`
 * took, and forever if it failed - `getSpare` is a GET, so nothing in the interceptor chain
 * raises a toast on failure. */
type SpareEditState = "loading" | "ready" | "error";

@Component({
  selector: "app-obs-spare-edit",
  standalone: true,
  imports: [SpareForm, IconComponent, ButtonComponent],
  templateUrl: "./spare-edit.html",
  styleUrl: "./spare-edit.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpareEdit implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private spareId = "";
  readonly spare = signal<Spare | null>(null);
  readonly saving = signal(false);
  readonly state = signal<SpareEditState>("loading");
  /** Placeholder blocks for the loading branch - see `spare-detail.ts`'s identical field. */
  readonly skeletonBlocks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  ngOnInit(): void {
    this.spareId = this.route.snapshot.paramMap.get("id") ?? "";
    void this.load();
  }

  private async load(): Promise<void> {
    this.state.set("loading");
    try {
      const spare = await firstValueFrom(this.api.getSpare(this.spareId));
      this.spare.set(spare);
      this.state.set("ready");
    } catch {
      this.state.set("error");
    }
  }

  /** Re-runs the same load the route parameter triggered, so a transient failure costs one
   * click rather than a trip back to Search Spare. */
  retry(): void {
    void this.load();
  }

  async onSubmit(payload: SpareFormPayload): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.updateSpare(this.spareId, payload));
      this.goBack();
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search"]);
  }
}
