"""Ensure this service's Postgres schema exists before any DDL runs.

The ``default`` connection is opened with ``search_path="<DB_SCHEMA>"`` (see
settings). Postgres does not error when a schema on the ``search_path`` is
missing, so the very first connection -- the one ``migrate`` (and the test-DB
build) uses -- would otherwise try to ``CREATE TABLE`` in a schema that does not
exist and fail.

Hooking ``connection_created`` guarantees the ``CREATE SCHEMA IF NOT EXISTS``
runs ahead of contenttypes / auth / sessions migrations too, none of which
depend on this project's apps. It is idempotent and, once done for a process,
skipped on later reconnects.

Set ``DB_CREATE_SCHEMA=False`` when the schema is provisioned out of band and
the DB role has no CREATE privilege on the database.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.db.backends.signals import connection_created
from django.dispatch import receiver

logger = logging.getLogger(__name__)

# Guard so the DDL is attempted once per process, not on every reconnect.
_ensured_aliases: set[str] = set()


@receiver(connection_created)
def ensure_schema(sender, connection, **kwargs):
    if connection.vendor != "postgresql":
        return
    if not getattr(settings, "DB_CREATE_SCHEMA", False):
        return

    schema = getattr(settings, "DB_SCHEMA", "public")
    if not schema or schema == "public":
        return
    if connection.alias in _ensured_aliases:
        return

    quoted = connection.ops.quote_name(schema)
    with connection.cursor() as cursor:
        cursor.execute(f"CREATE SCHEMA IF NOT EXISTS {quoted}")
    _ensured_aliases.add(connection.alias)
    logger.info("Ensured Postgres schema %s on connection %r", quoted, connection.alias)
