import { Injectable, inject, signal } from "@angular/core";
import { AppService } from "../app/app.service";

// Developed with Understanding: the this-ship endpoint of the swmm master app. It is AllowAny, so
// the landing page and the login popup can read it before anyone signs in.
const THIS_SHIP_URL = "api/v1/master/this-ship/";

// Developed with Understanding: GET api/v1/master/this-ship/ (CP-I contract). display_name already
// carries the "INS " prefix, so nothing on the client adds it again. is_set is true only once HR CDF
// Step 1 has locked this ship - the CMMS name is no longer part of the response (D22, D23).
export interface ThisShipResponse {
  hrcdf_ship_name: string;
  display_name: string;
  is_set: boolean;
}

// Developed with Understanding: the name of this ship as the whole app shows it - landing hero,
// login popup and the sidebar badge. Each load() makes one GET. A failed read keeps the values
// already held, and a GET raises no toast through the feedback interceptor.
@Injectable({ providedIn: "root" })
export class ThisShipService {
  private readonly appService = inject(AppService);

  readonly hrcdfShipName = signal("");
  readonly displayName = signal("");
  // Developed with Understanding: false until HR CDF Step 1 has set the ship name. The sidebar
  // reads it to show administrators the "complete HR CDF Step 1" link.
  readonly isSet = signal(false);

  // Developed with Understanding: reads this-ship/ once and stores the HRCDF name, the display name
  // and whether the name is set.
  load(): void {
    this.appService.get<ThisShipResponse>(THIS_SHIP_URL).subscribe({
      next: (response) => {
        this.hrcdfShipName.set(response?.hrcdf_ship_name ?? "");
        this.displayName.set(response?.display_name ?? "");
        this.isSet.set(response?.is_set === true);
      },
      error: () => {
        // Developed with Understanding: swallowed on purpose - the callers fall back to the
        // names they already had.
      },
    });
  }
}
