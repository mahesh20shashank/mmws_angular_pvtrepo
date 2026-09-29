from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from op_maintenance.models import CompleteDefectDart, CompletedRoutine, InitiateDart, InitiateRADL
from ems.models import (
    AddRoutineDetails,
    PlannedRoutineDescription,
    RoutineDescription,
    UniqueRoutineName,
)
from obs.models import RoutineSpareUsage, Spares
from swmm.cache_utils import get_or_set_cached_payload, make_cache_key

from .serializers import (
    RefitDashboardKPIResponseSerializer,
    RefitDashboardResponseSerializer,
    RefitDashboardSerializer,
    RefitRoutineConversionSerializer,
    RefitRoutineDetailSerializer,
    RefitRoutineSerializer,
)
from .utils import tagged_read_only_viewset


class RefitDashboardMixin:
    def _normalize_period(self, period):
        period = str(period or "6m").strip().lower()
        return period if period in {"6m", "1y", "2y"} else "6m"

    def _period_bounds(self, period):
        days_by_period = {"6m": 180, "1y": 365, "2y": 730}
        days = days_by_period[period]
        today = timezone.localdate()
        current_start = today - timedelta(days=days)
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=days)
        return current_start, today, previous_start, previous_end

    def _count_for_period(self, queryset, date_field, start_date, end_date):
        filters = {
            f"{date_field}__gte": start_date,
            f"{date_field}__lt": end_date + timedelta(days=1),
        }
        return queryset.filter(**filters).count()

    def _trend(self, current_count, previous_count, period):
        if previous_count == 0:
            percentage = 100 if current_count else 0
        else:
            percentage = round(
                ((current_count - previous_count) / previous_count) * 100
            )

        if current_count > previous_count:
            direction = "up"
        elif current_count < previous_count:
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

    def _build_metric_card(
        self,
        key,
        title,
        value,
        period,
        current_count,
        previous_count,
        unit="count",
        status="info",
    ):
        return {
            "key": key,
            "title": title,
            "value": value,
            "unit": unit,
            "status": status,
            "trend": self._trend(current_count, previous_count, period),
        }

    def _refit_routines(self):
        return AddRoutineDetails.objects.refit_dashboard_for_user(self.request.user)

    def _routine_descriptions(self):
        return RoutineDescription.objects.filter(
            add_routine_details__in=self._refit_routines(),
        ).select_related(
            "equipment_name",
            "equipment_name__section",
            "department_f_key",
        )

    def _completed_routines(self):
        return CompletedRoutine.objects.filter(
            routine__add_routine_details__in=self._refit_routines(),
        ).select_related(
            "routine",
            "routine__equipment_name",
            "routine__equipment_name__section",
        )

    def _refit_defects(self):
        queryset = InitiateDart.objects.filter(
            Q(maintenance_period__iexact="REFIT")
            | Q(refit_maintenance_period_f_key__isnull=False),
        ).select_related(
            "equipment_ems",
            "equipment_ems__section",
            "department_id",
            "severity_code",
        )
        department = getattr(self.request.user, "department", None)
        if department:
            queryset = queryset.filter(
                Q(department_id=department)
                | Q(equipment_ems__section__department=department),
            )
        return queryset.distinct()

    def _open_refit_defects(self):
        return self._refit_defects().filter(is_closed=False)

    def _dl_entries(self):
        queryset = InitiateRADL.objects.select_related("initiate_dart")
        department = getattr(self.request.user, "department", None)
        if department:
            queryset = queryset.filter(
                Q(initiate_dart__department_id=department)
                | Q(initiate_dart__equipment_ems__section__department=department),
            )
        return queryset.filter(dl_type__in=["DL-II", "DL-III"]).distinct()

    def _critical_open_defects(self):
        return self._open_refit_defects().filter(
            Q(ops_status=False)
            | Q(trial_required=True)
            | Q(sapres_required=True)
            | Q(severity_code__severity_name__icontains="critical")
        )

    def _readiness_status(self, percentage):
        if percentage >= 85:
            return "good"
        if percentage >= 60:
            return "watch"
        return "risk"

    def _completion_percentage(self, completed, total):
        if total <= 0:
            return 0
        return round((completed / total) * 100)

    def _build_kpis(self, period):
        current_start, today, previous_start, previous_end = self._period_bounds(period)
        routines = self._refit_routines()
        completed_routines = self._completed_routines()
        defects = self._refit_defects()
        open_defects = defects.filter(is_closed=False)
        dl_entries = self._dl_entries()
        qa_pending_qs = open_defects.filter(trial_required=True)

        total_routines = routines.count()
        converted_total = routines.filter(converted=True).count()
        progress_percentage = self._completion_percentage(
            converted_total, total_routines
        )

        work_total = completed_routines.count() + defects.count()
        work_closed = (
            completed_routines.count() + defects.filter(is_closed=True).count()
        )
        readiness_percentage = self._completion_percentage(work_closed, work_total)

        critical_open_count = self._critical_open_defects().count()
        total_dl_entries = dl_entries.count()
        closed_dl_entries = dl_entries.exclude(
            status__in=["DRAFT", "GENERATED"]
        ).count()
        dl_closure_percentage = self._completion_percentage(
            closed_dl_entries,
            total_dl_entries,
        )
        qa_pending_count = qa_pending_qs.count()

        converted_current = self._count_for_period(
            routines.filter(converted=True),
            "converted_at",
            current_start,
            today,
        )
        converted_previous = self._count_for_period(
            routines.filter(converted=True),
            "converted_at",
            previous_start,
            previous_end,
        )
        completed_current = self._count_for_period(
            completed_routines,
            "date_of_completion",
            current_start,
            today,
        )
        completed_previous = self._count_for_period(
            completed_routines,
            "date_of_completion",
            previous_start,
            previous_end,
        )
        open_defect_current = self._count_for_period(
            open_defects,
            "created_date",
            current_start,
            today,
        )
        open_defect_previous = self._count_for_period(
            open_defects,
            "created_date",
            previous_start,
            previous_end,
        )
        qa_current = self._count_for_period(
            qa_pending_qs,
            "created_date",
            current_start,
            today,
        )
        qa_previous = self._count_for_period(
            qa_pending_qs,
            "created_date",
            previous_start,
            previous_end,
        )

        return [
            self._build_metric_card(
                "overall_refit_progress",
                "Overall Refit Progress",
                progress_percentage,
                period,
                converted_current,
                converted_previous,
                unit="percent",
                status=self._readiness_status(progress_percentage),
            ),
            self._build_metric_card(
                "to_float_readiness",
                "To Float Readiness",
                readiness_percentage,
                period,
                completed_current,
                completed_previous,
                unit="percent",
                status=self._readiness_status(readiness_percentage),
            ),
            self._build_metric_card(
                "cardinal_status",
                "Cardinal Status",
                critical_open_count,
                period,
                open_defect_current,
                open_defect_previous,
                unit="count",
                status="risk" if critical_open_count else "good",
            ),
            self._build_metric_card(
                "dl_closure_status",
                "DL Closure Status",
                dl_closure_percentage,
                period,
                closed_dl_entries,
                max(total_dl_entries - closed_dl_entries, 0),
                unit="percent",
                status=self._readiness_status(dl_closure_percentage),
            ),
            self._build_metric_card(
                "qa_pending",
                "QA Pending",
                qa_pending_count,
                period,
                qa_current,
                qa_previous,
                unit="count",
                status="risk" if qa_pending_count else "good",
            ),
        ]

    def _build_summary(self):
        routines = self._refit_routines()
        descriptions = self._routine_descriptions()
        completed = self._completed_routines()
        defects = self._refit_defects()
        open_defects = defects.filter(is_closed=False)
        return {
            "total_refit_routines": routines.count(),
            "converted_routines": routines.filter(converted=True).count(),
            "pending_conversion": routines.filter(converted=False).count(),
            "routine_descriptions": descriptions.count(),
            "completed_routines": completed.count(),
            "open_defects": open_defects.count(),
            "closed_defects": defects.filter(is_closed=True).count(),
        }

    def _build_operational_restoration_and_readiness(self):
        completed = self._completed_routines()
        defects = self._refit_defects()
        open_defects = defects.filter(is_closed=False)
        closed_defects = defects.filter(is_closed=True)
        restored = completed.count() + closed_defects.count()
        total_scope = restored + open_defects.count()
        readiness = self._completion_percentage(restored, total_scope)
        recent_restorations = [
            {
                "type": "routine",
                "equipment": item.routine.equipment_name.name if item.routine else "",
                "title": item.routine.routine_description if item.routine else "",
                "date": (
                    item.date_of_completion.isoformat()
                    if item.date_of_completion
                    else None
                ),
            }
            for item in completed.order_by("-date_of_completion", "-id")[:3]
        ]
        recent_restorations.extend(
            [
                {
                    "type": "defect",
                    "equipment": (
                        defect.equipment_ems.name if defect.equipment_ems else ""
                    ),
                    "title": defect.defective_component
                    or defect.defective_discriptions
                    or defect.dart_number
                    or "",
                    "date": (
                        defect.rectification_date.isoformat()
                        if defect.rectification_date
                        else None
                    ),
                }
                for defect in closed_defects.order_by("-rectification_date", "-id")[:2]
            ]
        )
        recent_restorations = sorted(
            recent_restorations,
            key=lambda item: item["date"] or "",
            reverse=True,
        )[:5]
        return {
            "summary": {
                "restored_items": restored,
                "remaining_items": open_defects.count(),
                "readiness_percentage": readiness,
                "status": self._readiness_status(readiness),
            },
            "recent_restorations": recent_restorations,
        }

    def _build_department_readiness(self):
        routines = self._refit_routines()
        defects = self._open_refit_defects()
        routine_rows = {
            row["equipment_name__section__name"] or "Unassigned": row
            for row in routines.values(
                "equipment_name__section__id",
                "equipment_name__section__name",
                "equipment_name__section__department__name",
            )
            .annotate(
                total=Count("id"),
                converted_total=Count("id", filter=Q(converted=True)),
            )
            .order_by("equipment_name__section__name")
        }
        defect_rows = {
            row["equipment_ems__section__name"] or "Unassigned": row
            for row in defects.values(
                "equipment_ems__section__id",
                "equipment_ems__section__name",
                "equipment_ems__section__department__name",
            ).annotate(total=Count("id"))
        }

        items = []
        section_names = sorted(set(routine_rows) | set(defect_rows))
        for section_name in section_names:
            routine_row = routine_rows.get(section_name, {})
            defect_row = defect_rows.get(section_name, {})
            total_routines = routine_row.get("total", 0)
            converted_total = routine_row.get("converted_total", 0)
            completion = self._completion_percentage(converted_total, total_routines)
            items.append(
                {
                    "section_id": routine_row.get("equipment_name__section__id")
                    or defect_row.get("equipment_ems__section__id"),
                    "section": section_name,
                    "department": routine_row.get(
                        "equipment_name__section__department__name"
                    )
                    or defect_row.get("equipment_ems__section__department__name")
                    or "",
                    "total_routines": total_routines,
                    "converted_routines": converted_total,
                    "open_defects": defect_row.get("total", 0),
                    "readiness_percentage": completion,
                    "status": self._readiness_status(completion),
                }
            )
        return {"items": items}

    def _build_contextual_search_and_drill_down(self):
        routines = self._refit_routines()
        descriptions = self._routine_descriptions()
        defects = self._refit_defects()
        equipment_items = list(
            routines.values("equipment_name_id", "equipment_name__name")
            .annotate(
                total_routines=Count("id"),
                converted_routines=Count("id", filter=Q(converted=True)),
            )
            .order_by("equipment_name__name")[:10]
        )
        if not equipment_items:
            equipment_items = list(
                defects.values("equipment_ems_id", "equipment_ems__name")
                .annotate(total_defects=Count("id"))
                .order_by("equipment_ems__name")[:10]
            )
        return {
            "filters": {
                "sections": sorted(
                    {
                        value
                        for value in list(
                            routines.values_list(
                                "equipment_name__section__name", flat=True
                            )
                        )
                        + list(
                            defects.values_list(
                                "equipment_ems__section__name", flat=True
                            )
                        )
                        if value
                    }
                ),
                "routine_names": sorted(
                    {
                        item["routine_name__name"]
                        for item in routines.values("routine_name__name")
                        if item["routine_name__name"]
                    }
                ),
            },
            "metrics": {
                "equipment_in_scope": max(
                    routines.values("equipment_name_id").distinct().count(),
                    defects.values("equipment_ems_id").distinct().count(),
                ),
                "routine_descriptions": descriptions.count(),
                "routines_with_spares": descriptions.filter(
                    onboard_spare_usages__isnull=False
                )
                .distinct()
                .count(),
            },
            "top_equipment": equipment_items,
        }

    def _build_defect_list_and_work_execution(self):
        open_defects = self._open_refit_defects()
        completed_routines = self._completed_routines()
        defects = [
            {
                "id": defect.id,
                "dart_number": defect.dart_number,
                "equipment": defect.equipment_ems.name if defect.equipment_ems else "",
                "component": defect.defective_component or "",
                "description": defect.defective_discriptions or "",
                "trial_required": bool(defect.trial_required),
                "spares_required": bool(defect.sapres_required),
                "status": "open",
            }
            for defect in open_defects.order_by("rectification_date", "-id")[:10]
        ]
        return {
            "summary": {
                "open_defects": open_defects.count(),
                "completed_routines": completed_routines.count(),
                "completed_defects": CompleteDefectDart.objects.filter(
                    dart_details__in=self._refit_defects(),
                ).count(),
            },
            "defects": defects,
            "work_execution": {
                "total_completed_items": completed_routines.count(),
                "manpower_records": completed_routines.exclude(
                    total_manpower__isnull=True
                ).count(),
            },
        }

    def _build_dependencies_and_external_coordination(self):
        open_defects = self._open_refit_defects()
        department = getattr(self.request.user, "department", None)
        critical_spares_qs = Spares.objects.filter(
            critical=True,
            quantity_available__lte=0,
        )
        if department:
            critical_spares_qs = critical_spares_qs.filter(
                equipment_class__spare_class__department=department,
            )
        constraints = [
            {
                "type": "Spares Required",
                "reference": defect.dart_number or "",
                "equipment": defect.equipment_ems.name if defect.equipment_ems else "",
                "description": defect.defective_discriptions or "",
            }
            for defect in open_defects.filter(sapres_required=True).order_by("-id")[:10]
        ]
        return {
            "summary": {
                "spares_required": open_defects.filter(sapres_required=True).count(),
                "critical_spares_unavailable": critical_spares_qs.count(),
                "dl_pending": self._dl_entries()
                .filter(status__in=["DRAFT", "GENERATED"])
                .count(),
            },
            "constraints": constraints,
        }

    def _build_qa_trial_and_acceptance_readiness(self):
        trials = self._refit_defects().filter(trial_required=True)
        activities = [
            {
                "dart_number": defect.dart_number or "",
                "equipment": defect.equipment_ems.name if defect.equipment_ems else "",
                "occasion": defect.dart_occasion or "",
                "status": "closed" if defect.is_closed else "pending",
                "planned_date": (
                    defect.rectification_date.isoformat()
                    if defect.rectification_date
                    else None
                ),
            }
            for defect in trials.order_by("rectification_date", "-id")[:10]
        ]
        return {
            "summary": {
                "trial_required": trials.count(),
                "qa_pending": trials.filter(is_closed=False).count(),
                "accepted": trials.filter(is_closed=True).count(),
            },
            "activities": activities,
        }

    def _build_critical_path_risks_and_completion_forecast(self):
        routines = self._refit_routines()
        total = routines.count()
        converted = routines.filter(converted=True).count()
        pending = max(total - converted, 0)
        pace = (
            self._completed_routines()
            .filter(date_of_completion__gte=timezone.localdate() - timedelta(days=30))
            .count()
        )
        forecast_days = round((pending / max(pace, 1)) * 30) if pending else 0
        return {
            "summary": {
                "pending_scope": pending,
                "completion_forecast_days": forecast_days,
                "monthly_completion_pace": pace,
            },
            "risks": [
                {
                    "risk": "Critical open defects",
                    "count": self._critical_open_defects().count(),
                },
                {
                    "risk": "QA pending",
                    "count": self._refit_defects()
                    .filter(
                        trial_required=True,
                        is_closed=False,
                    )
                    .count(),
                },
                {
                    "risk": "DL pending closure",
                    "count": self._dl_entries()
                    .filter(status__in=["DRAFT", "GENERATED"])
                    .count(),
                },
            ],
        }


@tagged_read_only_viewset("Refit")
class RefitRoutineViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RefitRoutineSerializer

    def get_queryset(self):
        queryset = AddRoutineDetails.objects.available_for_refit_conversion(
            self.request.user
        )

        section = self.request.query_params.get("section")
        equipment_id = self.request.query_params.get("equipment_id")
        equipment = self.request.query_params.get("equipment")
        routine_name = self.request.query_params.get("routine_name")
        converted = self.request.query_params.get("converted")

        if section:
            queryset = queryset.filter(equipment_name__section_id=section)
        if equipment_id:
            queryset = queryset.filter(equipment_name_id=equipment_id)
        if equipment:
            queryset = queryset.filter(equipment_name__name__icontains=equipment)
        if routine_name:
            queryset = queryset.filter(routine_name__name__icontains=routine_name)
        if converted is not None:
            normalized = converted.strip().lower()
            if normalized in {"true", "1"}:
                queryset = queryset.filter(converted=True)
            elif normalized in {"false", "0"}:
                queryset = queryset.filter(converted=False)

        return queryset.order_by("equipment_name__name", "routine_name__name")

    def list(self, request, *args, **kwargs):
        from collections import defaultdict

        queryset = self.filter_queryset(self.get_queryset())
        routines = list(queryset)
        routine_ids = [r.id for r in routines]
        routine_name_ids = [r.routine_name_id for r in routines if r.routine_name_id]
        equipment_ids = [r.equipment_name_id for r in routines if r.equipment_name_id]

        maintop_map = {}
        if routine_ids:
            for rd in (
                RoutineDescription.objects.filter(
                    add_routine_details_id__in=routine_ids
                )
                .only("add_routine_details_id", "maintop_no")
                .order_by("id")
            ):
                if rd.add_routine_details_id not in maintop_map:
                    maintop_map[rd.add_routine_details_id] = rd.maintop_no

        counts_map = defaultdict(lambda: {"total": 0, "dyd": 0, "ss": 0})
        if routine_name_ids and equipment_ids:
            counts_qs = (
                RoutineDescription.objects.filter(
                    routine_name_id__in=routine_name_ids,
                    equipment_name_id__in=equipment_ids,
                )
                .values("routine_name_id", "equipment_name_id")
                .annotate(
                    total=Count("id"),
                    dyd=Count("id", filter=Q(by_whom__iexact="DYD")),
                    ss=Count("id", filter=Q(by_whom__iexact="SS")),
                )
            )
            for c in counts_qs:
                counts_map[(c["equipment_name_id"], c["routine_name_id"])] = {
                    "total": c["total"],
                    "dyd": c["dyd"],
                    "ss": c["ss"],
                }

        serializer = self.get_serializer(
            routines,
            many=True,
            context={
                **self.get_serializer_context(),
                "maintop_map": maintop_map,
                "counts_map": counts_map,
            },
        )
        return Response(
            {
                "count": len(routines),
                "results": serializer.data,
            }
        )

    def retrieve(self, request, *args, **kwargs):
        routine = self.get_object()
        planned_description_ids = PlannedRoutineDescription.objects.filter(
            is_deleted=False,
        ).values("routine_description_id")
        spare_usage = RoutineSpareUsage.objects.filter(
            routine_description=OuterRef("pk"),
        )
        descriptions = (
            RoutineDescription.objects.filter(
                equipment_name=routine.equipment_name,
                routine_name=routine.routine_name,
            )
            .exclude(id__in=planned_description_ids)
            .annotate(spare_used=Exists(spare_usage))
            .order_by("routine_no", "id")
        )
        serializer = RefitRoutineDetailSerializer(
            routine,
            context={
                **self.get_serializer_context(),
                "routine_descriptions": descriptions,
            },
        )
        return Response(serializer.data)

    @extend_schema(
        tags=["Refit"],
        request=RefitRoutineConversionSerializer,
        responses=RefitRoutineSerializer,
    )
    @action(detail=True, methods=["post"], url_path="convert")
    def convert(self, request, pk=None):
        serializer = RefitRoutineConversionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            routine = get_object_or_404(
                self.get_queryset().select_for_update(),
                pk=pk,
            )
            old_routine_name = routine.routine_name
            new_routine_name = serializer.validated_data["routine_name"]
            matching_routines = AddRoutineDetails.objects.select_for_update().filter(
                equipment_name=routine.equipment_name,
                routine_name=old_routine_name,
            )
            updated_at = timezone.now()
            matching_routines.update(
                routine_name=new_routine_name,
                routine_category=serializer.validated_data["routine_category"],
                frequency=serializer.validated_data["frequency"],
                converted=True,
                converted_at=updated_at,
            )
            RoutineDescription.objects.filter(
                equipment_name=routine.equipment_name,
                routine_name=old_routine_name,
            ).update(routine_name=new_routine_name)
            routine.refresh_from_db()

        return Response(RefitRoutineSerializer(routine).data)

    @extend_schema(
        tags=["Refit"],
        responses=RefitDashboardSerializer,
    )
    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        queryset = self.get_queryset()
        converted_count = queryset.filter(converted=True).count()
        description_count = RoutineDescription.objects.filter(
            add_routine_details__in=queryset,
        ).count()
        data = {
            "total_refit_routines": queryset.count(),
            "converted_routines": converted_count,
            "pending_conversion": queryset.count() - converted_count,
            "routine_descriptions": description_count,
        }
        return Response(RefitDashboardSerializer(data).data)

    @extend_schema(
        tags=["Refit"],
        responses=RefitRoutineSerializer(many=True),
    )
    @action(detail=False, methods=["get"], url_path="conversion-history")
    def conversion_history(self, request):
        queryset = (
            self.get_queryset()
            .filter(converted=True)
            .order_by(
                "-converted_at",
            )
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @extend_schema(tags=["Refit"])
    @action(detail=False, methods=["get"], url_path="routine-names")
    def routine_names(self, request):
        department = getattr(request.user, "department", None)
        queryset = UniqueRoutineName.objects.filter(
            routinedescription__equipment_name__section__department=department,
        ).distinct()
        return Response(
            [
                {
                    "id": routine_name.id,
                    "name": routine_name.name,
                }
                for routine_name in queryset.order_by("name")
            ]
        )


@extend_schema(tags=["Refit Dashboard"])
class RefitDashboardViewSet(RefitDashboardMixin, viewsets.ViewSet):
    @extend_schema(
        tags=["Refit Dashboard"],
        responses={200: RefitDashboardResponseSerializer},
    )
    def list(self, request):
        cache_key = make_cache_key(
            "refit:dashboard",
            request,
            vary_on_department=True,
        )
        payload = get_or_set_cached_payload(
            cache_key,
            self._build_dashboard_payload,
            timeout=300,
        )
        serializer = RefitDashboardResponseSerializer(payload)
        return Response(serializer.data)

    def _build_dashboard_payload(self):
        return {
            "kpis": self._build_kpis("6m"),
            "summary": self._build_summary(),
            "operational_restoration_and_readiness": (
                self._build_operational_restoration_and_readiness()
            ),
            "department_readiness": self._build_department_readiness(),
            "contextual_search_and_drill_down": (
                self._build_contextual_search_and_drill_down()
            ),
            "defect_list_and_work_execution": (
                self._build_defect_list_and_work_execution()
            ),
            "dependencies_and_external_coordination": (
                self._build_dependencies_and_external_coordination()
            ),
            "qa_trial_and_acceptance_readiness": (
                self._build_qa_trial_and_acceptance_readiness()
            ),
            "critical_path_risks_and_completion_forecast": (
                self._build_critical_path_risks_and_completion_forecast()
            ),
        }

    @extend_schema(
        tags=["Refit Dashboard"],
        parameters=[
            OpenApiParameter(
                name="period",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="KPI trend period: 6m, 1y, or 2y. Defaults to 6m.",
            )
        ],
        responses={200: RefitDashboardKPIResponseSerializer},
    )
    @action(detail=False, methods=["get"], url_path="kpis")
    def kpis(self, request):
        period = self._normalize_period(request.query_params.get("period"))
        cache_key = make_cache_key(
            "refit:dashboard-kpis",
            request,
            extra={"period": period},
            vary_on_department=True,
        )
        payload = get_or_set_cached_payload(
            cache_key,
            lambda: self._build_kpi_payload(period),
            timeout=300,
        )
        serializer = RefitDashboardKPIResponseSerializer(payload)
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

        serializer = RefitDashboardKPIResponseSerializer(
            {
                "kpis": grouped_kpis,
                "periods": periods,
                "default_period": period,
            }
        )
        return Response(serializer.data)
