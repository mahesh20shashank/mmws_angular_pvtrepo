export type NotificationCategory =
  | 'approval_request'
  | 'approval_granted'
  | 'approval_rejected'
  | 'sync_status'
  | 'info';

export type NotificationDirection = 'inbound' | 'outbound';

export type NotificationSourceSystem = 'cmms' | 'ilms' | 'internal';

export interface NotificationItem {
  id: number;
  category: NotificationCategory;
  direction: NotificationDirection;
  source_system: NotificationSourceSystem;
  source_label: string;
  title: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  is_actionable: boolean;
  action_url: string;
  related_model: string;
  related_object_id: string;
  created_at: string;
}

export interface SendNotificationPayload {
  recipients: number[];
  title: string;
  body?: string;
  category?: NotificationCategory;
  action_url?: string;
}
