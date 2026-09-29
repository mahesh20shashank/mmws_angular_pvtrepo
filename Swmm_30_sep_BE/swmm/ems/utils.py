import re
from datetime import date, datetime

from dateutil.relativedelta import relativedelta

from .models import MeasurementFuelsondingFinal


def float_hours_to_pseudo(hours):
    total_minutes = round(float(hours) * 60)
    hour_value = total_minutes // 60
    minute_value = total_minutes % 60
    return float(f"{hour_value}.{minute_value:02d}")


def pseudo_hours_to_hhmm(pseudo_value):
    if not pseudo_value:
        return "0:00"
    try:
        pseudo_value = float(pseudo_value)
        hour_value = int(pseudo_value)
        minute_value = round((pseudo_value - hour_value) * 100)
        if minute_value >= 60:
            hour_value += minute_value // 60
            minute_value %= 60
        return f"{hour_value}:{minute_value:02d}"
    except (TypeError, ValueError):
        return "0:00"


def add_hours_to_pseudo(pseudo_value, hour_difference):
    pseudo_value = float(pseudo_value or 0.0)
    pseudo_hours = int(pseudo_value)
    pseudo_minutes = round((pseudo_value - pseudo_hours) * 100)
    total_minutes = (
        pseudo_hours * 60 + pseudo_minutes + round(float(hour_difference) * 60)
    )
    new_hours = total_minutes // 60
    new_minutes = total_minutes % 60
    return float(f"{new_hours}.{new_minutes:02d}")


def get_due_status(due_date):
    if not due_date:
        return "-", "white"

    if isinstance(due_date, datetime):
        due_date = due_date.date()
    elif isinstance(due_date, str):
        try:
            due_date = datetime.strptime(due_date[:10], "%Y-%m-%d").date()
        except ValueError:
            return "-", "white"

    today = date.today()
    if due_date < today:
        return "Routine Due", "#FF9999"

    difference_in_months = (due_date - today).days / 30
    if difference_in_months <= 3:
        color = "#f7e687"
    elif difference_in_months <= 6:
        color = "orange"
    else:
        color = "white"

    delta = relativedelta(due_date, today)
    parts = []
    if delta.years > 0:
        parts.append(f"{delta.years}Y")
    if delta.months > 0:
        parts.append(f"{delta.months}M")
    if delta.days > 0:
        parts.append(f"{delta.days}D")

    if not parts:
        return "Due Today", "#f7e687"
    return f"Due In {' '.join(parts)}", color


def generate_routine_dart_number(
    department, maintenance_type="Routine", last_entry=None
):
    if hasattr(department, "name"):
        dept_name = str(department.name or "").strip()
        dept_code = getattr(department, "code", "") or getattr(
            department, "dep_code", ""
        )
    else:
        dept_name = str(department or "").strip()
        dept_code = ""

    dept_upper = dept_name.upper()
    code_upper = str(dept_code).strip().upper() if dept_code else ""

    if code_upper in ("L", "E", "H", "X"):
        department_code = code_upper
    elif "ELECT" in dept_upper:
        department_code = "L"
    elif "ENG" in dept_upper:
        department_code = "E"
    elif "HULL" in dept_upper:
        department_code = "H"
    elif "EXEC" in dept_upper or "NBCD" in dept_upper:
        department_code = "X"
    else:
        department_code = dept_upper[0] if dept_upper else "X"

    prefix = f"M-{department_code}-"

    max_val = -1
    if last_entry is not None and str(last_entry).isdigit():
        max_val = max(max_val, int(last_entry))

    # Scan RoutineDescription and CompletedRoutine for highest numeric suffix with this prefix
    try:
        from dart.models import CompletedRoutine

        from ems.models import RoutineDescription

        for dn in (
            RoutineDescription.objects.filter(dart_number__startswith=prefix)
            .values_list("dart_number", flat=True)
            .iterator()
        ):
            if dn:
                m = re.search(r"\d+$", str(dn).strip())
                if m:
                    max_val = max(max_val, int(m.group()))

        for dn in (
            CompletedRoutine.objects.filter(new_dart_number__startswith=prefix)
            .values_list("new_dart_number", flat=True)
            .iterator()
        ):
            if dn:
                m = re.search(r"\d+$", str(dn).strip())
                if m:
                    max_val = max(max_val, int(m.group()))
    except Exception:
        pass

    if max_val >= 50000:
        next_number = max_val + 1
    else:
        next_number = 50001

    return f"{prefix}{next_number}", next_number


def calculate_volume_weight(mm_value, tank_type=None, tank_name=None):
    queryset = MeasurementFuelsondingFinal.objects.all()
    if tank_type:
        queryset = queryset.filter(tank_type=tank_type)
    if tank_name:
        queryset = queryset.filter(tank_name=tank_name)

    try:
        mm_value = float(mm_value)
    except (TypeError, ValueError):
        return 0, 0, False, None, None

    base_mm = int(mm_value // 100) * 100
    remainder = mm_value - base_mm
    base_row = queryset.filter(mm=base_mm).first()
    if not base_row:
        return 0, 0, False, None, None

    base_volume = float(base_row.volume or 0)
    base_tone = float(base_row.tone or 0)
    if remainder == 0:
        return base_volume, base_tone, False, None, None

    lower_bracket = int(remainder // 10) * 10
    upper_bracket = lower_bracket + 10
    if lower_bracket == 0:
        lower_volume = base_volume
        lower_tone = base_tone
    else:
        lower_value = getattr(base_row, f"field_{lower_bracket}mm", None)
        lower_volume = float(lower_value) if lower_value is not None else base_volume
        lower_tone = float(lower_value) if lower_value is not None else base_tone

    if upper_bracket == 100:
        next_row = queryset.filter(mm=base_mm + 100).first()
        upper_volume = (
            float(next_row.volume or lower_volume) if next_row else lower_volume
        )
        upper_tone = float(next_row.tone or lower_tone) if next_row else lower_tone
    else:
        upper_value = getattr(base_row, f"field_{upper_bracket}mm", None)
        upper_volume = float(upper_value) if upper_value is not None else lower_volume
        upper_tone = float(upper_value) if upper_value is not None else lower_tone

    factor = (remainder - lower_bracket) / 10
    interpolated_volume = lower_volume + factor * (upper_volume - lower_volume)
    interpolated_weight = lower_tone + factor * (upper_tone - lower_tone)
    return (
        round(interpolated_volume, 2),
        round(interpolated_weight, 2),
        True,
        base_mm,
        remainder,
    )


def get_request_user_department(request):
    """
    Returns (department_id, department_obj) for scoping.

    The privilege/forgery decision is delegated to users.rbac.can_see_all_departments
    / users.rbac.department_of instead of being re-derived here, so it can't drift out
    of sync with rbac's role list. Previously this reimplemented the check with ad-hoc
    substring matches on role_master/designation and, more seriously, honored ANY
    caller-supplied department_id/department/ALL param unconditionally -- a
    non-privileged user could see another department's equipment/routines/spares just
    by passing the query param. A forged param from a non-privileged caller now raises
    PermissionDenied, matching the protection obs already has via
    rbac.resolve_selected_department. Kept as a local wrapper rather than calling
    resolve_selected_department directly: ems callers pass either department_id or
    department, and may pass a department NAME rather than a pk, neither of which
    resolve_selected_department supports.
    """
    from master.models import Department
    from rest_framework.exceptions import PermissionDenied, ValidationError
    from accounts import rbac

    query_params = getattr(request, "query_params", getattr(request, "GET", {}))
    requested_param = query_params.get("department_id") or query_params.get(
        "department"
    )

    user = getattr(request, "user", None)
    privileged = rbac.can_see_all_departments(user)
    own_department = rbac.department_of(user)

    if requested_param:
        requested_str = str(requested_param).strip()
        if requested_str.upper() == "ALL":
            if not privileged:
                raise PermissionDenied("You may not view another department's data.")
            return None, None

        if requested_str.isdigit():
            requested_dept = Department.objects.filter(id=int(requested_str)).first()
        else:
            requested_dept = Department.objects.filter(
                name__iexact=requested_str
            ).first()
        if requested_dept is None:
            raise ValidationError({"department": "Unknown department."})

        if not privileged and (
            own_department is None or requested_dept.id != own_department.id
        ):
            raise PermissionDenied("You may not view another department's data.")

        return requested_dept.id, requested_dept

    if privileged:
        return None, None
    if own_department is None:
        return None, None
    return own_department.id, own_department
