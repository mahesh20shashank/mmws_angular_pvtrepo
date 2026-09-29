import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { User } from "../../../Core/services/user/user";
import { ButtonComponent } from "../../../shared/components/button/button.component";
import { PageHeaderBar } from "../../../shared/components/page-header-bar/page-header-bar";
import { PanelCard } from "../../../shared/components/panel-card/panel-card";
import { StatusChip } from "../../../shared/components/status-chip/status-chip";

// Developed with Understanding: the four states of Guest Home - reading, read failed, own-ship
// login (nothing to restrict) and guest.
type GuestHomeState = "loading" | "error" | "own-ship" | "guest";

// Developed with Understanding: shown for a field the unit-status response left empty.
const NOT_RECORDED = "Not recorded";

// Developed with Understanding: Guest Home at /afterAuth/guest (CP-M, D30) - the one page an
// other-unit login may open. It shows who is signed in, from which unit, and the guest statement,
// from the unit-status signal the guest guard already filled, so opening it makes no second GET.
// Built only from shared components and theme tokens.
@Component({
  selector: "app-guest-home",
  standalone: true,
  imports: [ButtonComponent, PageHeaderBar, PanelCard, StatusChip],
  templateUrl: "./guest-home.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestHomeComponent implements OnInit {
  private readonly userStore = inject(User);
  private readonly router = inject(Router);

  private readonly loading = signal(true);

  // Developed with Understanding: which of the four states to draw.
  readonly state = computed<GuestHomeState>(() => {
    if (this.loading()) {
      return "loading";
    }
    if (this.userStore.unitStatusFailed()) {
      return "error";
    }
    return this.userStore.isOtherUnit() ? "guest" : "own-ship";
  });

  readonly fullName = computed(() => this.userStore.unitStatus()?.full_name || NOT_RECORDED);
  readonly personalNumber = computed(() => this.userStore.unitStatus()?.personal_number || NOT_RECORDED);
  readonly unitName = computed(() => this.userStore.unitStatus()?.unit_name || NOT_RECORDED);

  // Developed with Understanding: the D30 guest statement. When the unit or the ship name is not
  // known it reads "another unit" or "this ship" rather than leaving a gap in the sentence.
  readonly statement = computed(() => {
    const status = this.userStore.unitStatus();
    const unit = status?.unit_name || "another unit";
    const ship = status?.home_ship_display_name || "this ship";
    return `You are logged in from ${unit}. SWMM on ${ship} is available to you as a guest only. Your login is recorded.`;
  });

  ngOnInit(): void {
    this.load(false);
  }

  // Developed with Understanding: Try again in the error state - reads unit-status afresh.
  retry(): void {
    this.load(true);
  }

  // Developed with Understanding: the own-ship state's way back to the normal landing page.
  goHome(): void {
    this.router.navigateByUrl("/afterAuth/home");
  }

  // Developed with Understanding: reuses the status already held for this login unless forced.
  private async load(force: boolean): Promise<void> {
    this.loading.set(true);
    await this.userStore.loadUnitStatus(force);
    this.loading.set(false);
  }
}
