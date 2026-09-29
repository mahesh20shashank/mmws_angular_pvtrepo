# ruff: noqa: RUF012
import logging
import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4
from rest_framework.permissions import AllowAny
import json
import requests
from django.http import HttpResponse
from document.service import DocumentService

import django_filters
from django.core.validators import RegexValidator
from django.db import transaction
from django.db.models import Count, Model, Q
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from rest_framework.views import APIView

from master.models import Department, Ship, SubDepartment
from master.utils import get_this_ship
from accounts import rbac
from accounts.models import CustomUserProfile

from .models import (
    ChangeEquipmentRequest,
    CompartmentMaster,
    Equipment,
    EquipmentCompartmentMapping,
    EquipmentType,
    RemoveEquipment,
    ReportExportJob,
    ShipEquipment,
    Supplier,
)
from .utils import get_mssql_connection, get_user_info, resolve_cmms_department

logger = logging.getLogger(__name__)

SUB_DEPARTMENT_NAME_RE = re.compile(r"^[A-Za-z0-9 _/-]+$")
SERIAL_NO_RE_VALIDATOR = RegexValidator(
    r"^[A-Za-z0-9 ,.\-/]+$",
    "Serial number may only contain letters, numbers, spaces, commas, "
    "periods, hyphens and slashes.",
)


def _active_ship():
    return (
        get_this_ship() or Ship.objects.filter(active=1).first() or Ship.objects.first()
    )


def _ship_equipment_queryset():
    ship = _active_ship()
    if not ship:
        return ShipEquipment.objects.none()
    return ShipEquipment.objects.filter(ship_id=ship.id)


def _uid(prefix):
    return f"{prefix}-{uuid4().hex}"


def _to_int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _deck_label(value, label):
    if value.startswith("deck"):
        return value.removeprefix("deck")
    return label


class FrontendPageNumberPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100
    alternate_page_size_query_params = ("limit", "entries_per_page")

    def get_page_size(self, request):
        page_size = super().get_page_size(request)
        if page_size is not None:
            return page_size

        for query_param in self.alternate_page_size_query_params:
            value = request.query_params.get(query_param)
            if value is None:
                continue
            try:
                page_size = int(value)
            except (TypeError, ValueError):
                return self.page_size
            return min(page_size, self.max_page_size)

        return self.page_size


def _paginated_response(request, rows):
    paginator = FrontendPageNumberPagination()
    page = paginator.paginate_queryset(list(rows), request)
    return paginator.get_paginated_response(page)


ACTIVITY_PERIOD_DAYS = {
    "today": 1,
    "week": 7,
    "month": 30,
    "quarter": 90,
    "year": 365,
}


def _build_activity_row(item, today):
    activity_date = item.updated_at or item.created_at
    activity_day = activity_date.date() if activity_date else today
    action = "Added"
    if item.updated_at and item.created_at and item.updated_at > item.created_at:
        action = "Updated"
    return {
        "d": max((today - activity_day).days, 0),
        "date": activity_day.strftime("%d %b %Y"),
        "equip": item.equipment_name
        or item.new_equipment_name
        or getattr(item.equipment, "equipment_code", None)
        or "Equipment",
        "action": action,
        "dept": getattr(item.department, "name", None) or "Unassigned",
        "ship": getattr(item.ship, "name", None) or "Ship",
        "status": "Verified" if item.active else "In Progress",
    }


def _fk_id(obj, field_name):
    return getattr(obj, f"{field_name}_id", None)


def _sql_date(value):
    """A plain `datetime.date` (as opposed to `datetime.datetime`) — e.g. any DateField straight
    off a model instance — fails to bind at all against CMMS's legacy "SQL Server" ODBC driver
    (`pyodbc.Error: HYC00 Optional feature not implemented (SQLBindParameter)`, confirmed live:
    the driver only implements SQL_TYPE_TIMESTAMP binding, not SQL_TYPE_DATE). Combine it to
    midnight so it binds as a full datetime instead; `None`/already-`datetime` values pass through
    unchanged. Use this on every DateField value handed to a raw CMMS cursor.execute(...) call."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return datetime.combine(value, datetime.min.time())
    return value


def _first_value(*values):
    for value in values:
        if value not in (None, ""):
            return value
    return None


def _supplier_display(obj):
    if not obj:
        return None
    return _first_value(
        getattr(obj, "supplier_name", None),
        getattr(obj, "SupplierName", None),
    )


def _equipment_display(obj):
    if not obj:
        return None
    return _first_value(
        getattr(obj, "equipment_class", None),
        getattr(obj, "equipment_name", None),
        getattr(obj, "ilms_eq_code", None),
        getattr(obj, "equipment_code", None),
    )


def _sub_department_name(obj):
    return _first_value(
        getattr(getattr(obj, "sub_department_f_key", None), "name", None),
        getattr(obj, "universal_id_m_sub_department", None),
    )


def _department_name(obj, dept_map):
    """dept_map only resolves rows whose own universal_id_m_department is set — some equipment
    (e.g. added through the CAT I/III forms rather than a CMMS sync) never gets that field filled
    in, even though its Sub Department was picked and that Sub Department already belongs to a
    Department. Falling back through sub_department_f_key.department_name covers exactly that
    case instead of just showing blank."""
    direct = dept_map.get(getattr(obj, "universal_id_m_department", None))
    if direct:
        return direct
    sub_dept = getattr(obj, "sub_department_f_key", None)
    return getattr(getattr(sub_dept, "department_name", None), "name", None) or ""


def _status_label(value):
    status_map = {
        1: "approved",
        2: "Pending",
        3: "Rejected",
        "1": "approved",
        "2": "Pending",
        "3": "Rejected",
    }
    return status_map.get(value, str(value) if value is not None else "")


def equipment_label(equipment_name, location_on_board):
    return f"{equipment_name} - {location_on_board or ''}".strip(" -")


def _resolve_date_filter(date_filter_value, date_field="created_at"):
    if not date_filter_value:
        return Q()
    now = timezone.now()
    clean_val = date_filter_value.lower().replace(" ", "_")
    if clean_val == "last_30_days":
        return Q(**{f"{date_field}__gte": now - timedelta(days=30)})
    if clean_val == "last_90_days":
        return Q(**{f"{date_field}__gte": now - timedelta(days=90)})
    if clean_val == "this_year":
        return Q(**{f"{date_field}__year": now.year})
    if clean_val == "last_year":
        return Q(**{f"{date_field}__year": now.year - 1})
    return Q()


def _filter_by_department(queryset, query_params):
    department_id = query_params.get("department") or query_params.get("department_id")
    if not department_id:
        return queryset
    try:
        department_id = int(department_id)
    except (TypeError, ValueError):
        return queryset.none()
    if not Department.objects.filter(id=department_id).exists():
        return queryset.none()
    return queryset.filter(department_id=department_id)


def _user_display_name(user):
    if not user:
        return "Unknown User"
    profile = getattr(user, "user_profile", None)
    rank_name = getattr(getattr(profile, "rank", None), "name", None) or "Captain"
    first = getattr(profile, "firstname", None) or "Yogesh"
    last = getattr(profile, "lastname", None) or "Chauhan"
    return f"{rank_name} {first} {last}"


class MessageModelViewSet(viewsets.ModelViewSet):
    pagination_class = FrontendPageNumberPagination
    create_message = "Record created successfully."
    update_message = "Record updated successfully."
    delete_message = "Record deleted successfully."

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(
            {"message": self.create_message, "data": serializer.data},
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response({"message": self.update_message, "data": serializer.data})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if hasattr(instance, "is_deleted"):
            instance.is_deleted = True
            instance.save(update_fields=["is_deleted"])
        else:
            instance.delete()
        return Response({"message": self.delete_message})


class CompartmentSerializer(serializers.ModelSerializer):
    location_value = serializers.CharField(source="location", read_only=True)
    location_label = serializers.CharField(
        source="get_location_display", read_only=True
    )
    upper_deck_label = serializers.CharField(
        source="get_upper_deck_display", read_only=True
    )
    lower_deck_label = serializers.CharField(
        source="get_lower_deck_display", read_only=True
    )
    deck_no = serializers.SerializerMethodField()
    frame_station = serializers.SerializerMethodField()

    class Meta:
        model = CompartmentMaster
        fields = [
            "id",
            "name",
            "main_deck",
            "upper_deck",
            "upper_deck_label",
            "lower_deck",
            "lower_deck_label",
            "deck_no",
            "frame_station_from",
            "frame_station_to",
            "frame_station",
            "location",
            "location_value",
            "location_label",
        ]
        read_only_fields = ["id"]

    def get_deck_no(self, obj):
        if obj.main_deck:
            return "Main Deck"
        return obj.get_upper_deck_display() or obj.get_lower_deck_display() or ""

    def get_frame_station(self, obj):
        if obj.frame_station_from is None or obj.frame_station_to is None:
            return ""
        if obj.frame_station_from == obj.frame_station_to:
            return str(obj.frame_station_from)
        return f"{obj.frame_station_from} - {obj.frame_station_to}"

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", None))
        self._validate_unique_name(name)

        frame_from = attrs.get(
            "frame_station_from", getattr(self.instance, "frame_station_from", None)
        )
        frame_to = attrs.get(
            "frame_station_to", getattr(self.instance, "frame_station_to", None)
        )
        if frame_from is not None and frame_to is not None and frame_from > frame_to:
            raise serializers.ValidationError(
                "Frame station from cannot be greater than frame station to."
            )
        return attrs

    def validate_name(self, value):
        name = value.strip() if value else ""
        if not name:
            raise serializers.ValidationError("Compartment name is required.")
        return name

    def _validate_unique_name(self, name):
        queryset = CompartmentMaster.objects.filter(is_deleted=False, name__iexact=name)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                {"name": "Compartment with this name already exists."}
            )


def _choice_filter_values(choices, raw_value):
    value = str(raw_value or "").strip()
    if not value:
        return []

    matches = []
    value_lower = value.lower()
    for choice_value, choice_label in choices:
        choice_value = str(choice_value)
        choice_label = str(choice_label)
        if value_lower in {choice_value.lower(), choice_label.lower()}:
            matches.append(choice_value)

    return matches or [value]


class CompartmentFilter(django_filters.FilterSet):
    main_deck = django_filters.BooleanFilter(field_name="main_deck")
    upper_deck = django_filters.CharFilter(method="filter_upper_deck")
    lower_deck = django_filters.CharFilter(method="filter_lower_deck")
    location = django_filters.CharFilter(method="filter_location")
    frame_station = django_filters.NumberFilter(method="filter_frame_station")

    class Meta:
        model = CompartmentMaster
        fields = ["main_deck", "upper_deck", "lower_deck", "location", "frame_station"]

    def filter_frame_station(self, queryset, name, value):
        return queryset.filter(
            frame_station_from__lte=value, frame_station_to__gte=value
        )

    def filter_upper_deck(self, queryset, name, value):
        return queryset.filter(
            upper_deck__in=_choice_filter_values(
                CompartmentMaster.UpperDeck.choices, value
            )
        )

    def filter_lower_deck(self, queryset, name, value):
        return queryset.filter(
            lower_deck__in=_choice_filter_values(
                CompartmentMaster.LowerDeck.choices, value
            )
        )

    def filter_location(self, queryset, name, value):
        return queryset.filter(
            location__in=_choice_filter_values(
                CompartmentMaster.Location.choices, value
            )
        )


class SubDepartmentContractSerializer(serializers.ModelSerializer):
    department = serializers.IntegerField(source="department_name_id")
    department_name = serializers.CharField(
        source="department_name.name", read_only=True
    )
    department_code = serializers.CharField(
        source="department_name.code", read_only=True
    )
    # Live count, not the stored column — see SubDepartmentViewSet.get_queryset().
    equipment_count = serializers.IntegerField(
        source="live_equipment_count", read_only=True
    )
    # CMMS if this row carries a real CMMS uid (synced or adopted-by-name during Step 1 —
    # see swmmapi.views._resolve_or_adopt_subdepartment), SWMM if it was created here by
    # hand and CMMS hasn't named it yet — same provenance rule as RHSI Master's own
    # sub_dept_source badge and the reference project's SectionCreateView.
    source = serializers.SerializerMethodField()

    def get_source(self, obj) -> str:
        return "CMMS" if (obj.universal_id_m_sub_department or "").strip() else "SWMM"

    class Meta:
        model = SubDepartment
        fields = [
            "id",
            "department",
            "department_name",
            "department_code",
            "name",
            "code",
            "equipment_count",
            "source",
            "active",
        ]
        read_only_fields = ["id", "department_name", "department_code"]
        extra_kwargs = {
            "active": {"required": False},
        }

    def validate(self, attrs):
        department_id = attrs.get(
            "department_name_id", getattr(self.instance, "department_name_id", None)
        )
        name = attrs.get("name", getattr(self.instance, "name", None))
        self._validate_unique_name(department_id, name)
        return attrs

    def validate_name(self, value):
        name = value.strip() if value else ""
        if not name:
            raise serializers.ValidationError("Sub-department name is required.")
        if len(name) > 100:
            raise serializers.ValidationError(
                "Sub-department name must be at most 100 characters."
            )
        if not SUB_DEPARTMENT_NAME_RE.match(name):
            raise serializers.ValidationError(
                "Sub-department name may only contain letters, numbers, spaces, "
                "hyphens, underscores and slashes."
            )
        return name

    def validate_code(self, value):
        return value.strip() if value else value

    def _validate_unique_name(self, department_id, name):
        queryset = SubDepartment.objects.filter(
            is_deleted=False,
            department_name_id=department_id,
            name__iexact=name,
        )
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                {
                    "name": (
                        "Sub-department with this name already exists for "
                        "selected department."
                    )
                }
            )

    def create(self, validated_data):
        validated_data.setdefault("active", True)
        # No universal_id_m_sub_department here — a manually-created row is SWMM-sourced
        # (see get_source) until CMMS genuinely names it during a Step 1 sync, which
        # adopts this exact row by name rather than creating a duplicate. Stamping a
        # generated placeholder uid here used to make every hand-created row show as
        # "CMMS" immediately, which was simply wrong, and would have stopped the real
        # CMMS uid from ever being adopted onto it.
        return super().create(validated_data)


class SubDepartmentFilter(django_filters.FilterSet):
    department = django_filters.NumberFilter(method="filter_department")
    active = django_filters.BooleanFilter(field_name="active")
    equipment_count = django_filters.NumberFilter(method="filter_equipment_count")

    class Meta:
        model = SubDepartment
        fields = ["department", "active", "equipment_count"]

    def filter_department(self, queryset, name, value):
        department = self.request.query_params.get(
            "department"
        ) or self.request.query_params.get("department_id")
        return queryset.filter(department_name_id=department)

    def filter_equipment_count(self, queryset, name, value):
        equipment_count = self.request.query_params.get(
            "equipment_count"
        ) or self.request.query_params.get("min_equipment_count")
        return queryset.filter(live_equipment_count=equipment_count)


class SourceShipEquipmentSerializer(serializers.ModelSerializer):
    serial_no = serializers.CharField(
        source="equipment_serial_no", required=False, allow_blank=True, allow_null=True
    )
    equipment_sr_no = serializers.CharField(
        source="equipment_serial_no", read_only=True
    )
    deck_no = serializers.CharField(
        source="deck", required=False, allow_blank=True, allow_null=True
    )
    frame_station = serializers.CharField(
        source="frame", required=False, allow_blank=True, allow_null=True
    )
    shell_life = serializers.CharField(
        source="service_life", required=False, allow_blank=True, allow_null=True
    )
    qty_fitted = serializers.IntegerField(source="no_of_fits", required=False)
    location = serializers.CharField(
        source="location_code", required=False, allow_blank=True, allow_null=True
    )
    compartment_name = serializers.CharField(
        source="location_on_board", required=False, allow_blank=True, allow_null=True
    )
    rh_at_installation = serializers.CharField(
        source="rshi", required=False, allow_blank=True, allow_null=True
    )
    insma_code = serializers.CharField(
        source="equipment.equipment_code", read_only=True
    )
    equipment_master_name = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()
    manufacturer_name = serializers.SerializerMethodField()
    sub_dept = serializers.SerializerMethodField()

    class Meta:
        model = ShipEquipment
        fields = [
            "id",
            "type",
            "category",
            "equipment",
            "system",
            "ship",
            "supplier",
            "manufacturer",
            "equipment_model",
            "equipment_name",
            "new_equipment_name",
            "new_system_name",
            "nomenclature",
            "new_nomenclature",
            "oem_part_no",
            "new_oem_part_no",
            "serial_no",
            "equipment_sr_no",
            "new_equipment_sr_no",
            "deck_no",
            "frame_station",
            "location",
            "location_code",
            "compartment_name",
            "location_on_board",
            "installation_date",
            "new_installation_date",
            "removal_date",
            "authority_date",
            "authority_of_installation",
            "authority_of_removal",
            "qty_fitted",
            "no_of_fits",
            "shell_life",
            "service_life",
            "rh_at_installation",
            "rshi",
            "equipment_section",
            "sub_department_f_key",
            "status",
            "active",
            "is_system",
            "mapping_status",
            "mapped_to",
            "mapped_at",
            "maintop_id",
            "universal_id_t_equipment_ship_detail",
            "universal_id_m_equipment",
            "universal_id_m_supplier",
            "universal_id_m_manufacturer",
            "universal_id_m_equipment_parent",
            "universal_id_m_sub_department",
            "insma_code",
            "equipment_master_name",
            "supplier_name",
            "manufacturer_name",
            "sub_dept",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_equipment_master_name(self, obj):
        return (
            getattr(obj.equipment, "equipment_name", None)
            or obj.equipment_name
            or getattr(obj.equipment, "ilms_eq_code", None)
        )

    def get_supplier_name(self, obj):
        return getattr(obj.supplier, "SupplierName", None) or getattr(
            obj.supplier, "supplier_name", None
        )

    def get_manufacturer_name(self, obj):
        return getattr(obj.manufacturer, "SupplierName", None) or getattr(
            obj.manufacturer, "supplier_name", None
        )

    def get_sub_dept(self, obj):
        return _sub_department_name(obj)

    def to_representation(self, obj):
        equipment = getattr(obj, "equipment", None)
        supplier = getattr(obj, "supplier", None)
        manufacturer = getattr(obj, "manufacturer", None)
        parent_equipment = getattr(obj, "parent_equipment", None)
        parent_equipment_id = (
            getattr(parent_equipment, "pk", None)
            if parent_equipment is not None
            else None
        )

        return {
            "created_at": getattr(obj, "created_at", None),
            "updated_at": getattr(obj, "updated_at", None),
            "created_by": _fk_id(obj, "created_by"),
            "updated_by": None,
            "equipment_ship_id": getattr(obj, "pk", None),
            "equipment": _fk_id(obj, "equipment"),
            "equipment_code": getattr(equipment, "equipment_code", None),
            "equipment_name": _first_value(
                getattr(obj, "equipment_name", None),
                getattr(equipment, "equipment_class", None),
                getattr(equipment, "equipment_code", None),
            ),
            "new_equipment_name": getattr(obj, "new_equipment_name", None),
            "system": _fk_id(obj, "system"),
            "new_system_name": getattr(obj, "new_system_name", None),
            "ship": _fk_id(obj, "ship"),
            "equipment_model": _first_value(
                getattr(obj, "equipment_model", None),
                getattr(equipment, "model", None),
            ),
            "location_code": getattr(obj, "location_code", None),
            "location_on_board": getattr(obj, "location_on_board", None),
            "no_of_fits": getattr(obj, "no_of_fits", None),
            "equipment_sr_no": getattr(obj, "equipment_serial_no", None),
            "new_equipment_sr_no": getattr(obj, "new_equipment_sr_no", None),
            "oem_part_no": getattr(obj, "oem_part_no", None),
            "new_oem_part_no": getattr(obj, "new_oem_part_no", None),
            "deck_no": getattr(obj, "deck", None),
            "installation_date": getattr(obj, "installation_date", None),
            "new_installation_date": getattr(obj, "new_installation_date", None),
            "removal_date": getattr(obj, "removal_date", None),
            # Declared on Meta.fields (a plain DateField, source="authority_date") but this
            # to_representation() override builds the response dict by hand and simply never
            # included it — genuinely present on the model/DB (confirmed live), just never reached
            # the frontend, which showed "Authority Date" as blank on every record regardless of
            # whether it actually had a value.
            "authority_date": getattr(obj, "authority_date", None),
            "supplier": _fk_id(obj, "supplier"),
            "supplier_name": _first_value(
                self.get_supplier_name(obj),
                getattr(obj, "new_supplier_name", None),
            ),
            "new_supplier_name": getattr(obj, "new_supplier_name", None),
            "manufacturer": _fk_id(obj, "manufacturer"),
            "manufacturer_name": _first_value(
                self.get_manufacturer_name(obj),
                getattr(obj, "new_manufacturer_name", None),
            ),
            "new_manufacturer_name": getattr(obj, "new_manufacturer_name", None),
            "remark": _first_value(
                getattr(obj, "remark", None),
                getattr(obj, "remarks", None),
            ),
            "srar_applicable": getattr(obj, "is_srar", None),
            "maintop_id": getattr(obj, "maintop_id", None),
            "parent_equipment": parent_equipment_id,
            "active": getattr(obj, "active", None),
            "is_system": getattr(obj, "is_system", None),
            "mapped_to": getattr(obj, "mapped_to", None),
            "mapped_at": getattr(obj, "mapped_at", None),
            "mapping_status": getattr(obj, "mapping_status", None),
            "nomenclature": getattr(obj, "nomenclature", None),
            "new_nomenclature": getattr(obj, "new_nomenclature", None),
            "service_life": getattr(obj, "service_life", None),
            "new_service_life": getattr(obj, "new_service_life", None),
            "status": getattr(obj, "status", None),
            "equipment_type": _fk_id(obj, "equipment_type_f_key"),
            "removal_remark": _first_value(
                getattr(obj, "removal_remark", None),
                getattr(obj, "removal_remarks", None),
            ),
            "authority_of_removal": _first_value(
                getattr(obj, "authority_of_removal", None),
                getattr(obj, "authority_removal", None),
            ),
            "authority_of_installation": _first_value(
                getattr(obj, "authority_of_installation", None),
                getattr(obj, "authority_installation", None),
            ),
            "rh_at_installation": _first_value(
                getattr(obj, "rshi", None),
                getattr(obj, "eq_rhsi", None),
            ),
            "insma_remarks": getattr(obj, "insma_remarks", None),
            "universal_id_t_equipment_ship_detail": _first_value(
                getattr(obj, "universal_id_t_equipment_ship_detail", None),
                getattr(obj, "universal_id_t_ship_detail", None),
            ),
            "universal_id_m_ship": getattr(obj, "universal_id_m_ship", None),
            "universal_id_m_equipment": _first_value(
                getattr(obj, "universal_id_m_equipment", None),
                getattr(equipment, "universal_id_m_equipment", None),
            ),
            "universal_id_m_srar_type": getattr(obj, "universal_id_m_srar_type", None),
            "universal_id_m_supplier": _first_value(
                getattr(obj, "universal_id_m_supplier", None),
                getattr(supplier, "Universal_ID_M_Supplier", None),
            ),
            "universal_id_m_manufacturer": _first_value(
                getattr(obj, "universal_id_m_manufacturer", None),
                getattr(manufacturer, "Universal_ID_M_Supplier", None),
            ),
            "universal_id_m_equipment_parent": getattr(
                obj, "universal_id_m_equipment_parent", None
            ),
            "universal_id_m_department": getattr(
                obj, "universal_id_m_department", None
            ),
            "universal_id_t_maintop_header": getattr(
                obj, "universal_id_t_maintop_header", None
            ),
            "universal_id_ch_master_equipment_type": getattr(
                obj, "universal_id_ch_master_equipment_type", None
            ),
            "universal_id_m_sub_department": getattr(
                obj, "universal_id_m_sub_department", None
            ),
            "is_synced": getattr(obj, "is_synced", None),
            "type": getattr(obj, "type", None),
            "category": getattr(obj, "category", None),
            "frame_station": getattr(obj, "frame", None),
            "equipment_section": _fk_id(obj, "sub_department_f_key"),
            # `sub_dept`/`get_sub_dept` are declared on this serializer's Meta.fields but
            # to_representation() above fully replaces DRF's own field rendering with this
            # hand-built dict, so a SerializerMethodField declared but not listed here is
            # silently dropped — this key is what the Active list's "Sub Dept" column
            # actually reads. Resolves through sub_department_f_key first (the field the
            # RHSI Master page and CMMS sync both write to), so a manually/auto-assigned
            # sub department shows up here too, not just a CMMS-supplied one.
            "sub_department_name": _sub_department_name(obj),
        }

    def create(self, validated_data):
        validated_data.setdefault("ship", _active_ship())
        validated_data.setdefault("type", ShipEquipment.TransactionType.EQUIPMENT)
        validated_data.setdefault("category", ShipEquipment.TransactionCategory.CAT1)
        validated_data.setdefault("active", True)
        validated_data.setdefault("status", "1")
        validated_data.setdefault("universal_id_t_equipment_ship_detail", _uid("SFD"))
        if (
            self.context.get("request")
            and self.context["request"].user.is_authenticated
        ):
            validated_data.setdefault(
                "created_by",
                getattr(self.context["request"].user, "user_profile", None),
            )
        obj = super().create(validated_data)
        return obj


class EquipmentCompartmentMappingSerializer(serializers.ModelSerializer):
    equipment_name = serializers.SerializerMethodField()
    compartment_name = serializers.CharField(source="compartment.name", read_only=True)
    # Deck No / Frame Station / Location are properties of the linked Compartment, not this
    # mapping row itself — same derivation CompartmentSerializer.get_deck_no/get_frame_station
    # already use for the Compartments grid, kept in sync here rather than re-stored. mapping_
    # status has no real "unmapped" state on this model (unlike System-Equipment mapping, which
    # tracks Mapped/Unmapped via ShipEquipment.mapping_status) — a row existing at all already
    # means the equipment and compartment are linked, so it's a constant, not a field lookup.
    deck_no = serializers.SerializerMethodField()
    frame_station = serializers.SerializerMethodField()
    location = serializers.CharField(source="compartment.get_location_display", read_only=True)
    mapping_status = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentCompartmentMapping
        fields = [
            "id",
            "equipment",
            "equipment_name",
            "compartment",
            "compartment_name",
            "deck_no",
            "frame_station",
            "location",
            "mapping_status",
            "created_at",
        ]

    def get_equipment_name(self, obj):
        return _equipment_display(obj.equipment) or ""

    def get_deck_no(self, obj):
        compartment = obj.compartment
        if compartment is None:
            return ""
        if compartment.main_deck:
            return "Main Deck"
        return compartment.get_upper_deck_display() or compartment.get_lower_deck_display() or ""

    def get_frame_station(self, obj):
        compartment = obj.compartment
        if compartment is None:
            return ""
        if compartment.frame_station_from is None or compartment.frame_station_to is None:
            return ""
        if compartment.frame_station_from == compartment.frame_station_to:
            return str(compartment.frame_station_from)
        return f"{compartment.frame_station_from} - {compartment.frame_station_to}"

    def get_mapping_status(self, obj):
        return "Mapped"

    def create(self, validated_data):
        user = self.context.get("request").user if self.context.get("request") else None
        if user and user.is_authenticated:
            validated_data["created_by"] = getattr(user, "user_profile", None)
        return super().create(validated_data)


class RemoveEquipmentContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = RemoveEquipment
        fields = "__all__"


def _get_master_equipment(universal_id):
    if not universal_id:
        return None
    return Equipment.objects.filter(universal_id_m_equipment=universal_id).first()


def _get_master_supplier(universal_id):
    if not universal_id:
        return None
    return Supplier.objects.filter(Universal_ID_M_Supplier=universal_id).first()


def _lookup_equipment_ship_id(cursor, universal_id):
    """CMMS's `T_EquipmentShipDetail.EquipmentShipID` is its own plain IDENTITY integer PK —
    distinct from `Universal_ID_T_EquipmentShipDetail` (the UID string this codebase otherwise
    keys everything by) — and is what `T_SFDChangeRequest.EquipmentShipId` actually references.
    Resolved by UID lookup rather than capturing it off the INSERT in `_push_equipment_to_cmms`,
    so this works the same whether that row was just created moments ago or already existed."""
    if not universal_id:
        return None
    cursor.execute(
        "SELECT EquipmentShipID FROM T_EquipmentShipDetail WHERE Universal_ID_T_EquipmentShipDetail = ?",
        [universal_id],
    )
    row = cursor.fetchone()
    return row[0] if row else None


def _lookup_ship_ids(cursor, universal_id):
    """CMMS's own `M_Ship` row for a `Universal_ID_M_Ship` UID — `ShipID` (plain IDENTITY integer
    PK) and `ShipSrNo` are native columns on CMMS's ship master, with no equivalent stored on the
    local `ShipEquipment` row, so they're resolved by UID lookup at push time instead."""
    if not universal_id:
        return None, None
    cursor.execute(
        "SELECT ShipID, ShipSrNo FROM M_Ship WHERE Universal_ID_M_Ship = ?",
        [universal_id],
    )
    row = cursor.fetchone()
    return (row[0], row[1]) if row else (None, None)


def _lookup_equipment_ids(cursor, universal_id):
    """CMMS's own `M_Equipment` row for a `Universal_ID_M_Equipment` UID — `EquipmentID`/
    `EquipmentCode` are native catalog columns, same reasoning as `_lookup_ship_ids`."""
    if not universal_id:
        return None, None
    cursor.execute(
        "SELECT EquipmentID, EquipmentCode FROM M_Equipment WHERE Universal_ID_M_Equipment = ?",
        [universal_id],
    )
    row = cursor.fetchone()
    return (row[0], row[1]) if row else (None, None)


def _lookup_supplier_id(cursor, universal_id):
    """CMMS's own `M_Supplier` row's plain integer PK for a `Universal_ID_M_Supplier` UID — shared
    by both the Supplier and Manufacturer columns on `T_EquipmentShipDetail`, since both reference
    the same `M_Supplier` table."""
    if not universal_id:
        return None
    cursor.execute(
        "SELECT SupplierID FROM M_Supplier WHERE Universal_ID_M_Supplier = ?",
        [universal_id],
    )
    row = cursor.fetchone()
    return row[0] if row else None


def _lookup_cmms_user_id(cursor, universal_id_a_user):
    """CMMS's own `A_User` row's plain integer PK (`UserID`) for a `Universal_ID_A_User` UID —
    `T_EquipmentShipDetail.CreatedBy` is that native numeric id, not the UID column (which is
    already carried separately via `Universal_ID_A_User_Created_By`). Resolved from the
    requesting SWMM user's own `CustomUserProfile.universal_id_a_user`; returns None for a user
    with nothing to look up (never synced from CMMS, or a non-LDAP local account) rather than
    guessing at a value."""
    if not universal_id_a_user:
        return None
    cursor.execute(
        "SELECT UserID FROM A_User WHERE Universal_ID_A_User = ?",
        [universal_id_a_user],
    )
    row = cursor.fetchone()
    return row[0] if row else None


def _push_equipment_to_cmms(
    tx, created_by_display_name=None, created_by_universal_id=None
):
    """A new SFD Add submission (any category) mirrors into CMMS's own `T_EquipmentShipDetail`
    table — CMMS is the system other departments/consumers still read from directly, so an install
    recorded only in SWMM's local Postgres would otherwise never show up there. Column list
    confirmed live against the real CMMS schema (`select * from T_EquipmentShipDetail`); the native
    integer/plain columns that mirror the local record's own UIDs (`ShipID`/`ShipSrNo`,
    `EquipmentID`/`EquipmentCode`, `SupplierID`, `ManufacturerID`, `CreatedBy`) are resolved from
    CMMS's own master tables (`M_Ship`/`M_Equipment`/`M_Supplier`/`A_User`) via `_lookup_ship_ids`/
    `_lookup_equipment_ids`/`_lookup_supplier_id`/`_lookup_cmms_user_id` so pushed rows read the
    same as CMMS's own legacy records, not just their UID columns — these come back NULL only when
    `tx`'s own universal_id_m_equipment/supplier/manufacturer (or, for CreatedBy, the requesting
    user's own universal_id_a_user) itself has nothing to look up (e.g. a CAT III equipment/OEM
    typed by hand that has no real CMMS catalog entry at all yet, or a local-only account never
    synced from CMMS), not a push bug. `CreatedDate`/`Status` are set here (now / Pending=2,
    matching `tx.status` at creation time — see SFDTransactionBaseContractSerializer.create()) so
    the CMMS row is queryable/approvable immediately rather than sitting NULL until some other
    process touches it. `ServiceDepartment` is the local Department's own `code` (via
    `tx.sub_department_f_key.department_name.code`). `Universal_ID_T_MaintopHeader` mirrors
    `tx.universal_id_t_maintop_header` directly (already carried on the local row wherever CMMS
    itself supplied one at sync time — see swmmapi.views.CMMSFDDataAPI._sync_rows_to_swmm). Remaining
    omitted columns (`SRARType`, `Universal_ID_M_Section`, ...) still have no clear/reliable local
    source field, so they're deliberately left out rather than guessed at. `EquipmentShipID` itself
    (a plain IDENTITY integer PK, distinct from `Universal_ID_T_EquipmentShipDetail`) is CMMS's own
    to assign on INSERT — confirmed via sample rows (sequential 1, 2, 3, ...) — so it's never
    supplied.

    Never raises: CMMS is an external system this app frequently can't reach, and a live CMMS
    outage must never block creating the LOCAL record — that stays the source of truth in SWMM
    either way, same as every other CMMS-dependent view in this codebase degrading gracefully
    rather than 500ing the whole request. Failures are logged only.

    Returns the newly-inserted row's `EquipmentShipID` (captured via the INSERT's own
    `OUTPUT INSERTED.EquipmentShipID` clause — CMMS assigns it, so there's nothing to read until
    the row exists, and this is immune to the same-session-wrong-table gotcha `SCOPE_IDENTITY()`
    has whenever a table carries an AFTER INSERT trigger), or `None` on any failure. The caller
    threads this straight into
    `_push_change_request_to_cmms` instead of having it re-look-up the row by UID on a fresh
    connection — see that function's `equipment_ship_id` param for why the re-lookup used to be
    unreliable for a brand-new row (CMMS's "Equipment" picker on the Change Request screen is
    driven by `EquipmentShipId`, not the `Equipment` text column, so a missed/failed lookup there
    left it stuck on "---Please Select---" even though every other field pushed fine).
    """
    try:
        conn = get_mssql_connection()
    except Exception:
        logger.warning(
            "Skipped CMMS push for new SFD equipment %s — CMMS connection unavailable.",
            tx.universal_id_t_equipment_ship_detail,
        )
        return None

    try:
        cursor = conn.cursor()
        ship_id, ship_sr_no = _lookup_ship_ids(cursor, tx.universal_id_m_ship)
        equipment_id, equipment_code = _lookup_equipment_ids(
            cursor, tx.universal_id_m_equipment
        )
        supplier_id = _lookup_supplier_id(cursor, tx.universal_id_m_supplier)
        manufacturer_id = _lookup_supplier_id(cursor, tx.universal_id_m_manufacturer)
        created_by_id = _lookup_cmms_user_id(cursor, created_by_universal_id)
        # CMMS's ServiceDepartment is a plain text column, not a UID reference, and what it
        # actually holds is M_Department's DeptCode — E/H/L/X across every row CMMS wrote
        # itself. Pushing the local Department's own `code` put "ELECTRICAL" in there for any
        # department SWMM seeded rather than synced, since those carry a long descriptive
        # code. Resolved by name instead (see master.utils.cmms_dept_code), reached through
        # the sub_department_f_key -> department_name chain _create_sfd_transaction's
        # universal_id_m_department backfill already trusts. Resolved through CMMS itself
        # (resolve_cmms_department) so it agrees with what the DART push writes, and comes
        # back None when the department matches no CMMS row — leaving the column null
        # rather than filling it with a code CMMS cannot match.
        sub_department = tx.sub_department_f_key
        department = getattr(sub_department, "department_name", None)
        # CMMS's own `ServiceDepartment` column is VARCHAR(10) (confirmed live against the real
        # schema, by reproducing "String or binary data would be truncated" for a department like
        # "ENGINEERING" whose local Department.code is 11+ chars) — resolve_cmms_department looks
        # up CMMS's own M_Department row for this department and returns its real DeptCode (E/H/L/X/
        # ...), which both fits the column and is the value CMMS itself actually recognises, rather
        # than an arbitrary truncation of our own longer descriptive code (which could silently
        # collide with a different department's real DeptCode, or match nothing meaningful at all).
        service_department_code = resolve_cmms_department(department)[0]
        cursor.execute(
            """
            INSERT INTO T_EquipmentShipDetail (
                Universal_ID_T_EquipmentShipDetail,
                Universal_ID_M_Ship,
                Universal_ID_M_Department,
                Universal_ID_M_SubDepartment,
                Universal_ID_M_Equipment,
                Universal_ID_M_SrarType,
                Universal_ID_M_Supplier_Supplier,
                Universal_ID_M_Supplier_Manufacturer,
                Universal_ID_M_Equipment_ParentEquipment,
                Universal_ID_T_MaintopHeader,
                ShipID,
                ShipSrNo,
                EquipmentID,
                EquipmentCode,
                SupplierID,
                ManufacturerID,
                CreatedBy,
                Nomenclature,
                InstallationDate,
                EquipmentSrNo,
                LocationOnBoard,
                LocationCode,
                SRARApplicable,
                Authority_of_Installation,
                NoOfFits,
                RemovalDate,
                OEMPartNo,
                Remark,
                MaintopID,
                ServiceLife,
                Removal_Remark,
                Authority_Of_Removal,
                RH_Of_New_Equipemnt_At_Time_Of_Installation,
                INSMAREMARKS,
                IsSynced,
                CreatedDate,
                Universal_ID_A_User_Created_By,
                Status,
                ServiceDepartment
            )
            OUTPUT INSERTED.EquipmentShipID
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                tx.universal_id_t_equipment_ship_detail,
                tx.universal_id_m_ship,
                tx.universal_id_m_department,
                tx.universal_id_m_sub_department,
                tx.universal_id_m_equipment,
                tx.universal_id_m_srar_type,
                tx.universal_id_m_supplier,
                tx.universal_id_m_manufacturer,
                tx.universal_id_m_equipment_parent,
                tx.universal_id_t_maintop_header,
                ship_id,
                ship_sr_no,
                equipment_id,
                equipment_code,
                supplier_id,
                manufacturer_id,
                created_by_id,
                tx.nomenclature,
                _sql_date(tx.installation_date),
                tx.equipment_serial_no,
                tx.location_on_board,
                tx.location_code,
                bool(tx.is_srar),
                tx.authority_of_installation,
                tx.no_of_fits,
                _sql_date(tx.removal_date),
                tx.oem_part_no,
                tx.remarks,
                tx.maintop_id,
                tx.service_life,
                tx.removal_remark,
                tx.authority_of_removal,
                tx.rshi,
                tx.insma_remarks,
                True,
                timezone.now(),
                created_by_display_name,
                2,
                service_department_code,
            ],
        )
        # `OUTPUT INSERTED.EquipmentShipID` on the INSERT itself (above) instead of a follow-up
        # `SELECT SCOPE_IDENTITY()` — SCOPE_IDENTITY() silently returns the wrong (or no) value
        # whenever the table has an AFTER INSERT trigger that itself inserts into another
        # IDENTITY-keyed table (common in legacy schemas like this one), which is almost
        # certainly why the CMMS "Equipment" picker was still stuck on "---Please Select---"
        # after the first attempt at capturing this value. OUTPUT INSERTED reads straight off
        # the row actually inserted into T_EquipmentShipDetail, immune to that class of trigger.
        identity_row = cursor.fetchone()
        equipment_ship_id = (
            int(identity_row[0])
            if identity_row and identity_row[0] is not None
            else None
        )
        conn.commit()
        logger.info(
            "Pushed new SFD equipment %s to CMMS T_EquipmentShipDetail.",
            tx.universal_id_t_equipment_ship_detail,
        )
        return equipment_ship_id
    except Exception:
        logger.exception(
            "Failed to push new SFD equipment %s to CMMS.",
            tx.universal_id_t_equipment_ship_detail,
        )
        return None
    finally:
        conn.close()


def _push_change_request_to_cmms(change_request, tx, equipment_ship_id=None):
    """CAT1/2/3 only: mirrors the `ChangeEquipmentRequest` row `_create_sfd_transaction` just made
    into CMMS's own `T_SFDChangeRequest` table — same reasoning as `_push_equipment_to_cmms`.
    Column list confirmed live (`select * from T_SFDChangeRequest`); `Supplier`/`Manufacture`/
    `ParentEquipment`/`SFDGroup`/`CreatedBy`/`ApprovedBy` have no reliable local source (the local
    `ChangeEquipmentRequest` model doesn't populate equivalents of these either) so are left unset
    rather than guessed at. `EquipmentShipId` is CMMS's own integer PK for the equipment row, not
    the UID string, and is what actually drives the "Equipment" picker on CMMS's own View SFD
    Change Request screen — pass it in directly (`_create_sfd_transaction` gets it straight back
    from `_push_equipment_to_cmms`'s own INSERT) whenever this is a brand-new equipment row being
    pushed for the first time. Only falls back to `_lookup_equipment_ship_id` when the caller
    doesn't have it on hand — i.e. an edit on equipment that already existed in CMMS beforehand
    (came in via CMMS sync, or was pushed by an earlier request), where the UID-based lookup is
    reliable since the row has existed there all along. Never raises — same as
    `_push_equipment_to_cmms`, a live CMMS outage must never block the local record.
    """
    try:
        conn = get_mssql_connection()
    except Exception:
        logger.warning(
            "Skipped CMMS push for SFD change request %s — CMMS connection unavailable.",
            change_request.universal_id_t_sfd_change_request,
        )
        return

    try:
        cursor = conn.cursor()
        if equipment_ship_id is None:
            equipment_ship_id = _lookup_equipment_ship_id(
                cursor, tx.universal_id_t_equipment_ship_detail
            )
        cursor.execute(
            """
            INSERT INTO T_SFDChangeRequest (
                EquipmentShipId,
                Equipment,
                Model,
                Active,
                Universal_ID_T_SFDChangeRequest,
                Universal_ID_T_EquipmentShipDetail,
                Universal_ID_A_User_Created_By,
                IsSynced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                equipment_ship_id,
                tx.equipment_name,
                tx.equipment_model,
                True,
                change_request.universal_id_t_sfd_change_request,
                tx.universal_id_t_equipment_ship_detail,
                change_request.universal_id_a_user_created_by,
                False,
            ],
        )
        conn.commit()
        logger.info(
            "Pushed SFD change request %s to CMMS T_SFDChangeRequest.",
            change_request.universal_id_t_sfd_change_request,
        )
    except Exception:
        logger.exception(
            "Failed to push SFD change request %s to CMMS.",
            change_request.universal_id_t_sfd_change_request,
        )
    finally:
        conn.close()


def _push_remove_request_to_cmms(remove_request, tx):
    """Mirrors a `RemoveEquipment` row into CMMS's own `Ch_SFD_Remove_Equipment_Request` table —
    same reasoning as `_push_equipment_to_cmms`. Column list confirmed live (`select * from
    Ch_SFD_Remove_Equipment_Request`). Uses `remove_request.universal_id_ch_sfd_remove_equipment_request`
    (set by the caller before this runs) rather than generating a fresh UID here, so this same row
    is recognized — not duplicated — if `cmms_pull_remove_requests` (the read-back side, in
    swmmapi/views.py) later pulls it back down. Never raises — same as `_push_equipment_to_cmms`.
    """
    try:
        conn = get_mssql_connection()
    except Exception:
        logger.warning(
            "Skipped CMMS push for SFD remove request on %s — CMMS connection unavailable.",
            tx.universal_id_t_equipment_ship_detail,
        )
        return

    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO Ch_SFD_Remove_Equipment_Request (
                Universal_ID_T_EquipmentShipDetail,
                Universal_ID_Ch_SFD_Remove_Equipment_Request,
                Removal_Date,
                Removal_Remark,
                Authority_Of_Removal,
                Equipment_Serial_No,
                Authority_Of_Installation,
                RH_Of_New_Equipemnt_At_Time_Of_Installation,
                Request_Type,
                Active,
                InstallationDate,
                InstallationRemark,
                IsSynced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                tx.universal_id_t_equipment_ship_detail,
                remove_request.universal_id_ch_sfd_remove_equipment_request,
                _sql_date(remove_request.removal_date),
                remove_request.removal_remark,
                remove_request.authority_of_removal,
                remove_request.equipment_serial_no,
                tx.authority_of_installation,
                remove_request.rh_of_new_equipment_at_time_of_installation,
                remove_request.request_type,
                True,
                _sql_date(remove_request.installation_date),
                remove_request.installation_remark,
                False,
            ],
        )
        conn.commit()
        logger.info(
            "Pushed SFD remove request on %s to CMMS Ch_SFD_Remove_Equipment_Request.",
            tx.universal_id_t_equipment_ship_detail,
        )
    except Exception:
        logger.exception(
            "Failed to push SFD remove request on %s to CMMS.",
            tx.universal_id_t_equipment_ship_detail,
        )
    finally:
        conn.close()


@transaction.atomic
def _create_sfd_transaction(validated_data):
    category = validated_data["category"]
    for key in (
        "equipment_name",
        "system_name",
        "manufacturer_name",
        "supplier_name",
        "new_oem_name",
        "new_serial_no",
    ):
        validated_data.pop(key, None)
    user = validated_data.pop("user", None)
    validated_data.setdefault("universal_id_t_equipment_ship_detail", _uid("SFD"))
    validated_data.setdefault("ship", _active_ship())
    validated_data["is_synced"] = True

    # universal_id_m_ship / universal_id_m_department are plain UID columns, independent of the
    # `ship`/`sub_department_f_key` FKs above — nothing previously filled them in for equipment
    # created through the SFD Add forms (only CMMS-synced rows had them), so both stayed null on
    # every locally-created transaction, including in the CMMS write-back this feeds. Backfilled
    # here from the FKs already being set, same fallback `_department_name()` already trusts for
    # display (sub_department_f_key.department_name) when an equipment's own field is unset.
    ship = validated_data.get("ship")
    if ship is not None:
        validated_data.setdefault("universal_id_m_ship", ship.universal_id_m_ship)
    sub_department = validated_data.get("sub_department_f_key")
    department = getattr(sub_department, "department_name", None)
    if department is not None:
        validated_data.setdefault(
            "universal_id_m_department", department.universal_id_m_department
        )
    if user and getattr(user, "is_authenticated", False):
        validated_data["created_by"] = getattr(user, "user_profile", None)
    display_name = _user_display_name(user)
    created_by_universal_id = getattr(
        getattr(user, "user_profile", None), "universal_id_a_user", None
    )

    tx = ShipEquipment.objects.create(**validated_data)
    equipment_ship_id = _push_equipment_to_cmms(
        tx, display_name, created_by_universal_id
    )

    # A new Equipment-type transaction with a picked "System Name" gets mapped to that system
    # automatically — whether the equipment was already mapped (frontend locks System Name to the
    # existing mapping in that case, so this just carries it forward onto the new row) or being
    # mapped for the first time (frontend leaves System Name open for a normal pick). Mirrors
    # EquipmentSystemMapAPIView's own equipment/system linking exactly.
    system_catalog_uid = validated_data.get("universal_id_m_equipment_parent")
    if tx.type == ShipEquipment.TransactionType.EQUIPMENT and system_catalog_uid:
        system_row = (
            ShipEquipment.objects.filter(universal_id_m_equipment=system_catalog_uid)
            .exclude(pk=tx.pk)
            .first()
        )
        if system_row:
            tx.mapped_to = system_row.universal_id_t_equipment_ship_detail
            tx.mapping_status = ShipEquipment.MappingStatus.MAPPED
            tx.mapped_at = timezone.now()
            tx.save(update_fields=["mapped_to", "mapping_status", "mapped_at"])
            system_row.is_system = True
            system_row.save(update_fields=["is_system"])

    # Auto-create the equipment <-> compartment link (surfaces in Ship-Owned Masters ->
    # Equipment Location Mapping) whenever this submission named a real, resolvable
    # Compartment — same trigger point/reasoning as the System-Equipment mapping just above,
    # just keyed off the master Equipment catalog row (EquipmentCompartmentMapping.equipment)
    # instead of another ShipEquipment transaction. get_or_create because unique_together=
    # (equipment, compartment) — re-adding the same equipment into the same compartment later
    # (e.g. a CAT1 replacement in the same spot) must not raise IntegrityError on the repeat.
    compartment_name = (validated_data.get("location_on_board") or "").strip()
    if tx.equipment_id and compartment_name:
        compartment_row = CompartmentMaster.objects.filter(
            name__iexact=compartment_name, is_deleted=False
        ).first()
        if compartment_row:
            EquipmentCompartmentMapping.objects.get_or_create(
                equipment=tx.equipment,
                compartment=compartment_row,
                defaults={
                    "created_by": getattr(user, "user_profile", None) if user else None
                },
            )

    # Every new submission gets an approval-tracking record — not just CAT1/2/3 — so it shows up
    # in Approval Tracking and stays gated (via `tx.status`, set to Pending above by the caller)
    # until CMMS approves it. SURVEY is the one exception: it's a removal, tracked on
    # RemoveEquipment below instead.
    if category != ShipEquipment.TransactionCategory.SURVEY:
        change_request = ChangeEquipmentRequest.objects.create(
            equipment=tx.equipment or Equipment.objects.first(),
            ship_equipment=tx,
            removal_remark="",
            new_serial=tx.equipment_model,
            is_synced=0,
            approved_reject=2,  # Pending — explicit, not left to the None fallback
            universal_id_t_sfd_change_request=_uid("SFDCR"),
            universal_id_a_user_created_by=display_name,
        )
        _push_change_request_to_cmms(
            change_request, tx, equipment_ship_id=equipment_ship_id
        )
    else:
        remove_request = RemoveEquipment.objects.create(
            equipment=tx.equipment or Equipment.objects.first(),
            ship_equipment=tx,
            removal_remark="",
            removal_date=tx.removal_date,
            authority_of_removal=tx.authority_of_removal,
            equipment_serial_no=tx.equipment_serial_no,
            request_type=2,
            installation_date=tx.new_installation_date,
            installation_remark="",
            is_synced=0,
            approved_reject=2,  # Pending — explicit, not left to the None fallback
            universal_id_ch_sfd_remove_equipment_request=_uid("SFDRER"),
        )
        _push_remove_request_to_cmms(remove_request, tx)

    return tx


def _serialize_field_value(value):
    """JSON-safe representation of a validated_data value for staging into proposed_changes."""
    if isinstance(value, Model):
        return value.pk
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _apply_immediate(instance, validated_data):
    for field, value in validated_data.items():
        setattr(instance, field, value)
    instance.save()
    return instance


@transaction.atomic
def _update_sfd_transaction(instance, validated_data):
    """Every update is staged (not applied) pending CMMS approval — the SFD list keeps showing
    `instance`'s OLD values until `cmms_pull_change_requests`/`cmms_pull_remove_requests`
    (swmmapi/views.py) sees the CMMS side approve the linked change/remove request and applies
    `proposed_changes` onto `instance`. SURVEY (a removal) stages onto RemoveEquipment; every
    other category — including CAT1/2/3, OTHER, and the common category=None case for equipment
    that arrived via CMMS sync rather than this app's own create flow — stages onto
    ChangeEquipmentRequest. _apply_immediate is only a defensive fallback for when a SURVEY row
    somehow has no linked RemoveEquipment to stage onto.
    """
    category = instance.category
    user = validated_data.pop("user", None)
    for key in (
        "equipment_name",
        "system_name",
        "manufacturer_name",
        "supplier_name",
        "new_oem_name",
        "new_serial_no",
    ):
        validated_data.pop(key, None)

    display_name = _user_display_name(user)

    # Every update goes through CMMS approval before it's visible in the SFD list — not just
    # CAT1/2/3. Most equipment in this list came in via CMMS sync and has no category at all
    # (category=None), and OTHER/"Local Purchase" rows exist too; only SURVEY (an equipment
    # *removal*, staged onto RemoveEquipment below) is handled differently. Excluding None/OTHER
    # here would silently apply their edits immediately, bypassing approval entirely.
    if category != ShipEquipment.TransactionCategory.SURVEY:
        change_request = ChangeEquipmentRequest.objects.filter(
            ship_equipment=instance
        ).first()
        if change_request is None:
            change_request = ChangeEquipmentRequest.objects.create(
                equipment=instance.equipment or Equipment.objects.first(),
                ship_equipment=instance,
                removal_remark="",
                is_synced=0,
                universal_id_t_sfd_change_request=_uid("SFDCR"),
            )
        proposed = {k: _serialize_field_value(v) for k, v in validated_data.items()}
        change_request.proposed_changes = proposed
        change_request.new_serial = validated_data.get(
            "equipment_model", instance.equipment_model
        )
        change_request.universal_id_a_user_created_by = display_name
        change_request.approved_reject = (
            2  # Pending — explicit, not left to the None fallback
        )
        change_request.save(
            update_fields=[
                "proposed_changes",
                "new_serial",
                "universal_id_a_user_created_by",
                "approved_reject",
                "updated_at",
            ]
        )
        _push_change_request_to_cmms(change_request, instance)
        return instance

    if category == ShipEquipment.TransactionCategory.SURVEY:
        remove_request = RemoveEquipment.objects.filter(ship_equipment=instance).first()
        if remove_request is None:
            # No linked removal request to stage onto (defensive fallback) — apply immediately
            # rather than silently drop the edit with nowhere for CMMS approval to attach to.
            return _apply_immediate(instance, validated_data)

        proposed = {k: _serialize_field_value(v) for k, v in validated_data.items()}
        remove_request.proposed_changes = proposed
        remove_request.removal_date = validated_data.get(
            "removal_date", instance.removal_date
        )
        remove_request.authority_of_removal = validated_data.get(
            "authority_of_removal", instance.authority_of_removal
        )
        remove_request.equipment_serial_no = validated_data.get(
            "equipment_serial_no", instance.equipment_serial_no
        )
        remove_request.installation_date = validated_data.get(
            "new_installation_date", instance.new_installation_date
        )
        remove_request.approved_reject = (
            2  # Pending — explicit, not left to the None fallback
        )
        remove_request.save(
            update_fields=[
                "proposed_changes",
                "removal_date",
                "authority_of_removal",
                "equipment_serial_no",
                "installation_date",
                "approved_reject",
                "updated_at",
            ]
        )
        _push_remove_request_to_cmms(remove_request, instance)
        return instance


class SFDTransactionBaseContractSerializer(serializers.ModelSerializer):
    expected_category = None
    type = serializers.ChoiceField(
        choices=ShipEquipment.TransactionType.choices,
        help_text="Transaction type: equipment or system.",
    )
    category = serializers.ChoiceField(
        choices=ShipEquipment.TransactionCategory.choices,
        help_text="Transaction category: CAT1, CAT2, CAT3, SURVEY, or OTHER.",
    )
    equipment_universal_id = serializers.CharField(
        write_only=True,
        required=False,
        help_text="Universal ID for the selected equipment.",
    )
    system_universal_id = serializers.CharField(
        write_only=True,
        required=False,
        help_text="Universal ID for the selected system.",
    )
    model_universal_id = serializers.CharField(write_only=True, help_text="Model name.")
    nomenclature = serializers.CharField(help_text="Equipment nomenclature.")
    supplier_universal_id = serializers.CharField(
        write_only=True, help_text="Universal ID for the selected supplier."
    )
    manufacturer_universal_id = serializers.CharField(
        write_only=True, help_text="Universal ID for the selected manufacturer."
    )
    serial_no = serializers.CharField(
        source="equipment_serial_no",
        max_length=255,
        validators=[SERIAL_NO_RE_VALIDATOR],
        help_text="Equipment serial number.",
    )
    deck_no = serializers.CharField(source="deck", help_text="Deck number.")
    location = serializers.ChoiceField(
        source="location_code",
        choices=ShipEquipment.Location.choices,
        help_text="Location code on board.",
    )
    compartment_name = serializers.CharField(
        source="location_on_board",
        help_text="Location on board or compartment name.",
    )
    frame_station_from = serializers.CharField(
        write_only=True, help_text="Starting frame station value."
    )
    frame_station_to = serializers.CharField(
        write_only=True, help_text="Ending frame station value."
    )
    frame_station = serializers.CharField(source="frame", read_only=True)
    installation_date = serializers.DateTimeField(
        required=False, allow_null=True, help_text="Installation date and time."
    )
    authority_of_installation = serializers.CharField(
        allow_blank=True, help_text="Authority of installation."
    )
    authority_date = serializers.DateField(
        required=False, allow_null=True, help_text="Date of Authority Given."
    )
    qty_fitted = serializers.IntegerField(
        source="no_of_fits", help_text="Quantity fitted."
    )
    shell_life = serializers.IntegerField(
        source="service_life",
        min_value=1,
        max_value=1200,
        help_text="Service life or shelf life.",
    )
    rh_at_installation = serializers.CharField(
        source="rshi", required=False, allow_blank=True, allow_null=True
    )
    equipment_section = serializers.CharField(help_text="Equipment section code.")

    def create(self, validated_data):
        request = self.context["request"]
        from_station = validated_data.pop("frame_station_from", None)
        to_station = validated_data.pop("frame_station_to", None)
        ids = self._pop_lookup_fields(validated_data)
        # New submissions start Pending CMMS approval, not auto-approved — see
        # ShipEquipment.status convention: "active" (approved) / "2" (pending) / "3" (rejected).
        validated_data.update({"active": True, "status": "2", "user": request.user})
        self._populate_equipment_fields(validated_data, ids)
        self._populate_master_fields(validated_data, ids)
        self._set_frame_station(validated_data, from_station, to_station)
        return _create_sfd_transaction(validated_data)

    def update(self, instance, validated_data):
        request = self.context["request"]
        from_station = validated_data.pop("frame_station_from", None)
        to_station = validated_data.pop("frame_station_to", None)
        ids = self._pop_lookup_fields(validated_data)
        validated_data["user"] = request.user.CustomUser_profile
        self._populate_equipment_fields(validated_data, ids)
        self._populate_master_fields(validated_data, ids)
        self._set_frame_station(validated_data, from_station, to_station)
        return _update_sfd_transaction(instance, validated_data)

    def _pop_lookup_fields(self, validated_data):
        return {
            "equipment": validated_data.pop("equipment_universal_id", None),
            "system": validated_data.pop("system_universal_id", None),
            "model": validated_data.pop("model_universal_id", None),
            "supplier": validated_data.pop("supplier_universal_id", None),
            "manufacturer": validated_data.pop("manufacturer_universal_id", None),
            "section": validated_data.pop("equipment_section", None),
        }

    def _populate_equipment_fields(self, validated_data, ids):
        txn_type = validated_data["type"]
        equipment = _get_master_equipment(ids["equipment"])
        system = _get_master_equipment(ids["system"])

        if equipment and txn_type == ShipEquipment.TransactionType.EQUIPMENT:
            validated_data["equipment"] = equipment
            validated_data["universal_id_m_equipment"] = ids["equipment"]

        if system:
            validated_data["system"] = system
            validated_data["universal_id_m_equipment_parent"] = ids["system"]
            validated_data["parent_equipment"] = system

    def _populate_master_fields(self, validated_data, ids):
        model = _get_master_equipment(ids["model"])
        if model:
            validated_data["equipment_model"] = getattr(
                model, "equipment_model", None
            ) or getattr(model, "model", None)

        supplier = _get_master_supplier(ids["supplier"])
        if supplier:
            validated_data["supplier"] = supplier
            validated_data["universal_id_m_supplier"] = ids["supplier"]

        manufacturer = _get_master_supplier(ids["manufacturer"])
        if manufacturer:
            validated_data["manufacturer"] = manufacturer
            validated_data["universal_id_m_manufacturer"] = ids["manufacturer"]

        if ids["section"]:
            section = SubDepartment.objects.filter(code=ids["section"]).first()
            if section:
                validated_data["sub_department_f_key"] = section
                validated_data["equipment_section"] = section.code
                validated_data["universal_id_m_sub_department"] = (
                    section.universal_id_m_sub_department
                )
            else:
                validated_data["equipment_section"] = ids["section"]

    def _set_frame_station(self, validated_data, start, end):
        if start or end:
            validated_data["frame"] = f"{start or ''} - {end or ''}".strip(" -")

    class Meta:
        model = ShipEquipment
        fields = [
            "type",
            "category",
            "equipment_universal_id",
            "system_universal_id",
            "model_universal_id",
            "nomenclature",
            "manufacturer_universal_id",
            "supplier_universal_id",
            "oem_part_no",
            "serial_no",
            "deck_no",
            "location",
            "compartment_name",
            "frame_station_from",
            "frame_station_to",
            "frame_station",
            "installation_date",
            "authority_of_installation",
            "authority_date",
            "qty_fitted",
            "shell_life",
            "rh_at_installation",
            "equipment_section",
        ]


REQUIRED_CAT1 = "Required for CAT1."
REQUIRED_CAT2 = "Required for CAT2."
REQUIRED_CAT3 = "Required for CAT3."
REQUIRED_SURVEY_DEMAND = "Required for Survey & Demand."
REQUIRED_OTHERS = "Required for Others."
QTY_FITTED_ERROR = "Qty Fitted should be grater than 0"
SHELL_LIFE_ERROR = "Shell Life should be grater than 0"
CATEGORY_ERROR = "Please Check Transaction Category."
TYPE_ERROR = "Please Check Transaction Type."
INVALID_FUTURE_DATE = "Installation Date cannot be a future date."


def _local_date(value):
    """DateTimeField gives back an aware datetime; compare calendar dates in local time."""
    if isinstance(value, datetime):
        return (timezone.localtime(value) if timezone.is_aware(value) else value).date()
    return value


def _validate_common(
    attrs,
    required_fields,
    error_message,
    expected_category,
    allow_new_equipment_name=False,
):
    for field in required_fields:
        if not attrs.get(field):
            raise serializers.ValidationError({field: error_message})

    validations = {
        "qty_fitted": (attrs["no_of_fits"] > 0, QTY_FITTED_ERROR),
        "installation_date": (
            _local_date(attrs["installation_date"]) <= timezone.localdate(),
            INVALID_FUTURE_DATE,
        ),
    }
    # shell_life bounds are enforced declaratively by the shell_life IntegerField
    # (min_value/max_value) before validate() ever runs, so no manual check here.
    # Only when actually supplied — CAT1/CAT2 require it (already covered by required_fields
    # above), but CAT3/Survey/Others leave it optional, so a missing authority_date shouldn't be
    # reported as "in the future" here.
    if attrs.get("authority_date"):
        validations["authority_date"] = (
            _local_date(attrs["authority_date"]) <= timezone.localdate(),
            INVALID_FUTURE_DATE,
        )
    for field, (is_valid, error) in validations.items():
        if not is_valid:
            raise serializers.ValidationError({field: error})

    if attrs["type"] not in {
        ShipEquipment.TransactionType.EQUIPMENT,
        ShipEquipment.TransactionType.SYSTEM,
    }:
        raise serializers.ValidationError({"type": TYPE_ERROR})

    if attrs["category"] != expected_category:
        raise serializers.ValidationError({"category": CATEGORY_ERROR})

    if attrs["type"] == ShipEquipment.TransactionType.EQUIPMENT:
        # System is optional in Equipment mode by product direction — submits fine with or
        # without a System pick, unlike System mode where it's the record being created.
        required = ("equipment_universal_id",)
    else:
        required = ("system_universal_id",)
    for field in required:
        if attrs.get(field):
            continue
        # CAT2 only ("Existing in Indian Navy Inventory"): the equipment can exist in navy
        # inventory without being in this ship's own synced CMMS catalog yet, so a hand-typed
        # new_equipment_name is an accepted alternative to picking equipment_universal_id from the
        # dropdown — same "not listed, add new" escape hatch CAT3 already has for its own equipment.
        if (
            allow_new_equipment_name
            and field == "equipment_universal_id"
            and attrs.get("new_equipment_name")
        ):
            continue
        raise serializers.ValidationError({field: error_message})


class CAT1Serializer(SFDTransactionBaseContractSerializer):
    """ "Old Equipment Info" is this serializer's existing base field set (Model, Nomenclature, OEM
    Name, Supplier, OEM Part No, Equipment Serial No, Compartment/Deck/Frame/Location,
    Installation Date, Authority for Installation, Authority Date, Qty Fitted, Shelf Life, Sub
    Department) — describing the equipment being replaced. "New Equipment Info" reuses the exact
    same removal_date/authority_of_removal/new_installation_date/new_serial_no/new_service_life/
    installation_remark fields Survey & Demand and Local Purchase already have (see
    SurveySerializer/OthersSerializer) rather than adding a fresh set of columns — a CAT1
    "Replacement, Same Make & Model" is the same kind of transaction (remove an old physical unit,
    install an identical new one) those two already model; only the category differs."""

    expected_category = ShipEquipment.TransactionCategory.CAT1
    removal_date = serializers.DateTimeField(
        help_text="Removal date and time for the old equipment being replaced (CAT1)."
    )
    authority_of_removal = serializers.CharField(
        help_text="Authority for removing the old equipment (CAT1)."
    )
    new_installation_date = serializers.DateTimeField(
        help_text="Installation date and time for the new equipment (CAT1)."
    )
    new_serial_no = serializers.CharField(
        source="new_equipment_sr_no",
        help_text="Serial number for the new equipment (CAT1).",
    )
    installation_remark = serializers.CharField(
        source="installation_remarks",
        help_text="Installation remark for the old equipment's install record (CAT1).",
    )
    new_service_life = serializers.IntegerField(
        help_text="Shelf life for the new equipment (CAT1)."
    )

    def validate(self, attrs):
        required_fields = [
            "type",
            "category",
            "model_universal_id",
            "nomenclature",
            "supplier_universal_id",
            "manufacturer_universal_id",
            "oem_part_no",
            "equipment_serial_no",
            "location_on_board",
            "deck",
            "frame_station_from",
            "frame_station_to",
            "location_code",
            "installation_date",
            "authority_of_installation",
            "authority_date",
            "no_of_fits",
            "service_life",
            "equipment_section",
            "removal_date",
            "authority_of_removal",
            "new_equipment_sr_no",
            "new_installation_date",
            "new_service_life",
            "installation_remarks",
        ]
        for field in required_fields:
            if not attrs.get(field):
                raise serializers.ValidationError({field: REQUIRED_CAT1})

        validations = {
            "qty_fitted": (attrs["no_of_fits"] > 0, QTY_FITTED_ERROR),
            "shell_life": (int(attrs["service_life"]) > 0, SHELL_LIFE_ERROR),
            "new_shell_life": (attrs["new_service_life"] > 0, SHELL_LIFE_ERROR),
            "installation_date": (
                _local_date(attrs["installation_date"]) <= timezone.localdate(),
                INVALID_FUTURE_DATE,
            ),
            "removal_date": (
                attrs["removal_date"] > attrs["installation_date"],
                "Removal Date Should be Ahead of Installation Date",
            ),
            "new_installation_date": (
                attrs["new_installation_date"] > attrs["removal_date"],
                "New Installation Date Should be Ahead of Removal Date",
            ),
        }
        if attrs.get("authority_date"):
            validations["authority_date"] = (
                _local_date(attrs["authority_date"]) <= timezone.localdate(),
                INVALID_FUTURE_DATE,
            )
        for field, (is_valid, error) in validations.items():
            if not is_valid:
                raise serializers.ValidationError({field: error})

        if attrs["type"] not in {
            ShipEquipment.TransactionType.EQUIPMENT,
            ShipEquipment.TransactionType.SYSTEM,
        }:
            raise serializers.ValidationError({"type": TYPE_ERROR})
        if attrs["category"] != self.expected_category:
            raise serializers.ValidationError({"category": CATEGORY_ERROR})

        if attrs["type"] == ShipEquipment.TransactionType.EQUIPMENT:
            # System is optional in Equipment mode by product direction — submits fine with or
            # without a System pick, unlike System mode where it's the record being created.
            required = ("equipment_universal_id",)
        else:
            required = ("system_universal_id",)
        for field in required:
            if not attrs.get(field):
                raise serializers.ValidationError({field: REQUIRED_CAT1})
        return attrs

    class Meta(SFDTransactionBaseContractSerializer.Meta):
        fields = SFDTransactionBaseContractSerializer.Meta.fields + [
            "removal_date",
            "authority_of_removal",
            "new_installation_date",
            "new_serial_no",
            "installation_remark",
            "new_service_life",
        ]


class CAT2Serializer(SFDTransactionBaseContractSerializer):
    expected_category = ShipEquipment.TransactionCategory.CAT2
    # "Not Listed – Add New Equipment" escape hatch (see NEW_EQUIPMENT_NAME_OPTION,
    # sfd-management.component.ts): CAT2 equipment can exist in navy inventory without being in
    # this ship's own synced CMMS list yet, so Equipment Name can be hand-typed here instead of
    # picked from the dropdown. Reuses the same model column CAT3's own new_equipment_name already
    # writes to, so the rest of the app's equipment-display fallback (_equipment_display(...) or
    # new_equipment_name) already renders it correctly with no further changes.
    new_equipment_name = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Free-typed equipment name when not found in the CMMS catalog.",
    )

    def validate(self, attrs):
        required_fields = (
            "type",
            "category",
            "model_universal_id",
            "nomenclature",
            "supplier_universal_id",
            "manufacturer_universal_id",
            "oem_part_no",
            "equipment_serial_no",
            "location_on_board",
            "deck",
            "frame_station_from",
            "frame_station_to",
            "location_code",
            "installation_date",
            "authority_of_installation",
            "authority_date",
            "no_of_fits",
            "service_life",
            "equipment_section",
        )
        _validate_common(
            attrs,
            required_fields,
            REQUIRED_CAT2,
            self.expected_category,
            allow_new_equipment_name=True,
        )
        return attrs

    class Meta(SFDTransactionBaseContractSerializer.Meta):
        fields = SFDTransactionBaseContractSerializer.Meta.fields + [
            "new_equipment_name"
        ]


class CAT3Serializer(SFDTransactionBaseContractSerializer):
    expected_category = ShipEquipment.TransactionCategory.CAT3
    # `required=False, allow_blank=True` on BOTH — which of the two is actually mandatory depends
    # on `type` (Equipment vs System), not on either field alone; that conditional check already
    # lives in validate() below (`required = ("new_equipment_name", "new_system_name") if
    # EQUIPMENT else ("new_system_name",)`). Declaring new_equipment_name required=True here (the
    # previous state) short-circuited that: DRF's own field-level validation runs BEFORE
    # validate() ever executes, so a System-type submission — which never sends
    # new_equipment_name at all, only new_system_name (see sfd-actions.service.ts's CAT3
    # payload) — was rejected with "new_equipment_name: This field is required." before
    # validate()'s correct, type-aware check even got a chance to run.
    new_equipment_name = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="New equipment name for CAT3 transactions.",
    )
    new_system_name = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="New system name for CAT3 transactions.",
    )
    new_nomenclature = serializers.CharField(
        help_text="New nomenclature for CAT3 transactions."
    )
    new_oem_name = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        help_text="New OEM name for CAT3 transactions (only when no existing CMMS OEM was picked).",
    )
    new_supplier_name = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="New supplier name for CAT3 transactions (only when no existing CMMS supplier was picked).",
    )
    new_oem_part_no = serializers.CharField(
        help_text="New OEM part number for CAT3 transactions."
    )
    new_serial_no = serializers.CharField(
        write_only=True, help_text="New serial number for CAT3 transactions."
    )

    def validate(self, attrs):
        required_fields = [
            "type",
            "category",
            "model_universal_id",
            "new_nomenclature",
            "supplier_universal_id",
            "manufacturer_universal_id",
            "new_oem_part_no",
            "new_serial_no",
            "location_on_board",
            "deck",
            "frame_station_from",
            "frame_station_to",
            "location_code",
            "installation_date",
            "authority_of_installation",
            "authority_date",
            "no_of_fits",
            "service_life",
            "equipment_section",
        ]
        for field in required_fields:
            if not attrs.get(field):
                raise serializers.ValidationError({field: REQUIRED_CAT3})

        validations = {
            "qty_fitted": (attrs["no_of_fits"] > 0, QTY_FITTED_ERROR),
            "shell_life": (int(attrs["service_life"]) > 0, SHELL_LIFE_ERROR),
            "installation_date": (
                _local_date(attrs["installation_date"]) <= timezone.localdate(),
                INVALID_FUTURE_DATE,
            ),
        }
        if attrs.get("authority_date"):
            validations["authority_date"] = (
                _local_date(attrs["authority_date"]) <= timezone.localdate(),
                INVALID_FUTURE_DATE,
            )
        for field, (is_valid, error) in validations.items():
            if not is_valid:
                raise serializers.ValidationError({field: error})

        if attrs["type"] not in {
            ShipEquipment.TransactionType.EQUIPMENT,
            ShipEquipment.TransactionType.SYSTEM,
        }:
            raise serializers.ValidationError({"type": TYPE_ERROR})
        if attrs["category"] != self.expected_category:
            raise serializers.ValidationError({"category": CATEGORY_ERROR})

        if attrs["type"] == ShipEquipment.TransactionType.EQUIPMENT:
            required = ("new_equipment_name", "new_system_name")
        else:
            required = ("new_system_name",)
        for field in required:
            if not attrs.get(field):
                raise serializers.ValidationError({field: REQUIRED_CAT3})

        # new_oem_name/new_supplier_name are the frontend's free-text escape hatch, only shown
        # (and only meaningful) when the user typed a brand-new OEM/supplier that CMMS doesn't
        # already have a catalog entry for — when an existing one was picked instead,
        # manufacturer_universal_id/supplier_universal_id are populated and these stay blank.
        if not attrs.get("manufacturer_universal_id") and not attrs.get("new_oem_name"):
            raise serializers.ValidationError({"new_oem_name": REQUIRED_CAT3})
        if not attrs.get("supplier_universal_id") and not attrs.get(
            "new_supplier_name"
        ):
            raise serializers.ValidationError({"new_supplier_name": REQUIRED_CAT3})
        return attrs

    class Meta(SFDTransactionBaseContractSerializer.Meta):
        fields = SFDTransactionBaseContractSerializer.Meta.fields + [
            "new_equipment_name",
            "new_system_name",
            "new_nomenclature",
            "new_oem_name",
            "new_supplier_name",
            "new_oem_part_no",
            "new_serial_no",
        ]


class SurveySerializer(SFDTransactionBaseContractSerializer):
    expected_category = ShipEquipment.TransactionCategory.SURVEY
    removal_date = serializers.DateTimeField(
        help_text="Removal date and time for Survey & Demand transactions."
    )
    authority_of_removal = serializers.CharField(
        help_text="Authority for removal on Survey & Demand transactions."
    )
    new_installation_date = serializers.DateTimeField(
        help_text="New installation date and time for Survey & Demand transactions."
    )
    new_serial_no = serializers.CharField(
        source="new_equipment_sr_no",
        help_text="New serial number for Survey & Demand transactions.",
    )
    installation_remark = serializers.CharField(
        source="installation_remarks",
        help_text="Installation Remark for Survey & Demand transactions.",
    )
    new_service_life = serializers.IntegerField(
        help_text="New Shelf Life for Survey & Demand transactions."
    )

    def validate(self, attrs):
        required_fields = [
            "type",
            "category",
            "model_universal_id",
            "nomenclature",
            "supplier_universal_id",
            "manufacturer_universal_id",
            "oem_part_no",
            "equipment_serial_no",
            "removal_date",
            "authority_of_removal",
            "new_equipment_sr_no",
            "new_installation_date",
            "service_life",
            "authority_of_installation",
            "authority_date",
            "no_of_fits",
            "installation_remarks",
            "new_service_life",
        ]
        for field in required_fields:
            if not attrs.get(field):
                raise serializers.ValidationError({field: REQUIRED_SURVEY_DEMAND})

        validations = {
            "qty_fitted": (attrs["no_of_fits"] > 0, QTY_FITTED_ERROR),
            "shell_life": (int(attrs["service_life"]) > 0, SHELL_LIFE_ERROR),
            "new_shell_life": (attrs["new_service_life"] > 0, SHELL_LIFE_ERROR),
            "removal_date": (
                attrs["removal_date"] > attrs["installation_date"],
                "Removal Date Should be Ahead of Installation Date",
            ),
            "new_installation_date": (
                attrs["new_installation_date"] > attrs["removal_date"],
                "New Installation Date Should be Ahead of Removal Date",
            ),
        }
        for field, (is_valid, error) in validations.items():
            if not is_valid:
                raise serializers.ValidationError({field: error})

        if attrs["type"] not in {
            ShipEquipment.TransactionType.EQUIPMENT,
            ShipEquipment.TransactionType.SYSTEM,
        }:
            raise serializers.ValidationError({"type": TYPE_ERROR})
        if attrs["category"] != self.expected_category:
            raise serializers.ValidationError({"category": CATEGORY_ERROR})

        if attrs["type"] == ShipEquipment.TransactionType.EQUIPMENT:
            # System is optional in Equipment mode by product direction — submits fine with or
            # without a System pick, unlike System mode where it's the record being created.
            required = ("equipment_universal_id",)
        else:
            required = ("system_universal_id",)
        for field in required:
            if not attrs.get(field):
                raise serializers.ValidationError({field: REQUIRED_SURVEY_DEMAND})
        return attrs

    class Meta(SFDTransactionBaseContractSerializer.Meta):
        fields = SFDTransactionBaseContractSerializer.Meta.fields + [
            "removal_date",
            "authority_of_removal",
            "new_installation_date",
            "new_serial_no",
            "installation_remark",
            "new_service_life",
        ]


class OthersSerializer(SFDTransactionBaseContractSerializer):
    """Local Purchase. The frontend's FIELD_SPECS deliberately reuses the Survey & Demand field
    set for this category (explicit product direction — see sfd-actions-fields.config.ts's
    OTHERS_FIELDS comment) and sfd-actions.service.ts's buildCreatePayload sends the identical
    SurveyDemandTransactionPayload shape for both, so this mirrors SurveySerializer exactly
    rather than the CAT3-style new_equipment_name/new_system_name shape the frontend never sends."""

    expected_category = ShipEquipment.TransactionCategory.OTHER
    removal_date = serializers.DateTimeField(
        help_text="Removal date and time for Local Purchase transactions."
    )
    authority_of_removal = serializers.CharField(
        help_text="Authority for removal on Local Purchase transactions."
    )
    new_installation_date = serializers.DateTimeField(
        help_text="New installation date and time for Local Purchase transactions."
    )
    new_serial_no = serializers.CharField(
        source="new_equipment_sr_no",
        help_text="New serial number for Local Purchase transactions.",
    )
    installation_remark = serializers.CharField(
        source="installation_remarks",
        help_text="Installation Remark for Local Purchase transactions.",
    )
    new_service_life = serializers.IntegerField(
        help_text="New Shelf Life for Local Purchase transactions."
    )

    def validate(self, attrs):
        required_fields = [
            "type",
            "category",
            "model_universal_id",
            "nomenclature",
            "supplier_universal_id",
            "manufacturer_universal_id",
            "oem_part_no",
            "equipment_serial_no",
            "location_on_board",
            "deck",
            "frame_station_from",
            "frame_station_to",
            "location_code",
            "installation_date",
            "authority_of_installation",
            "authority_date",
            "no_of_fits",
            "service_life",
            "equipment_section",
            "removal_date",
            "authority_of_removal",
            "new_equipment_sr_no",
            "new_installation_date",
            "new_service_life",
            "installation_remarks",
        ]
        for field in required_fields:
            if not attrs.get(field):
                raise serializers.ValidationError({field: REQUIRED_OTHERS})

        validations = {
            "qty_fitted": (attrs["no_of_fits"] > 0, QTY_FITTED_ERROR),
            "shell_life": (int(attrs["service_life"]) > 0, SHELL_LIFE_ERROR),
            "new_shell_life": (attrs["new_service_life"] > 0, SHELL_LIFE_ERROR),
            "installation_date": (
                _local_date(attrs["installation_date"]) <= timezone.localdate(),
                INVALID_FUTURE_DATE,
            ),
            "removal_date": (
                attrs["removal_date"] > attrs["installation_date"],
                "Removal Date Should be Ahead of Installation Date",
            ),
            "new_installation_date": (
                attrs["new_installation_date"] > attrs["removal_date"],
                "New Installation Date Should be Ahead of Removal Date",
            ),
        }
        if attrs.get("authority_date"):
            validations["authority_date"] = (
                _local_date(attrs["authority_date"]) <= timezone.localdate(),
                INVALID_FUTURE_DATE,
            )
        for field, (is_valid, error) in validations.items():
            if not is_valid:
                raise serializers.ValidationError({field: error})

        if attrs["type"] not in {
            ShipEquipment.TransactionType.EQUIPMENT,
            ShipEquipment.TransactionType.SYSTEM,
        }:
            raise serializers.ValidationError({"type": TYPE_ERROR})
        if attrs["category"] != self.expected_category:
            raise serializers.ValidationError({"category": CATEGORY_ERROR})

        if attrs["type"] == ShipEquipment.TransactionType.EQUIPMENT:
            # System is optional in Equipment mode by product direction — submits fine with or
            # without a System pick, unlike System mode where it's the record being created.
            required = ("equipment_universal_id",)
        else:
            required = ("system_universal_id",)
        for field in required:
            if not attrs.get(field):
                raise serializers.ValidationError({field: REQUIRED_OTHERS})
        return attrs

    class Meta(SFDTransactionBaseContractSerializer.Meta):
        fields = SFDTransactionBaseContractSerializer.Meta.fields + [
            "removal_date",
            "authority_of_removal",
            "new_installation_date",
            "new_serial_no",
            "installation_remark",
            "new_service_life",
        ]


DATE_FORMAT = "%d-%b-%Y"
DATETIME_FORMAT = "%d-%b-%Y %H:%M:%S"


def _format_dt(value, fmt):
    if not value:
        return None
    if isinstance(value, datetime):
        localized = timezone.localtime(value) if timezone.is_aware(value) else value
    else:
        localized = value
    return localized.strftime(fmt)


class SFDTransactionReportSerializer(serializers.Serializer):
    def to_representation(self, obj):
        dept_map = self.context.get("dept_map") or {}
        return {
            "equipment_name": _first_value(
                _equipment_display(getattr(obj, "equipment", None)),
                getattr(obj, "new_equipment_name", None),
            )
            or "",
            "sfd_category": getattr(obj, "category", None),
            "transaction_type": getattr(obj, "type", None),
            "transaction_date": _format_dt(
                getattr(obj, "created_at", None), DATETIME_FORMAT
            ),
            "status": _status_label(getattr(obj, "status", None)),
            "serial_no": _first_value(
                getattr(obj, "equipment_serial_no", None),
                getattr(obj, "new_equipment_sr_no", None),
            )
            or "",
            "department": _department_name(obj, dept_map),
        }


class EquipmentInstallationReportSerializer(serializers.Serializer):
    def to_representation(self, obj):
        supplier_map = self.context.get("supplier_map") or {}
        oem_val = supplier_map.get(getattr(obj, "universal_id_m_manufacturer", None))
        supplier_val = supplier_map.get(getattr(obj, "universal_id_m_supplier", None))
        return {
            "equipment_name": _first_value(
                _equipment_display(getattr(obj, "equipment", None)),
                getattr(obj, "new_equipment_name", None),
            )
            or "",
            "serial_no": _first_value(
                getattr(obj, "equipment_serial_no", None),
                getattr(obj, "new_equipment_sr_no", None),
            )
            or "",
            "oem": oem_val or getattr(obj, "new_manufacturer_name", None) or "",
            "supplier": supplier_val or getattr(obj, "new_supplier_name", None) or "",
            "installation_date": _format_dt(
                getattr(obj, "installation_date", None), DATE_FORMAT
            ),
            "installation_authority": _first_value(
                getattr(obj, "authority_of_installation", None),
                getattr(obj, "authority_installation", None),
            ),
            "deck_no": getattr(obj, "deck", None),
            "frame_station": getattr(obj, "frame", None) or "",
            "compartment": getattr(obj, "location_on_board", None),
        }


class EquipmentLocationReportSerializer(serializers.Serializer):
    def to_representation(self, obj):
        location_code = getattr(obj, "location_code", None)
        location_map = dict(ShipEquipment.Location.choices)
        return {
            "equipment_name": _first_value(
                _equipment_display(getattr(obj, "equipment", None)),
                getattr(obj, "new_equipment_name", None),
            )
            or "",
            "equipment_code": _first_value(
                getattr(getattr(obj, "equipment", None), "equipment_code", None),
                getattr(obj, "equipment_code", None),
            )
            or "",
            "deck_no": getattr(obj, "deck", None),
            "frame_station": getattr(obj, "frame", None) or "",
            "location": (
                f"{location_map.get(location_code, 'Unknown')} ({location_code})"
                if location_code
                else ""
            ),
            "compartment": getattr(obj, "location_on_board", None),
            "qty_fitted": getattr(obj, "no_of_fits", None),
        }


class RemovedEquipmentReportSerializer(serializers.Serializer):
    def to_representation(self, obj):
        tx = getattr(obj, "ship_equipment", None)
        equipment = getattr(obj, "equipment", None) or getattr(tx, "equipment", None)
        return {
            "equipment_code": getattr(equipment, "equipment_code", None) or "",
            "equipment_name": _first_value(
                _equipment_display(equipment),
                getattr(tx, "new_equipment_name", None),
            )
            or "",
            "serial_no": _first_value(
                getattr(obj, "equipment_serial_no", None),
                getattr(tx, "equipment_serial_no", None),
                getattr(tx, "new_equipment_sr_no", None),
            )
            or "",
            "removal_date": _format_dt(getattr(obj, "removal_date", None), DATE_FORMAT),
            "removal_remark": getattr(obj, "removal_remark", None),
            "removal_authority": getattr(obj, "authority_of_removal", None),
            "installation_authority": _first_value(
                getattr(obj, "authority_of_installation", None),
                getattr(tx, "authority_of_installation", None),
                getattr(tx, "authority_installation", None),
            ),
            "status": self._status(getattr(obj, "approved_reject", None)),
            "is_sync": self._is_sync(getattr(obj, "is_synced", None)),
        }

    @staticmethod
    def _status(value):
        status_map = {1: "approved", 2: "Pending", 3: "Rejected"}
        return status_map.get(value, str(value) if value is not None else "Pending")

    @staticmethod
    def _is_sync(value):
        if value == 1:
            return "sync"
        if value == 0 or value is None:
            return "not_sync"
        return str(value)


class ApprovalStatusReportSerializer(RemovedEquipmentReportSerializer):
    def to_representation(self, obj):
        data = super().to_representation(obj)
        request_type = getattr(obj, "request_type", None)
        data.update(
            {
                "rh_at_installation": getattr(
                    obj, "rh_of_new_equipment_at_time_of_installation", None
                ),
                "install_date": _format_dt(
                    getattr(obj, "installation_date", None), DATE_FORMAT
                ),
                "installation_remark": getattr(obj, "installation_remark", None),
                "approval_request_type": (
                    "Remove"
                    if request_type == 1
                    else "Change Sr. No."
                    if request_type == 2
                    else str(request_type)
                    if request_type is not None
                    else ""
                ),
            }
        )
        return data


class ShipEquipmentConfigurationReportSerializer(serializers.Serializer):
    def to_representation(self, obj):
        location_code = getattr(obj, "location_code", None)
        location_map = dict(ShipEquipment.Location.choices)
        dept_map = self.context.get("dept_map") or {}
        return {
            "equipment_name": _first_value(
                _equipment_display(getattr(obj, "equipment", None)),
                getattr(obj, "new_equipment_name", None),
            )
            or "",
            "transaction_type": getattr(obj, "type", None),
            "is_system": getattr(obj, "is_system", None),
            "transaction_category": getattr(obj, "category", None) or "",
            "equipment_sr_no": _first_value(
                getattr(obj, "equipment_serial_no", None),
                getattr(obj, "new_equipment_sr_no", None),
            )
            or "",
            "equipment_model": _first_value(
                getattr(obj, "equipment_model", None),
                getattr(getattr(obj, "equipment", None), "model", None),
            )
            or "",
            "equipment_nomenclature": _first_value(
                getattr(obj, "nomenclature", None),
                getattr(obj, "new_nomenclature", None),
            )
            or "",
            "location": (
                f"{location_map.get(location_code, 'Unknown')} ({location_code})"
                if location_code
                else ""
            ),
            "compartment": getattr(obj, "location_on_board", None),
            "oem_part_no": _first_value(
                getattr(obj, "oem_part_no", None),
                getattr(obj, "new_oem_part_no", None),
            )
            or "",
            # Was missing entirely from this dict -- the frontend's "Qty Fitted" column
            # (sfd-reports.data.ts's "Qty Fitted" -> "qty_fitted" key map) had no key to read,
            # so every row showed it blank even though `no_of_fits` is populated on the model.
            "qty_fitted": getattr(obj, "no_of_fits", None),
            "deck_no": getattr(obj, "deck", None),
            "installation_date": _format_dt(
                getattr(obj, "installation_date", None), DATE_FORMAT
            ),
            "manufacture": _first_value(
                _supplier_display(getattr(obj, "manufacturer", None)),
                getattr(obj, "new_manufacturer_name", None),
            )
            or "",
            "supplier": _first_value(
                _supplier_display(getattr(obj, "supplier", None)),
                getattr(obj, "new_supplier_name", None),
            )
            or "",
            "maintop_id": getattr(obj, "maintop_id", None),
            "service_life": getattr(obj, "service_life", None),
            "approval_status": _status_label(getattr(obj, "status", None)),
            "frame_station": getattr(obj, "frame", None),
            "department": _department_name(obj, dept_map),
            "sub_department": getattr(
                getattr(obj, "sub_department_f_key", None), "name", None
            )
            or "",
        }


class ReportExportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportExportJob
        fields = "__all__"


class CompartmentViewSet(MessageModelViewSet):
    serializer_class = CompartmentSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = CompartmentFilter
    search_fields = ["name"]
    ordering_fields = ["id", "name", "frame_station_from", "frame_station_to"]
    ordering = ["name"]
    create_message = "Compartment created successfully."
    update_message = "Compartment updated successfully."
    delete_message = "Compartment deleted successfully."

    def get_queryset(self):
        return CompartmentMaster.objects.filter(is_deleted=False)


class SubDepartmentViewSet(MessageModelViewSet):
    serializer_class = SubDepartmentContractSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = SubDepartmentFilter
    search_fields = ["name", "code"]
    ordering_fields = ["id", "name", "code"]
    ordering = ["code"]
    create_message = "Sub-department created successfully."
    update_message = "Sub-department updated successfully."
    delete_message = "Sub-department deleted successfully."

    def get_queryset(self):
        # equipment_count is live-computed here rather than read off the stored model
        # column — matches the reference project's Sub Department listing, which counts
        # ShipEquipment rows currently pointing at each sub department (Count aggregate,
        # not a field that's incremented/decremented as assignments change and would
        # otherwise drift out of sync silently).
        qs = (
            SubDepartment.objects.select_related("department_name")
            .filter(is_deleted=False)
            .annotate(live_equipment_count=Count("shipequipment", distinct=True))
        )
        return self._scope_to_caller(qs, self.request)

    def _scope_to_caller(self, qs, request):
        """Page-local role scoping, matching the reference project's SectionCreateView
        exactly (not rbac.can_see_all_departments, which would widen every other
        department-scoped screen in the app along with it): an admin sees every
        department's sub departments; a Dy HOD of EXECUTIVE sees only their own
        executive_sub_department; everyone else sees only their own department's.
        """
        if rbac.is_admin_role(request.user):
            return qs
        role_name, dep_name, dept_id, exe_sub_dep = get_user_info(request.user)
        if dep_name == "EXECUTIVE" and role_name == rbac.ROLE_DY_HOD:
            return qs.filter(name=exe_sub_dep, department_name_id=dept_id)
        return qs.filter(department_name_id=dept_id)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Per-department {total, cmms, swmm, in_use} breakdown behind the summary strip
        above the Sub-Departments grid — same scope _scope_to_caller applies to the list
        itself, so the two never disagree about which departments are even visible.
        """
        qs = self._scope_to_caller(
            SubDepartment.objects.select_related("department_name").filter(
                is_deleted=False
            ),
            request,
        ).annotate(live_equipment_count=Count("shipequipment", distinct=True))

        by_department: dict[str, dict[str, int]] = {}
        for sd in qs:
            dept_label = sd.department_name.name if sd.department_name else "-"
            bucket = by_department.setdefault(
                dept_label,
                {
                    "department": dept_label,
                    "total": 0,
                    "cmms": 0,
                    "swmm": 0,
                    "in_use": 0,
                },
            )
            bucket["total"] += 1
            is_cmms = bool((sd.universal_id_m_sub_department or "").strip())
            bucket["cmms" if is_cmms else "swmm"] += 1
            if sd.live_equipment_count:
                bucket["in_use"] += 1

        rows = sorted(by_department.values(), key=lambda r: r["department"])
        return Response(
            {
                "status": True,
                "total": sum(r["total"] for r in rows),
                "by_department": rows,
                "can_see_all_departments": rbac.is_admin_role(request.user),
                "own_department_id": rbac.department_of(request.user).pk
                if rbac.department_of(request.user)
                else None,
            }
        )


class RHSIMasterListAPIView(APIView):
    """The bulk equipment-masters table behind the Step 2 sub-department gate (see
    SubDepartmentReadinessAPIView) — also where a ship assigns ILMS Vendor Code, System /
    Equipment status, and commits its one-time RHSI (Running Hours) initialisation per
    equipment. `is_admin_role` (the ship IT officer) sees every department at once, since
    only that role initialises the ship and needs to confirm nothing is missing before
    Step 2 runs — matches the reference project's own `rhsi_master_view` exactly, which
    scopes this to ADMIN/SHIPADMIN only, deliberately NOT the ship's other privileged roles
    (CO, COMMAND) that see everything elsewhere in the app. This is a page-local rule, not
    routed through rbac.can_see_all_departments, which would widen every other
    department-scoped screen in the app along with it.
    """

    def get(self, request):
        can_see_all = rbac.is_admin_role(request.user)
        own_department = rbac.department_of(request.user)

        base = ShipEquipment.objects.filter(active=True)
        if can_see_all:
            equipments = base
            sub_departments = SubDepartment.objects.filter(is_deleted=False).order_by(
                "department_name__name", "name"
            )
        else:
            equipments = base.filter(department=own_department)
            sub_departments = SubDepartment.objects.filter(
                department_name=own_department, is_deleted=False
            ).order_by("name")

        equipments = equipments.select_related(
            "department",
            "sub_department_f_key",
            "sub_department_f_key__department_name",
            "equipment",
        ).order_by("department__name", "nomenclature")

        # The Department filter options, derived from the rows actually on the page rather than
        # from Department.objects.all(), so the control can never offer a department with no
        # equipment on this screen — matches the reference project's rhsi_master_view exactly.
        # (Department-less ShipEquipment rows shouldn't occur at all now that the CMMS sync query
        # INNER JOINs M_Department — see fetch_sfd_from_cmms's equivalent in swmmapi/views.py —
        # matching the reference exactly there too, so there's no longer a class of row this page
        # would otherwise need a special Department picker to unstick.)
        department_options = Department.objects.filter(
            pk__in=equipments.values_list("department_id", flat=True)
        ).order_by("name")

        by_department = []
        summary_total = 0
        summary_unassigned = 0
        for dept in department_options:
            dept_qs = equipments.filter(department_id=dept.pk)
            dept_total = dept_qs.count()
            dept_unassigned = dept_qs.filter(sub_department_f_key__isnull=True).count()
            by_department.append(
                {
                    "id": dept.pk,
                    "name": dept.name,
                    "total": dept_total,
                    "assigned": dept_total - dept_unassigned,
                    "unassigned": dept_unassigned,
                    "sub_department_count": SubDepartment.objects.filter(
                        department_name=dept, is_deleted=False
                    ).count(),
                }
            )
            summary_total += dept_total
            summary_unassigned += dept_unassigned

        rows = [
            {
                "id": eq.pk,
                "department_id": eq.department_id,
                "department_name": getattr(eq.department, "name", None) or "",
                "nomenclature": eq.nomenclature or "",
                "sub_department_id": eq.sub_department_f_key_id,
                "ilms_vendor_code": eq.ilms_vendor_code or "",
                "system_status": eq.system_status or "",
                "eq_rhsi": eq.eq_rhsi,
                "rhsi_initialised": eq.rhsi_initialised,
                "rhsi_updated_until": eq.rhsi_updated_until,
                # Equipment identity columns (INS Code / Equipment Name) — matches the
                # reference project's rhsi_master_view exactly: "Equipment Name" is sourced
                # from Equipment.equipment_class, not any ShipEquipment-level name field.
                "equipment_name": getattr(eq.equipment, "equipment_class", None),
                "equipment_code": getattr(eq.equipment, "equipment_code", None),
                # Provenance badge — CMMS if the assigned Sub Department was itself synced
                # from CMMS (carries a universal_id), SWMM if it was picked/seeded locally,
                # matching the reference project's Sub Dept Source column exactly.
                "sub_dept_source": (
                    "CMMS"
                    if getattr(
                        eq.sub_department_f_key, "universal_id_m_sub_department", None
                    )
                    else "SWMM"
                    if eq.sub_department_f_key_id
                    else "NOT_ASSIGNED"
                ),
            }
            for eq in equipments
        ]

        return Response(
            {
                "status": True,
                "can_see_all_departments": can_see_all,
                "can_auto_assign_sub_departments": can_see_all,
                "department_options": [
                    {"id": d.pk, "name": d.name} for d in department_options
                ],
                "sub_departments": [
                    {
                        "id": sd.pk,
                        "name": sd.name,
                        "department_id": sd.department_name_id,
                    }
                    for sd in sub_departments
                ],
                "summary": {
                    "total": summary_total,
                    "assigned": summary_total - summary_unassigned,
                    "unassigned": summary_unassigned,
                    "by_department": by_department,
                },
                "equipments": rows,
            }
        )


class RHSIMasterSaveAPIView(APIView):
    """Bulk save for RHSIMasterListAPIView's table — only rows that actually changed are
    written, matching the reference behaviour this was ported from (a submit of untouched
    rows is a no-op, not a resave). RHSI (`eq_rhsi`/`rhsi_updated_until`) is a one-time
    commit per equipment: once `rhsi_initialised` is set, no further request — however it
    arrives — may change those two fields again, though Vendor Code/Sub Department/System
    Status stay editable indefinitely.
    """

    def post(self, request):
        can_see_all = rbac.is_admin_role(request.user)
        own_department = rbac.department_of(request.user)
        rows = request.data.get("rows") or []
        if not isinstance(rows, list):
            return Response(
                {"status": False, "message": "rows must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_count = 0
        for row in rows:
            row_id = row.get("id")
            if not row_id:
                continue
            equipment = ShipEquipment.objects.filter(pk=row_id, active=True).first()
            if not equipment:
                continue
            if not can_see_all and equipment.department_id != getattr(
                own_department, "pk", None
            ):
                continue

            changed = False

            vendor_code = row.get("vendor_code")
            if vendor_code is not None and vendor_code.strip() != (
                equipment.ilms_vendor_code or ""
            ):
                equipment.ilms_vendor_code = vendor_code.strip() or None
                changed = True

            sub_department_id = row.get("sub_department_id")
            if sub_department_id and str(equipment.sub_department_f_key_id) != str(
                sub_department_id
            ):
                equipment.sub_department_f_key_id = sub_department_id
                changed = True

            system_status = row.get("system_status")
            if system_status and equipment.system_status != system_status:
                equipment.system_status = system_status
                changed = True

            rhsi_status = row.get("rhsi_status")
            if not equipment.rhsi_initialised and rhsi_status is not None:
                rhsi_value = row.get("rhsi_value")
                if rhsi_status == "YES":
                    new_rshi = (
                        str(rhsi_value).strip().replace(":", ".")
                        if rhsi_value
                        else "0.00"
                    )
                else:
                    new_rshi = None
                if equipment.eq_rhsi != new_rshi:
                    equipment.eq_rhsi = new_rshi
                    changed = True

                rhsi_date = row.get("rhsi_date")
                if rhsi_date:
                    try:
                        equipment.rhsi_updated_until = datetime.strptime(
                            str(rhsi_date)[:10], "%Y-%m-%d"
                        )
                        changed = True
                    except ValueError:
                        pass

                equipment.rhsi_initialised = True
                changed = True

                # The Operational Maintenance dashboard's sub-department RHSI chart
                # (ems/views.py's _resolve_equipment_rhsi) prefers EMS's OWN, continuously-tracked
                # `EquipmentName.rhsi` over this ShipEquipment row's `eq_rhsi` — by design, since
                # EMS's own Cumulative Entry/Monthly Book Closing flows keep updating `.rhsi` after
                # this one-time RHSI Master commit, and that ongoing log is the more current source
                # once it exists. But that means an equipment already logged once through EMS (even
                # long before this RHSI Master value was entered) would silently keep showing its
                # old EMS-side number forever — this save just set the real, deliberate baseline, so
                # push it into the linked EquipmentName row(s) too, exactly like a fresh EMS
                # Cumulative Entry would, so the dashboard reflects it immediately instead of the
                # stale reading it would otherwise still show.
                from ems.models import EquipmentName

                EquipmentName.objects.filter(sfd_equipment_id=equipment.pk).update(
                    rhsi=equipment.eq_rhsi,
                    rhsi_updated_until=equipment.rhsi_updated_until,
                )

            if changed:
                equipment.is_synced = True
                equipment.save()
                updated_count += 1

        return Response(
            {
                "status": True,
                "message": f"{updated_count} row(s) updated.",
                "updated_count": updated_count,
            }
        )


class RHSIMasterAutoAssignAPIView(APIView):
    """One-click top-up for whatever's still unassigned after manual RHSI Master work —
    ADMIN/SHIPADMIN only, matching the reference project's own `auto_assign_sub_departments`
    exactly ("Only the ADMIN or SHIPADMIN role may assign sub departments in bulk" — CO and
    COMMAND are deliberately excluded there too), since it writes across every department at
    once and the ship-wide picture needs reviewing before several hundred rows change. Never
    touches a row that already has a sub department (from CMMS or a manual pick) and never
    creates a sub department — a department with none in Masters is reported back untouched,
    same as the readiness gate already reports it as unfixable from this page.

    Within a department, equipment is grouped by its own `section_f_key` first (so related
    equipment lands in the same sub department together, not scattered) and each group goes
    to whichever sub department currently carries the least load — biggest groups placed
    first so the load-balancing isn't skewed by processing order.
    """

    def post(self, request):
        if not rbac.is_admin_role(request.user):
            return Response(
                {
                    "status": False,
                    "message": "Only the ADMIN or SHIPADMIN role may assign sub departments in bulk.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        from ems.models import EquipmentName, SectionName

        assigned_total = 0
        by_department = []
        skipped_departments = []

        # A row can only be routed here once we know WHICH department's sub-departments to
        # distribute it into — `department` (not `sub_department_f_key`) is what tells us that.
        # Rows with no Department set at all (e.g. created through the SFD Add form without a
        # Sub Department picked) are invisible to `unassigned` below and were previously left
        # unreported — silently never fixed by this endpoint while the Step 2 readiness gate
        # keeps counting them regardless, with the operator given no reason why clicking this
        # fixed some rows but not all. Ported from Aug_15 (2026-09-10/11 SFD testing).
        department_less_qs = ShipEquipment.objects.filter(
            active=True, sub_department_f_key__isnull=True, department__isnull=True
        )
        department_less_count = department_less_qs.count()
        department_less_sample = list(
            department_less_qs.order_by("id").values_list("id", "nomenclature")[:20]
        )

        unassigned = ShipEquipment.objects.filter(
            active=True, sub_department_f_key__isnull=True, department__isnull=False
        )
        department_ids = list(
            unassigned.values_list("department_id", flat=True).distinct()
        )

        for dept in Department.objects.filter(pk__in=department_ids).order_by("name"):
            subs = list(
                SubDepartment.objects.filter(
                    department_name=dept, is_deleted=False
                ).order_by("name")
            )
            if not subs:
                skipped_departments.append(
                    {
                        "department": dept.name,
                        "reason": "no sub department exists in SWMM masters for this department",
                    }
                )
                continue

            # Start from what's already on the books so the top-up levels the whole
            # department, not just the newly-assigned rows.
            load = {
                sub.pk: ShipEquipment.objects.filter(
                    active=True, department=dept, sub_department_f_key=sub
                ).count()
                for sub in subs
            }

            # Materialise the groups BEFORE any update runs — "unassigned" is a lazy
            # queryset and the first update would remove its own rows from every later
            # evaluation of it.
            groups = {}
            for row_id, section_id in unassigned.filter(department=dept).values_list(
                "id", "section_f_key_id"
            ):
                groups.setdefault(section_id, []).append(row_id)

            ordered_groups = sorted(
                groups.items(), key=lambda item: (-len(item[1]), str(item[0]))
            )

            dept_assigned = 0
            for _section_id, row_ids in ordered_groups:
                target = min(subs, key=lambda s: (load[s.pk], s.name or ""))
                ShipEquipment.objects.filter(id__in=row_ids).update(
                    sub_department_f_key=target
                )

                # Keep the ems mirror in step — EquipmentName carries its own
                # sub_department/section, and the SFD sync writes both on every import,
                # so leaving them behind here would make the two models disagree about
                # the same equipment.
                section_name_obj = SectionName.objects.filter(
                    name=target.name, department=target.department_name
                ).first()
                mirror = EquipmentName.objects.filter(sfd_equipment_id__in=row_ids)
                if section_name_obj:
                    mirror.update(sub_department=target, section=section_name_obj)
                else:
                    mirror.update(sub_department=target)

                load[target.pk] += len(row_ids)
                dept_assigned += len(row_ids)

            assigned_total += dept_assigned
            by_department.append(
                {
                    "department": dept.name,
                    "assigned": dept_assigned,
                    "distribution": [
                        {"sub_department": sub.name, "total": load[sub.pk]}
                        for sub in subs
                    ],
                }
            )

        return Response(
            {
                "status": True,
                "assigned_total": assigned_total,
                "by_department": by_department,
                "skipped_departments": skipped_departments,
                # See department_less_qs's own doc above — these rows have no `department` at
                # all, so this endpoint has no department to route them into and never touches
                # them. Surfaced explicitly so the operator understands why the Step 2 readiness
                # gate can stay non-zero even after a "N assigned" success — these need a
                # Department set manually first, since Auto Assign can only balance load across
                # a department's EXISTING sub departments.
                "department_less_count": department_less_count,
                "department_less_sample": [
                    {"id": row_id, "nomenclature": nomenclature or ""}
                    for row_id, nomenclature in department_less_sample
                ],
            }
        )


class SFDTransactionViewSet(viewsets.ModelViewSet):
    serializer_class = SourceShipEquipmentSerializer

    pagination_class = FrontendPageNumberPagination
    # SearchFilter dropped: it can only OR across `search_fields` via `icontains`, which raises a
    # DB error on an integer column (Maintop No./Qty Fitted) instead of matching — so those two
    # were previously left out of search entirely. get_queryset() below does the OR itself instead,
    # covering every column the Active list's grid actually shows (INSMA Code, Equipment Name,
    # Nomenclature, Sub Dept, Maintop, Qty), text and numeric alike.
    filter_backends = [filters.OrderingFilter]
    search_fields = [
        "nomenclature",
        "new_nomenclature",
        "equipment_serial_no",
        "new_equipment_sr_no",
        "oem_part_no",
        "equipment_name",
        "new_equipment_name",
        "equipment__equipment_code",
        "sub_department_f_key__name",
    ]
    # Maintop No./Qty Fitted — matched by exact numeric equality (not icontains — see above) when
    # the search term is itself all-digits.
    numeric_search_fields = ["maintop_id", "no_of_fits"]
    ordering_fields = ["id", "nomenclature", "installation_date"]
    ordering = ["id"]

    serializer_map = {
        ShipEquipment.TransactionCategory.CAT1: CAT1Serializer,
        ShipEquipment.TransactionCategory.CAT2: CAT2Serializer,
        ShipEquipment.TransactionCategory.CAT3: CAT3Serializer,
        ShipEquipment.TransactionCategory.SURVEY: SurveySerializer,
        ShipEquipment.TransactionCategory.OTHER: OthersSerializer,
    }

    def get_serializer_class(self):
        # NOTE: cs_swmm_v1 checks `self.action in ("update")`, which — because
        # ("update") is a plain string, not a tuple — only matches when
        # self.action is itself the literal string "update" (PUT), never
        # "partial_update" (PATCH). Replicated here for byte-for-byte parity.
        if self.action in ("update"):
            instance = self.get_object()
            return self.serializer_map.get(
                instance.category, SourceShipEquipmentSerializer
            )
        return SourceShipEquipmentSerializer

    def create(self, request, *args, **kwargs):
        # New CAT1/CAT2/CAT3/Survey/Other submissions are deliberately created Pending CMMS
        # approval (status="2", see SFDTransactionBaseContractSerializer.create) and so won't
        # appear in this viewset's default Active list until approved -- surface that explicitly
        # here instead of letting a successful 201 look identical to an approved/visible row.
        # "status" isn't part of the serializer's own output fields, so it's read off the saved
        # instance directly rather than out of serializer.data.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)

        data = dict(serializer.data)
        is_pending = getattr(serializer.instance, "status", None) == "2"
        data["approval_status"] = "PENDING" if is_pending else "APPROVED"
        if is_pending:
            data["message"] = (
                "Equipment submitted and awaiting CMMS approval. "
                "It will appear in the Active list once approved."
            )
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def get_queryset(self):
        queryset = (
            _ship_equipment_queryset()
            .select_related(
                "equipment",
                "system",
                "ship",
                "supplier",
                "manufacturer",
                "sub_department_f_key",
            )
            .all()
        )
        # RBAC: a non-privileged user only ever sees their own department's equipment here — the
        # same scoping RHSIMasterListAPIView already applies, ported to the Active list/transaction
        # endpoints which had no department gate at all (every user saw every department's 310
        # equipment regardless of role). No department_id query param is sent by the frontend today,
        # so this is a silent no-op for a privileged user (admin/superuser) and an automatic
        # own-department filter for everyone else — see rbac.resolve_selected_department.
        queryset = rbac.scope_queryset_to_department(queryset, self.request)
        # "View Full Form" (openFullFormFromApproval, sfd-management.component.ts) fetches one
        # specific row by its real PK via `retrieve` (GET sfd-list/{id}/) — a still-Pending/
        # Rejected/inactive submission must still be reachable there; that's the whole point of
        # looking it up by id at all, instead of relying on the Active list's own status/active
        # gates below matching first. `list` (the Active list itself) keeps exactly the same
        # filtering as before — unaffected by this exemption.
        if self.action != "retrieve":
            status_param = self.request.query_params.get("status")
            if status_param:
                queryset = queryset.filter(status=status_param)
            else:
                # Default view hides equipment still pending ("2") or rejected ("3") by CMMS
                # approval — everything else (notably the existing "active" default) keeps showing.
                queryset = queryset.exclude(status__in=["2", "3"])
            active = self.request.query_params.get("active")
            if active is not None:
                queryset = queryset.filter(
                    active=str(active).lower() in {"1", "true", "yes"}
                )
            else:
                queryset = queryset.filter(active=True)
        equipment_name = self.request.query_params.get("equipment_name")
        if equipment_name:
            queryset = queryset.filter(
                Q(equipment__equipment_code=equipment_name)
                | Q(equipment__ilms_eq_code=equipment_name)
                | Q(equipment_name=equipment_name)
                | Q(new_equipment_name=equipment_name)
                # Widened alongside ApprovalTrackingAPIView._equipment_name: a CAT1/2/3
                # submission's own display name usually lives on nomenclature/new_nomenclature,
                # not equipment_name — "View Full Form" (which looks up by whatever name that
                # endpoint returned) needs this to still resolve to the same row.
                | Q(nomenclature=equipment_name)
                | Q(new_nomenclature=equipment_name)
            )
        nomenclature = self.request.query_params.get("nomenclature")
        if nomenclature:
            queryset = queryset.filter(nomenclature=nomenclature)
        sub_dept = self.request.query_params.get("sub_dept")
        if sub_dept:
            if str(sub_dept).isdigit():
                queryset = queryset.filter(sub_department_f_key_id=int(sub_dept))
            else:
                queryset = queryset.filter(sub_department_f_key__name=sub_dept)
        maintop_id = self.request.query_params.get("maintop_id")
        if maintop_id:
            queryset = queryset.filter(maintop_id=maintop_id)
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            search_q = Q()
            for field_name in self.search_fields:
                search_q |= Q(**{f"{field_name}__icontains": search})
            if search.lstrip("-").isdigit():
                search_int = int(search)
                for field_name in self.numeric_search_fields:
                    search_q |= Q(**{field_name: search_int})
            queryset = queryset.filter(search_q)
        return queryset

    @action(detail=True, methods=["get"], url_path="remove-details")
    def remove_details(self, request, pk=None):
        tx = self.get_object()
        return Response(
            {
                "equipment_nomenclature": tx.nomenclature,
                "equipment_sr_no": tx.equipment_serial_no,
                "sub_dept": (
                    tx.sub_department_f_key.name if tx.sub_department_f_key else ""
                ),
                "compartment_name": tx.location_on_board,
                "removal_date": None,
                "removal_authority": "",
                "removal_remark": "",
            }
        )

    @action(detail=True, methods=["post"], url_path="remove")
    def remove(self, request, pk=None):
        tx = self.get_object()
        removal_date = request.data.get("removal_date")
        removal_authority = request.data.get("removal_authority") or ""
        removal_remark = request.data.get("removal_remark") or ""
        remove_request = RemoveEquipment.objects.create(
            equipment=tx.equipment or Equipment.objects.first(),
            ship_equipment=tx,
            removal_remark=removal_remark,
            removal_date=removal_date,
            authority_of_removal=removal_authority,
            equipment_serial_no=tx.equipment_serial_no,
            request_type=1,
            is_synced=0,
            approved_reject=2,  # Pending — explicit, not left to the None fallback
            universal_id_ch_sfd_remove_equipment_request=_uid("SFDRER"),
        )
        _push_remove_request_to_cmms(remove_request, tx)
        return Response(
            RemoveEquipmentContractSerializer(remove_request).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="update_sr_no_details")
    def update_sr_no_details(self, request, pk=None):
        tx = self.get_object()
        return Response(
            {
                "equipment_nomenclature": tx.nomenclature,
                "current_sr_no": tx.equipment_serial_no,
                "sub_dept": (
                    tx.sub_department_f_key.name if tx.sub_department_f_key else ""
                ),
                "maintop_no": tx.maintop_id,
                "new_sr_no": "",
            }
        )

    @action(detail=True, methods=["post"], url_path="update_sr_no")
    def update_sr_no(self, request, pk=None):
        tx = self.get_object()
        new_sr_no = request.data.get("new_sr_no")
        remove_request = RemoveEquipment.objects.create(
            equipment=tx.equipment or Equipment.objects.first(),
            ship_equipment=tx,
            removal_remark="",
            equipment_serial_no=new_sr_no,
            request_type=2,
            is_synced=0,
            approved_reject=2,  # Pending — explicit, not left to the None fallback
            universal_id_ch_sfd_remove_equipment_request=_uid("SFDRER"),
        )
        _push_remove_request_to_cmms(remove_request, tx)
        return Response(
            RemoveEquipmentContractSerializer(remove_request).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="open-dependencies")
    def open_dependencies(self, request, pk=None):
        return Response({"open_defects": [], "maintenance_routines": []})


class ShipFitDefinitionViewSet(SFDTransactionViewSet):
    http_method_names = ["get", "patch", "head", "options"]


class SFDActionViewSet(viewsets.GenericViewSet):
    serializer_action_classes = {
        "cat1": CAT1Serializer,
        "cat2": CAT2Serializer,
        "cat3": CAT3Serializer,
        "survey_demand": SurveySerializer,
        "others": OthersSerializer,
    }

    def get_serializer_class(self):
        if self.action in self.serializer_action_classes:
            return self.serializer_action_classes[self.action]
        category_map = {
            "CAT1": CAT1Serializer,
            "CAT2": CAT2Serializer,
            "CAT3": CAT3Serializer,
            "SURVEY": SurveySerializer,
            "OTHER": OthersSerializer,
        }
        return category_map.get(
            self.request.data.get("transaction_category"), SourceShipEquipmentSerializer
        )

    def _create_transaction(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        response_serializer = self.get_serializer(instance)
        data = dict(response_serializer.data)
        is_pending = getattr(instance, "status", None) == "2"
        data["approval_status"] = "PENDING" if is_pending else "APPROVED"
        if is_pending:
            data["message"] = (
                "Equipment submitted and awaiting CMMS approval. "
                "It will appear in the Active list once approved."
            )
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="cat1")
    def cat1(self, request):
        return self._create_transaction(request)

    @action(detail=False, methods=["post"], url_path="cat2")
    def cat2(self, request):
        return self._create_transaction(request)

    @action(detail=False, methods=["post"], url_path="cat3")
    def cat3(self, request):
        return self._create_transaction(request)

    @action(detail=False, methods=["post"], url_path="survey-demand")
    def survey_demand(self, request):
        return self._create_transaction(request)

    @action(detail=False, methods=["post"], url_path="others")
    def others(self, request):
        return self._create_transaction(request)


class EquipmentCompartmentMappingViewSet(MessageModelViewSet):
    serializer_class = EquipmentCompartmentMappingSerializer
    filter_backends = [filters.OrderingFilter]
    ordering = ["-created_at"]

    def get_queryset(self):
        return EquipmentCompartmentMapping.objects.select_related(
            "equipment", "compartment"
        )


def _resolve_universal_id(value):
    if isinstance(value, dict):
        return value.get("universal_id_t_equipment_ship_detail")
    return value


class EquipmentSystemMapSerializer(serializers.Serializer):
    equipment = serializers.JSONField(
        help_text=(
            "universal_id_t_equipment_ship_detail of the equipment row, or a list of "
            "them to map several equipment to the same system in one call. Each entry "
            "accepts either the raw id string or an object containing "
            "'universal_id_t_equipment_ship_detail'."
        )
    )
    system = serializers.JSONField(
        help_text=(
            "universal_id_t_equipment_ship_detail of the system row. Accepts "
            "either the raw id string or an object containing "
            "'universal_id_t_equipment_ship_detail'."
        )
    )

    def validate(self, attrs):
        raw_equipment = attrs["equipment"]
        equipment_ids = (
            [_resolve_universal_id(item) for item in raw_equipment]
            if isinstance(raw_equipment, list)
            else [_resolve_universal_id(raw_equipment)]
        )
        system_id = _resolve_universal_id(attrs["system"])

        system_row = ShipEquipment.objects.filter(
            universal_id_t_equipment_ship_detail=system_id
        ).first()
        if not system_row:
            raise serializers.ValidationError(
                {"system": "No matching system record found."}
            )

        equipment_rows = []
        for equipment_id in equipment_ids:
            if equipment_id == system_id:
                raise serializers.ValidationError(
                    "Equipment and system must refer to different records."
                )
            equipment_row = ShipEquipment.objects.filter(
                universal_id_t_equipment_ship_detail=equipment_id
            ).first()
            if not equipment_row:
                raise serializers.ValidationError(
                    {"equipment": f"No matching equipment record found for '{equipment_id}'."}
                )
            equipment_rows.append(equipment_row)

        attrs["system"] = system_id
        attrs["system_row"] = system_row
        attrs["equipment_rows"] = equipment_rows
        return attrs

    def save(self, **kwargs):
        system_row = self.validated_data["system_row"]
        equipment_rows = self.validated_data["equipment_rows"]

        with transaction.atomic():
            system_row.is_system = True
            system_row.save(update_fields=["is_system"])

            for equipment_row in equipment_rows:
                equipment_row.mapped_to = system_row.universal_id_t_equipment_ship_detail
                equipment_row.mapping_status = ShipEquipment.MappingStatus.MAPPED
                equipment_row.mapped_at = timezone.now()
                equipment_row.save(
                    update_fields=["mapped_to", "mapping_status", "mapped_at"]
                )

        return {"equipment_rows": equipment_rows, "system_row": system_row}


class EquipmentSystemMappingUpdateSerializer(serializers.Serializer):
    system = serializers.JSONField(required=False)
    mapping_status = serializers.ChoiceField(
        choices=ShipEquipment.MappingStatus.choices, required=False
    )

    def validate(self, attrs):
        if "system" not in attrs and "mapping_status" not in attrs:
            raise serializers.ValidationError(
                "At least one of 'system' or 'mapping_status' is required."
            )
        if "system" in attrs:
            system_id = _resolve_universal_id(attrs["system"])
            system_row = ShipEquipment.objects.filter(
                universal_id_t_equipment_ship_detail=system_id
            ).first()
            if not system_row:
                raise serializers.ValidationError(
                    {"system": "No matching system record found."}
                )
            attrs["system"] = system_id
            attrs["system_row"] = system_row
        return attrs


def _refresh_is_system(universal_id):
    has_mapping = ShipEquipment.objects.filter(
        mapped_to=universal_id, mapping_status=ShipEquipment.MappingStatus.MAPPED
    ).exists()
    ShipEquipment.objects.filter(
        universal_id_t_equipment_ship_detail=universal_id
    ).update(is_system=has_mapping)


class EquipmentSystemMappingFilter(django_filters.FilterSet):
    equipment = django_filters.CharFilter(
        field_name="universal_id_t_equipment_ship_detail"
    )
    system = django_filters.CharFilter(field_name="mapped_to")
    mapping_status = django_filters.CharFilter(field_name="mapping_status")
    addition_date_from = django_filters.DateFilter(
        field_name="mapped_at", lookup_expr="date__gte"
    )
    addition_date_to = django_filters.DateFilter(
        field_name="mapped_at", lookup_expr="date__lte"
    )

    class Meta:
        model = ShipEquipment
        fields = [
            "equipment",
            "system",
            "mapping_status",
            "addition_date_from",
            "addition_date_to",
        ]


class EquipmentSystemMappingViewSet(viewsets.GenericViewSet):
    http_method_names = ["get", "patch", "delete", "head", "options"]

    lookup_field = "universal_id_t_equipment_ship_detail"
    pagination_class = FrontendPageNumberPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = EquipmentSystemMappingFilter

    def get_queryset(self):
        return (
            ShipEquipment.objects.select_related("equipment")
            .exclude(mapped_to__isnull=True)
            .exclude(mapped_to="")
            .order_by("-mapped_at")
        )

    def _serialize(self, rows):
        rows = list(rows)
        system_rows = {
            row.universal_id_t_equipment_ship_detail: row
            for row in ShipEquipment.objects.select_related("equipment").filter(
                universal_id_t_equipment_ship_detail__in=[row.mapped_to for row in rows]
            )
        }
        data = []
        for row in rows:
            system_row = system_rows.get(row.mapped_to)
            data.append(
                {
                    "equipment": {
                        "universal_id_t_equipment_ship_detail": (
                            row.universal_id_t_equipment_ship_detail
                        ),
                        "label": equipment_label(
                            _equipment_display(row.equipment),
                            row.location_on_board,
                        ),
                    },
                    "system": {
                        "universal_id_t_equipment_ship_detail": row.mapped_to,
                        "label": equipment_label(
                            _equipment_display(system_row.equipment)
                            if system_row
                            else None,
                            system_row.location_on_board if system_row else None,
                        ),
                    },
                    # Raw datetime serialized straight through here used to hand the frontend
                    # "2026-09-07T08:57:32.066693Z" verbatim (it just does
                    # `(item.addition_date ?? '').trim()`, no formatting of its own) — same
                    # "%d-%b-%Y %H:%M:%S" convention the transaction reports use for a
                    # full timestamp.
                    "addition_date": (
                        timezone.localtime(row.mapped_at).strftime("%d-%b-%Y %H:%M:%S")
                        if row.mapped_at
                        else ""
                    ),
                    "mapping_status": row.mapping_status,
                }
            )
        return data

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        data = self._serialize(page if page is not None else queryset)
        if page is not None:
            return self.get_paginated_response(data)
        return Response({"message": "Mappings retrieved successfully.", "data": data})

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = EquipmentSystemMappingUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        old_mapped_to = instance.mapped_to
        update_fields = []

        if "system_row" in validated:
            new_system_row = validated["system_row"]
            instance.mapped_to = new_system_row.universal_id_t_equipment_ship_detail
            update_fields.append("mapped_to")
            new_system_row.is_system = True
            new_system_row.save(update_fields=["is_system"])

        if "mapping_status" in validated:
            instance.mapping_status = validated["mapping_status"]
            update_fields.append("mapping_status")

        instance.save(update_fields=update_fields)

        if old_mapped_to and old_mapped_to != instance.mapped_to:
            _refresh_is_system(old_mapped_to)
        if instance.mapped_to:
            _refresh_is_system(instance.mapped_to)

        data = self._serialize([instance])[0]
        return Response({"message": "Mapping updated successfully.", "data": data})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        old_mapped_to = instance.mapped_to

        instance.mapped_to = None
        instance.mapping_status = None
        instance.mapped_at = None
        instance.save(update_fields=["mapped_to", "mapping_status", "mapped_at"])

        if old_mapped_to:
            _refresh_is_system(old_mapped_to)

        return Response({"message": "Mapping deleted successfully."})


class EquipmentSystemMappingListAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ = request
        rows = (
            ShipEquipment.objects.select_related("equipment")
            .exclude(mapped_to__isnull=True)
            .exclude(mapped_to="")
        )
        system_rows = {
            row.universal_id_t_equipment_ship_detail: row
            for row in ShipEquipment.objects.filter(
                universal_id_t_equipment_ship_detail__in=[
                    row.mapped_to for row in rows if row.mapped_to
                ]
            )
        }
        data = []
        for row in rows.order_by("-mapped_at", "-id"):
            system_row = system_rows.get(row.mapped_to)
            data.append(
                {
                    "id": row.id,
                    "equipment_ship_id": row.universal_id_t_equipment_ship_detail,
                    "equipment": row.equipment_id,
                    "system": getattr(system_row, "id", None),
                    "equipment_name": row.equipment_name,
                    "new_equipment_name": row.new_equipment_name,
                    "new_system_name": getattr(system_row, "new_system_name", None),
                    "equipment_master_name": (
                        row.equipment.equipment_name if row.equipment else None
                    ),
                    "mapping_status": row.mapping_status,
                    "mapped_to": row.mapped_to,
                    "mapped_at": row.mapped_at,
                }
            )
        return Response(data)


class ConfigurationOptionsAPIView(APIView):
    def get(self, request):
        return Response(
            {
                "compartment": {
                    "upper_decks": [
                        {"value": value, "label": _deck_label(value, label)}
                        for value, label in CompartmentMaster.UpperDeck.choices
                    ],
                    "lower_decks": [
                        {"value": value, "label": _deck_label(value, label)}
                        for value, label in CompartmentMaster.LowerDeck.choices
                    ],
                    "locations": [
                        {"value": value, "label": label}
                        for value, label in CompartmentMaster.Location.choices
                    ],
                },
                "department": [
                    {"id": d.id, "value": d.id, "label": d.name, "code": d.code}
                    for d in Department.objects.order_by("name", "code")
                ],
            }
        )


def _sorted_by_label(items, key, numeric=False):
    """Ascending sort for a dropdown-option list of dicts — case-insensitive by default (so
    "apple"/"Banana" interleave the way a user expects), or numeric when the label is really a
    number as a string (e.g. Shelf Life's "1"/"2"/"10" — alphabetical would put "10" before "2").
    None/blank labels sort last rather than raising or crashing the comparison.
    """

    def sort_key(item):
        value = item.get(key)
        if numeric:
            try:
                return (0, float(value))
            except (TypeError, ValueError):
                return (1, 0)
        if value in (None, ""):
            return (1, "")
        return (0, str(value).lower())

    return sorted(items, key=sort_key)


class AddSFDEquipementAPIView(APIView):
    def get(self, request):
        # Was an unconditional `.filter(department=request.user.user_profile.department)` —
        # correct for an ordinary department-scoped user, but ADMIN/SHIPADMIN/CO/Command's own
        # `user_profile.department` is the "ADMIN" bucket (a real Department row, id 1, but not
        # one any real ShipEquipment is ever assigned to) rather than "no department filter at
        # all". That silently zeroed out `transaction_universal_ids` below for exactly the roles
        # this Add-equipment form matters most for, so EVERY dropdown on the form (Equipment
        # Name, Model, OEM Name, Supplier, OEM Part No, ...) rendered empty — "No results found"
        # — no matter how much real ShipEquipment/Equipment/Manufacturer/Supplier data existed.
        # rbac.scope_queryset_to_department is the same shared helper every other
        # department-visibility check in this file already routes through (RecentActivityAPIView,
        # ApprovalTrackingAPIView, SFDTransactionViewSet, ...) — a privileged role sees every
        # department's equipment here too, matching what CAT I/II/III/Survey/Local Purchase Adds
        # can already reference elsewhere on this same form.
        ship_equipment_qs = rbac.scope_queryset_to_department(
            _ship_equipment_queryset(), request, field="department_id"
        )
        transaction_universal_ids = ship_equipment_qs.values_list(
            "universal_id_m_equipment", flat=True
        ).distinct()

        equipment_details = (
            Equipment.objects.filter(
                universal_id_m_equipment__in=transaction_universal_ids
            )
            .exclude(
                Q(equipment_class__isnull=True)
                & Q(equipment_code__isnull=True)
                & Q(ilms_eq_code__isnull=True)
            )
            .exclude(Q(equipment_class="") & Q(equipment_code="") & Q(ilms_eq_code=""))
            .values(
                "universal_id_m_equipment",
                "equipment_class",
                "equipment_code",
                "ilms_eq_code",
            )
            .distinct()
        )
        equipment_names = [
            {
                "universal_id_m_equipment": item["universal_id_m_equipment"],
                "equipment_name": (
                    item["equipment_class"]
                    or item["equipment_code"]
                    or item["ilms_eq_code"]
                ),
            }
            for item in equipment_details
        ]
        system_names = [
            {
                "universal_id_m_equipment": item["universal_id_m_equipment"],
                "system_name": (
                    item["equipment_class"]
                    or item["equipment_code"]
                    or item["ilms_eq_code"]
                ),
            }
            for item in equipment_details
        ]

        model_details = (
            Equipment.objects.filter(
                universal_id_m_equipment__in=transaction_universal_ids
            )
            .exclude(model__isnull=True)
            .exclude(model="")
            .values("universal_id_m_equipment", "model")
            .distinct()
        )
        models_list = [
            {
                "universal_id_m_equipment": item["universal_id_m_equipment"],
                "model": item["model"],
            }
            for item in model_details
        ]

        nomenclature_details = (
            ship_equipment_qs.exclude(
                Q(nomenclature__isnull=True) & Q(new_nomenclature__isnull=True)
            )
            .exclude(Q(nomenclature="") & Q(new_nomenclature=""))
            .values("universal_id_m_equipment", "nomenclature", "new_nomenclature")
            .distinct()
        )
        nomenclatures = [
            {
                "universal_id_m_equipment": item["universal_id_m_equipment"],
                "Nomenclature": item["nomenclature"] or item["new_nomenclature"],
            }
            for item in nomenclature_details
        ]

        equipment_sr_no_details = (
            ship_equipment_qs.exclude(
                Q(equipment_serial_no__isnull=True)
                & Q(new_equipment_sr_no__isnull=True)
            )
            .exclude(Q(equipment_serial_no="") & Q(new_equipment_sr_no=""))
            .values(
                "universal_id_m_equipment", "equipment_serial_no", "new_equipment_sr_no"
            )
            .distinct()
        )
        equipment_sr_no = [
            {
                "universal_id_m_equipment": item["universal_id_m_equipment"],
                "Equipment_sr_no": item["equipment_serial_no"]
                or item["new_equipment_sr_no"],
            }
            for item in equipment_sr_no_details
        ]

        # Root cause of "OEM Name doesn't auto-fetch" (part 2): reading only the raw denormalized
        # CharField here misses every row whose manufacturer was set via the `manufacturer` FK
        # instead (see EquipmentDropdownAPIView's identical fix above) — this dropdown feeds the
        # very lookup the Add form's cascade uses to resolve oem_name_id into a display label, so
        # an incomplete list here breaks auto-fetch even after the cascade itself returns a uid.
        manufacturer_universal_ids = {
            uid
            for uid in (
                _first_value(
                    row.universal_id_m_manufacturer,
                    getattr(row.manufacturer, "Universal_ID_M_Supplier", None),
                )
                for row in ship_equipment_qs.select_related("manufacturer")
            )
            if uid
        }
        manufacturer_details = (
            Supplier.objects.filter(
                Universal_ID_M_Supplier__in=manufacturer_universal_ids
            )
            .exclude(SupplierName__isnull=True, supplier_name__isnull=True)
            .values(
                "Universal_ID_M_Supplier",
                "SupplierName",
                "supplier_name",
            )
            .distinct()
        )
        manufacturers = [
            {
                "universal_id_M_supplier": item["Universal_ID_M_Supplier"],
                "manufacturer_name": item["SupplierName"] or item["supplier_name"],
            }
            for item in manufacturer_details
            if item["SupplierName"] or item["supplier_name"]
        ]

        # Same fallback as manufacturer_universal_ids above — a row's Supplier can likewise be set
        # via the `supplier` FK only, with the denormalized CharField left blank.
        supplier_universal_ids = {
            uid
            for uid in (
                _first_value(
                    row.universal_id_m_supplier,
                    getattr(row.supplier, "Universal_ID_M_Supplier", None),
                )
                for row in ship_equipment_qs.select_related("supplier")
            )
            if uid
        }
        supplier_details = (
            Supplier.objects.filter(Universal_ID_M_Supplier__in=supplier_universal_ids)
            .values("Universal_ID_M_Supplier", "SupplierName", "supplier_name")
            .distinct()
        )
        suppliers = [
            {
                "universal_id_M_supplier": item["Universal_ID_M_Supplier"],
                "supplier_name": item["SupplierName"] or item["supplier_name"],
            }
            for item in supplier_details
            if item["SupplierName"] or item["supplier_name"]
        ]

        oem_parts_details = (
            ship_equipment_qs.exclude(
                Q(oem_part_no__isnull=True) & Q(new_oem_part_no__isnull=True)
            )
            .exclude(Q(oem_part_no="") & Q(new_oem_part_no=""))
            .values("universal_id_m_equipment", "oem_part_no", "new_oem_part_no")
            .distinct()
        )
        oem_parts = [
            {
                "universal_id_m_equipment": item["universal_id_m_equipment"],
                "oem_part_no": item["oem_part_no"] or item["new_oem_part_no"],
            }
            for item in oem_parts_details
        ]

        compartment_details = (
            CompartmentMaster.objects.exclude(name__isnull=True)
            .exclude(name="")
            .values("id", "name")
            .distinct()
        )
        compartment_names = [
            {"compartment_id": item["id"], "compartment_name": item["name"]}
            for item in compartment_details
        ]

        shelf_lifes_details = (
            ship_equipment_qs.exclude(service_life__isnull=True)
            .exclude(service_life="")
            .values_list("service_life", flat=True)
            .distinct()
        )
        shelf_lifes = [
            {"shelf_lifes_id": item, "shelf_lifes_name": item}
            for item in shelf_lifes_details
        ]

        # Was scoped to only sub departments already REFERENCED by an existing transaction
        # (universal_id_m_sub_department__in=...) — on a ship where CMMS has only assigned a
        # handful of equipment a sub department so far, that left this dropdown offering just
        # 2-3 options instead of the full Sub Department master ship staff maintain under
        # Ship Configuration's Reference Data tab. The Add/Update form needs the complete
        # list to assign any sub department, not just ones something already happens to use.
        section_details = (
            SubDepartment.objects.filter(is_deleted=False)
            .exclude(name__isnull=True)
            .exclude(name="")
            .values("universal_id_m_sub_department", "name")
            .distinct()
        )
        equipment_sections = [
            {
                "universal_id_m_sub_department": item["universal_id_m_sub_department"],
                "sub_department_name": item["name"],
            }
            for item in section_details
        ]

        ch_eq_type_universal_ids = list(
            ship_equipment_qs.exclude(
                universal_id_ch_master_equipment_type__isnull=True
            )
            .exclude(universal_id_ch_master_equipment_type="")
            .values_list("universal_id_ch_master_equipment_type", flat=True)
            .distinct()
        )
        ch_eq_type_details = (
            EquipmentType.objects.filter(
                Universal_ID_Ch_Master_Equipment_Type__in=ch_eq_type_universal_ids
            )
            .exclude(Equipment_Desc__isnull=True)
            .exclude(Equipment_Desc="")
            .values("Universal_ID_Ch_Master_Equipment_Type", "Equipment_Desc")
            .distinct()
        )
        equipment_types = [
            {
                "universal_id_ch_master_equipment_type": item[
                    "Universal_ID_Ch_Master_Equipment_Type"
                ],
                "name": item["Equipment_Desc"],
            }
            for item in ch_eq_type_details
        ]

        return Response(
            {
                "equipment_name": _sorted_by_label(equipment_names, "equipment_name"),
                "system_name": _sorted_by_label(system_names, "system_name"),
                "model": _sorted_by_label(models_list, "model"),
                "Nomenclature": _sorted_by_label(nomenclatures, "Nomenclature"),
                "Equipment Sr No": _sorted_by_label(equipment_sr_no, "Equipment_sr_no"),
                "OEM Name": _sorted_by_label(manufacturers, "manufacturer_name"),
                "Supplier": _sorted_by_label(suppliers, "supplier_name"),
                "OEM Part No": _sorted_by_label(oem_parts, "oem_part_no"),
                "Compartment Name": _sorted_by_label(
                    compartment_names, "compartment_name"
                ),
                "Shelf Life": _sorted_by_label(
                    shelf_lifes, "shelf_lifes_name", numeric=True
                ),
                "Equipment Section": _sorted_by_label(
                    equipment_sections, "sub_department_name"
                ),
                "Equipment Type": _sorted_by_label(equipment_types, "name"),
            }
        )


class CheckEquipmentSerialAPIView(APIView):
    """`GET check-serial/?serial_no=...` — Add/Update form support for the "duplicate serial
    number" guard on CAT I/II/III's Equipment Serial No and Survey & Demand/Local Purchase's
    New Eqpt Serial Number. Checked against Active equipment only (a removed/replaced serial
    is legitimately free to reuse); `exclude_id` lets an in-place Update save re-check without
    tripping over the record's own current value.
    """

    def get(self, request):
        serial_no = (request.query_params.get("serial_no") or "").strip()
        if not serial_no:
            return Response({"exists": False})

        qs = (
            _ship_equipment_queryset()
            .filter(active=True)
            .filter(
                Q(equipment_serial_no__iexact=serial_no)
                | Q(new_equipment_sr_no__iexact=serial_no)
            )
            .filter(department=request.user.user_profile.department)
        )
        exclude_id = request.query_params.get("exclude_id")
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)

        return Response({"exists": qs.exists()})


class ReferenceStandardDepartmentListAPIView(generics.ListAPIView):
    pagination_class = FrontendPageNumberPagination

    def list(self, request, *args, **kwargs):
        # Same rbac.scope_queryset_to_department fix as ReferenceEquipmentMasterListAPIView.list
        # (this file) -- the raw own-department filter emptied this grid for any privileged role
        # (SHIPADMIN/CO/COMMAND) whose own department happens to carry no equipment.
        department_ids = rbac.scope_queryset_to_department(
            _ship_equipment_queryset(), request
        ).values_list("department_id", flat=True)
        rows = list(Department.objects.filter(id__in=department_ids).order_by("name"))
        dept_ids = [row.id for row in rows]

        sub_depts_map = {}
        for sd in SubDepartment.objects.filter(department_name_id__in=dept_ids).values(
            "department_name_id", "name"
        ):
            if sd["name"]:
                sub_depts_map.setdefault(sd["department_name_id"], []).append(
                    sd["name"]
                )

        hods_map = {
            hod.department_id: hod
            for hod in CustomUserProfile.objects.filter(
                department_id__in=dept_ids, designation__iexact="HOD"
            ).only("id", "department_id", "firstname", "lastname", "personal_number")
        }

        data = []
        for row in rows:
            hod = hods_map.get(row.id)
            if hod:
                full_name = f"{hod.firstname or ''} {hod.lastname or ''}".strip()
                hod_name = full_name or ""
                personal_no = hod.personal_number or ""
            else:
                hod_name = ""
                personal_no = ""
            data.append(
                {
                    "dept_id": row.id,
                    "dept_code": row.code,
                    "dept_name": row.name,
                    "no_of_sub_department": len(sub_depts_map.get(row.id, [])),
                    "hod": hod_name,
                    "personal_no": personal_no,
                }
            )
        return _paginated_response(request, data)


class ReferenceShipDetailsAPIView(APIView):
    def get(self, request):
        ship = _active_ship()
        if not ship:
            return Response(
                {"detail": "No ship details found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            {
                "ship_id": ship.id,
                "ship_sr_no": ship.sr_no,
                "ship_name": ship.name,
                "class_code": _first_value(
                    getattr(ship.class_master, "description", None),
                    ship.class_code,
                ),
                "commission_date": (
                    ship.commission_date.strftime("%d-%b-%Y")
                    if getattr(ship, "commission_date", None)
                    else ""
                ),
                "ops_code": _first_value(
                    ship.ops_code,
                    getattr(ship.authority, "ops_authority", None),
                ),
                "ship_builder": ship.ship_builder,
                "displacement": ship.displacement,
                "yard_no": ship.yard_no,
                "length_overall": ship.length_overall,
                "refit_authority": ship.refit_authority,
                "address": ship.address,
                "ship_category": getattr(
                    ship.ship_category, "ship_category_name", None
                ),
                "propulsion": getattr(ship.propulsion, "propulsion_name", None),
            }
        )


class ReferenceEquipmentMasterListAPIView(generics.ListAPIView):
    serializer_class = serializers.Serializer

    pagination_class = FrontendPageNumberPagination

    def list(self, request, *args, **kwargs):
        # Was a raw `.filter(department=request.user.user_profile.department)` -- hard-scoped
        # to the caller's OWN department regardless of role, so a SHIPADMIN/CO/COMMAND account
        # (rbac.can_see_all_departments) whose own department happens to carry no equipment (e.g.
        # the seeded ADMIN account, department=ADMIN) saw an empty grid even though the ship has
        # plenty of equipment under other departments. rbac.scope_queryset_to_department is the
        # same shared helper every other department-scoped view in this file already uses (see
        # its own doc) -- it bypasses the filter entirely for privileged roles instead of
        # silently narrowing them to one department.
        universal_ids = rbac.scope_queryset_to_department(
            _ship_equipment_queryset(), request
        ).values_list("universal_id_m_equipment", flat=True)
        equipment_rows = Equipment.objects.filter(
            universal_id_m_equipment__in=universal_ids
        ).order_by("id")
        data = [
            {
                "equipment_id": e.id,
                "equipment_code": e.equipment_code,
                "equipment_name": _equipment_display(e),
                "equipment_model": _first_value(
                    getattr(e, "equipment_model", None),
                    getattr(e, "model", None),
                ),
                "maintop_number": getattr(e, "maintop_number", None),
                "manufacturer_name": getattr(e, "manufacturer_name", None),
                "authority": getattr(e, "authority", None),
                "ilms_equipment_code": _first_value(
                    getattr(e, "ilms_equipment_code", None),
                    getattr(e, "ilms_eq_code", None),
                ),
                "universal_id_m_equipment": getattr(
                    e, "universal_id_m_equipment", None
                ),
            }
            for e in equipment_rows
        ]
        return _paginated_response(request, _sorted_by_label(data, "equipment_name"))


class ReferenceSystemMasterListAPIView(ReferenceEquipmentMasterListAPIView):
    def list(self, request, *args, **kwargs):
        # Same rbac.scope_queryset_to_department fix as ReferenceEquipmentMasterListAPIView.list
        # above -- see its own doc for why the old hard department filter emptied this grid for
        # privileged roles.
        universal_ids = rbac.scope_queryset_to_department(
            _ship_equipment_queryset(), request
        ).values_list("universal_id_m_equipment", flat=True)
        equipment_rows = Equipment.objects.filter(
            universal_id_m_equipment__in=universal_ids
        ).order_by("id")
        data = [
            {
                "system_id": e.id,
                "system_code": e.equipment_code,
                "system_name": _equipment_display(e),
                "system_model": _first_value(
                    getattr(e, "equipment_model", None),
                    getattr(e, "model", None),
                ),
                "maintop_number": getattr(e, "maintop_number", None),
                "manufacturer_name": getattr(e, "manufacturer_name", None),
                "authority": getattr(e, "authority", None),
                "ilms_system_code": _first_value(
                    getattr(e, "ilms_equipment_code", None),
                    getattr(e, "ilms_eq_code", None),
                ),
                "universal_id_m_system": getattr(e, "universal_id_m_equipment", None),
            }
            for e in equipment_rows
        ]
        return _paginated_response(request, _sorted_by_label(data, "system_name"))


class EquipmentDropdownAPIView(APIView):
    """`get_equipment/` — single-record lookup by universal_id_m_equipment,
    matching cs_swmm_v1's contract (NOT a bulk dropdown list). An equipment can have several
    distinct nomenclatures across its fitted history (different installs, different names) — an
    optional `nomenclature` param narrows the match to the specific record the user actually
    picked, so OEM/Supplier/Shelf Life/Deck/Location/Compartment reflect that record rather than
    an arbitrary one sharing the same equipment. When `nomenclature` is given and nothing matches
    it, this 404s rather than silently falling back to a DIFFERENT nomenclature's data — showing
    the wrong equipment's OEM/Supplier/Shelf Life as if it were correct is worse than the frontend
    just leaving those fields blank for manual entry. The equipment-only lookup (no `nomenclature`
    param at all) still returns *some* match if one exists, since that path is only used to check
    whether the equipment itself is already mapped to a system."""

    def get(self, request):
        universal_id = request.query_params.get("universal_id_m_equipment")
        if not universal_id:
            return Response(
                {"detail": "universal_id_m_equipment is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_qs = ShipEquipment.objects.select_related(
            "equipment", "manufacturer", "supplier"
        ).filter(universal_id_m_equipment=universal_id)

        nomenclature = request.query_params.get("nomenclature")
        if nomenclature:
            tx = base_qs.filter(
                Q(nomenclature=nomenclature) | Q(new_nomenclature=nomenclature)
            ).first()
        else:
            # Equipment-only lookup (no nomenclature — the mapping-check path from
            # onEquipmentPicked). This equipment can have several installed records; if any ONE
            # of them is already mapped to a system, that's the one this check needs — an
            # arbitrary unmapped record would silently hide a real, existing mapping.
            tx = (
                base_qs.filter(
                    mapping_status=ShipEquipment.MappingStatus.MAPPED
                ).first()
                or base_qs.first()
            )
        if tx is None:
            return Response(
                {"detail": "Equipment not found."}, status=status.HTTP_404_NOT_FOUND
            )

        equipment = tx.equipment
        equipment_uid = (
            getattr(equipment, "universal_id_m_equipment", None) if equipment else None
        )
        section_uid = tx.universal_id_m_sub_department or (
            tx.sub_department_f_key.universal_id_m_sub_department
            if tx.sub_department_f_key
            else None
        )

        mapped_system_uid = None
        if tx.mapping_status == ShipEquipment.MappingStatus.MAPPED and tx.mapped_to:
            system_row = (
                ShipEquipment.objects.select_related("equipment")
                .filter(universal_id_t_equipment_ship_detail=tx.mapped_to)
                .first()
            )
            if system_row:
                mapped_system_uid = system_row.universal_id_m_equipment or getattr(
                    system_row.equipment, "universal_id_m_equipment", None
                )

        return Response(
            {
                "system_id": equipment_uid,
                "model_id": equipment_uid,
                "nomenclature_id": equipment_uid,
                # Root cause of "OEM Name doesn't auto-fetch": this read only the raw denormalized
                # CharField, which is blank on any row whose manufacturer/supplier was set via the
                # `manufacturer`/`supplier` FK instead (e.g. an RHSI Master manual pick) — the FK
                # itself was never missing, just this denormalized mirror of it. Same
                # `_first_value(raw field, FK's own uid)` fallback SourceShipEquipmentSerializer
                # already uses for `sfd-list/`'s own universal_id_m_manufacturer/_supplier, applied
                # here too so the cascade actually reflects what's really on the record.
                "oem_name_id": _first_value(
                    tx.universal_id_m_manufacturer,
                    getattr(tx.manufacturer, "Universal_ID_M_Supplier", None),
                ),
                "supplier_id": _first_value(
                    tx.universal_id_m_supplier,
                    getattr(tx.supplier, "Universal_ID_M_Supplier", None),
                ),
                "oem_part_no_id": equipment_uid,
                "equipment_sr_no": tx.equipment_serial_no or tx.new_equipment_sr_no,
                "shelf_life_id": tx.service_life,
                "deck_no": tx.deck,
                "frame_station": tx.frame,
                "location": tx.location_code,
                "location_name": dict(ShipEquipment.Location.choices).get(
                    tx.location_code
                ),
                "compartrment": tx.location_on_board,
                "installation_date": tx.installation_date or tx.new_installation_date,
                # Root cause of "Installation Remarks doesn't auto-fetch": the real CMMS sync
                # (swmmapi.views.CMMSFDDataAPI._sync_rows_to_swmm) writes CMMS's INSMAREMARKS
                # column into `insma_remarks`, never into this `installation_remarks` field —
                # which only the legacy Excel-import path ever populates. Fall back to the
                # field CMMS sync actually fills, same `_first_value` pattern as everywhere
                # else in this cascade.
                "installation_remarks": _first_value(
                    tx.insma_remarks, tx.installation_remarks
                ),
                "qty_fitted": tx.no_of_fits,
                "sub_department": section_uid,
                "new_shelf_life": tx.new_service_life,
                "is_mapped": mapped_system_uid is not None,
                "mapped_system_id": mapped_system_uid,
            }
        )


class _MasterEquipmentDropdownAPIView(APIView):
    """Flat master-equipment dropdown list. Used by the compartment dropdown
    helper (A-only) — no longer shared with `get_equipment/`."""

    def get(self, request):
        return Response(
            _sorted_by_label(
                [
                    {
                        "id": e.id,
                        "value": e.universal_id_m_equipment or str(e.id),
                        "label": _equipment_display(e),
                        "equipment_code": e.equipment_code,
                    }
                    for e in Equipment.objects.all()
                ],
                "label",
            )
        )


class EquipmentSystemDropdownAPIView(APIView):
    def get(self, request):
        rows = (
            ShipEquipment.objects.select_related("equipment")
            .exclude(equipment__isnull=True)
            .exclude(equipment_name__isnull=True)
            .exclude(equipment_name="")
            .values(
                "universal_id_t_equipment_ship_detail",
                "equipment_name",
                "location_on_board",
            )
            .distinct()
        )
        options = [
            {
                "universal_id_t_equipment_ship_detail": row[
                    "universal_id_t_equipment_ship_detail"
                ],
                "label": equipment_label(
                    row["equipment_name"], row["location_on_board"]
                ),
            }
            for row in rows
        ]
        options = _sorted_by_label(options, "label")
        return Response({"equipment": options, "system": options})


class EquipmentCompartmentDropdownAPIView(APIView):
    def get(self, request):
        return Response(
            {
                "equipment": _MasterEquipmentDropdownAPIView().get(request).data,
                "compartment": [
                    {
                        "id": c.id,
                        "label": c.name,
                        "value": c.id,
                        "main_deck": c.main_deck,
                        "upper_deck": c.upper_deck,
                        "lower_deck": c.lower_deck,
                        "frame_station_from": c.frame_station_from,
                        "frame_station_to": c.frame_station_to,
                        "location": c.location,
                    }
                    for c in CompartmentMaster.objects.filter(
                        is_deleted=False
                    ).order_by("name")
                ],
            }
        )


class EquipmentCompartmentMapAPIView(APIView):
    def post(self, request):
        serializer = EquipmentCompartmentMappingSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        mapping = serializer.save()
        return Response(
            EquipmentCompartmentMappingSerializer(mapping).data,
            status=status.HTTP_201_CREATED,
        )


class EquipmentSystemMapAPIView(APIView):
    def post(self, request):
        serializer = EquipmentSystemMapSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        system_uid = result["system_row"].universal_id_t_equipment_ship_detail
        equipment_uids = [
            row.universal_id_t_equipment_ship_detail for row in result["equipment_rows"]
        ]
        return Response(
            {
                "message": (
                    f"{len(equipment_uids)} equipment mapped to system successfully."
                    if len(equipment_uids) != 1
                    else "Equipment mapped to system successfully."
                ),
                "data": [
                    {"equipment": equipment_uid, "system": system_uid}
                    for equipment_uid in equipment_uids
                ],
            }
        )


class EquipmentSystemMappingAPIView(EquipmentSystemMapAPIView):
    pass


class EquipmentSystemUpdateAPIView(APIView):
    def patch(self, request, equipment_id):
        viewset = EquipmentSystemMappingViewSet()
        viewset.request = request
        viewset.kwargs = {viewset.lookup_field: equipment_id}
        return viewset.partial_update(request)


class EquipmentSystemUnmapAPIView(APIView):
    def delete(self, request, equipment_id):
        viewset = EquipmentSystemMappingViewSet()
        viewset.request = request
        viewset.kwargs = {viewset.lookup_field: equipment_id}
        return viewset.destroy(request)


class _ShipEquipmentListAPIView(generics.ListAPIView):
    serializer_class = SourceShipEquipmentSerializer

    pagination_class = FrontendPageNumberPagination

    def get_queryset(self):
        # return "hello"
        return ShipEquipment.objects.select_related(
            "equipment",
            "supplier",
            "manufacturer",
            "ship",
            "sub_department_f_key",
            "sub_department_f_key__department_name",
        ).all()


class SFDTransactionReportFilter(django_filters.FilterSet):
    sfd_category = django_filters.CharFilter(field_name="category")
    transaction_type = django_filters.CharFilter(field_name="type")
    equipment_name = django_filters.CharFilter(method="filter_equipment_name")
    department = django_filters.NumberFilter(method="filter_department")
    date_filter = django_filters.CharFilter(method="filter_date")

    class Meta:
        model = ShipEquipment
        fields = ["sfd_category", "transaction_type", "equipment_name", "department"]

    def filter_equipment_name(self, queryset, name, value):
        return queryset.filter(
            Q(equipment__equipment_code=value)
            | Q(equipment__ilms_eq_code=value)
            | Q(new_equipment_name=value)
        )

    def filter_department(self, queryset, name, value):
        return _filter_by_department(queryset, {"department": value})

    def filter_date(self, queryset, name, value):
        return queryset.filter(_resolve_date_filter(value, "created_at"))


class SFDTransactionReportAPIView(_ShipEquipmentListAPIView):
    serializer_class = SFDTransactionReportSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = SFDTransactionReportFilter

    def get_queryset(self):
        # ShipEquipment doubles as both "equipment fitted on this ship" (every CMMS-synced row)
        # and "SFD transaction record" (SFDTransaction = ShipEquipment, sfd/models.py) — but only
        # a row an actual CAT I/II/III/Survey/Local-Purchase Action was submitted for ever gets
        # `type` set (Step 1's CMMS sync never touches it). Without this filter every baseline
        # equipment record shows up here too, even ones no SFD transaction has ever happened for.
        return (
            super()
            .get_queryset()
            .exclude(type__isnull=True)
            .exclude(type="")
            .order_by("-created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["dept_map"] = {
            d.universal_id_m_department: (d.name or d.code or "")
            for d in Department.objects.all()
            if d.universal_id_m_department
        }
        return context


class EquipmentInstallationReportFilter(django_filters.FilterSet):
    date_filter = django_filters.CharFilter(method="filter_date")
    supplier = django_filters.CharFilter(field_name="universal_id_m_supplier")
    oem = django_filters.CharFilter(field_name="universal_id_m_manufacturer")

    class Meta:
        model = ShipEquipment
        fields = ["date_filter", "supplier", "oem"]

    def filter_date(self, queryset, name, value):
        return queryset.filter(_resolve_date_filter(value, "installation_date"))


class EquipmentInstallationReportAPIView(_ShipEquipmentListAPIView):
    serializer_class = EquipmentInstallationReportSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = EquipmentInstallationReportFilter

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(installation_date__isnull=False)
            .order_by("-installation_date")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["supplier_map"] = {
            s["Universal_ID_M_Supplier"]: s["SupplierName"] or s["supplier_name"] or ""
            for s in Supplier.objects.values(
                "Universal_ID_M_Supplier", "SupplierName", "supplier_name"
            )
            if s["Universal_ID_M_Supplier"]
        }
        return context


class EquipmentLocationReportFilter(django_filters.FilterSet):
    location = django_filters.CharFilter(field_name="location_code")
    qty_fitted = django_filters.NumberFilter(field_name="no_of_fits")
    compartment = django_filters.CharFilter(
        field_name="location_on_board", lookup_expr="icontains"
    )

    class Meta:
        model = ShipEquipment
        fields = ["location", "qty_fitted", "compartment"]


class EquipmentLocationReportAPIView(_ShipEquipmentListAPIView):
    serializer_class = EquipmentLocationReportSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = EquipmentLocationReportFilter

    def get_queryset(self):
        return super().get_queryset().order_by("-created_at")


class ShipEquipmentConfigurationReportFilter(django_filters.FilterSet):
    transaction_type = django_filters.CharFilter(field_name="type")
    transaction_category = django_filters.CharFilter(field_name="category")
    sub_department = django_filters.NumberFilter(field_name="sub_department_f_key_id")
    system = django_filters.CharFilter(field_name="mapped_to")
    location = django_filters.CharFilter(field_name="location_code")

    compartment = django_filters.CharFilter(
        field_name="location_on_board", lookup_expr="icontains"
    )
    installation_date = django_filters.CharFilter(method="filter_installation_date")
    removal_date = django_filters.CharFilter(method="filter_removal_date")
    manufacture = django_filters.CharFilter(field_name="universal_id_m_manufacturer")
    supplier = django_filters.CharFilter(field_name="universal_id_m_supplier")
    service_life = django_filters.CharFilter(field_name="service_life")
    approval_status = django_filters.CharFilter(field_name="status")
    department = django_filters.NumberFilter(method="filter_department")
    report_type = django_filters.ChoiceFilter(
            choices=[
                ("pdf", "PDF"),
                ("excel", "Excel"),
                ("csv", "CSV"),
            ],
            method="filter_report_type",
        )
    def filter_report_type(self, queryset, name, value):
            return queryset

    class Meta:
        model = ShipEquipment
        fields = [
            "transaction_type",
            "transaction_category",
            "sub_department",
            "system",
            "location",
            "compartment",
            "installation_date",
            "removal_date",
            "manufacture",
            "supplier",
            "service_life",
            "approval_status",
            "department",
        ]

    def filter_removal_date(self, queryset, name, value):
        return queryset.filter(_resolve_date_filter(value, "removal_date"))

    def filter_installation_date(self, queryset, name, value):
        q_inst = _resolve_date_filter(value, "installation_date")
        q_new = _resolve_date_filter(value, "new_installation_date")
        return queryset.filter(q_inst | q_new)

    def filter_department(self, queryset, name, value):
        return _filter_by_department(queryset, {"department": value})


class ShipEquipmentConfigurationReportAPIView(_ShipEquipmentListAPIView):

    serializer_class = ShipEquipmentConfigurationReportSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = ShipEquipmentConfigurationReportFilter

    def get_queryset(self):
        return super().get_queryset().order_by("-created_at")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["dept_map"] = {
            d.universal_id_m_department: (d.name or d.code or "")
            for d in Department.objects.all()
            if d.universal_id_m_department
        }
        return context

    # def list(self, request, *args, **kwargs):
    #     report_type = request.query_params.get("report_type")
    #     queryset = self.filter_queryset(self.get_queryset())
    #     serializer = self.get_serializer(
    #         queryset,
    #         many=True,
    #     )
    #     data = serializer.data
    #     if report_type in ["pdf", "csv", "excel"]:
    #         return DocumentService.send_to_document_service(
    #             report_type=report_type,
    #             data=data,
    #         )
    #     return Response(data)
    def list(self, request, *args, **kwargs):
        return DocumentService.list(self, request,filename="ship-equipment-report", *args, **kwargs)


class RemovedEquipmentReportFilter(django_filters.FilterSet):
    removal_date = django_filters.CharFilter(method="filter_removal_date")
    status = django_filters.NumberFilter(field_name="approved_reject")
    removed_authority = django_filters.CharFilter(
        field_name="authority_of_removal", lookup_expr="icontains"
    )

    class Meta:
        model = RemoveEquipment
        fields = ["removal_date", "status", "removed_authority"]

    def filter_removal_date(self, queryset, name, value):
        return queryset.filter(_resolve_date_filter(value, "removal_date"))


class RemovedEquipmentReportAPIView(generics.ListAPIView):
    serializer_class = RemovedEquipmentReportSerializer

    pagination_class = FrontendPageNumberPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = RemovedEquipmentReportFilter
    queryset = (
        RemoveEquipment.objects.select_related("equipment", "ship_equipment")
        .filter(request_type=1)
        .order_by("-removal_date", "-id")
    )


class ApprovalStatusReportFilter(django_filters.FilterSet):
    removal_date = django_filters.CharFilter(method="filter_removal_date")
    install_date = django_filters.CharFilter(method="filter_install_date")
    status = django_filters.NumberFilter(field_name="approved_reject")
    removed_authority = django_filters.CharFilter(
        field_name="authority_of_removal", lookup_expr="icontains"
    )
    approval_request_type = django_filters.NumberFilter(field_name="request_type")

    class Meta:
        model = RemoveEquipment
        fields = [
            "removal_date",
            "install_date",
            "status",
            "removed_authority",
            "approval_request_type",
        ]

    def filter_removal_date(self, queryset, name, value):
        return queryset.filter(_resolve_date_filter(value, "removal_date"))

    def filter_install_date(self, queryset, name, value):
        return queryset.filter(_resolve_date_filter(value, "installation_date"))


class ApprovalStatusReportAPIView(RemovedEquipmentReportAPIView):
    serializer_class = ApprovalStatusReportSerializer
    filterset_class = ApprovalStatusReportFilter
    queryset = (
        RemoveEquipment.objects.select_related("equipment", "ship_equipment")
        .all()
        .order_by("-removal_date", "-id")
    )


def _get_equipment_names(department=None, nomenclature=None):
    # Filtered to `active=True` (currently-fitted equipment) — the Active list's own name is
    # what this dropdown backs, so a removed/historical equipment showing up here as a pickable
    # filter, with nothing on the list it's filtering ever able to match it, was a dead option.
    # `department` (RBAC — see SFDListFilterOptionsAPIView) scopes it further to a non-privileged
    # user's own department, so the Filter panel never offers another department's equipment name
    # as something to filter by, even though the Active list it filters already hides those rows.
    # `nomenclature` narrows it the other way round — picking a Nomenclature in the Filter panel
    # re-scopes Equipment Name to just the equipment(s) that actually carry it, mirroring the
    # Equipment Name -> Nomenclature cascade below instead of only working in one direction.
    rows = _ship_equipment_queryset().filter(active=True).select_related("equipment")
    if department is not None:
        rows = rows.filter(department=department)
    if nomenclature:
        rows = rows.filter(nomenclature=nomenclature)
    names = set()
    for row in rows:
        name = (
            row.equipment_name
            or row.new_equipment_name
            or getattr(row.equipment, "equipment_class", None)
            or row.nomenclature
        )
        if name:
            names.add(name)
    return [{"value": name, "label": name} for name in sorted(names)]


def _get_sfd_list_nomenclatures(equipment_name=None, department=None):
    # `equipment_name` narrows Nomenclature to just the equipment currently picked in the
    # Filter panel's own Equipment Name dropdown — an equipment can have several distinct
    # nomenclatures across its fitted history, so leaving this unscoped (the previous
    # behaviour) offered every nomenclature on the ship regardless of which equipment was
    # picked, most of which could never actually match together in a real filter.
    qs = (
        _ship_equipment_queryset()
        .filter(active=True)
        .exclude(nomenclature__isnull=True)
        .exclude(nomenclature="")
    )
    if department is not None:
        qs = qs.filter(department=department)
    if equipment_name:
        qs = qs.filter(
            Q(equipment_name=equipment_name)
            | Q(new_equipment_name=equipment_name)
            | Q(equipment__equipment_class=equipment_name)
            | Q(nomenclature=equipment_name)
        )
    values = list(
        qs.values_list("nomenclature", flat=True).distinct().order_by("nomenclature")
    )
    return [{"value": value, "label": value} for value in values]


def _get_sfd_list_sub_departments(department=None, nomenclature=None):
    rows = _ship_equipment_queryset().filter(
        active=True, sub_department_f_key__isnull=False
    )
    if department is not None:
        rows = rows.filter(department=department)
    # Picking a Nomenclature in the Filter panel re-scopes Sub Dept to just the department(s) that
    # nomenclature is actually fitted under — same cascade direction as _get_equipment_names above.
    if nomenclature:
        rows = rows.filter(nomenclature=nomenclature)
    rows = (
        rows.values("sub_department_f_key_id", "sub_department_f_key__name")
        .distinct()
        .order_by("sub_department_f_key__name")
    )
    return [
        {
            "value": row["sub_department_f_key_id"],
            "label": row["sub_department_f_key__name"],
        }
        for row in rows
        if row["sub_department_f_key_id"] and row["sub_department_f_key__name"]
    ]


def _get_sfd_list_maintops(department=None, nomenclature=None):
    qs = _ship_equipment_queryset().filter(active=True)
    if department is not None:
        qs = qs.filter(department=department)
    if nomenclature:
        qs = qs.filter(nomenclature=nomenclature)
    values = list(
        qs.exclude(maintop_id__isnull=True)
        .values_list("maintop_id", flat=True)
        .distinct()
        .order_by("maintop_id")
    )
    return [{"value": value, "label": str(value)} for value in values]


def _get_system_options():
    system_ids = list(
        _ship_equipment_queryset()
        .filter(active=True)
        .exclude(mapped_to__isnull=True)
        .exclude(mapped_to="")
        .values_list("mapped_to", flat=True)
        .distinct()
    )
    rows = (
        _ship_equipment_queryset()
        .select_related("equipment")
        .filter(active=True, universal_id_t_equipment_ship_detail__in=system_ids)
    )
    return _sorted_by_label(
        [
            {
                "value": row.universal_id_t_equipment_ship_detail,
                "label": equipment_label(
                    _equipment_display(row.equipment) or row.equipment_name,
                    row.location_on_board,
                ),
            }
            for row in rows
            if row.universal_id_t_equipment_ship_detail
        ],
        "label",
    )


def _get_sfd_categories():
    return [
        {"value": value, "label": label}
        for value, label in ShipEquipment.TransactionCategory.choices
    ]


def _get_transaction_types():
    return [
        {"value": value, "label": label}
        for value, label in ShipEquipment.TransactionType.choices
    ]


def _get_departments():
    return [
        {
            "value": d["id"],
            "label": (
                f"{d['name']} ({d['code']})"
                if d["name"] and d["code"]
                else (d["name"] or d["code"] or "")
            ),
        }
        for d in Department.objects.values("id", "name", "code").order_by(
            "name", "code"
        )
    ]


def _get_suppliers():
    # Scoped to `_ship_equipment_queryset()` (this ship only) + `active=True` (currently fitted,
    # not a removed/historical equipment's supplier) — was querying `ShipEquipment.objects`
    # directly, un-scoped by ship or active status, so this offered suppliers tied to equipment
    # that isn't actually fitted on this ship anymore (or ever, on a multi-ship setup).
    used_ids = list(
        _ship_equipment_queryset()
        .filter(active=True)
        .exclude(universal_id_m_supplier__isnull=True)
        .exclude(universal_id_m_supplier="")
        .values_list("universal_id_m_supplier", flat=True)
        .distinct()
    )
    return [
        {
            "value": s["Universal_ID_M_Supplier"],
            "label": s["SupplierName"] or s["supplier_name"] or "",
        }
        for s in Supplier.objects.filter(
            Q(supplier_manufacture=1) | Q(SupplierManufacturer="1"),
            Universal_ID_M_Supplier__in=used_ids,
        )
        .values("Universal_ID_M_Supplier", "SupplierName", "supplier_name")
        .order_by("SupplierName")
        if (s["SupplierName"] or s["supplier_name"]) and s["Universal_ID_M_Supplier"]
    ]


def _get_oems():
    # Same scoping as _get_suppliers() above — this ship, currently-fitted equipment only.
    used_ids = list(
        _ship_equipment_queryset()
        .filter(active=True)
        .exclude(universal_id_m_manufacturer__isnull=True)
        .exclude(universal_id_m_manufacturer="")
        .values_list("universal_id_m_manufacturer", flat=True)
        .distinct()
    )
    return [
        {
            "value": s["Universal_ID_M_Supplier"],
            "label": s["SupplierName"] or s["supplier_name"] or "",
        }
        for s in Supplier.objects.filter(
            Q(supplier_manufacture=2) | Q(SupplierManufacturer="2"),
            Universal_ID_M_Supplier__in=used_ids,
        )
        .values("Universal_ID_M_Supplier", "SupplierName", "supplier_name")
        .order_by("SupplierName")
        if (s["SupplierName"] or s["supplier_name"]) and s["Universal_ID_M_Supplier"]
    ]


def _get_compartment_options():
    # Ship- and active-scoped — same reasoning as _get_suppliers()/_get_oems() above.
    values = list(
        _ship_equipment_queryset()
        .filter(active=True)
        .exclude(location_on_board__isnull=True)
        .exclude(location_on_board="")
        .values_list("location_on_board", flat=True)
        .distinct()
        .order_by("location_on_board")
    )
    return [{"value": val, "label": val} for val in values]


def _get_qty_fitted_options():
    values = list(
        _ship_equipment_queryset()
        .filter(active=True)
        .exclude(no_of_fits__isnull=True)
        .values_list("no_of_fits", flat=True)
        .distinct()
        .order_by("no_of_fits")
    )
    return [{"value": val, "label": str(val)} for val in values]


def _get_location_code_options():
    codes = list(
        _ship_equipment_queryset()
        .filter(active=True)
        .exclude(location_code__isnull=True)
        .exclude(location_code="")
        .values_list("location_code", flat=True)
        .distinct()
        .order_by("location_code")
    )
    choices_dict = dict(ShipEquipment.Location.choices)
    return [
        {"value": code, "label": f"{choices_dict.get(code, 'Unknown')} ({code})"}
        for code in codes
    ]


def _get_remove_authority_options():
    values = list(
        RemoveEquipment.objects.exclude(authority_of_removal__isnull=True)
        .exclude(authority_of_removal="")
        .values_list("authority_of_removal", flat=True)
        .distinct()
        .order_by("authority_of_removal")
    )
    return [{"value": val, "label": val} for val in values]


def _get_remove_status_options():
    values = list(
        RemoveEquipment.objects.exclude(approved_reject__isnull=True)
        .values_list("approved_reject", flat=True)
        .distinct()
        .order_by("approved_reject")
    )
    status_map = {1: "approved", 2: "Pending", 3: "Rejected"}
    return [{"value": val, "label": status_map.get(val, str(val))} for val in values]


def _get_approval_request_type_options():
    return [{"value": 1, "label": "Remove"}, {"value": 2, "label": "Change Sr. No."}]


def _get_service_life_options():
    values = list(
        _ship_equipment_queryset()
        .filter(active=True)
        .exclude(service_life__isnull=True)
        .exclude(service_life="")
        .values_list("service_life", flat=True)
        .distinct()
        .order_by("service_life")
    )
    return [{"value": val, "label": f"{val} Years"} for val in values]


def _get_approval_status_options():
    return [
        {"value": 1, "label": "approved"},
        {"value": 2, "label": "Pending"},
        {"value": 3, "label": "Rejected"},
    ]


FILTER_OPTIONS_REGISTRY = {
    "equipment_name": _get_equipment_names,
    "sfd_category": _get_sfd_categories,
    "transaction_type": _get_transaction_types,
    "department": _get_departments,
    "sub_department": _get_sfd_list_sub_departments,
    "system": _get_system_options,
    "supplier": _get_suppliers,
    "oem": _get_oems,
    "compartment": _get_compartment_options,
    "qty_fitted": _get_qty_fitted_options,
    "location_code": _get_location_code_options,
    "location": _get_location_code_options,
    "remove_authority": _get_remove_authority_options,
    "remove_status": _get_remove_status_options,
    "approval_request_type": _get_approval_request_type_options,
    "service_life": _get_service_life_options,
    "approval_status": _get_approval_status_options,
}


class ReportFilterOptionsAPIView(APIView):
    def get(self, request):
        raw_fields = request.query_params.get("fields")
        if not raw_fields:
            return Response(
                {"fields": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        requested_keys = [k.strip() for k in raw_fields.split(",") if k.strip()]
        invalid = [k for k in requested_keys if k not in FILTER_OPTIONS_REGISTRY]
        if invalid or not requested_keys:
            return Response(
                {"fields": [f"Select a valid choice. {invalid} is not one of them."]}
                if invalid
                else {"fields": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({key: FILTER_OPTIONS_REGISTRY[key]() for key in requested_keys})


class SFDListFilterOptionsAPIView(ReportFilterOptionsAPIView):
    default_fields = ("equipment_name", "nomenclature", "sub_dept", "maintop_id")

    def get(self, request):
        # `?equipment_name=` re-scopes Nomenclature to just that equipment's own fitted history
        # — the frontend re-requests this whenever the Filter panel's Equipment Name pick
        # changes, instead of showing every nomenclature on the ship regardless of that pick.
        # `?nomenclature=` does the same the other way round — re-scopes Equipment Name/Sub
        # Dept/Maintop to just what that nomenclature is actually fitted under, requested
        # whenever the Filter panel's Nomenclature pick changes.
        equipment_name = request.query_params.get("equipment_name")
        nomenclature = request.query_params.get("nomenclature")
        # RBAC: a non-privileged user's Filter panel only ever offers their own department's
        # values — matches the same scoping now applied to the Active list itself
        # (SFDTransactionViewSet.get_queryset), so the filters never dangle an option for data
        # the list can't show anyway. A non-privileged user with no department assigned at all
        # gets every option list empty (not everything) — same "no department -> nothing"
        # convention as rbac.resolve_selected_department itself.
        if rbac.can_see_all_departments(request.user):
            department = None
        else:
            department = rbac.department_of(request.user)
            if department is None:
                return Response({key: [] for key in self.default_fields})
        registry = {
            "equipment_name": lambda: _get_equipment_names(department, nomenclature),
            "nomenclature": lambda: _get_sfd_list_nomenclatures(
                equipment_name, department
            ),
            "sub_dept": lambda: _get_sfd_list_sub_departments(department, nomenclature),
            "maintop_id": lambda: _get_sfd_list_maintops(department, nomenclature),
        }
        return Response({key: registry[key]() for key in self.default_fields})


class ApprovalTrackingAPIView(APIView):
    STATUS_MAPPING = {1: "approved", 2: "Pending", 3: "Rejected"}

    @staticmethod
    def _equipment_name(obj):
        """The transaction's own display name is what the "Equipment Name" column should show —
        not the Equipment master's `equipment_code`, which is a numeric catalog id (e.g.
        "713111"). `equipment_name` is only ever populated on rows that arrived via CMMS sync
        (category=None/"other"); a CAT1/2/3 submission's own name lives on `nomenclature`
        (existing-equipment picks) or `new_nomenclature`/`new_equipment_name` (CAT3 new
        induction) instead — see filter_equipment_name below, which matches all of these same
        fields so "View Full Form" can still locate the record from whichever name we return
        here."""
        ship_equipment = getattr(obj, "ship_equipment", None)
        for attr in (
            "equipment_name",
            "nomenclature",
            "new_nomenclature",
            "new_equipment_name",
        ):
            name = getattr(ship_equipment, attr, None)
            if name:
                return name
        return getattr(obj.equipment, "equipment_code", "") or ""

    def get(self, request):
        response = []

        # RBAC: a non-privileged user only ever sees their own department's Remove/Change
        # requests — this endpoint had no department gate at all before, so every user saw
        # every department's approval queue regardless of role. Routed through the shared
        # scope_queryset_to_department helper (not a plain None-check) so a non-privileged user
        # with no department assigned at all correctly sees nothing, not everything.
        # `.exclude(approved_reject=1, viewed=True)` — once a request is Approved AND the operator
        # has already opened it from this grid (see post() below), it has nothing left to action
        # and drops out entirely (explicit product direction). Every other status keeps showing
        # regardless of `viewed` — this combination is the only one that ever hides a row.
        remove_requests = (
            RemoveEquipment.objects.select_related("equipment", "ship_equipment")
            .exclude(approved_reject=1, viewed=True)
            .order_by("-created_at")
        )
        remove_requests = rbac.scope_queryset_to_department(
            remove_requests, request, field="ship_equipment__department_id"
        )
        for obj in remove_requests:
            ship_equipment = obj.ship_equipment
            sub_department = getattr(
                getattr(ship_equipment, "sub_department_f_key", None), "name", None
            )
            response.append(
                {
                    "request_id": str(obj.pk),
                    "equipment": self._equipment_name(obj),
                    "category": "Remove",
                    "transaction_category": getattr(
                        obj.ship_equipment, "category", None
                    )
                    or "",
                    "submitted_by": None,
                    "submitted": obj.created_at,
                    "status": self.STATUS_MAPPING.get(obj.approved_reject, "Pending"),
                    "insma_officer": "",
                    "insma_remarks": obj.removal_remark,
                    # Quick-glance subset for this Remove request's own grid row — the frontend's
                    # "View Full Form" button (openFullFormFromApproval) also reopens the complete
                    # original submission for these (Survey & Demand/Local Purchase route through
                    # RemoveEquipment too, category-tagged the same as any other transaction on
                    # `ship_equipment`), so this summary isn't the only place to see everything.
                    "equipment_sr_no": obj.equipment_serial_no or "",
                    "sub_dept": sub_department or "",
                    "compartment_name": getattr(
                        ship_equipment, "location_on_board", None
                    )
                    or "",
                    "removal_date": _format_dt(obj.removal_date, DATE_FORMAT),
                    "removal_authority": obj.authority_of_removal or "",
                    "removal_remark": obj.removal_remark or "",
                    # See the identical field on the Change-request branch below for why.
                    "equipment_ship_id": obj.ship_equipment_id,
                }
            )

        # Same Approved+viewed exclusion as remove_requests above.
        change_requests = (
            ChangeEquipmentRequest.objects.select_related("equipment", "ship_equipment")
            .exclude(approved_reject=1, viewed=True)
            .order_by("-created_at")
        )
        change_requests = rbac.scope_queryset_to_department(
            change_requests, request, field="ship_equipment__department_id"
        )
        for obj in change_requests:
            response.append(
                {
                    "request_id": obj.universal_id_t_sfd_change_request or str(obj.pk),
                    "equipment": self._equipment_name(obj),
                    "category": "Change",
                    "transaction_category": getattr(
                        obj.ship_equipment, "category", None
                    )
                    or "",
                    "submitted_by": obj.universal_id_a_user_created_by,
                    "submitted": obj.created_at,
                    "status": self.STATUS_MAPPING.get(obj.approved_reject, "Pending"),
                    "insma_officer": "",
                    "insma_remarks": "",
                    # The real, unambiguous FK — lets "View Full Form" (openFullFormFromApproval,
                    # sfd-management.component.ts) fetch this exact ShipEquipment row directly
                    # (GET sfd-list/{id}/) instead of guessing at it via a name match, which failed
                    # outright for any request still Pending: the underlying row's own `status`
                    # gets set to the same "2"/"3" codes the Active list's default view excludes
                    # (SFDTransactionViewSet.get_queryset), so a still-unapproved submission was
                    # never findable that way no matter how well the name matched.
                    "equipment_ship_id": obj.ship_equipment_id,
                }
            )

        response.sort(
            key=lambda x: x["submitted"] or timezone.make_aware(datetime.min),
            reverse=True,
        )
        return Response(response)

    def put(self, request):
        """Resubmit a "Returned" approval request with corrected details.
        `request_id` is a query param (matches the frontend's ApprovalTrackingUpdatePayload
        contract); resets the request back to Pending for re-review."""
        request_id = request.query_params.get("request_id")
        if not request_id:
            return Response(
                {"detail": "request_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Frontend's ApprovalSfdRow.requestType is always lowercase ("remove"/"change" — see
        # sfd-actions.service.ts's `r.category.toLowerCase()`), so match case-insensitively
        # rather than against the GET response's capitalized "Remove"/"Change" literal.
        category = (request.data.get("category") or "").strip().lower()
        insma_remarks = request.data.get("insma_remarks")
        amendment_note = request.data.get("amendment_note")

        if category == "remove":
            obj = RemoveEquipment.objects.filter(pk=request_id).first()
            if not obj:
                return Response(
                    {"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND
                )
            update_fields = ["approved_reject", "updated_at"]
            obj.approved_reject = 2  # Pending — explicit, not left to the None fallback
            if insma_remarks is not None:
                obj.removal_remark = insma_remarks
                update_fields.append("removal_remark")
            if amendment_note is not None:
                obj.amendment_note = amendment_note
                update_fields.append("amendment_note")
            obj.save(update_fields=update_fields)
            data = {"request_id": str(obj.pk)}
        elif category == "change":
            obj = (
                ChangeEquipmentRequest.objects.filter(
                    universal_id_t_sfd_change_request=request_id
                ).first()
                or ChangeEquipmentRequest.objects.filter(pk=_to_int(request_id)).first()
            )
            if not obj:
                return Response(
                    {"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND
                )
            update_fields = ["approved_reject", "updated_at"]
            obj.approved_reject = 2  # Pending — explicit, not left to the None fallback
            if amendment_note is not None:
                obj.amendment_note = amendment_note
                update_fields.append("amendment_note")
            obj.save(update_fields=update_fields)
            data = {"request_id": obj.universal_id_t_sfd_change_request or str(obj.pk)}
        else:
            return Response(
                {"detail": "category must be 'Remove' or 'Change'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"message": "Approval request resubmitted successfully.", "data": data}
        )

    def post(self, request):
        """Marks one approval-tracking row as viewed — called once (openFullFormFromApproval,
        sfd-management.component.ts) when the operator opens "View Full Form" from this grid's eye
        icon. Harmless on a still-Pending/Returned row (nothing reads `viewed` until the request is
        ALSO Approved — see get()'s exclude() above); real effect is only once both are true."""
        request_id = request.data.get("request_id")
        category = (request.data.get("category") or "").strip().lower()
        if not request_id or category not in ("remove", "change"):
            return Response(
                {"detail": "request_id and category ('remove'/'change') are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if category == "remove":
            obj = RemoveEquipment.objects.filter(pk=_to_int(request_id)).first()
        else:
            obj = (
                ChangeEquipmentRequest.objects.filter(
                    universal_id_t_sfd_change_request=request_id
                ).first()
                or ChangeEquipmentRequest.objects.filter(pk=_to_int(request_id)).first()
            )
        if not obj:
            return Response(
                {"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if not obj.viewed:
            obj.viewed = True
            obj.save(update_fields=["viewed"])
        return Response({"message": "Marked as viewed."})


class ReportExportAPIView(APIView):
    def post(self, request, report_key):
        # `format`/`export_format` select PDF vs Excel — everything else in the body is a report
        # filter, forwarded to the Celery task as-is (same param names the report's own
        # filterset_class already expects, since the frontend builds this from the exact same
        # filter-param map the on-screen grid uses — see buildExportFilterParams()).
        export_format = (
            request.data.get("export_format")
            or request.data.get("format")
            or ReportExportJob.ExportFormat.EXCEL
        )
        filters = {
            key: value
            for key, value in request.data.items()
            if key not in ("format", "export_format")
        }

        job = ReportExportJob.objects.create(
            report_key=report_key,
            export_format=export_format,
            status=ReportExportJob.Status.PENDING,
        )

        from .tasks import generate_report_export_task

        generate_report_export_task.delay(str(job.id), filters)

        return Response(
            ReportExportJobSerializer(job).data, status=status.HTTP_201_CREATED
        )


class ReportExportJobStatusAPIView(generics.RetrieveAPIView):
    serializer_class = ReportExportJobSerializer

    queryset = ReportExportJob.objects.all()
    lookup_url_kwarg = "job_id"


class ReportExportJobDownloadAPIView(generics.RetrieveAPIView):
    serializer_class = ReportExportJobSerializer
    queryset = ReportExportJob.objects.all()
    lookup_url_kwarg = "job_id"

    def retrieve(self, request, *args, **kwargs):
        import os

        from django.conf import settings as django_settings
        from django.http import FileResponse

        job = self.get_object()

        if job.status != ReportExportJob.Status.SUCCESS or not job.file_path:
            return Response(
                {
                    "status": "error",
                    "message": job.error or "Export is not ready yet.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        absolute_path = os.path.join(django_settings.MEDIA_ROOT, job.file_path)
        if not os.path.exists(absolute_path):
            return Response(
                {"status": "error", "message": "Export file is missing."},
                status=status.HTTP_404_NOT_FOUND,
            )

        is_pdf = job.export_format == ReportExportJob.ExportFormat.PDF
        content_type = (
            "application/pdf"
            if is_pdf
            else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        extension = "pdf" if is_pdf else "xlsx"

        response = FileResponse(open(absolute_path, "rb"), content_type=content_type)
        response["Content-Disposition"] = (
            f'attachment; filename="{job.report_key}.{extension}"'
        )
        return response


class SFDOverviewAPIView(APIView):
    def get(self, request):
        today = timezone.localdate()
        equipment_qs = _ship_equipment_queryset().select_related(
            "department", "sub_department_f_key", "ship", "equipment_category"
        )
        # RBAC: a non-privileged user's Overview KPIs only ever count their own department's
        # equipment — same scoping as the Active list itself (SFDTransactionViewSet).
        equipment_qs = rbac.scope_queryset_to_department(equipment_qs, request)
        # Excludes equipment still Pending ("2") or Rejected ("3") INSMA approval, matching
        # SFDTransactionViewSet's own default view exactly — without this, a still-pending CAT/
        # Survey submission counted here but not on the Active list it links to (the KPI card's
        # "view" action opens that same list), so the two screens disagreed on how many pieces
        # of equipment the ship actually has by however many submissions were mid-review.
        equipment_qs = equipment_qs.exclude(status__in=["2", "3"])
        total = equipment_qs.count()
        mapped = equipment_qs.filter(
            Q(mapping_status="mapped") | Q(system__isnull=False)
        ).count()
        active = equipment_qs.filter(active=True).count()
        unmapped = max(total - mapped, 0)
        # approved_reject == 2 is Pending (see RecentActivityAPIView's own fix/comment on the
        # identical mistake) — remove()/_update_sfd_transaction() always set it explicitly, never
        # leaving it NULL, so isnull=True (as this used to check) never matched a real pending
        # request and this KPI/the Alerts panel's "N SFD approval request(s) pending" text both
        # stayed stuck at ~0 regardless of how many requests were actually awaiting approval.
        pending_approvals = rbac.scope_queryset_to_department(
            RemoveEquipment.objects.filter(approved_reject=2),
            request,
            field="ship_equipment__department_id",
        ).count()

        six_months_ago = today - timedelta(days=183)
        one_year_ago = today - timedelta(days=365)
        two_years_ago = today - timedelta(days=730)

        def count_for(qs, since=None):
            if since is None:
                return qs.count()
            return qs.filter(created_at__date__gte=since).count()

        def trend_text(current, previous):
            if previous <= 0:
                return "+100%" if current > 0 else "0%"
            change = round(((current - previous) / previous) * 100)
            return f"{change:+d}%"

        def kpi(key, title, qs, count, subtitle, section_title, mode="breakdown"):
            last_30 = count_for(qs, today - timedelta(days=30))
            prev_30 = qs.filter(
                created_at__date__gte=today - timedelta(days=60),
                created_at__date__lt=today - timedelta(days=30),
            ).count()
            breakdown = self._department_breakdown(qs, total=count)
            return {
                "key": key,
                "title": title,
                "count": count,
                "displayValue": f"{count:,}",
                "iconColor": "",
                "iconBg": "",
                "iconPath": "",
                "trendUp": last_30 >= prev_30,
                "baseUp": last_30 >= prev_30,
                "selectedPeriod": "all",
                "trendData": {
                    "all": trend_text(last_30, prev_30),
                    "6m": trend_text(count_for(qs, six_months_ago), last_30),
                    "1y": trend_text(count_for(qs, one_year_ago), last_30),
                    "2y": trend_text(count_for(qs, two_years_ago), last_30),
                },
                "valueData": {
                    "all": f"{count:,}",
                    "6m": f"{count_for(qs, six_months_ago):,}",
                    "1y": f"{count_for(qs, one_year_ago):,}",
                    "2y": f"{count_for(qs, two_years_ago):,}",
                },
                "drawerSubtitle": subtitle,
                "sectionTitle": section_title,
                "sectionHint": "Units - Share",
                "stats": [
                    {"value": f"{count:,}", "label": "Total"},
                    {"value": f"{last_30:,}", "label": "Last 30 days"},
                    {"value": f"{mapped:,}", "label": "Mapped"},
                    {"value": f"{unmapped:,}", "label": "Unmapped"},
                ],
                "mode": mode,
                "breakdown": breakdown,
                "listRows": [],
            }

        all_kpis = [
            kpi(
                "total_equipment",
                "Total Equipment",
                equipment_qs,
                total,
                "current fleet total",
                "Equipment by department",
            ),
            kpi(
                "active_equipment",
                "Active Equipment",
                equipment_qs.filter(active=True),
                active,
                "active fitted equipment",
                "Active equipment by department",
            ),
            kpi(
                "mapped_equipment",
                "Mapped Equipment",
                equipment_qs.filter(
                    Q(mapping_status="mapped") | Q(system__isnull=False)
                ),
                mapped,
                "linked to system hierarchy",
                "Mapped equipment by department",
            ),
            {
                **kpi(
                    "pending_approvals",
                    "Pending Approvals",
                    equipment_qs.filter(status__icontains="progress"),
                    pending_approvals,
                    "awaiting action",
                    "Pending approval records",
                    mode="list",
                ),
                "count": pending_approvals,
                "displayValue": f"{pending_approvals:,}",
                "listRows": self._pending_approval_rows(),
            },
        ]

        # "Equipment Distribution by Department" chart — role-scoped per explicit product
        # direction: rbac.can_see_all_departments roles (CO/SHIPADMIN/COMMAND) see the whole ship,
        # department-by-department, with the usual drill-into-a-department-for-its-sub-departments
        # behaviour. A non-privileged user instead sees THEIR OWN department's sub-departments
        # directly as the top-level chart — a single "my department" bar would be a useless 1-bar
        # chart — and the dropdown lists just their own sub-departments; picking one filters the
        # chart down to that single sub-department. Built by reusing the exact same "dept_dist +
        # dept_subs, drill by dropdown" shape the frontend already renders for the privileged case
        # (each sub-department stands in as its own one-entry "department"), rather than needing a
        # third, bespoke chart mode on the frontend. `deptChartScope` tells the frontend which of
        # the two labelling/behaviour sets ("ship" vs "department") is in play.
        is_privileged = rbac.can_see_all_departments(request.user)
        own_department = rbac.department_of(request.user)
        if is_privileged or not own_department:
            dept_dist, dept_subs = self._department_distribution(equipment_qs)
            dept_chart_scope = "ship"
        else:
            _, own_dept_subs = self._department_distribution(
                equipment_qs.filter(department=own_department)
            )
            # Matches _department_distribution's own "Unassigned" fallback for a blank name, so
            # this lookup can't miss the very key that function just built.
            dept_dist = own_dept_subs.get(own_department.name or "Unassigned", [])
            dept_subs = {row["label"]: [row] for row in dept_dist}
            dept_chart_scope = "department"
        cat_segments = self._category_segments(equipment_qs)
        install_labels, install_series, install_legend = self._installation_trend(
            equipment_qs, today
        )

        return Response(
            {
                "allKpis": all_kpis,
                "alerts": self._alerts(pending_approvals, unmapped),
                "deptDist": dept_dist,
                "deptSubs": dept_subs,
                "deptChartScope": dept_chart_scope,
                "catSegments": cat_segments,
                "catSummary": f"{total:,} fitted equipment records across {len(cat_segments)} categories",
                "installLabels": install_labels,
                "installSeries": install_series,
                "installLegend": install_legend,
                "activity": self._recent_activity(equipment_qs, today),
                "metadata": {
                    "lastSync": timezone.now().strftime("%d %B %Y, %I:%M %p"),
                    "generatedAt": timezone.now().isoformat(),
                    "version": "V1.0",
                },
                "total_equipment": total,
                "active_equipment": active,
                "mapped_equipment": mapped,
                "unmapped_equipment": unmapped,
                "pending_approvals": pending_approvals,
            }
        )

    @staticmethod
    def _breakdown_equipment_name(row):
        return (
            row.nomenclature
            or row.new_nomenclature
            or row.equipment_name
            or row.new_equipment_name
            or "—"
        )

    def _department_breakdown(self, qs, total):
        rows = []
        max_count = max(total, 1)
        for row in (
            qs.values("department__name")
            .annotate(value=Count("id"))
            .order_by("-value", "department__name")[:8]
        ):
            name = row["department__name"] or "Unassigned"
            value = row["value"]
            dept_qs = (
                qs.filter(department__name=row["department__name"])
                if row["department__name"]
                else qs.filter(department__isnull=True)
            )
            # Capped — a department can carry 100+ fitted equipment records and this is a
            # drawer list, not a paginated grid; ordered by name so the cap is a stable/
            # predictable "first N alphabetically" rather than a query-plan-dependent slice.
            equipments = [
                {
                    "name": self._breakdown_equipment_name(equipment_row),
                    "shelfLife": (
                        str(equipment_row.service_life)
                        if equipment_row.service_life is not None
                        else None
                    ),
                    "status": _status_label(equipment_row.status) or "—",
                }
                for equipment_row in dept_qs.order_by("nomenclature")[:100]
            ]
            rows.append(
                {
                    "name": name,
                    "pct": round((value / max_count) * 100),
                    "metrics": [
                        {"label": "Units", "value": f"{value:,}"},
                        {
                            "label": "Share",
                            "value": f"{round((value / max_count) * 100)}%",
                        },
                    ],
                    "equipments": equipments,
                }
            )
        return rows

    def _department_distribution(self, qs):
        rows = list(
            qs.values("department__name")
            .annotate(value=Count("id"))
            .order_by("-value", "department__name")
        )
        max_value = max([row["value"] for row in rows] or [0])
        dept_dist = [
            {
                "label": row["department__name"] or "Unassigned",
                "value": row["value"],
                "primary": row["value"] == max_value and max_value > 0,
            }
            for row in rows
        ]

        dept_subs = {}
        sub_rows = (
            qs.values("department__name", "sub_department_f_key__name")
            .annotate(value=Count("id"))
            .order_by("department__name", "-value", "sub_department_f_key__name")
        )
        for row in sub_rows:
            dept = row["department__name"] or "Unassigned"
            sub = row["sub_department_f_key__name"] or "Unassigned"
            dept_subs.setdefault(dept, []).append(
                {"label": sub, "short": sub, "value": row["value"]}
            )
        return dept_dist, dept_subs

    def _category_segments(self, qs):
        colors = ["#4AA8FF", "#22C55E", "#F59E0B", "#A855F7", "#14B8A6"]
        category_labels = dict(ShipEquipment.TransactionCategory.choices)
        rows = list(
            qs.values("category")
            .annotate(value=Count("id"))
            .order_by("-value", "category")
        )
        if not rows:
            return []
        return [
            {
                "label": category_labels.get(
                    row["category"], row["category"] or "Unassigned"
                ),
                "value": row["value"],
                "color": colors[index % len(colors)],
            }
            for index, row in enumerate(rows)
        ]

    def _installation_trend(self, qs, today):
        labels = []
        fitted_values = []
        mapped_values = []
        active_values = []
        start_month = date(today.year, today.month, 1)
        months = []
        for offset in range(5, -1, -1):
            month = start_month.month - offset
            year = start_month.year
            while month <= 0:
                month += 12
                year -= 1
            months.append(date(year, month, 1))

        for month_start in months:
            next_month = (
                date(month_start.year + 1, 1, 1)
                if month_start.month == 12
                else date(month_start.year, month_start.month + 1, 1)
            )
            month_qs = qs.filter(
                created_at__date__gte=month_start,
                created_at__date__lt=next_month,
            )
            labels.append(month_start.strftime("%b"))
            fitted_values.append(month_qs.count())
            mapped_values.append(
                month_qs.filter(
                    Q(mapping_status="mapped") | Q(system__isnull=False)
                ).count()
            )
            active_values.append(month_qs.filter(active=True).count())

        series = [
            {
                "label": "Fitted",
                "color": "#4AA8FF",
                "values": fitted_values,
                "area": True,
            },
            {"label": "Mapped", "color": "#22C55E", "values": mapped_values},
            {"label": "Active", "color": "#F59E0B", "values": active_values},
        ]
        legend = [
            {
                "label": item["label"],
                "value": sum(item["values"]),
                "color": item["color"],
            }
            for item in series
        ]
        return labels, series, legend

    def _recent_activity(self, qs, today):
        items = qs.order_by("-updated_at", "-created_at", "-id")[:20]
        return [_build_activity_row(item, today) for item in items]

    def _pending_approval_rows(self):
        rows = []
        # Same approved_reject==2-is-Pending fix as the KPI count above.
        pending = RemoveEquipment.objects.select_related(
            "equipment", "ship_equipment"
        ).filter(approved_reject=2)[:10]
        for item in pending:
            rows.append(
                {
                    "title": getattr(item.equipment, "equipment_code", None)
                    or "Removal Request",
                    "sub": item.removal_remark or "Pending approval",
                    "meta": item.created_at.strftime("%d %b %Y")
                    if item.created_at
                    else "",
                    "tag": "In Progress",
                    "tagColor": "#F59E0B",
                    "dotColor": "#F59E0B",
                }
            )
        return rows

    def _alerts(self, pending_approvals, unmapped):
        alerts = []
        if pending_approvals:
            alerts.append(
                {
                    "text": f"{pending_approvals} SFD approval request(s) pending",
                    "tag": "In Progress",
                    "color": "#F59E0B",
                }
            )
        if unmapped:
            alerts.append(
                {
                    "text": f"{unmapped} equipment record(s) not mapped to a system",
                    "tag": "Master",
                    "color": "#F82C36",
                }
            )
        return alerts


class SFDOverviewActivityAPIView(APIView):
    """Period-aware, paginated version of the Overview's 'Recently Added,
    Updated or Removed Equipment' feed. Unlike `SFDOverviewAPIView`'s
    `activity` field (a fixed teaser of the latest 20 rows regardless of
    period), this endpoint actually queries the requested period from the
    DB and paginates it, so Quarter/Year can surface more than 20 rows.
    """

    def get(self, request):
        today = timezone.localdate()
        period = (request.query_params.get("period") or "month").strip().lower()
        days = ACTIVITY_PERIOD_DAYS.get(period, ACTIVITY_PERIOD_DAYS["month"])
        cutoff = today - timedelta(days=days)

        if rbac.is_admin_role(request.user):
            qs = (
                _ship_equipment_queryset()
                .select_related("department", "ship", "equipment")
                .annotate(activity_at=Coalesce("updated_at", "created_at"))
                .filter(
                    activity_at__date__gte=cutoff,
                )
                .order_by("-activity_at", "-id")
            )
        else:
            qs = (
                _ship_equipment_queryset()
                .select_related("department", "ship", "equipment")
                .annotate(activity_at=Coalesce("updated_at", "created_at"))
                .filter(
                    activity_at__date__gte=cutoff,
                    department=request.user.user_profile.department,
                )
                .order_by("-activity_at", "-id")
            )

        rows = [_build_activity_row(item, today) for item in qs]
        return _paginated_response(request, rows)


class RecentActivityAPIView(APIView):
    """Recent Activity popup (SFD Management header) — ported from cs_swmm_v1's
    RecentActivityAPIView. `RawRecentActivityRow` on the frontend (tag/date/equipment/
    createdby/code/others) is the confirmed response contract."""

    @staticmethod
    def _equipment_name(tx):
        if tx is None:
            return ""
        if tx.type == ShipEquipment.TransactionType.EQUIPMENT:
            return _equipment_display(tx.equipment) or tx.new_equipment_name or ""
        return _equipment_display(tx.system) or tx.new_system_name or ""

    @staticmethod
    def _profile_display_name(profile):
        rank_name = getattr(getattr(profile, "rank", None), "name", None) or ""
        first = getattr(profile, "firstname", None) or "Yogesh"
        last = getattr(profile, "lastname", None) or "Chauhan"
        return f"{rank_name} {first} {last}".strip()

    def _build_activity(self, *, tag, transaction, created_by, code, others):
        return {
            "tag": tag,
            "date": transaction.created_at,
            "equipment": self._equipment_name(transaction),
            "createdby": created_by,
            "code": code or "",
            "others": others or "",
        }

    def _add_activities(
        self,
        activities,
        queryset,
        *,
        tag,
        transaction_getter,
        created_by_getter,
        code_getter,
        others_getter,
    ):
        activities.extend(
            self._build_activity(
                tag=tag,
                transaction=transaction_getter(obj),
                created_by=created_by_getter(obj),
                code=code_getter(obj),
                others=others_getter(obj),
            )
            for obj in queryset
        )

    @staticmethod
    def _section_name(tx):
        if tx.sub_department_f_key:
            return tx.sub_department_f_key.name
        return tx.equipment_section or ""

    def get(self, request):
        ship_id = request.query_params.get("ship_id")
        if not ship_id:
            return Response(
                {"detail": "ship_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            days = int(request.query_params.get("days", 30))
            limit = int(request.query_params.get("limit", 10))
        except ValueError:
            return Response(
                {"detail": "days and limit must be integers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if days <= 0 or limit <= 0:
            return Response(
                {"detail": "days and limit must be greater than 0."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cutoff = timezone.now() - timedelta(days=days)
        activities = []

        # Added — a brand-new CAT III (New Induction) equipment row.
        #
        # `ship_id` here is the `universal_id_m_ship` query param (matches every other SFD
        # endpoint's convention — see this view's own docstring), NOT `ShipEquipment.ship_id`
        # itself, which is the plain integer FK to `master.Ship`'s PK. Filtering `ship_id=ship_id`
        # directly compared that PK against the universal id string instead — on this deployment
        # ship pk 32 ("EX - CHEETAH", the actually-active ship) has universal_id_m_ship "33", and
        # there happens to be a DIFFERENT ship at pk 33 ("EX - MAHISH") — so every query below
        # silently matched the wrong ship (one with no real data) and Recent Activity always came
        # back empty, regardless of how much real activity existed on the active ship.
        added = ShipEquipment.objects.select_related(
            "equipment", "system", "created_by"
        ).filter(
            ship__universal_id_m_ship=ship_id,
            category=ShipEquipment.TransactionCategory.CAT3,
            active=True,
            created_at__gte=cutoff,
        )
        # RBAC: a non-privileged user's Recent Activity only ever lists their own department's
        # equipment/requests — this endpoint had no department gate at all before.
        added = rbac.scope_queryset_to_department(added, request)
        self._add_activities(
            activities,
            added,
            tag="Added",
            transaction_getter=lambda obj: obj,
            created_by_getter=lambda obj: self._profile_display_name(obj.created_by),
            code_getter=lambda obj: obj.equipment_serial_no or obj.new_equipment_sr_no,
            others_getter=lambda obj: self._section_name(obj),
        )

        # Removed — an approved removal request (request_type=1, matching remove()'s create call).
        # approved_reject == 1 is Approved (see ChangeEquipmentRequest.approved_reject's own
        # comment) — this used to check ==2, which every create()/_update_sfd_transaction() call
        # sets explicitly for "Pending" (never left at the None default), so this always matched
        # still-pending removals instead of approved ones.
        removed = RemoveEquipment.objects.select_related(
            "ship_equipment__equipment",
            "ship_equipment__system",
            "ship_equipment__created_by",
        ).filter(
            ship_equipment__ship__universal_id_m_ship=ship_id,
            request_type=1,
            approved_reject=1,
            created_at__gte=cutoff,
        )
        removed = rbac.scope_queryset_to_department(
            removed, request, field="ship_equipment__department_id"
        )
        self._add_activities(
            activities,
            removed,
            tag="Removed",
            transaction_getter=lambda obj: obj.ship_equipment,
            created_by_getter=lambda obj: self._profile_display_name(
                obj.ship_equipment.created_by
            ),
            code_getter=lambda obj: obj.equipment_serial_no,
            others_getter=lambda obj: obj.removal_remark,
        )

        # Submitted (Remove/Change Serial) — awaiting INSMA approval.
        # approved_reject == 2 is Pending — remove()/_update_sfd_transaction() (SURVEY branch)
        # both set it explicitly on every submission, so it's never actually left NULL; filtering
        # on isnull=True (as this used to) never matched a single real request.
        submitted_remove = RemoveEquipment.objects.select_related(
            "ship_equipment__equipment",
            "ship_equipment__system",
            "ship_equipment__created_by",
        ).filter(
            ship_equipment__ship__universal_id_m_ship=ship_id,
            approved_reject=2,
            created_at__gte=cutoff,
        )
        submitted_remove = rbac.scope_queryset_to_department(
            submitted_remove, request, field="ship_equipment__department_id"
        )
        self._add_activities(
            activities,
            submitted_remove,
            tag="Submitted",
            transaction_getter=lambda obj: obj.ship_equipment,
            created_by_getter=lambda obj: self._profile_display_name(
                obj.ship_equipment.created_by
            ),
            code_getter=lambda obj: obj.equipment_serial_no or "",
            others_getter=lambda obj: "Sent for INSMA Approval",
        )

        # Submitted (Change — CAT I/II/III record amendment) — awaiting INSMA approval.
        # Same fix as submitted_remove above: create()/_update_sfd_transaction() both set
        # approved_reject=2 (Pending) explicitly on every submission — isnull=True never matched.
        submitted_change = ChangeEquipmentRequest.objects.select_related(
            "ship_equipment__equipment", "ship_equipment__system"
        ).filter(
            ship_equipment__ship__universal_id_m_ship=ship_id,
            approved_reject=2,
            created_at__gte=cutoff,
        )
        submitted_change = rbac.scope_queryset_to_department(
            submitted_change, request, field="ship_equipment__department_id"
        )
        self._add_activities(
            activities,
            submitted_change,
            tag="Submitted",
            transaction_getter=lambda obj: obj.ship_equipment,
            created_by_getter=lambda obj: (
                obj.universal_id_a_user_created_by or "Yogesh Chauhan"
            ),
            code_getter=lambda obj: (
                obj.ship_equipment.equipment_serial_no
                or obj.ship_equipment.new_equipment_sr_no
            ),
            others_getter=lambda obj: "Sent for INSMA Approval",
        )

        activities.sort(
            key=lambda item: item["date"] or timezone.make_aware(datetime.min),
            reverse=True,
        )
        return Response(activities[:limit])


class ConvertEquipmentToSystemAPIView(APIView):
    def post(self, request):
        tx = get_object_or_404(
            ShipEquipment, pk=request.data.get("equipment_id") or request.data.get("id")
        )
        tx.is_system = True
        tx.type = ShipEquipment.TransactionType.SYSTEM
        tx.save(update_fields=["is_system", "type"])
        return Response(SourceShipEquipmentSerializer(tx).data)


class ConvertSystemToEquipmentAPIView(APIView):
    def post(self, request):
        tx = get_object_or_404(
            ShipEquipment, pk=request.data.get("equipment_id") or request.data.get("id")
        )
        tx.is_system = False
        tx.type = ShipEquipment.TransactionType.EQUIPMENT
        tx.save(update_fields=["is_system", "type"])
        return Response(SourceShipEquipmentSerializer(tx).data)


class SupplierListAPIView(APIView):
    def get(self, request):
        suppliers = Supplier.objects.filter(
            supplier_manufacture=1, active="1"
        ).order_by("id")
        data = [
            {
                "supplier_id": s.id,
                "supplier_code": _first_value(s.supplier_code, s.SupplierCode),
                "supplier_name": _supplier_display(s),
                "address": getattr(s, "address", None),
                "country_code": getattr(s, "CountryCode", None),
                "contact_number": getattr(s, "Contact_Number", None),
                "email_id": getattr(s, "Email_ID", None),
                "universal_id_M_supplier": getattr(s, "Universal_ID_M_Supplier", None),
                "universal_id_M_country": getattr(s, "Universal_ID_M_Country", None),
            }
            for s in suppliers
        ]
        return _paginated_response(request, _sorted_by_label(data, "supplier_name"))


class ManufacturerListAPIView(APIView):
    def get(self, request):
        manufacturers = Supplier.objects.filter(
            supplier_manufacture=2, active="1"
        ).order_by("id")
        data = [
            {
                "manufacturer_id": s.id,
                "manufacturer_code": _first_value(s.supplier_code, s.SupplierCode),
                "manufacturer_name": _supplier_display(s),
                "address": getattr(s, "address", None),
                "country_code": getattr(s, "CountryCode", None),
                "contact_number": getattr(s, "Contact_Number", None),
                "email_id": getattr(s, "Email_ID", None),
                "universal_id_M_manufacturer": getattr(
                    s, "Universal_ID_M_Supplier", None
                ),
                "universal_id_M_country": getattr(s, "Universal_ID_M_Country", None),
            }
            for s in manufacturers
        ]
        return _paginated_response(request, _sorted_by_label(data, "manufacturer_name"))


class EquipmentListAPIView(APIView):
    def get(self, request):
        return ReferenceEquipmentMasterListAPIView().list(request)


class SystemListAPIView(EquipmentListAPIView):
    pass
