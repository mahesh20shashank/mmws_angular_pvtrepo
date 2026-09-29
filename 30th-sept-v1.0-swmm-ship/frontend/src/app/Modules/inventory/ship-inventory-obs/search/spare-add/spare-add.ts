import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { SpareForm } from "../../components/spare-form/spare-form";
import { ModalComponent } from "../../../../../shared/components/modal/modal.component";
import { IconComponent } from "../../../../../shared/components/icon/icon.component";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { ObsApiService } from "../../services/obs-api.service";
import { SpareConflict, SpareFormPayload, isSpareConflict } from "../../models/spare.model";

@Component({
  selector: "app-obs-spare-add",
  standalone: true,
  imports: [SpareForm, RouterLink, ModalComponent, IconComponent, ButtonComponent],
  templateUrl: "./spare-add.html",
  styleUrl: "./spare-add.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpareAdd {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  readonly saving = signal(false);

  /** Hard block — a pattern number is a ship-wide identifier, so this can't be
   * bypassed from here; shown as an inline banner right above the form field the
   * user needs to change. */
  readonly patternConflict = signal<Extract<SpareConflict, { kind: "duplicate-pattern" }> | null>(
    null,
  );
  /** Soft, confirm-to-proceed warning scoped to the caller's own department. */
  readonly descriptionConflict = signal<
    Extract<SpareConflict, { kind: "duplicate-description" }> | null
  >(null);
  private pendingPayload: SpareFormPayload | null = null;

  async onSubmit(payload: SpareFormPayload): Promise<void> {
    this.patternConflict.set(null);
    this.descriptionConflict.set(null);
    this.saving.set(true);
    try {
      const result = await firstValueFrom(this.api.addSpare(payload));
      this.notifications.success(
        result.patternNumberGenerated
          ? `Spare added. Pattern number ${result.spare.patternNumber} was generated automatically.`
          : "Spare added.",
      );
      this.goBack();
    } catch (error) {
      this.handleSubmitError(error, payload);
    } finally {
      this.saving.set(false);
    }
  }

  async confirmAddAnyway(): Promise<void> {
    const payload = this.pendingPayload;
    if (!payload) return;
    this.descriptionConflict.set(null);
    this.saving.set(true);
    try {
      const result = await firstValueFrom(
        this.api.addSpare(payload, { confirmDuplicateDescription: true }),
      );
      this.notifications.success(
        result.patternNumberGenerated
          ? `Spare added. Pattern number ${result.spare.patternNumber} was generated automatically.`
          : "Spare added.",
      );
      this.goBack();
    } catch (error) {
      this.handleSubmitError(error, payload);
    } finally {
      this.saving.set(false);
    }
  }

  private handleSubmitError(error: unknown, payload: SpareFormPayload): void {
    if (isSpareConflict(error)) {
      if (error.kind === "duplicate-pattern") {
        this.patternConflict.set(error);
      } else {
        this.pendingPayload = payload;
        this.descriptionConflict.set(error);
      }
      return;
    }
    this.notifications.error(error instanceof Error ? error.message : "Could not save the spare.");
  }

  dismissDescriptionConflict(): void {
    this.descriptionConflict.set(null);
    this.pendingPayload = null;
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search"]);
  }
}
