from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self):
        # Register the connection_created hook that creates this service's
        # Postgres schema before any DDL runs. Imported here so the receiver is
        # connected during django.setup(), ahead of the first DB connection.
        from authz_service import db  # noqa: F401
