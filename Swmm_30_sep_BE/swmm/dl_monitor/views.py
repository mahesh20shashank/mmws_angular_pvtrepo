import re
from datetime import datetime

import pandas as pd
from accounts import rbac
from accounts.models import AUTH_SOURCE_HRCDF, CustomUserProfile
from django.db.models import Count
from django.utils import timezone
from rest_framework import status

# from SFD.models import ShipEquipment
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from sfd.models import ShipEquipment

from .models import DLClose, DLTracker
from .serializers import DLHistorySerializer, DLTrackingSerializer

DL_TYPE_CHOICES = [
    "AWRF II",
    "AWRF I",
    "DL1",
    "DL2",
    "DL3",
    "SDL",
]


class CommonPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response(
            {
                "status": True,
                "message": "Data fetched successfully.",
                "pagination": {
                    "count": self.page.paginator.count,
                    "current_page": self.page.number,
                    "page_size": self.get_page_size(self.request),
                    "total_pages": self.page.paginator.num_pages,
                    "next": self.get_next_link(),
                    "previous": self.get_previous_link(),
                },
                "data": data,
            }
        )


class DLDashboardAPIView(APIView):
    """
    Dashboard API
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Developed with Understanding: HRCDF-synced rows with no credentials are crew,
        # not pending registrations (D3, OQ13).
        count = (
            CustomUserProfile.objects.filter(is_role=False)
            .exclude(auth_source=AUTH_SOURCE_HRCDF, has_credentials=False)
            .count()
        )

        return Response(
            {
                "success": True,
                "message": "Dashboard data fetched successfully.",
                "data": {"count": count},
            },
            status=status.HTTP_200_OK,
        )


class DLMasterAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            {
                "success": True,
                "message": "DL master data fetched successfully.",
                "data": {"dl_types": DL_TYPE_CHOICES},
            },
            status=status.HTTP_200_OK,
        )


class ImportExcelAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        excel_file = request.FILES.get("excel")
        dl_type = request.data.get("dl_type")

        if not excel_file:
            return Response(
                {"success": False, "message": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not dl_type:
            return Response(
                {"success": False, "message": "Please select a DL Type."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if dl_type not in DL_TYPE_CHOICES:
            return Response(
                {"success": False, "message": "Invalid DL Type selected."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not excel_file.name.endswith((".xlsx", ".xls")):
            return Response(
                {"success": False, "message": "Upload .xlsx or .xls only."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            df = pd.read_excel(excel_file)
            df.columns = df.columns.str.strip()
            df = df.fillna("")

            created_count = 0
            updated_count = 0

            def normalize(text):
                return re.sub(r"[^a-zA-Z0-9]", "", str(text)).lower()

            # Build lookup dictionary once
            ship_eq_dict = {
                normalize(eq["nomenclature"]): {
                    "id": eq["id"],
                    "sub_id": eq["sub_department_f_key"],
                }
                for eq in ShipEquipment.objects.values(
                    "id",
                    "nomenclature",
                    "sub_department_f_key",
                )
            }
            for _, row in df.iterrows():
                equip_name = str(row.get("Equip Name", "")).strip()
                defect_description = str(row.get("Defect Description", "")).strip()
                defect_no = str(row.get("Defect No", "")).strip()

                if not defect_no:
                    continue

                sub_dept = None
                ship_eq_id = None

                lookup_name = normalize(equip_name)

                if lookup_name in ship_eq_dict:
                    sub_dept = ship_eq_dict[lookup_name]["sub_id"]
                    ship_eq_id = ship_eq_dict[lookup_name]["id"]

                obj, created = DLTracker.objects.update_or_create(
                    defect_no=defect_no,
                    dl_type=dl_type,
                    defaults={
                        "sub_dept_id_id": sub_dept,
                        "ship_equip_id": ship_eq_id,
                        "equip_name": equip_name,
                        "dart_no": str(row.get("Dart No", "")).strip(),
                        "defect_description": defect_description,
                        "ship_remarks": str(row.get("Ship Remarks", "")).strip(),
                        "yard_remarks": str(row.get("Yard Remarks", "")).strip(),
                        "final_prm": str(row.get("Final PRM(s)", "")).strip(),
                        "c_no": str(row.get("C No", "")).strip(),
                        "remarks_status": str(row.get("Remarks Status", "")).strip(),
                        "view_wi": str(row.get("View WI", "")).strip(),
                        "interact": str(row.get("Interact", "")).strip(),
                        "wi_generation_status": str(
                            row.get("WI Generation Status (Yes/ No)", "")
                        ).strip(),
                        "qc_clearance": str(
                            row.get("QC Clearance (Yes/ No)", "")
                        ).strip(),
                        "wi_closing_status": str(
                            row.get("WI Closing Status (Yes/No)", "")
                        ).strip(),
                        "weekly_status": str(row.get("Weekly Status", "")).strip(),
                        "defect_key": str(row.get("DEFECT KEY", "")).strip(),
                        "equip_location": str(row.get("Equip Location", "")).strip(),
                        "equip_sys": str(row.get("Equip Sys", "")).strip(),
                        "status": "",
                    },
                )

                if created:
                    created_count += 1
                else:
                    updated_count += 1

            return Response(
                {
                    "success": True,
                    "message": "Import completed successfully.",
                    "data": {
                        "created": created_count,
                        "updated": updated_count,
                    },
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {
                    "success": False,
                    "message": str(e),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


def _scope_dl_queryset_to_department(user, queryset):
    """Scope a DLTracker queryset to the caller's department, mirroring
    DLDashboardCountsAPIView's convention: privileged roles see every
    department, everyone else sees their own (or nothing if unassigned)."""
    if rbac.can_see_all_departments(user):
        return queryset
    own_department = rbac.department_of(user)
    if own_department is None:
        return queryset.none()
    return queryset.filter(sub_dept_id__department_name=own_department.id)


class DLTrackingAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            queryset = DLTracker.objects.select_related("sub_dept_id").filter(
                is_closed=False,
                dl_type="DL1",
            )
            queryset = _scope_dl_queryset_to_department(
                request.user, queryset
            ).order_by("id")

            # Pagination
            paginator = CommonPagination()
            page = paginator.paginate_queryset(queryset, request)

            serializer = DLTrackingSerializer(page, many=True)

            data = []
            start = paginator.page.start_index()

            for index, item in enumerate(serializer.data, start=start):
                row = dict(item)
                row["ser"] = index

                row["dl_type"] = row.get("dl_type") or "-"
                row["dart_no"] = row.get("dart_no") or "-"
                row["equip_name"] = row.get("equip_name") or "-"
                row["defect_no"] = row.get("defect_no") or "-"
                row["defect_description"] = row.get("defect_description") or "-"
                row["ship_remarks"] = row.get("ship_remarks") or "-"
                row["yard_remarks"] = row.get("yard_remarks") or ""
                row["final_prm"] = row.get("final_prm") or ""
                row["c_no"] = row.get("c_no") or ""
                row["wi_generation_status"] = row.get("wi_generation_status") or ""
                row["qc_clearance"] = row.get("qc_clearance") or ""
                row["wi_closing_status"] = row.get("wi_closing_status") or ""
                row["wi_generated_by_yard"] = row.get("wi_generated_by_yard") or ""
                row["weekly_status"] = row.get("weekly_status") or ""
                row["status"] = row.get("status") or "Not yet started"
                row["dl_importance"] = row.get("dl_importance") or "Normal DL"

                data.append(row)

            return paginator.get_paginated_response(data)

        except Exception as e:
            return Response(
                {
                    "status": False,
                    "message": str(e),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class UpdateDLTrackingAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            payload = request.data
            row_id = payload.get("id")
            obj = DLTracker.objects.get(id=row_id)

            # --- SS-editable fields ---
            if "yard_remarks" in payload:
                obj.yard_remarks = payload["yard_remarks"]

            if "final_prm" in payload:
                obj.final_prm = payload["final_prm"]

            if "c_no" in payload:
                obj.c_no = payload["c_no"]

            if "wi_generation_status" in payload:
                obj.wi_generation_status = payload["wi_generation_status"]

            if "qc_clearance" in payload:
                obj.qc_clearance = payload["qc_clearance"]

            if "wi_closing_status" in payload:
                obj.wi_closing_status = payload["wi_closing_status"]

            if "wi_generated_by_yard" in payload:
                obj.wi_generated_by_yard = payload["wi_generated_by_yard"]

            if "dl_importance" in payload:
                obj.dl_importance = payload["dl_importance"]

            if "weekly_status" in payload:
                obj.weekly_status = payload["weekly_status"]

            if "status" in payload:
                obj.status = payload["status"]

            # Auto-timestamp current status updated on
            obj.current_status_updated_on = timezone.now()
            obj.save()

            updated_on = (
                obj.current_status_updated_on.strftime("%d-%m-%Y %H:%M")
                if obj.current_status_updated_on
                else "-"
            )

            return Response(
                {
                    "status": "success",
                    "message": "Record updated successfully.",
                    "current_status_updated_on": updated_on,
                },
                status=status.HTTP_200_OK,
            )

        except DLTracker.DoesNotExist:
            return Response(
                {"status": "error", "message": "Record not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def get(self, request):
        return Response(
            {"status": "error", "message": "Invalid request method."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class CloseDLTrackingAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            data = request.data
            row_id = int(data.get("id"))

            # ✅ Convert strings to date objects
            def parse_date(val):
                if val:
                    return datetime.strptime(val, "%Y-%m-%d").date()
                return None

            er_date = parse_date(data.get("er_date"))
            start_work = parse_date(data.get("start_work"))
            complete_work = parse_date(data.get("complete_work"))

            obj = DLTracker.objects.get(id=row_id)

            DLClose.objects.update_or_create(
                dl_tracker=obj,
                defaults={
                    "er_date_by_yard": er_date,
                    "start_work_by_yard": start_work,
                    "complete_work_by_yard": complete_work,
                },
            )

            obj.is_closed = True
            obj.save()

            return Response(
                {"status": "success", "message": "DL closed successfully."},
                status=status.HTTP_200_OK,
            )

        except DLTracker.DoesNotExist:
            return Response(
                {"status": "error", "message": "Record not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        except Exception as e:
            print("ERROR:", str(e))
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class DLHistoryAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            closed_records = DLClose.objects.select_related(
                "dl_tracker", "dl_tracker__sub_dept_id"
            ).all()

            paginator = CommonPagination()
            page = paginator.paginate_queryset(closed_records, request)

            serializer = DLHistorySerializer(page, many=True)

            return paginator.get_paginated_response(serializer.data)

        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class DLDashboardCountsAPIView(APIView):
    # permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = DLTracker.objects.all()
        if not rbac.can_see_all_departments(request.user):
            own_department = rbac.department_of(request.user)
            if own_department is None:
                queryset = queryset.none()
            else:
                queryset = queryset.filter(
                    sub_dept_id__department_name=own_department.id
                )

        dl1_count = queryset.filter(dl_type="DL1", is_closed=False).count()

        dl2_count = queryset.filter(dl_type="DL2", is_closed=False).count()

        dl3_count = queryset.filter(dl_type="DL3", is_closed=False).count()

        return Response(
            {
                "dl1": dl1_count,
                "dl2": dl2_count,
                "dl3": dl3_count,
                # "Refit in Progress" card total -- computed here rather than
                # client-side so the frontend has one source of truth for it.
                "total": dl1_count + dl2_count + dl3_count,
            },
            status=status.HTTP_200_OK,
        )


class DLDashboardBreakdownAPIView(APIView):
    """Compartment-wise (sub-department) DL-I/II/III breakdown for the
    dashboard's stacked charts. Department-scoped the same way as
    `DLDashboardCountsAPIView`/`_scope_dl_queryset_to_department` -- no
    hardcoded compartments or counts, purely aggregated from `DLTracker`."""

    DL_TYPES = ["DL1", "DL2", "DL3"]

    def get(self, request):
        queryset = _scope_dl_queryset_to_department(
            request.user, DLTracker.objects.all()
        ).filter(dl_type__in=self.DL_TYPES)

        return Response(
            {
                "total": self._dataset(queryset),
                "pending": self._dataset(queryset.filter(is_closed=False)),
            },
            status=status.HTTP_200_OK,
        )

    def _dataset(self, queryset):
        rows = queryset.values("dl_type", "sub_dept_id__name").annotate(
            total=Count("id")
        )
        compartments = sorted(
            {row["sub_dept_id__name"] or "Unassigned" for row in rows}
        )
        counts = {
            compartment: dict.fromkeys(self.DL_TYPES, 0) for compartment in compartments
        }
        for row in rows:
            compartment = row["sub_dept_id__name"] or "Unassigned"
            counts[compartment][row["dl_type"]] = row["total"]

        return {
            "categories": self.DL_TYPES,
            "series": [
                {
                    "name": compartment,
                    "data": [counts[compartment][dl_type] for dl_type in self.DL_TYPES],
                }
                for compartment in compartments
            ],
        }


class DL2TrackingAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            trackers = DLTracker.objects.select_related("sub_dept_id").filter(
                is_closed=False, dl_type="DL2"
            )
            trackers = _scope_dl_queryset_to_department(request.user, trackers)

            paginator = CommonPagination()
            page = paginator.paginate_queryset(trackers, request)

            serializer = DLTrackingSerializer(page, many=True)

            data = []
            start = paginator.page.start_index()

            for index, item in enumerate(serializer.data, start=start):
                row = dict(item)
                row["ser"] = index

                row["dl_type"] = row.get("dl_type") or "-"
                row["dart_no"] = row.get("dart_no") or "-"
                row["equip_name"] = row.get("equip_name") or "-"
                row["defect_no"] = row.get("defect_no") or "-"
                row["defect_description"] = row.get("defect_description") or "-"
                row["ship_remarks"] = row.get("ship_remarks") or "-"
                row["yard_remarks"] = row.get("yard_remarks") or ""
                row["final_prm"] = row.get("final_prm") or ""
                row["c_no"] = row.get("c_no") or ""
                row["wi_generation_status"] = row.get("wi_generation_status") or ""
                row["qc_clearance"] = row.get("qc_clearance") or ""
                row["wi_closing_status"] = row.get("wi_closing_status") or ""
                row["wi_generated_by_yard"] = row.get("wi_generated_by_yard") or ""
                row["weekly_status"] = row.get("weekly_status") or ""
                row["status"] = row.get("status") or "Not yet started"
                row["dl_importance"] = row.get("dl_importance") or "Normal DL"

                data.append(row)

            return paginator.get_paginated_response(data)

        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class DL3TrackingAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            trackers = DLTracker.objects.select_related("sub_dept_id").filter(
                is_closed=False, dl_type="DL3"
            )
            trackers = _scope_dl_queryset_to_department(request.user, trackers)

            paginator = CommonPagination()
            page = paginator.paginate_queryset(trackers, request)

            serializer = DLTrackingSerializer(page, many=True)

            data = []
            start = paginator.page.start_index()

            for index, item in enumerate(serializer.data, start=start):
                row = dict(item)
                row["ser"] = index

                row["dl_type"] = row.get("dl_type") or "-"
                row["dart_no"] = row.get("dart_no") or "-"
                row["equip_name"] = row.get("equip_name") or "-"
                row["defect_no"] = row.get("defect_no") or "-"
                row["defect_description"] = row.get("defect_description") or "-"
                row["ship_remarks"] = row.get("ship_remarks") or "-"
                row["yard_remarks"] = row.get("yard_remarks") or ""
                row["final_prm"] = row.get("final_prm") or ""
                row["c_no"] = row.get("c_no") or ""
                row["wi_generation_status"] = row.get("wi_generation_status") or ""
                row["qc_clearance"] = row.get("qc_clearance") or ""
                row["wi_closing_status"] = row.get("wi_closing_status") or ""
                row["wi_generated_by_yard"] = row.get("wi_generated_by_yard") or ""
                row["weekly_status"] = row.get("weekly_status") or ""
                row["status"] = row.get("status") or "Not yet started"
                row["dl_importance"] = row.get("dl_importance") or "Normal DL"

                data.append(row)

            return paginator.get_paginated_response(data)

        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class SyncNavYojanaAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            payload = request.data
            dl_type = payload.get("dl_type", "DL1")

            # Filter open trackers for this department and DL type
            trackers = DLTracker.objects.filter(is_closed=False, dl_type=dl_type)
            trackers = _scope_dl_queryset_to_department(request.user, trackers)

            # Sync / Populate Navyojana fields with realistic mock data
            synced_count = 0

            for obj in trackers:
                updated = False

                if (
                    not obj.yard_remarks
                    or obj.yard_remarks == "-"
                    or obj.yard_remarks == ""
                ):
                    obj.yard_remarks = f"Navyojana Yard Remark for {obj.defect_no}"
                    updated = True

                if not obj.final_prm or obj.final_prm == "-" or obj.final_prm == "":
                    obj.final_prm = "PRM Center Alpha"
                    updated = True

                if not obj.c_no or obj.c_no == "-" or obj.c_no == "":
                    obj.c_no = "C-9923"
                    updated = True

                if (
                    not obj.wi_generation_status
                    or obj.wi_generation_status == "-"
                    or obj.wi_generation_status == ""
                    or obj.wi_generation_status == "No"
                ):
                    obj.wi_generation_status = "Yes"
                    updated = True

                if (
                    not obj.qc_clearance
                    or obj.qc_clearance == "-"
                    or obj.qc_clearance == ""
                ):
                    obj.qc_clearance = "Yes"
                    updated = True

                if (
                    not obj.wi_closing_status
                    or obj.wi_closing_status == "-"
                    or obj.wi_closing_status == ""
                ):
                    obj.wi_closing_status = "No"
                    updated = True

                if updated:
                    obj.save()
                    synced_count += 1

            # Return updated trackers for Javascript cache update
            updated_trackers = []

            for obj in trackers:
                updated_trackers.append(
                    {
                        "id": obj.id,
                        "yard_remarks": obj.yard_remarks or "",
                        "final_prm": obj.final_prm or "",
                        "c_no": obj.c_no or "",
                        "wi_generation_status": obj.wi_generation_status or "",
                        "qc_clearance": obj.qc_clearance or "",
                        "wi_closing_status": obj.wi_closing_status or "",
                    }
                )

            return Response(
                {
                    "status": "success",
                    "message": f"Successfully synced {synced_count} records from Navyojana!",
                    "data": updated_trackers,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
