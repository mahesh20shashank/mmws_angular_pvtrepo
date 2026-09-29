"""``check_access`` decorator.

Origin: ITTTM access/decorators.py::check_access -- which is 100% commented out
in Project B. Implemented for real here:

- resolves menu privileges from ``UserMenuMapping`` -> ``RoleMenuMapping`` for
  ``action in {view, add, edit, delete, export}``,
- 403 on a miss (correct HTTP status, SWMM-style error shape via the DRF
  exception handler),
- attaches ``request.scope_data`` (the JSON-safe effective org scope) for the
  view body to consume.

Apply to every ``authz/*`` and user-mutation endpoint that is a function-style
APIView method. DRF ViewSets should use the ``HasMenuPrivilege`` class instead.
"""

from functools import wraps

from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from . import rbac


def check_access(menu_code, action, process_id=None):
    def decorator(view_method):
        @wraps(view_method)
        def _wrapped(self, request, *args, **kwargs):
            user = getattr(request, "user", None)
            if not user or not user.is_authenticated:
                raise NotAuthenticated()

            resolved_process_id = process_id
            if resolved_process_id is None and isinstance(
                getattr(request, "auth", None), dict
            ):
                resolved_process_id = request.auth.get("process_id")
            unit_id = None
            if isinstance(getattr(request, "auth", None), dict):
                unit_id = request.auth.get("unit_id")

            allowed = rbac.resolve_menu_action_allowed(
                user,
                menu_code,
                action,
                process_id=resolved_process_id,
                unit_id=unit_id,
            )
            if not allowed:
                raise PermissionDenied(
                    f"Permission denied for {action} on {menu_code}."
                )

            request.scope_data = rbac.scope_as_claim(
                rbac.get_effective_scope(user)
            )
            return view_method(self, request, *args, **kwargs)

        return _wrapped

    return decorator
