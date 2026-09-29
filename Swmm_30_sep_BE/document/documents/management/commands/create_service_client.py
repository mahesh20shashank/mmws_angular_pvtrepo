import secrets

from django.core.management.base import BaseCommand, CommandError

from documents.models import ServiceClient, SourceSystem


class Command(BaseCommand):
    help = (
        "Register a backend allowed to call this service (e.g. the SWMM "
        "monolith, or an ITTTM service), printing its client key/secret "
        "once. Store these in the calling backend's env - the secret is "
        "not recoverable afterwards."
    )

    def add_arguments(self, parser):
        parser.add_argument("name", help="Unique name, e.g. swmm-backend")
        parser.add_argument(
            "source_system", choices=[c.value for c in SourceSystem]
        )

    def handle(self, *args, **options):
        name = options["name"]
        if ServiceClient.objects.filter(name=name).exists():
            raise CommandError(f"ServiceClient '{name}' already exists.")

        client_key = secrets.token_hex(16)
        secret = secrets.token_urlsafe(48)

        ServiceClient.objects.create(
            name=name,
            client_key=client_key,
            secret=secret,
            source_system=options["source_system"],
        )

        self.stdout.write(self.style.SUCCESS(f"Created service client '{name}'"))
        self.stdout.write(f"X-Service-Key: {client_key}")
        self.stdout.write(f"secret:        {secret}")
        self.stdout.write(
            self.style.WARNING(
                "Store the secret in the calling backend's config now - it "
                "will not be shown again."
            )
        )
