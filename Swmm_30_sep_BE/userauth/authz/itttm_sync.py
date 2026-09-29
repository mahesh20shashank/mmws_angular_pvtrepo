"""Pushes seed_rbac's ship/unit accounts into itttm_backend_microservice's
user_service (SWMMUserSignupAPIView, POST with X-Service-Key auth).

Ported from the pre-split monolith's users/itttm_sync.py. This is the ONLY
path that provisions itttm users -- there is no self-registration or
login-triggered sync. seed_rbac is the source of truth here (it superseded
the monolith's seed_all.py for user creation), so this module is called
synchronously, inline, from seed_rbac's _seed_swmm_users() for the small set
of ship/unit accounts in ADMIN_PASSWORD_USERNAMES. No Celery/worker is
required to run seed_rbac.

The endpoint's operation is decided by payload shape: no "id" -> create,
"id" present -> update. CustomUserProfile.itttm_user_id stores the id
returned on first create so re-running seed_rbac updates instead of hitting
"Username already exists".
"""

import logging
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Transient failures (network/timeout/5xx) are retried a few times with a
# short fixed backoff; a 4xx from the API (bad payload, duplicate, missing
# required field) will never succeed on retry, so those are logged once and
# not retried.
_RETRY_DELAYS_SECONDS = (2, 5, 10)


def sync_user_to_itttm(*, profile, username, password, ship_name, role_name):
    """Best-effort push of one seeded user to itttm. Never raises -- a
    failure here must not roll back seed_rbac's local @transaction.atomic
    seeding of CustomUser/CustomUserProfile."""
    payload = {
        "loginname": username,
        "email": f"{username.lower()}@swmm.local",
        "first_name": profile.firstname,
        "last_name": profile.lastname,
        "unit_name": ship_name or "",
        "rankName": profile.rank.name if profile.rank else "",
        "role_name": role_name or "",
        "adUser": 2,
        "status": 1,
    }
    if profile.department_name:
        payload["sub_groups"] = [profile.department_name]

    if profile.itttm_user_id:
        payload["id"] = profile.itttm_user_id
    else:
        payload["password"] = password

    last_error = None
    for attempt, delay in enumerate((0, *_RETRY_DELAYS_SECONDS)):
        if delay:
            time.sleep(delay)
        try:
            response = requests.post(
                settings.ITTTM_USER_SERVICE_URL,
                json=payload,
                headers={"X-Service-Key": settings.ITTTM_USER_SERVICE_KEY},
                # This endpoint makes its own downstream calls (GET /master/units/,
                # POST /master/sub-group-user-mappings/, the latter retried once on
                # failure) before responding, so a short client-side timeout risks
                # firing spuriously while the request is still healthy server-side.
                timeout=25,
            )
        except requests.exceptions.RequestException as exc:
            last_error = exc
            logger.warning(
                "ITTTM sync network error for %s (attempt %d): %s",
                username, attempt + 1, exc,
            )
            continue

        if response.status_code >= 500:
            last_error = requests.exceptions.HTTPError(
                f"{response.status_code}: {response.text}"
            )
            logger.warning(
                "ITTTM sync %d for %s (attempt %d), retrying",
                response.status_code, username, attempt + 1,
            )
            continue

        if response.status_code >= 400:
            logger.warning(
                "ITTTM sync rejected for %s: %d %s",
                username, response.status_code, response.text,
            )
            return

        body = response.json()
        new_id = (body.get("data") or {}).get("id")
        if new_id and not profile.itttm_user_id:
            profile.itttm_user_id = new_id
            profile.save(update_fields=["itttm_user_id"])
        return

    logger.warning(
        "ITTTM sync failed for %s after %d attempts: %s",
        username, len(_RETRY_DELAYS_SECONDS) + 1, last_error,
    )
