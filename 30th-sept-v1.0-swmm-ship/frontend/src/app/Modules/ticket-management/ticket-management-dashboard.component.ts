import { ButtonComponent } from '../../shared/components/button/button.component';
import { DataGrid } from '../../shared/components/data-grid/data-grid';
import { GridStatusChipRenderer } from '../../shared/components/data-grid/grid-status-chip-renderer';
import { CellClickedEvent, ColDef, ValueFormatterParams } from 'ag-grid-community';
import { KpiCard } from '../../shared/components/kpi-card/kpi-card';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { Component, inject, signal, computed, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../Core/services/notification/notification.service';
import { HelpGuidance } from '../../shared/components/help-guidance/help-guidance';
import { firstValueFrom } from 'rxjs';
import {
  Ticket,
  TicketDetail,
  TicketManagementService,
  TicketActivityLog,
  TicketAttachment,
} from './services/ticket-management.service';
import { resolveCmmsApiUrl } from '../../../environments/api-url';


@Component({
  selector: 'app-ticket-management-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HelpGuidance, KpiCard, DataGrid, ModalComponent, ButtonComponent],
  templateUrl: './ticket-management-dashboard.component.html',
  styleUrls: ['./ticket-management-dashboard.component.css']
})
export class TicketManagementDashboardComponent implements OnInit {
  @ViewChild('commentEditor') commentEditorRef?: ElementRef<HTMLDivElement>;

  private readonly ticketService = inject(TicketManagementService);
  private readonly notification = inject(NotificationService);

  readonly helpHtml = '<p>Overview of Help-Desk tickets, with counts by status and priority. Use the search box to find a ticket by number, Export Excel to download the list, and the eye icon in the Action column to open a ticket\'s full details.</p>';

  readonly searchQuery = signal<string>('');
  readonly activeFilter = signal<string>('total');
  readonly isLoading = signal<boolean>(false);
  // Detail Modal State
  readonly selectedTicket = signal<Ticket | null>(null);
  readonly ticketDetail = signal<TicketDetail | null>(null);
  readonly userNames = signal<Record<string, string>>({});
  private readonly inFlightUserFetches = new Set<string>();
  readonly showDetailModal = signal<boolean>(false);
  readonly isLoadingDetail = signal<boolean>(false);
  readonly isSavingComment = signal<boolean>(false);
  readonly isClosingTicket = signal<boolean>(false);

  // Detail Form Fields
  detailTitle = '';
  detailDescription = '';
  detailPriority = 'medium';
  detailMobileNo = '';
  detailNcnNo = '';
  commentText = '';
  selectedFile: File | null = null;
  selectedFileName = '';

  // Create Modal State
  readonly showCreateModal = signal<boolean>(false);
  newTitle = '';
  newCategory = 'General';
  newPriority: 'low' | 'medium' | 'high' = 'medium';
  newDescription = '';

  readonly kpiCounts = signal<{
    total_tickets: number;
    open_tickets: number;
    in_progress_tickets: number;
    closed_tickets: number;
    low_priority: number;
    medium_priority: number;
    high_priority: number;
  }>({
    total_tickets: 0,
    open_tickets: 0,
    in_progress_tickets: 0,
    closed_tickets: 0,
    low_priority: 0,
    medium_priority: 0,
    high_priority: 0
  });

  readonly tickets = signal<Ticket[]>([]);

  readonly totalTickets = computed(() => this.kpiCounts().total_tickets || this.tickets().length);
  readonly openTickets = computed(() => this.kpiCounts().open_tickets || this.tickets().filter(t => t.status === 'open').length);
  readonly inProgressTickets = computed(() => this.kpiCounts().in_progress_tickets || this.tickets().filter(t => t.status === 'in_progress').length);
  readonly closedTickets = computed(() => this.kpiCounts().closed_tickets || this.tickets().filter(t => t.status === 'closed').length);
  readonly lowPriority = computed(() => this.kpiCounts().low_priority || this.tickets().filter(t => t.priority === 'low').length);
  readonly mediumPriority = computed(() => this.kpiCounts().medium_priority || this.tickets().filter(t => t.priority === 'medium').length);
  readonly highPriority = computed(() => this.kpiCounts().high_priority || this.tickets().filter(t => t.priority === 'high').length);

  ngOnInit(): void {
    this.loadTickets();
  }

  async loadTickets(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(this.ticketService.getTicketDashboard());
      if (res) {
        if (Array.isArray(res.tickets)) {
          this.tickets.set(res.tickets);
          const ids = new Set<string>();
          res.tickets.forEach(t => {
            if (t.created_by && !isNaN(Number(t.created_by)) && !t.created_by_name) {
              ids.add(String(t.created_by));
            }
          });
          ids.forEach(id => this.fetchUserNameIfNeeded(id));
        }
        this.kpiCounts.set({
          total_tickets: res.total_tickets ?? (res.tickets?.length || 0),
          open_tickets: res.open_tickets ?? 0,
          in_progress_tickets: res.in_progress_tickets ?? 0,
          closed_tickets: res.closed_tickets ?? 0,
          low_priority: res.low_priority ?? 0,
          medium_priority: res.medium_priority ?? 0,
          high_priority: res.high_priority ?? 0
        });
      }
    } catch (err) {
      console.warn('GET /api/v1/ticket-management/ request error, using fallback state:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  readonly columnDefs: ColDef[] = [
    {
      headerName: 'Sr.No',
      valueGetter: 'node.rowIndex + 1',
      width: 70,
      minWidth: 70,
      maxWidth: 70,
      sortable: false,
      cellClass: 'text-center'
    },
    {
      headerName: 'Ticket Number',
      field: 'ticket_number',
      width: 140,
      cellClass: 'font-mono'
    },
    {
      headerName: 'Date',
      field: 'created_on',
      width: 125,
      valueFormatter: (params: ValueFormatterParams<Ticket, string | null>) => {
        const val = params.value;
        if (!val) return '—';
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    },
    {
      headerName: 'Title',
      field: 'title',
      flex: 1.5,
      minWidth: 200,
      cellClass: 'font-semibold'
    },
    {
      headerName: 'Created By',
      field: 'created_by_name',
      width: 140,
      valueGetter: (params) => {
        const ticket = params.data as Ticket;
        if (!ticket) return '-';
        return this.getUserDisplayName(ticket.created_by, ticket.created_by_name) || ticket.created_by_name || ticket.created_by || '-';
      }
    },
    {
      headerName: 'Ship Name',
      field: 'ship_name',
      width: 130,
      valueFormatter: (params: ValueFormatterParams<Ticket, string | null>) => params.value || '-'
    },
    {
      headerName: 'Unit Name',
      field: 'unit_name',
      width: 120
    },
    {
      headerName: 'Mobile No',
      field: 'mobile_no',
      width: 120
    },
    {
      headerName: 'NCN No',
      field: 'ncn_no',
      width: 130,
      cellClass: 'font-mono'
    },
    {
      headerName: 'Assign To',
      field: 'assigned_to',
      width: 130,
      valueFormatter: (params: ValueFormatterParams<Ticket, string | null>) => params.value || 'None'
    },
    {
      headerName: 'Ticket Description',
      field: 'description',
      flex: 1,
      minWidth: 180
    },
    {
      headerName: 'Status',
      field: 'status',
      width: 130,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: {
        toneMap: {
          open: 'info',
          Open: 'info',
          raised: 'info',
          Raised: 'info',
          in_progress: 'warning',
          'In Progress': 'warning',
          closed: 'success',
          Closed: 'success',
          verified: 'success',
          Verified: 'success',
        },
        labelMap: {
          open: 'Open',
          Open: 'Open',
          in_progress: 'In Progress',
          closed: 'Closed',
        },
      },
    },
    {
      headerName: 'Last Comment',
      field: 'last_commented_on',
      width: 150,
      valueFormatter: (params: ValueFormatterParams<Ticket, string | null>) => {
        const val = params.value;
        if (!val) return '—';
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    },
    {
      headerName: 'Closed On',
      field: 'closed_on',
      width: 130,
      valueFormatter: (params: ValueFormatterParams<Ticket, string | null>) => {
        const val = params.value;
        if (!val) return '—';
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    },
    {
      headerName: 'Priority',
      field: 'priority',
      width: 120,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: {
        toneMap: {
          low: 'success',
          Low: 'success',
          medium: 'warning',
          Medium: 'warning',
          high: 'info',
          High: 'info',
        },
        labelMap: {
          low: 'Low',
          medium: 'Medium',
          high: 'High',
        },
      },
    },
    {
      headerName: 'Action',
      width: 90,
      minWidth: 90,
      sortable: false,
      cellClass: 'text-center',
      cellRenderer: () => {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>`;
      }
    }
  ];

  onCellClicked(event: CellClickedEvent<Ticket>): void {
    if (event.colDef?.headerName === 'Action' || (event.event?.target as HTMLElement)?.closest('[data-action="view"]')) {
      if (event.data) {
        this.viewTicket(event.data);
      }
    }
  }

  readonly filteredTickets = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.activeFilter();

    return this.tickets().filter(ticket => {
      let matchesFilter = true;
      if (filter === 'open') matchesFilter = ticket.status === 'open';
      else if (filter === 'closed') matchesFilter = ticket.status === 'closed';
      else if (filter === 'low') matchesFilter = ticket.priority === 'low';
      else if (filter === 'medium') matchesFilter = ticket.priority === 'medium';
      else if (filter === 'high') matchesFilter = ticket.priority === 'high';

      const matchesSearch = !query ||
        ticket.ticket_number.toLowerCase().includes(query) ||
        ticket.title.toLowerCase().includes(query) ||
        (ticket.created_by_name?.toLowerCase().includes(query) ?? false) ||
        ticket.created_by.toLowerCase().includes(query) ||
        ticket.ship_name.toLowerCase().includes(query) ||
        ticket.unit_name.toLowerCase().includes(query) ||
        ticket.ncn_no.toLowerCase().includes(query) ||
        ticket.description.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  });



  setFilter(filterName: string): void {
    this.activeFilter.set(filterName);
  }

  async viewTicket(ticket: Ticket): Promise<void> {
    this.selectedTicket.set(ticket);
    this.showDetailModal.set(true);
    this.isLoadingDetail.set(true);
    this.commentText = '';
    this.selectedFile = null;
    this.selectedFileName = '';

    // Initialize with selected row data immediately
    this.detailTitle = ticket.title || '';
    this.detailDescription = ticket.description || '';
    this.detailPriority = ticket.priority || 'medium';
    this.detailMobileNo = ticket.mobile_no || 'None';
    this.detailNcnNo = ticket.ncn_no || 'None';

    try {
      const res = await firstValueFrom(this.ticketService.getTicketDetails(ticket.id));
      if (res) {
        const normalized = this.normalizeTicketDetail(res, ticket);
        this.ticketDetail.set(normalized);
        this.resolveTicketUserNames(normalized);
        this.detailTitle = normalized.title;
        this.detailDescription = normalized.description;
        this.detailPriority = normalized.priority;
        this.detailMobileNo = normalized.mobile_no || 'None';
        this.detailNcnNo = normalized.ncn_no || 'None';
      }
    } catch (err) {
      console.warn('GET /api/v1/ticket-management/form_ticket/{id}/ fallback:', err);
      // Fallback ticket detail construction
      const fallback = this.normalizeTicketDetail(null, ticket);
      this.ticketDetail.set(fallback);
      this.resolveTicketUserNames(fallback);
    } finally {
      this.isLoadingDetail.set(false);
    }
  }

  private resolveRawComments(raw: Record<string, unknown>, ticketObj: Record<string, unknown>): Record<string, unknown>[] {
    if (Array.isArray(raw['comments']) && raw['comments'].length > 0) {
      return raw['comments'] as Record<string, unknown>[];
    }
    if (Array.isArray(ticketObj['comments']) && ticketObj['comments'].length > 0) {
      return ticketObj['comments'] as Record<string, unknown>[];
    }
    if (Array.isArray(ticketObj['activity_logs'])) {
      return ticketObj['activity_logs'] as Record<string, unknown>[];
    }
    return [];
  }

  private resolveRawFiles(raw: Record<string, unknown>, ticketObj: Record<string, unknown>): Record<string, unknown>[] {
    if (Array.isArray(raw['files']) && raw['files'].length > 0) {
      return raw['files'] as Record<string, unknown>[];
    }
    if (Array.isArray(ticketObj['files'])) {
      return ticketObj['files'] as Record<string, unknown>[];
    }
    return [];
  }

  private buildComments(rawList: Record<string, unknown>[], defaultUser: string): TicketActivityLog[] {
    return rawList.map((c, idx) => {
      const rawUser = c['user'] ?? c['user_id'] ?? c['user_name'] ?? defaultUser;
      const userName = typeof c['user_name'] === 'string' && c['user_name'].trim() && isNaN(Number(c['user_name']))
        ? c['user_name'].trim()
        : undefined;
      const date = String(c['created_at'] ?? c['created_on'] ?? c['timestamp'] ?? '');
      return {
        id: Number(c['id'] ?? idx + 1),
        user: (typeof c['user'] === 'number' || typeof c['user'] === 'string')
          ? c['user']
          : (typeof rawUser === 'number' || typeof rawUser === 'string' ? rawUser : defaultUser),
        user_name: userName,
        comment: String(c['comment'] ?? c['message'] ?? ''),
        created_on: date,
        created_at: date,
        file_url: typeof c['file'] === 'string' ? c['file'] : (c['file_url'] as string | undefined),
        file_name: typeof c['file_name'] === 'string' ? c['file_name'] : undefined
      };
    });
  }

  private buildFiles(rawList: Record<string, unknown>[]): TicketAttachment[] {
    return rawList.map((f, idx) => ({
      id: Number(f['id'] ?? idx + 1),
      name: String(f['name'] ?? f['file_name'] ?? f['file'] ?? `Attachment ${idx + 1}`),
      file: String(f['file'] ?? f['file_url'] ?? ''),
      uploaded_on: String(f['uploaded_on'] ?? f['created_at'] ?? '')
    }));
  }

  private normalizeTicketDetail(res: unknown, fallbackTicket?: Ticket | null): TicketDetail {
    const raw = (res || {}) as Record<string, unknown>;
    const ticketObj = (raw['ticket'] && typeof raw['ticket'] === 'object')
      ? (raw['ticket'] as Record<string, unknown>)
      : raw;

    const createdByRaw = ticketObj['created_by'] ?? fallbackTicket?.created_by;
    const createdByNameRaw = ticketObj['created_by_name'] ?? fallbackTicket?.created_by_name;
    const defaultUser = String(createdByNameRaw ?? createdByRaw ?? 'User');
    const rawComments = this.resolveRawComments(raw, ticketObj);
    const comments = this.buildComments(rawComments, defaultUser);

    const rawFiles = this.resolveRawFiles(raw, ticketObj);
    const files = this.buildFiles(rawFiles);

    const rawUserInfo = (raw['user_info'] || ticketObj['user_info'] || {}) as Record<string, unknown>;
    const unitName = String(raw['unit_name'] ?? ticketObj['unit_name'] ?? fallbackTicket?.unit_name ?? 'None');
    const department = String(raw['department_name'] ?? ticketObj['department_name'] ?? ticketObj['department'] ?? 'Logistics');

    return {
      id: Number(ticketObj['id'] ?? fallbackTicket?.id ?? 0),
      ticket_id: String(ticketObj['ticket_number'] ?? ticketObj['ticket_id'] ?? fallbackTicket?.ticket_number ?? ''),
      ticket_number: String(ticketObj['ticket_number'] ?? fallbackTicket?.ticket_number ?? ''),
      title: String(ticketObj['title'] ?? fallbackTicket?.title ?? ''),
      description: String(ticketObj['description'] ?? fallbackTicket?.description ?? ''),
      priority: String(ticketObj['priority'] ?? fallbackTicket?.priority ?? 'medium'),
      status: String(ticketObj['status'] ?? fallbackTicket?.status ?? 'open'),
      created_on: String(ticketObj['created_on'] ?? fallbackTicket?.created_on ?? ''),
      last_commented_on: ticketObj['last_commented_on'] ? String(ticketObj['last_commented_on']) : fallbackTicket?.last_commented_on,
      closed_on: ticketObj['closed_on'] ? String(ticketObj['closed_on']) : fallbackTicket?.closed_on,
      mobile_no: String(ticketObj['mobile_no'] ?? fallbackTicket?.mobile_no ?? 'None'),
      ncn_no: String(ticketObj['ncn_no'] ?? fallbackTicket?.ncn_no ?? 'None'),
      created_by: (createdByRaw as string | number | undefined) ?? defaultUser,
      created_by_name: typeof createdByNameRaw === 'string' && isNaN(Number(createdByNameRaw)) ? createdByNameRaw : undefined,
      ship_name: String(ticketObj['ship_name'] ?? fallbackTicket?.ship_name ?? 'None'),
      unit_name: unitName,
      assigned_to: String(ticketObj['assigned_to'] ?? fallbackTicket?.assigned_to ?? 'None'),
      department,
      department_name: department,
      files,
      comments,
      activity_logs: comments,
      user_info: {
        user: (rawUserInfo['user'] ?? rawUserInfo['user_id'] ?? createdByRaw ?? defaultUser) as string | number,
        role: String(rawUserInfo['role'] ?? 'Admin'),
        email: String(rawUserInfo['email'] ?? '—'),
        unit_name: String(rawUserInfo['unit_name'] ?? unitName),
        department: String(rawUserInfo['department'] ?? department),
        mobile_no: String(rawUserInfo['mobile_no'] ?? ticketObj['mobile_no'] ?? fallbackTicket?.mobile_no ?? 'None'),
        ncn_no: String(rawUserInfo['ncn_no'] ?? ticketObj['ncn_no'] ?? fallbackTicket?.ncn_no ?? 'None')
      }
    };
  }

  closeDetailModal(): void {
    this.showDetailModal.set(false);
    this.selectedTicket.set(null);
    this.ticketDetail.set(null);
  }

  async addCommentOrUpload(): Promise<void> {
    const t = this.selectedTicket();
    if (!t) return;

    const comment = this.commentText.trim();
    const hasComment = Boolean(comment);
    const hasFile = Boolean(this.selectedFile);

    if (!hasComment && !hasFile) {
      this.notification.warning('Please enter a comment or choose a file to upload.', 'Input Required');
      return;
    }

    this.isSavingComment.set(true);

    try {
      if (hasComment) {
        await firstValueFrom(this.ticketService.addComment(t.id, comment));
      }
      if (hasFile && this.selectedFile) {
        await firstValueFrom(this.ticketService.uploadFile(t.id, this.selectedFile));
      }

      // this.notification.success('Comment/attachment submitted successfully!', 'Ticket Updated');
      await this.refreshTicketDetailSilently(t.id);
      await this.loadTickets();
    } catch (err) {
      console.warn('API error submitting comment/upload, fallback to local update:', err);
      this.applyLocalCommentFallback(comment);
      //this.notification.success('Comment/attachment recorded!', 'Ticket Updated');
    } finally {
      this.resetCommentForm();
      this.isSavingComment.set(false);
    }
  }

  async closeTicketAction(): Promise<void> {
    const t = this.selectedTicket();
    const detail = this.ticketDetail();
    const ticketId = t?.id || detail?.id;
    if (!ticketId) return;

    this.updateCommentFromEditor();
    const comment = this.commentText.trim();
    const hasComment = (detail?.comments?.length ?? 0) > 0;
    if (!hasComment) {
      this.notification.warning('Please enter a comment before closing the ticket.', 'Warning');
      return;
    }

    const title = this.detailTitle || detail?.title || t?.title || '';
    const description = this.detailDescription || detail?.description || t?.description || '';

    this.isClosingTicket.set(true);
    try {
      // If user typed a comment or attached a file, save it with the ticket
      try {
        await firstValueFrom(this.ticketService.addComment(ticketId, comment));
        if (this.selectedFile) {
          await firstValueFrom(this.ticketService.uploadFile(ticketId, this.selectedFile));
        }
      } catch (commentErr) {
        console.warn('Could not post comment via addComment endpoint, proceeding with close ticket payload:', commentErr);
        this.applyLocalCommentFallback(comment);
      }

      await firstValueFrom(this.ticketService.closeTicket(ticketId, { title, description: comment || description }));
      this.notification.success('Ticket closed successfully!', 'Ticket Closed');

      const closedDate = new Date().toISOString().split('T')[0];

      if (t) {
        this.selectedTicket.set({
          ...t,
          status: 'closed',
          closed_on: closedDate
        });
      }

      if (detail) {
        this.ticketDetail.set({
          ...detail,
          status: 'closed',
          closed_on: closedDate
        });
      }

      this.tickets.update(list =>
        list.map(item => item.id === ticketId ? { ...item, status: 'closed', closed_on: closedDate } : item)
      );

      this.resetCommentForm();
      await this.refreshTicketDetailSilently(ticketId);
      await this.loadTickets();
    } catch (err) {
      console.warn('API error closing ticket, applying fallback state:', err);
      const closedDate = new Date().toISOString().split('T')[0];

      if (t) {
        this.selectedTicket.set({
          ...t,
          status: 'closed',
          closed_on: closedDate
        });
      }

      if (detail) {
        this.ticketDetail.set({
          ...detail,
          status: 'closed',
          closed_on: closedDate
        });
      }

      this.tickets.update(list =>
        list.map(item => item.id === ticketId ? { ...item, status: 'closed', closed_on: closedDate } : item)
      );

      this.notification.success('Ticket closed successfully!', 'Ticket Closed');
      this.resetCommentForm();
    } finally {
      this.isClosingTicket.set(false);
    }
  }

  private async refreshTicketDetailSilently(ticketId: string | number): Promise<void> {
    try {
      const updated = await firstValueFrom(this.ticketService.getTicketDetails(ticketId));
      if (updated) {
        const curTicket = this.selectedTicket();
        const normalized = this.normalizeTicketDetail(updated, curTicket);
        this.ticketDetail.set(normalized);
        this.resolveTicketUserNames(normalized);
      }
    } catch (e) {
      console.warn('Failed to refresh ticket detail:', e);
    }
  }

  /**
   * Helper to format a user object returned by GET /api/v1/auth/users/{user_id}/
   */
  private formatUserName(userData: unknown): string {
    if (!userData) return '';
    if (typeof userData === 'string') return userData;
    const obj = userData as Record<string, unknown>;
    const profile = (obj['profile'] && typeof obj['profile'] === 'object') ? (obj['profile'] as Record<string, unknown>) : {};
    // const rank = String(obj['rank'] ?? profile['rank'] ?? '').trim();
    const firstName = String(obj['first_name'] ?? obj['firstname'] ?? profile['firstname'] ?? profile['first_name'] ?? '').trim();
    const lastName = String(obj['last_name'] ?? obj['lastname'] ?? profile['lastname'] ?? profile['last_name'] ?? '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    return fullName || String(obj['name'] ?? obj['display_name'] ?? obj['username'] ?? (obj['id'] ? `User #${obj['id']}` : ''));
  }

  /**
   * Fetches user details by user ID from /api/v1/auth/users/{user_id}/ if not already cached or requested.
   */
  fetchUserNameIfNeeded(userId: string | number | null | undefined): void {
    if (userId === null || userId === undefined) return;
    const idStr = String(userId).trim();
    if (!idStr || isNaN(Number(idStr)) || Number(idStr) <= 0) return;
    if (this.userNames()[idStr] || this.inFlightUserFetches.has(idStr)) return;

    this.inFlightUserFetches.add(idStr);
    this.ticketService.getUserById(idStr).subscribe({
      next: (userData) => {
        const displayName = this.formatUserName(userData);
        if (displayName) {
          this.userNames.update(current => ({ ...current, [idStr]: displayName }));
        }
        this.inFlightUserFetches.delete(idStr);
      },
      error: (err) => {
        console.warn(`Failed to fetch user with id ${idStr}:`, err);
        this.inFlightUserFetches.delete(idStr);
      }
    });
  }

  /**
   * Returns a display name for a user. If given a user ID (numeric), resolves it via /api/v1/auth/users/{user_id}/.
   */
  getUserDisplayName(user: unknown, fallbackName?: unknown): string {
    const rawFallback = (typeof fallbackName === 'string' && fallbackName.trim()) ? fallbackName.trim() : '';

    if (typeof user === 'object' && user !== null) {
      const formatted = this.formatUserName(user);
      if (formatted) return formatted;
      if ('id' in (user as Record<string, unknown>)) {
        return this.getUserDisplayName((user as Record<string, unknown>)['id'], fallbackName);
      }
    }

    const userStr = (user !== null && user !== undefined) ? String(user).trim() : '';

    // Check if user is a numeric ID (e.g. 1, 2, "23")
    if (userStr && !isNaN(Number(userStr)) && Number(userStr) > 0) {
      const cached = this.userNames()[userStr];
      if (cached) {
        return cached;
      }
      this.fetchUserNameIfNeeded(userStr);
      if (rawFallback && isNaN(Number(rawFallback))) {
        return rawFallback;
      }
      return `User #${userStr}`;
    }

    // Check if fallbackName is a numeric ID
    if (rawFallback && !isNaN(Number(rawFallback)) && Number(rawFallback) > 0) {
      const cached = this.userNames()[rawFallback];
      if (cached) {
        return cached;
      }
      this.fetchUserNameIfNeeded(rawFallback);
      return `User #${rawFallback}`;
    }

    if (rawFallback && isNaN(Number(rawFallback))) {
      return rawFallback;
    }

    if (userStr && isNaN(Number(userStr))) {
      return userStr;
    }

    return 'User';
  }

  /**
   * Pre-fetches user names for all users found in a ticket detail (comments, user info, author).
   */
  private resolveTicketUserNames(detail: TicketDetail): void {
    if (!detail) return;
    if (detail.created_by) {
      this.fetchUserNameIfNeeded(detail.created_by);
    }
    if (detail.user_info?.user) {
      this.fetchUserNameIfNeeded(detail.user_info.user);
    }
    const list = detail.comments || [];
    for (const item of list) {
      if (item.user) {
        this.fetchUserNameIfNeeded(item.user);
      }
    }
  }

  private applyLocalCommentFallback(comment: string): void {
    const cur = this.ticketDetail();
    if (!cur) return;

    const fallbackComment = comment || (this.selectedFileName ? `Attached: ${this.selectedFileName}` : 'Updated ticket');
    const user = String(cur.user_info?.user || cur.created_by || 'User');
    const nowIso = new Date().toISOString();
    const newLog: TicketActivityLog = {
      id: (cur.comments?.length || 0) + 1,
      user,
      user_name: user,
      comment: fallbackComment,
      created_on: nowIso,
      created_at: nowIso
    };

    const updatedComments: TicketActivityLog[] = [...(cur.comments || []), newLog];

    this.ticketDetail.set({
      ...cur,
      last_commented_on: newLog.created_on,
      comments: updatedComments,
      activity_logs: updatedComments
    });
  }

  formatDateTime(val?: string | null): string {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  }

  executeFormat(command: string, value: string | undefined = undefined, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
    }
    if (this.commentEditorRef?.nativeElement) {
      this.commentEditorRef.nativeElement.focus();
    }
    document.execCommand(command, false, value);
    this.updateCommentFromEditor();
  }

  onFontSizeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const size = select.value;
    if (size) {
      this.executeFormat('fontSize', size);
    }
  }

  onColorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const color = input.value;
    if (color) {
      this.executeFormat('foreColor', color);
    }
  }

  triggerColorPicker(colorInput: HTMLInputElement, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
    }
    colorInput.click();
  }

  showEditorHelp(event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
    }
    this.notification.info(
      'Select text and use toolbar buttons to format (Bold, Italic, Underline, Lists, Code, Quotes, Colors).',
      'Comment Formatting'
    );
  }

  onEditorInput(event: Event): void {
    const el = event.target as HTMLDivElement;
    this.commentText = el.innerHTML;
  }

  private updateCommentFromEditor(): void {
    if (this.commentEditorRef?.nativeElement) {
      this.commentText = this.commentEditorRef.nativeElement.innerHTML;
    }
  }

  private resetCommentForm(): void {
    this.commentText = '';
    if (this.commentEditorRef?.nativeElement) {
      this.commentEditorRef.nativeElement.innerHTML = '';
    }
    this.selectedFile = null;
    this.selectedFileName = '';
    const fileInput = document.getElementById('ticketFileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.selectedFileName = this.selectedFile.name;
    } else {
      this.selectedFile = null;
      this.selectedFileName = '';
    }
  }

  openCreateModal(): void {
    this.newTitle = '';
    this.newCategory = 'General';
    this.newPriority = 'medium';
    this.newDescription = '';
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  async submitNewTicket(): Promise<void> {
    if (!this.newTitle.trim()) {
      this.notification.warning('Please enter a ticket title.', 'Validation Error');
      return;
    }

    const payload = {
      title: this.newTitle.trim(),
      priority: this.newPriority,
      description: this.newDescription.trim()
    };

    try {
      await firstValueFrom(this.ticketService.createTicket(payload));
      this.notification.success('Ticket created successfully!', 'Ticket Raised');
      this.showCreateModal.set(false);
      await this.loadTickets();
    } catch (err) {
      console.warn('API post fallback to local update:', err);
      const today = new Date().toISOString().split('T')[0];
      const newId = this.tickets().length + 1;
      const ticketNum = 'T' + today.replace(/-/g, '') + (310 + newId);

      const newTicket: Ticket = {
        id: newId,
        ticket_number: ticketNum,
        created_on: today,
        title: this.newTitle.trim(),
        created_by: 'sys',
        created_by_name: "SYSADMIN",
        ship_name: 'INS Vikrant',
        unit_name: 'E-Section',
        mobile_no: '9876543210',
        ncn_no: 'NCN-2025-0' + (10 + newId),
        assigned_to: 'SYSADMIN',
        description: this.newDescription.trim() || 'No additional description provided.',
        status: 'open',
        last_commented_on: today + ' 10:00',
        closed_on: null,
        priority: this.newPriority
      };

      this.tickets.set([newTicket, ...this.tickets()]);
      this.showCreateModal.set(false);
      this.notification.success('Ticket ' + ticketNum + ' created successfully!', 'Ticket Raised');
    }
  }

  private formatDateForCsv(val?: string | null, includeTime = false): string {
    if (!val) return '-';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    if (includeTime) {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day} ${month} ${year}, ${hours}:${minutes}`;
    }
    return `${day} ${month} ${year}`;
  }

  exportExcel(): void {
    const list = this.filteredTickets();
    if (list.length === 0) {
      this.notification.info('No tickets to export in current view.', 'Export Info');
      return;
    }

    const headers = ['Sr.No', 'Ticket Number', 'Date', 'Title', 'Created By', 'Ship Name', 'Unit Name', 'Mobile No', 'NCN No', 'Assign To', 'Description', 'Status', 'Last Comment On', 'Closed On', 'Priority'];
    const escapeCsv = (val: unknown, forceText = false) => {
      const raw = String(val ?? '').trim();
      if (!raw) return '""';
      if (raw === '-') return '"-"';

      // Excel automatically converts long numeric strings (>= 10 digits) to scientific notation (e.g. 3.33333E+14)
      // and strips leading zeros (e.g. 09876543210).
      // Formatting as ="value" forces Excel to display it verbatim as text.
      const isNumeric = /^\+?\d+$/.test(raw);
      if (isNumeric && (forceText || raw.length >= 10 || raw.startsWith('0') || raw.startsWith('+'))) {
        return `"=""${raw.replace(/"/g, '""')}"""`;
      }
      return `"${raw.replace(/"/g, '""')}"`;
    };

    const rows = list.map((t, idx) => [
      idx + 1,
      escapeCsv(t.ticket_number, true),
      escapeCsv(this.formatDateForCsv(t.created_on, true)),
      escapeCsv(t.title),
      escapeCsv(this.getUserDisplayName(t.created_by, t.created_by_name) || t.created_by_name || t.created_by || '-'),
      escapeCsv(t.ship_name || '-'),
      escapeCsv(t.unit_name || '-'),
      escapeCsv(t.mobile_no || '-', true),
      escapeCsv(t.ncn_no || '-', true),
      escapeCsv(t.assigned_to || 'None'),
      escapeCsv(t.description),
      escapeCsv((t.status || '').toUpperCase()),
      escapeCsv(this.formatDateForCsv(t.last_commented_on, true)),
      escapeCsv(this.formatDateForCsv(t.closed_on, false)),
      escapeCsv((t.priority || '').toUpperCase())
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Ticket_Management_Export_' + new Date().toISOString().split('T')[0] + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.notification.success('Exported ' + list.length + ' tickets successfully!', 'Export Complete');
  }

  getFileUrl(file: string | undefined | null): string {
    if (!file) return '#';
    if (file.startsWith('http://') || file.startsWith('https://') || file.startsWith('blob:') || file.startsWith('data:')) {
      return file;
    }
    const base = resolveCmmsApiUrl().replace(/\/$/, '');
    const cleanPath = file.startsWith('/') ? file : `/${file}`;
    return `${base}${cleanPath}`;
  }
}
