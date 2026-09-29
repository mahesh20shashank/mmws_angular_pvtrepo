/** Logged-in user session from localStorage `user`. */
export function getStoredUser(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

function decodeAccessTokenPayload(
  accessToken?: string,
): Record<string, unknown> | null {
  if (!accessToken) return null;
  try {
    const segment = accessToken.split('.')[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Resolve process name from user object, role_center, or JWT access token. */
export function getUserProcessName(): string {
  const user = getStoredUser();

  const direct = String(user?.['process_name'] ?? '').trim();
  if (direct) return direct;

  const roleCenter = user?.['role_center'];
  if (Array.isArray(roleCenter) && roleCenter.length > 0) {
    const role = roleCenter[0] as Record<string, unknown>;
    const fromRole = String(role?.['process_name'] ?? '').trim();
    if (fromRole) return fromRole;

    const processDetails = role?.['process_details'] as
      | Record<string, unknown>
      | undefined;
    const fromDetails = String(processDetails?.['name'] ?? '').trim();
    if (fromDetails) return fromDetails;
  }

  const access =
    user?.['access'] ??
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('access_token')
      : null);
  const jwt = decodeAccessTokenPayload(
    typeof access === 'string' ? access : undefined,
  );
  return String(jwt?.['process_name'] ?? '').trim();
}

function resolveAccessToken(): string | undefined {
  const user = getStoredUser();
  const access =
    user?.['access'] ??
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('access_token')
      : null);
  return typeof access === 'string' && access.trim() ? access : undefined;
}

/** Logged-in user's ship id from localStorage `user` or JWT. */
export function getUserShipId(): string {
  const user = getStoredUser();
  const fromUser = coerceShipId(
    user?.['ship_id'] ??
      user?.['shipId'] ??
      (user?.['ship'] && typeof user['ship'] === 'object'
        ? (user['ship'] as Record<string, unknown>)['id']
        : user?.['ship']),
  );
  if (fromUser) {
    return fromUser;
  }

  const jwt = decodeAccessTokenPayload(resolveAccessToken());
  return coerceShipId(
    jwt?.['ship_id'] ??
      jwt?.['shipId'] ??
      (jwt?.['ship'] && typeof jwt['ship'] === 'object'
        ? (jwt['ship'] as Record<string, unknown>)['id']
        : jwt?.['ship']),
  );
}

function coerceShipId(raw: unknown): string {
  if (raw == null || raw === '') {
    return '';
  }
  if (typeof raw === 'object') {
    return '';
  }
  const value = String(raw).trim();
  return value && value !== 'null' && value !== 'undefined' ? value : '';
}

/** Display name for the logged-in user's ship from localStorage `user` or JWT. */
export function getUserShipName(): string {
  const user = getStoredUser();
  const direct = String(
    user?.['ship_name'] ?? user?.['unit_name'] ?? '',
  ).trim();
  if (direct) {
    return direct;
  }

  const jwt = decodeAccessTokenPayload(resolveAccessToken());
  return String(jwt?.['ship_name'] ?? jwt?.['unit_name'] ?? '').trim();
}

export function isUserSuperuser(): boolean {
  return getStoredUser()?.['is_superuser'] === true;
}

/** Role code from localStorage `user` or JWT access token. */
export function getUserRoleCode(): string {
  const user = getStoredUser();
  const direct = String(user?.['role_code'] ?? '').trim();
  if (direct) return direct;

  const jwt = decodeAccessTokenPayload(resolveAccessToken());
  return String(jwt?.['role_code'] ?? '').trim();
}

/** True when logged-in user has role_code SUPER_ADMIN. */
export function isUserSuperAdmin(): boolean {
  return getUserRoleCode() === 'SUPER_ADMIN';
}

/** True when the logged-in user's process is Ship (from localStorage `user`). */
export function isUserShipProcess(): boolean {
  const processName = getUserProcessName();
  const isShip = processName.toLowerCase() === 'ship';
  console.log('[isUserShipProcess]', {
    process_name: processName,
    isShip,
    user: getStoredUser(),
  });
  return isShip;
}

/** True when the logged-in user's process is Satellite Unit (from localStorage `user` / JWT). */
export function isUserSatelliteUnitProcess(): boolean {
  return getUserProcessName().toLowerCase() === 'satellite unit';
}

/** Ticket list API: admin users vs satellite/unit users. */
export function getTicketsListEndpoint(): string {
  return isUserSuperuser() ? 'api/tickets/admin/' : 'api/tickets/';
}

/** Logged-in user's satellite unit from localStorage `user`. */
export function getUserSatelliteUnitId(): number | null {
  try {
    const user = getStoredUser();
    const id = user?.['satellite_unit_id'];
    return id != null && id !== '' && Number.isFinite(Number(id)) ? Number(id) : null;
  } catch {
    return null;
  }
}

/** Paginate-table list URL with satellite-unit filter when the user has one assigned. */
export function buildMasterListUrl(
  basePath: string,
  satelliteUnitParam = 'satellite_unit',
): string {
  const path = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const satelliteUnitId = getUserSatelliteUnitId();
  if (satelliteUnitId != null) {
    return `${path}?${satelliteUnitParam}=${satelliteUnitId}`;
  }
  return path;
}

/** Display name for the logged-in user's satellite unit from localStorage `user`. */
export function getUserSatelliteUnitName(): string {
  const name = getStoredUser()?.['satellite_unit_name'];
  return name != null && String(name).trim() !== '' ? String(name).trim() : '';
}

export function getUserSatelliteUnitParams(): { satellite_unit: number } | undefined {
  const satelliteUnitId = getUserSatelliteUnitId();
  return satelliteUnitId != null ? { satellite_unit: satelliteUnitId } : undefined;
}
