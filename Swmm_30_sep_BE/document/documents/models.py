import uuid

from django.db import models


class SourceSystem(models.TextChoices):
    SWMM = "swmm", "SWMM"
    ITTM = "itttm", "ITTTM"


class ServiceClient(models.Model):
    name = models.CharField(max_length=100, unique=True)
    client_key = models.CharField(max_length=64, unique=True)
    secret = models.CharField(max_length=128)
    source_system = models.CharField(
        max_length=10,
        choices=SourceSystem.choices,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "service_client"

    def __str__(self):
        return self.name


class FileObject(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    original_name = models.CharField(max_length=255)
    stored_path = models.CharField(max_length=500)
    size = models.BigIntegerField()
    mime_type = models.CharField(max_length=150, blank=True)
    checksum = models.CharField(max_length=64, blank=True)

    source_system = models.CharField(
        max_length=10,
        choices=SourceSystem.choices,
    )

    uploaded_by_user_id = models.CharField(
        max_length=64,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "file_object"

    def __str__(self):
        return self.original_name


class Document(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    file = models.OneToOneField(
        FileObject,
        on_delete=models.CASCADE,
        related_name="document",
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=100, blank=True)
    tags = models.JSONField(default=list, blank=True)
    expiry_date = models.DateField(
        null=True,
        blank=True,
    )

    source_system = models.CharField(
        max_length=10,
        choices=SourceSystem.choices,
    )

    reference_type = models.CharField(
        max_length=100,
        blank=True,
    )

    reference_id = models.CharField(
        max_length=100,
        blank=True,
    )

    is_global = models.BooleanField(default=False)

    department_id = models.CharField(
        max_length=64,
        blank=True,
    )

    ship_or_unit_id = models.CharField(
        max_length=64,
        blank=True,
    )

    shared_with_user_ids = models.JSONField(
        default=list,
        blank=True,
    )

    created_by_user_id = models.CharField(
        max_length=64,
        blank=True,
    )

    is_deleted = models.BooleanField(default=False)

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    class Meta:
        db_table = "document"

        indexes = [
            models.Index(
                fields=[
                    "source_system",
                    "reference_type",
                    "reference_id",
                ]
            ),
            models.Index(
                fields=["expiry_date"]
            ),
        ]

    def __str__(self):
        return self.title