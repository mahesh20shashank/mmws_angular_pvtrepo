import { Ticket } from '../services/ticket-management.service';

export interface MyTicketComment {
  id?: number;
  user?: string;
  user_name?: string;
  comment?: string;
  message?: string;
  created_on?: string;
  timestamp?: string;
  file_url?: string;
  file_name?: string;
}

export interface MyTicketAttachment {
  id?: number;
  name?: string;
  file?: string;
  uploaded_on?: string;
}

export interface ExtendedTicket extends Ticket {
  department?: string;
  personal_number?: string;
  ncn_email_id?: string;
  created_by_name?: string;
  files?: MyTicketAttachment[];
  comments?: MyTicketComment[];
}

export interface MyTicketKpiCounts {
  total_tickets: number;
  open_tickets: number;
  in_progress_tickets: number;
  closed_tickets: number;
  low_priority: number;
  medium_priority: number;
  high_priority: number;
}
