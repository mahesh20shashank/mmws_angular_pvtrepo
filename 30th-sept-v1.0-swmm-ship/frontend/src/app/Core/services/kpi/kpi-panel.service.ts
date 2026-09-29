import { Injectable, computed, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class KpiPanelService {
  isOpen = signal(false);

  private timer: ReturnType<typeof setTimeout> | undefined;

  open() {
    clearTimeout(this.timer);
    this.isOpen.set(true);
  }

  close() {
    clearTimeout(this.timer);
    this.isOpen.set(false);
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  popupPosition = signal({
    top: 0,
    left: 0,
  });

  setPosition(position: { top: number; left: number }) {
    this.popupPosition.set(position);
  }

  scheduleClose() {
    clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      this.isOpen.set(false);
    }, 300);
  }

  readonly hostCount = signal(0);

  readonly hasHost = computed(() => this.hostCount() > 0);

  registerHost() {
    this.hostCount.update((n) => n + 1);
  }

  unregisterHost() {
    this.hostCount.update((n) => Math.max(0, n - 1));
  }

  readonly disabledHostCount = signal(0);

  readonly disabled = computed(() => this.disabledHostCount() > 0);

  setHostDisabled(isDisabled: boolean) {
    this.disabledHostCount.update((n) => Math.max(0, n + (isDisabled ? 1 : -1)));
  }
}
