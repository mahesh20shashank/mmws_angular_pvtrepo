# Developed by Unknown: Loads the two pattern-number sources of truth from the files the navy
# supplied - an `ItemCode`/`CRPCategory` workbook into `ILMS_mo_item_sot`, and
# `WLMS SOT Table seeding.xlsx` into `WLMS_wed_item_sot`. Both sources are plain .xlsx
# workbooks, read with the same caption-matching approach so a header that moves on either
# side does not silently seed the wrong column.
#
# WHY IT IS SEPARATE FROM `seed_obs_demo_patterns`. That command writes a hundred-odd invented
# codes taken from the sample workbooks, so a demonstration import can resolve them, and its
# own header says never to run it on a live ship. This one writes the real list, over a
# million rows, and is the only thing that should ever populate these tables in production.
# Merging the two would make it impossible to tell demonstration data from the real thing.
#
# WHY IT LIVES IN `obs` AND NOT IN `ilms` OR `wlms`. It writes to both apps' tables, so it
# belongs to neither, and `obs` is the app that reads them - `seed_obs_demo_patterns` already
# sets that precedent by living here and writing `ILMS_mo_item_sot`. One command rather than
# two, so the reconciliation report covers both tables in one place.
#
# WHAT THE SOURCE FILES ACTUALLY LOOK LIKE, measured rather than assumed:
#
#   ILMS, a single-sheet workbook with an `ItemCode` column and a `CRPCategory` column - one
#   category per row, no ambiguity to search for.
#
#   WLMS, a workbook of four sheets whose code column is captioned differently on each -
#   `PATTERNNO` on W1 and W3, `PARTNO` on W2, `PATTERNO` on W4. Matched by caption and never
#   by index, so a fifth sheet with a fifth spelling does not silently seed the wrong column.
#
# THE ONE DECISION WORTH ARGUING WITH. `crp_category` is not nullable, by explicit
# instruction, so a code the source leaves uncategorised and a code the source gives two
# different categories are BOTH seeded `P`. Because the import auto-corrects CATEGORY without
# asking, an uploaded row hitting one of them has its category silently overwritten. Storing
# NULL would have left such rows alone. The report prints the count as a headline number so
# the scale stays visible.
"""Seeds `ILMS_mo_item_sot` and `WLMS_wed_item_sot` from the supplied SoT workbooks."""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from openpyxl import load_workbook

from ilms.models import MOItemSourceOfTruth
from obs import services
from wlms.models import WedItemSourceOfTruth

# Developed by Unknown: Where the two files live on the machine that runs the seed. An
# argument with a default rather than a constant, because the path is a property of the
# operator's machine and not of the application.
DEFAULT_SOURCE_DIR = r"E:\sot data"
ILMS_FILE_NAME = "ILMS SOT Table seeding.xlsx"
WLMS_FILE_NAME = "WLMS SOT Table seeding.xlsx"

# Developed by Unknown: The category vocabularies, which are NOT the same on the two sides.
# ILMS uses C, R and P; WLMS uses C, P and QP. A value outside its own table's set is rejected
# and counted - that covers `0`, `-1`, `&`, the unit of measure (`sqM`, `no`, `SET`), the
# country code (`Ind`, `Rus`, `USA`), the shelf life in months (`12`, `60`, `120`), and `N`.
#
# `N` deserves its own note. It is a fourth letter present in the ILMS file that nobody has
# explained - `N5530-000021-PB1,sqM,N` - and under the C/R/P rule it is rejected, which means
# those codes fall through to the `P` default below. What it means should be confirmed.
ILMS_CATEGORIES = frozenset({"C", "R", "P"})
WLMS_CATEGORIES = frozenset({"C", "P", "QP"})

# Developed by Unknown: What a code with no category, or with two contradictory ones, is
# seeded as. See the header - this is the decision to revisit first.
DEFAULT_CATEGORY = "P"

# Developed by Unknown: Accepted spellings of the WLMS code column, matched after space
# removal and upper-casing. Three spellings for one column across four sheets.
WLMS_CODE_CAPTIONS = frozenset({"PATTERNNO", "PARTNO", "PATTERNO"})
WLMS_CATEGORY_CAPTION = "CATEGORY"

# Developed by Unknown: The ILMS workbook's own column captions, matched the same
# space-removal-and-upper-case way as WLMS's.
ILMS_XLSX_CODE_CAPTIONS = frozenset({"ITEMCODE"})
ILMS_XLSX_CATEGORY_CAPTION = "CRPCATEGORY"

# Developed by Unknown: Rows per `bulk_create` round trip. Large enough that a million rows is
# two hundred round trips and not a million, small enough that one INSERT's parameter list
# stays inside what psycopg will accept for a two-column table.
BATCH_SIZE = 5000

# Developed by Unknown: What the two files measured on 07 September 2026. The command compares
# its own counts against these and says so loudly when they disagree, because a parser that has
# silently started reading the wrong column still finishes and still prints a tidy report.
#
# These are EXPECTATIONS, not assertions - a legitimately updated file will differ, and the
# command warns rather than failing, so a new file can still be loaded.
EXPECTED = {
    "WLMS": {"rows_read": 228950, "distinct": 157296, "defaulted": 6790},
}


class _DryRunRollback(Exception):
    """Rolls a --dry-run back. Not a failure."""


class Command(BaseCommand):
    help = (
        "Loads ILMS_mo_item_sot and WLMS_wed_item_sot from the supplied source-of-truth "
        "files. Truncates and reloads each table inside one transaction, so re-running "
        "produces the same table and never doubled rows. --dry-run parses, reports and "
        "writes nothing."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--source-dir",
            default=DEFAULT_SOURCE_DIR,
            help=f"Directory holding both files. Default {DEFAULT_SOURCE_DIR}.",
        )
        parser.add_argument(
            "--ilms-file",
            default=None,
            help=(
                "Full path to the ILMS workbook (ItemCode/CRPCategory columns), "
                "overriding --source-dir."
            ),
        )
        parser.add_argument(
            "--wlms-file",
            default=None,
            help="Full path to the WLMS workbook, overriding --source-dir.",
        )
        parser.add_argument(
            "--only",
            choices=["ilms", "wlms"],
            default=None,
            help="Seed one table only. Default is both.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and report, and write nothing.",
        )

    def handle(self, *args, **options):
        source_dir = Path(options["source_dir"])
        ilms_path = Path(options["ilms_file"] or source_dir / ILMS_FILE_NAME)
        wlms_path = Path(options["wlms_file"] or source_dir / WLMS_FILE_NAME)
        only = options.get("only")
        dry_run = bool(options.get("dry_run"))

        if only != "wlms" and not ilms_path.is_file():
            raise CommandError(f"ILMS source file not found: {ilms_path}")
        if only != "ilms" and not wlms_path.is_file():
            raise CommandError(f"WLMS source file not found: {wlms_path}")

        try:
            # Developed by Unknown: ONE transaction around BOTH tables. The truncate and the
            # reload are the same operation and a crash between them would leave the import
            # cross-checking against an empty source of truth - which fails every typed
            # pattern number on a ship, silently, until somebody notices.
            with transaction.atomic():
                if only != "wlms":
                    self._seed_ilms(ilms_path, dry_run=dry_run)
                if only != "ilms":
                    self._seed_wlms(wlms_path, dry_run=dry_run)
                if dry_run:
                    raise _DryRunRollback()
        except _DryRunRollback:
            self.stdout.write(self.style.WARNING("Dry run - nothing was written."))

    # Developed by Unknown: The ILMS workbook, streamed the same way as WLMS - one ItemCode
    # column and one CRPCategory column, one category per row. One million rows are never held
    # as a list of rows; only the collapsed `{normalised code: category}` mapping is kept,
    # which is unavoidable because a code's category cannot be settled until the whole file has
    # been read and every duplicate of that code seen.
    def _seed_ilms(self, path, *, dry_run):
        counts = _Counts("ILMS")
        codes = {}
        workbook = load_workbook(path, read_only=True, data_only=True)
        try:
            for sheet in workbook.worksheets:
                rows = sheet.iter_rows(values_only=True)
                header = next(rows, None)
                if header is None:
                    continue
                captions = [
                    "".join(str(cell or "").split()).upper() for cell in header
                ]
                code_index = _index_of(captions, ILMS_XLSX_CODE_CAPTIONS)
                category_index = _index_of(captions, {ILMS_XLSX_CATEGORY_CAPTION})
                if code_index is None:
                    counts.sheets.append((sheet.title, "NO CODE COLUMN", 0, 0))
                    self.stdout.write(
                        self.style.ERROR(
                            f"  sheet {sheet.title}: no ItemCode column - SKIPPED."
                        )
                    )
                    continue
                sheet_rows = 0
                sheet_codes = 0
                for row in rows:
                    if not any(value not in (None, "") for value in row):
                        continue
                    counts.rows_read += 1
                    sheet_rows += 1
                    code = services.normalise_item_code(_cell(row, code_index))
                    if not code:
                        counts.junk_dropped += 1
                        continue
                    sheet_codes += 1
                    category = self._clean_category(
                        _cell(row, category_index), ILMS_CATEGORIES, counts
                    )
                    if category is None:
                        counts.rows_without_category += 1
                    _record(codes, code, category)
                counts.sheets.append(
                    (sheet.title, captions[code_index], sheet_rows, sheet_codes)
                )
        finally:
            workbook.close()
        self._write(
            MOItemSourceOfTruth,
            codes,
            counts,
            max_length=MOItemSourceOfTruth._meta.get_field("item_code").max_length,
            dry_run=dry_run,
        )

    # Developed by Unknown: The WLMS workbook, streamed with `read_only=True` so openpyxl
    # yields rows instead of building the whole sheet in memory. All four sheets, every one in
    # scope.
    def _seed_wlms(self, path, *, dry_run):
        counts = _Counts("WLMS")
        codes = {}
        workbook = load_workbook(path, read_only=True, data_only=True)
        try:
            for sheet in workbook.worksheets:
                rows = sheet.iter_rows(values_only=True)
                header = next(rows, None)
                if header is None:
                    continue
                captions = [
                    "".join(str(cell or "").split()).upper() for cell in header
                ]
                code_index = _index_of(captions, WLMS_CODE_CAPTIONS)
                category_index = _index_of(captions, {WLMS_CATEGORY_CAPTION})
                if code_index is None:
                    # Developed by Unknown: RECORDED, not silently skipped. A sheet whose code
                    # column this command does not recognise is the one failure mode that would
                    # otherwise lose a quarter of the source of truth without saying so.
                    counts.sheets.append((sheet.title, "NO CODE COLUMN", 0, 0))
                    self.stdout.write(
                        self.style.ERROR(
                            f"  sheet {sheet.title}: no pattern-number column "
                            f"({', '.join(sorted(WLMS_CODE_CAPTIONS))}) - SKIPPED."
                        )
                    )
                    continue
                # Developed by Unknown: per-sheet tallies, so the report can show that every
                # sheet of the workbook actually contributed. The workbook carries four and
                # captions its code column differently on three of them, so "all four sheets
                # were read" is a claim worth being able to see rather than assume.
                sheet_rows = 0
                sheet_codes = 0
                for row in rows:
                    if not any(value not in (None, "") for value in row):
                        continue
                    counts.rows_read += 1
                    sheet_rows += 1
                    code = services.normalise_item_code(_cell(row, code_index))
                    if not code:
                        counts.junk_dropped += 1
                        continue
                    sheet_codes += 1
                    category = self._clean_category(
                        _cell(row, category_index), WLMS_CATEGORIES, counts
                    )
                    if category is None:
                        counts.rows_without_category += 1
                    _record(codes, code, category)
                counts.sheets.append(
                    (sheet.title, captions[code_index], sheet_rows, sheet_codes)
                )
        finally:
            workbook.close()
        self._write(
            WedItemSourceOfTruth,
            codes,
            counts,
            max_length=WedItemSourceOfTruth._meta.get_field("item_code").max_length,
            dry_run=dry_run,
        )

    def _clean_category(self, value, vocabulary, counts, count_reject=True):
        """Uppercase and accept only this table's vocabulary. Anything else is None.

        Strips a wrapping single quote the same way `services.normalise_item_code` does for
        item codes - the ILMS workbook's `CRPCategory` column carries it too (`'C'`, not
        `C`), left over from the same text-mode export.
        """
        candidate = "".join(str(value or "").split()).strip("'").upper()
        if candidate in vocabulary:
            return candidate
        if count_reject and candidate:
            counts.rejected_categories[candidate] = (
                counts.rejected_categories.get(candidate, 0) + 1
            )
        return None

    # Developed by Unknown: Truncate and reload, inside the caller's transaction.
    #
    # TRUNCATE-AND-RELOAD RATHER THAN UPSERT, deliberately. These tables are pure derived data
    # with no foreign key pointing at them and no column anything else writes, so there is
    # nothing for an upsert to preserve; and resolving a million conflicts row by row costs far
    # more than one delete plus two hundred batched inserts. Re-running produces exactly the
    # same table, which is the whole of what idempotent has to mean here.
    def _write(self, model, codes, counts, *, max_length, dry_run):
        rows = []
        for code, resolved in codes.items():
            if len(code) > max_length:
                counts.over_length.append(code)
                continue
            counts.distinct += 1
            if resolved is None or resolved is AMBIGUOUS:
                # No category at all, or two that disagree. Both become the default, and both
                # are counted, because they are different problems with the same fix.
                if resolved is AMBIGUOUS:
                    counts.contradictory += 1
                counts.defaulted += 1
                category = DEFAULT_CATEGORY
            else:
                category = resolved
            rows.append(model(item_code=code, crp_category=category))

        if not dry_run:
            model.objects.all().delete()
            model.objects.bulk_create(rows, batch_size=BATCH_SIZE)
        self._report(counts, model)

    def _report(self, counts, model):
        table = model._meta.db_table
        self.stdout.write(self.style.SUCCESS(f"\n{counts.label} -> {table}"))
        # Developed by Unknown: the per-sheet breakdown, printed before the totals so a reader
        # sees WHERE the rows came from before they see how many there were.
        for title, caption, sheet_rows, sheet_codes in counts.sheets:
            self.stdout.write(
                f"  sheet {title:<6} [{caption:<9}] rows {sheet_rows:>8,}"
                f"   usable codes {sheet_codes:>8,}"
            )
        if counts.sheets:
            self.stdout.write(f"  sheets read                {len(counts.sheets):>9,}")
        self.stdout.write(f"  rows read                  {counts.rows_read:>9,}")
        self.stdout.write(f"  junk codes dropped         {counts.junk_dropped:>9,}")
        self.stdout.write(f"  rows with no category      {counts.rows_without_category:>9,}")
        self.stdout.write(f"  distinct codes seeded      {counts.distinct:>9,}")
        self.stdout.write(f"  contradictory codes        {counts.contradictory:>9,}")
        self.stdout.write(
            self.style.WARNING(
                f"  seeded '{DEFAULT_CATEGORY}' with no evidence  {counts.defaulted:>9,}"
            )
        )
        if counts.over_length:
            self.stdout.write(
                self.style.ERROR(
                    f"  codes too long to store    {len(counts.over_length):>9,}"
                )
            )
            for code in counts.over_length[:20]:
                self.stdout.write(self.style.ERROR(f"    dropped ({len(code)}) {code}"))

        if counts.rejected_categories:
            top = sorted(
                counts.rejected_categories.items(), key=lambda item: -item[1]
            )[:10]
            rejected = ", ".join(f"{value}={count:,}" for value, count in top)
            self.stdout.write(f"  rejected category values   {rejected}")

        # Developed by Unknown: The reconciliation. A parser reading the wrong column still
        # finishes and still prints a tidy report, so the numbers are checked against what the
        # files measured rather than left for a human to remember.
        expected = EXPECTED.get(counts.label)
        if expected:
            drift = [
                f"{name} expected {value:,} got {getattr(counts, name):,}"
                for name, value in (
                    ("rows_read", expected["rows_read"]),
                    ("distinct", expected["distinct"]),
                    ("defaulted", expected["defaulted"]),
                )
                if getattr(counts, name) != value
            ]
            if drift:
                self.stdout.write(
                    self.style.ERROR(
                        "  DOES NOT RECONCILE against the measured source file: "
                        + "; ".join(drift)
                        + ". Either the file has been replaced, or the parse is wrong - "
                        "check before trusting this seed."
                    )
                )
            else:
                self.stdout.write(self.style.SUCCESS("  reconciles against the source file."))


# Developed by Unknown: The per-table tally. A small class rather than a dict so a mistyped
# counter name fails loudly instead of silently creating a key nothing ever prints.
class _Counts:
    def __init__(self, label):
        self.label = label
        self.rows_read = 0
        self.junk_dropped = 0
        self.rows_without_category = 0
        self.distinct = 0
        self.contradictory = 0
        self.defaulted = 0
        self.over_length = []
        self.rejected_categories = {}
        # Developed by Unknown: `(sheet title, code column caption, rows, usable codes)` per
        # worksheet.
        self.sheets = []


# Developed by Unknown: What a code is mapped to once two rows have given it two different
# categories. A module-level sentinel rather than a set of the values, because the values stop
# mattering the moment they disagree - the code is seeded with the default either way.
AMBIGUOUS = object()


def _record(codes, code, category):
    """Collapses one row's answer into the mapping, as `None`, a category, or `AMBIGUOUS`.

    Developed by Unknown: THE MEMORY SHAPE IS THE POINT. A million codes each holding a `set`
    of the categories seen is several hundred megabytes of set objects for information that is
    never read - only "how many distinct" is ever asked. Holding a single interned string, or
    one shared sentinel, keeps the mapping to its keys plus one pointer per code.
    """
    seen = codes.get(code, _MISSING)
    if seen is _MISSING or seen is None:
        codes[code] = category
    elif seen is not AMBIGUOUS and category is not None and category != seen:
        codes[code] = AMBIGUOUS


_MISSING = object()


def _cell(row, index):
    if index is None or index >= len(row):
        return None
    return row[index]


def _index_of(captions, accepted):
    for index, caption in enumerate(captions):
        if caption in accepted:
            return index
    return None
