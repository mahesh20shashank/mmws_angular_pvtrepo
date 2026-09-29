"""
DRF Views and ViewSets for the Tank Module.
Enforces PEP 8 compliance and RESTful API standards.
"""

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import FloatField, OuterRef, Q, Subquery
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Fluid,
    FluidInTank,
    FluidType,
    FuellingDetails,
    Hierarchyforchart,
    MeasurementFuelsondingFinal,
    SoundingDraft,
    TankCategory,
    TankFluidUnit,
    TankFuelSounding,
    TankLocation,
    TankOil,
    TankRecord,
    TankSoundingData,
    TankSoundingMaster,
    TankTypeDetail,
)
from .serializers import (
    BulkSoundingSaveRequestSerializer,
    FluidInTankSerializer,
    FluidSerializer,
    FluidTypeSerializer,
    FuellingDetailsSerializer,
    FuelSoundingSerializer,
    HierarchyforchartSerializer,
    SoundingDraftSerializer,
    TankCategorySerializer,
    TankFluidUnitSerializer,
    TankFuelSoundingSerializer,
    TankLocationSerializer,
    TankOilSerializer,
    TankRecordSerializer,
    TankSoundingDataSerializer,
    TankSoundingMasterSerializer,
    TankTypeDetailSerializer,
    UpdateGraphNoRequestSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Base ModelViewSet for Tank Read/Write Operations
# ─────────────────────────────────────────────────────────────


class BaseReadWriteViewSet(viewsets.ModelViewSet):
    """Base ViewSet enforcing standard REST response format."""

    permission_classes = [IsAuthenticatedOrReadOnly]

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response(
            {
                "status": "success",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(
            {
                "status": "success",
                **serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(
            {
                "status": "success",
                **serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(
            {
                "status": "success",
                **serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        model_name = self.queryset.model._meta.verbose_name.title()
        return Response(
            {
                "status": "success",
                "message": f"{model_name} deleted successfully.",
            },
            status=status.HTTP_200_OK,
        )


# ─────────────────────────────────────────────────────────────
# Granular Model ViewSets
# ─────────────────────────────────────────────────────────────


@extend_schema(tags=["Tank"])
class TankFluidUnitViewSet(BaseReadWriteViewSet):
    queryset = TankFluidUnit.objects.all().order_by("id")
    serializer_class = TankFluidUnitSerializer


@extend_schema(tags=["Tank"])
class TankTypeDetailViewSet(BaseReadWriteViewSet):
    queryset = TankTypeDetail.objects.all().order_by("id")
    serializer_class = TankTypeDetailSerializer


@extend_schema(tags=["Tank"])
class TankSoundingMasterViewSet(BaseReadWriteViewSet):
    queryset = TankSoundingMaster.objects.all().order_by("id")
    serializer_class = TankSoundingMasterSerializer


@extend_schema(tags=["Tank"])
class TankSoundingDataViewSet(BaseReadWriteViewSet):
    queryset = TankSoundingData.objects.all().order_by("id")
    serializer_class = TankSoundingDataSerializer


@extend_schema(tags=["Tank"])
class MeasurementViewSet(BaseReadWriteViewSet):
    queryset = MeasurementFuelsondingFinal.objects.all().order_by("id")
    serializer_class = FuelSoundingSerializer


@extend_schema(tags=["Tank"])
class TankCategoryViewSet(BaseReadWriteViewSet):
    queryset = TankCategory.objects.all().order_by("id")
    serializer_class = TankCategorySerializer


@extend_schema(tags=["Tank"])
class FluidTypeViewSet(BaseReadWriteViewSet):
    queryset = FluidType.objects.all().order_by("id")
    serializer_class = FluidTypeSerializer


@extend_schema(tags=["Tank"])
class FluidViewSet(BaseReadWriteViewSet):
    queryset = Fluid.objects.all().order_by("id")
    serializer_class = FluidSerializer


@extend_schema(tags=["Tank"])
class TankLocationViewSet(BaseReadWriteViewSet):
    queryset = TankLocation.objects.all().order_by("id")
    serializer_class = TankLocationSerializer


@extend_schema(tags=["Tank"])
class TankOilViewSet(BaseReadWriteViewSet):
    queryset = TankOil.objects.all().order_by("id")
    serializer_class = TankOilSerializer


@extend_schema(tags=["Tank"])
class FuellingDetailsViewSet(BaseReadWriteViewSet):
    queryset = FuellingDetails.objects.all().order_by("id")
    serializer_class = FuellingDetailsSerializer


@extend_schema(tags=["Tank"])
class FluidInTankViewSet(BaseReadWriteViewSet):
    queryset = FluidInTank.objects.all().order_by("id")
    serializer_class = FluidInTankSerializer


@extend_schema(tags=["Tank"])
class TankRecordViewSet(BaseReadWriteViewSet):
    queryset = TankRecord.objects.all().order_by("id")
    serializer_class = TankRecordSerializer


@extend_schema(tags=["Tank"])
class SoundingDraftViewSet(BaseReadWriteViewSet):
    queryset = SoundingDraft.objects.all().order_by("id")
    serializer_class = SoundingDraftSerializer


@extend_schema(tags=["Tank"])
class TankFuelSoundingViewSet(BaseReadWriteViewSet):
    queryset = TankFuelSounding.objects.all().order_by("id")
    serializer_class = TankFuelSoundingSerializer


@extend_schema(tags=["Tank"])
class HierarchyforchartViewSet(BaseReadWriteViewSet):
    queryset = Hierarchyforchart.objects.all().order_by("id")
    serializer_class = HierarchyforchartSerializer


# ─────────────────────────────────────────────────────────────
# Workflow & Specialized APIViews
# ─────────────────────────────────────────────────────────────


GRAPH_SLOTS = (1, 2, 3, 4)

EMPTY_GRAPH_SLOT_SUMMARY = {
    "category_id": None,
    "category_name": "",
    "count": 0,
    "total_held": 0,
    "total_95": 0,
    "filled_pct": 0,
    "topup_pct": 0,
    "unit": "",
}


def _build_graph_slot_data(category_id):
    """Returns (tank_list, summary_dict) for the given TankCategory id.

    Shared by TankDashboardAPIView and UpdateGraphNoAPIView so a slot's
    numbers are always computed the same way.
    """
    if not category_id:
        return [], dict(EMPTY_GRAPH_SLOT_SUMMARY)

    category_obj = (
        TankCategory.objects.select_related("fluid").filter(id=category_id).first()
    )
    if not category_obj:
        return [], dict(EMPTY_GRAPH_SLOT_SUMMARY)

    measuring_unit = category_obj.fluid.measuring_unit if category_obj.fluid else "Units"
    category_name = category_obj.tank_category or ""

    latest_readings = TankSoundingData.objects.filter(
        tank_category_detail=OuterRef("pk")
    ).order_by("-reading_time")

    master_95_cap = TankSoundingMaster.objects.filter(
        tank_category_detail=OuterRef("pk"), percentage_flag=95
    ).values("volume")[:1]

    master_100_cap = TankSoundingMaster.objects.filter(
        tank_category_detail=OuterRef("pk"), percentage_flag=100
    ).values("volume")[:1]

    tanks_qs = TankTypeDetail.objects.filter(tank_id=category_id).select_related("tank")

    annotated = tanks_qs.annotate(
        last_tonnes=Subquery(latest_readings.values("tonnes")[:1]),
        last_mm=Subquery(latest_readings.values("mm_measurement")[:1]),
        last_time=Subquery(latest_readings.values("reading_time")[:1]),
        master_c95=Subquery(master_95_cap, output_field=FloatField()),
        master_c100=Subquery(master_100_cap, output_field=FloatField()),
    )

    result_list = []
    total_held = 0.0
    total_95 = 0.0
    for t in annotated:
        held = float(t.last_tonnes or 0)
        cap95 = float(t.master_c95 or 0)
        cap100 = float(t.master_c100 or 0)
        total_held += held
        total_95 += cap95

        result_list.append(
            {
                "sno": t.id,
                "n": t.tank_type if t.tank_type else t.tank.manual_name,
                "c95": cap95,
                "c100": cap100,
                "T": held,
                "mm": t.last_mm or 0,
                "d": t.last_time.strftime("%d %b %Y") if t.last_time else None,
                "ti": t.last_time.strftime("%H:%M") if t.last_time else None,
            }
        )

    filled_pct = (total_held / total_95 * 100) if total_95 > 0 else 0
    topup_pct = max(100 - filled_pct, 0)

    summary = {
        "category_id": category_id,
        "category_name": category_name,
        "unit": measuring_unit,
        "count": annotated.count(),
        "total_held": round(total_held, 2),
        "total_95": round(total_95, 2),
        "filled_pct": round(filled_pct, 1),
        "topup_pct": round(topup_pct, 1),
    }
    return result_list, summary


@extend_schema(tags=["Tank"])
class TankDashboardAPIView(APIView):
    """
    Returns the 4 configurable graph-slot summaries for the Onboard POL
    Status dashboard, plus categories still available for assignment.
    """

    def get(self, request):
        assigned = {
            cat.graph_no: cat
            for cat in TankCategory.objects.filter(graph_no__in=GRAPH_SLOTS)
        }
        unassigned_categories = list(
            TankCategory.objects.filter(graph_no__isnull=True)
            .values("id", "tank_category")
            .order_by("tank_category")
        )

        graphs = []
        for slot in GRAPH_SLOTS:
            cat = assigned.get(slot)
            if cat:
                tanks, summary = _build_graph_slot_data(cat.id)
            else:
                tanks, summary = [], dict(EMPTY_GRAPH_SLOT_SUMMARY)
            graphs.append(
                {
                    "slot": slot,
                    "category_id": cat.id if cat else None,
                    "category_name": (
                        cat.tank_category if cat else f"Graph {slot} (Empty)"
                    ),
                    "tanks": tanks,
                    "summary": summary,
                }
            )

        latest_sounding = TankSoundingData.objects.order_by("-reading_time").first()
        return Response(
            {
                "status": "success",
                "graphs": graphs,
                "unassigned_categories": unassigned_categories,
                "soundings_update_date": (
                    latest_sounding.reading_time if latest_sounding else None
                ),
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Tank"])
class TankDetailAPIView(APIView):
    """
    Filtered drill-down list of tanks (the "Detailed POL" view), by
    category/location/subtype query params.
    """

    def get(self, request):
        f_cat = request.query_params.get("category_id")
        f_loc = request.query_params.get("location")
        f_sub = request.query_params.get("subtype")

        query = Q()
        if f_cat:
            query &= Q(tank_id=f_cat)
        if f_loc:
            query &= Q(location_id=f_loc)
        if f_sub:
            query &= Q(tank_subtype__iexact=f_sub)

        tanks_qs = TankTypeDetail.objects.filter(query).select_related(
            "tank", "location", "fluid_type"
        )

        latest_readings = TankSoundingData.objects.filter(
            tank_category_detail=OuterRef("pk")
        ).order_by("-reading_time")
        master_95 = TankSoundingMaster.objects.filter(
            tank_category_detail=OuterRef("pk"), percentage_flag=95
        ).order_by("-mm_level")
        master_100 = TankSoundingMaster.objects.filter(
            tank_category_detail=OuterRef("pk"), percentage_flag=100
        ).order_by("-mm_level")

        annotated_tanks = tanks_qs.annotate(
            last_tonnes=Subquery(latest_readings.values("tonnes")[:1]),
            last_mm=Subquery(latest_readings.values("mm_measurement")[:1]),
            last_time=Subquery(latest_readings.values("reading_time")[:1]),
            cap_95_from_master=Subquery(
                master_95.values("volume")[:1], output_field=FloatField()
            ),
            cap_100_from_master=Subquery(
                master_100.values("volume")[:1], output_field=FloatField()
            ),
        )

        result_list = []
        for t in annotated_tanks:
            cap_100 = float(t.cap_100_from_master or t.capacity or 0)
            cap_95 = float(t.cap_95_from_master or (cap_100 * 0.95 if cap_100 else 0))
            held = float(t.last_tonnes or 0)
            fill_pct = round((held / cap_100 * 100), 1) if cap_100 > 0 else 0
            tank_name = t.tank_type or t.tank.manual_name or t.tank.tank_category or "—"
            location_name = t.location.location_name if t.location else "—"

            result_list.append(
                {
                    "nomenclature": tank_name,
                    "location": location_name,
                    "subtype": t.tank_subtype or "—",
                    "cap_100": cap_100,
                    "cap_95": cap_95,
                    "mm": t.last_mm or 0,
                    "updated_at": (
                        t.last_time.strftime("%d %b %Y, %H:%M")
                        if t.last_time
                        else "No Data"
                    ),
                    "tonnes": held,
                    "pct": fill_pct,
                    "status": (
                        "High"
                        if fill_pct >= 95
                        else "Low" if fill_pct < 30 else "Normal"
                    ),
                }
            )

        result_list.sort(key=lambda x: x["pct"], reverse=True)

        return Response(
            {"status": "success", "tanks": result_list}, status=status.HTTP_200_OK
        )


@extend_schema(tags=["Tank"])
class TankCategoryDropdownAPIView(APIView):
    """
    Tank-category dropdown, enriched with fluid/fluid-type/measuring-unit
    and a per-category tank count.
    """

    def get(self, request):
        qs = TankCategory.objects.select_related("fluid", "fluid__fluid_type").order_by(
            "id"
        )
        rows = []
        for t in qs:
            f = t.fluid
            ft = f.fluid_type if f else None
            rows.append(
                {
                    "id": t.id,
                    "tank_category": t.tank_category,
                    "tank_name": t.manual_name,
                    "manual_name": t.manual_name,
                    "count": t.details.count(),
                    "fluid_id": f.id if f else None,
                    "fluid": f.fluid if f else None,
                    "fluid_type_id": ft.id if ft else None,
                    "fluid_type": ft.fluid_type if ft else None,
                    "measuring_unit": f.measuring_unit if f else None,
                }
            )
        return Response(
            {"status": "success", "tank_types": rows}, status=status.HTTP_200_OK
        )


@extend_schema(tags=["Tank"])
class TanksByTypeAPIView(APIView):
    """
    Tanks for a chosen category (or all tanks when none is chosen), with
    capacity, limiting (95%) sounding, and latest reading.
    """

    def get(self, request):
        type_id = request.query_params.get("type_id", "").strip()

        if type_id and type_id != "0":
            master = get_object_or_404(TankCategory, id=type_id)
            tank_details = TankTypeDetail.objects.filter(
                tank__tank_category=master.tank_category
            ).select_related("tank")
        else:
            tank_details = TankTypeDetail.objects.all().select_related("tank")

        results = []
        for detail in tank_details:
            sounding_95 = TankSoundingMaster.objects.filter(
                tank_category_detail=detail, percentage_flag=95
            ).first()
            latest_sounding = (
                TankSoundingData.objects.filter(tank_category_detail=detail)
                .order_by("-reading_time")
                .first()
            )
            results.append(
                {
                    "id": detail.id,
                    "tank_name": detail.tank_type,
                    "capacity": float(detail.capacity) if detail.capacity else 0.0,
                    "limiting_sounding": (
                        sounding_95.mm_level if sounding_95 else 0
                    ),
                    "latest_mm": (
                        latest_sounding.mm_measurement if latest_sounding else 0
                    ),
                    "latest_tonnes": (
                        latest_sounding.tonnes
                        if latest_sounding and latest_sounding.tonnes
                        else 0
                    ),
                }
            )

        return Response(
            {"status": "success", "results": results}, status=status.HTTP_200_OK
        )


@extend_schema(tags=["Tank"])
class SoundingBulkSaveAPIView(APIView):
    """Bulk-saves multiple tank soundings entered in the sounding-entry modal."""

    @transaction.atomic
    def post(self, request):
        serializer = BulkSoundingSaveRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        created_ids = []
        for item in serializer.validated_data["data"]:
            record = TankSoundingData.objects.create(
                tank_category_detail_id=item["tank_id"],
                mm_measurement=item["sounding_mm"],
                tonnes=item.get("during_ras_ton"),
                reading_time=item["reading_time"],
            )
            created_ids.append(record.id)

        return Response(
            {"status": "success", "created_ids": created_ids},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Tank"])
class UpdateGraphNoAPIView(APIView):
    """Reassigns which TankCategory occupies a dashboard graph slot (1-4)."""

    @transaction.atomic
    def post(self, request):
        serializer = UpdateGraphNoRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        slot = int(serializer.validated_data["graph_slot"])
        new_cat_id = serializer.validated_data["new_category_id"]

        TankCategory.objects.filter(graph_no=slot).update(graph_no=None)
        new_cat = TankCategory.objects.filter(id=new_cat_id).first()
        if not new_cat:
            return Response(
                {"status": "error", "message": f"Category {new_cat_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        new_cat.graph_no = slot
        new_cat.save(update_fields=["graph_no"])

        tanks, summary = _build_graph_slot_data(new_cat_id)
        return Response(
            {
                "status": "success",
                "slot": slot,
                "category_id": new_cat.id,
                "category_name": new_cat.tank_category,
                "tanks": tanks,
                "summary": summary,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Tank"])
class UnassignedCategoriesAPIView(APIView):
    """Categories not currently assigned to a dashboard graph slot."""

    def get(self, request):
        cats = list(
            TankCategory.objects.filter(graph_no__isnull=True)
            .values("id", "tank_category")
            .order_by("tank_category")
        )
        return Response(
            {"status": "success", "categories": cats}, status=status.HTTP_200_OK
        )


class FuellingHistoryAPIView(APIView):
    """
    Returns fuelling history logs and active fuelling operations.
    """

    def get(self, request):
        records = FuellingDetails.objects.all().order_by("-id")
        serializer = FuellingDetailsSerializer(records, many=True)
        return Response(
            {
                "status": "success",
                "fuelling_history": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class FuellingSaveAPIView(APIView):
    """
    Creates or updates a fuelling detail entry.
    """

    @transaction.atomic
    def post(self, request):
        instance = None
        record_id = request.data.get("id")
        if record_id:
            instance = get_object_or_404(FuellingDetails, pk=record_id)

        serializer = FuellingDetailsSerializer(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {
                "status": "success",
                "message": "Fuelling details saved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK if instance else status.HTTP_201_CREATED,
        )


class TankRASMonitorAPIView(APIView):
    """
    Returns RAS (Replenishment at Sea) monitoring data for a specific tank or vessel.
    """

    def get(self, request, id):
        fuelling = FuellingDetails.objects.filter(pk=id).first()
        if not fuelling:
            return Response(
                {
                    "status": "error",
                    "message": f"No fuelling record found for id {id}.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            {
                "status": "success",
                "ras_monitor": FuellingDetailsSerializer(fuelling).data,
            },
            status=status.HTTP_200_OK,
        )


class TankCalibrationAPIView(APIView):
    """
    mm -> tonnes calibration lookup (with linear interpolation) for a tank,
    or the full calibration curve when no mm is given.
    """

    def get(self, request):
        tank_id = request.query_params.get("tank_id")
        mm_input = request.query_params.get("mm")

        if not tank_id:
            return Response(
                {"status": "error", "message": "Tank ID is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        records = TankSoundingMaster.objects.filter(
            tank_category_detail_id=tank_id
        ).order_by("mm_level")
        if not records.exists():
            return Response(
                {"status": "error", "message": "No Sounding Chart Available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if mm_input:
            try:
                a2 = float(mm_input)
            except ValueError:
                return Response(
                    {"status": "error", "message": "Invalid mm input."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            max_cap_record = records.filter(percentage_flag=100).first()

            if a2 < 0:
                limit = int(max_cap_record.mm_level) if max_cap_record else 0
                return Response(
                    {
                        "status": "error",
                        "message": (
                            f"Please enter a valid sounding 0mm to {limit}mm (100%)."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if max_cap_record and a2 > max_cap_record.mm_level:
                return Response(
                    {
                        "status": "error",
                        "message": (
                            "Sounding cannot be greater than "
                            f"{int(max_cap_record.mm_level)}mm (100%)."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            exact_match = records.filter(mm_level=a2).first()
            if exact_match:
                return Response(
                    {
                        "status": "success",
                        "calculated_tone": round(exact_match.volume, 2),
                    }
                )

            lower = records.filter(mm_level__lt=a2).last()
            upper = records.filter(mm_level__gt=a2).first()
            if not lower or not upper:
                return Response(
                    {"status": "error", "message": "Out of Range"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            a1, b1 = lower.mm_level, lower.volume
            a3, b3 = upper.mm_level, upper.volume
            b2 = b1 + (a2 - a1) * (b3 - b1) / (a3 - a1)

            return Response({"status": "success", "calculated_tone": round(b2, 2)})

        data_list = [
            {"mm": r.mm_level, "volume": round(r.volume, 2), "flag": r.percentage_flag}
            for r in records
        ]
        return Response({"status": "success", "data": data_list})
