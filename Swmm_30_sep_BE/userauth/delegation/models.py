"""Time-boxed role delegation.

Origin: ITTTM transfer_rights/models.py. `RightsTransfer` moves a delegator's
active (role, process) mappings to a delegatee for a bounded window;
`RightsTransferLog` is the append-only history. Lifecycle
(PENDING -> ACTIVE -> REDUCED/COMPLETED) is driven by
`delegation.tasks.manage_rights_lifecycle` (Celery beat every 60s, or the
`run_delegation_lifecycle` management command).

Enforcement note (build prompt criterion 9): the delegated-roles JWT claim is
for the SPA only. Every request re-derives ACTIVE delegated roles from these
rows -- a REVOKED/COMPLETED transfer drops the delegated menu permissions on
the next call even if the old token still lists them.
"""

from django.conf import settings
from django.db import models

USER = settings.AUTH_USER_MODEL


class RightsTransfer(models.Model):
    STATUS_PENDING = "PENDING"
    STATUS_ACTIVE = "ACTIVE"
    STATUS_EXTENDED = "EXTENDED"
    STATUS_REDUCED = "REDUCED"
    STATUS_COMPLETED = "COMPLETED"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending activation"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_EXTENDED, "Extended"),
        (STATUS_REDUCED, "Reduced / revoked"),
        (STATUS_COMPLETED, "Completed"),
    )
    # Statuses at which delegated rights are live.
    LIVE_STATUSES = (STATUS_ACTIVE, STATUS_EXTENDED)
    # Terminal statuses -- no further transitions.
    TERMINAL_STATUSES = (STATUS_REDUCED, STATUS_COMPLETED)

    TRANSFER_IMMEDIATE = "IMMEDIATE"
    TRANSFER_SCHEDULED = "SCHEDULED"
    TRANSFER_TYPE_CHOICES = (
        (TRANSFER_IMMEDIATE, "Immediate"),
        (TRANSFER_SCHEDULED, "Scheduled"),
    )

    delegator = models.ForeignKey(
        USER, on_delete=models.CASCADE, related_name="rights_delegated_by"
    )
    delegatee = models.ForeignKey(
        USER, on_delete=models.CASCADE, related_name="rights_delegated_to"
    )

    transfer_type = models.CharField(
        max_length=20, choices=TRANSFER_TYPE_CHOICES, default=TRANSFER_IMMEDIATE
    )
    start_date_time = models.DateTimeField()
    end_date_time = models.DateTimeField(
        help_text="Current effective end time (updated on extend/reduce)."
    )
    actual_retrieved_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True
    )
    reason = models.TextField(blank=True, default="")

    created_on = models.DateTimeField(auto_now_add=True)
    modified_on = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        USER,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rights_transfers_created",
    )

    class Meta:
        db_table = "delegation_rights_transfer"
        ordering = ("-created_on", "-id")
        indexes = [
            models.Index(fields=["delegatee", "status"]),
            models.Index(fields=["delegator", "status"]),
            models.Index(fields=["status", "end_date_time"]),
        ]

    def __str__(self):
        return (
            f"Transfer #{self.pk}: {self.delegator} -> {self.delegatee} "
            f"[{self.status}]"
        )

    @property
    def is_live(self):
        return self.status in self.LIVE_STATUSES


class RightsTransferLog(models.Model):
    ACTION_CHOICES = (
        ("INITIATED", "Transfer initiated"),
        ("ACTIVATED", "Transfer activated"),
        ("EXTENDED", "Duration extended"),
        ("REDUCED", "Duration / scope reduced"),
        ("REVOKED", "Manually revoked"),
        ("COMPLETED", "Auto completed / expired"),
    )

    transfer = models.ForeignKey(
        RightsTransfer, on_delete=models.CASCADE, related_name="logs"
    )
    action_type = models.CharField(max_length=30, choices=ACTION_CHOICES, db_index=True)
    previous_status = models.CharField(max_length=30, blank=True, default="")
    new_status = models.CharField(max_length=30)
    previous_end_date_time = models.DateTimeField(null=True, blank=True)
    new_end_date_time = models.DateTimeField(null=True, blank=True)
    performed_by = models.ForeignKey(
        USER,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rights_transfer_actions",
    )
    performed_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "delegation_rights_transfer_log"
        ordering = ("-performed_at", "-id")

    def __str__(self):
        return f"Log #{self.pk}: transfer {self.transfer_id} {self.action_type}"
