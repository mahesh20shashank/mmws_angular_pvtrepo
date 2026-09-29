from django.utils import timezone
from rest_framework import serializers

from .models import (
    CategoryName,
    Certificate,
    EquipmentCategory,
    EquipmentDocument,
)


class CertificateSerializer(serializers.ModelSerializer):
    expired = serializers.SerializerMethodField()
    expiring_soon = serializers.SerializerMethodField()
    expiring_very_soon = serializers.SerializerMethodField()
    expiring_urgent = serializers.SerializerMethodField()

    class Meta:
        model = Certificate
        fields = (
            "id",
            "name",
            "certificate_type",
            "certificate_subtype",
            "certificate_id",
            "issue_date",
            "expiry_date",
            "place_of_issue",
            "remarks",
            "letter_description",
            "letter_received_on",
            "letter_date",
            "letter_ref_no",
            "recieved_from_unit",
            "replied",
            "addressed_to_unit",
            "attachment",
            "category",
            "equipment",
            "equipment_id",
            "user_department",
            "filenumber",
            "ship",
            "command",
            "linked_equipment",
            "linked_department",
            "linked_ship",
            "linked_command",
            "outmail_category",
            "is_shared",
            "shared_with",
            "uploaded_by",
            "shared_on",
            "expired",
            "expiring_soon",
            "expiring_very_soon",
            "expiring_urgent",
        )
        read_only_fields = ("issue_date",)

    def _days_until_expiry(self, certificate):
        if not certificate.expiry_date:
            return None
        return (certificate.expiry_date - timezone.localdate()).days

    def get_expired(self, certificate):
        days = self._days_until_expiry(certificate)
        return days is not None and days < 0

    def get_expiring_soon(self, certificate):
        days = self._days_until_expiry(certificate)
        return days is not None and days <= 180

    def get_expiring_very_soon(self, certificate):
        days = self._days_until_expiry(certificate)
        return days is not None and days <= 90

    def get_expiring_urgent(self, certificate):
        days = self._days_until_expiry(certificate)
        return days is not None and days <= 30


class CategoryNameSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoryName
        fields = ("id", "category_name", "is_system", "date")
        read_only_fields = ("date",)


class EquipmentCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentCategory
        fields = (
            "id",
            "equipment_name",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")


class EquipmentDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentDocument
        fields = (
            "id",
            "equipment",
            "document_name",
            "document_type",
            "attachment",
            "uploaded_date",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("uploaded_date", "created_at", "updated_at")
