"""Developed by Unknown: put the Ship Inventory placeholder photograph under MEDIA_ROOT.

`Spares.image` defaults to `obs/default.png` and `media/` is gitignored, so on a fresh checkout
that default named a file that had never existed. Every spare without a photograph - which is
every spare an import has ever created, until now - served a 404 from the detail page, and what
the operator saw was a broken image frame rather than a placeholder.

The placeholder itself is committed at `obs/assets/default.png`, inside the app package where
the gitignore does not reach. This command copies it out. It is idempotent and never overwrites,
so a ship that has replaced the placeholder with artwork of its own keeps it.
"""

import os

from django.conf import settings
from django.core.management.base import BaseCommand

from obs.utils import DEFAULT_SPARE_IMAGE_NAME, ensure_default_spare_image


class Command(BaseCommand):
    help = (
        "Copy the Ship Inventory default spare photograph into MEDIA_ROOT if it is not "
        "already there. Idempotent; never overwrites an existing file."
    )

    def handle(self, *args, **options):
        destination = os.path.join(
            settings.MEDIA_ROOT, *DEFAULT_SPARE_IMAGE_NAME.split("/")
        )
        if ensure_default_spare_image():
            self.stdout.write(self.style.SUCCESS(f"Wrote {destination}"))
        else:
            self.stdout.write(
                self.style.SUCCESS(f"Already present, left untouched: {destination}")
            )
