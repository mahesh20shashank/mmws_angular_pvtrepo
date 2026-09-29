"""JWT authentication with live re-validation on every request.

Build prompt anti-pattern #6 / criterion 8: a refresh (and every request) must
not trust old-token claims. Deactivating a user, flipping their profile
``approval_status`` away from APPROVED, ending their ``UserSession``, or setting
their selected ``UserProcessRoleMapping.is_active = False`` takes effect on the
next request -- within the access-token lifetime, not 7 days later.

Extends SimpleJWT's ``JWTAuthentication``; keeps ``request.auth`` as the token
payload dict so views/audit can read claims.
"""

from django.utils import timezone
from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class LiveJWTScheme(SimpleJWTScheme):
    target_class = "authz.authentication.LiveJWTAuthentication"
    name = "jwtAuth"


from accounts.models import UserSession

from authz.models import UserProcessRoleMapping


class LiveJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)  # already checks is_active

        profile = getattr(user, "user_profile", None)
        if profile is not None and profile.approval_status != "APPROVED":
            raise AuthenticationFailed(
                "Account is not approved.", code="account_not_approved"
            )
        if profile is not None and not profile.user_active:
            raise AuthenticationFailed("Account is inactive.", code="user_inactive")

        session_id = validated_token.get("session_id")
        if session_id:
            live = UserSession.objects.filter(
                session_id=session_id, user=user, is_active=True
            ).exists()
            if not live:
                raise AuthenticationFailed(
                    "Session has ended. Please log in again.",
                    code="session_ended",
                )

        # The role selected at login must still be an active mapping.
        role_id = validated_token.get("user_role_id")
        process_id = validated_token.get("process_id")
        if role_id and process_id:
            still_active = UserProcessRoleMapping.objects.filter(
                user=user,
                is_active=True,
                process_role__user_role_id=role_id,
                process_role__process_id=process_id,
            ).exists()
            if not still_active:
                raise AuthenticationFailed(
                    "Your selected role is no longer active. Please log in again.",
                    code="role_revoked",
                )

        user._token_issued_at = validated_token.get("iat")
        user._last_seen = timezone.now()
        return user
