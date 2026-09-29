export interface PersonnelEvent {
  type: string;
  name: string;
  personal_number: string | null;
  designation: string | null;
  event_date: string;
  age: number | null;
  years: number | null;
  event_label: string;
}

export interface PersonnelEventsResponse {
  status: string;
  count: number;
  from_date: string;
  to_date: string;
  today: PersonnelEvent[];
  tomorrow: PersonnelEvent[];
  upcoming: PersonnelEvent[];
  results: PersonnelEvent[];
}

export interface UserByIdResponse {
  id: number;
  username: string;
  profile?: {
    firstname?: string;
    lastname?: string;
    personal_number?: string | null;
    marriage_date?: string | null;
    date_of_marrige?: string | null;
  };
}

export interface AnniversaryModalPayload {
  selectType: 'personal' | 'other';
  personnelId: string | null;
  name: string;
  personalNo: string;
  dateOfMarriage: string;
}

export interface PersonnelOption {
  id: string;
  name: string;
  personalNo: string;
}

export interface StoredUserData {
  id?: number;
}

export interface CommandMessagePayload {
  message: string;
  validTillDate: string;
}

export interface UpcomingEventUpdatePayload {
  title: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: null;
  category: null;
  description: null;
  document: File | null;
}

export interface ShipRole {
  id: number;
  title: string;
  description: string;
  uploadedDate: string;
}

export interface CoMessage {
  id: number;
  message: string;
  valid_till_date: string;
  uploaded_date: string;
}

export interface UpcomingEvent {
  id: number;
  title: string;
  date: string;
  document: string;
}

export interface DailyOrder {
  id: number;
  serNo?: number;
  date: string;
  description: string;
  officer_details: string;
  routine_details: string;
  pdf_path: string;
}

export interface OfficerSpotlight {
  name: string;
  rank: string;
  role: string;
  image: string;
}

export interface SaveDailyOrderPayload {
  filename: string;
  source: string;
  pdf_path: string;
  roster_name: string;
  from_date: string;
  to_date: string;
  description: string;
  date: string;
  officer_details: string;
  routine_details: string;
}

export interface Quote {
  id?: number;
  quoteText?: string;
  is_active?: boolean;
}


export interface RoleItem {
  id: number;
  role_name: string;
  code?: string;
  description?: string;
  is_system?: boolean;
  assigned_users_count?: number;
}

export interface RoleRequestItemApi {
  id: number;
  user_id?: number;
  username?: string;
  role_id?: number;
  role_name?: string;
  status?: string;
  created_on?: string;
  created_at?: string;
  acted_by?: string;
  reason?: string;
  requested_role?: number;
  requested_role_detail?: {
    id?: number;
    role_name?: string;
  };
  acted_by_detail?: {
    id?: number;
    firstname?: string;
    lastname?: string;
  };
}

export interface RoleOfferableItem {
  id: number;
  role_name: string;
}

export interface RoleRequestResponse {
  status: string;
  count?: number;
  requests: RoleRequestItemApi[];
  offerable?: RoleOfferableItem[];
}

export type RoleRequestApi = RoleRequestItemApi;

export interface RoleRequestPayload {
  role_id: number;
  reason: string;
}