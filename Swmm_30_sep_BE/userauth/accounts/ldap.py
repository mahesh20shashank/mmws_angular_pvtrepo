"""LDAP credential check hook.

Origin: ITTTM accounts/serializers.py LDAP branch -- reduced to a single
pluggable function with NO synchronous HRCDF / master-service calls on the
login path (anti-pattern #11). Auto-provisioning of a first-seen AD user is a
separate concern (a post-login task / an admin endpoint), not this function.

When ``settings.LDAP_AUTH`` is off, an ``ad_user`` profile falls back to the
local password hash (handled by the caller).
"""

import logging

from django.conf import settings

logger = logging.getLogger("accounts")


def authenticate_ldap(username: str, password: str) -> bool:
    if not settings.LDAP_AUTH:
        # No AD configured -- caller falls back to local check.
        return False
    if not settings.LDAP_SERVER_URI:
        logger.error("LDAP_AUTH on but LDAP_SERVER_URI unset; denying.")
        return False
    try:
        import ldap3

        bind_user = username
        if settings.LDAP_BIND_DOMAIN:
            bind_user = f"{username}@{settings.LDAP_BIND_DOMAIN}"
        server = ldap3.Server(settings.LDAP_SERVER_URI, get_info=ldap3.NONE)
        conn = ldap3.Connection(server, user=bind_user, password=password)
        ok = conn.bind()
        try:
            conn.unbind()
        except Exception:  # noqa: BLE001 - cleanup only
            pass
        return bool(ok)
    except Exception as exc:  # noqa: BLE001 - any AD failure -> denied, no 500
        logger.warning("LDAP bind failed for %s: %s", username, exc)
        return False
