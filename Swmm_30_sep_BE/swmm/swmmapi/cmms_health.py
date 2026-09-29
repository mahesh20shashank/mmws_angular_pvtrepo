"""Is the CMMS database actually reachable right now?

The app already had a connectivity signal — the browser's `navigator.onLine`, read by the
frontend's NetworkStatusService — but that answers a different question. It says the laptop
has a network; it says nothing about whether the CMMS MSSQL server at the other end of that
network is up, whether the credentials still work, or whether the ship is on a link that
reaches everything except CMMS. On a ship those are routinely not the same thing, which is
why "online" could read true while every sync silently failed.

So this asks CMMS itself, with the smallest question that still proves the whole path works:
connect through the same `get_mssql_connection()` every sync uses, and run `SELECT 1`. A
result means the network, the server, the login and the database are all good.

Caching
-------
Answers are held for a few seconds in a process-local dict — deliberately not Django's Redis
cache. The frontend polls this on a timer and several places will come to gate their sync UI
on it, so an uncached check would open an MSSQL connection per request; but a *shared* cache
that is itself down (Redis unreachable, which `IGNORE_EXCEPTIONS = True` turns into a silent
miss) would push every one of those requests through to a real connection attempt with a
login timeout attached. A plain dict cannot fail that way. The cost is one check per worker
process per TTL instead of one per cluster, which at this TTL is a handful of connections a
minute — the same trade `swmm.async_jobs.get_celery_worker_health` already makes.
"""

import logging
import time

from django.conf import settings
from django.utils import timezone

from sfd.utils import get_mssql_connection

logger = logging.getLogger(__name__)

DEFAULT_CACHE_TTL = 30.0

_HEALTH_CACHE = {
    # monotonic, for age; never wall-clock, so a clock change cannot pin a stale answer.
    "checked_at": 0.0,
    "reachable": False,
    "error": "CMMS reachability has not been checked yet.",
    # Wall-clock, for display only.
    "checked_at_wall": None,
}


def _remember(reachable, error):
    _HEALTH_CACHE["checked_at"] = time.monotonic()
    _HEALTH_CACHE["checked_at_wall"] = timezone.now()
    _HEALTH_CACHE["reachable"] = reachable
    _HEALTH_CACHE["error"] = error
    return reachable, error


def cmms_reachable(force_refresh=False):
    """(reachable, error_message). `error_message` is None when reachable.

    Never raises: an unreachable CMMS is an ordinary answer here, not an exception. Callers
    that must act on the reason get it in the second element.
    """
    ttl = float(getattr(settings, "CMMS_HEALTHCHECK_CACHE_TTL", DEFAULT_CACHE_TTL))
    if not force_refresh and _HEALTH_CACHE["checked_at_wall"] is not None:
        if (time.monotonic() - _HEALTH_CACHE["checked_at"]) < ttl:
            return _HEALTH_CACHE["reachable"], _HEALTH_CACHE["error"]

    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        return _remember(True, None)
    except Exception as exc:
        # Debug, not error: on a ship CMMS being away is the expected steady state for long
        # stretches, and logging it at error level once per TTL would bury real failures.
        logger.debug("CMMS reachability check failed: %s", exc)
        return _remember(False, str(exc))
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def cmms_health(force_refresh=False):
    """The reachability answer shaped for the API and the frontend's status poll."""
    reachable, error = cmms_reachable(force_refresh=force_refresh)
    checked_at = _HEALTH_CACHE["checked_at_wall"]
    return {
        "reachable": reachable,
        "checked_at": checked_at.isoformat() if checked_at else None,
        "error": error,
    }


def reset_health_cache():
    """Drop the cached answer. For tests, and for callers that have just changed the CMMS
    connection settings and must not be handed the previous target's verdict."""
    _HEALTH_CACHE.update(
        {
            "checked_at": 0.0,
            "reachable": False,
            "error": "CMMS reachability has not been checked yet.",
            "checked_at_wall": None,
        }
    )
