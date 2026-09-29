"""Object-level access control for ShipEquipment.

Mirrors the CO / EXECUTIVE department's HOD & DY-HOD / own-department-only
scheme already implemented ad hoc in `sfd_list`/`SFDEquipmentViewSet.
list_equipments` (see sfd/views.py) - kept here as a single reusable helper
instead of duplicating the branching at every by-id endpoint, most of which
previously had no department check at all.
"""

from rest_framework.exceptions import PermissionDenied

from .utils import get_user_info

EXECUTIVE_HOD_SUB_DEPARTMENTS = [
    "HULL",
    "NBCD",
    "Gunnery",
    "ASW",
    "Communication",
    "ND",
    "Aviation",
    "Hygiene",
]


def can_access_equipment(user, equipment):
    role_name, dep_name, dept_id, exe_sub_dep = get_user_info(user)
    if role_name == "CO":
        return True
    sub_department_name = getattr(equipment.sub_department_f_key, "name", None)
    if dep_name == "EXECUTIVE" and role_name == "DY HOD":
        return sub_department_name == exe_sub_dep
    if dep_name == "EXECUTIVE" and role_name == "Head of Department":
        return sub_department_name in EXECUTIVE_HOD_SUB_DEPARTMENTS
    return bool(dept_id) and equipment.department_id == dept_id


def check_equipment_access(user, equipment):
    if not can_access_equipment(user, equipment):
        raise PermissionDenied("You may not access another department's equipment.")


def scope_equipment_queryset(user, queryset):
    """Queryset counterpart to `can_access_equipment` - same CO / EXECUTIVE
    HOD & DY-HOD / own-department rule, for list-style endpoints."""
    role_name, dep_name, dept_id, exe_sub_dep = get_user_info(user)
    if role_name == "CO":
        return queryset
    if dep_name == "EXECUTIVE" and role_name == "DY HOD":
        return queryset.filter(sub_department_f_key__name=exe_sub_dep)
    if dep_name == "EXECUTIVE" and role_name == "Head of Department":
        return queryset.filter(
            sub_department_f_key__name__in=EXECUTIVE_HOD_SUB_DEPARTMENTS
        )
    if dept_id:
        return queryset.filter(department_id=dept_id)
    return queryset.none()
