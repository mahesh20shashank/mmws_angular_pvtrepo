import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { resolveCmmsApiUrl, resolveAuthApiUrl } from '../../../../environments/api-url';

export interface Ticket {
  id: number;
  ticket_number: string;
  created_on: string;
  title: string;
  created_by: string;
  created_by_name?: string;
  ship_name: string;
  unit_name: string;
  mobile_no: string;
  ncn_no: string;
  assigned_to: string;
  description: string;
  status: 'open' | 'closed' | 'in_progress';
  last_commented_on: string | null;
  closed_on: string | null;
  priority: 'low' | 'medium' | 'high';
}

export interface TicketDashboardResponse {
  total_tickets: number;
  open_tickets: number;
  in_progress_tickets: number;
  closed_tickets: number;
  low_priority: number;
  medium_priority: number;
  high_priority: number;
  tickets: Ticket[];
}

export interface CreateTicketPayload {
  title: string;
  priority: 'low' | 'medium' | 'high' | string;
  description: string;
  category?: string;
  [key: string]: unknown;
}

export interface TicketComment {
  id?: number;
  ticket?: number;
  user?: number | string;
  user_name?: string;
  comment?: string;
  message?: string;
  created_at?: string;
  created_on?: string;
  timestamp?: string;
}

export interface TicketActivityLog {
  id?: number;
  ticket?: number;
  user?: string | number;
  user_name?: string;
  comment?: string;
  message?: string;
  created_on?: string;
  timestamp?: string;
  created_at?: string;
  file_url?: string;
  file_name?: string;
}

export interface TicketAttachment {
  id?: number;
  name?: string;
  file?: string;
  uploaded_on?: string;
}

export interface TicketUserInfo {
  user?: string | number;
  username?: string;
  role?: string;
  email?: string;
  unit_name?: string;
  department?: string;
  mobile_no?: string;
  ncn_no?: string;
}

export interface TicketDetail {
  id: number;
  ticket_id?: string;
  ticket_number?: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | string;
  status: 'open' | 'closed' | 'in_progress' | string;
  created_on: string;
  last_commented_on?: string | null;
  closed_on?: string | null;
  mobile_no?: string;
  ncn_no?: string;
  created_by?: string | number;
  created_by_name?: string;
  ship_name?: string;
  unit_name?: string;
  assigned_to?: string;
  department?: string | number;
  department_name?: string;
  files?: TicketAttachment[];
  user_info?: TicketUserInfo;
  comments?: TicketComment[];
  ticket?: Partial<TicketDetail>;
  [key: string]: unknown;
}

export interface UpdateTicketPayload {
  title?: string;
  description?: string;
  priority?: string;
  mobile_no?: string;
  ncn_no?: string;
  comment?: string;
  status?: string;
  file?: File | null;
  [key: string]: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class TicketManagementService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${resolveCmmsApiUrl().replace(/\/$/, '')}/api/v1/ticket-management/`;

  /**
   * Fetches ticket dashboard summary metrics and ticket list.
   */
  getTicketDashboard(): Observable<TicketDashboardResponse> {
    return this.http.get<TicketDashboardResponse>(this.baseUrl);
  }

  getMyTickets(): Observable<TicketDashboardResponse | Ticket[]> {
    return this.http.get<TicketDashboardResponse | Ticket[]>(`${this.baseUrl}tickets/my-tickets/`);
  }

  createTicket(payload: CreateTicketPayload): Observable<unknown> {
    return this.http.post(`${this.baseUrl}form_ticket/`, payload);
  }

  /**
   * Fetches full details of a specific ticket.
   * GET /api/v1/ticket-management/form_ticket/{id}/
   */
  getTicketDetails(id: number | string): Observable<TicketDetail> {
    return this.http.get<TicketDetail>(`${this.baseUrl}form_ticket/${id}/`);
  }

  /**
   * Updates a ticket or adds comments/attachments.
   * POST /api/v1/ticket-management/form_ticket/{id}/
   */
  updateTicket(id: number | string, payload: UpdateTicketPayload | FormData): Observable<unknown> {
    return this.http.post(`${this.baseUrl}form_ticket/${id}/`, payload);
  }

  /**
   * Uploads an attachment file to a specific ticket.
   * POST /api/v1/ticket-management/tickets/{id}/upload-file/
   */
  uploadFile(id: number | string, file: File): Observable<unknown> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post(`${this.baseUrl}tickets/${id}/upload-file/`, formData);
  }

  /**
   * Adds a comment to a specific ticket.
   * POST /api/v1/ticket-management/tickets/{id}/add-comment/
   */
  addComment(id: number | string, comment: string): Observable<unknown> {
    const formData = new FormData();
    formData.append('comment', comment);
    return this.http.post(`${this.baseUrl}tickets/${id}/add-comment/`, formData);
  }

  /**
   * Closes a specific ticket.
   * POST /api/v1/ticket-management/close_ticket/{id}/
   */
  closeTicket(id: number | string, payload: { title: string; description: string } | FormData): Observable<unknown> {
    if (payload instanceof FormData) {
      return this.http.post(`${this.baseUrl}close_ticket/${id}/`, payload);
    }
    const formData = new FormData();
    formData.append('title', payload.title || '');
    formData.append('description', payload.description || '');
    return this.http.post(`${this.baseUrl}close_ticket/${id}/`, formData);
  }

  /**
   * Fetches user details by user ID from auth service.
   * GET /api/v1/auth/users/{userId}/
   */
  getUserById(userId: number | string): Observable<unknown> {
    const authUrl = (resolveAuthApiUrl() || resolveCmmsApiUrl()).replace(/\/$/, '');
    return this.http.get<unknown>(`${authUrl}/api/v1/auth/users/${userId}/`);
  }
}


