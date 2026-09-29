"""DRF authentication for SWMM as a resource server.

SWMM mints no tokens. Every request is authenticated by verifying an RS256
bearer issued by ``authz_service`` against the shared public key
(``settings.SIMPLE_JWT["VERIFYING_KEY"]``), then a local ``CustomUser`` is
shadow-synced from the claims (see ``accounts/authz_sync.py``).
"""

import logging

import jwt

# Developed with Understanding: imports for the guest guard (CP-L, D28).
from django.conf import settings
from django.urls import Resolver404, resolve
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from . import authz_sync

logger = logging.getLogger(__name__)

# Developed with Understanding: the D28 wording, answered with 403 to an other-ship login
# on every swmm endpoint outside settings.GUEST_ALLOWED_URL_NAMES.
GUEST_DENIED_MESSAGE = (
    "You are logged in from another unit. SWMM on this ship is available to you as a"
    " guest only."
)


# Developed with Understanding: the namespaced view name of the request (for example
# "users:me-unit-status"), read from request.resolver_match, or from resolve() on
# path_info when the match is not set yet. "" when the path resolves to nothing.
def request_url_name(request):
    """Return the resolved view name of request, or ""."""
    match = getattr(request, "resolver_match", None)
    if match is None:
        try:
            match = resolve(request.path_info)
        except Resolver404:
            return ""
    return match.view_name or ""


class FleetJWTAuthentication(JWTAuthentication):
    """Verify the RS256 signature + ``exp`` (SimpleJWT), reject any other
    algorithm, then build the request principal from the token claims."""

    # Developed with Understanding: the guest guard (CP-L, D28). After the token is
    # verified and projected, an other-ship login (CustomUser.is_other_unit, CP-K) may
    # reach only the view names listed in settings.GUEST_ALLOWED_URL_NAMES. Anything else
    # is PermissionDenied, a 403 through swmm.exceptions.custom_exception_handler - never
    # AuthenticationFailed or InvalidToken, because a 401 logs the user out on the SPA.
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user = result[0]
        if getattr(user, "is_other_unit", False):
            allowed = getattr(settings, "GUEST_ALLOWED_URL_NAMES", ())
            if request_url_name(request) not in allowed:
                raise PermissionDenied(GUEST_DENIED_MESSAGE)
        return result

    def get_validated_token(self, raw_token):
        # SimpleJWT already enforces alg == settings.SIMPLE_JWT["ALGORITHM"]
        # (RS256) + signature + exp. This is belt-and-braces against an
        # 'alg' confusion / downgrade attempt and gives a clear log line.
        try:
            header = jwt.get_unverified_header(raw_token)
        except jwt.PyJWTError as exc:
            raise InvalidToken("Malformed token header.") from exc
        if header.get("alg") != "RS256":
            logger.warning("rejected bearer with alg=%r (expected RS256)", header.get("alg"))
            raise InvalidToken("Unexpected token algorithm.")
        return super().get_validated_token(raw_token)

    def get_user(self, validated_token):
        try:
            return authz_sync.sync_principal(validated_token)
        except KeyError as exc:  # a required claim (user_id / username) is missing
            raise InvalidToken(f"Token is missing claim {exc}.") from exc
