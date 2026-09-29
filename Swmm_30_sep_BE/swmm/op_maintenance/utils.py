import re

from op_maintenance.models import InitiateDart, InitiateRADL

READINESS_GOOD_THRESHOLD = 80
READINESS_AVERAGE_THRESHOLD = 50
HEALTH_WARNING_THRESHOLD = 80
HEALTH_CRITICAL_THRESHOLD = 50


def calculate_percentage_change(current_value, previous_value):
    if previous_value:
        return int(((current_value - previous_value) / previous_value) * 100)
    if current_value:
        return 100
    return 0


def get_readiness_status(value):
    if value >= READINESS_GOOD_THRESHOLD:
        return "Good"
    if value >= READINESS_AVERAGE_THRESHOLD:
        return "Average"
    return "Critical"


def get_health_status(score):
    if score < HEALTH_CRITICAL_THRESHOLD:
        return "critical"
    if score < HEALTH_WARNING_THRESHOLD:
        return "warning"
    return "healthy"


def generate_dart_number(department_name, type_="Defect", *args, **kwargs):
    dept_upper = (department_name or "").strip().upper()
    if dept_upper == "ELECTRICAL":
        department_code = "L"
    elif dept_upper in ("ENGINEERING", "MARINE ENGINEERING"):
        department_code = "E"
    elif dept_upper == "HULL":
        department_code = "H"
    elif dept_upper == "EXCLUSIVE":
        department_code = "X"
    else:
        department_code = "X"

    prefix = f"D-{department_code}-" if type_ == "Defect" else f"M-{department_code}-"

    # Filter all records in the entire database starting with the department's prefix
    # to prevent duplicates and handle legacy data inconsistencies mathematically.
    dart_list = InitiateDart.objects.filter(dart_number__startswith=prefix)

    max_val = -1
    for entry in dart_list:
        dn = entry.dart_number
        if dn:
            match = re.search(r"\d+$", dn)
            if match:
                val = int(match.group())
                max_val = max(max_val, val)

    if max_val != -1:
        next_number = max_val + 1
    else:
        next_number = 50001

    return f"{prefix}{next_number}"


def generate_dl_number(dl_type="DL-II", taken=None):
    """Next sequential DL number for the given dl_type, mirroring
    generate_dart_number's prefix+max-suffix-scan approach. When `taken`
    (a set) is supplied, also skips numbers already reserved earlier in the
    same batch and re-checks the DB, so concurrent/batch creation (see
    ExportPendingDefectsDL2APIView) can't collide."""
    prefix = f"{dl_type}-"

    dl_list = InitiateRADL.objects.filter(dl_no__startswith=prefix)
    max_val = -1
    for entry in dl_list:
        dn = entry.dl_no
        if dn:
            match = re.search(r"\d+$", dn)
            if match:
                max_val = max(max_val, int(match.group()))

    number = max_val + 1 if max_val != -1 else 1
    candidate = f"{prefix}{number}"
    if taken is None:
        return candidate

    while candidate in taken or InitiateRADL.objects.filter(dl_no=candidate).exists():
        number += 1
        candidate = f"{prefix}{number}"
    taken.add(candidate)
    return candidate
