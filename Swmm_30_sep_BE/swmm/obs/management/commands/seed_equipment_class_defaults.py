# Developed by Unknown: The onboard-spares master registers every department needs before it can
# import anything - the eight spare classes the rules document fixes, its five denominations, and
# the ship's eight authorities.
#
# IT NO LONGER SEEDS EQUIPMENT CLASSES. It briefly seeded a list per department, transcribed from
# the template workbooks' own dropdowns, and that was the wrong list to ship: clause 2.6.1 says
# the cell carries the equipment name "exactly as in the D787J document", and a D787J is per
# SHIP - those dropdown names are one example vessel's, offered to a rating as a sample. Seeding
# them presented another ship's machinery as this one's. The ship's list now builds itself from
# the ship's own sheet, through `services.collect_master_additions`, and the single row a
# department cannot import without - MICELLANEOUS, clauses 2.6.2 and 2.6.3 - is created by
# `obs.models.SpareClass.save()` the moment SPARES_MICELLANEOUS is written below.
#
# WHY IT GREW. It used to seed the spare classes and one MICELLANEOUS equipment class, and
# nothing else, which left three of the rule engine's four master checks with nothing to match
# against. `obs.services._check_denomination` and `_check_authority` refuse a row whose value has
# no master row, so on a freshly seeded ship EVERY row of EVERY workbook failed rule 2.10 and
# rule 2.17 no matter how correctly it was filled in - and the References > Masters dropdowns,
# which read the same tables, came up empty beside them. The reference data was simply absent.
# `obs\\tests.py` had been seeding denominations and authorities as a FIXTURE for its own runs
# since before this command existed, which is the clearest evidence that nothing but a shipped
# seed was missing.
#
# It is a MANAGEMENT COMMAND and not a migration, deliberately. A migration runs on every
# database the moment it is applied, including one where the ship has already curated its own
# master list, and a migration that writes reference rows is the hardest kind to reason about
# later. `backend\obs\management\commands\seed_ship_inventory_dashboard.py` established the
# pattern in this very app and `backend\CLAUDE.md` records the house convention for a seed -
# IDEMPOTENT and NO-DROP. Both are held here: every write is a `get_or_create`, nothing is
# deleted, nothing is renamed, and a second run reports that it created nothing.
#
# THIS COMMAND IS THE ONLY PATH THAT CREATES A SPARE CLASS. No screen offers to, no endpoint
# the Equipment Classes tab calls will make one, and the spare class list on that tab is read
# only. The list is fixed by the rules document and is not the ship's to extend.
"""Seed the spare classes, denominations and authorities, per department."""

from django.core.management.base import BaseCommand
from django.db import transaction

from master.models import Department

from obs import services
from obs.models import (
    DEFAULT_EQUIPMENT_CLASS,
    DEFAULT_EQUIPMENT_CLASS_SPARE_CLASS,
    Authority,
    Denomination,
    SpareClass,
)
from obs.utils import canonical_department_name, ensure_default_spare_image

# Developed by Unknown: The departments this seed covers.
#
# HULL AND NBCD ARE HERE NOW, and their absence was not the harmless simplification it was
# written as. Both are still real `master.Department` rows - `accounts.rbac.HIDDEN_DEPARTMENTS`
# hides them from the department PICKER, which is a different thing from them not existing - and
# a rating logged in against either resolves to a department of that name. Both have their own
# entries in `services.SPARE_CLASS_BY_DEPARTMENT_AND_ROUTE`, both have their own template
# workbook, and HULL is one of the three departments clause 2.5.1 names as holding a D787J. Left
# out, the two of them had no spare classes, no denominations and no equipment classes, so every
# row of their workbooks failed rule 2.5 on a ship where every other department imported cleanly.
#
# A department listed here that has no row is REPORTED AND SKIPPED, so listing one that a
# particular deployment does not have costs nothing.
DEPARTMENTS_IN_SCOPE = (
    "ENGINEERING",
    "ELECTRICAL",
    "MEDICAL",
    "LOGISTICS",
    "EXECUTIVE",
    "HULL",
    "NBCD",
)

# Developed by Unknown: The eight spare classes, taken from `services.SPARE_CLASS_BY_ROUTE`
# rather than re-typed here, so this command and the rule engine can never disagree about what
# the rules document permits. The union across the two routes is exactly the eight of clauses
# 2.5.1 and 2.5.2 - SPARES_EQUIPMENT, SPARES_FITTINGS, SPARES_VALVES, SPARES_WEAPONS,
# SPARES_ELECTRICAL, SPARES_PLL, SPARES_CONSUMABLE and SPARES_MICELLANEOUS.
#
# Every department gets all eight. The per-department narrowing at
# `services.SPARE_CLASS_BY_DEPARTMENT_AND_ROUTE` decides which of them a department may USE on
# a given route, and that check runs on the import. Seeding only the narrowed set would leave
# a department unable to hold a class the rules document lists for the other route.
SPARE_CLASSES = tuple(
    sorted(set().union(*services.SPARE_CLASS_BY_ROUTE.values()))
)


# Developed by Unknown: Raised only to roll a `--dry-run` back. A control signal, not an error,
# and caught inside `handle()` so the command still exits zero.
class _DryRunRollback(Exception):
    """Rolls a --dry-run back. Not a failure."""


class Command(BaseCommand):
    help = (
        "Seed the onboard-spares master data the import rule engine checks against - the "
        "eight fixed spare classes, the five denominations of clause 2.10 and the eight "
        "authorities of clause 2.17. Equipment classes are NOT seeded: MICELLANEOUS arrives "
        "with SPARES_MICELLANEOUS through the model, and every other name comes from the "
        "ship's own imported sheet. Idempotent - a second run creates nothing."
    )

    def add_arguments(self, parser):
        # Developed by Unknown: A read-only pass, so the ship can see exactly what a real run
        # would write before it writes it. Nothing else about the command changes under it.
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created and write nothing.",
        )

    # Developed by Unknown: The dry run is rolled back rather than branched around, so the
    # reported counts come from the same code path a real run takes and cannot drift from it.
    # `_seed` raises `_DryRunRollback` at the end of the transaction when nothing is to be
    # kept, and it is swallowed here - it is a control signal, not a failure, so the command
    # still exits zero.
    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        try:
            with transaction.atomic():
                self._seed(dry_run=dry_run)
        except _DryRunRollback:
            self.stdout.write("Dry run - nothing was written.")

        # Developed by Unknown: the default spare photograph, seeded here as well as by
        # `seed_obs_media`, because THIS is the command the setup notes tell an operator to run
        # before their first import and a missing placeholder is invisible until a spare without
        # a photograph is opened. Outside the transaction above - it writes a file, not a row,
        # so a dry run's rollback would not undo it; hence the guard rather than the rollback.
        if dry_run:
            self.stdout.write("Dry run - the default spare photograph was not seeded.")
        elif ensure_default_spare_image():
            self.stdout.write(
                self.style.SUCCESS("Seeded the default spare photograph under MEDIA_ROOT.")
            )

    # Developed by Unknown: WHICH ROWS EACH DEPARTMENT IN SCOPE ACTUALLY IS.
    #
    # This was `Department.objects.filter(name__iexact=department_name).first()`, which reads
    # the canonical word and nothing else. A CMMS-synced deployment names its Engineering row
    # `E`, so every department in scope missed, every one was reported as absent, and the
    # command created NOTHING - no spare classes and no MICELLANEOUS - on precisely the
    # deployments that needed seeding. The References > Masters hand-entry dropdowns are fed
    # from those rows, so both of them came up empty with no indication why.
    #
    # Resolved through `obs.utils.canonical_department_name`, the same function the D787J
    # route and the import-template lookup now use, so all three agree on what `E` is.
    #
    # A LIST, not a single row: a deployment can hold both the seeded `ENGINEERING` and a
    # CMMS-synced `E` (`swmmapi.views._absorb_seeded_department_twins` only merges twins whose
    # names normalise to each other, which these do not). Both are real departments users are
    # assigned to, so both are seeded rather than one of them being picked arbitrarily.
    def _departments_in_scope(self):
        by_canonical = {name: [] for name in DEPARTMENTS_IN_SCOPE}
        for department in Department.objects.all().order_by("name"):
            matched = by_canonical.get(canonical_department_name(department))
            if matched is not None:
                matched.append(department)
        return by_canonical

    def _seed(self, *, dry_run):
        created_spare_classes = 0
        created_denominations = 0
        missing_departments = []

        # Developed by Unknown: The authorities are seeded ONCE for the ship and not once per
        # department, because `obs.Authority` has no department column - clause 2.17's eight
        # names are the ship's, not a branch's. Done before the department loop so a deployment
        # with no departments at all still ends up with them.
        created_authorities = self._seed_authorities(dry_run=dry_run)

        for department_name, departments in self._departments_in_scope().items():
            # A department that does not exist is REPORTED AND SKIPPED - this command seeds
            # onboard-spares master data and creating a department row is not its business.
            if not departments:
                missing_departments.append(department_name)
                self.stdout.write(
                    self.style.WARNING(
                        f"{department_name}: no department row. Skipped - create the "
                        f"department first, then re-run."
                    )
                )
                continue
            for department in departments:
                if department.name.strip().upper() != department_name:
                    self.stdout.write(
                        f"{department_name}: seeding department row named "
                        f"{department.name!r}."
                    )
                created = self._seed_department(department, dry_run=dry_run)
                created_spare_classes += created[0]
                created_denominations += created[1]

        self._report(
            dry_run=dry_run,
            created_spare_classes=created_spare_classes,
            created_denominations=created_denominations,
            created_authorities=created_authorities,
            missing_departments=missing_departments,
        )

        if dry_run:
            # Developed by Unknown: Rolling the whole transaction back is the only way to be
            # certain a dry run wrote nothing, including anything a `save()` override or a
            # signal might have written along the way.
            raise _DryRunRollback()

    # Developed by Unknown: The ship's eight authorities, clause 2.17. Taken from
    # `services.AUTHORITIES` rather than re-typed, for the same reason `SPARE_CLASSES` above is
    # taken from `SPARE_CLASS_BY_ROUTE` - the seed and the rule engine must not be able to
    # disagree about what the document permits. `AUTHORITIES` is the union of both routes, so
    # `D787J` is included; `permitted_authorities` is what narrows it per route on the import,
    # and a ship that could not hold `D787J` in this table could not import a D787J workbook.
    def _seed_authorities(self, *, dry_run):
        created = 0
        for name in sorted(services.AUTHORITIES):
            if Authority.objects.filter(name__iexact=name).exists():
                continue
            created += 1
            if dry_run:
                self.stdout.write(f"  would create authority {name}")
                continue
            Authority.objects.create(name=name)
        return created

    # Developed by Unknown: One department row's own seeding, lifted out of `_seed` so the loop
    # above can run it for each row a canonical name resolves to.
    def _seed_department(self, department, *, dry_run):
        created_spare_classes = 0

        spare_classes = {}
        for spare_class_name in SPARE_CLASSES:
            existing = SpareClass.objects.filter(
                name__iexact=spare_class_name, department=department
            ).first()
            if existing is not None:
                spare_classes[spare_class_name] = existing
                continue
            if dry_run:
                created_spare_classes += 1
                self.stdout.write(f"  would create spare class {spare_class_name}")
                continue
            spare_classes[spare_class_name] = SpareClass.objects.create(
                name=spare_class_name, department=department
            )
            created_spare_classes += 1

        # Developed by Unknown: `spare_classes` is collected but no longer read here. The eight
        # rows are what this loop exists to create, and MICELLANEOUS - the one equipment class a
        # department is born with - is now created by `SpareClass.save()` the moment
        # SPARES_MICELLANEOUS is written above. This command no longer seeds equipment classes at
        # all; see `obs.services` for why that list was the wrong thing to ship.
        created_denominations = self._seed_denominations(department, dry_run=dry_run)
        return created_spare_classes, created_denominations

    # Developed by Unknown: The five denominations of clause 2.10.1, per department. They are
    # department-scoped because `obs.Denomination` is - `unique_together ("name", "department")`
    # - and `services._check_denomination` looks one up by the importing user's department. A
    # single undepartmented row, which is what `seed_ship_inventory_dashboard` writes for its own
    # demo data, satisfies that lookup for nobody.
    def _seed_denominations(self, department, *, dry_run):
        created = 0
        for name in services.DENOMINATION_OPTIONS:
            if Denomination.objects.filter(
                name__iexact=name, department=department
            ).exists():
                continue
            created += 1
            if dry_run:
                self.stdout.write(f"  would create denomination {name}")
                continue
            Denomination.objects.create(name=name, department=department)
        return created

    # Developed by Unknown: The run report. A seed that says nothing leaves the operator
    # unable to tell an idempotent second run from a run that silently did nothing at all, and
    # the verification checklist for this change turns on exactly that distinction.
    def _report(
        self,
        *,
        dry_run,
        created_spare_classes,
        created_denominations,
        created_authorities,
        missing_departments,
    ):
        prefix = "would create" if dry_run else "created"
        total = created_spare_classes + created_denominations + created_authorities
        if not total:
            self.stdout.write(
                self.style.SUCCESS(
                    "Nothing to do - every department in scope already holds all eight spare "
                    "classes and its five denominations, and the ship holds all eight "
                    "authorities."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"{prefix}: {created_spare_classes} spare classes, "
                    f"{created_denominations} denominations, "
                    f"{created_authorities} authorities."
                )
            )
        if missing_departments:
            self.stdout.write(
                self.style.WARNING(
                    "Departments not found and skipped: "
                    + ", ".join(missing_departments)
                )
            )
        # Stated on EVERY run, not only the first, because an operator who has just seeded a
        # department needs to know where its equipment classes are going to come from - and the
        # answer is "not from here", which is worth saying out loud rather than leaving them to
        # notice an empty list on the Masters screen.
        self.stdout.write(
            self.style.WARNING(
                f"NOTE: this command seeds NO equipment classes. "
                f"{DEFAULT_EQUIPMENT_CLASS} is created for a department by "
                f"obs.models.SpareClass.save() the moment "
                f"{DEFAULT_EQUIPMENT_CLASS_SPARE_CLASS} is written, because clauses 2.6.2 and "
                "2.6.3 make it a precondition of importing at all. Every other equipment class "
                "comes from the ship's own imported sheet, named exactly as its D787J document "
                "gives it, per clause 2.6.1."
            )
        )
