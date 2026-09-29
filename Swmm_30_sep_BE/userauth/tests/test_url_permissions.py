"""Acceptance criterion 11.

Introspect the whole URLconf and fail on any API view left at bare
``IsAuthenticated`` (the DRF default floor) outside an explicit, documented
allowlist. Guards against a future endpoint being added with no real
authorization.
"""

from django.test import SimpleTestCase
from django.urls import get_resolver
from rest_framework.permissions import AllowAny, IsAuthenticated

# Views that are *intentionally* only IsAuthenticated because they enforce
# authorization on the object / row inside the handler (the SWMM pattern:
# per-request scoping via authz.rbac, not a blanket class). Each entry is a
# view class name with a one-line justification.
BARE_IS_AUTHENTICATED_ALLOWLIST = {
    "MeView": "returns/edits only the caller's own identity + capabilities",
    "MySessionsView": "returns only the caller's own sessions",
    "LogoutView": "acts only on the caller's own session/token",
    "ChangePasswordView": "acts only on the caller's own password",
    "PermissionTreeView": "returns only the caller's own effective menu tree",
    "MeScopeView": "returns only the caller's own effective scope",
    "RoleRequestView": "list is scoped via rbac.pending_requests_for; create sets requester=caller",
    "RoleRequestActView": "re-checks can_act_on_request + can_grant inside the handler",
    "RightsTransferView": "rows filtered to delegator=caller / delegatee=caller",
    "RightsTransferLogView": "checks caller is delegator or delegatee of the transfer",
}

# Non-DRF / framework endpoints to skip (admin redirects, the DRF router root,
# static file serving -- none of these are part of the service's API surface).
SKIP_MODULES = (
    "django.contrib.admin",
    "django.contrib.staticfiles",
    "django.views.generic",
    "rest_framework.routers",
)


def _iter_view_classes(resolver, prefix=""):
    for pattern in resolver.url_patterns:
        if hasattr(pattern, "url_patterns"):
            yield from _iter_view_classes(pattern, prefix + str(pattern.pattern))
            continue
        callback = pattern.callback
        cls = getattr(callback, "cls", None) or getattr(
            callback, "view_class", None
        )
        if cls is None:
            continue
        module = cls.__module__
        if any(module.startswith(m) for m in SKIP_MODULES):
            continue
        yield prefix + str(pattern.pattern), cls


class Criterion11EveryEndpointHasRealAuthz(SimpleTestCase):
    def test_no_bare_is_authenticated_outside_allowlist(self):
        offenders = []
        seen = 0
        for route, cls in _iter_view_classes(get_resolver()):
            perms = list(getattr(cls, "permission_classes", []) or [])
            seen += 1

            if AllowAny in perms:
                continue  # explicitly public
            if perms and perms != [IsAuthenticated]:
                continue  # has an explicit, stronger class (possibly OR-composed)
            if cls.__name__ in BARE_IS_AUTHENTICATED_ALLOWLIST:
                continue
            offenders.append(f"{route} -> {cls.__name__} perms={perms}")

        self.assertGreater(seen, 0, "URLconf introspection found no views")
        self.assertEqual(
            offenders,
            [],
            "Endpoints left at bare IsAuthenticated with no allowlist entry:\n"
            + "\n".join(offenders),
        )
