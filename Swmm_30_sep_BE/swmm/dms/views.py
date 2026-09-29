import random
from datetime import date, datetime, timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from accounts import rbac

from .excel import ExcelImportExportMixin
from .models import (
    CategoryName,
    Certificate,
    EquipmentCategory,
    EquipmentDocument,
)
from .serializers import (
    CategoryNameSerializer,
    CertificateSerializer,
    EquipmentCategorySerializer,
    EquipmentDocumentSerializer,
)
from .utils import tagged_viewset

try:
    from sfd.models import Equipment
except Exception:  # pragma: no cover - SFD is optional for isolated DMS tests.
    Equipment = None


@extend_schema(tags=["DMS"])
class DMSModelViewSet(ExcelImportExportMixin, viewsets.ModelViewSet):
    pass


class CertificateDepartmentObjectPermission(BasePermission):
    """Object-level counterpart to `CertificateQuerySet.for_user` - closes
    the gap where retrieve/update/destroy/share previously skipped
    department scoping entirely (any authenticated user could act on any
    certificate by id). `user_department` is a plain string field on
    Certificate (not an FK), so compared as a string against the caller's
    own department pk."""

    def has_object_permission(self, request, view, obj):
        if rbac.can_see_all_departments(request.user):
            return True
        own_department = rbac.department_of(request.user)
        if own_department is None:
            return False
        return str(obj.user_department) == str(own_department.pk)


def payload_pk(request, *keys):
    for key in keys:
        value = request.data.get(key)
        if value not in (None, ""):
            return value
    raise ValidationError({keys[0]: "This field is required."})


def request_profile(request):
    return getattr(request.user, "user_profile", None)


def request_department_id(request):
    profile = request_profile(request)
    return getattr(profile, "department_id", None)


def mutable_request_data(request):
    data = request.data.copy()
    if hasattr(data, "_mutable"):
        data._mutable = True
    return data


def parse_legacy_date(value):
    if not value:
        return None
    if isinstance(value, (date, datetime)):
        return value
    value = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return value


def certificate_legacy_dict(certificate):
    uploader = certificate.uploaded_by
    uploaded_by_name = "Unknown"
    if uploader:
        rank = getattr(getattr(uploader, "rank", None), "name", "") or ""
        full_name = f"{uploader.firstname or ''} {uploader.lastname or ''}".strip()
        personal_number = getattr(uploader, "personal_number", "") or ""
        uploaded_by_name = f"{rank} | {full_name} | {personal_number}".strip()

    return {
        "id": certificate.id,
        "name": certificate.name,
        "certificate_subtype": certificate.certificate_subtype,
        "certificate_id": certificate.certificate_id,
        "letter_description": certificate.letter_description,
        "letter_date": certificate.format_date(certificate.letter_date),
        "recieved_from_unit": certificate.recieved_from_unit,
        "received_from": certificate.recieved_from_unit,
        "replied": certificate.replied,
        "reply_required": certificate.replied,
        "addressed_to_unit": certificate.addressed_to_unit,
        "addressed_to": certificate.addressed_to_unit,
        "certificate_type": certificate.certificate_type,
        "letter_received_on": certificate.format_date(certificate.letter_received_on),
        "letter_ref_no": certificate.letter_ref_no,
        "issue_date": certificate.format_date(certificate.issue_date),
        "expiry_date": certificate.format_date(certificate.expiry_date),
        "place_of_issue": certificate.place_of_issue,
        "remarks": certificate.remarks,
        "attachment": certificate.attachment.url if certificate.attachment else None,
        "is_valid": certificate.is_valid,
        "category": certificate.category,
        "equipment": certificate.equipment,
        "equipment_id": certificate.equipment_id,
        "user_department": certificate.user_department,
        "filenumber": certificate.filenumber,
        "ship": certificate.ship,
        "command": certificate.command,
        "outmail_category": certificate.outmail_category,
        "shared_on": certificate.format_date(certificate.shared_on),
        "is_shared": certificate.is_shared,
        "shared_with": list(certificate.shared_with.values_list("id", flat=True)),
        "uploaded_by": certificate.uploaded_by_id,
        "uploaded_by_name": uploaded_by_name,
        "expired": not certificate.is_valid if certificate.expiry_date else False,
    }


@tagged_viewset(
    "DMS",
    create_examples=[
        OpenApiExample(
            "Create certificate",
            value={
                "name": "Radar Safety Certificate",
                "certificate_type": "technical",
                "certificate_subtype": "Safety",
                "certificate_id": "CERT-001",
                "expiry_date": "2026-12-31",
                "place_of_issue": "Mumbai",
                "remarks": "Initial upload",
                "category": "RADAR",
                "equipment": "SURVEILLANCE RADAR",
                "equipment_id": "EQ-001",
            },
            request_only=True,
        )
    ],
)
class CertificateViewSet(DMSModelViewSet):
    queryset = Certificate.objects.all()
    serializer_class = CertificateSerializer
    lookup_url_kwarg = "cert_id"
    permission_classes = [IsAuthenticated, CertificateDepartmentObjectPermission]

    def get_queryset(self):
        queryset = super().get_queryset().with_related()
        certificate_type = self.request.query_params.get("certificate_type")
        is_shared = self.request.query_params.get("is_shared")
        queryset = queryset.filter_view(
            certificate_type=certificate_type,
            is_shared=is_shared,
        )
        if self.action in {"list", "list_by_type", "dashboard"}:
            queryset = queryset.for_user(self.request.user)
        return queryset

    def get_object(self):
        # retrieve/update/destroy/share_certificate are not owner-scoped like
        # list/dashboard are (any user in the same department may act on a
        # record by id, not just its uploader) - but they are now
        # department-scoped via CertificateDepartmentObjectPermission below,
        # closing the previous "any authenticated user, any department" gap.
        queryset = Certificate.objects.with_related()
        lookup_value = self.kwargs[self.lookup_url_kwarg or self.lookup_field]
        obj = get_object_or_404(queryset, pk=lookup_value)
        self.check_object_permissions(self.request, obj)
        return obj

    def perform_create(self, serializer):
        profile = request_profile(self.request)
        department_id = request_department_id(self.request)
        serializer.save(
            uploaded_by=profile,
            user_department=str(department_id) if department_id else None,
        )

    def create(self, request, *args, **kwargs):
        data = mutable_request_data(request)
        selected_equipment = data.get("selected_equipment") or data.get("equipment")
        if selected_equipment:
            data["equipment"] = selected_equipment
            if not data.get("equipment_id") and Equipment is not None:
                equipment = Equipment.objects.filter(
                    equipment_class=selected_equipment
                ).first()
                if equipment:
                    data["equipment_id"] = str(equipment.id)

        alias_pairs = {
            "received_from": "recieved_from_unit",
            "reply_required": "replied",
            "addressed_to": "addressed_to_unit",
        }
        for source, target in alias_pairs.items():
            if data.get(source) not in (None, "") and data.get(target) in (None, ""):
                data[target] = data[source]

        for field in ("expiry_date", "letter_date", "letter_received_on"):
            parsed = parse_legacy_date(data.get(field))
            if parsed not in (None, ""):
                data[field] = parsed

        if data.get("certificate_type") == "correspondence" and not data.get("name"):
            data["name"] = data.get("filenumber") or str(random.randint(10000, 999999))

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        certificate = serializer.instance
        return Response(
            {"success": True, "certificate": certificate_legacy_dict(certificate)},
            status=status.HTTP_201_CREATED,
        )

    def perform_destroy(self, instance):
        if instance.attachment:
            instance.attachment.storage.delete(instance.attachment.name)
        instance.delete()

    def list_by_type(self, request, cert_type=None):
        queryset = self.get_queryset().filter(certificate_type=cert_type)
        return Response(
            {"certificates": [certificate_legacy_dict(cert) for cert in queryset]}
        )

    def list_shared_by_type(self, request, cert_type=None):
        profile = request_profile(request)
        department_id = request_department_id(request)
        uploaded = Certificate.objects.with_related().filter(
            certificate_type=cert_type,
            user_department=str(department_id) if department_id else None,
            uploaded_by=profile,
        )
        shared = Certificate.objects.with_related().filter(
            certificate_type=cert_type,
            shared_with=profile,
        )

        def to_row(cert, status_label):
            row = certificate_legacy_dict(cert)
            row["uploaded_by"] = str(cert.uploaded_by_id) if cert.uploaded_by_id else ""
            row["category"] = cert.category or ""
            row["status"] = status_label
            if status_label == "shared":
                row["shared_on"] = cert.format_date(cert.shared_on)
            return row

        certificates = [to_row(cert, "uploaded") for cert in uploaded] + [
            to_row(cert, "shared") for cert in shared
        ]
        return Response({"success": True, "certificates": certificates})

    def dashboard(self, request):
        from django.db.models import Count, Exists, OuterRef

        department_id = request_department_id(request)

        own_certs = Certificate.objects.filter(
            user_department=str(department_id) if department_id else None
        )

        count_technicals = EquipmentDocument.objects.filter(
            created_by__department_id=department_id
        ).count()
        count_certificates = own_certs.filter(certificate_type="other").count()
        count_correspondence = own_certs.filter(
            certificate_type="correspondence",
            certificate_subtype="inmail",
        ).count()

        today = timezone.localdate()
        six_months_later = today + timedelta(days=180)
        twelve_months_ago = today - timedelta(days=365)

        expiring_count = own_certs.filter(
            certificate_type="other",
            expiry_date__gte=today,
            expiry_date__lte=six_months_later,
        ).count()

        inmail_qs = own_certs.filter(
            certificate_type="correspondence",
            certificate_subtype="inmail",
            replied="Yes",
        )
        reply_subquery = Certificate.objects.filter(
            certificate_type="correspondence",
            certificate_subtype="outmail",
            filenumber=OuterRef("filenumber"),
            outmail_category="Reply To In-mail",
        )
        annotated_inmail = inmail_qs.annotate(has_reply=Exists(reply_subquery))
        replied_count = annotated_inmail.filter(has_reply=True).count()
        not_replied_count = annotated_inmail.filter(has_reply=False).count()

        months = []
        month_cursor = today.replace(day=1)
        for _ in range(12):
            months.append(month_cursor.strftime("%b %Y"))
            month_cursor = (month_cursor - timedelta(days=1)).replace(day=1)
        months.reverse()

        cert_types = list(
            Certificate.objects.exclude(certificate_type__isnull=True)
            .exclude(certificate_type__exact="")
            .values_list("certificate_type", flat=True)
            .distinct()
        )
        subtypes = list(
            Certificate.objects.exclude(certificate_subtype__isnull=True)
            .exclude(certificate_subtype__exact="")
            .values_list("certificate_subtype", flat=True)
            .distinct()
        )

        data_type = {month: dict.fromkeys(cert_types, 0) for month in months}
        data_subtype = {month: dict.fromkeys(subtypes, 0) for month in months}

        certificates2 = own_certs.filter(
            certificate_type__in=["correspondence"],
            issue_date__gte=twelve_months_ago,
        )
        certificates_list = []
        for cert in certificates2:
            month = cert.issue_date.strftime("%b %Y") if cert.issue_date else ""
            if month in data_type:
                if cert.certificate_type in cert_types:
                    data_type[month][cert.certificate_type] += 1
                if cert.certificate_subtype in subtypes:
                    data_subtype[month][cert.certificate_subtype] += 1

            certificates_list.append(
                {
                    "id": cert.id,
                    "name": cert.name or "",
                    "certificate_type": cert.certificate_type or "",
                    "certificate_subtype": cert.certificate_subtype or "",
                    "certificate_id": cert.certificate_id or "",
                    "issue_date": cert.format_date(cert.issue_date),
                    "expiry_date": cert.format_date(cert.expiry_date),
                    "place_of_issue": cert.place_of_issue or "",
                    "remarks": cert.remarks or "",
                    "letter_ref_no": cert.letter_ref_no or "",
                    "letter_date": cert.format_date(cert.letter_date),
                    "recieved_from_unit": cert.recieved_from_unit or "",
                    "addressed_to_unit": cert.addressed_to_unit or "",
                    "replied": cert.replied or "",
                    "month": month,
                }
            )

        chart_data_type = [{"month": month, **data_type[month]} for month in months]
        chart_data_subtype = [
            {"month": month, **data_subtype[month]} for month in months
        ]

        equipment_data = [
            {"equipment": item["equipment__equipment_name"], "count": item["count"]}
            for item in (
                EquipmentDocument.objects.filter(
                    created_by__department_id=department_id
                )
                .values("equipment__equipment_name")
                .annotate(count=Count("id"))
                .order_by("-count")
            )
        ]

        cert_category_data = list(
            own_certs.filter(certificate_type="other")
            .exclude(category__isnull=True)
            .exclude(category__exact="")
            .values("category")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        return Response(
            {
                "cert_category_data": cert_category_data,
                "chart_data_type": chart_data_type,
                "chart_data_subtype": chart_data_subtype,
                "cert_types": cert_types,
                "subtypes": subtypes,
                "count_technicals": count_technicals,
                "count_certificates": count_certificates,
                "count_correspondence": count_correspondence,
                "expiring_count": expiring_count,
                "replied_count": replied_count,
                "not_replied_count": not_replied_count,
                "equipment_data": equipment_data,
                "certificates_list": certificates_list,
            }
        )

    def share_certificate(self, request):
        cert_id = payload_pk(request, "cert_id", "certificate_id", "pk", "id")
        certificate = get_object_or_404(self.get_queryset(), pk=cert_id)
        user_ids = request.data.get("user_ids") or request.data.get("shared_with") or []
        if isinstance(user_ids, str):
            user_ids = [user_ids]
        certificate.is_shared = True
        certificate.shared_on = timezone.now().date()
        certificate.save(update_fields=["is_shared", "shared_on"])
        if user_ids:
            certificate.shared_with.set(user_ids)
        serializer = self.get_serializer(certificate)
        return Response(serializer.data)

    @staticmethod
    def _letter_years():
        years = {
            letter_date.year
            for letter_date in Certificate.objects.exclude(
                letter_date__isnull=True
            ).values_list("letter_date", flat=True)
        }
        return sorted(years, reverse=True)

    def in_mail(self, request):
        user = request.user
        certificates = Certificate.objects.for_user(user).filter(
            certificate_type="correspondence",
            certificate_subtype="inmail",
        )
        return Response(
            {
                "certificates": self.get_serializer(certificates, many=True).data,
                "years": self._letter_years(),
            }
        )

    def out_mail(self, request):
        user = request.user
        own_certs = Certificate.objects.for_user(user)
        certificates = own_certs.filter(
            certificate_type="correspondence",
            certificate_subtype="outmail",
        )
        filenumbers = list(
            own_certs.filter(
                certificate_type="correspondence",
                certificate_subtype="inmail",
                replied="Yes",
            ).values_list("filenumber", flat=True)
        )
        return Response(
            {
                "certificates": self.get_serializer(certificates, many=True).data,
                "years": self._letter_years(),
                "filenumbers": filenumbers,
            }
        )

    def stream_attachment(self, request, cert_id=None):
        from django.http import FileResponse, Http404

        certificate = get_object_or_404(Certificate, pk=cert_id)
        if not certificate.attachment:
            raise Http404("No attachment found.")
        return FileResponse(
            certificate.attachment.open("rb"),
            filename=certificate.attachment.name.rsplit("/", 1)[-1],
        )


@tagged_viewset(
    "DMS",
    create_examples=[
        OpenApiExample(
            "Create category",
            value={"category_name": "TECHNICAL", "is_system": False},
            request_only=True,
        )
    ],
)
class CategoryNameViewSet(DMSModelViewSet):
    queryset = CategoryName.objects.all()
    serializer_class = CategoryNameSerializer

    DEFAULT_CATEGORIES = (
        "Load Test Certificate",
        "Calibration Certificate",
        "Pressure Test Certificate",
    )

    def get_queryset(self):
        for name in self.DEFAULT_CATEGORIES:
            CategoryName.objects.get_or_create(
                category_name=name,
                defaults={"is_system": True},
            )
        return super().get_queryset()

    def update_from_payload(self, request):
        category_id = payload_pk(request, "category_id", "id", "pk")
        instance = get_object_or_404(self.get_queryset(), pk=category_id)
        if instance.category_name in self.DEFAULT_CATEGORIES:
            raise ValidationError({"detail": "Default categories cannot be edited."})
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete_from_payload(self, request):
        category_id = payload_pk(request, "category_id", "id", "pk")
        instance = get_object_or_404(self.get_queryset(), pk=category_id)
        if instance.category_name in self.DEFAULT_CATEGORIES:
            raise ValidationError({"detail": "Default categories cannot be deleted."})
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@tagged_viewset(
    "DMS",
    create_examples=[
        OpenApiExample(
            "Create equipment category",
            value={"equipment_name": "RADAR"},
            request_only=True,
        )
    ],
)
class EquipmentCategoryViewSet(DMSModelViewSet):
    queryset = EquipmentCategory.objects.with_creator()
    serializer_class = EquipmentCategorySerializer
    lookup_url_kwarg = "equipment_id"

    def perform_create(self, serializer):
        serializer.save(created_by=request_profile(self.request))

    def create(self, request, *args, **kwargs):
        equipment_name = (request.data.get("equipment_name") or "").strip()
        if not equipment_name:
            return Response(
                {"success": False, "error": "Equipment name is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if EquipmentCategory.objects.filter(
            equipment_name__iexact=equipment_name
        ).exists():
            return Response(
                {"success": False, "error": "Equipment category already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.get_serializer(data={"equipment_name": equipment_name})
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        equipment = serializer.instance
        return Response(
            {
                "success": True,
                "equipment": {
                    "id": equipment.id,
                    "equipment_name": equipment.equipment_name,
                },
            },
            status=status.HTTP_201_CREATED,
        )

    def list(self, request, *args, **kwargs):
        equipments = [
            {
                "id": equipment.id,
                "equipment_name": equipment.equipment_name,
                "created_at": equipment.created_at.strftime("%d %b %Y")
                if equipment.created_at
                else "",
            }
            for equipment in self.get_queryset()
        ]
        return Response({"success": True, "equipments": equipments})

    def perform_destroy(self, instance):
        for document in instance.documents.all():
            if document.attachment:
                document.attachment.storage.delete(document.attachment.name)
        instance.delete()


@tagged_viewset(
    "DMS",
    create_examples=[
        OpenApiExample(
            "Create equipment document",
            value={
                "equipment": 1,
                "document_name": "Radar Technical Manual",
                "document_type": "TD",
            },
            request_only=True,
        )
    ],
)
class EquipmentDocumentViewSet(DMSModelViewSet):
    queryset = EquipmentDocument.objects.all()
    serializer_class = EquipmentDocumentSerializer
    lookup_url_kwarg = "document_id"

    def get_queryset(self):
        queryset = super().get_queryset().with_related()
        equipment_id = self.request.query_params.get(
            "equipment"
        ) or self.request.query_params.get("equipment_id")
        document_type = self.request.query_params.get("document_type")
        return queryset.filter_view(
            equipment_id=equipment_id,
            document_type=document_type,
        )

    def perform_create(self, serializer):
        serializer.save(created_by=request_profile(self.request))

    def create(self, request, *args, **kwargs):
        data = mutable_request_data(request)
        if data.get("equipment_id") and not data.get("equipment"):
            data["equipment"] = data["equipment_id"]
        if data.get("document_type") == "Other" and data.get("custom_doc_type"):
            data["document_type"] = data["custom_doc_type"]

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        document = serializer.instance
        return Response(
            {
                "success": True,
                "document": {
                    "id": document.id,
                    "document_name": document.document_name,
                    "document_type": document.document_type,
                    "uploaded_date": document.uploaded_date.strftime("%d %b %Y"),
                    "equipment_name": document.equipment.equipment_name,
                    "attachment": document.attachment.name
                    if document.attachment
                    else None,
                },
            },
            status=status.HTTP_201_CREATED,
        )

    def list(self, request, *args, **kwargs):
        documents = [
            {
                "id": document.id,
                "document_name": document.document_name,
                "document_type": document.document_type,
                "uploaded_date": document.uploaded_date.strftime("%d %b %Y"),
                "equipment_name": document.equipment.equipment_name,
                "attachment": document.attachment.name if document.attachment else None,
            }
            for document in self.get_queryset()
        ]
        return Response({"success": True, "documents": documents})

    def perform_destroy(self, instance):
        if instance.attachment:
            instance.attachment.storage.delete(instance.attachment.name)
        instance.delete()

    def stream_attachment(self, request, document_id=None):
        import mimetypes

        from django.http import FileResponse, Http404

        document = get_object_or_404(EquipmentDocument, pk=document_id)
        if not document.attachment:
            raise Http404("Document file not found.")
        content_type = (
            mimetypes.guess_type(document.attachment.name)[0]
            or "application/octet-stream"
        )
        return FileResponse(
            document.attachment.open("rb"),
            content_type=content_type,
            filename=document.attachment.name.rsplit("/", 1)[-1],
        )
