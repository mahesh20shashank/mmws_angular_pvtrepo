/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { skipFeedback } from '../../../../Core/http/services/http-feedback';
import { resolveCmmsApiUrl } from '../../../../../environments/api-url';

@Injectable({
  providedIn: 'root'
})
export class MultiDartService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1/dart/multi-dart`;
  private readonly dartUrl = `${resolveCmmsApiUrl()}api/v1/dart`;

  getOptions(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/`);
  }

  getEquipmentObjects(code: string | number): Observable<any> {
    return this.http.get<any>(`${this.dartUrl}/get-equipment-objects/?code=${code}`);
  }

  getEquipmentRows(payload: any, skipFeedbackOpts = false): Observable<any> {
    const options: any = {};
    if (skipFeedbackOpts) {
      options.context = skipFeedback({ loader: true, toast: true });
    }
    return this.http.post<any>(`${this.baseUrl}/equipment-rows/`, payload, options);
  }

  importExcel(formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/import-excel/`, formData, { withCredentials: true });
  }

  draftSave(payload: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/draft-save/`, payload, { withCredentials: true });
  }

  downloadTemplate(payload: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/download-template/`, payload, { responseType: 'blob' });
  }

  saveRows(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/save-rows/`, payload, { withCredentials: true });
  }

  draftOpen(draftId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/draft-open/?draft_id=${draftId}`, { withCredentials: true });
  }

  draftDelete(draftId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/draft-delete/`, { draft_id: draftId }, { withCredentials: true });
  }

  get_nomenclature_details(nomenclature: string | number): Observable<any> {
    return this.http.get<any>(`${this.dartUrl}/get_nomenclature_details/?nomenclature=${nomenclature}`);
  }
}
