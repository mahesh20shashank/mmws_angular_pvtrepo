# Developed by Unknown: Removes the equipment classes an earlier version of
# `seed_equipment_class_defaults` wrote into every ship, leaving only the one a department cannot
# import without.
#
# WHY THEY HAVE TO GO. That seed carried a per-department list - AIR CONDITIONING PLANT, DIESEL
# ALTERNATOR, STP, FIRE EXTINGUISHER and thirty more - transcribed from the `C2:C250` dropdown of
# each template workbook. The transcription was accurate and the idea was wrong. Clause 2.6.1 says
# the EQUIPMENT CLASS cell carries the equipment name "exactly as in the D787J document", and a
# D787J is PER SHIP: those dropdown names belong to the example vessel the templates were built
# from. Seeding them presented one ship's machinery as another's, on the Masters screen and in
# every equipment-class list the application offers.
#
# A ship's real list now builds itself from the ship's own sheet, through
# `services.collect_master_additions`, on the first import. The only row that stays is
# MICELLANEOUS, which clauses 2.6.2 and 2.6.3 make a precondition of importing at all and which
# `obs.models.SpareClass.save()` now creates.
#
# WHY A COMMAND AND NOT A MIGRATION. The house rule in `backend\\CLAUDE.md` is that reference rows
# are written and removed by idempotent commands, never by anything that runs on its own, and a
# DELETION has more claim to that rule than a creation does. A migration would run against every
# deployment the moment it was applied, including one where a ship has spent a week curating its
# equipment classes by hand and would have no way to tell which of them this code considered its
# own to remove.
#
# WHY IT REFUSES RATHER THAN CASCADES. `Spares.equipment_class` is `PROTECT` and
# `SparesMapping.equipment_class` is `SET_NULL`, so Django would refuse the first and silently
# orphan the second. Neither is an outcome to discover afterwards, so a row carrying either is
# reported and skipped and the operator is told which and why.
"""Remove the seeded equipment classes, keeping MICELLANEOUS and anything a ship is using."""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from obs.models import DEFAULT_EQUIPMENT_CLASS, EquipmentClass


class _DryRunRollback(Exception):
    """Rolls a --dry-run back. Not a failure."""


class Command(BaseCommand):
    help = (
        "Remove equipment classes written by the old seed, keeping MICELLANEOUS and any class "
        "a spare or a spare-data map still points at. Idempotent - a second run removes "
        "nothing. --dry-run reports and writes nothing."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be removed and write nothing.",
        )
        # Developed by Unknown: MICELLANEOUS is protected by name and there is deliberately no
        # flag to override that. It is not a seeded convenience - clauses 2.6.2 and 2.6.3 make it
        # the whole of the permitted equipment class for SPARES_PLL and SPARES_MICELLANEOUS, so a
        # department without it cannot import a PLL row, and a command that could remove it would
        # be a command that could break a ship in a way nothing on screen would explain.
        parser.add_argument(
            "--keep",
            action="append",
            default=[],
            metavar="NAME",
            help=(
                "An additional equipment class name to keep, repeatable. Matched without "
                "regard to case. MICELLANEOUS is always kept."
            ),
        )

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                self._prune(
                    dry_run=bool(options.get("dry_run")),
                    keep=[str(name).strip().upper() for name in options.get("keep") or []],
                )
        except _DryRunRollback:
            self.stdout.write("Dry run - nothing was written.")

    def _prune(self, *, dry_run, keep):
        protected_names = {DEFAULT_EQUIPMENT_CLASS, *keep}

        # Counted in the query rather than per row: this runs over every equipment class on the
        # ship and a `.spares.exists()` per row would be one statement each.
        candidates = (
            EquipmentClass.objects.annotate(
                spare_count=Count("spares", distinct=True),
                mapping_count=Count("spares_mappings", distinct=True),
            )
            .exclude(name__in=protected_names)
            .order_by("name")
        )

        removed = 0
        in_use = []
        for equipment_class in candidates:
            if equipment_class.name.strip().upper() in protected_names:
                continue
            if equipment_class.spare_count or equipment_class.mapping_count:
                in_use.append(equipment_class)
                continue
            removed += 1
            department = getattr(equipment_class.department, "name", None)
            self.stdout.write(
                f"  {'would remove' if dry_run else 'removed'} {equipment_class.name!r} "
                f"({department!r})"
            )
            if not dry_run:
                equipment_class.delete()

        self._report(dry_run=dry_run, removed=removed, in_use=in_use)

        if dry_run:
            raise _DryRunRollback()

    def _report(self, *, dry_run, removed, in_use):
        if not removed:
            self.stdout.write(
                self.style.SUCCESS(
                    "Nothing to remove - every equipment class on this ship is either "
                    f"{DEFAULT_EQUIPMENT_CLASS} or is in use."
                )
            )
        else:
            prefix = "would remove" if dry_run else "removed"
            self.stdout.write(
                self.style.SUCCESS(f"{prefix}: {removed} equipment class(es).")
            )

        # Reported one by one, not counted. An operator who expected a clean list needs to know
        # WHICH classes are still there and what is holding each of them, because the answer -
        # a spare, or a spare-data map - decides what they do about it.
        for equipment_class in in_use:
            self.stdout.write(
                self.style.WARNING(
                    f"  kept {equipment_class.name!r} - {equipment_class.spare_count} spare(s) "
                    f"and {equipment_class.mapping_count} spare-data map(s) point at it."
                )
            )

        self.stdout.write(
            self.style.WARNING(
                f"NOTE: {DEFAULT_EQUIPMENT_CLASS} is never removed - clauses 2.6.2 and 2.6.3 "
                "make it the whole of the permitted equipment class for SPARES_PLL and "
                "SPARES_MICELLANEOUS. Every other class is re-created from the ship's own sheet "
                "on the next import, named as its D787J document gives it."
            )
        )
