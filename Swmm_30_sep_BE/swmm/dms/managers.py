"""Managers and querysets for the dms app."""

from django.db import models
from accounts import rbac


def user_profile(user):
    return getattr(user, "user_profile", None)


def user_department_id(user):
    profile = user_profile(user)
    return getattr(profile, "department_id", None)


class CertificateQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related(
            "uploaded_by",
            "linked_equipment",
            "linked_department",
            "linked_ship",
            "linked_command",
        )

    def filter_view(self, *, certificate_type=None, is_shared=None):
        queryset = self
        if certificate_type:
            queryset = queryset.filter(certificate_type=certificate_type)
        if is_shared is not None:
            queryset = queryset.filter(is_shared=is_shared.lower() == "true")
        return queryset

    def for_user(self, user):
        """Scope to certificates the user owns within their own department,
        matching the reference app's `user_department` + `uploaded_by` filter.
        Privileged users (administrators/superusers) bypass both the owner
        and department restriction and see every certificate.
        """
        if rbac.can_see_all_departments(user):
            return self
        profile = user_profile(user)
        department_id = user_department_id(user)
        if not profile:
            return self.none()
        return self.filter(
            user_department=str(department_id) if department_id else None,
            uploaded_by=profile,
        )


class EquipmentCategoryQuerySet(models.QuerySet):
    def with_creator(self):
        return self.select_related("created_by")


class EquipmentDocumentQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related("created_by", "equipment")

    def filter_view(self, *, equipment_id=None, document_type=None):
        queryset = self
        if equipment_id:
            queryset = queryset.filter(equipment_id=equipment_id)
        if document_type:
            queryset = queryset.filter(document_type=document_type)
        return queryset


__all__ = [
    "CertificateQuerySet",
    "EquipmentCategoryQuerySet",
    "EquipmentDocumentQuerySet",
]
