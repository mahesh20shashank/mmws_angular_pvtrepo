# Developed by Unknown: One command for everything a department/ship needs seeded before it
# can import a single spares workbook, run in the order that matters:
#
#   1. seed_equipment_class_defaults - the fixed spare classes, denominations and ship
#      authorities every department needs. No external files, near-instant.
#   2. seed_obs_media - the default spare photograph. No external files, near-instant.
#   3. seed_pattern_sources_of_truth - the real ILMS/WLMS pattern-number source-of-truth
#      tables, loaded from workbooks supplied out of band (see that command's own header
#      for what they must look like). This is the slow step - see "MAKING THIS FASTER"
#      below - and the only one that can be missing through no fault of this deployment,
#      so it is SKIPPED WITH A WARNING rather than failing the whole command when its
#      files aren't found. A department seeded without it can still import - every row
#      with a typed pattern number will just fail rule 2.7 until it is re-run for real.
#
# WHAT THIS DELIBERATELY DOES NOT RUN. `seed_obs_demo_patterns` and
# `seed_ship_inventory_dashboard` are both explicitly demonstration data (see their own
# headers) - a live ship's initialization should never seed invented item codes or made-up
# stores records, so neither is part of this command.
#
# MAKING THIS FASTER. Step 3 dominates the runtime - reading roughly 1.15M rows out of two
# xlsx workbooks and reloading two tables from scratch. Three things actually move that
# number, in order of effect:
#   - Run it ONCE per environment and re-run only when the source workbooks change. It is
#     already idempotent (truncate-and-reload), so a second run costs the same as the
#     first - there is no cheap incremental path, which is exactly why re-running it
#     unnecessarily is the single biggest waste available here.
#   - `--only ilms` / `--only wlms` when just one workbook has changed, to skip parsing and
#     reloading the side that hasn't - roughly halves the step for a one-sided refresh.
#   - `seed_pattern_sources_of_truth.BATCH_SIZE` (currently 5,000) trades round trips for
#     memory - raising it cuts `bulk_create` round trips further on a fast DB link, at the
#     cost of a larger parameter list per INSERT. Only worth touching if profiling shows
#     the DB writes, not the xlsx parse, are the bottleneck.
# Steps 1 and 2 are already effectively free (a handful of `get_or_create` calls and one
# file copy) - there is nothing to speed up there.
"""Runs every seed a department/ship needs before its first spares import."""

from pathlib import Path

from django.core.management import call_command
from django.core.management.base import BaseCommand

from .seed_pattern_sources_of_truth import (
    DEFAULT_SOURCE_DIR,
    ILMS_FILE_NAME,
    WLMS_FILE_NAME,
)


class Command(BaseCommand):
    help = (
        "Runs seed_equipment_class_defaults, seed_obs_media and "
        "seed_pattern_sources_of_truth, in that order - everything a department/ship "
        "needs before it can import a spares workbook. Idempotent - safe to re-run. "
        "The ILMS/WLMS step is skipped with a warning, not a failure, when its source "
        "workbooks aren't found, so the rest of initialization still completes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--source-dir",
            default=DEFAULT_SOURCE_DIR,
            help=(
                "Directory holding the ILMS/WLMS workbooks, passed through to "
                f"seed_pattern_sources_of_truth. Default {DEFAULT_SOURCE_DIR}."
            ),
        )
        parser.add_argument(
            "--ilms-file",
            default=None,
            help="Full path to the ILMS workbook, overriding --source-dir.",
        )
        parser.add_argument(
            "--wlms-file",
            default=None,
            help="Full path to the WLMS workbook, overriding --source-dir.",
        )
        parser.add_argument(
            "--skip-patterns",
            action="store_true",
            help=(
                "Skip seed_pattern_sources_of_truth entirely, even if the workbooks "
                "are found. Useful when only the fast department-scoped masters need "
                "a refresh."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Pass --dry-run through to every step that supports it. Writes nothing.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))

        self.stdout.write(self.style.MIGRATE_HEADING("[1/3] seed_equipment_class_defaults"))
        call_command("seed_equipment_class_defaults", dry_run=dry_run)

        self.stdout.write(self.style.MIGRATE_HEADING("[2/3] seed_obs_media"))
        if dry_run:
            self.stdout.write(
                "Dry run - seed_obs_media writes a file, not a row, so it has no dry-run "
                "mode. Skipped."
            )
        else:
            call_command("seed_obs_media")

        self.stdout.write(self.style.MIGRATE_HEADING("[3/3] seed_pattern_sources_of_truth"))
        if options.get("skip_patterns"):
            self.stdout.write(self.style.WARNING("--skip-patterns: not seeding ILMS/WLMS."))
            return

        source_dir = Path(options["source_dir"])
        ilms_path = Path(options["ilms_file"] or source_dir / ILMS_FILE_NAME)
        wlms_path = Path(options["wlms_file"] or source_dir / WLMS_FILE_NAME)
        if not ilms_path.is_file() or not wlms_path.is_file():
            self.stdout.write(
                self.style.WARNING(
                    "ILMS/WLMS workbooks not found "
                    f"(looked for {ilms_path} and {wlms_path}) - skipping "
                    "seed_pattern_sources_of_truth. Every row with a typed pattern "
                    "number will fail rule 2.7 until this is re-run with "
                    "--ilms-file/--wlms-file pointing at the real workbooks."
                )
            )
            return

        call_command(
            "seed_pattern_sources_of_truth",
            source_dir=str(source_dir),
            ilms_file=str(ilms_path),
            wlms_file=str(wlms_path),
            dry_run=dry_run,
        )
