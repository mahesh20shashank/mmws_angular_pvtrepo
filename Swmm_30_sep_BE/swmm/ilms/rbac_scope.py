"""Thin department-scoping helpers for ilms's custom actions.

`users.rbac`'s `DepartmentScopedFilterBackend`/`DepartmentScopedObjectPermission`
cover DRF's standard `list`/`retrieve`/`update`/`destroy` flow. ilms's custom
actions (inbox/outbox/pending-list/dashboards) build ad-hoc querysets or call
`self.get_queryset()` directly instead, which never goes through
`filter_backends` — these plain-function helpers give those call sites the
same privileged-sees-all / own-department-only / no-department-sees-nothing
contract as `rbac.resolve_selected_department`, without the query-param
override (none of these actions accept a `department_id` param today).
"""

from accounts import rbac


def scoped_custom_user_department_id(request):
    """Returns the department id to scope `custom_user__department_id` (or an
    equivalent path) by, or `None` if the caller is privileged and should see
    everything. Callers must check `rbac.can_see_all_departments(request.user)`
    themselves to distinguish "privileged, no filter" from "no department,
    see nothing" — both return `None` here."""
    if rbac.can_see_all_departments(request.user):
        return None
    department = rbac.department_of(request.user)
    return department.pk if department else None


def filter_by_custom_user_department(
    queryset, request, field="custom_user__department_id"
):
    if rbac.can_see_all_departments(request.user):
        return queryset
    department_id = scoped_custom_user_department_id(request)
    if department_id is None:
        return queryset.none()
    return queryset.filter(**{field: department_id})
