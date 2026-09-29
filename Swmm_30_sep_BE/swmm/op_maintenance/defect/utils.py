import re

from .models import DefectInitiateDart


def generate_defect_dart_number(department_name, type_="Defect"):
    """Same prefix+max-suffix-scan approach as op_maintenance.utils.generate_dart_number,
    but scanning DefectInitiateDart (defect_initiate_dart) instead of the legacy
    InitiateDart (dart_initiate_dart) -- the two tables are separate now, so numbering
    off the old table meant every add-defect call kept seeing the same "next" number."""
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

    dart_list = DefectInitiateDart.objects.filter(dart_number__startswith=prefix)

    max_val = -1
    for entry in dart_list:
        dn = entry.dart_number
        if dn:
            match = re.search(r"\d+$", dn)
            if match:
                max_val = max(max_val, int(match.group()))

    next_number = max_val + 1 if max_val != -1 else 50001
    return f"{prefix}{next_number}"
