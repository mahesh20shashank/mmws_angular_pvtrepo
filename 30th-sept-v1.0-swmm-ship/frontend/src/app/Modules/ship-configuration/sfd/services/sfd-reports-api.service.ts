import { HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

import {
  ReportFilterField,
  ReportsFilterOptions,
  SfdApprovalStatusParams,
  SfdApprovalStatusResponse,
  SfdInstallationParams,
  SfdInstallationResponse,
  SfdLocationParams,
  SfdLocationResponse,
  SfdRemovedEquipmentParams,
  SfdRemovedEquipmentResponse,
  SfdReportExportFormat,
  SfdReportExportJob,
  SfdReportExportResponse,
  SfdReportKey,
  SfdTransactionParams,
  SfdTransactionResponse,
  ShipEquipmentConfigurationParams,
  ShipEquipmentConfigurationResponse,
} from "./sfd-reports-api.module";
import { AppService } from "../../../../Core/services/app/app.service";
import { skipFeedback } from "../../../../Core/http/services/http-feedback";

function toHttpParams(params: object): HttpParams {
  let httpParams = new HttpParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      httpParams = httpParams.set(key, String(value));
    }
  });

  return httpParams;
}

@Injectable({ providedIn: "root" })
export class SfdReportsApiService {
  private readonly appService = inject(AppService);

  getSfdTransactions(
    params: SfdTransactionParams = {},
  ): Observable<SfdTransactionResponse> {
    return this.appService.get<SfdTransactionResponse>(
      "api/v1/sfd/reports/sfd-transactions/",
      { params: toHttpParams(params) },
    );
  }
  getReportsFilterOptions(
    fields: ReportFilterField[],
  ): Observable<ReportsFilterOptions> {
    const params = new HttpParams().set("fields", fields.join(","));
    return this.appService.get<ReportsFilterOptions>(
      "api/v1/sfd/reports/filter-options/",
      { params },
    );
  }

  getSfdInstallations(
    params: SfdInstallationParams = {},
  ): Observable<SfdInstallationResponse> {
    return this.appService.get<SfdInstallationResponse>(
      "api/v1/sfd/reports/sfd-installations/",
      { params: toHttpParams(params) },
    );
  }

  getSfdLocations(
    params: SfdLocationParams = {},
  ): Observable<SfdLocationResponse> {
    return this.appService.get<SfdLocationResponse>(
      "api/v1/sfd/reports/sfd-locations/",
      { params: toHttpParams(params) },
    );
  }

  getRemovedEquipment(
    params: SfdRemovedEquipmentParams = {},
  ): Observable<SfdRemovedEquipmentResponse> {
    return this.appService.get<SfdRemovedEquipmentResponse>(
      "api/v1/sfd/reports/removed-equipment/",
      { params: toHttpParams(params) },
    );
  }

  getApprovalStatus(
    params: SfdApprovalStatusParams = {},
  ): Observable<SfdApprovalStatusResponse> {
    return this.appService.get<SfdApprovalStatusResponse>(
      "api/v1/sfd/reports/approval-status/",
      { params: toHttpParams(params) },
    );
  }

  getShipEquipmentConfiguration(
    params: ShipEquipmentConfigurationParams = {},
  ): Observable<ShipEquipmentConfigurationResponse> {
    return this.appService.get<ShipEquipmentConfigurationResponse>(
      "api/v1/sfd/reports/ship-equipment-configuration/",
      { params: toHttpParams(params) },
    );
  }

  requestReportExport(
    reportKey: SfdReportKey,
    format: SfdReportExportFormat,
    filters: Record<string, string | number> = {},
  ): Observable<SfdReportExportResponse> {
    // `format` deliberately goes in the POST body, not a `?format=` query param — DRF reserves
    // that exact query param name for its own content-negotiation (URL_FORMAT_OVERRIDE), and
    // 404s the request before it ever reaches ReportExportAPIView for any value it doesn't
    // recognize as a registered renderer (e.g. "pdf"/"xlsx" — only "json"/"api" are). The backend
    // already reads `format` from request.data (the body) for exactly this reason.
    return this.appService.post<SfdReportExportResponse>(
      `api/v1/sfd/reports/${reportKey}/export/`,
      { ...filters, format },
      { context: skipFeedback({ loader: true, toast: false }) },
    );
  }

  getExportJobStatus(jobId: string): Observable<SfdReportExportJob> {
    return this.appService.get<SfdReportExportJob>(
      `api/v1/sfd/reports/export-jobs/${jobId}/`,
    );
  }

  downloadExportJob(jobId: string): Observable<Blob> {
    return this.appService.getBlob(
      `api/v1/sfd/reports/export-jobs/${jobId}/download/`,
    );
  }
}
