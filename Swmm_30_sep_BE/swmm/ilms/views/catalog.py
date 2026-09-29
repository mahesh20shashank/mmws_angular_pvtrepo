"""ILMS master-data catalog viewsets carrying real business logic — dashboards, search
helpers and context actions — as opposed to the thin CRUD-only viewsets in
`masters.py`: `MOItemEquipmentViewSet`, `ItemViewSet`, `VendorViewSet`,
`MoMappingTableViewSet`.
"""

from django.db.models import Q
from drf_spectacular.utils import OpenApiExample

from .. import models, serializers
from ..rbac_scope import filter_by_custom_user_department
from ..utils import tagged_viewset
from .base import (
    ILMSModelViewSet,
    _scoped_equipment_class_ids,
    _scoped_item_ids,
)

from rest_framework.decorators import action
from rest_framework.response import Response


@tagged_viewset("ILMS")
class MOItemEquipmentViewSet(ILMSModelViewSet):
    queryset = models.MOItemEquipment.objects.all()
    serializer_class = serializers.MOItemEquipmentSerializer


@tagged_viewset(
    "ILMS",
    create_examples=[
        OpenApiExample(
            "Create item",
            value={
                "item_code": "ILMS-1001",
                "item_desc": "HYDRAULIC FILTER ELEMENT",
                "item_deno": "NOS",
                "crp_category": "C",
                "inventory_holder": "ENGINEERING",
                "oem_name": "ACME HYDRAULICS",
                "oem_vendor_code": "VEN-001",
                "incat_yn": True,
            },
            request_only=True,
        )
    ],
)
class ItemViewSet(ILMSModelViewSet):
    queryset = models.Item.objects.all()
    serializer_class = serializers.ItemSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        query = self.request.query_params.get("q")
        if query:
            queryset = queryset.filter(
                Q(item_code__icontains=query) | Q(item_desc__icontains=query)
            )
        # `section_head` was removed from `Item` by source migration `0009`; the closest
        # surviving concept is `inventory_holder`, so the query param keeps its old name
        # (any existing caller/bookmark still works) but now filters the new field.
        section_head = self.request.query_params.get("section_head")
        category = self.request.query_params.get("category")
        incatted = self.request.query_params.get("incatted")
        if section_head:
            queryset = queryset.filter(inventory_holder__iexact=section_head)
        if category:
            queryset = queryset.filter(crp_category__iexact=category)
        if incatted is not None:
            queryset = queryset.filter(
                incat_yn=incatted.lower() in {"1", "true", "yes"}
            )
        return queryset

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        if request.query_params.get("type", "mo").lower() == "wed":
            return self._wed_dashboard(request)
        return self._mo_dashboard(request)

    def _wed_dashboard(self, request):
        from obs.models import Demand as ObsDemand
        from obs.models import PostSurvey, Spares
        from obs.models import Survey as ObsSurvey

        equipment_class_ids = _scoped_equipment_class_ids(request)

        return Response(
            {
                "spares": Spares.objects.filter(
                    Q(authority__name="WED ITEM") | Q(authority__name="B & D")
                ).count(),
                "pending_survey": ObsSurvey.objects.filter(
                    spare__equipment_class_id__in=equipment_class_ids
                ).count(),
                "pending_demand": ObsDemand.objects.filter(
                    spare__equipment_class_id__in=equipment_class_ids
                ).count(),
                "pending_pts": PostSurvey.objects.filter(
                    survey_number__in=["PTS", "OPDEM", "ONETIME APPROVAL"],
                    spare__equipment_class_id__in=equipment_class_ids,
                    has_pts=True,
                ).count(),
            }
        )

    def _mo_dashboard(self, request):
        item_ids = _scoped_item_ids(request)
        hod_inbox = (
            models.SurveyDetails.objects.filter(
                is_hod=True, ilms_spare_id__in=item_ids
            ).count()
            + models.PTSDetails.objects.filter(
                is_hod=True, ilms_spare_id__in=item_ids
            ).count()
            + models.DemandDetails.objects.filter(
                is_hod=True, ilms_spare_id__in=item_ids
            ).count()
        )
        approved_actions = (
            models.SurveyDetails.objects.filter(
                is_hod_approval=True, ilms_spare_id__in=item_ids
            ).count()
            + models.PTSDetails.objects.filter(
                is_hod_approval=True, ilms_spare_id__in=item_ids
            ).count()
            + models.DemandDetails.objects.filter(
                is_hod_approval=True, ilms_spare_id__in=item_ids
            ).count()
        )
        return Response(
            {
                "items": self.get_queryset().filter(pk__in=item_ids).count(),
                "vendors": models.Vendor.objects.count(),
                "mapped_items": models.MoMappingTable.objects.filter(
                    ilms_spare_id__in=item_ids
                ).count(),
                "pending_surveys": models.SurveyDetails.objects.filter(
                    is_survey=False, ilms_spare_id__in=item_ids
                ).count(),
                "pending_pts": models.PTSDetails.objects.filter(
                    is_pts=False, ilms_spare_id__in=item_ids
                ).count(),
                "pending_demands": models.DemandDetails.objects.filter(
                    is_demand=False, ilms_spare_id__in=item_ids
                ).count(),
                "hod_inbox": hod_inbox,
                "approved_actions": approved_actions,
                "pending_iif": models.IIF.objects.filter(
                    is_delete=False,
                    is_sync=False,
                ).count(),
            }
        )

    @action(detail=True, methods=["get"])
    def context(self, request, pk=None):
        item = self.get_object()
        mappings = models.MoMappingTable.objects.filter(
            ilms_spare_id=item
        ).select_related("vendor_id", "equipment")
        surveys = models.SurveyDetails.objects.filter(ilms_spare_id=item)
        pts_entries = models.PTSDetails.objects.filter(ilms_spare_id=item)
        demands = models.DemandDetails.objects.filter(ilms_spare_id=item)
        issued_items = models.ItemIssued.objects.filter(item=item).select_related(
            "customer"
        )

        return Response(
            {
                "item": self.get_serializer(item).data,
                "mappings": serializers.MoMappingTableSerializer(
                    mappings,
                    many=True,
                ).data,
                "surveys": serializers.SurveyDetailsSerializer(
                    surveys,
                    many=True,
                ).data,
                "pts": serializers.PTSDetailsSerializer(
                    pts_entries,
                    many=True,
                ).data,
                "demands": serializers.DemandDetailsSerializer(
                    demands,
                    many=True,
                ).data,
                "issued_items": serializers.ItemIssuedSerializer(
                    issued_items,
                    many=True,
                ).data,
            }
        )

    @action(detail=False, methods=["get"], url_path="search-list")
    def search_list(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    @action(detail=False, methods=["get"], url_path="search-enriched")
    def search_enriched(self, request):
        item_objects = self.get_queryset()[:100]
        item_code_list = list(item_objects.values_list("item_code", flat=True))

        stations_map = {}
        item_lines = models.ItemLine.objects.filter(
            item_code__in=item_code_list
        ).values(
            "item_code_id", "station_code", "sh_no", "datetime_added", "datetime_closed"
        )
        for line in item_lines:
            stations_map.setdefault(str(line["item_code_id"]), []).append(
                {
                    "station_code": line["station_code"],
                    "sh_no": line["sh_no"],
                    "available": "NO" if line["datetime_closed"] else "YES",
                    "datetime_added": (
                        str(line["datetime_added"]) if line["datetime_added"] else None
                    ),
                }
            )

        mo_mappings = (
            models.MoMappingTable.objects.filter(
                ilms_spare_id__item_code__in=item_code_list,
                equipment__isnull=False,
            )
            .select_related("ilms_spare_id", "equipment", "equipment__equipment")
            .values(
                "ilms_spare_id__item_code",
                "equipment__id",
                "equipment__equipment__equipment_code",
                "equipment__nomenclature",
            )
        )
        equipment_map = {}
        for mapping in mo_mappings:
            item_code = mapping["ilms_spare_id__item_code"]
            equipment_map.setdefault(
                item_code,
                {
                    "equipment_code": (
                        mapping["equipment__equipment__equipment_code"] or ""
                    ),
                    "equipment_id": (
                        str(mapping["equipment__id"])
                        if mapping["equipment__id"]
                        else ""
                    ),
                    "nomenclature": mapping["equipment__nomenclature"] or "",
                },
            )

        item_details = []
        for item in item_objects:
            key = str(item.item_code)
            eq_info = equipment_map.get(key, {})
            item_details.append(
                {
                    "item_code": item.item_code,
                    "inventory_holder": item.inventory_holder,
                    "item_desc": item.item_desc,
                    "item_deno": item.item_deno,
                    "crp_category": item.crp_category,
                    "obsolescence": item.obsolescence,
                    "obsolete": item.obsolete,
                    "oem_name": item.oem_name,
                    "oem_vendor_code": item.oem_vendor_code,
                    "datetime_approved": (
                        str(item.datetime_approved) if item.datetime_approved else None
                    ),
                    "approved_by": item.approved_by,
                    "incat_yn": item.incat_yn,
                    "stations": stations_map.get(key, []),
                    "equipment_code": eq_info.get("equipment_code", ""),
                    "equipment_id": eq_info.get("equipment_id", ""),
                    "nomenclature": eq_info.get("nomenclature", ""),
                }
            )

        from ems.models import RoutineDescription

        routine_list = (
            filter_by_custom_user_department(
                RoutineDescription.objects.all(),
                request,
                field="department_f_key_id",
            )
            .order_by("-id")
            .values("id", "dart_number", "routine_description")
        )

        return Response(
            {
                "items": item_details,
                "routine_list": list(routine_list),
            }
        )


@tagged_viewset(
    "ILMS",
    create_examples=[
        OpenApiExample(
            "Create vendor",
            value={
                "vendor_code": "VEN-001",
                "name": "NAVAL SPARES SUPPLIER",
                "vendor_class": "OEM",
                "country_code": "IN",
            },
            request_only=True,
        )
    ],
)
class VendorViewSet(ILMSModelViewSet):
    queryset = models.Vendor.objects.all()
    serializer_class = serializers.VendorSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        query = self.request.query_params.get("q")
        if query:
            queryset = queryset.filter(name__icontains=query)
        return queryset

    @action(detail=False, methods=["get"], url_path="search-list")
    def search_list(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    @action(detail=False, methods=["get"], url_path="search-table")
    def search_table(self, request):
        vendor_code = request.query_params.get("vendor_code", "").strip()
        vendor_name = request.query_params.get("vendor_name", "").strip()
        vendors = models.Vendor.objects.all()
        if vendor_code:
            vendors = vendors.filter(vendor_code__icontains=vendor_code)
        if vendor_name:
            vendors = vendors.filter(name__icontains=vendor_name)
        vendors = vendors[:100]

        data = [
            {
                "ser": index,
                "vendor_code": vendor.vendor_code or "-",
                "vendor_name": vendor.name or "-",
                "vendor_class": vendor.vendor_class or "-",
                "addressee": vendor.addressee or "-",
                "approved_by": vendor.approved_by or "-",
                "date_approved": (
                    vendor.datetime_approved.strftime("%Y-%m-%d")
                    if vendor.datetime_approved
                    else "-"
                ),
                "date_banupto": (
                    str(vendor.date_banned_upto) if vendor.date_banned_upto else "-"
                ),
                "city": vendor.city or "-",
                "state": vendor.state or "-",
                "add_line1": vendor.address_line1 or "-",
                "add_line2": vendor.address_line2 or "-",
                "add_line3": vendor.address_line3 or "-",
                "pincode": vendor.pin_code or "-",
                "country_cd": vendor.country_code or "-",
                "remarks": vendor.remarks or "-",
                "gst_no": vendor.gst_no or "-",
            }
            for index, vendor in enumerate(vendors, start=1)
        ]
        return Response({"status": "success", "data": data})


@tagged_viewset("ILMS")
class MoMappingTableViewSet(ILMSModelViewSet):
    queryset = models.MoMappingTable.objects.select_related(
        "equipment",
        "ilms_spare_id",
        "vendor_id",
    )
    serializer_class = serializers.MoMappingTableSerializer
