import { Injectable, inject } from "@angular/core";
import { HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";

import { AppService } from "../../../../Core/services/app/app.service";
import { ActivityPeriod, ActivityResponse, SfdOverviewResponse } from "../overview/sfd-overview.model";

@Injectable({ providedIn: "root" })
export class SfdOverviewApiService {
  private readonly appService = inject(AppService);

  getOverview(): Observable<SfdOverviewResponse> {
    return this.appService.get<SfdOverviewResponse>("api/v1/sfd/overview/");
  }

  getActivity(params: { period: ActivityPeriod; page: number; page_size: number }): Observable<ActivityResponse> {
    const httpParams = new HttpParams()
      .set("period", params.period)
      .set("page", params.page)
      .set("page_size", params.page_size);
    return this.appService.get<ActivityResponse>("api/v1/sfd/overview/activity/", { params: httpParams });
  }
}
