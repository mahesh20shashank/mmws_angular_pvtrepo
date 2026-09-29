import { HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { AppService } from "../../../../Core/services/app/app.service";
import { skipFeedback } from "../../../../Core/http/services/http-feedback";
import {
  ClosedDartsReportParams,
  ClosedDartsReportRow,
  DartReportExportKey,
  DartReportFilterOptions,
  DartsReportParams,
  DartsReportRow,
  GuaranteeMonitoringReportParams,
  GuaranteeMonitoringReportRow,
  RaStatusReportParams,
  RaStatusReportRow,
  ServiceRequiredReportParams,
  ServiceRequiredReportRow,
  SparesConsumedReportParams,
  SparesConsumedReportRow,
} from "./dart-reports-api.model";

function toHttpParams(params: object): HttpParams {
  let httpParams = new HttpParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      httpParams = httpParams.set(key, String(value));
    }
  });
  return httpParams;
}

/** OPM (DART) reports — Operational Maintenance "Reports" tab. List endpoints return a plain
 * JSON array (no pagination on the backend); export always returns a CSV blob regardless of
 * the requested format. */
@Injectable({ providedIn: "root" })
export class DartReportsApiService {
  private readonly appService = inject(AppService);

  getDartsReport(params: DartsReportParams = {}): Observable<DartsReportRow[]> {
    return this.appService.get<DartsReportRow[]>("api/v1/dart/reports/darts/", {
      params: toHttpParams(params),
    });
  }

  getClosedDartsReport(params: ClosedDartsReportParams = {}): Observable<ClosedDartsReportRow[]> {
    return this.appService.get<ClosedDartsReportRow[]>("api/v1/dart/reports/closed-darts/", {
      params: toHttpParams(params),
    });
  }

  getServiceRequiredReport(params: ServiceRequiredReportParams = {}): Observable<ServiceRequiredReportRow[]> {
    return this.appService.get<ServiceRequiredReportRow[]>("api/v1/dart/reports/service-required/", {
      params: toHttpParams(params),
    });
  }

  getGuaranteeMonitoringReport(
    params: GuaranteeMonitoringReportParams = {},
  ): Observable<GuaranteeMonitoringReportRow[]> {
    return this.appService.get<GuaranteeMonitoringReportRow[]>("api/v1/dart/reports/guarantee-monitoring/", {
      params: toHttpParams(params),
    });
  }

  getSparesConsumedReport(params: SparesConsumedReportParams = {}): Observable<SparesConsumedReportRow[]> {
    return this.appService.get<SparesConsumedReportRow[]>("api/v1/dart/reports/spares-consumed/", {
      params: toHttpParams(params),
    });
  }

  getRaStatusReport(params: RaStatusReportParams = {}): Observable<RaStatusReportRow[]> {
    return this.appService.get<RaStatusReportRow[]>("api/v1/dart/reports/ra-status/", {
      params: toHttpParams(params),
    });
  }

  getFilterOptions(): Observable<DartReportFilterOptions> {
    return this.appService.get<DartReportFilterOptions>("api/v1/dart/reports/filter-options/");
  }

  /** Backend always returns CSV regardless of the requested format — see `dart/views.py`
   * `OPMReportExportAPIView`. */
  exportReport(reportKey: DartReportExportKey, filters: Record<string, string> = {}): Observable<Blob> {
    return this.appService.postBlob(`api/v1/dart/reports/${reportKey}/export/`, {}, {
      params: toHttpParams(filters),
      context: skipFeedback({ loader: true, toast: false }),
    });
  }
}
