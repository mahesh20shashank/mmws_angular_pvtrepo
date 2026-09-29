"""
Permission classes for the Ship Crew API.

Only one gate is needed here: some endpoints (approving / rejecting / editing
someone else's leave, writing personnel status) may only be used by an
"approver". Everything else on the crew endpoints just needs a signed-in user,
which the project already enforces by default.
"""

from accounts import rbac
from rest_framework.permissions import BasePermission


class IsCrewApprover(BasePermission):
    """Allow only crew approvers.

    Approver = HOD or Dy HOD (``rbac.is_hod_role``), or a ship-wide role -
    CO, Command, or an admin (``rbac.can_see_all_departments``).

    This only decides *whether* the caller may use the approver endpoints at
    all. HOD / Dy HOD are still limited to their own department by the view's
    own queryset / object lookup; CO / Command / admin act across all
    departments.
    """

    message = "An approver role (HOD, Dy HOD, CO or Command) is required."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return rbac.is_hod_role(user) or rbac.can_see_all_departments(user)
