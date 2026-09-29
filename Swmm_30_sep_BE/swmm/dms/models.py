from datetime import date, datetime
from master.models import Base

from accounts.models import CustomUserProfile
from django.db import models
from django.utils import timezone

from .managers import (
    CertificateQuerySet,
    EquipmentCategoryQuerySet,
    EquipmentDocumentQuerySet,
)


class Certificate(Base):
    objects = CertificateQuerySet.as_manager()

    CERTIFICATE_TYPES = [
        ("technical", "Technical"),
        ("other", "Other"),
        ("correspondence", "Correspondence"),
        ("sharepoint", "Sharepoint"),
    ]

    name = models.CharField(max_length=255, null=True, blank=True)
    certificate_type = models.CharField(max_length=20, choices=CERTIFICATE_TYPES)
    certificate_subtype = models.CharField(max_length=255, null=True, blank=True)
    certificate_id = models.CharField(max_length=255, null=True, blank=True)
    issue_date = models.DateField(auto_now_add=True)
    expiry_date = models.DateField(null=True, blank=True)
    place_of_issue = models.CharField(max_length=255, null=True, blank=True)
    remarks = models.TextField(blank=True, null=True)
    letter_description = models.TextField(blank=True, null=True)
    letter_received_on = models.DateField(null=True, blank=True)
    letter_date = models.DateField(null=True, blank=True)
    letter_ref_no = models.CharField(max_length=255, null=True, blank=True)
    recieved_from_unit = models.CharField(max_length=255, null=True, blank=True)
    replied = models.CharField(max_length=255, null=True, blank=True)
    addressed_to_unit = models.CharField(max_length=255, null=True, blank=True)
    attachment = models.FileField(
        upload_to="certificates/",
        blank=True,
        null=True,
    )
    category = models.CharField(max_length=255, null=True, blank=True)
    equipment = models.CharField(max_length=255, null=True, blank=True)
    equipment_id = models.CharField(max_length=255, null=True, blank=True)
    user_department = models.CharField(max_length=255, null=True, blank=True)
    filenumber = models.CharField(max_length=255, null=True, blank=True)
    ship = models.CharField(max_length=255, null=True, blank=True)
    command = models.CharField(max_length=255, null=True, blank=True)
    linked_equipment = models.ForeignKey(
        "sfd.ShipEquipment",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="dms_certificates",
    )
    linked_department = models.ForeignKey(
        "master.Department",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="dms_certificates",
    )
    linked_ship = models.ForeignKey(
        "master.Ship",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="dms_certificates",
    )
    linked_command = models.ForeignKey(
        "master.MShipCommand",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="dms_certificates",
    )
    outmail_category = models.CharField(max_length=255, null=True, blank=True)
    is_shared = models.BooleanField(default=False)
    shared_with = models.ManyToManyField(
        CustomUserProfile,
        blank=True,
        related_name="shared_certificates",
    )
    uploaded_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    shared_on = models.DateField(null=True, blank=True)

    @property
    def is_valid(self):
        expiry_date = self.expiry_date
        if isinstance(expiry_date, str):
            try:
                expiry_date = date.fromisoformat(expiry_date)
            except ValueError:
                return False
        return bool(expiry_date and expiry_date >= date.today())

    def format_date(self, value):
        if not value:
            return None
        if isinstance(value, (date, datetime)):
            return value.strftime("%d %b %Y")
        return str(value)

    def __str__(self):
        return f"{self.name} ({self.certificate_type})"


class CategoryName(Base):
    id = models.AutoField(primary_key=True)
    category_name = models.CharField(max_length=255)
    is_system = models.BooleanField(default=False)
    date = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.category_name

    class Meta:
        db_table = "dms_category_name"


class EquipmentCategory(Base):
    objects = EquipmentCategoryQuerySet.as_manager()

    equipment_name = models.CharField(max_length=255, unique=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dms_equipment_category"
        ordering = ["equipment_name"]
        verbose_name = "Equipment Category"
        verbose_name_plural = "Equipment Categories"

    def __str__(self):
        return self.equipment_name


class EquipmentDocument(Base):
    objects = EquipmentDocumentQuerySet.as_manager()

    DOCUMENT_TYPE_CHOICES = [
        ("TDOI", "TDOI"),
        ("TD", "TD"),
        ("OI", "OI"),
        ("Other", "Other"),
    ]

    equipment = models.ForeignKey(
        EquipmentCategory,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    document_name = models.CharField(max_length=255)
    document_type = models.CharField(max_length=100)
    attachment = models.FileField(
        upload_to="equipment_documents/%Y/%m/",
        null=True,
        blank=True,
    )
    uploaded_date = models.DateField(auto_now_add=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dms_equipment_document"
        ordering = ["-uploaded_date"]
        verbose_name = "Equipment Document"
        verbose_name_plural = "Equipment Documents"

    def get_attachment_url(self):
        if self.attachment:
            return self.attachment.url
        return None

    def __str__(self):
        return f"{self.document_name} - {self.equipment.equipment_name}"
