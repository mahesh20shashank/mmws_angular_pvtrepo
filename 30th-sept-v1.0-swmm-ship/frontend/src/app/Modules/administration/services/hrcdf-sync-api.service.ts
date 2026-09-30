import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { AppService } from "../../../Core/services/app/app.service";
import { skipFeedback } from "../../../Core/http/services/http-feedback";
import {
  HrcdfHomeUnitRequest,
  HrcdfHomeUnitResponse,
  HrcdfOtherPersonnelQuery,
  HrcdfOwnPersonnelQuery,
  HrcdfPersonnelPage,
  HrcdfProgress,
  HrcdfReadiness,
  HrcdfRunMode,
  HrcdfRunRequest,
  HrcdfRunResponse,
  HrcdfUnitsResponse,
} from "../sync-hrcdf/sync-hrcdf.models";

// Developed with Understanding: base path of every HRCDF sync endpoint (CP-C API Contract).
// It is not an api/v1/auth path, so AppService resolves it to the swmm base URL.
const HRCDF_SYNC_BASE = "api/v1/accounts/hrcdf-sync/";

// Developed with Understanding: the most lines one progress poll may ask for, the server cap.
export const HRCDF_PROGRESS_LINE_LIMIT = 2000;

// Developed with Understanding: API layer of the Sync HRCDF page. Every call goes through
// AppService, as the Step 0 service sfd-reference-data-api.service.ts does. The POST calls that
// start work pass skipFeedback({ toast: true }) because the page reports each outcome itself -
// at the field, beside the button, or in the process log - so the interceptor's generic toast
// would say the same thing twice. GET never toasts (feedbackInterceptor, R1 F-3).
@Injectable({ providedIn: "root" })
export class HrcdfSyncApiService {
  private readonly appService = inject(AppService);

  // Developed with Understanding: GET readiness/ - configuration, HRCDF reachability, lock, home
  // unit, counts and the newest job of each mode. recheck asks the server to probe HRCDF again
  // instead of reusing its cached answer.
  getReadiness(recheck = false): Observable<HrcdfReadiness> {
    return this.appService.get<HrcdfReadiness>(
      `${HRCDF_SYNC_BASE}readiness/`,
      recheck ? { params: { recheck: 1 } } : {},
    );
  }

  // Developed with Understanding: GET units/ - Command options, every unit, the home unit and
  // the ship-name hint. The page narrows ships by command on the client, as Step 0 does.
  getUnits(): Observable<HrcdfUnitsResponse> {
    return this.appService.get<HrcdfUnitsResponse>(`${HRCDF_SYNC_BASE}units/`);
  }

  // Developed with Understanding: POST units/refresh/ - Get Ship Names from HRCDF. It starts a
  // units job and answers like runs/ - 202 with a job_id to poll, or 200 inline with the summary.
  // 400 (not configured) and 409 (another run holds the lock) arrive as errors, as with runs/.
  refreshUnits(): Observable<HrcdfRunResponse> {
    return this.appService.post<HrcdfRunResponse>(
      `${HRCDF_SYNC_BASE}units/refresh/`,
      {},
      { context: skipFeedback({ toast: true }) },
    );
  }

  // Developed with Understanding: POST home-unit/ - confirms and locks this ship (D15). A 409 is
  // shown at the Ship Name field by the page.
  setHomeUnit(unitId: number): Observable<HrcdfHomeUnitResponse> {
    const body: HrcdfHomeUnitRequest = { unit_id: unitId };
    return this.appService.post<HrcdfHomeUnitResponse>(`${HRCDF_SYNC_BASE}home-unit/`, body, {
      context: skipFeedback({ toast: true }),
    });
  }

  // Developed with Understanding: DELETE home-unit/ - the application admin's Clear set ship name,
  // for a ship locked by mistake. 403 for anyone else, 409 when nothing is set or a run is going.
  // The page shows the outcome in its dialog.
  clearHomeUnit(): Observable<unknown> {
    return this.appService.delete(`${HRCDF_SYNC_BASE}home-unit/`, {
      context: skipFeedback({ toast: true }),
    });
  }

  // Developed with Understanding: POST runs/ - starts an own-ship or other-units run. 202 when
  // queued, 200 with background_fallback when it ran inline. The page writes the outcome into
  // the process log.
  startRun(mode: HrcdfRunMode): Observable<HrcdfRunResponse> {
    const body: HrcdfRunRequest = { mode };
    return this.appService.post<HrcdfRunResponse>(`${HRCDF_SYNC_BASE}runs/`, body, {
      context: skipFeedback({ toast: true }),
    });
  }

  // Developed with Understanding: GET runs/<job_id>/progress/ - the once-a-second poll, lines
  // after since, at most limit of them.
  getProgress(jobId: string, since: number, limit = HRCDF_PROGRESS_LINE_LIMIT): Observable<HrcdfProgress> {
    return this.appService.get<HrcdfProgress>(
      `${HRCDF_SYNC_BASE}runs/${encodeURIComponent(jobId)}/progress/`,
      { params: { since, limit } },
    );
  }

  // Developed with Understanding: GET personnel/own/ - one server page of this ship's rows.
  getOwnPersonnel(query: HrcdfOwnPersonnelQuery): Observable<HrcdfPersonnelPage> {
    const params: Record<string, string | number> = {
      page: query.page,
      page_size: query.page_size,
      status: query.status,
    };
    if (query.search) {
      params["search"] = query.search;
    }
    return this.appService.get<HrcdfPersonnelPage>(`${HRCDF_SYNC_BASE}personnel/own/`, { params });
  }

  // Developed with Understanding: GET personnel/others/ - one server page of other-unit rows,
  // filtered by command code and unit code when given.
  getOtherPersonnel(query: HrcdfOtherPersonnelQuery): Observable<HrcdfPersonnelPage> {
    const params: Record<string, string | number> = {
      page: query.page,
      page_size: query.page_size,
    };
    if (query.search) {
      params["search"] = query.search;
    }
    if (query.command) {
      params["command"] = query.command;
    }
    if (query.unit) {
      params["unit"] = query.unit;
    }
    return this.appService.get<HrcdfPersonnelPage>(`${HRCDF_SYNC_BASE}personnel/others/`, { params });
  }
}
