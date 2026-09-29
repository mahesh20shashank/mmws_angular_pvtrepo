"""Run the delegation lifecycle sweep once (no Celery required).

    python manage.py run_delegation_lifecycle
"""

from django.core.management.base import BaseCommand

from delegation.lifecycle import run_lifecycle


class Command(BaseCommand):
    help = "Activate due / complete expired RightsTransfer rows."

    def handle(self, *args, **options):
        result = run_lifecycle()
        self.stdout.write(
            self.style.SUCCESS(
                f"activated={result['activated']} completed={result['completed']}"
            )
        )
