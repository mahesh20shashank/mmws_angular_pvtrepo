import { ButtonComponent } from '../../../shared/components/button/button.component';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { CellClickedEvent, ColDef, ICellRendererParams, ValueFormatterParams } from 'ag-grid-community';
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';
import { firstValueFrom } from 'rxjs';
import {
  Ticket,
  TicketDetail,
  TicketManagementService,
} from '../services/ticket-management.service';
import { resolveCmmsApiUrl } from '../../../../environments/api-url';

import { User } from '../../../Core/services/user/user';
import { DetailDrawer } from '../../../shared/components/detail-drawer/detail-drawer';
import { CreateTicketModalComponent, CreateTicketPayload } from './create-ticket-modal/create-ticket-modal.component';
import { ExtendedTicket, MyTicketKpiCounts } from './my-ticket.model';
import { NgClass, UpperCasePipe } from '@angular/common';

@Component({
  selector: 'app-my-ticket',
  standalone: true,
  imports: [NgClass, UpperCasePipe, FormsModule, HelpGuidance, DataGrid, CreateTicketModalComponent, DetailDrawer, ButtonComponent],
  templateUrl: './my-ticket.component.html',
  styleUrls: ['./my-ticket.component.css']
})
export class MyTicketComponent implements OnInit {
  private readonly ticketService = inject(TicketManagementService);
  private readonly notification = inject(NotificationService);
  private readonly userService = inject(User);

  readonly helpHtml = '<p>The tickets you have raised with the HelpDesk. <strong>Open Tickets</strong> are still being worked on, <strong>Closed Tickets</strong> are finished. Use <strong>Raise Ticket to HelpDesk</strong> at the top right to raise a new one, and click any row to read the full record and its status timeline.</p>';

  readonly searchQuery = signal<string>('');
  readonly activeFilter = signal<string>('total');
  readonly activeTab = signal<'open' | 'closed'>('open');
  readonly isLoading = signal<boolean>(false);

  // Detail Modal State
  readonly selectedTicket = signal<ExtendedTicket | null>(null);
  readonly ticketDetail = signal<TicketDetail | null>(null);
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

  readonly showCreateModal = signal<boolean>(false);
  newTitle = '';
  newCategory = 'General';
  newDepartment = '';
  newDepartmentId: number | null = null;
  newPersonalNumber = 'ADMIN';
  newShipName = '';
  newNcnNo = '';
  newMobileNo = '';
  newNcnEmailId = '';
  newPriority: 'low' | 'medium' | 'high' = 'medium';
  newDescription = '';
  newOpeningRemark = '';
  newAttachmentFile: File | null = null;
  newAttachmentFileName = '';

  readonly kpiCounts = signal<MyTicketKpiCounts>({
    total_tickets: 0,
    open_tickets: 0,
    in_progress_tickets: 0,
    closed_tickets: 0,
    low_priority: 0,
    medium_priority: 0,
    high_priority: 0
  });

  readonly tickets = signal<ExtendedTicket[]>([]);

  readonly totalTickets = computed(() => this.kpiCounts().total_tickets || this.tickets().length);
  readonly openTickets = computed(() => this.kpiCounts().open_tickets || this.tickets().filter(t => t.status === 'open' || t.status === 'in_progress').length);
  readonly inProgressTickets = computed(() => this.kpiCounts().in_progress_tickets || this.tickets().filter(t => t.status === 'in_progress').length);
  readonly closedTickets = computed(() => this.kpiCounts().closed_tickets || this.tickets().filter(t => t.status === 'closed').length);
  readonly lowPriority = computed(() => this.kpiCounts().low_priority || this.tickets().filter(t => t.priority === 'low').length);
  readonly mediumPriority = computed(() => this.kpiCounts().medium_priority || this.tickets().filter(t => t.priority === 'medium').length);
  readonly highPriority = computed(() => this.kpiCounts().high_priority || this.tickets().filter(t => t.priority === 'high').length);

  ngOnInit(): void {
    this.loadUserProfile();
    this.loadMyTickets();
  }

  async loadUserProfile(): Promise<void> {
    try {
      const res = (await this.userService.getLoggedInUserDetails()) as any;
      const profile = res?.profile;
      if (profile) {
        if (profile.ship && profile.ship_name) {
          this.newShipName = String(profile.ship_name);
        } else {
          this.newShipName = '';
        }

        const rawDept = profile.department ?? profile.department_detail?.id;
        if (rawDept !== null && rawDept !== undefined && rawDept !== '') {
          const deptIdNum = Number(rawDept);
          this.newDepartmentId = isNaN(deptIdNum) ? null : deptIdNum;
        } else {
          this.newDepartmentId = null;
        }

        if (profile.department_detail && profile.department_detail.name) {
          this.newDepartment = String(profile.department_detail.name);
        } else {
          this.newDepartment = '';
        }

        if (profile.personal_number) {
          this.newPersonalNumber = String(profile.personal_number);
        }
      } else {
        this.newShipName = '';
        this.newDepartment = '';
        this.newDepartmentId = null;
      }
    } catch (err) {
      console.warn('Failed to get user profile from User service:', err);
      this.newShipName = '';
      this.newDepartment = '';
      this.newDepartmentId = null;
    }
  }

  async loadMyTickets(): Promise<void> {
    this.isLoading.set(true);
    try {
      const res = await firstValueFrom(this.ticketService.getMyTickets());
      if (res) {
        let rawList: Ticket[] = [];
        if (Array.isArray(res)) {
          rawList = res;
        } else if (res && typeof res === 'object') {
          if (Array.isArray(res.tickets)) {
            rawList = res.tickets;
            this.kpiCounts.set({
              total_tickets: res.total_tickets ?? res.tickets.length,
              open_tickets: res.open_tickets ?? 0,
              in_progress_tickets: res.in_progress_tickets ?? 0,
              closed_tickets: res.closed_tickets ?? 0,
              low_priority: res.low_priority ?? 0,
              medium_priority: res.medium_priority ?? 0,
              high_priority: res.high_priority ?? 0
            });
          }
        }

        const mapped: ExtendedTicket[] = rawList.map(t => {
          const raw = t as unknown as Record<string, unknown>;
          return {
            ...t,
            ship_name: String(raw['unit_name'] || raw['satellite_unit'] || t.ship_name || '-'),
            department: String(raw['department_name'] || (typeof raw['department'] === 'string' ? raw['department'] : '-')),
            personal_number: String(raw['created_by_name'] || t.created_by || '1234'),
            ncn_email_id: String(raw['ncn_email_id'] || (raw['ncn_no'] ? `${raw['ncn_no']}@navy.gov` : '-')),
            files: (raw['files'] as ExtendedTicket['files']) || [],
            comments: (raw['comments'] as ExtendedTicket['comments']) || []
          };
        });

        this.tickets.set(mapped);
        if (Array.isArray(res)) {
          this.recalculateCounts(mapped);
        }
      }
    } catch (err) {
      console.warn('GET /api/v1/ticket-management/tickets/my-tickets/ request error, falling back:', err);
      try {
        const dashRes = await firstValueFrom(this.ticketService.getTicketDashboard());
        if (dashRes && Array.isArray(dashRes.tickets)) {
          const mapped: ExtendedTicket[] = dashRes.tickets.map(t => {
            const raw = t as unknown as Record<string, unknown>;
            return {
              ...t,
              ship_name: String(raw['unit_name'] || raw['satellite_unit'] || t.ship_name || '-'),
              department: String(raw['department_name'] || (typeof raw['department'] === 'string' ? raw['department'] : '-')),
              personal_number: String(raw['created_by_name'] || t.created_by || '1234'),
              ncn_email_id: String(raw['ncn_email_id'] || (raw['ncn_no'] ? `${raw['ncn_no']}@navy.gov` : '-')),
              files: (raw['files'] as ExtendedTicket['files']) || [],
              comments: (raw['comments'] as ExtendedTicket['comments']) || []
            };
          });
          this.tickets.set(mapped);
          this.recalculateCounts(mapped);
        }
      } catch (fallbackErr) {
        console.warn('Fallback error:', fallbackErr);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  private recalculateCounts(list: ExtendedTicket[]): void {
    this.kpiCounts.set({
      total_tickets: list.length,
      open_tickets: list.filter(t => {
        const s = (t.status || '').toLowerCase();
        return s === 'open' || s === 'in_progress' || s === 'pending' || s === '';
      }).length,
      in_progress_tickets: list.filter(t => (t.status || '').toLowerCase() === 'in_progress').length,
      closed_tickets: list.filter(t => (t.status || '').toLowerCase() === 'closed').length,
      low_priority: list.filter(t => (t.priority || '').toLowerCase() === 'low').length,
      medium_priority: list.filter(t => (t.priority || '').toLowerCase() === 'medium').length,
      high_priority: list.filter(t => (t.priority || '').toLowerCase() === 'high').length
    });
  }

  readonly colDefs: ColDef<ExtendedTicket>[] = [
    {
      headerName: 'SR.NO',
      valueGetter: (params) => (params.node?.rowIndex ?? 0) + 1,
      width: 80,
      minWidth: 70,
      sortable: false,
      cellClass: 'text-center'
    },
    {
      headerName: 'TICKET NUMBER',
      field: 'ticket_number',
      width: 150,
      cellClass: 'font-semibold text-primary-600',
      valueFormatter: (params: ValueFormatterParams<ExtendedTicket, string | null>) => params.value || '-'
    },
    {
      headerName: 'DATE',
      field: 'created_on',
      width: 120,
      valueFormatter: (params: ValueFormatterParams<ExtendedTicket, string | null>) => {
        const val = params.value;
        if (!val) return '-';
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toISOString().split('T')[0];
      }
    },
    {
      headerName: 'TITLE',
      field: 'title',
      width: 130,
      minWidth: 100
    },
    {
      headerName: 'SHIP NAME',
      field: 'ship_name',
      width: 120,
      valueFormatter: (params: ValueFormatterParams<ExtendedTicket, string | null>) => (params.value || '-').toUpperCase()
    },
    {
      headerName: 'DEPARTMENT',
      field: 'department',
      width: 130,
      valueFormatter: (params: ValueFormatterParams<ExtendedTicket, string | null>) => (params.value || 'ADMIN').toUpperCase()
    },
    {
      headerName: 'PERSONAL NUMBER',
      field: 'personal_number',
      width: 160,
      valueFormatter: (params: ValueFormatterParams<ExtendedTicket, string | null>) => (params.value || 'ADMIN').toUpperCase()
    },
    {
      headerName: 'NCN NO',
      field: 'ncn_no',
      width: 110,
      valueFormatter: (params: ValueFormatterParams<ExtendedTicket, string | null>) => params.value || '-'
    },
    {
      headerName: 'MOBILE NO',
      field: 'mobile_no',
      width: 130,
      valueFormatter: (params: ValueFormatterParams<ExtendedTicket, string | null>) => params.value || '-'
    },
    {
      headerName: 'NCN EMAIL ID',
      field: 'ncn_email_id',
      width: 140,
      valueFormatter: (params: ValueFormatterParams<ExtendedTicket, string | null>) => params.value || '-'
    },
    {
      headerName: 'TICKET DESCRIPTION',
      field: 'description',
      flex: 1,
      minWidth: 160
    },
    {
      headerName: 'STATUS',
      field: 'status',
      width: 110,
      cellRenderer: (params: ICellRendererParams<ExtendedTicket>) => {
        const val = (params.value || 'open').toLowerCase();
        let label = 'OPEN';
        if (val === 'closed') {
          label = 'CLOSED';
        } else if (val === 'in_progress') {
          label = 'IN PROGRESS';
        }
        return `<span class="badge-status ${val}">${label}</span>`;
      }
    },
    {
      headerName: 'PRIORITY',
      field: 'priority',
      width: 110,
      cellRenderer: (params: ICellRendererParams<ExtendedTicket>) => {
        const val = (params.value || 'medium').toLowerCase();
        return `<span class="badge-priority ${val}">${val.toUpperCase()}</span>`;
      }
    },
    {
      headerName: 'ACTION',
      width: 90,
      minWidth: 80,
      sortable: false,
      cellClass: 'text-center',
      cellRenderer: () => {
        return `<button class="btn-action-icon" title="View Ticket Details" data-action="view">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>`;
      }
    }
  ];

  readonly filteredTickets = computed(() => {
    let list = this.tickets();
    const tab = this.activeTab();
    const filter = this.activeFilter();
    const query = this.searchQuery().trim().toLowerCase();

    // Tab Filtering: Open (open or in_progress) vs Closed
    if (tab === 'open') {
      list = list.filter(t => {
        const s = (t.status || '').toLowerCase();
        return s === 'open' || s === 'in_progress' || s === 'pending' || s === '';
      });
    } else if (tab === 'closed') {
      list = list.filter(t => (t.status || '').toLowerCase() === 'closed');
    }

    // Priority Filter
    if (filter === 'low') {
      list = list.filter(t => (t.priority || '').toLowerCase() === 'low');
    } else if (filter === 'medium') {
      list = list.filter(t => (t.priority || '').toLowerCase() === 'medium');
    } else if (filter === 'high') {
      list = list.filter(t => (t.priority || '').toLowerCase() === 'high');
    }

    // Search Query
    if (query) {
      list = list.filter(t =>
        (t.ticket_number && t.ticket_number.toLowerCase().includes(query)) ||
        (t.title && t.title.toLowerCase().includes(query)) ||
        (t.created_by && String(t.created_by).toLowerCase().includes(query)) ||
        (t.ship_name && t.ship_name.toLowerCase().includes(query)) ||
        (t.department && t.department.toLowerCase().includes(query)) ||
        (t.description && t.description.toLowerCase().includes(query))
      );
    }

    return list;
  });

  setFilter(filterName: string): void {
    this.activeFilter.set(filterName);
  }

  setTab(tab: 'open' | 'closed'): void {
    this.activeTab.set(tab);
  }

  onCellClicked(event: CellClickedEvent<ExtendedTicket>): void {
    if (!event.data) return;
    const target = event.event?.target as HTMLElement | null;
    const actionBtn = target?.closest('[data-action="view"]');

    if (actionBtn || event.colDef.field === 'ticket_number' || event.colDef.field === 'title') {
      this.openDetailModal(event.data);
    }
  }

  // CREATE TICKET MODAL
  openCreateModal(): void {
    this.newTitle = '';
    this.newCategory = 'General';
    this.newNcnNo = '';
    this.newMobileNo = '';
    this.newNcnEmailId = '';
    this.newPriority = 'medium';
    this.newDescription = '';
    this.newOpeningRemark = '';
    this.newAttachmentFile = null;
    this.newAttachmentFileName = '';
    this.loadUserProfile();
    this.showCreateModal.set(true);
  }

  onNewFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.newAttachmentFile = input.files[0];
      this.newAttachmentFileName = input.files[0].name;
    }
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  readonly isSubmittingTicket = signal<boolean>(false);

  async onTicketSubmitted(payload: CreateTicketPayload): Promise<void> {
    this.newTitle = payload.title;
    this.newDescription = payload.description;
    this.newPriority = payload.priority;
    this.newMobileNo = payload.mobile_no;
    this.newNcnNo = payload.ncn_no;
    this.newNcnEmailId = payload.ncn_email_id;
    this.newOpeningRemark = payload.opening_remark;
    this.newAttachmentFile = payload.file;

    await this.submitNewTicket();
  }

  async submitNewTicket(): Promise<void> {
    if (this.isSubmittingTicket()) {
      return;
    }

    if (!this.newTitle.trim() || !this.newDescription.trim()) {
      this.notification.warning('Please enter a ticket title and description.');
      return;
    }

    try {
      this.isSubmittingTicket.set(true);
      const payload = {
        title: this.newTitle.trim(),
        description: this.newDescription.trim(),
        priority: this.newPriority,
        status: 'open' as const,
        unit_name: this.newShipName,
        satellite_unit: this.newShipName,
        department_name: this.newDepartment,
        department: this.newDepartmentId,
        mobile_no: this.newMobileNo,
        ncn_no: this.newNcnNo,
        ncn_email_id: this.newNcnEmailId,
        opening_remark: this.newOpeningRemark
      };

      const res = (await firstValueFrom(this.ticketService.createTicket(payload))) as { id?: number | string; ticket_id?: number | string } | null;

      if (this.newAttachmentFile && (res?.id || res?.ticket_id)) {
        const ticketId = res.id || res.ticket_id!;
        try {
          await firstValueFrom(this.ticketService.uploadFile(ticketId, this.newAttachmentFile));
        } catch (uploadErr) {
          console.warn('Error uploading attachment file:', uploadErr);
        }
      }

      this.closeCreateModal();
      await this.loadMyTickets();
    } catch (err) {
      console.error('Error creating ticket:', err);
      this.notification.error('Failed to submit ticket. Please try again.');
    } finally {
      this.isSubmittingTicket.set(false);
    }
  }

  // TICKET DETAIL MODAL
  async openDetailModal(ticket: ExtendedTicket): Promise<void> {
    this.selectedTicket.set(ticket);
    this.ticketDetail.set(null);
    this.commentText = '';
    this.selectedFile = null;
    this.selectedFileName = '';
    this.showDetailModal.set(true);
    this.isLoadingDetail.set(true);

    try {
      const detail = await firstValueFrom(this.ticketService.getTicketDetails(ticket.id));
      if (detail) {
        this.ticketDetail.set(detail);
        this.detailTitle = detail.title || ticket.title;
        this.detailDescription = detail.description || ticket.description;
        this.detailPriority = detail.priority || ticket.priority;
        this.detailMobileNo = detail.mobile_no || ticket.mobile_no || '';
        this.detailNcnNo = detail.ncn_no || ticket.ncn_no || '';
      }
    } catch (err) {
      console.warn('Error fetching ticket detail, using cached summary:', err);
      this.detailTitle = ticket.title;
      this.detailDescription = ticket.description;
      this.detailPriority = ticket.priority;
      this.detailMobileNo = ticket.mobile_no || '';
      this.detailNcnNo = ticket.ncn_no || '';
    } finally {
      this.isLoadingDetail.set(false);
    }
  }

  closeDetailModal(): void {
    this.showDetailModal.set(false);
    this.selectedTicket.set(null);
    this.ticketDetail.set(null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.selectedFileName = this.selectedFile.name;
    }
  }

  removeFile(): void {
    this.selectedFile = null;
    this.selectedFileName = '';
  }

  async saveComment(): Promise<void> {
    const ticket = this.selectedTicket();
    if (!ticket) return;

    if (!this.commentText.trim() && !this.selectedFile) {
      this.notification.warning('Please enter a comment or attach a file.');
      return;
    }

    this.isSavingComment.set(true);
    try {
      if (this.commentText.trim()) {
        await firstValueFrom(this.ticketService.addComment(ticket.id, this.commentText.trim()));
      }
      if (this.selectedFile) {
        await firstValueFrom(this.ticketService.uploadFile(ticket.id, this.selectedFile));
      }

      this.notification.success('Comment / Attachment added successfully.');
      this.commentText = '';
      this.removeFile();

      const updated = await firstValueFrom(this.ticketService.getTicketDetails(ticket.id));
      if (updated) {
        this.ticketDetail.set(updated);
      }
      await this.loadMyTickets();
    } catch (err) {
      console.error('Error saving comment:', err);
      this.notification.error('Failed to post comment. Please try again.');
    } finally {
      this.isSavingComment.set(false);
    }
  }

  async updateTicketDetails(): Promise<void> {
    const ticket = this.selectedTicket();
    if (!ticket) return;

    try {
      await firstValueFrom(this.ticketService.updateTicket(ticket.id, {
        title: this.detailTitle,
        description: this.detailDescription,
        priority: this.detailPriority,
        mobile_no: this.detailMobileNo,
        ncn_no: this.detailNcnNo
      }));

      this.notification.success('Ticket details updated successfully.');
      await this.loadMyTickets();
    } catch (err) {
      console.error('Error updating ticket details:', err);
      this.notification.error('Failed to update ticket details.');
    }
  }

  async closeTicket(): Promise<void> {
    const ticket = this.selectedTicket();
    if (!ticket) return;

    this.isClosingTicket.set(true);
    try {
      await firstValueFrom(this.ticketService.closeTicket(ticket.id, {
        title: this.detailTitle || ticket.title,
        description: this.detailDescription || ticket.description
      }));

      this.notification.success('Ticket closed successfully.');
      this.closeDetailModal();
      await this.loadMyTickets();
    } catch (err) {
      console.error('Error closing ticket:', err);
      this.notification.error('Failed to close ticket.');
    } finally {
      this.isClosingTicket.set(false);
    }
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const date = d.toISOString().split('T')[0];
    const time = d.toTimeString().split(' ')[0].substring(0, 5);
    return `${date} ${time}`;
  }

  getFileUrl(filePath?: string): string {
    if (!filePath) return '#';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    return `${resolveCmmsApiUrl().replace(/\/$/, '')}${filePath.startsWith('/') ? '' : '/'}${filePath}`;
  }

  getFileName(filePath?: string): string {
    if (!filePath) return 'Attachment';
    const pathWithoutQuery = filePath.split('?')[0].split('#')[0];
    const parts = pathWithoutQuery.split(/[/\\]/);
    const lastPart = parts[parts.length - 1];
    return lastPart || filePath || 'Attachment';
  }

  exportExcel(): void {
    const data = this.filteredTickets();
    if (!data.length) {
      this.notification.warning('No tickets to export.');
      return;
    }

    const headers = ['SR.NO', 'Ticket Number', 'Date', 'Title', 'Ship Name', 'Department', 'Personal Number', 'NCN No', 'Mobile No', 'NCN Email ID', 'Ticket Description', 'Status', 'Priority'];
    const rows = data.map((t, idx) => [
      idx + 1,
      `"${t.ticket_number || ''}"`,
      `"${t.created_on || ''}"`,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${t.ship_name || ''}"`,
      `"${t.department || 'ADMIN'}"`,
      `"${t.personal_number || 'ADMIN'}"`,
      `"${t.ncn_no || ''}"`,
      `"${t.mobile_no || ''}"`,
      `"${t.ncn_email_id || ''}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${t.status || ''}"`,
      `"${t.priority || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'My_Tickets_Export_' + new Date().toISOString().split('T')[0] + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  }
}
