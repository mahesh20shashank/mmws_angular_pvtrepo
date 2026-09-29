"""
Management command to fix DARTs with missing rectification_date.
Sets rectification_date = closing_date if rectification_date is NULL.
"""

from django.core.management.base import BaseCommand
from op_maintenance.models import InitiateDart


class Command(BaseCommand):
    help = "Fix DARTs with missing rectification_date by using closing_date"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be changed without actually changing it",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        # Find all open DARTs with missing rectification_date
        missing_darts = InitiateDart.objects.filter(
            is_closed=False,
            rectification_date__isnull=True,
        )

        count = missing_darts.count()

        if count == 0:
            self.stdout.write(
                self.style.SUCCESS("✓ No DARTs with missing rectification_date found!")
            )
            return

        self.stdout.write(
            self.style.WARNING(f"Found {count} DARTs with missing rectification_date")
        )

        # Update each DART
        updated = []
        for dart in missing_darts:
            if dart.closing_date:
                if dry_run:
                    self.stdout.write(
                        f"  [{dart.dart_number}] Would set rectification_date to {dart.closing_date}"
                    )
                else:
                    dart.rectification_date = dart.closing_date
                    dart.save(update_fields=["rectification_date"])
                    updated.append(dart.dart_number)

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(f"\n(Dry run) Would update {len(updated)} DARTs")
            )
        else:
            self.stdout.write(self.style.SUCCESS(f"\n✓ Updated {len(updated)} DARTs:"))
            for dart_number in updated:
                self.stdout.write(f"  ✓ {dart_number}")

        # Check for DARTs with no closing_date either
        no_dates = InitiateDart.objects.filter(
            is_closed=False,
            rectification_date__isnull=True,
            closing_date__isnull=True,
        )

        if no_dates.count() > 0:
            self.stdout.write(
                self.style.WARNING(
                    f"\n⚠ {no_dates.count()} DARTs have neither rectification_date nor closing_date:"
                )
            )
            for dart in no_dates:
                self.stdout.write(
                    f"  ⚠ {dart.dart_number} (Defect Date: {dart.dart_date})"
                )
            self.stdout.write(
                "  → Please set a closing/rectification date for these DARTs"
            )
