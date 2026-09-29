export interface SubDepartmentMaster {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  active?: boolean | number;
  equipment_count?: number;
}

export interface DepartmentMaster {
  id: number;
  name: string;
  code: string;
  dep_code: string | null;
  description: string | null;
  active: number | boolean;
  subdepartments?: SubDepartmentMaster[];
}

export interface MasterNavItem {
  key: string;
  label: string;
  icon: string;
}

export interface MasterNavGroup {
  title: string;
  items: MasterNavItem[];
}

export interface CrewDetail {
  id: number;
  serNo: number;
  fullName: string;
  designation: string;
  rank: string;
  image: string | null;
}

export interface ShipOfficer {
  id: number;
  serNo: number;
  fullName: string;
  designation: string;
  rank: string;
  dateOfJoining: string | null;
  image: string | null;
}

export interface QuoteOfTheDay {
  id: number;
  serNo: number;
  quote: string;
  uploadedDate: string;
  active: boolean;
}

export interface MemberDetailPayload {
  name: string;
  designation: string;
  rank: string;
  date_of_joining?: string | null;
  image_path?: string | null;
}

/** `MemberDetailSerializer` response shape (backend `master.MemberDetail`). */
export interface MemberDetailApi {
  id: number;
  name: string;
  designation: string;
  rank: string;
  date_of_joining?: string | null;
  image_path: string | null;
  uploaded_date: string;
}

/** `QuoteSerializer` response shape (backend `master.Quote`). */
export interface QuoteApi {
  id: number;
  quote_text: string;
  quoteText: string;
  uploaded_date: string;
  addedDate: string;
  is_active: boolean;
  is_displayed: boolean;
  last_displayed_date: string | null;
}

export interface ShipRoleImageApi {
  id: number;
  image: string;
}

/** `ShipRoleSerializer` response shape (backend `master.ShipRole`). */
export interface ShipRoleApi {
  id: number;
  role_title: string | null;
  current_text: string;
  uploaded_date: string;
  images: ShipRoleImageApi[];
}

export interface ShipRole {
  id: number;
  serNo: number;
  title: string;
  description: string;
  uploadedDate: string;
  images: ShipRoleImageApi[];
}

/** `CoMessageSerializer` response shape (backend `master.CoMessage`). */
export interface CoMessageApi {
  id: number;
  message: string;
  valid_till_date: string;
  uploaded_date: string;
}

export interface CommandMessage {
  id: number;
  serNo: number;
  message: string;
  uploadedDate: string;
  validTillDate: string;
}

/** `EventSerializer` response shape (backend `activity_planner.Event`). */
export interface UpcomingEventApi {
  id: number;
  title: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string | null;
  category: string;
  description: string | null;
  document: string | null;
  created_by: string | null;
  created_at: string;
}

export interface UpcomingEvent {
  id: number;
  serNo: number;
  eventName: string;
  startDate: string;
  endDate: string | null;
  document: string | null;
  uploadedDate: string;
}

/** `LoginRegistrationImageSerializer` response shape (backend `users.LoginRegistrationImage`). */
export interface LoginPageImageApi {
  id: number;
  image: string;
  name: string | null;
  designation: string | null;
  source: string;
  uploaded_at: string;
  uploaded_by: number | null;
  is_active: boolean;
}

export interface LoginPageImage {
  id: number;
  image: string;
  name: string | null;
  designation: string | null;
  uploadedAt: string;
}
