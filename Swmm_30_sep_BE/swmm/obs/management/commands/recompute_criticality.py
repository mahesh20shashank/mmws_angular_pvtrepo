from django.core.management.base import BaseCommand
from django.utils import timezone

from obs.models import Spares


class Command(BaseCommand):
    help = (
        "Backfills Spares.criticality_strength/critical from existing Issue history. "
        "Run once after the criticality_strength migration so issues recorded before "
        "the engine existed are reflected; safe to re-run at any time (it only ever "
        "raises the tier, never lowers it)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--year",
            type=int,
            default=None,
            help="Calendar year to count issues in (defaults to the current year).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )

    def handle(self, *args, **options):
        year = options["year"] or timezone.localdate().year
        dry_run = options["dry_run"]

        raised = 0
        for spare in Spares.objects.all():
            before = spare.criticality_strength
            if dry_run:
                count = spare.consumption_issue_count(year=year)
                computed = spare.NOT_CRITICAL
                for tier, minimum in spare.CRITICALITY_THRESHOLDS:
                    if count >= minimum:
                        computed = tier
                        break
                after = (
                    computed
                    if spare.CRITICALITY_ORDER[computed]
                    > spare.CRITICALITY_ORDER.get(before, 0)
                    else before
                )
            else:
                after = spare.apply_criticality_from_issue_history(year=year)

            if after != before:
                raised += 1
                self.stdout.write(
                    f"{spare.pattern_number or spare.pk}: "
                    f"{before or '(none)'} -> {after}"
                )

        verb = "Would raise" if dry_run else "Raised"
        self.stdout.write(
            self.style.SUCCESS(f"{verb} criticality on {raised} spare(s).")
        )
