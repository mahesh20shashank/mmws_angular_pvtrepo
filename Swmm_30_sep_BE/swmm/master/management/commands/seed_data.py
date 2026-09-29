# Developed with Understanding: seed_data is the first-deployment seed for the swmm service
# (R1 D1, D4). Step a seeds the reference masters swmm still owns - departments,
# sub-departments, naval commands and the fixed Role rows - through the existing seed_all
# functions. Step b seeds the HRCDF command master (HrcdfCommand) and the 302-ship HRCDF
# unit-name master (HrcdfUnit) through master.unit_seed. It never writes Master_unit, the
# this-ship row that Step 1 of the Sync HRCDF page fills. It never
# calls seed_all.seed_reference_data, seed_all.seed_all or seed_all.seed_users, because
# seed_reference_data still calls seed_users, which creates password logins (R1 OB14).
# It writes only the swmm schema and never creates a user or a login.
"""First-deployment seed of the swmm reference masters and the HRCDF unit master."""

import contextlib
import io

from accounts.models import Role
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from master.models import Department, HrcdfUnit, MasterCommand, SubDepartment
from master.unit_seed import apply_unit_seed

# Developed with Understanding: the per-process lookup caches in seed_all. They are cleared
# before step a so a second call in one process (call_command, tests, a dry run followed
# by a real run) never reuses an instance whose row was rolled back.
SEED_ALL_CACHES = (
    "_department_cache",
    "_rank_cache",
    "_designation_cache",
    "_role_cache",
    "_command_cache",
)


# Developed with Understanding: one outer transaction covers both steps, so a failure in
# either leaves the database as it was, and a dry run rolls both back together while
# step b still sees what step a would have created.
class Command(BaseCommand):
    help = (
        "First-deployment seed for swmm - reference masters (departments, "
        "sub-departments, commands, fixed roles) and the bundled HRCDF command and "
        "unit-name masters. Idempotent. The unit step runs only while "
        "master.HrcdfUnit is empty, unless --force."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run every step, print the counts, then roll everything back.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help=(
                "Re-apply the HRCDF unit master seed even when master.HrcdfUnit "
                "already has rows."
            ),
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]
        suffix = " (dry run, rolled back)" if dry_run else ""
        try:
            with transaction.atomic():
                self._seed_reference_masters(suffix)
                self._seed_unit_master(dry_run, force, suffix)
                if dry_run:
                    transaction.set_rollback(True)
        except CommandError:
            raise
        except Exception as exc:
            raise CommandError(f"seed_data failed - {exc}") from exc

    # Developed with Understanding: seed_all is imported here, not at module top, so its
    # import-time django.setup() runs only when this step runs. Inside a running command
    # Django is already set up, so that call finds the app registry ready and does not
    # repopulate it. seed_all prints a banner and a line per row, which is captured so the
    # step prints one summary line. Its [WARN] and [SKIPPED] lines are passed on to stderr.
    def _seed_reference_masters(self, suffix):
        try:
            import seed_all
        except ImportError as exc:
            raise CommandError(
                f"seed_data could not import seed_all.py from the swmm folder - {exc}"
            ) from exc

        for cache_name in SEED_ALL_CACHES:
            cache = getattr(seed_all, cache_name, None)
            if cache is not None:
                cache.clear()

        before = self._reference_counts()
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            seed_all.seed_departments()
            seed_all.seed_sub_departments()
            seed_all.seed_commands()
            for role_name in seed_all.ROLES_FIXED:
                seed_all.get_or_create_role(role_name)
        after = self._reference_counts()

        for line in captured.getvalue().splitlines():
            if line.startswith(("[WARN]", "[SKIPPED]")):
                self.stderr.write(line)

        created = {name: after[name] - before[name] for name in after}
        self.stdout.write(
            "Reference masters - "
            f"departments created {created['departments']}, "
            f"sub-departments created {created['sub_departments']}, "
            f"commands created {created['commands']}, "
            f"roles created {created['roles']}{suffix}"
        )

    @staticmethod
    def _reference_counts():
        return {
            "departments": Department.objects.count(),
            "sub_departments": SubDepartment.objects.count(),
            "commands": MasterCommand.objects.count(),
            "roles": Role.objects.count(),
        }

    # Developed with Understanding: the "database empty" test of R1 D4 item 4 - the unit
    # step runs only while master.HrcdfUnit has no rows, unless --force is given.
    def _seed_unit_master(self, dry_run, force, suffix):
        if HrcdfUnit.objects.exists() and not force:
            self.stdout.write(
                f"HRCDF unit master - skipped, {HrcdfUnit.objects.count()} unit rows "
                f"already present, use --force to re-apply the seed{suffix}"
            )
            return

        counts = apply_unit_seed(dry_run=dry_run)
        self.stdout.write(
            "HRCDF unit master - "
            f"rows read {counts['rows_read']}, "
            f"commands created {counts['commands_created']}, "
            f"commands updated {counts['commands_updated']}, "
            f"units created {counts['units_created']}, "
            f"updated {counts['units_updated']}, "
            f"unchanged {counts['units_unchanged']}{suffix}"
        )
