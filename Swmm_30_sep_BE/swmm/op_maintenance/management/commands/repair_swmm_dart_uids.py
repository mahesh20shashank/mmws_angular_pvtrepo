"""Recover SWMM-raised DARTs that are stuck outside the CMMS push.

The Defect/DART grid's "Sync with CMMS" only pushes DARTs it can tell SWMM raised, and
it tells by `universal_id_t_dart` being null, blank or "SWMM"-prefixed — see
`CMMSDefectSyncAndPushAPI._dart_queryset` in swmmapi/views.py. That filter exists so the
rows the CMMS pull just imported don't bounce straight back up and overwrite CMMS's own
richer columns with SWMM's mapped subset.

Until this was fixed, InitiateDartAPIView stamped a bare `uuid4()` on every DART raised
through "Add Defect / DART". That matched none of the three shapes, so such a DART could
never be pushed by the Sync button: the endpoint reported "nothing to push" and pushed
nothing, every time. The raise path now stamps SWMM/<ship>/<year>/<month>/<id>, but rows
created before that keep their GUID and stay invisible.

This command re-stamps those rows onto the same SWMM/... convention.

It does NOT trust the id's shape alone to decide a row is SWMM-raised. Each candidate is
checked against CMMS: if T_Dart holds no row under that id, CMMS has never seen it, so it
cannot be a pulled row and is safe to re-stamp. (In the CMMS this integration talks to,
Universal_ID_T_Dart is numeric — 0 of 15,243 rows are GUID-shaped — so in practice every
GUID here came from SWMM. The lookup makes that a verified fact per row rather than an
assumption that could be wrong on another deployment's schema.)

Dry by default; pass --apply to write.

    python manage.py repair_swmm_dart_uids
    python manage.py repair_swmm_dart_uids --apply
"""

import re

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from op_maintenance.models import InitiateDart
from master.utils import get_this_ship

# The exact shape uuid4() produces, so a CMMS id that merely contains dashes is not caught.
GUID = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


class Command(BaseCommand):
    help = (
        "Re-stamp never-synced SWMM-raised DARTs whose universal id CMMS doesn't know."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the changes. Without this the command only reports.",
        )
        parser.add_argument(
            "--include-unchecked",
            action="store_true",
            help=(
                "Re-stamp candidates even when CMMS is unreachable, i.e. without "
                "confirming CMMS has no row under the id. Off by default."
            ),
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        include_unchecked = options["include_unchecked"]

        candidates = [
            dart
            for dart in InitiateDart.objects.filter(cmms_sync_status=False)
            .exclude(dart_number__isnull=True)
            .exclude(dart_number="")
            .exclude(universal_id_t_dart__isnull=True)
            .exclude(universal_id_t_dart="")
            .order_by("id")
            if GUID.match(str(dart.universal_id_t_dart))
        ]

        if not candidates:
            self.stdout.write(
                "No stranded DARTs found — every pending DART already carries an id "
                "the CMMS push recognises."
            )
            return

        self.stdout.write(f"{len(candidates)} pending DART(s) carry a GUID id.")

        known_to_cmms = self._ids_known_to_cmms(
            [str(dart.universal_id_t_dart) for dart in candidates]
        )
        if known_to_cmms is None and not include_unchecked:
            self.stderr.write(
                "CMMS is unreachable, so it cannot be confirmed that these ids are "
                "unknown to it. Nothing changed. Re-run when CMMS is reachable, or "
                "pass --include-unchecked to skip the check."
            )
            return

        known_to_cmms = known_to_cmms or set()

        ship_obj = get_this_ship()
        ship_no = (
            (ship_obj.code or ship_obj.universal_id_m_ship) if ship_obj else "UNKNOWN"
        )
        now = timezone.now()

        repairable, skipped = [], []
        for dart in candidates:
            if str(dart.universal_id_t_dart) in known_to_cmms:
                skipped.append(dart)
            else:
                repairable.append(dart)

        for dart in skipped:
            self.stdout.write(
                f"  SKIP {dart.dart_number}: CMMS already holds a row under "
                f"{dart.universal_id_t_dart} — this is a pulled row, not SWMM-raised."
            )

        for dart in repairable:
            new_uid = (
                f"SWMM/{ship_no}/{now.strftime('%Y')}/{now.strftime('%m')}/{dart.id}"
            )
            self.stdout.write(
                f"  {'REPAIR' if apply_changes else 'WOULD REPAIR'} "
                f"{dart.dart_number}: {dart.universal_id_t_dart} -> {new_uid}"
            )
            dart.universal_id_t_dart = new_uid

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    f"\nDry run — nothing written. {len(repairable)} DART(s) would be "
                    "re-stamped and become pushable. Re-run with --apply to write."
                )
            )
            return

        with transaction.atomic():
            for dart in repairable:
                dart.save(update_fields=["universal_id_t_dart"])

        self.stdout.write(
            self.style.SUCCESS(
                f"\nRe-stamped {len(repairable)} DART(s); {len(skipped)} left alone. "
                'They will go up on the next "Sync with CMMS".'
            )
        )

    def _ids_known_to_cmms(self, ids):
        """The subset of `ids` CMMS's T_Dart already holds, or None if CMMS is down.

        Chunked because MSSQL caps a statement at 2100 parameters.
        """
        try:
            from sfd.utils import get_mssql_connection

            conn = get_mssql_connection()
        except Exception as exc:
            self.stderr.write(f"Could not reach CMMS: {exc}")
            return None

        found = set()
        try:
            cursor = conn.cursor()
            for start in range(0, len(ids), 500):
                chunk = ids[start : start + 500]
                placeholders = ",".join(["?"] * len(chunk))
                cursor.execute(
                    "SELECT Universal_ID_T_Dart FROM T_Dart WITH (NOLOCK) "
                    f"WHERE Universal_ID_T_Dart IN ({placeholders})",
                    chunk,
                )
                found.update(str(row[0]) for row in cursor.fetchall())
        except Exception as exc:
            self.stderr.write(f"CMMS lookup failed: {exc}")
            return None
        finally:
            conn.close()

        return found
