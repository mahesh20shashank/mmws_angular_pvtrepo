"""Pluggable master-service client.

Build prompt anti-pattern #10: no cross-service ORM coupling via `sys.path`
insertion or raw SQL across Postgres schemas. Hierarchy expansion (a COMMAND
level -> its ship / satellite / trial ids) goes through this seam. The default
implementation is a no-op: it expands nothing, so `get_effective_scope` only
honors ids explicitly recorded on `UserAccessLevel` rows. A real deployment
swaps in an HTTP-backed client (talking to master-service's API, with Redis
caching) via ``settings.MASTER_CLIENT_CLASS``.
"""

from __future__ import annotations

from django.conf import settings
from django.utils.module_loading import import_string

_CACHED = None


class NullMasterClient:
    """Expands no hierarchy -- only explicit UserAccessLevel ids count."""

    def all_command_ids(self) -> set[int]:
        return set()

    def satellite_units_of_command(self, command_id: int) -> set[int]:
        return set()

    def trial_units_of_command(self, command_id: int) -> set[int]:
        return set()

    def ships_of_command(self, command_id: int) -> set[int]:
        return set()

    def ships_of_satellite_unit(self, satellite_unit_id: int) -> set[int]:
        return set()

    def ships_of_trial_unit(self, trial_unit_id: int) -> set[int]:
        return set()


def get_master_client():
    global _CACHED
    if _CACHED is None:
        path = getattr(
            settings,
            "MASTER_CLIENT_CLASS",
            "authz.master_client.NullMasterClient",
        )
        _CACHED = import_string(path)()
    return _CACHED


def reset_master_client_cache():
    """Test hook."""
    global _CACHED
    _CACHED = None
