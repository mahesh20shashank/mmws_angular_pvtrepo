import { ButtonComponent } from '../../shared/components/button/button.component';
import {
  Component,
  effect,
  signal,
  CUSTOM_ELEMENTS_SCHEMA,
  HostListener,
  OnInit,
  OnDestroy,
  inject,
  AfterViewInit,
  ChangeDetectionStrategy,
} from "@angular/core";
import { RouterModule } from "@angular/router";
import { CommonModule } from "@angular/common";
import { ModalComponent } from "../../shared/components";
import { SidebarComponent } from "../landing/side-bar/sidebar.component";
import { InfoModalComponent } from "./info-modal/info-modal.component";
import { SignupModalComponent } from "./signup-modal/signup-modal.component";
import { LoginModalComponent } from "./login-modal/login-modal.component";
import { PersonModalComponent } from "./person-modal/person-modal.component";
import { ShipModalComponent } from "./ship-modal/ship-modal.component";
import { SyncModalComponent } from "./sync-modal/sync-modal.component";
import { DailyOrdersHistoryModal } from "./daily-orders-history-modal/daily-orders-history-modal";
import { AddDailyOrderModal } from "./add-daily-order-modal/add-daily-order-modal";
import { NotificationService } from "../../Core/services/notification/notification.service";
import { firstValueFrom } from "rxjs";
import {
  LandingData,
  DailyOrder,
  HierarchyNode,
  createEmptyLandingData,
} from "./landingPageInterface";
import { LandingPageService } from "./services/landing-page.service";
import { IconComponent } from "../../shared/components/icon/icon.component";
import { AppInfo, Call } from "../../Core/http/services/call";
import { ThisShipService } from "../../Core/services/ship/this-ship.service";

type Section = "hero" | "info" | "integration" | "usefulness" | "gallery";

// Developed with Understanding: the raw birthday and event rows of the landing endpoint, typed
// so the mapping below needs no any (it only reads these fields).
interface RawLandingBirthday {
  name?: string;
  event_date?: string;
}

interface RawLandingEvent {
  title?: string;
  description?: string;
  start_date?: string;
}

@Component({
  selector: "app-landing",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    LoginModalComponent,
    ModalComponent,
    ShipModalComponent,
    InfoModalComponent,
    SignupModalComponent,
    SidebarComponent,
    PersonModalComponent,
    SyncModalComponent,
    DailyOrdersHistoryModal,
    AddDailyOrderModal,
    IconComponent, ButtonComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: "./landing.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./landing.component.scss"],
})
export class LandingComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly landingService = inject(LandingPageService);
  private readonly notification = inject(NotificationService);
  private readonly call = inject(Call);
  // Developed with Understanding: this ship's display name ("INS " plus the HRCDF ship name),
  // shown on the hero, the ship image and the login popup.
  readonly thisShip = inject(ThisShipService);

  readonly isLoaded = signal(false);
  readonly appInfo = signal<AppInfo | null>(null);
  private readonly loginModalOpen = signal(false);
  readonly isLoginOpen = this.loginModalOpen;
  private readonly shipModalOpen = signal(false);
  readonly isShipOpen = this.shipModalOpen;
  private readonly infoModalOpen = signal(false);
  readonly isInfoOpen = this.infoModalOpen;
  private readonly signupModalOpen = signal(false);
  readonly isSignupOpen = this.signupModalOpen;
  private readonly personModalOpen = signal(false);
  readonly isPersonOpen = this.personModalOpen;
  private readonly syncModalOpen = signal(false);
  readonly isSyncOpen = this.syncModalOpen;
  /** "Last Sync" + date/time hidden on the landing (pre-login) footer for now —
   *  only shown on the authenticated footer after login. Flip back to true to
   *  restore it here too. */
  readonly showLastSync = false;
  private readonly historyModalOpen = signal(false);
  readonly isHistoryOpen = this.historyModalOpen;
  private readonly addOrderModalOpen = signal(false);
  readonly isAddOrderOpen = this.addOrderModalOpen;

  leader: HierarchyNode | null = null;
  members: HierarchyNode[] = [];
  activeSection = signal<Section>("hero");

  tooltipX = 0;
  tooltipY = 0;
  isHovered = false;

  data: LandingData = createEmptyLandingData();
  private readonly defaultShipImage = "assests/images/ship-img.png";
  private readonly shipImageAspectRatio = 961 / 269;
  private readonly shipImageAspectTolerance = 0.25;
  private readonly shipImageMinWidth = 300;
  private readonly shipImageMinHeight = 80;
  readonly shipImageSrc = signal<string>(this.defaultShipImage);

  private autoPlayInterval: ReturnType<typeof setInterval> | undefined;

  constructor() {
    effect(() => {
      const hasModalOpen =
        this.isLoginOpen() ||
        this.isShipOpen() ||
        this.isInfoOpen() ||
        this.isSignupOpen() ||
        this.isPersonOpen() ||
        this.isSyncOpen() ||
        this.isHistoryOpen() ||
        this.isAddOrderOpen();

      document.body.classList.toggle("modal-open", hasModalOpen);
    });
  }

  onMouseMove(event: MouseEvent, container: HTMLDivElement) {
    const rect = container.getBoundingClientRect();
    this.tooltipX = event.clientX - rect.left + 15;
    this.tooltipY = event.clientY - rect.top + 15;
  }

  onShipImageError(): void {
    if (this.shipImageSrc() !== this.defaultShipImage) {
      this.shipImageSrc.set(this.defaultShipImage);
    }
  }

  onShipImageLoad(event: Event): void {
    if (this.shipImageSrc() === this.defaultShipImage) return;

    const img = event.target as HTMLImageElement;
    const { naturalWidth, naturalHeight } = img;
    if (!naturalWidth || !naturalHeight) return;

    if (
      naturalWidth < this.shipImageMinWidth ||
      naturalHeight < this.shipImageMinHeight
    ) {
      this.shipImageSrc.set(this.defaultShipImage);
      return;
    }

    const ratio = naturalWidth / naturalHeight;
    const deviation =
      Math.abs(ratio - this.shipImageAspectRatio) / this.shipImageAspectRatio;

    if (deviation > this.shipImageAspectTolerance) {
      this.shipImageSrc.set(this.defaultShipImage);
    }
  }

  ngOnInit() {
    this.startAutoPlay();
    this.loadAppInfo();
    // Developed with Understanding: one read of this-ship/ per visit to the landing page.
    this.thisShip.load();
  }

  private async loadAppInfo(): Promise<void> {
    try {
      const response = await firstValueFrom(this.call.getAppInfo());
      this.appInfo.set(response);
      // api call
    } catch {
      this.appInfo.set(null);
    }
  }

  ngAfterViewInit(): void {
    this.getData().then(() => {
      this.isLoaded.set(true);
    });
  }

  ngOnDestroy() {
    this.stopAutoPlay();
  }

  private toArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (
      value &&
      typeof value === "object" &&
      "results" in value &&
      Array.isArray((value as { results: unknown[] }).results)
    ) {
      return (value as { results: T[] }).results;
    }

    return [];
  }

  async getData() {
    try {
      const response = await firstValueFrom(
        this.landingService.getLandingPageData(),
      );

      // this.data = res as LandingData;

      const birthdays = this.toArray<RawLandingBirthday>(response["birthdays"]);
      const mappedBirthdays = birthdays.map((event) => ({
        full_name: event.name,
        date_of_birth: event.event_date,
      }));

      const events = this.toArray<RawLandingEvent>(response["events"]);
      const mappedEvents = events.map((event) => ({
        description: event.title || event.description,
        date: event.start_date,
      }));

      this.data = {
        knowYourShip:
          response["knowYourShip"] &&
          typeof response["knowYourShip"] === "object" &&
          !Array.isArray(response["knowYourShip"])
            ? (response["knowYourShip"] as LandingData["knowYourShip"])
            : createEmptyLandingData().knowYourShip,

        gallery: this.toArray(response["gallery"]),
        coMessages: this.toArray(response["coMessages"]),
        hierarchy: this.toArray(response["hierarchy"]),
        events: mappedEvents,
        birthdays: mappedBirthdays,
        dailyOrders: this.toArray(response["dailyOrders"]),
        shipRoles: this.toArray(response["shipRoles"]),
      };

      this.shipImageSrc.set(
        this.data.knowYourShip.ship_image || this.defaultShipImage,
      );

      if (this.data?.hierarchy?.length > 0) {
        // Find leader (node with no parent)
        this.leader =
          this.data.hierarchy.find((n: HierarchyNode) => !n.parent) ||
          this.data.hierarchy[0];
      }

      if (this.leader) {
        this.members = this.data.hierarchy.filter(
          (n: HierarchyNode) => n.parent == this.leader?.id,
        );

        // Fallback if parent IDs don't match for some reason, just show other nodes
        if (this.members.length === 0 && this.data.hierarchy.length > 1) {
          this.members = this.data.hierarchy.filter(
            (n: HierarchyNode) => n.id != this.leader?.id,
          );
        }
      }
    } catch (error) {
      console.error("Failed to load landing page data", error);
      this.data = createEmptyLandingData();
      this.notification.error(
        "Some content could not be loaded. Please try again later.",
      );
    }
  }

  scrollToSection(id: string): void {
    this.activeSection.set(id as Section);

    const element = document.getElementById(id);

    if (!element) return;

    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  startAutoPlay() {
    this.stopAutoPlay();
    this.autoPlayInterval = setInterval(() => {
      this.nextSlide();
    }, 4000);
  }

  stopAutoPlay() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
    }
  }

  openLogin() {
    this.loginModalOpen.set(true);
    this.signupModalOpen.set(false);
  }

  closeLogin() {
    this.loginModalOpen.set(false);
  }

  openSignup() {
    this.signupModalOpen.set(true);
    this.loginModalOpen.set(false);
  }

  closeSignup() {
    this.signupModalOpen.set(false);
  }

  openShip() {
    this.shipModalOpen.set(true);
  }

  closeShip() {
    this.shipModalOpen.set(false);
  }

  openPerson() {
    this.personModalOpen.set(true);
  }

  closePerson() {
    this.personModalOpen.set(false);
  }

  // Info modal methods
  openInfo() {
    this.infoModalOpen.set(true);
  }

  closeInfo() {

    this.infoModalOpen.set(false);
  }

  openSync() {
    this.isSyncOpen.set(true);
  }

  closeSync() {
    this.isSyncOpen.set(false);
  }

  openHistory() {
    this.historyModalOpen.set(true);
  }

  closeHistory() {
    this.historyModalOpen.set(false);
  }

  openAddOrder() {
    this.addOrderModalOpen.set(true);
  }

  closeAddOrder() {
    this.addOrderModalOpen.set(false);
  }

  openPdf(url: string | undefined) {
    if (url) {
      window.open(url, "_blank");
    }
  }

  activeDailyOrderTooltip: DailyOrder | null = null;
  dailyOrderTooltipX = 0;
  dailyOrderTooltipY = 0;
  dailyOrderTooltipPlacement: 'top' | 'bottom' = 'top';

  showTooltip(event: MouseEvent, order: DailyOrder) {
    this.activeDailyOrderTooltip = order;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    const margin = 12;
    const tooltipWidth = Math.min(320, window.innerWidth - margin * 2);
    const halfWidth = tooltipWidth / 2;
    const rawX = rect.left + rect.width / 2;

    this.dailyOrderTooltipX = Math.min(
      Math.max(rawX, halfWidth + margin),
      window.innerWidth - halfWidth - margin,
    );
    const estimatedTooltipHeight = 160;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    this.dailyOrderTooltipPlacement =
      spaceAbove < estimatedTooltipHeight && spaceBelow > spaceAbove ? 'bottom' : 'top';
    this.dailyOrderTooltipY =
      this.dailyOrderTooltipPlacement === 'top'
        ? Math.max(rect.top - 10, margin)
        : Math.min(rect.bottom + 10, window.innerHeight - margin);
  }

  hideTooltip() {
    this.activeDailyOrderTooltip = null;
  }

  @HostListener("window:scroll", [])
  onWindowScroll() {
    if (this.activeDailyOrderTooltip) {
      this.hideTooltip();
    }

    const sections = ['hero', 'info', 'integration', 'usefulness', 'gallery'];
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

    // Threshold is 250px from top of viewport to account for header heights
    const threshold = 250;

    for (const section of sections) {
      const el = document.getElementById(section);
      if (el) {
        const top = el.offsetTop - threshold;
        const height = el.offsetHeight;
        if (scrollPosition >= top && scrollPosition < top + height) {
          this.activeSection.set(section as Section);
        }
      }
    }
  }

  // Tabs selection state
  activeTab = signal<"role" | "message">("role");

  // Slider carousel assets and state

  activeSlide = signal(0);

  prevSlide() {
    if (!this.data.gallery.length) return;
    this.activeSlide.update((curr) =>
      curr === 0 ? this.data.gallery.length - 1 : curr - 1,
    );
    this.startAutoPlay();
  }

  nextSlide() {
    if (!this.data.gallery.length) return;
    this.activeSlide.update((curr) =>
      curr === this.data.gallery.length - 1 ? 0 : curr + 1,
    );
    this.startAutoPlay();
  }

  selectSlide(index: number) {
    this.activeSlide.set(index);
    this.startAutoPlay();
  }

  getPrevIndex(): number {
    const curr = this.activeSlide();
    return curr === 0 ? this.data.gallery.length - 1 : curr - 1;
  }

  getNextIndex(): number {
    const curr = this.activeSlide();
    return curr === this.data.gallery.length - 1 ? 0 : curr + 1;
  }

  getSlidePosition(index: number): number {
    const active = this.activeSlide();
    const count = this.data.gallery.length;
    let diff = index - active;

    if (diff > count / 2) {
      diff -= count;
    } else if (diff < -count / 2) {
      diff += count;
    }
    return diff;
  }

  getSlideStyles(index: number) {
    const pos = this.getSlidePosition(index);
    let transform = "translateX(-50%) scale(0.5)";
    let opacity = "0";
    let zIndex = "0";
    let pointerEvents = "none";
    if (pos === 0) {
      transform = "translateX(-50%) scale(1)";
      opacity = "1";
      zIndex = "30";
      pointerEvents = "auto";
    } else if (pos === 1) {
      transform = "translateX(50%) scale(0.83)";
      opacity = "0.55"; // slightly higher base opacity, dissolves controlled by gradient overlays
      zIndex = "20";
      pointerEvents = "auto";
    } else if (pos === -1) {
      transform = "translateX(-150%) scale(0.83)";
      opacity = "0.55"; // slightly higher base opacity, dissolves controlled by gradient overlays
      zIndex = "20";
      pointerEvents = "auto";
    } else if (pos === 2) {
      transform = "translateX(110%) scale(0.6)";
      zIndex = "10";
    } else if (pos === -2) {
      transform = "translateX(-210%) scale(0.6)";
      zIndex = "10";
    }

    return {
      transform: transform,
      opacity: opacity,
      "z-index": zIndex,
      "pointer-events": pointerEvents,
    };
  }

  onSlideClick(index: number) {
    const pos = this.getSlidePosition(index);
    if (pos === 1) {
      this.nextSlide();
    } else if (pos === -1) {
      this.prevSlide();
    }
  }

  pauseAutoPlay() {
    this.stopAutoPlay();
  }

  resumeAutoPlay() {
    this.startAutoPlay();
  }
}
