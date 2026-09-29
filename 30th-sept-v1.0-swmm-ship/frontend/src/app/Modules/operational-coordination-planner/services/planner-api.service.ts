import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { skipFeedback } from '../../../Core/http/services/http-feedback';
import { resolveCmmsApiUrl } from '../../../../environments/api-url';
import {
  PlannerActivityDto,
  PlannerActivityPayload,
  PlannerActivityQuery,
  PlannerChoicesDto,
  PlannerDartTrendDto,
  PlannerDashboardDto,
  PlannerOverdueDartsResponseDto,
  PlannerSummaryDto,
} from '../models/planner-api.models';

@Injectable({
  providedIn: 'root',
})
export class PlannerApiService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1/events/planner-activities/`;
  private readonly eventsUrl = `${resolveCmmsApiUrl()}api/v1/events/`;

  getActivities(query: PlannerActivityQuery = {}): Observable<PlannerActivityDto[]> {
    return this.http.get<PlannerActivityDto[]>(this.baseUrl, {
      params: this.toParams(query),
    });
  }

  getEvents(query: PlannerActivityQuery = {}): Observable<PlannerActivityDto[]> {
    return this.http.get<PlannerActivityDto[]>(this.eventsUrl, {
      params: this.toParams(query),
    });
  }

  getFeed(query: PlannerActivityQuery = {}): Observable<any[]> {
    return this.http.get<any[]>(`${this.eventsUrl}feed/`, {
      params: this.toParams(query),
    });
  }

  getSummary(query: PlannerActivityQuery = {}): Observable<PlannerSummaryDto> {
    return this.http.get<PlannerSummaryDto>(`${this.baseUrl}summary/`, {
      params: this.toParams(query),
    });
  }

  getChoices(): Observable<PlannerChoicesDto> {
    return this.http.get<PlannerChoicesDto>(`${this.baseUrl}choices/`);
  }

  getDashboard(query: PlannerActivityQuery = {}): Observable<PlannerDashboardDto> {
    return this.http.get<PlannerDashboardDto>(`${this.baseUrl}dashboard/`, {
      params: this.toParams(query),
    });
  }

  getDartTrend(): Observable<PlannerDartTrendDto> {
    return this.http.get<PlannerDartTrendDto>(`${this.baseUrl}dart-trend/`);
  }

  getOverdueDarts(): Observable<PlannerOverdueDartsResponseDto> {
    return this.http.get<PlannerOverdueDartsResponseDto>(`${this.eventsUrl}overdue-darts/`);
  }

  createEvent(payload: FormData | any): Observable<any> {
    return this.http.post<any>(this.eventsUrl, payload, { context: skipFeedback({ toast: true }) });
  }

  updateEvent(id: number | string, payload: any): Observable<any> {
    return this.http.put<any>(`${this.eventsUrl}${id}/`, payload, { context: skipFeedback({ toast: true }) });
  }

  createActivity(payload: PlannerActivityPayload): Observable<PlannerActivityDto> {
    return this.http.post<PlannerActivityDto>(this.baseUrl, payload);
  }

  updateActivity(id: number | string, payload: PlannerActivityPayload): Observable<PlannerActivityDto> {
    return this.http.put<PlannerActivityDto>(`${this.baseUrl}${id}/`, payload);
  }

  deleteActivity(id: number | string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}${id}/`);
  }

  deleteEvent(id: number | string): Observable<void> {
    return this.http.delete<void>(`${this.eventsUrl}${id}/`, { context: skipFeedback({ toast: true }) });
  }

  getShiftRoutines(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}shift-routines/`);
  }

  setRevisedDates(
    changes: { routineId: number | string; revisedDate: string | null }[],
  ): Observable<{ results: Array<{ routine_id: number | string; status: 'success' | 'error'; detail?: string }> }> {
    return this.http.put<any>(
      `${this.baseUrl}set-revised-date/`,
      changes.map((c) => ({
        routine_id: c.routineId,
        calendar_revised_date: c.revisedDate || '',
      })),
    );
  }

  private toParams(query: PlannerActivityQuery): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      params = params.set(key, String(value));
    }

    return params;
  }
}
