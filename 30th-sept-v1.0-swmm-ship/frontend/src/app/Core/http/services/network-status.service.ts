import { Injectable, computed, signal } from "@angular/core";

/**
 * Single source of truth for connectivity across the app. `online` reflects
 * only the browser's real connectivity state — there is no manual override.
 */
@Injectable({ providedIn: "root" })
export class NetworkStatusService {
  private readonly browserOnline = signal(typeof navigator === "undefined" ? true : navigator.onLine);

  readonly online = computed(() => this.browserOnline());

  constructor() {
    window.addEventListener("online", () => this.browserOnline.set(true));
    window.addEventListener("offline", () => this.browserOnline.set(false));
  }
}
