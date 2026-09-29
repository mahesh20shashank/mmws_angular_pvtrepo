from django.db.models import Q
from django.db import transaction
from drf_spectacular.utils import extend_schema, OpenApiParameter
from rest_framework import filters, status
from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from ilms.models import Item
from master.models import (
    ChMasterShipRemarksBy,
    ChMasterSymptoms,
    Manufacturer,
    MSeverity,
    Section,
    Supplier,
)
from master.models import EquipmentType as MasterEquipmentType
from master.models import Department
from master.utils import get_this_ship
from sfd.models import CompartmentMaster, Equipment, EquipmentType, ShipEquipment, TrialUnit
import json
from ..models import (
    AS_AND_AS_TYPE_CHOICES,
    CATEGORY_CHOICES,
    STATUS_CHOICES,
    InitiateDart,
)
from ..views import resolve_user_department
from .models import (
    DECK_NO_CHOICES,
    DefectDartSpare,
    DefectEquipmentStatusMaster,
    DefectInitiateDart,
    NATURE_OF_AS_AND_AS_CHOICES,
)
from .serializers import (
    AberCat3DefectSerializer,
    BaseDefectSerializer,
    CompartmentDetailSerializer,
    DartSparesItemSerializer,
    DEFECT_TYPE_SERIALIZERS,
    DefectDetailSerializer,
    DefectListSerializer,
    EquipmentDropdownSerializer,
    EquipmentStatusMasterSerializer,
    EquipmentTypeSerializer,
    GetEquipmentObjectsResponseSerializer,
    GetNomenclatureDetailsResponseSerializer,
    ManufacturerSerializer,
    MasterEquipmentTypeSerializer,
    SectionSerializer,
    SeverityMasterSerializer,
    ShipRemarksBySerializer,
    SupplierSerializer,
    SymptomsSerializer,
    TrialAgencySerializer,
)
from .utils import generate_defect_dart_number


## Get equipment name dropdown
@extend_schema(tags=["DART"])
class ShipEquipmentDropdownAPIView(ListAPIView):
    """Searchable id/equipment-name list of the active ship's equipment, for dropdowns."""

    serializer_class = EquipmentDropdownSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["t_equipment_ship_detail", "nomenclature", "equipment_name"]

    def get_queryset(self):
        queryset = ShipEquipment.objects.filter(
            active=True, status="active"
        ).order_by("equipment_name")

        department = resolve_user_department(self.request)
        if department:
            queryset = queryset.filter(department_id=department.id)

        return queryset


    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)

        return Response(
            {
                "success": True,
                "message": "Ship equipment dropdown fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Nomenclature lookup by equipment code
@extend_schema(tags=["DART"])
class GetEquipmentNomenclatureAPIView(APIView):
    """
    Get all ship equipment nomenclatures matching an equipment code.
    Replaces: get_equipment_objects / GetEquipmentObjectsAPIView.
    """
    permission_classes = [IsAuthenticated]
    @extend_schema(
        parameters=[OpenApiParameter("code", type=str, description="Equipment Code")],
        responses={200: GetEquipmentObjectsResponseSerializer},
    )
    def get(self, request, *args, **kwargs):
        code = request.query_params.get("code")
        try:
            equipment = Equipment.objects.get(equipment_code=code)
        except Equipment.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "message": "Equipment not found for the given code.",
                    "data": None,
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        ship_equipments = ShipEquipment.objects.filter(
            equipment__equipment_code=equipment.equipment_code
        )
        data = [
            {"id": obj.id, "nomenclature": obj.nomenclature} for obj in ship_equipments
        ]
        return Response(
            {
                "success": True,
                "message": "Ship equipment objects fetched successfully.",
                "data":  data
            },
            status=status.HTTP_200_OK,
        )


## Nomenclature details lookup by ShipEquipment (nomenclature) ID
@extend_schema(tags=["DART"])
class GetNomenclatureDetailsAPIView(APIView):
    """
    Get detailed information about a specific ShipEquipment (Nomenclature).
    Replaces: get_nomenclature_details / views.GetNomenclatureDetailsAPIView.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter("nomenclature", type=str, description="ShipEquipment ID")
        ],
        responses={200: GetNomenclatureDetailsResponseSerializer},
    )
    def get(self, request, *args, **kwargs):
        nomenclature = request.query_params.get("nomenclature")
        try:
            ship_equipment = ShipEquipment.objects.get(id=nomenclature)
        except (ShipEquipment.DoesNotExist, ValueError, TypeError):
            return Response(
                {
                    "success": False,
                    "message": "Nomenclature not found.",
                    "data": None,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if getattr(ship_equipment, "sub_department_f_key", None) and getattr(
            ship_equipment.sub_department_f_key, "department_name", None
        ):
            department_name = ship_equipment.sub_department_f_key.department_name.name
        elif getattr(ship_equipment, "department", None):
            department_name = ship_equipment.department.name

        data = {
            "equipment_serial_no": ship_equipment.equipment_serial_no or "",
            "equipment_id": ship_equipment.id,
            "location_on_board": ship_equipment.location_on_board or "",
            "department": department_name,
            "sub_department": (
                ship_equipment.sub_department_f_key.name
                if getattr(ship_equipment, "sub_department_f_key", None)
                else ""
            ),
        }
        return Response(
            {
                "success": True,
                "message": "Nomenclature details fetched successfully.",
                "data": data,
            },
            status=status.HTTP_200_OK,
        )


## Get severities for the Add DART form
@extend_schema(tags=["DART"])
class GetSeverityAPIView(APIView):
    """
    GET → Returns all active severities (master.MSeverity / Master_m_severity) for the
    "Add DART" form's Severity dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SeverityMasterSerializer

    @extend_schema(
        responses={200: SeverityMasterSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        severities = MSeverity.objects.filter(active=True).order_by("severity_code")
        serializer = self.serializer_class(severities, many=True)
        return Response(
            {
                "success": True,
                "message": "Severities fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get equipment status for the Add DART form
@extend_schema(tags=["DART"])
class GetEquipmentStatusAPIView(APIView):
    """
    GET → Returns all active equipment statuses (DefectEquipmentStatusMaster /
    dart_equipment_status_master) for the "Add DART" form's Equipment Status dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = EquipmentStatusMasterSerializer

    @extend_schema(
        responses={200: EquipmentStatusMasterSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        equipment_statuses = DefectEquipmentStatusMaster.objects.filter(
            active=1
        ).order_by("status")
        serializer = self.serializer_class(equipment_statuses, many=True)
        return Response(
            {
                "success": True,
                "message": "Equipment statuses fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get trial agencies for the Add DART form
@extend_schema(tags=["DART"])
class GetTrialAgenciesAPIView(APIView):
    """
    GET → Returns all active trial agencies (sfd.TrialUnit / master.trial_units) for the
    "Add DART" form's Trial Agency dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = TrialAgencySerializer

    @extend_schema(
        responses={200: TrialAgencySerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        trial_agencies = TrialUnit.objects.filter(status=1).order_by("sequence", "name")
        serializer = self.serializer_class(trial_agencies, many=True)
        return Response(
            {
                "success": True,
                "message": "Trial agencies fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get equipment types for the Add DART form (ABER: equipment type dropdown)
@extend_schema(tags=["DART"])
class GetEquipmentTypeAPIView(APIView):
    """
    GET → Returns all active equipment types (sfd.EquipmentType / SFD_equipment_type)
    for the "Add DART" form's Equipment Type dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = EquipmentTypeSerializer

    @extend_schema(
        responses={200: EquipmentTypeSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        equipment_types = EquipmentType.objects.filter(status__iexact="active").order_by(
            "Equipment_Desc"
        )
        serializer = self.serializer_class(equipment_types, many=True)
        return Response(
            {
                "success": True,
                "message": "Equipment types fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get OEM (manufacturer) names for the Add DART form
@extend_schema(tags=["DART"])
class GetOemAPIView(APIView):
    """
    GET → Returns all active OEMs/manufacturers (master.Manufacturer /
    Master_manufacturer) for the "Add DART" form's OEM Name dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ManufacturerSerializer

    @extend_schema(
        responses={200: ManufacturerSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        manufacturers = Manufacturer.objects.filter(active=1).order_by("name")
        serializer = self.serializer_class(manufacturers, many=True)
        return Response(
            {
                "success": True,
                "message": "OEMs fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get suppliers for the Add DART form
@extend_schema(tags=["DART"])
class GetSupplierAPIView(APIView):
    """
    GET → Returns all active suppliers (master.Supplier / Master_supplier) for the
    "Add DART" form's Supplier dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SupplierSerializer

    @extend_schema(
        responses={200: SupplierSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        suppliers = Supplier.objects.filter(active=1).order_by("name")
        serializer = self.serializer_class(suppliers, many=True)
        return Response(
            {
                "success": True,
                "message": "Suppliers fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get master equipment types for the Add DART form. Distinct from GetEquipmentTypeAPIView
## above -- master.EquipmentType (Master_equipmenttype) is a different model/table from
## sfd.EquipmentType (SFD_equipment_type), despite the identical class name.
@extend_schema(tags=["DART"])
class GetMasterEquipmentTypeAPIView(APIView):
    """
    GET → Returns all active equipment types (master.EquipmentType /
    Master_equipmenttype) for the "Add DART" form's Equipment Type dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MasterEquipmentTypeSerializer

    @extend_schema(
        responses={200: MasterEquipmentTypeSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        equipment_types = MasterEquipmentType.objects.filter(active=1).order_by("name")
        serializer = self.serializer_class(equipment_types, many=True)
        return Response(
            {
                "success": True,
                "message": "Equipment types fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get sections for the Add DART form
@extend_schema(tags=["DART"])
class GetSectionAPIView(APIView):
    """
    GET → Returns all active sections (master.Section / Master_section) for the
    "Add DART" form's Section dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SectionSerializer

    @extend_schema(
        responses={200: SectionSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        sections = Section.objects.filter(active=1).order_by("name")
        serializer = self.serializer_class(sections, many=True)
        return Response(
            {
                "success": True,
                "message": "Sections fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get ship remarks-by options for the Add DART form
@extend_schema(tags=["DART"])
class GetShipRemarksByAPIView(APIView):
    """
    GET → Returns all active ship remarks-by options (master.ChMasterShipRemarksBy /
    Master_ch_master_ship_remarks_by) for the "Add DART" form's SS Remarks dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ShipRemarksBySerializer

    @extend_schema(
        responses={200: ShipRemarksBySerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        remarks_by = ChMasterShipRemarksBy.objects.filter(active=1).order_by("description")
        serializer = self.serializer_class(remarks_by, many=True)
        return Response(
            {
                "success": True,
                "message": "Ship remarks-by options fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get symptoms for the Add DART form
@extend_schema(tags=["DART"])
class GetSymptomsAPIView(APIView):
    """
    GET → Returns all active symptoms (master.ChMasterSymptoms /
    Master_ch_master_symptoms) for the "Add DART" form's Symptoms dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SymptomsSerializer

    @extend_schema(
        responses={200: SymptomsSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        symptoms = ChMasterSymptoms.objects.filter(active=1).order_by("symptom_code")
        serializer = self.serializer_class(symptoms, many=True)
        return Response(
            {
                "success": True,
                "message": "Symptoms fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


## Get compartments for the Add DART form (ABER CAT3: compartment dropdown)
@extend_schema(tags=["DART"])
class GetCompartmentAPIView(APIView):
    """
    GET → Returns all active compartments (sfd.CompartmentMaster) for the "Add DART"
    form's Compartment dropdown.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = CompartmentDetailSerializer

    @extend_schema(
        responses={200: CompartmentDetailSerializer(many=True)},
    )
    def get(self, request, *args, **kwargs):
        compartments = CompartmentMaster.objects.filter(is_deleted=False).order_by(
            "name"
        )
        serializer = self.serializer_class(compartments, many=True)
        return Response(
            {
                "success": True,
                "message": "Compartments fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


def _equipment_denormalized_fields(equipment_ship):
    """AS_AND_AS and ABER CAT1/CAT2 both require picking an existing equipment_ship
    (unlike CAT3, which describes new-fit equipment by free text) -- copy its
    nomenclature/code/location/serial-number/compartment onto the DART itself at create
    time, instead of only storing the FK and leaving those values only reachable by
    joining back to ShipEquipment."""
    if not equipment_ship:
        return {}

    compartment_raw = getattr(equipment_ship, "compartment", None)
    compartment_id = (
        int(compartment_raw)
        if compartment_raw and str(compartment_raw).isdigit()
        else None
    )

    return {
        "equipment_nomenclature": equipment_ship.nomenclature,
        "equipment_code": equipment_ship.equipment_code,
        "location_on_board": equipment_ship.location_on_board,
        "equipment_serial_no": equipment_ship.equipment_serial_no,
        "compartment_id": compartment_id,
    }


## Add a defect (DefectInitiateDart). Validation is delegated to a defect_type-specific
## serializer (see DEFECT_TYPE_SERIALIZERS in serializers.py) so each type's required
## fields live in their own class instead of one large if/elif block. Persistence stays
## unified below since every serializer's validated_data uses the same field names --
## a field a given type doesn't declare simply comes back as None via .get().
@extend_schema(tags=["DART"])
class AddDefectAPIView(APIView):
    """
    POST → Create a new defect (DefectInitiateDart) for the given defect_type. Which
    fields are required depends on defect_type -- see DEFECT_TYPE_SERIALIZERS.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @extend_schema(
        request=BaseDefectSerializer,
        responses={201: dict, 400: dict},
    )
    def post(self, request, *args, **kwargs):
        defect_type = request.data.get("defect_type")
        if defect_type == "ABER" and request.data.get("category") == "CAT3":
            # CAT3 has its own field set (equipment_name_text/oem/supplier/deck_no/... --
            # see AberCat3DefectSerializer) instead of CAT1/CAT2's equipment_ship pick.
            serializer_cls = AberCat3DefectSerializer
        else:
            serializer_cls = DEFECT_TYPE_SERIALIZERS.get(defect_type)
        if serializer_cls is None:
            return Response(
                {
                    "success": False,
                    "message": "Validation failed.",
                    "data": {
                        "defect_type": (
                            "Must be one of: "
                            f"{', '.join(DEFECT_TYPE_SERIALIZERS)}."
                        )
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = serializer_cls(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Validation failed.",
                    "data": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        val_data = serializer.validated_data
        dart = self._create_defect(request, val_data)

        return Response(
            {
                "success": True,
                "message": "Defect created successfully.",
                "data": {
                    "id": dart.id,
                    "dart_number": dart.dart_number,
                },
            },
            status=status.HTTP_201_CREATED,
        )

    def _create_defect(self, request, val_data):
        equipment_ship = val_data.get("equipment_ship")
        equipment_status = val_data.get("equipment_status")
        trial_agency = val_data.get("trial_agency")
        # Accepted from the frontend payload under the "status" key; falls back to the
        # model's own "OPEN" default when omitted/null rather than ever writing None.
        status_value = val_data.get("status") or "OPEN"
        if val_data.get("is_defect_rectified"):
            status_value = "CLOSED"

        print('status value', status_value)

        department = resolve_user_department(request)
        if not department and equipment_ship:
            department = equipment_ship.department
        if not department:
            department = Department.objects.first()

        dept_name = department.name if department else "X"
        dart_number = (
            generate_defect_dart_number(dept_name, "Defect")
            if status_value != "DRAFT"
            else None
        )
        dart_sr_number = dart_number.split("-")[-1] if dart_number else None

        defect_type = val_data.get("defect_type")
        print("defect type", defect_type)
        with transaction.atomic():

            if defect_type == "DEFECT":
                dart = DefectInitiateDart.objects.create(
                    department_id=department,
                    equipment_ship=equipment_ship,
                    dart_number=dart_number,
                    dart_sr_number=dart_sr_number,
                    defect_type=defect_type,
                    status=status_value,
                    equipment_status_id=(
                        equipment_status.id if equipment_status else None
                    ),
                    dart_date=val_data.get("dart_date"),
                    remark_code=val_data.get("ss_remark_code"),
                    symptom_code=val_data.get("symptom_code"),
                    defective_discriptions=val_data.get("defective_discriptions"),
                    defective_component=val_data.get("defective_component"),
                    severity_code=val_data.get("severity_code"),
                    trial_required=val_data.get("trial_required"),
                    universal_id_trial_required=(
                        str(trial_agency.id) if trial_agency else None
                    ),
                    photograph=val_data.get("photograph"),
                    sapres_required=val_data.get("sapres_required"),

                    standby_available=val_data.get("standby_available"),
                    defect_closed_remark=val_data.get("defect_closed_remark"),
                    defect_closed_by=(
                        request.user if status_value == "CLOSED" else None
                    ),
                    dart_trigger=val_data.get("dart_trigger"),
                    guarantee_hot_work=val_data.get("hot_work"),
                )

            if defect_type == "AS_AND_AS":
                dart = DefectInitiateDart.objects.create(
                    department_id=department,
                    equipment_ship=equipment_ship,
                    dart_number=dart_number,
                    dart_sr_number=dart_sr_number,
                    defect_type=defect_type,
                    status=status_value,
                    category=val_data.get("category"),
                    dart_date=val_data.get("dart_date"),
                    equipment_status_id=(
                        equipment_status.id if equipment_status else None
                    ),
                    severity_code=val_data.get("severity_code"),
                    trial_required=val_data.get("trial_required"),
                    universal_id_trial_required=(
                        str(trial_agency.id) if trial_agency else None
                    ),
                    defective_discriptions=val_data.get("defective_discriptions"),
                    sapres_required=val_data.get("sapres_required"),
                    photograph=val_data.get("photograph"),
                    as_and_as_type=val_data.get("as_and_as_type"),
                    nature_of_as_and_as=val_data.get("nature_of_as_and_as"),
                    target_completion_date=val_data.get("target_completion_date"),
                    as_and_as_justification=val_data.get("as_and_as_justification"),
                    sanctioning_authority=val_data.get("sanctioning_authority"),
                    defect_closed_remark=val_data.get("defect_closed_remark"),
                    defect_closed_by=(
                        request.user if status_value == "CLOSED" else None
                    ),
                    **_equipment_denormalized_fields(equipment_ship),
                )

            elif defect_type == "ABER" and val_data.get("category") == "CAT3":
                raised_with_as_and_as = val_data.get("raised_with_as_and_as")
                oem = val_data.get("oem")
                supplier_fkey = val_data.get("supplier_fkey")
                model_type = val_data.get("model_type")
                compartment = val_data.get("compartment")
                dart = DefectInitiateDart.objects.create(
                    department_id=department,
                    dart_number=dart_number,
                    dart_sr_number=dart_sr_number,
                    defect_type=defect_type,
                    status=status_value,
                    category=val_data.get("category"),
                    dart_date=val_data.get("dart_date"),
                    equipment_status_id=(
                        equipment_status.id if equipment_status else None
                    ),
                    severity_code=val_data.get("severity_code"),
                    trial_required=val_data.get("trial_required"),
                    universal_id_trial_required=(
                        str(trial_agency.id) if trial_agency else None
                    ),
                    defective_discriptions=val_data.get("defective_discriptions"),
                    sapres_required=val_data.get("sapres_required"),
                    photograph=val_data.get("photograph"),
                    equipment_name_text=val_data.get("equipment_name_text"),
                    model_type_id=model_type.id if model_type else None,
                    oem_id=oem.id if oem else None,
                    supplier_fkey_id=(
                        supplier_fkey.id if supplier_fkey else None
                    ),
                    new_oem_name=val_data.get("new_oem_name"),
                    new_oem_supplier=val_data.get("new_oem_supplier"),
                    new_oem_part_no=val_data.get("new_oem_part_no"),
                    equipment_serial_no=val_data.get("equipment_serial_no"),
                    deck_no=val_data.get("deck_no"),
                    frame_station=val_data.get("frame_station"),
                    compartment_id=compartment.id if compartment else None,
                    installation_date=val_data.get("installation_date"),
                    authority_for_installation=val_data.get(
                        "authority_for_installation"
                    ),
                    qty_fitted=val_data.get("qty_fitted"),
                    shelf_life_service_life=val_data.get("shelf_life_service_life"),
                    running_hours_as_on_date=val_data.get(
                        "running_hours_as_on_date"
                    ),
                    equipment_section=val_data.get("equipment_section"),
                    equipment_type=val_data.get("equipment_type"),
                    raised_with_as_and_as=raised_with_as_and_as,
                    repair_cost=val_data.get("repair_cost"),
                    book_value=val_data.get("book_value"),
                    aber_justification=val_data.get("aber_justification"),
                    as_and_as_type=(
                        val_data.get("as_and_as_type")
                        if raised_with_as_and_as
                        else None
                    ),
                    as_and_as_reference_number=(
                        val_data.get("as_and_as_reference_number")
                        if raised_with_as_and_as
                        else None
                    ),
                    nature_of_as_and_as=(
                        val_data.get("nature_of_as_and_as")
                        if raised_with_as_and_as
                        else None
                    ),
                    as_and_as_justification=(
                        val_data.get("as_and_as_justification")
                        if raised_with_as_and_as
                        else None
                    ),
                    linked_as_and_as_justification=(
                        val_data.get("linked_as_and_as_justification")
                        if raised_with_as_and_as
                        else None
                    ),
                    target_completion_date=(
                        val_data.get("target_completion_date")
                        if raised_with_as_and_as
                        else None
                    ),
                    defect_closed_remark=val_data.get("defect_closed_remark"),
                    defect_closed_by=(
                        request.user if status_value == "CLOSED" else None
                    ),
                )

            elif defect_type == "ABER":
                raised_with_as_and_as = val_data.get("raised_with_as_and_as")
                dart = DefectInitiateDart.objects.create(
                    department_id=department,
                    equipment_ship=equipment_ship,
                    dart_number=dart_number,
                    dart_sr_number=dart_sr_number,
                    defect_type=defect_type,
                    status=status_value,
                    category=val_data.get("category"),
                    dart_date=val_data.get("dart_date"),
                    equipment_status_id=(
                        equipment_status.id if equipment_status else None
                    ),
                    severity_code=val_data.get("severity_code"),
                    trial_required=val_data.get("trial_required"),
                    universal_id_trial_required=(
                        str(trial_agency.id) if trial_agency else None
                    ),
                    defective_discriptions=val_data.get("defective_discriptions"),
                    sapres_required=val_data.get("sapres_required"),
                    photograph=val_data.get("photograph"),
                    installation_date=val_data.get("installation_date"),
                    authority_for_installation=val_data.get(
                        "authority_for_installation"
                    ),
                    qty_fitted=val_data.get("qty_fitted"),
                    shelf_life_service_life=val_data.get("shelf_life_service_life"),
                    running_hours_as_on_date=val_data.get(
                        "running_hours_as_on_date"
                    ),
                    equipment_section=val_data.get("equipment_section"),
                    equipment_type=val_data.get("equipment_type"),
                    raised_with_as_and_as=raised_with_as_and_as,
                    repair_cost=val_data.get("repair_cost"),
                    book_value=val_data.get("book_value"),
                    aber_justification=val_data.get("aber_justification"),
                    # AS & AS descriptor fields only apply when this ABER was raised
                    # with AS & AS -- None/blank for everyone else, same as the
                    # serializer only requiring them in that branch.
                    as_and_as_type=(
                        val_data.get("as_and_as_type")
                        if raised_with_as_and_as
                        else None
                    ),
                    as_and_as_reference_number=(
                        val_data.get("as_and_as_reference_number")
                        if raised_with_as_and_as
                        else None
                    ),
                    nature_of_as_and_as=(
                        val_data.get("nature_of_as_and_as")
                        if raised_with_as_and_as
                        else None
                    ),
                    as_and_as_justification=(
                        val_data.get("as_and_as_justification")
                        if raised_with_as_and_as
                        else None
                    ),
                    linked_as_and_as_justification=(
                        val_data.get("linked_as_and_as_justification")
                        if raised_with_as_and_as
                        else None
                    ),
                    target_completion_date=(
                        val_data.get("target_completion_date")
                        if raised_with_as_and_as
                        else None
                    ),
                    defect_closed_remark=val_data.get("defect_closed_remark"),
                    defect_closed_by=(
                        request.user if status_value == "CLOSED" else None
                    ),
                    **_equipment_denormalized_fields(equipment_ship),
                )


            for spare in val_data.get("spares") or []:
                DefectDartSpare.objects.create(
                    dart=dart,
                    equipment_ship=equipment_ship,
                    inventory_type=spare.get("inventory_type"),
                    spare_ref_id=spare.get("spare_ref_id"),
                    pattern=spare.get("pattern"),
                    description=spare.get("description"),
                    quantity=spare.get("quantity", 1),
                )

        return dart


def _choices_to_options(choices):
    return [{"value": value, "label": label} for value, label in choices]


## Get static choice-field dropdowns (category, as & as type, equipment status) for the
## Add DART form. Sourced from InitiateDart's own field `choices` arrays (models.py), so
## the dropdown options and the values the model accepts can never drift apart.
@extend_schema(tags=["DART"])
class GetDefectDropdownsAPIView(APIView):
    """
    GET → Returns dropdown options for InitiateDart's static choice fields:
    category (CAT1/CAT2/CAT3), as_and_as_type (Major/Minor), nature_of_as_and_as
    (Alteration/Addition), equipment_status (Open/In Progress/Rectified/Closed).
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: dict},
    )
    def get(self, request, *args, **kwargs):
        data = {
            "category": _choices_to_options(CATEGORY_CHOICES),
            "as_and_as_type": _choices_to_options(AS_AND_AS_TYPE_CHOICES),
            "nature_of_as_and_as": _choices_to_options(NATURE_OF_AS_AND_AS_CHOICES),
            "equipment_status": _choices_to_options(STATUS_CHOICES),
            "deck_no": _choices_to_options(DECK_NO_CHOICES),
        }
        return Response(
            {
                "success": True,
                "message": "Dropdown choices fetched successfully.",
                "data": data,
            },
            status=status.HTTP_200_OK,
        )


class DefectListPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


## List defects for the Digital Defect Book grid: Dart No., Equipment/Services, Reason,
## Defect Rectified, Status, Date, Severity, plus a few common fields -- filterable by
## status, reason (defect_type) and free-text search, paginated.
@extend_schema(tags=["DART"])
class DefectListAPIView(ListAPIView):
    """
    GET → Paginated list of defects.

    Query params:
    - status: exact match against STATUS_CHOICES (OPEN/DRAFT/IN_PROGRESS/RECTIFIED/CLOSED)
    - reason: exact match against defect_type (SERVICE/GUARANTEE/AS_AND_AS/ABER)
    - search: matches dart_number, equipment name/code, defect description
    - page, page_size: pagination
    """

    permission_classes = [IsAuthenticated]
    serializer_class = DefectListSerializer
    pagination_class = DefectListPagination

    def get_queryset(self):
        queryset = DefectInitiateDart.objects.select_related(
            "equipment_ship",
            "severity_code",
            "department_id",
            "service_fkey",
        ).order_by("-id")

        params = self.request.query_params
        status_param = params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        reason_param = params.get("reason")
        if reason_param:
            queryset = queryset.filter(defect_type=reason_param)

        search = params.get("search")
        if search:
            queryset = queryset.filter(
                Q(dart_number__icontains=search)
                | Q(equipment_nomenclature__icontains=search)
                | Q(equipment_name_text__icontains=search)
                | Q(equipment_code__icontains=search)
                | Q(defective_discriptions__icontains=search)
            )

        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        paginated = self.get_paginated_response(serializer.data)
        return Response(
            {
                "success": True,
                "message": "Defects fetched successfully.",
                "data": {
                    "count": paginated.data["count"],
                    "next": paginated.data["next"],
                    "previous": paginated.data["previous"],
                    "results": paginated.data["results"],
                },
            },
            status=status.HTTP_200_OK,
        )


## Full detail for a single defect
@extend_schema(tags=["DART"])
class DefectDetailAPIView(APIView):
    """
    GET → Complete details for one defect by id.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: DefectDetailSerializer},
    )
    def get(self, request, pk, *args, **kwargs):
        try:
            defect = DefectInitiateDart.objects.prefetch_related("dart_spares").get(
                pk=pk
            )
        except DefectInitiateDart.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "message": "Defect not found.",
                    "data": None,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = DefectDetailSerializer(defect)
        return Response(
            {
                "success": True,
                "message": "Defect details fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )
