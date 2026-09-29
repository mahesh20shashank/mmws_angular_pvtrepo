export type HierarchyNodeType =
  | "co"
  | "hod"
  | "divisional_officer"
  | "division"
  | "sailor";

export type ApiId = number | string;

export interface HierarchyNode {
  id: string;
  dbId: number | null;
  type: HierarchyNodeType;
  name: string;
  rank: string;
  designation: string;
  additionalDuty?: string;
  personalNumber: string;
  photoUrl: string | null;
  photoUploaded: boolean;
  divisionName: string;
  isRegulator: boolean;
  isDepartmentalOfficer?: boolean;
  selectedUserId: number | null;
  collapsed: boolean;
  children: HierarchyNode[];
}

export interface AvailableUser {
  id: number;
  name: string;
  rank: string;
  designation: string;
  personal_number: string;
  photo: string;
}

export const NODE_LABELS: Record<HierarchyNodeType, string> = {
  co: "CO",
  hod: "HOD",
  divisional_officer: "Divisional Officer",
  division: "Division",
  sailor: "Sailor",
};

export const NODE_COLORS: Record<HierarchyNodeType, string> = {
  co: "#3b93b6",
  hod: "#c37575",
  divisional_officer: "#af7442",
  division: "#7289d0",
  sailor: "#8f61ad",
};

export const CHILD_TYPE: Partial<Record<HierarchyNodeType, HierarchyNodeType>> = {
  co: "hod",
  hod: "divisional_officer",
  divisional_officer: "division",
};

export interface RawHierarchyNode {
  dbId: number;
  type: HierarchyNodeType;
  name: string;
  rank?: string;
  designation?: string;
  additionalDuty?: string;
  personalNumber?: string;
  photoUrl?: string | null;
  divisionName?: string;
  isRegulator?: boolean;
  isDepartmentOfficer?: boolean;
  isDepartmentalOfficer?: boolean;
  is_departmental_officer?: boolean;
  selectedUserId?: ApiId | null;
  selected_user_id?: ApiId | null;
  userId?: ApiId | null;
  user_id?: ApiId | null;
  user?: ApiId | { id?: ApiId | null } | null;
  children?: RawHierarchyNode[];
}

export interface HierarchyContextUsers {
  co_users_json?: string | null;
  hod_users_json?: string | null;
  divisional_officer_users_json?: string | null;
  division_users_json?: string | null;
  sailor_users_json?: string | null;
}

export interface HierarchyTreeResponse {
  status: string;
  hierarchy: RawHierarchyNode | null;
  context?: HierarchyContextUsers | null;
}

export interface RawAvailableUser {
  id: ApiId;
  name?: string;
  full_name?: string;
  username?: string;
  rank?: string;
  designation?: string;
  personal_number?: string;
  photo?: string;
}

export interface AvailableUsersResponse {
  status: string;
  users: RawAvailableUser[];
}

export interface HierarchyContextUser {
  id: number;
  name?: string;
  full_name?: string;
  username?: string;
  rank?: string;
  designation?: string;
  personal_number?: string;
  photo?: string;
}

export function parseHierarchyContextUsers(raw?: string | null): HierarchyContextUser[] {
  if (!raw || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function usersForHierarchyType(
  context: HierarchyContextUsers | null | undefined,
  type: HierarchyNodeType,
): HierarchyContextUser[] {
  const typeMap: Record<HierarchyNodeType, keyof HierarchyContextUsers> = {
    co: 'co_users_json',
    hod: 'hod_users_json',
    divisional_officer: 'divisional_officer_users_json',
    division: 'division_users_json',
    sailor: 'sailor_users_json',
  };

  const key = typeMap[type];
  if (!key) return [];

  return parseHierarchyContextUsers(context?.[key] ?? null);
}
