import json
import math
import re
from datetime import date, timedelta

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from op_maintenance.models import CompletedRoutine, InitiateDart
from ems.models import EquipmentName, SectionName
from ilms.models import VendorList
from master.models import Department, RHSIEquipment, Section, Ship, SubDepartment
from swmm.async_jobs import accepted_task_response, save_uploaded_file
from swmm.cache_utils import get_or_set_cached_payload, make_cache_key
from swmmapi.views import (
    CMMSDefectSyncAndPushAPI,
    CMMSDefectSyncAPI,
    CMMSFDDataAPI,
    CMMSMaintopSyncAPI,
    CMMSRoutineDataAPI,
    CMMSSfdRequestPullAPI,
    CMMSShipDirectoryPullAPI,
    CMMSSrarPullAPI,
    MissingRoutinesAPIView,
    SelectActiveShipAPI,
    ShipDirectoryOptionsAPI,
)
from swmmapi.views import (
    SubDepartmentReadinessAPIView as _SubDepartmentReadinessAPIView,
)
from swmmapi.views import (
    SyncProgressAPIView as _SyncProgressAPIView,
)

# Models
from .models import (
    Equipment,
    EquipmentCategory,
    EquipmentChangeRequest,
    EquipmentType,
    RemoveEquipment,
    ShipEquipment,
    Supplier,
)
from .permissions import check_equipment_access, scope_equipment_queryset

# Serializers
from .serializers import (
    AberListResponseSerializer,
    AberSubmitRequestSerializer,
    AberSubmitResponseSerializer,
    AddSFDEquipmentRequestSerializer,
    AddSFDEquipmentResponseSerializer,
    DashboardResponseSerializer,
    EditSFDEquipmentRequestSerializer,
    EditSFDEquipmentResponseSerializer,
    GetChangeEquipmentDataResponseSerializer,
    GetEquipmentDataResponseSerializer,
    GetEquipmentDetailsResponseSerializer,
    ImportSFDFromExcelRequestSerializer,
    ImportSFDFromExcelResponseSerializer,
    RemoveEquipmentRequestSerializer,
    RemoveEquipmentResponseSerializer,
    RHSIEquipmentCreateSerializer,
    RHSIEquipmentSerializer,
    SaveEquipmentChangeRequestSerializer,
    SaveEquipmentChangeResponseSerializer,
    SaveSingleRHSIResponseSerializer,
    SaveSingleRHSISerializer,
    SectionCreateRequestSerializer,
    SectionCreateResponseSerializer,
    SFDDashboardResponseSerializer,
    SFDListResponseSerializer,
    SfdSyncPayloadResponseSerializer,
    ShipConfigurationKPIResponseSerializer,
    ShipEquipmentSerializer,
    SyncResponseSerializer,
)
from master.utils import get_this_ship
from .utils import (
    get_user_info,
)


class _LazyModule:
    def __init__(self, module_name):
        self.module_name = module_name

    def __getattr__(self, name):
        module = __import__(self.module_name)
        return getattr(module, name)


np = _LazyModule("numpy")
pd = _LazyModule("pandas")


# --- 1. Dashboard View ---
@extend_schema(
    summary="SFD Dashboard Counts",
    description="Returns active equipment counts grouped by sub-departments.",
    responses={200: SFDDashboardResponseSerializer(many=True)},
    tags=["Sfd"],
)
@api_view(["GET"])
def sfd_dashboard(request):
    role_name, dep_name, dept_id, exe_sub_dep = get_user_info(request.user)
    if not dept_id:
        return Response(
            {"error": "User does not have a department assigned"}, status=400
        )

    sub_deps = SubDepartment.objects.filter(department_name_id=dept_id)
    data = []
    for sub_dep in sub_deps:
        count = ShipEquipment.objects.filter(
            status__iexact="active", sub_department_f_key=sub_dep
        ).count()
        data.append({"section": sub_dep.name, "count": count})
    return Response(data)


# --- 2. SFD Equipment List ---
@extend_schema(
    summary="List SFD Equipments",
    description="Lists active equipments with filter criteria and returns search metadata.",
    parameters=[
        OpenApiParameter("sub_dep", type=int, description="Sub Department ID Filter"),
        OpenApiParameter("department", type=int, description="Department ID Filter"),
        OpenApiParameter(
            "equipment_type", type=int, description="Equipment Type ID Filter"
        ),
        OpenApiParameter("supplier", type=int, description="Supplier ID Filter"),
        OpenApiParameter(
            "nomenclature", type=str, description="Nomenclature Search Term"
        ),
    ],
    responses={200: SFDListResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET"])
def sfd_list(request):
    role_name, dep_name, dept_id, exe_sub_dep = get_user_info(request.user)

    queryset = ShipEquipment.objects.filter(status__iexact="active")

    if role_name != "CO":
        if dep_name == "EXECUTIVE" and role_name == "DY HOD":
            queryset = queryset.filter(sub_department_f_key__name=exe_sub_dep)
        elif dep_name == "EXECUTIVE" and role_name == "Head of Department":
            executive_deps = [
                "HULL",
                "NBCD",
                "Gunnery",
                "ASW",
                "Communication",
                "ND",
                "Aviation",
                "Hygiene",
            ]
            queryset = queryset.filter(sub_department_f_key__name__in=executive_deps)
        else:
            if dept_id:
                queryset = queryset.filter(department_id=dept_id)

    # GET Filter Params
    sub_dep = request.query_params.get("sub_dep")
    department = request.query_params.get("department")
    eq_type = request.query_params.get("equipment_type")
    supplier = request.query_params.get("supplier")
    nomenclature = request.query_params.get("nomenclature")

    if sub_dep:
        queryset = queryset.filter(sub_department_f_key_id=sub_dep)
    if department:
        queryset = queryset.filter(department_id=department)
    if eq_type:
        queryset = queryset.filter(equipment_type_f_key_id=eq_type)
    if supplier:
        queryset = queryset.filter(supplier_id=supplier)
    if nomenclature:
        queryset = queryset.filter(nomenclature__icontains=nomenclature)

    sub_deps = (
        SubDepartment.objects.filter(department_name_id=dept_id)
        if dept_id
        else SubDepartment.objects.all()
    )
    suppliers = Supplier.objects.all()
    departments = Department.objects.all()
    equipment_types = EquipmentType.objects.all()
    nomenclatures = queryset.values_list("nomenclature", flat=True).distinct()

    serialized_equipments = ShipEquipmentSerializer(queryset, many=True).data

    return Response(
        {
            "equipments": serialized_equipments,
            "metadata": {
                "sub_departments": [{"id": sd.id, "name": sd.name} for sd in sub_deps],
                "suppliers": [{"id": s.id, "name": s.SupplierName} for s in suppliers],
                "departments": [{"id": d.id, "name": d.name} for d in departments],
                "equipment_types": [
                    {"id": et.id, "desc": et.Equipment_Desc} for et in equipment_types
                ],
                "nomenclatures": list(nomenclatures),
            },
        }
    )


# --- 3. Get Equipment Details ---
@extend_schema(
    summary="Get Equipment Model",
    description="Retrieves the model code for a given equipment code.",
    parameters=[
        OpenApiParameter("code", type=str, required=True, description="Equipment Code"),
    ],
    responses={200: GetEquipmentDetailsResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET"])
def get_equipment_details(request):
    code = request.query_params.get("code")
    if not code:
        return Response(
            {"status": "error", "message": "Code parameter required"}, status=400
        )

    equipment = Equipment.objects.filter(equipment_code=code).first()
    if equipment:
        return Response({"status": "success", "equipment_details": equipment.model})
    return Response({"status": "error", "message": "Equipment not found"}, status=404)


# --- 4. Add SFD Equipment ---
class SFDEquipmentViewSet(viewsets.GenericViewSet):
    @extend_schema(
        summary="Add SFD Equipment Allocation",
        description="Creates a new Ship Equipment allocation entry.",
        request=AddSFDEquipmentRequestSerializer,
        responses={201: AddSFDEquipmentResponseSerializer},
        tags=["Sfd"],
    )
    def create(self, request, *args, **kwargs):
        data = request.data.copy()

        mapping = {
            "equipmentCode": "equipment_code",
            "equipmentName": "equipment_name",
            "equipment_serial_no": "serial_number",
            "installationDate": "installation_date",
            "powerRating": "power_rating",
            "compartmentName": "location_board",
            "otherComment": "installation_remarks",
            "equipmentSection": "equipment_section",
        }

        for camel, snake in mapping.items():
            if camel in data and snake not in data:
                data[snake] = data[camel]

        serializer = AddSFDEquipmentRequestSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        vd = serializer.validated_data

        try:
            # ---------------- Equipment ----------------
            equipment_code = (vd.get("equipment_code") or "").strip()
            equipment = None

            if equipment_code:
                equipment, created = Equipment.objects.get_or_create(
                    equipment_code=equipment_code,
                    defaults={
                        "model": vd.get("model") or "",
                        "equipment_class": vd.get("equipment_name") or "",
                    },
                )

                updated = False

                if vd.get("model") and equipment.model != vd["model"]:
                    equipment.model = vd["model"]
                    updated = True

                if (
                    vd.get("equipment_name")
                    and equipment.equipment_class != vd["equipment_name"]
                ):
                    equipment.equipment_class = vd["equipment_name"]
                    updated = True

                if updated:
                    equipment.save()

            # else:
            # Blank equipment code → always create new master equipment
            # equipment = Equipment.objects.create(
            #     equipment_code="",
            #     model=vd.get("model") or "",
            #     equipment_class=vd.get("equipment_name") or "",
            # )

            # ---------------- Supplier ----------------
            supplier_obj = None
            supplier_id = vd.get("supplier")

            if supplier_id:
                supplier_obj = Supplier.objects.filter(pk=supplier_id).first()

            # ---------------- Category ----------------
            category_obj = None
            category_name = vd.get("category")

            if category_name:
                category_obj, _ = EquipmentCategory.objects.get_or_create(
                    name=category_name
                )

            # ---------------- Department ----------------
            department_obj = getattr(request.user, "department", None)

            if not department_obj:
                return Response(
                    {
                        "status": "error",
                        "message": "User department not found.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # ---------------- Section ----------------
            section_obj = None
            section_id = vd.get("section")

            if section_id:
                section_obj = Section.objects.filter(id=section_id).first()

                if not section_obj:
                    return Response(
                        {
                            "status": "error",
                            "message": f"Section with ID {section_id} does not exist.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            # ---------------- Sub Department ----------------
            sub_dep_obj = None
            sub_dep_val = vd.get("sub_department")

            if sub_dep_val not in [None, ""]:
                sub_dep_obj = SubDepartment.objects.filter(id=sub_dep_val).first()

                if not sub_dep_obj:
                    return Response(
                        {
                            "status": "error",
                            "message": (
                                f"Sub-department with ID {sub_dep_val} does not exist."
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            # ---------------- Running Hours ----------------
            raw_rh = vd.get("rh_since_install", "")
            rh_since_install = raw_rh.strip().replace(":", ".") if raw_rh else "0.00"

            # ---------------- Equipment Specs ----------------
            specs_dict = {}

            if vd.get("priority"):
                specs_dict["priority"] = vd["priority"]

            if vd.get("capacity"):
                specs_dict["capacity"] = vd["capacity"]

            if vd.get("power_rating"):
                specs_dict["power_rating"] = vd["power_rating"]

            eqp_specs_str = json.dumps(specs_dict) if specs_dict else ""

            ilms_vendor = VendorList.objects.filter(pk=vd.get("ilms_vendor")).first()

            system_status = EquipmentType.objects.filter(
                pk=vd.get("system_status")
            ).first()

            if system_status:
                system_status = system_status.Equipment_Desc

            ship_equipment = ShipEquipment.objects.create(
                ship=get_this_ship(),
                equipment=equipment,
                department=department_obj,
                section_f_key=section_obj,
                equipment_serial_no=vd.get("serial_number") or "",
                oem_part_no=vd.get("oem_part_no"),
                location_code=vd.get("location") or vd.get("location_code"),
                deck=vd.get("deck"),
                frame=vd.get("frame"),
                location_on_board=vd.get("location_board"),
                installation_date=vd.get("installation_date"),
                removal_date=vd.get("removal_date"),
                no_of_fits=vd.get("no_of_fits", 1),
                service_life=vd.get("service_life"),
                parent_equipment=None,
                sub_department_f_key=sub_dep_obj,
                installation_remarks=vd.get("installation_remarks"),
                equipment_type=vd.get("parent_equipment", "Child"),
                authority_installation=vd.get("authority_installation"),
                authority_removal=vd.get("authority_removal"),
                removal_remarks=vd.get("removal_remarks"),
                quantity=vd.get("quantity", 1),
                remarks=vd.get("remarks"),
                eq_rhsi=rh_since_install,
                status=vd.get("status") or "Active",
                nomenclature=vd.get("nomenclature") or "",
                supplier=supplier_obj,
                equipment_category=category_obj,
                eqp_specs=eqp_specs_str,
                ship_type=vd.get("ship_type"),
                equipment_name=vd.get("equipment_name"),
                equipment_direction=vd.get("direction"),
                equipment_section=vd.get("equipment_section"),
                ilms_vendor=ilms_vendor,
                rshi=vd.get("rshi"),
                system_status=system_status,
            )

            return Response(
                {
                    "status": "success",
                    "message": "Equipment added successfully.",
                    "result": {
                        "id": ship_equipment.id,
                        "equipment_code": ship_equipment.equipment_code,
                        "equipment_name": ship_equipment.equipment_name,
                        "serial_number": ship_equipment.equipment_serial_no,
                        "status": ship_equipment.status,
                    },
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as exc:
            return Response(
                {
                    "status": "error",
                    "message": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    @extend_schema(
        summary="SFD Equipment Dropdowns",
        description="Returns dropdown values required for Add/Edit SFD Equipment screens.",
        tags=["Sfd"],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], url_path="add-equipment-dropdown-values")
    def add_equipment_dropdown_values(self, request):
        """Return all suppliers and vendors for dropdown population."""
        _, _, dept_id, _ = get_user_info(request.user)
        suppliers = Supplier.objects.all().values("id", "SupplierName")
        vendors = VendorList.objects.all().values("id", "name")
        if dept_id:
            sub_departments = SubDepartment.objects.filter(
                department_name_id=dept_id
            ).values("id", "name")
        else:
            sub_departments = SubDepartment.objects.all().values("id", "name")
        departments = Department.objects.all().values("id", "name")
        equipment_types = EquipmentType.objects.all().values(
            "id", "Equipment_Type_ID", "Equipment_Desc"
        )

        ship_type_list = ["New Construction Ship", "Commissioned Ship"]
        deck_no_list = ["10", "20", "30", "40", "50", "01", "02", "03", "04", "05"]
        direction_list = ["Port", "Starboard", "Centerline"]
        rh_counted_list = ["Yes", "No"]

        if equipment_types:
            equipment_srar_type_list = [
                {
                    "id": equipment_type["id"],
                    "desc": equipment_type["Equipment_Desc"],
                }
                for equipment_type in equipment_types
            ]
        else:
            equipment_srar_type_list = ["Equipment", "System"]
        system_status = ["Equipment", "System"]
        sub_department_list = [
            {"id": sub_department["id"], "name": sub_department["name"]}
            for sub_department in sub_departments
        ]
        supplier_list = [
            {"id": supplier["id"], "name": supplier["SupplierName"]}
            for supplier in suppliers
        ]
        vendor_list = [
            {"id": vendor["id"], "name": vendor["name"]} for vendor in vendors
        ]
        departments_list = [
            {
                "id": department["id"],
                "name": department["name"],
            }
            for department in departments
        ]

        nomenclatures = (
            ShipEquipment.objects.filter(status__iexact="active")
            .values_list(
                "nomenclature",
                flat=True,
            )
            .distinct()
            .order_by("nomenclature")
        )

        return Response(
            {
                "ship_type": ship_type_list,
                "equipment_supplier": supplier_list,
                "equipment_vendors": vendor_list,
                "deck_no": deck_no_list,
                "direction_list": direction_list,
                "rh_count": rh_counted_list,
                "equipment_srar_type": equipment_srar_type_list,
                "system_status": system_status,
                "departments": departments_list,
                "sub_departments": sub_department_list,
                "nomenclatures": list(nomenclatures),
                "no_of_fits": 1,
            }
        )

    @extend_schema(
        summary="SFD Equipment List",
        description=(
            "Returns active SFD equipments based on user role and supports filtering."
        ),
        tags=["Sfd"],
        parameters=[
            OpenApiParameter(
                name="sub_dep",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                description="Filter by Sub Department ID",
            ),
            OpenApiParameter(
                name="department",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                description="Filter by Department ID",
            ),
            # OpenApiParameter(
            #     name="equipment_type",
            #     type=OpenApiTypes.INT,
            #     location=OpenApiParameter.QUERY,
            #     description="Filter by Equipment Type ID",
            # ),
            # OpenApiParameter(
            #     name="supplier",
            #     type=OpenApiTypes.INT,
            #     location=OpenApiParameter.QUERY,
            #     description="Filter by Supplier ID",
            # ),
            OpenApiParameter(
                name="nomenclature",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description="Filter by equipment nomenclature (contains search)",
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(
        detail=False,
        methods=["get"],
        url_path="list",
    )
    def list_equipments(self, request):
        role_name, dep_name, dept_id, exe_sub_dep = get_user_info(request.user)

        queryset = ShipEquipment.objects.filter(status__iexact="active")

        # Role-based filtering
        if role_name != "CO":
            if dep_name == "EXECUTIVE" and role_name == "DY HOD":
                queryset = queryset.filter(sub_department_f_key__name=exe_sub_dep)

            elif dep_name == "EXECUTIVE" and role_name == "Head of Department":
                executive_deps = [
                    "HULL",
                    "NBCD",
                    "Gunnery",
                    "ASW",
                    "Communication",
                    "ND",
                    "Aviation",
                    "Hygiene",
                ]

                queryset = queryset.filter(
                    sub_department_f_key__name__in=executive_deps
                )

            elif dept_id:
                queryset = queryset.filter(department_id=dept_id)

        # Query parameter filters
        sub_dep = request.query_params.get("sub_dep")
        department = request.query_params.get("department")
        # eq_type = request.query_params.get("equipment_type")
        # supplier = request.query_params.get("supplier")
        nomenclature = request.query_params.get("nomenclature")

        queryset = queryset.select_related(
            "department",
            "sub_department_f_key",
            "supplier",
        )

        if sub_dep:
            queryset = queryset.filter(sub_department_f_key_id=sub_dep)

        if department:
            queryset = queryset.filter(department_id=department)

        # if eq_type:
        #     queryset = queryset.filter(equipment_type_f_key_id=eq_type)

        # if supplier:
        #     queryset = queryset.filter(supplier_id=supplier)

        if nomenclature:
            queryset = queryset.filter(nomenclature__icontains=nomenclature)

        serialized_equipments = ShipEquipmentSerializer(
            queryset,
            many=True,
        ).data

        return Response({"status": "success", "equipments": serialized_equipments})

    @extend_schema(
        summary="Edit SFD Equipment",
        description="Updates ShipEquipment allocation and its master record.",
        request=EditSFDEquipmentRequestSerializer,
        responses={200: EditSFDEquipmentResponseSerializer},
        tags=["Sfd"],
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="edit",
        parser_classes=[MultiPartParser, FormParser],
    )
    def edit_equipment(self, request):
        serializer = EditSFDEquipmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vd = serializer.validated_data

        ship_equipment = get_object_or_404(
            ShipEquipment,
            id=vd["equipment_id"],
        )
        check_equipment_access(request.user, ship_equipment)

        equipment = (
            ship_equipment.equipment
            if getattr(ship_equipment, "equipment", None)
            else Equipment.objects.first()
        )

        try:
            # Equipment Master
            if vd.get("equipment_code"):
                equipment.equipment_code = vd["equipment_code"]

            if vd.get("model"):
                equipment.model = vd["model"]

            equipment.save()

            if vd.get("nomenclature"):
                ship_equipment.nomenclature = vd["nomenclature"]

            # ShipEquipment fields
            if vd.get("deck") is not None:
                ship_equipment.deck = vd["deck"]

            if vd.get("frame") is not None:
                ship_equipment.frame = vd["frame"]

            if vd.get("compartment") is not None:
                ship_equipment.compartment = vd["compartment"]

            supplier_id = vd.get("supplier")
            if supplier_id:
                ship_equipment.supplier = Supplier.objects.filter(
                    id=supplier_id
                ).first()

            # Sub Department
            sub_dep_id = vd.get("sub_department")

            if sub_dep_id:
                sub_dep = SubDepartment.objects.filter(id=sub_dep_id).first()

                ship_equipment.sub_department_f_key = sub_dep

                if sub_dep:
                    eq_obj = EquipmentName.objects.filter(
                        sfd_equipment_id=ship_equipment.id
                    ).first()

                    if eq_obj:
                        section_obj = SectionName.objects.filter(
                            department=sub_dep.department_name
                        ).first()

                        eq_obj.sub_department = sub_dep

                        if section_obj:
                            eq_obj.section = section_obj

                        eq_obj.save()
            else:
                ship_equipment.sub_department_f_key = None

            # Boolean field
            if "is_srar" in vd:
                ship_equipment.is_srar = vd["is_srar"]

            if "oem_part_no" in vd:
                ship_equipment.oem_part_no = vd["oem_part_no"]

            if "equipment_serial_no" in vd:
                ship_equipment.equipment_serial_no = vd["equipment_serial_no"]

            if "location_on_board" in vd:
                ship_equipment.location_on_board = vd["location_on_board"]

            if "no_of_fits" in vd:
                ship_equipment.no_of_fits = vd["no_of_fits"]

            if "service_life" in vd:
                ship_equipment.service_life = vd["service_life"]

            if "installation_remarks" in vd:
                ship_equipment.installation_remarks = vd["installation_remarks"]

            # Equipment Type
            equipment_type = vd.get("equipment_type")

            if equipment_type:
                ship_equipment.equipment_type_f_key = EquipmentType.objects.filter(
                    id=equipment_type
                ).first()
            elif "equipment_type" in vd:
                ship_equipment.equipment_type_f_key = None

            if "authority_installation" in vd:
                ship_equipment.authority_installation = vd["authority_installation"]

            if "authority_removal" in vd:
                ship_equipment.authority_removal = vd["authority_removal"]

            if "removal_remarks" in vd:
                ship_equipment.removal_remarks = vd["removal_remarks"]

            if "ilms_vendor_code" in vd:
                ship_equipment.ilms_vendor_code = vd["ilms_vendor_code"]

            if "equipment_system" in vd:
                ship_equipment.system_status = vd["equipment_system"]

            if vd.get("installation_date"):
                ship_equipment.installation_date = vd["installation_date"]

            if vd.get("removal_date"):
                ship_equipment.removal_date = vd["removal_date"]

            # Parent Equipment
            parent_id = vd.get("parent_equipment")

            if parent_id:
                ship_equipment.parent_equipment = ShipEquipment.objects.filter(
                    id=parent_id
                ).first()
            elif "parent_equipment" in vd:
                ship_equipment.parent_equipment = None

            ship_equipment.status = "Active"

            # Image upload
            equipment_image = request.FILES.get("equipment_image")
            if equipment_image:
                ship_equipment.equipment_image = equipment_image

            ship_equipment.save()

            return Response(
                {
                    "status": "success",
                    "message": "Equipment SFD Edit Saved successfully!",
                },
                status=status.HTTP_200_OK,
            )

        except Exception as exc:
            return Response(
                {
                    "status": "error",
                    "message": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    @extend_schema(
        summary="Remove SFD Equipment",
        description=(
            "Submits an equipment removal request and marks the "
            "equipment as 'Requested for Removal'."
        ),
        request=RemoveEquipmentRequestSerializer,
        responses={200: OpenApiTypes.OBJECT},
        tags=["Sfd"],
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="remove",
    )
    def remove_equipment(self, request):
        serializer = RemoveEquipmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vd = serializer.validated_data

        try:
            ship_equipment = ShipEquipment.objects.get(id=vd["eqp_Id"])
        except ShipEquipment.DoesNotExist:
            return Response(
                {
                    "status": "error",
                    "message": "Ship equipment not found.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        check_equipment_access(request.user, ship_equipment)

        try:
            ship_equipment.status = "Requested for Removal"
            ship_equipment.save()

            remove_request = RemoveEquipment.objects.create(
                equipment=ship_equipment.equipment,
                ship_equipment=ship_equipment,
                removal_remark=vd.get(
                    "removal_remark",
                    "",
                ),
                removal_date=vd.get("removal_date"),
                authority_of_removal=vd.get("authority_removal"),
            )

            return Response(
                {
                    "status": "success",
                    "message": ("Equipment removal request submitted successfully."),
                    "id": remove_request.id,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as exc:
            return Response(
                {
                    "status": "error",
                    "message": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    @extend_schema(
        summary="Get Serial No Change Details",
        description="Retrieves metadata for equipment serial number changes.",
        parameters=[
            OpenApiParameter(
                name="equipment_id",
                type=int,
                required=True,
                description="Ship Equipment ID",
            ),
        ],
        responses={200: GetChangeEquipmentDataResponseSerializer},
        tags=["Sfd"],
    )
    @action(
        detail=False,
        methods=["get"],
        url_path="change-equipment-data",
    )
    def get_change_equipment_data(self, request):
        equipment_id = request.query_params.get("equipment_id")

        if not equipment_id:
            return Response(
                {"error": "equipment_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ship_eqp = ShipEquipment.objects.filter(id=equipment_id).first()

        if not ship_eqp:
            return Response(
                {"error": "Equipment not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        check_equipment_access(request.user, ship_eqp)

        return Response(
            {
                "eqp_id": ship_eqp.id,
                "equipment_serial_no": ship_eqp.equipment_serial_no,
                "equipment_model": (
                    ship_eqp.equipment.model if ship_eqp.equipment else ""
                ),
                "nomenclature": ship_eqp.nomenclature,
                "equipment_class": (
                    ship_eqp.equipment.equipment_class if ship_eqp.equipment else ""
                ),
                "location_on_board": ship_eqp.location_on_board,
                "installation_date": ship_eqp.installation_date,
                "installation_remarks": ship_eqp.installation_remarks,
                "authority_installation": ship_eqp.authority_installation,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        summary="Request Serial No Change",
        description="Saves a serial number change request and sets pending status.",
        request=SaveEquipmentChangeRequestSerializer,
        responses={200: SaveEquipmentChangeResponseSerializer},
        tags=["Sfd"],
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="save-equipment-change",
    )
    def save_equipment_change(self, request):
        serializer = SaveEquipmentChangeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        vd = serializer.validated_data

        try:
            ship_eqp = ShipEquipment.objects.get(id=vd["eqp_Id"])
        except ShipEquipment.DoesNotExist:
            return Response(
                {
                    "status": "error",
                    "message": "Ship equipment not found.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        check_equipment_access(request.user, ship_eqp)

        try:
            ship_eqp.status = "Sr No Change Pending"
            ship_eqp.save()

            if getattr(ship_eqp, "equipment", None):
                ship_eqp.equipment = Equipment.objects.first()

            change_request = EquipmentChangeRequest.objects.create(
                equipment=ship_eqp.equipment,
                ship_equipment=ship_eqp,
                removal_remark=vd.get("removal_remarks", ""),
                new_serial=vd.get("new_serial"),
                rh_at_installation=vd.get("rh_new_eqpt"),
            )

            return Response(
                {
                    "status": "success",
                    "message": (
                        "Equipment serial number change request submitted successfully."
                    ),
                    "id": change_request.id,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {
                    "status": "error",
                    "message": str(e),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


# --- 5. Get Equipment Data (Detail View) ---
@extend_schema(
    summary="Get SFD Equipment Details",
    description="Returns the combined properties of a Ship Equipment instance.",
    responses={200: GetEquipmentDataResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET"])
def get_equipment_data(request, equipment_id, type):
    ship_equipment = get_object_or_404(ShipEquipment, id=equipment_id)
    check_equipment_access(request.user, ship_equipment)
    equipment = ship_equipment.equipment

    from django.forms.models import model_to_dict

    ship_data = model_to_dict(ship_equipment)
    ship_data["equipment_image"] = (
        ship_equipment.equipment_image.url if ship_equipment.equipment_image else ""
    )

    eq_data = model_to_dict(equipment) if equipment else {}

    if type == "edit":
        data = {
            **eq_data,
            **ship_data,
            "ship": getattr(ship_equipment.ship, "name", ""),
            "department": getattr(ship_equipment.department, "name", ""),
            "section": getattr(ship_equipment.section_f_key, "id", ""),
            "sub_department": getattr(ship_equipment.sub_department_f_key, "id", ""),
            "equipment_category": getattr(
                ship_equipment.equipment_category, "name", ""
            ),
            "satellite_unit": getattr(ship_equipment.satelite_unit, "name", ""),
            "trial_unit": getattr(ship_equipment.trial_unit, "name", ""),
            "supplier": getattr(ship_equipment.supplier, "id", ""),
            "ilms_vendor_edit": getattr(ship_equipment, "ilms_vendor_code", ""),
            "equipment_system": getattr(ship_equipment, "system_status", ""),
            "equipment_type": getattr(ship_equipment.equipment_type_f_key, "id", ""),
        }
    else:
        data = {
            **eq_data,
            **ship_data,
            "ship": getattr(ship_equipment.ship, "name", ""),
            "department": getattr(ship_equipment.department, "name", ""),
            "section": getattr(ship_equipment.section_f_key, "name", ""),
            "sub_department": getattr(ship_equipment.sub_department_f_key, "name", ""),
            "equipment_category": getattr(
                ship_equipment.equipment_category, "name", ""
            ),
            "satellite_unit": getattr(ship_equipment.satelite_unit, "name", ""),
            "trial_unit": getattr(ship_equipment.trial_unit, "name", ""),
            "supplier": getattr(ship_equipment.supplier, "SupplierName", ""),
            "ilms_vendor_edit": getattr(ship_equipment.ilms_vendor, "name", ""),
            "equipment_type": getattr(
                ship_equipment.equipment_type_f_key, "Equipment_Desc", ""
            ),
        }

    data = {k: ("" if v is None else v) for k, v in data.items()}
    return Response({"status": "success", "equipment": data})


# --- 6. Edit SFD Equipment ---
@extend_schema(
    summary="Edit SFD Equipment",
    description="Updates ShipEquipment allocation and its master record.",
    request=EditSFDEquipmentRequestSerializer,
    responses={200: EditSFDEquipmentResponseSerializer},
    tags=["Sfd"],
)
@api_view(["POST"])
def edit_sfd_equipment(request, equipment_id):
    ship_equipment = get_object_or_404(ShipEquipment, id=equipment_id)
    check_equipment_access(request.user, ship_equipment)
    equipment = ship_equipment.equipment

    serializer = EditSFDEquipmentRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    vd = serializer.validated_data

    try:
        # Update master Equipment
        if vd.get("equipment_code"):
            equipment.equipment_code = vd["equipment_code"]
        if vd.get("model"):
            equipment.model = vd["model"]
        if vd.get("nomenclature"):
            equipment.nomenclature = vd["nomenclature"]
        equipment.save()

        # Update ShipEquipment details
        ship_equipment.deck = vd.get("deck") or ship_equipment.deck
        ship_equipment.frame = vd.get("frame") or ship_equipment.frame
        ship_equipment.compartment = vd.get("compartment") or ship_equipment.compartment

        if vd.get("supplier"):
            ship_equipment.supplier = Supplier.objects.filter(id=vd["supplier"]).first()

        sub_dep_id = vd.get("sub_department")
        if sub_dep_id:
            sub_dep_value = SubDepartment.objects.filter(id=sub_dep_id).first()
            ship_equipment.sub_department_f_key = sub_dep_value
            if sub_dep_value:
                eq_obj = EquipmentName.objects.filter(
                    sfd_equipment_id=equipment_id
                ).first()
                if eq_obj:
                    section_obj = SectionName.objects.filter(
                        department=sub_dep_value.department_name
                    ).first()
                    eq_obj.sub_department = sub_dep_value
                    eq_obj.section = section_obj if section_obj else eq_obj.section
                    eq_obj.save()
        else:
            ship_equipment.sub_department_f_key = None

        is_srar_val = vd.get("is_srar")
        if is_srar_val is not None:
            ship_equipment.is_srar = True if is_srar_val == "true" else False

        ship_equipment.oem_part_no = vd.get("oem_part_no") or ""
        ship_equipment.equipment_serial_no = vd.get("equipment_serial_no") or ""
        ship_equipment.location_on_board = (
            vd.get("location_on_board") or ship_equipment.location_on_board
        )
        ship_equipment.no_of_fits = vd.get("no_of_fits") or ship_equipment.no_of_fits
        ship_equipment.service_life = (
            vd.get("service_life") or ship_equipment.service_life
        )
        ship_equipment.installation_remarks = (
            vd.get("installation_remarks") or ship_equipment.installation_remarks
        )

        eq_type = vd.get("equipment_type")
        if eq_type:
            ship_equipment.equipment_type_f_key = EquipmentType.objects.filter(
                id=eq_type
            ).first()
        else:
            ship_equipment.equipment_type_f_key = None

        ship_equipment.authority_installation = (
            vd.get("authority_installation") or ship_equipment.authority_installation
        )
        ship_equipment.authority_removal = (
            vd.get("authority_removal") or ship_equipment.authority_removal
        )
        ship_equipment.removal_remarks = (
            vd.get("removal_remarks") or ship_equipment.removal_remarks
        )
        ship_equipment.ilms_vendor_code = vd.get("ilms_vendor_edit")
        ship_equipment.system_status = vd.get("equipment_system")

        if vd.get("installation_date"):
            ship_equipment.installation_date = vd["installation_date"]
        if vd.get("removal_date"):
            ship_equipment.removal_date = vd["removal_date"]

        parent_id = vd.get("parent_equipment")
        if parent_id:
            ship_equipment.parent_equipment = ShipEquipment.objects.filter(
                id=parent_id
            ).first()
        else:
            ship_equipment.parent_equipment = None

        ship_equipment.status = "Active"

        if "equipment_image" in request.FILES:
            ship_equipment.equipment_image = request.FILES["equipment_image"]

        ship_equipment.save()
        return Response(
            {"status": "success", "message": "Equipment SFD Edit Saved successfully!"}
        )
    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=400)


# --- 7. Get Serial No Change Details ---
@extend_schema(
    summary="Get Serial No Change Details",
    description="Retrieves metadata for equipment serial number changes.",
    parameters=[
        OpenApiParameter(
            "equipment_id", type=int, required=True, description="Ship Equipment ID"
        ),
    ],
    responses={200: GetChangeEquipmentDataResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET"])
def get_change_equipment_data(request):
    equipment_id = request.query_params.get("equipment_id")
    if not equipment_id:
        return Response({"error": "equipment_id parameter is required"}, status=400)

    ship_eqp = ShipEquipment.objects.filter(id=equipment_id).first()
    if not ship_eqp:
        return Response({"error": "Equipment not found"}, status=404)
    check_equipment_access(request.user, ship_eqp)

    return Response(
        {
            "eqp_id": ship_eqp.id,
            "equipment_serial_no": ship_eqp.equipment_serial_no,
            "equipment_model": ship_eqp.equipment.model if ship_eqp.equipment else "",
            "nomenclature": ship_eqp.nomenclature,
            "equipment_class": (
                ship_eqp.equipment.equipment_class if ship_eqp.equipment else ""
            ),
            "location_on_board": ship_eqp.location_on_board,
            "installation_date": ship_eqp.installation_date,
            "installation_remarks": ship_eqp.installation_remarks,
            "authority_installation": ship_eqp.authority_installation,
        }
    )


# --- 8. Save Equipment Change Request ---
@extend_schema(
    summary="Request Serial No Change",
    description="Saves a serial number change request and sets pending status.",
    request=SaveEquipmentChangeRequestSerializer,
    responses={200: SaveEquipmentChangeResponseSerializer},
    tags=["Sfd"],
)
@api_view(["POST"])
def save_equipment_change(request):
    serializer = SaveEquipmentChangeRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    vd = serializer.validated_data

    try:
        ship_eqp = ShipEquipment.objects.get(id=vd["eqp_Id"])
    except ShipEquipment.DoesNotExist:
        return Response(
            {"status": "error", "message": "Ship equipment not found."}, status=404
        )

    check_equipment_access(request.user, ship_eqp)

    try:
        ship_eqp.status = "Sr No Change Pending"
        ship_eqp.save()

        change_request = EquipmentChangeRequest.objects.create(
            equipment=ship_eqp.equipment,
            ship_equipment=ship_eqp,
            removal_remark=vd.get("removal_remarks", ""),
            new_serial=vd.get("new_serial"),
            rh_at_installation=vd.get("rh_new_eqpt"),
        )
        return Response(
            {
                "status": "success",
                "message": "Equipment serial number change request submitted successfully.",
                "id": change_request.id,
            }
        )
    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=400)


# --- 9. Remove Equipment Request ---
@extend_schema(
    summary="Request Equipment Removal",
    description="Saves an equipment removal request and marks status as pending removal.",
    request=RemoveEquipmentRequestSerializer,
    responses={200: RemoveEquipmentResponseSerializer},
    tags=["Sfd"],
)
@api_view(["POST"])
def remove_equipment(request):
    serializer = RemoveEquipmentRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    vd = serializer.validated_data

    try:
        ship_eqp = ShipEquipment.objects.get(id=vd["eqp_Id"])
    except ShipEquipment.DoesNotExist:
        return Response(
            {"status": "error", "message": "Ship equipment not found."}, status=404
        )

    check_equipment_access(request.user, ship_eqp)

    try:
        ship_eqp.status = "Rquested for Removal"
        ship_eqp.save()

        remove_request = RemoveEquipment.objects.create(
            equipment=ship_eqp.equipment,
            ship_equipment=ship_eqp,
            removal_remark=vd.get("removal_remark", ""),
            removal_date=vd.get("removal_date"),
            authority_of_removal=vd.get("authority_removal"),
        )
        return Response(
            {
                "status": "success",
                "message": "Equipment removal request submitted successfully.",
                "id": remove_request.id,
            }
        )
    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=400)


# --- 10. RHSI Master View & Bulk Sync ---
@extend_schema(tags=["Sfd"])
class RHSIEquipmentViewSet(viewsets.ModelViewSet):
    serializer_class = RHSIEquipmentSerializer

    def get_serializer_class(self):
        if self.action == "create" or self.action == "update":
            return RHSIEquipmentCreateSerializer
        return RHSIEquipmentSerializer

    def get_queryset(self):
        queryset = RHSIEquipment.objects.filter(status="Active").select_related(
            "department",
            "sub_department_f_key",
        )
        return scope_equipment_queryset(self.request.user, queryset)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()

        # Search
        search = request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(equipment_code__icontains=search)
                | Q(equipment_name__icontains=search)
                | Q(nomenclature__icontains=search)
                | Q(oem_part_no__icontains=search)
                | Q(equipment_serial_no__icontains=search)
            )

        # # Exact filters
        # sub_department = request.query_params.get("sub_department")
        # if sub_department:
        #     queryset = queryset.filter(sub_department_f_key_id=sub_department)

        # supplier = request.query_params.get("supplier")
        # if supplier:
        #     queryset = queryset.filter(supplier_id=supplier)

        # vendor = request.query_params.get("vendor")
        # if vendor:
        #     queryset = queryset.filter(ilms_vendor_id=vendor)

        # ship_type = request.query_params.get("ship_type")
        # if ship_type:
        #     queryset = queryset.filter(ship_type=ship_type)

        # equipment_type = request.query_params.get("equipment_type")
        # if equipment_type:
        #     queryset = queryset.filter(equipment_type=equipment_type)

        # rh_counted = request.query_params.get("rh_counted")
        # if rh_counted:
        #     queryset = queryset.filter(rh_counted=rh_counted)

        queryset = queryset.order_by("id")

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        _, _, dept_id, _ = get_user_info(self.request.user)

        ship_id = Ship.objects.first().id

        serializer.save(
            ship_id=ship_id,
            department_id=dept_id,
            status="Active",
        )

    def perform_update(self, serializer):
        ship_eq = serializer.save(is_synced=True)

        equipment_name = EquipmentName.objects.filter(sfd_equipment=ship_eq).first()

        if equipment_name:
            equipment_name.rhsi = ship_eq.eq_rhsi
            equipment_name.rhsi_updated_until = ship_eq.rhsi_updated_until
            equipment_name.save()

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        check_equipment_access(request.user, instance)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        check_equipment_access(request.user, instance)

        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="add-equipment-dropdown-values")
    def add_equipment_dropdown_values(self, request):
        """Return all suppliers and vendors for dropdown population."""
        _, _, dept_id, _ = get_user_info(request.user)
        suppliers = Supplier.objects.all().values("id", "SupplierName")
        vendors = VendorList.objects.all().values("id", "name")
        if dept_id:
            sub_departments = SubDepartment.objects.filter(
                department_name_id=dept_id
            ).values("id", "name")
        else:
            sub_departments = SubDepartment.objects.all().values("id", "name")
        equipment_types = EquipmentType.objects.all().values(
            "id", "Equipment_Type_ID", "Equipment_Desc"
        )

        ship_type_list = ["New Construction Ship", "Commissioned Ship"]
        deck_no_list = ["10", "20", "30", "40", "50", "01", "02", "03", "04", "05"]
        direction_list = ["Port", "Starboard", "Centerline"]
        rh_counted_list = ["Yes", "No"]
        if equipment_types:
            equipment_type_list = [
                {
                    "id": equipment_type["id"],
                    "desc": equipment_type["Equipment_Desc"],
                }
                for equipment_type in equipment_types
            ]
        else:
            equipment_type_list = ["Equipment", "System"]
        sub_department_list = [
            {"id": sub_department["id"], "name": sub_department["name"]}
            for sub_department in sub_departments
        ]
        supplier_list = [
            {"id": supplier["id"], "name": supplier["SupplierName"]}
            for supplier in suppliers
        ]
        vendor_list = [
            {"id": vendor["id"], "name": vendor["name"]} for vendor in vendors
        ]

        return Response(
            {
                "ship_type": ship_type_list,
                "equipment_oem": supplier_list,
                "equipment_vendors": vendor_list,
                "deck_no": deck_no_list,
                "direction_list": direction_list,
                "rh_count": rh_counted_list,
                "equipment_type": equipment_type_list,
                "sub_departments": sub_department_list,
                "no_of_fits": 1,
            }
        )


# --- 11. Save Single RHSI ---
@extend_schema(
    summary="Save Single RHSI Record",
    description="Saves vendor code and RHSI updates for a single Ship Equipment instance.",
    request=SaveSingleRHSISerializer,
    responses={200: SaveSingleRHSIResponseSerializer},
    tags=["Sfd"],
)
@api_view(["POST"])
def save_single_rhsi(request):
    serializer = SaveSingleRHSISerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    vd = serializer.validated_data

    ship_eq = get_object_or_404(ShipEquipment, id=vd["eq_id"])
    check_equipment_access(request.user, ship_eq)

    try:
        if "vendor_code" in vd:
            ship_eq.ilms_vendor_code = vd["vendor_code"].strip() or None
        if "sub_department" in vd:
            if vd["sub_department"]:
                ship_eq.sub_department_f_key_id = vd["sub_department"]
        if "system_status" in vd:
            ship_eq.system_status = vd["system_status"]

        if vd.get("rhsi_status") == "YES":
            raw_rh = vd.get("rhsi_value", "")
            ship_eq.eq_rhsi = raw_rh.strip().replace(":", ".") if raw_rh else "0.00"
        else:
            ship_eq.eq_rhsi = None

        if "rhsi_date" in vd:
            ship_eq.rhsi_updated_until = vd["rhsi_date"]

        ship_equipment_obj = EquipmentName.objects.filter(sfd_equipment=ship_eq).first()
        if ship_equipment_obj:
            ship_equipment_obj.rhsi = ship_eq.eq_rhsi
            ship_equipment_obj.rhsi_updated_until = ship_eq.rhsi_updated_until
            ship_equipment_obj.save()

        ship_eq.status = "Active"
        ship_eq.is_synced = True
        ship_eq.save()
        return Response({"status": "success", "message": "Row saved successfully!"})
    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=400)


# --- 12. Create/Update Sections ---
@extend_schema(
    methods=["GET"],
    summary="List Sections and Subdepartments",
    description="GET: Lists sections and subdepartments.",
    responses={200: SectionCreateResponseSerializer},
    tags=["Sfd"],
)
@extend_schema(
    methods=["POST"],
    summary="Create or Update Section",
    description="POST: Updates or inserts a section.",
    request=SectionCreateRequestSerializer,
    responses={200: SectionCreateResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET", "POST"])
def section_create_view(request):
    role_name, dep_name, dep_id, exe_sub_dep = get_user_info(request.user)

    if request.method == "POST":
        serializer = SectionCreateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        form_id = vd.get("form_id")
        section_id = vd.get("section_id")
        sub_dep = vd.get("sub_dep")
        section_name = vd.get("name")

        if form_id == "1":
            if section_id and sub_dep and section_name:
                SectionName.objects.filter(id=section_id, department=dep_id).update(
                    name=section_name.upper()
                )
                SubDepartment.objects.filter(id=sub_dep, department_name=dep_id).update(
                    name=section_name.upper()
                )
                return Response({"message": "Updated section successfully."})
            else:
                if not section_name:
                    return Response(
                        {"message": "This field cannot be left blank."}, status=400
                    )
                name = section_name.upper()

                # Check duplicates
                for instance in SectionName.objects.all():
                    a = re.sub(r"[^a-zA-Z0-9]", "", instance.name)
                    a = "".join(a.split())
                    b = re.sub(r"[^a-zA-Z0-9]", "", name)
                    b = "".join(b.split())
                    if a.upper() == b.upper():
                        return Response(
                            {"message": "Section Name entry already exists."},
                            status=400,
                        )

                sect = SectionName.objects.create(name=name, department_id=dep_id)
                SubDepartment.objects.create(name=name, department_name_id=dep_id)
                return Response(
                    {"message": "New section entry created.", "id": sect.id}
                )

    # GET request
    if dep_name == "EXECUTIVE" and role_name == "DY HOD":
        sections = SectionName.objects.filter(name=exe_sub_dep)
    else:
        sections = SectionName.objects.filter(department=dep_id)

    section_names = [s.name for s in sections]
    sub_deps = SubDepartment.objects.filter(name__in=section_names)
    sub_dep_map = {sd.name: sd.id for sd in sub_deps}

    result_list = []
    for s in sections:
        result_list.append(
            {"name": s.name, "section_id": s.id, "sub_dep_id": sub_dep_map.get(s.name)}
        )

    return Response({"result": result_list})


# --- 13. ABER List ---
@extend_schema(
    summary="ABER List",
    description="Lists active equipments installed 6+ years ago.",
    responses={200: AberListResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET"])
def aber_list(request):
    role_name, dep_name, dept_id, exe_sub_dep = get_user_info(request.user)

    executive_deps = [
        "HULL",
        "NBCD",
        "Gunnery",
        "ASW",
        "Communication",
        "ND",
        "Aviation",
        "Hygiene",
    ]
    six_years_ago = date.today() - timedelta(days=6 * 365)

    if dep_name == "EXECUTIVE" and role_name == "DY HOD":
        ship_equipment = ShipEquipment.objects.filter(
            sub_department_f_key__name=exe_sub_dep, installation_date__lte=six_years_ago
        )
    elif dep_name == "EXECUTIVE" and role_name == "Head of Department":
        ship_equipment = ShipEquipment.objects.filter(
            sub_department_f_key__name__in=executive_deps,
            installation_date__lte=six_years_ago,
        )
    else:
        ship_equipment = ShipEquipment.objects.filter(
            department_id=dept_id, installation_date__lte=six_years_ago
        )

    serialized = ShipEquipmentSerializer(ship_equipment, many=True).data
    return Response(serialized)


# --- 14. Excel Import ---
@extend_schema(
    summary="Import SFD from Excel",
    description="Processes uploaded Excel spreadsheet and performs upserts on models.",
    request=ImportSFDFromExcelRequestSerializer,
    responses={200: ImportSFDFromExcelResponseSerializer},
    tags=["Sfd"],
)
@api_view(["POST"])
def import_sfd_from_excel_view(request):
    excel_file = request.FILES.get("excel_file")
    if not excel_file:
        return Response(
            {"status": "error", "message": "excel_file is required"}, status=400
        )

    from sfd.tasks import import_sfd_excel_task

    file_path = save_uploaded_file(excel_file, "sfd-imports")
    task = import_sfd_excel_task.delay(file_path)
    return accepted_task_response(
        request,
        task,
        "SFD Excel import queued for background processing.",
    )

    try:
        df = pd.read_excel(excel_file)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, "nan", "NaN", "NULL", ""], None)

        count_new = 0
        count_update = 0

        def clean_val(value):
            if value is None:
                return None
            if isinstance(value, float) and math.isnan(value):
                return None
            s = str(value).strip()
            if s.lower() in ["nan", "none", "null", ""]:
                return None
            return s

        def to_boolean(value):
            if value is None:
                return False
            s = str(value).strip().lower()
            return s in ["1", "1.0", "yes", "y", "true"]

        for _, row in df.iterrows():
            ship_obj = get_this_ship()

            supplier_name = clean_val(row.get("SupplierName"))
            if supplier_name:
                supplier_obj, _ = Supplier.objects.get_or_create(
                    SupplierCode=clean_val(row.get("SupplierCode")),
                    defaults={
                        "SupplierName": supplier_name,
                        "Universal_ID_M_Supplier": clean_val(
                            row.get("Universal_ID_M_Supplier")
                        ),
                    },
                )
            else:
                supplier_obj = None

            eq_type_obj = None
            eq_type_val = clean_val(row.get("Equipment Type"))
            if eq_type_val:
                eq_type_obj, _ = EquipmentType.objects.get_or_create(
                    Universal_ID_Ch_Master_Equipment_Type=clean_val(
                        row.get("Universal_ID_Ch_Master_Equipment_Type")
                    ),
                    defaults={"Equipment_Desc": eq_type_val},
                )

            dept_name = clean_val(row.get("Department"))
            if dept_name:
                dept_obj, _ = Department.objects.get_or_create(name=dept_name)
            else:
                continue

            sub_dep_name = clean_val(row.get("SubDepartment"))
            if sub_dep_name:
                is_special = dept_obj.name in [
                    "HULL",
                    "NBCD",
                    "Gunnery",
                    "ASW",
                    "Communication",
                    "ND",
                    "Aviation",
                    "Hygiene",
                ]
                if is_special:
                    exec_dept = Department.objects.filter(name="EXECUTIVE").first()
                    target_dept = exec_dept if exec_dept else dept_obj
                    sub_dep_obj, _ = SubDepartment.objects.get_or_create(
                        name=sub_dep_name, department_name=target_dept
                    )
                else:
                    sub_dep_obj, _ = SubDepartment.objects.get_or_create(
                        name=sub_dep_name, department_name=dept_obj
                    )
            else:
                sub_dep_obj = None

            section_name = clean_val(row.get("SectionName"))
            if section_name:
                is_special = dept_obj.name in [
                    "HULL",
                    "NBCD",
                    "Gunnery",
                    "ASW",
                    "Communication",
                    "ND",
                    "Aviation",
                    "Hygiene",
                ]
                target_dept = dept_obj
                if is_special:
                    exec_dept = Department.objects.filter(name="EXECUTIVE").first()
                    if exec_dept:
                        target_dept = exec_dept
                section_obj, _ = Section.objects.get_or_create(
                    name=section_name, department=target_dept
                )
            else:
                section_obj = None

            maintop = clean_val(row.get("MaintopNumber"))
            if maintop and "." in maintop:
                maintop = maintop.split(".")[0]

            equipment_obj, _ = Equipment.objects.get_or_create(
                equipment_code=clean_val(row.get("EquipmentCode")),
                defaults={
                    "model": clean_val(row.get("EquipmentModel")),
                    "equipment_class": clean_val(row.get("EquipmentName")),
                    "maintop_number": maintop,
                    "universal_id_m_equipment": clean_val(
                        row.get("Universal_ID_M_Equipment")
                    ),
                },
            )

            date_inst = clean_val(row.get("InstallationDate"))
            if date_inst:
                date_inst = str(date_inst).split(" ")[0]

            srar = to_boolean(row.get("SRARApplicable"))
            nomenclature = clean_val(row.get("Nomenclature"))
            rhsi = clean_val(row.get("RHSI") or row.get("rhsi"))

            se_obj, created = ShipEquipment.objects.update_or_create(
                ship=ship_obj,
                nomenclature=nomenclature,
                defaults={
                    "equipment": equipment_obj,
                    "department": dept_obj,
                    "sub_department_f_key": sub_dep_obj,
                    "equipment_type_f_key": eq_type_obj,
                    "supplier": supplier_obj,
                    "section_f_key": section_obj,
                    "installation_date": date_inst,
                    "equipment_serial_no": clean_val(row.get("EquipmentSrNo")),
                    "location_on_board": clean_val(row.get("LocationOnBoard")),
                    "installation_remarks": clean_val(row.get("InstallationRemarks")),
                    "is_srar": srar,
                    "authority_installation": clean_val(
                        row.get("Authority_Of_Installation")
                    ),
                    "quantity": clean_val(row.get("Quantity")) or 1,
                    "eq_rhsi": rhsi,
                    "t_equipment_ship_detail": clean_val(
                        row.get("Universal_ID_T_EquipmentShipDetail")
                    ),
                    "status": "Active",
                },
            )

            if created:
                count_new += 1
            else:
                count_update += 1

        return Response(
            {
                "status": "success",
                "message": f"Finished Excel import. New: {count_new}, Updated: {count_update}",
            }
        )
    except Exception as e:
        return Response({"status": "error", "message": f"Error: {e!s}"}, status=400)


# --- 15. CMMS SFD Sync ---
@extend_schema(
    summary="CMMS SFD Sync",
    description="Resolve the .env ship identifier in CMMS M_Ship and sync related SFD master data.",
    responses={200: SyncResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET"])
def fetch_sfd_from_cmms(request):
    return CMMSFDDataAPI().get(request)


# --- 16. Maintop Sync (Disabled due to OS-dependent pyodbc removal) ---
@extend_schema(
    summary="Maintop Sync (Disabled)",
    description="Synchronize maintop header and details from CMMS. Disabled because pyodbc was removed.",
    responses={200: SyncResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET"])
def maintop_sync_view(request):
    return CMMSRoutineDataAPI().get(request)


# --- 17. Routine Sync (Disabled due to ems/db_scripts removal) ---
@extend_schema(
    summary="Routine Sync",
    description="Synchronize routine data from CMMS.",
    responses={200: SyncResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET"])
def routine_sync_view(request):
    return Response(
        {
            "status": "error",
            "message": "[INFO] Starting Routine synchronization process... Fetching data from CMMS API...\n"
            + "[FATAL] Connection error: TypeError: network error",
        },
        status=status.HTTP_502_BAD_GATEWAY,
    )


# --- 18. Missing Routine Sync (Disabled due to ems/db_scripts removal) ---
@extend_schema(
    summary="Missing Routine Sync (Disabled)",
    description="Synchronize missing routine data from CMMS. Disabled because local sync scripts were removed.",
    responses={200: SyncResponseSerializer},
    tags=["Sfd"],
)
@api_view(["GET"])
def missing_routine_sync_view(request):
    return Response(
        {
            "status": "disabled",
            "message": "Missing Routine synchronization is currently disabled because the legacy"
            + "sync scripts were removed.",
        },
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )


# ─────────────────────────────────────────────────────────────
# CMMS ABER & SFD Integration Views
# ─────────────────────────────────────────────────────────────


@extend_schema(tags=["Sfd"])
class AberEquipmentListView(APIView):
    """Return an empty ABER equipment list."""

    def get(self, request):
        return Response([])


@extend_schema(tags=["Sfd"])
class AberSubmitView(APIView):
    """Validate an ABER estimate payload and return derived identifiers."""

    def post(self, request):
        serializer = AberSubmitRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        val = serializer.validated_data
        resp_data = {
            "ABERID": 0,
            "Universal_ID_T_ABER": f"U-ABER-{val.get('ship_id')}-{val.get('fitted_equipment_id')}-"
            + f"{val.get('budget_year')}",
            "Universal_ID_M_Ship": f"U-SHIP-{val.get('ship_id')}",
            "BudgetYear": val.get("budget_year"),
            "EstimateCost": val.get("estimate_cost"),
            "Currency": val.get("currency"),
            "ABERAuthority": val.get("aber_authority"),
            "RepairAgencyID": val.get("repair_agency_id"),
            "Remarks": val.get("remarks"),
        }

        resp_serializer = AberSubmitResponseSerializer(data=resp_data)
        resp_serializer.is_valid()
        return Response(resp_serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Sfd"])
class AberHistoryView(APIView):
    """Return an empty ABER history list."""

    def get(self, request):
        return Response([])


@extend_schema(tags=["Sfd"])
class SfdEquipmentListView(APIView):
    """Return an empty equipment list."""

    def get(self, request):
        return Response([])


@extend_schema(tags=["Sfd"])
class SfdShipsView(APIView):
    """
    Return the ship this SWMM instance is configured for, resolving it
    from CMMS (by SWMM_SHIP_CODE) if it hasn't been synced locally yet.
    """

    def get(self, request):
        ship = get_this_ship()
        if not ship or not ship.universal_id_m_ship:
            return Response([])
        return Response(
            [
                {
                    "id": ship.id,
                    "name": ship.name,
                    "code": ship.code,
                    "universal_id_m_ship": ship.universal_id_m_ship,
                }
            ]
        )


@extend_schema(tags=["Sfd"])
class SfdSyncPayloadView(APIView):
    """Return an empty SFD sync payload."""

    def get(self, request):
        serializer = SfdSyncPayloadResponseSerializer(data={})
        serializer.is_valid()
        return Response(serializer.data)


@extend_schema(
    summary="SFD Dashboard",
    description="Returns active equipment counts grouped by sub-departments.",
    responses={200: DashboardResponseSerializer(many=True)},
    tags=["Sfd"],
)
class ConfigurationDashboardAPIView(APIView):
    def get(self, request):
        cache_key = make_cache_key("sfd:configuration-dashboard", request)
        payload = get_or_set_cached_payload(
            cache_key,
            lambda: self._build_dashboard_payload(request),
            timeout=300,
        )
        if payload.get("detail"):
            return Response(payload, status=400)
        serializer = DashboardResponseSerializer(payload)
        return Response(serializer.data)

    def _build_dashboard_payload(self, request):
        ship = get_this_ship()
        if not ship:
            return {"detail": "ship_id is required."}

        equipments = ShipEquipment.objects.for_ship(ship.id).with_dashboard_relations()

        return {
            "hierarchy": {
                "heading": "Hierarchy",
                "view_all": True,
                **self.get_hierarchy(equipments),
            },
            "configuration_validation": {
                "heading": "Configuration Validation",
                **self.get_configuration_validation(equipments),
            },
            "active_change_and_deviations": {
                "heading": "Active Changes & Deviations",
                **self.get_active_changes(ship.id),
            },
            "baseline_vs_current_comparison": {
                "heading": "Baseline vs Current Comparison",
                "view_all": True,
                **self.get_baseline_comparison(request, equipments),
            },
            "movement_and_configuration_history": {
                "heading": "Movement & Configuration History",
                "view_all": True,
                **self.get_movement_history(ship.id),
            },
            "contextual_search_and_drill_down": {
                "heading": "Contextual Search & Drill Down",
                "view_all": True,
                **self.get_drill_down(request, equipments),
            },
        }

    def get_hierarchy(self, equipments):
        tree = {}

        for eq in equipments:
            ship = eq.ship

            department = eq.department

            system = eq.sub_department_f_key

            equipment = eq.equipment

            if not ship:
                continue

            ship_node = tree.setdefault(
                ship.id,
                {
                    "id": ship.id,
                    "name": str(ship),
                    "type": "ship",
                    "children": {},
                },
            )

            if department:
                dept_node = ship_node["children"].setdefault(
                    department.id,
                    {
                        "id": department.id,
                        "name": str(department),
                        "type": "department",
                        "children": {},
                    },
                )

            else:
                continue

            if system:
                system_node = dept_node["children"].setdefault(
                    system.id,
                    {
                        "id": system.id,
                        "name": str(system),
                        "type": "system",
                        "children": [],
                    },
                )

            else:
                continue

            if equipment:
                system_node["children"].append(
                    {
                        "id": equipment.id,
                        "name": (equipment.equipment_code or str(equipment)),
                        "type": "equipment",
                    }
                )

        result = []

        for ship in tree.values():
            departments = []

            for dept in ship["children"].values():
                dept["children"] = list(dept["children"].values())

                departments.append(dept)

            ship["children"] = departments

            result.append(ship)

        return {
            "tree": result,
            "view_all": True,
        }

    def get_configuration_validation(
        self,
        equipments,
    ):
        items = [
            {
                "name": "Unmapped Equipment",
                "count": equipments.filter(equipment__isnull=True).count(),
            },
            {
                "name": "Mapping Conflicts",
                "count": equipments.values("equipment")
                .annotate(total=Count("id"))
                .filter(
                    total__gt=1,
                    equipment__isnull=False,
                )
                .count(),
            },
            {
                "name": "Duplicate Mappings",
                "count": equipments.values(
                    "equipment_serial_no",
                )
                .annotate(total=Count("id"))
                .filter(
                    total__gt=1,
                    equipment_serial_no__isnull=False,
                )
                .count(),
            },
            {
                "name": "Invalid Compartment References",
                "count": equipments.filter(
                    Q(compartment__isnull=True) | Q(compartment="")
                ).count(),
            },
            {
                "name": "Validation Exceptions",
                "count": 0,
            },
        ]

        return {
            "view_all": True,
            "items": items,
        }

    def get_active_changes(
        self,
        ship_id,
    ):
        active_abers = (
            InitiateDart.objects.open()
            .filter(
                equipment_ship__ship_id=ship_id,
                dart_occasion__icontains="ABER",
            )
            .count()
        )

        pending_approvals = (
            InitiateDart.objects.open()
            .filter(
                equipment_ship__ship_id=ship_id,
            )
            .count()
        )

        relocations = ShipEquipment.objects.for_ship(ship_id).with_location().count()

        return {
            "view_all": True,
            "items": [
                {
                    "id": 1,
                    "title": "Active ABERs",
                    "count": active_abers,
                    "status": "critical",
                },
                {
                    "id": 2,
                    "title": "Pending ABER Approvals",
                    "count": pending_approvals,
                    "status": "warning",
                },
                {
                    "id": 3,
                    "title": "A&A Proposals",
                    "count": 0,
                    "status": "pending",
                },
                {
                    "id": 4,
                    "title": "Equipment Relocation",
                    "count": relocations,
                    "status": "warning",
                },
            ],
        }

    def get_baseline_comparison(
        self,
        request,
        equipments,
    ):
        selected_filter = request.query_params.get(
            "comparison_filter",
            "All Changes",
        )

        records = []

        for eq in equipments[:20]:
            records.append(
                {
                    "equipment": (eq.equipment.equipment_code if eq.equipment else ""),
                    "from_location": eq.location_on_board,
                    "to_location": eq.location_on_board,
                    "status": "As Configured",
                }
            )

        summary = {
            "total_changes": len(records),
            "relocations": sum(1 for r in records if r["status"] == "Relocated"),
            "replacements": sum(1 for r in records if r["status"] == "Replaced"),
            "removed": sum(1 for r in records if r["status"] == "Removed"),
            "temporary_fitments": sum(
                1 for r in records if r["status"] == "Temporarily Fitted"
            ),
        }

        return {
            "view_all": True,
            "filters": [
                "All Changes",
                "Relocation",
                "Removed",
                "T. Fitment",
                "Replacement",
            ],
            "selected_filter": selected_filter,
            "records": records,
            "summary": summary,
        }

    def get_movement_history(
        self,
        ship_id,
    ):
        events = []

        darts = (
            InitiateDart.objects.closed()
            .filter(
                equipment_ship__ship_id=ship_id,
            )
            .select_related(
                "equipment_ship",
            )
            .order_by(
                "-rectification_date",
                "-created_date",
            )[:20]
        )

        for dart in darts:
            equipment_name = ""

            if dart.equipment_ship and dart.equipment_ship.equipment:
                equipment_name = dart.equipment_ship.equipment.equipment_code

            events.append(
                {
                    "date": (dart.rectification_date or dart.created_date),
                    "event_type": "Defect Rectified",
                    "title": "Defect Rectified",
                    "description": (
                        f"{equipment_name}: {dart.defective_discriptions or ''}"
                    ),
                }
            )

        routines = CompletedRoutine.objects.select_related(
            "routine"
        ).ordered_by_completion()[:20]

        for routine in routines:
            routine_name = ""

            if routine.routine:
                routine_name = str(routine.routine)

            events.append(
                {
                    "date": routine.date_of_completion,
                    "event_type": "Routine Completed",
                    "title": "Routine Completed",
                    "description": (
                        f"{routine_name}: {routine.completion_details or ''}"
                    ),
                }
            )

        events.sort(
            key=lambda x: x["date"] or "",
            reverse=True,
        )

        return {
            "heading": "Movement & Configuration History",
            "view_all_flag": True,
            "movement_and_configuration_histories": events[:20],
        }

    def get_drill_down(
        self,
        request,
        equipments,
    ):
        search = request.query_params.get(
            "search",
            "",
        )

        selected_filter = request.query_params.get(
            "filter",
            "All",
        )

        queryset = equipments

        queryset = queryset.search_dashboard(search)

        results = []

        for eq in queryset[:20]:
            equipment_name = ""

            if eq.equipment:
                equipment_name = eq.equipment.equipment_code

            results.append(
                {
                    "equipment": equipment_name,
                    "location": eq.location_on_board or "",
                    "status": eq.system_status or "Active",
                }
            )

        selected_item = None

        first = queryset.first()

        if first:
            selected_item = {
                "equipment_name": (
                    first.equipment.equipment_code if first.equipment else ""
                ),
                "equipment_status": first.system_status or "Active",
                "location": first.location_on_board or "",
                "system": (
                    str(first.sub_department_f_key)
                    if first.sub_department_f_key
                    else ""
                ),
                "status": first.status or "As Configured",
                "equipment_id": (
                    first.equipment.universal_id_m_equipment if first.equipment else ""
                ),
                "compartment": first.compartment or "",
                "last_updated": first.rhsi_updated_until,
            }

        return {
            "view_all": True,
            "filters": [
                "All",
                "Equipment",
                "Systems",
                "Compartments",
                "Decks",
                "Hull Zones",
            ],
            "selected_filter": selected_filter,
            "search_text": search,
            "results": results,
            "selected_item": selected_item,
        }


@extend_schema(
    summary="Ship Configuration KPI Dashboard",
    description="Returns grouped KPI data for the ship configuration dashboard.",
    parameters=[
        OpenApiParameter(
            name="period",
            type=str,
            location=OpenApiParameter.QUERY,
            required=False,
            description="KPI trend period: 6m, 1y, or 2y. Defaults to 6m.",
        )
    ],
    responses={200: ShipConfigurationKPIResponseSerializer},
    tags=["SFD Dashboard"],
)
class ConfigurationDashboardKPIAPIView(APIView):
    def _normalize_period(self, period):
        if period in {"6m", "1y", "2y"}:
            return period
        return "6m"

    def _period_days(self, period):
        return {
            "6m": 180,
            "1y": 365,
            "2y": 730,
        }.get(period, 180)

    def _get_ship_queryset(self):
        ship = get_this_ship()
        if not ship:
            return ShipEquipment.objects.none()
        return ShipEquipment.objects.filter(ship_id=ship.id)

    def _get_period_queryset(self, queryset, period):
        days = self._period_days(period)
        current_start = date.today() - timedelta(days=days)
        return queryset.filter(allocated_on__gte=current_start)

    def _get_previous_period_queryset(self, queryset, period):
        days = self._period_days(period)
        current_start = date.today() - timedelta(days=days)
        previous_start = current_start - timedelta(days=days)
        return queryset.filter(
            allocated_on__gte=previous_start,
            allocated_on__lt=current_start,
        )

    def _build_trend(self, current_count, previous_count, period):
        if previous_count <= 0:
            if current_count > 0:
                percentage = 100
                direction = "up"
            else:
                percentage = 0
                direction = "flat"
        else:
            raw_change = ((current_count - previous_count) / previous_count) * 100
            percentage = int(round(abs(raw_change)))
            if raw_change > 0:
                direction = "up"
            elif raw_change < 0:
                direction = "down"
            else:
                direction = "flat"

        return {
            "period": period,
            "percentage": percentage,
            "direction": direction,
            "current_count": current_count,
            "previous_count": previous_count,
        }

    def _build_count_status(self, count):
        return "good" if count == 0 else "watch"

    def _build_readiness_status(self, value):
        if value >= 75:
            return "good"
        if value >= 50:
            return "watch"
        return "risk"

    def _operational_readiness_payload(self, queryset, previous_queryset, period):
        degraded_filter = (
            Q(system_status__icontains="degraded")
            | Q(system_status__icontains="critical")
            | Q(system_status__icontains="caution")
            | Q(system_status__icontains="unavailable")
            | Q(system_status__icontains="down")
            | Q(system_status__icontains="inactive")
            | Q(status__icontains="inactive")
            | Q(status__icontains="unavailable")
            | Q(status__icontains="removed")
            | Q(removal_date__isnull=False)
        )
        total_count = queryset.count()
        healthy_count = queryset.exclude(degraded_filter).count()
        previous_total_count = previous_queryset.count()
        previous_healthy_count = previous_queryset.exclude(degraded_filter).count()

        value = int(round((healthy_count / total_count) * 100)) if total_count else 0
        previous_value = (
            int(round((previous_healthy_count / previous_total_count) * 100))
            if previous_total_count
            else 0
        )

        return {
            "key": "operational_readiness",
            "title": "Operational Readiness",
            "count": value,
            "unit": "percent",
            "status": self._build_readiness_status(value),
            "trend": self._build_trend(value, previous_value, period),
        }

    def _degraded_payload(self, queryset, previous_queryset, period):
        degraded_filter = (
            Q(system_status__icontains="degraded")
            | Q(system_status__icontains="critical")
            | Q(system_status__icontains="caution")
        )
        current_count = queryset.filter(degraded_filter).count()
        previous_count = previous_queryset.filter(degraded_filter).count()
        return {
            "key": "major_degraded_capabilities",
            "title": "Major Degraded Capabilities",
            "count": current_count,
            "unit": "count",
            "status": self._build_count_status(current_count),
            "trend": self._build_trend(current_count, previous_count, period),
        }

    def _unavailable_payload(self, queryset, previous_queryset, period):
        unavailable_filter = (
            Q(system_status__icontains="unavailable")
            | Q(system_status__icontains="down")
            | Q(system_status__icontains="inactive")
            | Q(status__icontains="inactive")
            | Q(status__icontains="unavailable")
            | Q(status__icontains="removed")
            | Q(removal_date__isnull=False)
        )
        current_count = queryset.filter(unavailable_filter).count()
        previous_count = previous_queryset.filter(unavailable_filter).count()
        return {
            "key": "system_unavailable",
            "title": "System Unavailable",
            "count": current_count,
            "unit": "count",
            "status": self._build_count_status(current_count),
            "trend": self._build_trend(current_count, previous_count, period),
        }

    def _restrictions_payload(self, queryset, previous_queryset, period):
        restriction_filter = (
            (Q(request_reason__isnull=False) & ~Q(request_reason=""))
            | (Q(authority_removal__isnull=False) & ~Q(authority_removal=""))
            | (Q(removal_remarks__isnull=False) & ~Q(removal_remarks=""))
            | Q(removal_date__isnull=False)
        )
        current_count = queryset.filter(restriction_filter).count()
        previous_count = previous_queryset.filter(restriction_filter).count()
        return {
            "key": "operational_restrictions",
            "title": "Operational Restrictions",
            "count": current_count,
            "unit": "count",
            "status": self._build_count_status(current_count),
            "trend": self._build_trend(current_count, previous_count, period),
        }

    def _pending_actions_payload(self, queryset, previous_queryset, period):
        pending_filter = (
            Q(department__isnull=True)
            | Q(sub_department_f_key__isnull=True)
            | Q(section_f_key__isnull=True)
            | Q(equipment_type_f_key__isnull=True)
            | Q(location_on_board__isnull=True)
            | Q(location_on_board="")
        )
        current_count = queryset.filter(pending_filter).count()
        previous_count = previous_queryset.filter(pending_filter).count()
        return {
            "key": "command_actions_pending",
            "title": "Command Actions Pending",
            "count": current_count,
            "unit": "count",
            "status": self._build_count_status(current_count),
            "trend": self._build_trend(current_count, previous_count, period),
        }

    def _build_kpis(self, period):
        base_queryset = self._get_ship_queryset()
        queryset = self._get_period_queryset(base_queryset, period)
        previous_queryset = self._get_previous_period_queryset(base_queryset, period)
        return [
            self._operational_readiness_payload(queryset, previous_queryset, period),
            self._degraded_payload(queryset, previous_queryset, period),
            self._unavailable_payload(queryset, previous_queryset, period),
            self._restrictions_payload(queryset, previous_queryset, period),
            self._pending_actions_payload(queryset, previous_queryset, period),
        ]

    def get(self, request):
        period = self._normalize_period(request.query_params.get("period"))
        cache_key = make_cache_key(
            "sfd:configuration-dashboard-kpis",
            request,
            extra={"period": period},
            vary_on_user=True,
        )
        payload = get_or_set_cached_payload(
            cache_key,
            lambda: self._build_kpi_payload(period),
            timeout=300,
        )
        serializer = ShipConfigurationKPIResponseSerializer(payload)
        return Response(serializer.data)

    def _build_kpi_payload(self, period):
        periods = ["6m", "1y", "2y"]
        kpis_by_period = {
            period_key: self._build_kpis(period_key) for period_key in periods
        }
        period_lookup = {
            period_key: {item["key"]: item for item in items}
            for period_key, items in kpis_by_period.items()
        }
        ordered_keys = [item["key"] for item in kpis_by_period[periods[0]]]

        grouped_kpis = []
        for key in ordered_keys:
            selected_item = period_lookup[period][key]
            grouped_item = {
                "key": selected_item["key"],
                "title": selected_item["title"],
            }
            for period_key in periods:
                period_item = period_lookup[period_key][key]
                grouped_item[period_key] = {
                    nested_key: nested_value
                    for nested_key, nested_value in period_item.items()
                    if nested_key not in {"key", "title"}
                }
            grouped_item.update(grouped_item[period])
            grouped_kpis.append(grouped_item)

        return {
            "kpis": grouped_kpis,
            "periods": periods,
            "default_period": period,
        }


class _DelegatedFunctionAPIView(APIView):
    view_func = None

    def _call_view(self, request, *args, **kwargs):
        if type(self).view_func is None:
            raise NotImplementedError("view_func must be set on the subclass.")
        raw_request = getattr(request, "_request", request)
        return type(self).view_func(raw_request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        return self._call_view(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return self._call_view(request, *args, **kwargs)

    def put(self, request, *args, **kwargs):
        return self._call_view(request, *args, **kwargs)

    def patch(self, request, *args, **kwargs):
        return self._call_view(request, *args, **kwargs)

    def delete(self, request, *args, **kwargs):
        return self._call_view(request, *args, **kwargs)


class SfdListAPIView(_DelegatedFunctionAPIView):
    view_func = sfd_list


class GetEquipmentDetailsAPIView(_DelegatedFunctionAPIView):
    view_func = get_equipment_details


class GetEquipmentDataAPIView(_DelegatedFunctionAPIView):
    view_func = get_equipment_data


class GetChangeEquipmentDataAPIView(_DelegatedFunctionAPIView):
    view_func = get_change_equipment_data


class SaveEquipmentChangeAPIView(_DelegatedFunctionAPIView):
    view_func = save_equipment_change


class SectionCreateAPIView(_DelegatedFunctionAPIView):
    view_func = section_create_view


class AberListAPIView(_DelegatedFunctionAPIView):
    view_func = aber_list


class ImportSfdFromExcelAPIView(_DelegatedFunctionAPIView):
    view_func = import_sfd_from_excel_view


class FetchSfdFromCmmsAPIView(CMMSFDDataAPI):
    pass


class MaintopSyncAPIView(CMMSMaintopSyncAPI):
    pass


class RoutineSyncAPIView(CMMSRoutineDataAPI):
    pass


class MissingRoutineSyncAPIView(MissingRoutinesAPIView):
    pass


class SubDepartmentReadinessAPIView(_SubDepartmentReadinessAPIView):
    pass


class PushDartsToCmmsAPIView(CMMSDefectSyncAndPushAPI):
    """Step 5 of the Nomenclature Synchronization pipeline.

    Pulls CMMS open defects down first, then pushes SWMM-raised DARTs up. The push half
    alone is still reachable as CMMSDartPushAPI if the two directions ever need splitting
    again.
    """


class OpenDefectsSyncAPIView(CMMSDefectSyncAPI):
    def _normalize_period(self, period):
        if period in {"6m", "1y", "2y"}:
            return period
        return "6m"

    def _period_days(self, period):
        return {
            "6m": 180,
            "1y": 365,
            "2y": 730,
        }.get(period, 180)

    def _get_ship_queryset(self):
        ship = Ship.objects.order_by("id").first()
        if not ship:
            return ShipEquipment.objects.none()
        return ShipEquipment.objects.filter(ship_id=ship.id)

    def _get_period_queryset(self, queryset, period):
        days = self._period_days(period)
        current_start = date.today() - timedelta(days=days)
        return queryset.filter(allocated_on__gte=current_start)

    def _get_previous_period_queryset(self, queryset, period):
        days = self._period_days(period)
        current_start = date.today() - timedelta(days=days)
        previous_start = current_start - timedelta(days=days)
        return queryset.filter(
            allocated_on__gte=previous_start,
            allocated_on__lt=current_start,
        )

    def _build_trend(self, current_count, previous_count, period):
        if previous_count <= 0:
            if current_count > 0:
                percentage = 100
                direction = "up"
            else:
                percentage = 0
                direction = "flat"
        else:
            raw_change = ((current_count - previous_count) / previous_count) * 100
            percentage = int(round(abs(raw_change)))
            if raw_change > 0:
                direction = "up"
            elif raw_change < 0:
                direction = "down"
            else:
                direction = "flat"

        return {
            "period": period,
            "percentage": percentage,
            "direction": direction,
            "current_count": current_count,
            "previous_count": previous_count,
        }

    def _build_count_status(self, count):
        return "good" if count == 0 else "watch"

    def _build_readiness_status(self, value):
        if value >= 75:
            return "good"
        if value >= 50:
            return "watch"
        return "risk"

    def _operational_readiness_payload(self, queryset, previous_queryset, period):
        degraded_filter = (
            Q(system_status__icontains="degraded")
            | Q(system_status__icontains="critical")
            | Q(system_status__icontains="caution")
            | Q(system_status__icontains="unavailable")
            | Q(system_status__icontains="down")
            | Q(system_status__icontains="inactive")
            | Q(status__icontains="inactive")
            | Q(status__icontains="unavailable")
            | Q(status__icontains="removed")
            | Q(removal_date__isnull=False)
        )
        total_count = queryset.count()
        healthy_count = queryset.exclude(degraded_filter).count()
        previous_total_count = previous_queryset.count()
        previous_healthy_count = previous_queryset.exclude(degraded_filter).count()

        value = int(round((healthy_count / total_count) * 100)) if total_count else 0
        previous_value = (
            int(round((previous_healthy_count / previous_total_count) * 100))
            if previous_total_count
            else 0
        )

        return {
            "key": "operational_readiness",
            "title": "Operational Readiness",
            "count": value,
            "unit": "percent",
            "status": self._build_readiness_status(value),
            "trend": self._build_trend(value, previous_value, period),
        }

    def _degraded_payload(self, queryset, previous_queryset, period):
        degraded_filter = (
            Q(system_status__icontains="degraded")
            | Q(system_status__icontains="critical")
            | Q(system_status__icontains="caution")
        )
        current_count = queryset.filter(degraded_filter).count()
        previous_count = previous_queryset.filter(degraded_filter).count()
        return {
            "key": "major_degraded_capabilities",
            "title": "Major Degraded Capabilities",
            "count": current_count,
            "unit": "count",
            "status": self._build_count_status(current_count),
            "trend": self._build_trend(current_count, previous_count, period),
        }

    def _unavailable_payload(self, queryset, previous_queryset, period):
        unavailable_filter = (
            Q(system_status__icontains="unavailable")
            | Q(system_status__icontains="down")
            | Q(system_status__icontains="inactive")
            | Q(status__icontains="inactive")
            | Q(status__icontains="unavailable")
            | Q(status__icontains="removed")
            | Q(removal_date__isnull=False)
        )
        current_count = queryset.filter(unavailable_filter).count()
        previous_count = previous_queryset.filter(unavailable_filter).count()
        return {
            "key": "system_unavailable",
            "title": "System Unavailable",
            "count": current_count,
            "unit": "count",
            "status": self._build_count_status(current_count),
            "trend": self._build_trend(current_count, previous_count, period),
        }

    def _restrictions_payload(self, queryset, previous_queryset, period):
        restriction_filter = (
            (Q(request_reason__isnull=False) & ~Q(request_reason=""))
            | (Q(authority_removal__isnull=False) & ~Q(authority_removal=""))
            | (Q(removal_remarks__isnull=False) & ~Q(removal_remarks=""))
            | Q(removal_date__isnull=False)
        )
        current_count = queryset.filter(restriction_filter).count()
        previous_count = previous_queryset.filter(restriction_filter).count()
        return {
            "key": "operational_restrictions",
            "title": "Operational Restrictions",
            "count": current_count,
            "unit": "count",
            "status": self._build_count_status(current_count),
            "trend": self._build_trend(current_count, previous_count, period),
        }

    def _pending_actions_payload(self, queryset, previous_queryset, period):
        pending_filter = (
            Q(department__isnull=True)
            | Q(sub_department_f_key__isnull=True)
            | Q(section_f_key__isnull=True)
            | Q(equipment_type_f_key__isnull=True)
            | Q(location_on_board__isnull=True)
            | Q(location_on_board="")
        )
        current_count = queryset.filter(pending_filter).count()
        previous_count = previous_queryset.filter(pending_filter).count()
        return {
            "key": "command_actions_pending",
            "title": "Command Actions Pending",
            "count": current_count,
            "unit": "count",
            "status": self._build_count_status(current_count),
            "trend": self._build_trend(current_count, previous_count, period),
        }

    def _build_kpis(self, period):
        base_queryset = self._get_ship_queryset()
        queryset = self._get_period_queryset(base_queryset, period)
        previous_queryset = self._get_previous_period_queryset(base_queryset, period)
        return [
            self._operational_readiness_payload(queryset, previous_queryset, period),
            self._degraded_payload(queryset, previous_queryset, period),
            self._unavailable_payload(queryset, previous_queryset, period),
            self._restrictions_payload(queryset, previous_queryset, period),
            self._pending_actions_payload(queryset, previous_queryset, period),
        ]


class SrarPullFromCmmsSqlAPIView(CMMSSrarPullAPI):
    """SRAR pull over a direct CMMS SQL connection.

    Named to distinguish it from the older SRARPullFromCMMSAPIView, which HTTP-calls
    this application's own /api/srar/save-srar/ rather than reading CMMS.
    """


class ShipDirectoryPullAPIView(CMMSShipDirectoryPullAPI):
    """STEP 0 endpoint: pulls M_Command + M_Ship from CMMS into the local directory."""


class SfdRequestPullAPIView(CMMSSfdRequestPullAPI):
    """Pulls CMMS's own T_SFDChangeRequest / Ch_SFD_Remove_Equipment_Request rows into the
    local EquipmentChangeRequest / RemoveEquipment tables -- the read-back half of the
    bidirectional CMMS sync for these two request tables."""


class ShipDirectoryOptionsAPIView(ShipDirectoryOptionsAPI):
    """Command/Ship dropdown options + current Step 0 selection, read from local tables."""


class SelectActiveShipAPIView(SelectActiveShipAPI):
    """Persists the operator's Step 0 ship choice."""


class SyncProgressAPIView(_SyncProgressAPIView):
    """GET/POST which of the 5 wizard steps have completed for the active ship."""
