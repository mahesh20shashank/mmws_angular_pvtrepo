/**
 * Shape of the logged-in user returned by `api/v1/user/me/`.
 * The actual response includes a nested `profile` object with user profile details.
 */
export interface UserCapabilities {
  nav_keys?: string[];
  is_privileged?: boolean;
  is_guest?: boolean;
  pending_role_requests?: number;
}

export interface UserProfile {
  id?: number;
  username?: string;
  is_active?: boolean;
  is_admin?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  role?: string;
  role_id?: number | null;
  roles?: string[];
  capabilities?: UserCapabilities;
  image?: string;
  profile?: {
    id?: number;
    firstname?: string;
    lastname?: string;
    personal_number?: string;
    designation?: string;
    role_master?: number | null;
    role_master_detail?: {
      id?: number;
      role_name?: string;
      assigned_users_count?: number;
    };
    rank_detail?: {
      id?: number;
      name?: string;
    };
    designation_master_detail?: {
      id?: number;
      designation_name?: string;
    };
    department_detail?: {
      id?: number;
      name?: string;
    };
    nud_mail?: string;
    ship_name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface UserOption {
  id: number;
  full_name: string;
  personnel_number: string | null;
  rank: string | null;
}

export interface UserTicket {
  id?: number;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  image?: string | null;
  assigned_members?: TeamMember[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TeamMember {
  id?: number;
  name: string;
  rank?: string;
  landline?: string;
  mobile?: string;
  image?: string | null;
}

// Developed with Understanding: GET api/v1/accounts/me/unit-status/ (CP-L API Contract, D29). Every
// field is always present in the response - an unknown value arrives as "" - so none is optional.
export interface UnitStatusResponse {
  is_other_unit: boolean;
  role_display: string;
  full_name: string;
  personal_number: string;
  unit_name: string;
  unit_code: string;
  home_ship_display_name: string;
}
