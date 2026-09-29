# Developed by Unknown: The pattern numbers the shipped sample workbooks carry, written into the
# MO source-of-truth table so a demonstration import can actually resolve some of them.
#
# WHY THIS EXISTS. `obs.services.check_pattern_source` fails any row whose typed PATTERN NUMBER
# matches no item code in `ILMS_item`, `ILMS_mo_item_sot`, `WLMS_wlmsspare` or `WLMS_wed_item_sot`.
# The ten template workbooks at `backend\\obs\\import_templates\\` carry 124 invented codes between
# them - `EK3330B-7529730001`, `NB5540-1120300001` and so on - and not one of them is in any of the
# four. So every filled pattern cell in every sample sheet reports "Pattern number did not match
# ILMS/WLMS", and there is no way to show what a resolved row looks like.
#
# WHY IT IS A SEPARATE COMMAND FROM `seed_equipment_class_defaults`. That one seeds the reference
# data the RULES DOCUMENT fixes - it is correct on any ship, including a live one. This one writes
# invented item codes into a table whose whole purpose is to be a source of truth, and it is
# correct on a demonstration deployment and nowhere else. Bundling the two would mean the only way
# to get a ship's denominations was to also give it 124 fictional MO items. They are kept apart so
# that can never happen by accident.
#
# WHERE IT WRITES. `ILMS_mo_item_sot` (`ilms.MOItemSourceOfTruth`), which
# `resolve_pattern_sources` reads SECOND - after the live `ILMS_item` and before the two WED
# sources. So a code this command seeds is only ever answered from here when the live CMMS master
# does not already carry it, and seeding can never shadow a real item.
#
# WHY IT READS THE WORKBOOKS RATHER THAN CARRYING A LIST. A hard-coded table of 124 codes drifts
# the first time a template is regenerated, and it would drift silently - the seed would still run,
# and the sheet would still fail. Reading `backend\\obs\\import_templates\\*.xlsx` at run time means
# the seed cannot disagree with the workbook it exists to serve.
"""Seed the sample workbooks' pattern numbers into the MO source-of-truth table."""

from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from openpyxl import load_workbook

from ilms.models import MOItemSourceOfTruth

from obs import services
from obs.views import IMPORT_TEMPLATE_DIR

# Developed by Unknown: The sheet the data lives on. The workbooks carry two - `GUIDANCE`, which
# is prose for the rating, and `OBS`, which is the table. Named rather than taken by index so a
# workbook that gains a third sheet does not silently start seeding the wrong one.
DATA_SHEET = "OBS"

# Developed by Unknown: The three columns this command reads, by their header text rather than by
# letter, so a template that gains or loses a column keeps working. They are matched against row 1
# upper-cased and stripped, which is how `obs.excel` reads the same headers.
PATTERN_HEADER = "PATTERN NUMBER"
DESCRIPTION_HEADER = "DESCRIPTION"
CATEGORY_HEADER = "CATEGORY"

# Developed by Unknown: THE DEMONSTRATION SUBSET, and the deliberate choice not to seed all of it.
#
# The point of a demonstration is to show BOTH states in one import - a row whose pattern number
# resolved, and a row whose did not, sitting next to each other in the working table so the
# difference between them is visible. Seeding every code would show only the first, and seeding
# none shows only the second. So the two ENGINEERING workbooks get roughly half their codes each,
# spread across the sheet rather than taken from the top, and every other workbook gets none.
#
# ENGINEERING because it is the department whose two workbooks exercise the most of the rules
# document - both routes, six equipment classes, five spare classes and all five denominations.
#
# `--all` seeds every code in every workbook, for a run where nothing at all should fail.
DEMO_PATTERN_NUMBERS = frozenset(
    {
        # ENGG_SWMM_IMPORT_TEMPLATE_D787
        "EK3330B-7529730001",
        "EK3330B-7529730003",
        "EK3330B-7529720004",
        "EK3330B-7529830201",
        "VS256-98989371",
        "FKP345-4857391",
        # ENGG_SWMM_IMPORT_TEMPLATE_NOND787
        "EK3330B-7529740021",
        "NPT504-25468967",
        "EK3330B-7741300002",
        "EK3330B-7741300019",
    }
)


class _DryRunRollback(Exception):
    """Rolls a --dry-run back. Not a failure."""


class Command(BaseCommand):
    help = (
        "Seed the sample import workbooks' pattern numbers into ILMS_mo_item_sot so a "
        "demonstration import can resolve them. DEMONSTRATION DATA - do not run on a live "
        "ship. Idempotent - a second run creates nothing."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created and write nothing.",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help=(
                "Seed every pattern number in every template workbook, not just the "
                "ENGINEERING demonstration subset."
            ),
        )

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                self._seed(
                    dry_run=bool(options.get("dry_run")),
                    seed_all=bool(options.get("all")),
                )
        except _DryRunRollback:
            self.stdout.write("Dry run - nothing was written.")

    def _seed(self, *, dry_run, seed_all):
        directory = Path(IMPORT_TEMPLATE_DIR)
        if not directory.is_dir():
            self.stdout.write(
                self.style.ERROR(f"No template directory at {directory}. Nothing seeded.")
            )
            return

        items = {}
        for workbook_path in sorted(directory.glob("*.xlsx")):
            for code, description, category in self._read_workbook(workbook_path):
                if not seed_all and code not in DEMO_PATTERN_NUMBERS:
                    continue
                # First workbook seen wins, which matters not at all today - all 124 codes are
                # distinct across the ten workbooks - and matters immediately if two templates
                # ever share one, because a silent second write would change a description
                # depending on the order the directory happened to list.
                items.setdefault(code, (description, category))

        created = 0
        skipped = 0
        for code, (description, category) in sorted(items.items()):
            # Developed by Unknown: the code is NORMALISED before it is written, because
            # `MOItemSourceOfTruth.item_code` now stores the normalised form and is the
            # matching key. A demo code written unnormalised would be seeded and then never
            # matched by the import that exists to demonstrate it.
            stored_code = services.normalise_item_code(code)
            if not stored_code:
                continue
            if MOItemSourceOfTruth.objects.filter(item_code=stored_code).exists():
                skipped += 1
                continue
            created += 1
            if dry_run:
                self.stdout.write(f"  would create {stored_code} - {description}")
                continue
            # Developed by Unknown: `item_desc` is gone from the model - the two real seeding
            # files carry no description, so the column was dropped. The workbook's
            # description is still read above, because it is what the dry-run line prints to
            # identify the code, but it is no longer stored. `crp_category` is not nullable,
            # so a code the workbook leaves uncategorised is seeded PERMANENT, exactly as the
            # real seeder does.
            MOItemSourceOfTruth.objects.create(
                item_code=stored_code,
                crp_category=category or "P",
            )

        self._report(
            dry_run=dry_run,
            seed_all=seed_all,
            found=len(items),
            created=created,
            skipped=skipped,
        )

        if dry_run:
            raise _DryRunRollback()

    # Developed by Unknown: One workbook's `(code, description, category)` triples. The
    # description and category come from the SHEET rather than being invented, so
    # `services.apply_source_of_truth` finds the source agreeing with the row it corrects and
    # writes no correction - a demonstration row should not come up orange for having been
    # "corrected" to the value it already held.
    def _read_workbook(self, path):
        workbook = load_workbook(path, read_only=True, data_only=True)
        try:
            if DATA_SHEET not in workbook.sheetnames:
                self.stdout.write(
                    self.style.WARNING(f"{path.name}: no {DATA_SHEET} sheet. Skipped.")
                )
                return
            sheet = workbook[DATA_SHEET]
            rows = sheet.iter_rows(values_only=True)
            try:
                header = next(rows)
            except StopIteration:
                return
            columns = {
                services.cell_text(value).strip().upper(): index
                for index, value in enumerate(header)
            }
            pattern_at = columns.get(PATTERN_HEADER)
            if pattern_at is None:
                self.stdout.write(
                    self.style.WARNING(
                        f"{path.name}: no {PATTERN_HEADER} column. Skipped."
                    )
                )
                return
            description_at = columns.get(DESCRIPTION_HEADER)
            category_at = columns.get(CATEGORY_HEADER)
            for row in rows:
                code = self._cell(row, pattern_at).upper()
                if not code:
                    # Clause 2.7.1 - a rating who does not know the INCATted pattern number
                    # leaves the cell empty and the application generates one. There is nothing
                    # to look up and nothing to seed.
                    continue
                yield (
                    code,
                    self._cell(row, description_at),
                    self._cell(row, category_at),
                )
        finally:
            workbook.close()

    @staticmethod
    def _cell(row, index):
        if index is None or index >= len(row):
            return ""
        return services.cell_text(row[index]).strip()

    def _report(self, *, dry_run, seed_all, found, created, skipped):
        scope = "every workbook" if seed_all else "the ENGINEERING demonstration subset"
        if not created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Nothing to do - all {found} pattern number(s) from {scope} are already "
                    "resolvable."
                )
            )
        else:
            prefix = "would create" if dry_run else "created"
            self.stdout.write(
                self.style.SUCCESS(
                    f"{prefix}: {created} MO source-of-truth item(s) from {scope}. "
                    f"{skipped} already present."
                )
            )
        self.stdout.write(
            self.style.WARNING(
                "NOTE: these are the sample workbooks' invented item codes, seeded for "
                "demonstration. They sit AFTER the live ILMS_item master in the lookup order, "
                "so they can never shadow a real MO item - but they are not real items and this "
                "command has no place on a live ship."
            )
        )
