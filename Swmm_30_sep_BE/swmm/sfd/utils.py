import logging

import environ
import requests
from django.utils.timezone import is_naive, make_aware

from master.models import ActiveShipConfig, Department, Ship
from master.utils import cmms_dept_code_candidates

logger = logging.getLogger(__name__)
env = environ.Env()


def get_user_info(user):
    """
    Safely extracts user attributes, handling different custom user models
    and avoiding AttributeError for missing attributes (e.g., user_profile).
    """
    role_name = ""
    dep_name = ""
    dept_id = None
    exe_sub_dep = ""

    if not user or user.is_anonymous:
        return role_name, dep_name, dept_id, exe_sub_dep

    # Try accessing via user_profile relation if it exists
    profile = getattr(user, "user_profile", None)

    # Determine department & dept_id
    dept_obj = None
    if profile and hasattr(profile, "department"):
        dept_obj = profile.department
    elif hasattr(user, "department"):
        dept_obj = user.department

    if dept_obj:
        dep_name = getattr(dept_obj, "name", "")
        dept_id = getattr(dept_obj, "id", None)
    # Determine role_name / designation
    if profile and hasattr(profile, "role_master"):
        role_name = getattr(profile.role_master, "role_name", "")
    elif hasattr(user, "designation"):
        role_name = getattr(user, "designation", "")

    # Fallback to designation if role_name is empty
    if not role_name and hasattr(user, "designation"):
        role_name = getattr(user, "designation", "")

    # Determine executive_sub_department
    if profile and hasattr(profile, "executive_sub_department"):
        exe_sub_dep = getattr(profile, "executive_sub_department", "")
    elif hasattr(user, "executive_sub_department"):
        exe_sub_dep = getattr(user, "executive_sub_department", "")
    elif hasattr(user, "unit"):  # check unit as fallback
        exe_sub_dep = getattr(user, "unit", "")

    # Default to first department in database if none is associated (for testing/dev safety)
    if not dept_id:
        first_dept = Department.objects.first()
        if first_dept:
            dep_name = first_dept.name
            dept_id = first_dept.id

    if role_name:
        role_name = str(role_name).strip()
    if dep_name:
        dep_name = str(dep_name).strip()

    return role_name, dep_name, dept_id, exe_sub_dep


def _split_server(value):
    value = (value or "").strip()
    if "," not in value:
        return value, ""
    host, port = value.rsplit(",", 1)
    return host.strip(), port.strip()


class _ParamstyleCursor:
    def __init__(self, cursor, placeholder="%s", strip_nolock=False):
        self.cursor = cursor
        self.placeholder = placeholder
        self.strip_nolock = strip_nolock

    def execute(self, query, params=None):
        if self.strip_nolock:
            query = query.replace(" WITH (NOLOCK)", "")
        if self.placeholder != "?":
            query = query.replace("?", self.placeholder)
        return self.cursor.execute(query, params or [])

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def close(self):
        return self.cursor.close()

    @property
    def description(self):
        return self.cursor.description


class _ConnectionAdapter:
    def __init__(self, connection, placeholder="%s", strip_nolock=False):
        self.connection = connection
        self.placeholder = placeholder
        self.strip_nolock = strip_nolock

    def cursor(self):
        return _ParamstyleCursor(
            self.connection.cursor(),
            placeholder=self.placeholder,
            strip_nolock=self.strip_nolock,
        )

    def close(self):
        return self.connection.close()


def _cmms_config():
    legacy_server = env.str("CMMS_MSSQL_SERVER", default="").strip()
    legacy_host, legacy_port = _split_server(legacy_server)
    host = env.str("CMMS_DB_HOST", default=legacy_host).strip()
    port = env.str("CMMS_DB_PORT", default=legacy_port or "1433").strip()
    return {
        "driver": env.str("CMMS_DB_DRIVER", default="").strip(),
        "host": host,
        "port": port,
        "database": env.str(
            "CMMS_DB_NAME", default=env.str("CMMS_MSSQL_DATABASE", default="")
        ),
        "user": env.str("CMMS_DB_USER", default=env.str("CMMS_MSSQL_UID", default="")),
        "password": env.str(
            "CMMS_DB_PASSWORD", default=env.str("CMMS_MSSQL_PWD", default="")
        ),
    }


def _connect_pyodbc(config):
    import pyodbc

    configured_driver = config["driver"]
    installed_drivers = {driver.lower(): driver for driver in pyodbc.drivers()}
    preferred_drivers = [
        configured_driver,
        "ODBC Driver 18 for SQL Server",
        "ODBC Driver 17 for SQL Server",
        "SQL Server",
    ]
    driver = next(
        (
            installed_drivers[candidate.lower()]
            for candidate in preferred_drivers
            if candidate and candidate.lower() in installed_drivers
        ),
        configured_driver or "ODBC Driver 17 for SQL Server",
    )
    server = f"{config['host']},{config['port']}" if config["port"] else config["host"]
    connection_string = (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={config['database']};"
        f"UID={config['user']};"
        f"PWD={config['password']};"
        "Encrypt=yes;"
        "TrustServerCertificate=yes;"
        "LoginTimeout=30;"
    )
    return pyodbc.connect(connection_string)


def _connect_pymssql(config):
    import pymssql

    return _ConnectionAdapter(
        pymssql.connect(
            server=config["host"],
            port=config["port"] or "1433",
            database=config["database"],
            user=config["user"],
            password=config["password"],
            login_timeout=30,
        ),
        placeholder="%s",
    )


def _connect_psycopg(config):
    try:
        import psycopg
    except ImportError:
        import psycopg2 as psycopg

    return _ConnectionAdapter(
        psycopg.connect(
            host=config["host"],
            port=config["port"] or "5432",
            dbname=config["database"],
            user=config["user"],
            password=config["password"],
            connect_timeout=30,
        ),
        placeholder="%s",
        strip_nolock=True,
    )


def get_mssql_connection():
    """
    Connect to CMMS Database using parameters configured in .env file.
    Automatically tries installed SQL Server ODBC drivers before failing over.
    """
    driver = env("CMMS_DB_DRIVER", default="SQL Server").strip()
    host = env("CMMS_DB_HOST", default="localhost").strip()
    port = env("CMMS_DB_PORT", default="1433").strip()
    db_name = env("CMMS_DB_NAME", default="CMMSOFFLINE").strip()
    user = env("CMMS_DB_USER", default="sa").strip()
    password = env("CMMS_DB_PASSWORD", default="admin@123").strip()

    # 1. Try pyodbc with configured driver + common SQL Server drivers
    drivers_to_try = [
        driver,
        "SQL Server",
        "ODBC Driver 17 for SQL Server",
        "ODBC Driver 18 for SQL Server",
        "ODBC Driver 13 for SQL Server",
        "SQL Server Native Client 11.0",
    ]
    seen = set()
    drivers_to_try = [d for d in drivers_to_try if d and not (d in seen or seen.add(d))]

    try:
        import pyodbc

        for drv in drivers_to_try:
            try:
                trust_cert = ";TrustServerCertificate=yes" if "18" in drv else ""
                conn_str = f"DRIVER={{{drv}}};SERVER={host},{port};DATABASE={db_name};UID={user};PWD={password}{trust_cert}"
                conn = pyodbc.connect(conn_str, timeout=10)
                logger.info(
                    f"Connected to MSSQL DB '{db_name}' at {host}:{port} using driver '{drv}'"
                )
                return conn
            except Exception as e:
                logger.warning(f"pyodbc connection with driver '{drv}' failed: {e}")
    except ImportError:
        logger.warning("pyodbc is not installed.")

    # 2. Try pymssql
    try:
        import pymssql

        return pymssql.connect(
            server=host, user=user, password=password, database=db_name, port=int(port)
        )
    except Exception as e:
        logger.warning(f"pymssql connection attempt failed: {e}")

    # 3. Only try psycopg2 if port is explicitly PostgreSQL (5432)
    if str(port) == "5432":
        try:
            import psycopg2

            return psycopg2.connect(
                host=host, port=port, dbname=db_name, user=user, password=password
            )
        except Exception as e:
            logger.warning(f"psycopg2 connection attempt failed: {e}")

    raise RuntimeError(
        f"Could not establish connection to CMMS Database '{db_name}' at {host}:{port} using configured credentials."
    )


def get_this_ship():
    """
    Look up the ship assigned to the application. Prefers a locally
    synced ship (one whose universal_id_m_ship is already populated,
    since that's what CMMS-integration endpoints key off); falls back
    to resolving it directly from CMMS by SWMM_SHIP_CODE if no such
    local record exists yet.

    Checks the Step 0 ActiveShipConfig selection first -- once an operator has
    picked a ship from the Nomenclature Synchronization screen, that selection
    takes precedence over SWMM_SHIP_CODE everywhere this helper is used.
    """
    selected = ActiveShipConfig.get_selected_ship()
    if selected:
        return selected

    ship_id = (
        env.str("DEFAULT_SHIP_ID", default="").strip()
        or env.str("SHIP_ID", default="").strip()
    )
    ship_code = env.str("SWMM_SHIP_CODE", default="").strip()

    if ship_id:
        ship_obj = Ship.objects.filter(universal_id_m_ship=ship_id).first()
        if ship_obj:
            return ship_obj

    if ship_code:
        ship_obj = (
            Ship.objects.filter(universal_id_m_ship=ship_code).first()
            or Ship.objects.filter(
                code__iexact=ship_code, universal_id_m_ship__isnull=False
            )
            .exclude(universal_id_m_ship="")
            .first()
            or Ship.objects.filter(
                name__iexact=ship_code, universal_id_m_ship__isnull=False
            )
            .exclude(universal_id_m_ship="")
            .first()
        )
        if ship_obj:
            return ship_obj

    # return ( #NOSONAR
    #     Ship.objects.exclude(universal_id_m_ship__isnull=True)
    #     .exclude(universal_id_m_ship="")
    #     .first()
    #     or Ship.objects.first()
    # )


def make_aware_if_needed(dt):
    if dt and is_naive(dt):
        return make_aware(dt)
    return dt


def fetch_api(url):
    try:
        response = requests.get(url, timeout=30)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        logger.error(f"Fetch error for {url}: {e}")
    return []


def build_excel_file(definition, queryset, filename):
    from io import BytesIO

    from django.core.files.base import ContentFile
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    title = getattr(definition, "title", "Report")
    ws.title = title[:31]

    headers = getattr(definition, "headers", ["ID", "Name", "Details"])
    ws.append(list(headers))

    for obj in queryset:
        if hasattr(obj, "to_report_row"):
            ws.append(list(obj.to_report_row()))
        else:
            ws.append(
                [
                    str(getattr(obj, str(h).lower(), getattr(obj, "pk", "")))
                    for h in headers
                ]
            )

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return ContentFile(buffer.getvalue(), name=filename)


def build_pdf_file(definition, queryset, filename):
    from io import BytesIO

    from django.core.files.base import ContentFile

    buffer = BytesIO()
    content = f"PDF Export for {getattr(definition, 'title', 'Report')}\nTotal Records: {queryset.count()}\n"
    buffer.write(content.encode("utf-8"))
    buffer.seek(0)
    return ContentFile(buffer.getvalue(), name=filename)


_CMMS_DEPARTMENT_CACHE = {}


def _lookup_cmms_department(column, value):
    """The `(DeptCode, DepartmentID, Universal_ID_M_Department)` of the M_Department row
    where `column` equals `value`, or None.

    Hits are cached for the life of the process (M_Department is a small static table);
    misses are deliberately not, so a department added to CMMS after this process started
    resolves on its next push instead of needing a restart.
    """
    if not value:
        return None
    key = (column, str(value))
    if key in _CMMS_DEPARTMENT_CACHE:
        return _CMMS_DEPARTMENT_CACHE[key]

    try:
        conn = get_mssql_connection()
    except Exception:
        logger.warning(
            "Could not resolve CMMS department (%s=%s) — CMMS unreachable.", column, value
        )
        return None
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT TOP 1 DeptCode, DepartmentID, Universal_ID_M_Department "
            f"FROM M_Department WHERE [{column}] = ?",
            str(value),
        )
        row = cursor.fetchone()
    except Exception:
        logger.exception("CMMS department lookup failed (%s=%s)", column, value)
        return None
    finally:
        conn.close()

    if row is None:
        return None
    resolved = (row[0], row[1], row[2])
    _CMMS_DEPARTMENT_CACHE[key] = resolved
    return resolved


def resolve_cmms_department(department):
    """The `(DeptCode, DepartmentID, Universal_ID_M_Department)` CMMS holds for a SWMM
    department, or `(None, None, None)`.

    Each candidate code from `cmms_dept_code_candidates` is checked against CMMS's own
    M_Department and the first that exists wins, so Master_department.code is what
    configures this and the name map only covers rows whose code is descriptive rather
    than a DeptCode.

    Prefer `resolve_cmms_department_for_dart` wherever an equipment is in hand: SWMM's
    Master_department holds a dozen rows CMMS has never heard of (Administration,
    Operations, Medical...), and a DART filed under one of those resolves to nothing here.
    """
    candidates = cmms_dept_code_candidates(department)
    for code in candidates:
        found = _lookup_cmms_department("DeptCode", code)
        if found:
            return found
    if candidates:
        logger.warning(
            "SWMM department %r matched no CMMS M_Department row (tried %s).",
            getattr(department, "name", None),
            ", ".join(candidates),
        )
    return None, None, None


def resolve_cmms_department_for_dart(dart):
    """The CMMS department a DART should push.

    Taken from the equipment first. CMMS files every equipment under a department
    (T_EquipmentShipDetail.Universal_ID_M_Department, carried onto ShipEquipment at sync
    time) and a DART is raised against an equipment, so that is the department CMMS
    itself expects to see on the DART — and the only one certain to exist over there.
    The DART's own `department_id` points at SWMM's Master_department, which carries a
    dozen departments CMMS has never heard of; a DART raised under one of those has no
    department to send and used to go out as "AD"/"A"/0.

    Falls back to the DART's own department for the handful of equipment carrying no
    department uid, and returns `(None, None, None)` only when neither resolves.
    """
    equipment_ship = getattr(dart, "equipment_ship", None)
    found = _lookup_cmms_department(
        "Universal_ID_M_Department",
        getattr(equipment_ship, "universal_id_m_department", None),
    )
    if found:
        return found
    return resolve_cmms_department(getattr(dart, "department_id", None))
