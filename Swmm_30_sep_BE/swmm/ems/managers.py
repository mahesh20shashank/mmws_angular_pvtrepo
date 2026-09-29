"""Managers and querysets for the ems app."""

from django.db import models
from django.db.models import Exists, OuterRef, Q
from accounts import rbac


class SectionNameQuerySet(models.QuerySet):
    def ordered_by_name(self):
        return self.order_by("name")

    def for_department(self, department):
        return self.filter(department=department)

    def for_department_id(self, department_id):
        return self.filter(department_id=department_id)


class EquipmentNameManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().defer("universal_id_t_equipment_ship_detail")


class EquipmentNameQuerySet(models.QuerySet):
    def with_section(self):
        return self.select_related("section")

    def with_section_and_sub_department(self):
        return self.select_related("section", "sub_department")

    def ordered_by_name(self):
        return self.order_by("name")

    def ordered_by_id(self):
        return self.order_by("id")

    def for_section(self, section_id):
        return self.filter(section_id=section_id)

    def for_department(self, department):
        return self.filter(section__department=department)

    def for_department_id(self, department_id):
        return self.filter(section__department_id=department_id)

    def with_rhsi(self):
        return self.filter(rhsi__isnull=False)

    def srar_only(self):
        return self.filter(sfd_equipment__is_srar=True)

    def status_sections(self, section_codes):
        return self.with_section().filter(
            section__name__in=section_codes,
            rhsi__isnull=False,
        )


class PlannedRoutineDescriptionQuerySet(models.QuerySet):
    def active_items(self):
        return self.filter(is_deleted=False)

    def routine_description_ids(self):
        return self.active_items().values_list("routine_description_id_id", flat=True)

    def add_routine_ids(self):
        return (
            self.active_items()
            .values_list(
                "routine_description_id__add_routine_details_id",
                flat=True,
            )
            .distinct()
        )


class AddRoutineDetailsQuerySet(models.QuerySet):
    def with_refit_relations(self):
        return self.select_related(
            "equipment_name",
            "equipment_name__section",
            "equipment_name__section__department",
            "routine_name",
        )

    def for_department(self, department):
        if not department:
            return self
        return self.filter(equipment_name__section__department=department)

    def refit_candidates(self):
        refit_filter = (
            Q(routine_category="ALTERNATE PERIODIC")
            | Q(routine_name__name__icontains="SHORT REFIT")
            | Q(routine_name__name__icontains="NORMAL REFIT")
            | Q(routine_name__name__icontains="MAJOR REFIT")
        )
        return self.filter(refit_filter).distinct()

    def refit_dashboard_for_user(self, user):
        department = (
            None if rbac.can_see_all_departments(user) else rbac.department_of(user)
        )
        return self.with_refit_relations().for_department(department).refit_candidates()

    def available_for_refit_conversion(self, user):
        planned_description_ids = (
            self.model._meta.apps.get_model(
                "ems",
                "PlannedRoutineDescription",
            )
            .objects.active_items()
            .values("routine_description_id")
        )
        routine_description_model = self.model._meta.apps.get_model(
            "ems",
            "RoutineDescription",
        )
        available_descriptions = routine_description_model.objects.filter(
            equipment_name=OuterRef("equipment_name"),
            routine_name=OuterRef("routine_name"),
        ).exclude(id__in=planned_description_ids)
        return (
            self.refit_dashboard_for_user(user)
            .annotate(
                has_available_description=Exists(available_descriptions),
            )
            .filter(has_available_description=True)
        )

    def with_dashboard_relations(self):
        return self.select_related(
            "equipment_name",
            "equipment_name__section",
            "equipment_name__sub_department",
            "routine_name",
        )

    def exclude_planned(self):
        planned_ids = self.model._meta.apps.get_model(
            "ems",
            "PlannedRoutineDescription",
        ).objects.add_routine_ids()
        return self.exclude(id__in=planned_ids)

    def planned_only(self):
        planned_ids = self.model._meta.apps.get_model(
            "ems",
            "PlannedRoutineDescription",
        ).objects.add_routine_ids()
        return self.filter(id__in=planned_ids)

    def filter_master_request(
        self,
        *,
        section_id=None,
        equipment_name_id=None,
        routine_category=None,
        routine_name=None,
    ):
        queryset = self
        if section_id and str(section_id) != "0":
            queryset = queryset.filter(equipment_name__section_id=section_id)
        if equipment_name_id and str(equipment_name_id) != "0":
            queryset = queryset.filter(equipment_name_id=equipment_name_id)
        if routine_category and str(routine_category) != "0":
            queryset = queryset.filter(routine_category=routine_category)
        if routine_name:
            queryset = queryset.filter(frequency__icontains=routine_name)
        return queryset

    def for_equipment_and_category(self, equipment_name_id, routine_category):
        return self.filter(
            equipment_name=equipment_name_id,
            routine_category=routine_category,
        )


class RoutineDescriptionQuerySet(models.QuerySet):
    def open_items(self):
        return self.filter(is_close=False)

    def overdue(self, as_of):
        return self.open_items().filter(due_date__lt=as_of)

    def for_add_routine(self, add_routine):
        return self.filter(add_routine_details=add_routine)

    def for_add_routine_id(self, add_routine_id):
        return self.filter(add_routine_details=add_routine_id)

    def active_for_add_routine(self, add_routine):
        return self.open_items().for_add_routine(add_routine)

    def excluding_planned(self):
        planned_ids = self.model._meta.apps.get_model(
            "ems",
            "PlannedRoutineDescription",
        ).objects.routine_description_ids()
        return self.exclude(id__in=planned_ids)

    def non_fuss_non_draft(self):
        return self.exclude(is_fuss=True).exclude(is_ra_draft=True)

    def for_routine_and_equipment(self, routine_name, equipment_name):
        return self.filter(
            routine_name=routine_name,
            equipment_name=equipment_name,
        )

    def dyd(self):
        return self.filter(by_whom="DYD")
