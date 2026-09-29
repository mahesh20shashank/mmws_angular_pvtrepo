"""OBS catalog master-data viewsets and views: `SpareClassViewSet`, `EquipmentClassViewSet`,
`DenominationViewSet`, `AuthorityViewSet`, `MiscellaneousMasterDataView`,
`EditMiscellaneousMasterDataView`.

Split out of the former flat `obs/views.py` (Part 1 of the obs file-structure split).
`misc_master_data.py` was folded into this module during the obs package-consolidation
pass - both are simple master/reference-data CRUD over the same four models.
"""

from accounts import rbac
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import OpenApiExample
from master.models import Department
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import services
from ..models import Authority, Denomination, EquipmentClass, SpareClass
from ..serializers import (
    AuthoritySerializer,
    DenominationSerializer,
    EquipmentClassSerializer,
    SpareClassSerializer,
)
from ..utils import (
    canonical_department_name,
    django_validation_error_detail,
    tagged_viewset,
)
from .base import CleanValidationModelViewSet, can_add_equipment_class


@tagged_viewset(
    "OBS",
    create_examples=[
        OpenApiExample(
            "Create spare class",
            value={"name": "ELECTRICAL", "department": None},
            request_only=True,
        )
    ],
)
class SpareClassViewSet(CleanValidationModelViewSet):
    """The ship's spare classes, READ ONLY.

    Developed by Unknown: THE SPARE CLASS LIST IS FIXED BY THE RULES DOCUMENT and this is now
    enforced rather than only stated. Clause 2.5 gives eight names, the template workbooks'
    `B2:B250` dropdown is written `errorStyle="stop"` with the prompt "Closed list. No custom
    value.", `services.SPARE_CLASS_BY_DEPARTMENT_AND_ROUTE` refuses a ninth on import with rule
    R-010, and `manage.py seed_equipment_class_defaults` describes itself as the only path that
    creates one.

    It was not the only path. This was a full `ModelViewSet`, so `POST spare_class/` created a
    spare class for any authenticated user, department-scoped and nothing more - the one master
    register the document closes outright was the one with an open create endpoint. Nothing
    calls it: `obs-api.service.ts` reads `spare_class/` with GET and its own comment records
    that "NOTHING IN THIS SERVICE EVER POSTS `spare_class`". So the write verbs are removed
    rather than gated by a role - there is no role that may add one.

    `http_method_names` is the narrowing rather than an overridden `create()`, because it also
    takes PUT, PATCH and DELETE, and because it makes the refusal a 405 that names the allowed
    methods instead of a 403 that invites someone to find the right account.
    """

    queryset = SpareClass.objects.all()
    serializer_class = SpareClassSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "department_id"
    http_method_names = ["get", "head", "options"]

    @action(detail=False, methods=["get"], url_path="by-department")
    def by_department(self, request, department_id=None):
        # `department_id` arrives as a URL path kwarg for `spare_class/<department_id>/`
        # (see obs/urls.py) — the query-param fallback keeps `?department=` working too.
        department_id = department_id or request.query_params.get("department")
        queryset = self.filter_queryset(self.get_queryset())
        if department_id:
            queryset = queryset.filter(department_id=department_id)
        return Response(self.get_serializer(queryset, many=True).data)


@tagged_viewset(
    "OBS",
    create_examples=[
        OpenApiExample(
            "Create equipment class",
            value={"name": "RADAR", "spare_class": 1},
            request_only=True,
        )
    ],
)
class EquipmentClassViewSet(CleanValidationModelViewSet):
    queryset = EquipmentClass.objects.select_related("spare_class").all()
    serializer_class = EquipmentClassSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare_class__department_id"

    @action(detail=False, methods=["get"], url_path="by-spare-class")
    def by_spare_class(self, request, department_id=None, spare_class_id=None):
        # Path kwargs for `equipment_class/<department_id>/<spare_class_id>/` (see
        # obs/urls.py) — previously ignored entirely, so the URL's department segment
        # never actually filtered anything. Query-param fallbacks keep `?spare_class=`/
        # `?department=` working too.
        spare_class_id = spare_class_id or request.query_params.get("spare_class")
        department_id = department_id or request.query_params.get("department")
        queryset = self.filter_queryset(self.get_queryset())
        if spare_class_id:
            queryset = queryset.filter(spare_class_id=spare_class_id)
        if department_id:
            queryset = queryset.filter(spare_class__department_id=department_id)
        return Response(self.get_serializer(queryset, many=True).data)

    # Developed by Unknown: The Equipment Classes tab's one read - one department's equipment
    # classes GROUPED BY SPARE CLASS, plus the read-only spare class list they hang under.
    #
    # One call and not two, because the tab needs both together and the spare classes are the
    # grouping key of the equipment classes rather than an independent list. `by_spare_class`
    # above is left exactly as it is - it answers a different question, "which classes sit
    # under this one spare class", and two screens already read it.
    #
    # The grouped shape is lifted from `SparesViewSet.import_value_lists`, which already
    # returns `equipment_classes` keyed by spare class name for the hand-entry form, so the
    # front end reads one shape in both places. It carries the ids as well, because this tab
    # lists rows a user acts on, where that one only offers names to a dropdown.
    #
    # NOTHING HERE CREATES A SPARE CLASS AND NOTHING HERE OFFERS TO. The spare class list is
    # fixed by the rules document and is seeded by
    # `manage.py seed_equipment_class_defaults` - that command is the only path that creates
    # one. `spare_classes_not_set_up` names any the department is entitled to and does not yet
    # hold, so the screen can say WHY one is missing and name the command, rather than
    # tempting anyone to add a control that makes one.
    @action(detail=False, methods=["get"], url_path="department-master")
    def department_master(self, request):
        """One department's spare classes, each carrying its own equipment classes."""
        department = self._equipment_class_department(request)
        # Developed by Unknown: resolved, not read raw, so a department row named `E` is
        # recognised as ENGINEERING by `permitted_spare_classes` below. See
        # `master.utils.canonical_department_name`.
        department_name = canonical_department_name(department)

        # Grouped in one pass over an ordered query rather than one query per spare class -
        # `select_related` is already on the viewset queryset and this keeps the read at two
        # statements however many spare classes the department holds.
        grouped = {}
        for spare_class_id, equipment_class_id, equipment_class_name in (
            EquipmentClass.objects.filter(spare_class__department=department)
            .order_by("spare_class__name", "name")
            .values_list("spare_class_id", "id", "name")
        ):
            grouped.setdefault(spare_class_id, []).append(
                {
                    "id": equipment_class_id,
                    "name": (equipment_class_name or "").strip().upper(),
                }
            )

        spare_classes = [
            {
                "id": spare_class.id,
                "name": (spare_class.name or "").strip().upper(),
                "equipment_classes": grouped.get(spare_class.id, []),
            }
            for spare_class in SpareClass.objects.filter(
                department=department
            ).order_by("name")
        ]
        registered = {entry["name"] for entry in spare_classes}
        # Clause 2.5's permitted set for this department across BOTH routes, because this tab
        # is not on a route - it manages the department's master list as a whole.
        permitted = set(
            services.permitted_spare_classes(
                department_name, services.IMPORT_ROUTE_D787J
            )
        ) | set(
            services.permitted_spare_classes(
                department_name, services.IMPORT_ROUTE_OTHERS
            )
        )

        return Response(
            {
                "department": department.pk,
                "department_name": department_name,
                # Whether the department control on the tab locks. The same answer
                # `selectable-departments/` gives the import form, decided in the same place -
                # a departmental login sees its own department and nothing else.
                "locked": not rbac.can_see_all_departments(request.user),
                # Whether this caller may ADD one. The tab reads it to decide whether to show
                # the add control at all, and the gate itself is on the create endpoint - a
                # hidden control is not a permission, doctrine Section 5.10.
                "can_add": can_add_equipment_class(request.user),
                "spare_classes": spare_classes,
                "spare_classes_not_set_up": sorted(permitted - registered),
            }
        )

    # Developed by Unknown: The single department this read is entitled to, resolved through
    # `rbac.resolve_selected_department` - the canonical helper `backend\CLAUDE.md` names, and
    # never a hand-rolled department check. A departmental login that names nothing gets its
    # own. One that names another department's id is refused with 403 by the resolver rather
    # than quietly served its own list. A privileged caller must name one, because "every
    # department" is not a list this tab can render.
    def _equipment_class_department(self, request):
        selected, is_all = rbac.resolve_selected_department(request, param="department")
        if is_all:
            raise DRFValidationError(
                {
                    "department": [
                        "Choose the department whose equipment classes you want."
                    ]
                }
            )
        if selected is None:
            raise DRFValidationError(
                {
                    "department": [
                        "Your account has no department, so no equipment class list can be "
                        "shown for it."
                    ]
                }
            )
        department = Department.objects.filter(pk=selected).first()
        if department is None:
            raise DRFValidationError({"department": ["Unknown department."]})
        return department


@tagged_viewset(
    "OBS",
    create_examples=[
        OpenApiExample(
            "Create denomination",
            value={"name": "NOS", "department": None},
            request_only=True,
        )
    ],
)
class DenominationViewSet(CleanValidationModelViewSet):
    queryset = Denomination.objects.all()
    serializer_class = DenominationSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "department_id"


@tagged_viewset(
    "OBS",
    create_examples=[
        OpenApiExample(
            "Create authority",
            value={"name": "NAVAL STORE AUTHORITY"},
            request_only=True,
        )
    ],
)
class AuthorityViewSet(CleanValidationModelViewSet):
    queryset = Authority.objects.all()
    serializer_class = AuthoritySerializer


# ---------------------------------------------------------------------------------------
# OBS miscellaneous master-data endpoints: `MiscellaneousMasterDataView`,
# `EditMiscellaneousMasterDataView`.
#
# Folded in from the former `views/misc_master_data.py` during the obs
# package-consolidation pass.
# ---------------------------------------------------------------------------------------

MISC_MASTER_DATA_MODELS = {
    # Developed by Unknown: `spare_class` STAYS IN THIS MAP and is refused in `post()` instead.
    # The map is read by the GET half of this view as well, which lists a type's rows and is a
    # legitimate read, and by the `type must be one of ...` message. Removing the key would turn
    # a request to CREATE one into "type must be one of denomination, equipment_class,
    # authority" - a message that says the type does not exist rather than that the list is
    # closed, which is the wrong answer to the question actually asked.
    "spare_class": (SpareClass, SpareClassSerializer),
    "denomination": (Denomination, DenominationSerializer),
    "equipment_class": (EquipmentClass, EquipmentClassSerializer),
    "authority": (Authority, AuthoritySerializer),
}

# Developed by Unknown: Why a spare class cannot be created. Clause-led, and it names the one
# path that does create them so an administrator setting a ship up is not left guessing.
SPARE_CLASS_CLOSED_LIST_MESSAGE = (
    "Rule 2.5 - the SPARE CLASS list is fixed by the rules document and cannot be added to. "
    "The eight classes are seeded by an administrator running "
    "'manage.py seed_equipment_class_defaults'."
)


# Developed by Unknown: Who may add an equipment class.
#
# [NEEDS SOURCE: requirement 3.4 says an equipment class name must be entered exactly as the
# D787J document or the shipyard purchase order gives it, and that a name once used is reused
# rather than created again. It does NOT say who may create one. Nothing in the rules document,
# the reference application's Masters screen, or RECON-01 to RECON-10 settles it.]
#
# Gated to a Head of Department, a Dy HOD, and the admin roles, as the SAFER DEFAULT and
# stated plainly rather than assumed. An equipment class name is a permanent piece of the
# ship's inventory vocabulary - every spare imported afterwards is matched against it, a class
# with spares attached cannot be deleted because `Spares.equipment_class` is `PROTECT`, and a
# second spelling of an equipment that already has a name is exactly the defect requirement 3.4
# exists to prevent. Opening that to every departmental rating is the wider grant and is the one
# that cannot be walked back. If the ship wants it open to every departmental user, this
# frozenset and this one function are the only things that have to change.
#
# `is_hod_role` covers HOD and DY HOD together, which is the project's own reading of "Head of
# Department" everywhere else in `users\rbac.py`.
MISC_MASTER_DATA_HOD_ONLY_TYPES = frozenset({"equipment_class"})

MISC_MASTER_DATA_HOD_ONLY_MESSAGE = (
    "Only ADMIN, SHIPADMIN, a Head of Department or a DY HOD may add an equipment class. "
    "Ask your Head of Department to add it, and enter the name exactly as the D787J document "
    "or the shipyard purchase order gives it."
)


def _misc_master_data_department_id(instance, model):
    """ORM-path-free lookup of the department id an instance belongs to, for
    the four models MiscellaneousMasterDataView/EditMiscellaneousMasterDataView
    dispatch to. `Authority` has no department relation at all."""
    if model is EquipmentClass:
        return instance.spare_class.department_id if instance.spare_class_id else None
    if model is Authority:
        return None
    return instance.department_id


class MiscellaneousMasterDataView(APIView):
    """Create a SpareClass/Denomination/EquipmentClass/Authority entry by type."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        entry_type = request.data.get("type")
        config = MISC_MASTER_DATA_MODELS.get(entry_type)
        if not config:
            raise DRFValidationError(
                {"type": f"type must be one of {list(MISC_MASTER_DATA_MODELS)}."}
            )
        # Developed by Unknown: The role gate. Reused rather than duplicated into a second
        # create endpoint - this view already creates all four master-data types by type, so
        # gating the one type that needs gating is the whole of the change.
        #
        # Developed by Unknown: THE SECOND OF THE TWO SPARE CLASS CREATE PATHS, now closed.
        #
        # The note that stood here recorded this as OBSERVED AND DELIBERATELY NOT FIXED: this
        # endpoint would still create a spare class for any authenticated caller who posted one
        # by hand, and refusing it was called the sounder answer and RECOMMENDED, declined only
        # because auditing the callers was out of that change's scope.
        #
        # The audit has been done. Nothing posts it - `obs-api.service.ts` posts this endpoint
        # with `type=equipment_class` alone and says so in its own comment, and a search of the
        # frontend finds no other caller. So the refusal is taken. Together with
        # `SpareClassViewSet` losing its write verbs, `manage.py seed_equipment_class_defaults`
        # is now genuinely the only path that creates a spare class, which is what its own
        # header has claimed since it was written.
        if entry_type == "spare_class":
            raise DRFValidationError({"type": [SPARE_CLASS_CLOSED_LIST_MESSAGE]})
        if (
            entry_type in MISC_MASTER_DATA_HOD_ONLY_TYPES
            and not can_add_equipment_class(request.user)
        ):
            raise PermissionDenied(MISC_MASTER_DATA_HOD_ONLY_MESSAGE)
        _, serializer_class = config
        serializer = serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        # Developed by Unknown: `UppercaseCleanMixin.save()` runs `full_clean()` on every save,
        # so a model-level rule that the serializer did not already catch - the unique-per-
        # department constraint on `EquipmentClass`, under a race - arrives here as a DJANGO
        # `ValidationError`, which is not a DRF exception and would leave this plain `APIView`
        # returning a 500. `CleanValidationMixin` already converts it for every ViewSet in this
        # module and this view had no equivalent. Same converter, same shape, so the front end
        # reads one error envelope from both surfaces.
        try:
            serializer.save()
        except DjangoValidationError as error:
            raise DRFValidationError(django_validation_error_detail(error)) from error
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class EditMiscellaneousMasterDataView(APIView):
    """Rename a SpareClass/Denomination/EquipmentClass/Authority entry by type."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        entry_type = request.data.get("type")
        config = MISC_MASTER_DATA_MODELS.get(entry_type)
        if not config:
            raise DRFValidationError(
                {"type": f"type must be one of {list(MISC_MASTER_DATA_MODELS)}."}
            )
        model, serializer_class = config
        entry_id = request.data.get("id")
        if not entry_id:
            raise DRFValidationError({"id": "This field is required."})
        instance = model.objects.filter(pk=entry_id).first()
        if not instance:
            raise DRFValidationError({"id": "Entry not found."})
        if not rbac.can_see_all_departments(request.user):
            own_department = rbac.department_of(request.user)
            instance_department_id = _misc_master_data_department_id(instance, model)
            if instance_department_id is not None and (
                own_department is None or instance_department_id != own_department.pk
            ):
                raise DRFValidationError(
                    {"id": "You may not edit another department's entry."}
                )
        serializer = serializer_class(
            instance, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
