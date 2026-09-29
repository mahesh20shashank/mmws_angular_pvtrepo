import os
from datetime import datetime
from datetime import timezone as dt_timezone

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone

from .models import ActiveShipConfig, RefitMaintenancePeriod, Ship


def parse_iso_date(value):
    if not value or value in {"", "null", "NULL"}:
        return None

    # Accept plain dates, space-separated datetimes, and ISO 'T' datetimes
    formats = ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S")
    for fmt in formats:
        try:
            parsed = datetime.strptime(value, fmt).replace(tzinfo=dt_timezone.utc)
            return parsed.date()
        except (ValueError, TypeError):
            continue

    return None


def save_file_to_temp(file_obj):
    temp_dir = os.path.join(settings.MEDIA_ROOT, "temp")
    os.makedirs(temp_dir, exist_ok=True)

    timestamp = timezone.now().date().strftime("%Y%m%d%H%M%S%f")
    filename = f"{timestamp}_{file_obj.name}"
    save_path = os.path.join(temp_dir, filename)

    with default_storage.open(save_path, "wb+") as destination:
        for chunk in file_obj.chunks():
            destination.write(chunk)

    return save_path


def get_ship_status():
    today = timezone.now().date()
    refits = RefitMaintenancePeriod.objects.filter(
        actual_start_date__isnull=False, actual_end_date__isnull=False
    )

    result = []
    refit = refits.filter(
        actual_start_date__lte=today, actual_end_date__gte=today
    ).first()

    if refit:
        result.append(
            {
                "status": "Refit",
                "refit_name": refit.name,
                "start_date": refit.actual_start_date,
                "end_date": refit.actual_end_date,
            }
        )
    else:
        result.append(
            {
                "status": "Operational",
                "refit_name": None,
                "start_date": None,
                "end_date": None,
            }
        )

    return result


def get_this_ship():
    selected = ActiveShipConfig.get_selected_ship()
    if selected:
        return selected

    ship_id_val = (
        os.getenv("DEFAULT_SHIP_ID", "").strip() or os.getenv("SHIP_ID", "").strip()
    )
    if ship_id_val:
        ship_obj = Ship.objects.filter(universal_id_m_ship=ship_id_val).first()
        if ship_obj:
            return ship_obj
        try:
            ship_obj = Ship.objects.filter(pk=int(ship_id_val)).first()
            if ship_obj:
                return ship_obj
        except ValueError:
            pass

    ship_code = os.getenv("SWMM_SHIP_CODE", "").strip()
    if ship_code:
        ship_obj = (
            Ship.objects.filter(code__iexact=ship_code)
            .exclude(universal_id_m_ship__isnull=True)
            .exclude(universal_id_m_ship="")
            .first()
            or Ship.objects.filter(universal_id_m_ship=ship_code).first()
            or Ship.objects.filter(name__icontains=ship_code)
            .exclude(universal_id_m_ship__isnull=True)
            .exclude(universal_id_m_ship="")
            .first()
        )
        if ship_obj:
            return ship_obj

        try:
            from sfd.utils import sync_ship_from_cmms

            ship_obj = sync_ship_from_cmms(ship_code)
            if ship_obj:
                return ship_obj
        except Exception:
            pass

    return (
        Ship.objects.exclude(universal_id_m_ship__isnull=True)
        .exclude(universal_id_m_ship="")
        .first()
        or Ship.objects.first()
    )


def get_dart_split(dart_number):
    if not dart_number:
        return None, None, None
    parts = str(dart_number).split("/")
    if len(parts) >= 3:
        return parts[0], parts[1], parts[2]
    elif len(parts) == 2:
        return parts[0], parts[1], None
    return str(dart_number), None, None


# Fallback CMMS DeptCode by department NAME, for rows whose own `code` was never set to
# one. Master_department is the place this is configured — a correctly maintained row
# already carries the CMMS DeptCode in `code` ("X" on EXECUTIVE, "H" on HULL, "M" on
# MEDICAL) and never reaches this map. But SWMM seeds several departments with a
# descriptive code instead ("ENGINEERING" on the ENGINEERING twin, "NBCD" on NBCD,
# "EXECUTIVE" on the Executive twin), and those are exactly the rows whose code used to
# reach CMMS sliced to two characters. Keyed on name because that is the only field a
# twin shares with its properly-coded sibling.
#
# EXECUTIVE and LOGISTICS both resolve to X (CMMS's NBCD): that is the convention
# seed_all.py already encodes and what Master_department itself holds on this deployment.
CMMS_DEPT_CODE_BY_NAME = {
    "HULL": "H",
    "ELECTRICAL": "L",
    "ENGINEERING": "E",
    "NBCD": "X",
    "EXECUTIVE": "X",
    "LOGISTICS": "X",
    "MEDICAL": "M",
}


def cmms_dept_code_candidates(department):
    """CMMS DeptCodes to try for a SWMM Department, best first.

    The department's own `code` leads, so Master_department stays the place this is
    configured and a code corrected there takes effect without a code change. The
    name-mapped code follows as the fallback. The caller checks each against CMMS's
    M_Department and takes the first that exists, so a descriptive code like
    "ENGINEERING" simply misses and the mapped "E" wins.
    """
    candidates = []
    code = (getattr(department, "code", None) or "").strip().upper()
    if code:
        candidates.append(code)
    name = (getattr(department, "name", None) or "").strip().upper()
    mapped = CMMS_DEPT_CODE_BY_NAME.get(name)
    if mapped and mapped not in candidates:
        candidates.append(mapped)
    return candidates
