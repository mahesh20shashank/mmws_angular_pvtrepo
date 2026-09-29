from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"
    verbose_name = "Accounts"

    def ready(self):
        # Register the drf-spectacular auth extension for this app's
        # FleetJWTAuthentication so Swagger emits `security: [jwtAuth]` on every
        # protected endpoint when accounts is the active authenticator.
        from . import schema  # noqa: F401
