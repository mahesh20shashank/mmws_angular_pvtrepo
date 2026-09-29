export interface InboxMessage {
  id: number;
  sender: number;
  sender_name: string;
  recipient: number;
  recipient_name: string;
  msg_title: string;
  msg_short_title: string;
  msg_body: string;
  status: 'read' | 'unread' | 'scheduled' | 'draft' | '';
  created_at: string;
  read_at: string | null;
  attachments?:string;
}
