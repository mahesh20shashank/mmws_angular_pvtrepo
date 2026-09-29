from dateutil.relativedelta import relativedelta
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from ems.models import (
    AddRoutineDetails,
    RoutineDescription,
    UniqueRoutineName,
)
from obs.models import RoutineSpareUsage


class RefitRoutineDescriptionSerializer(serializers.ModelSerializer):
    spare_used = serializers.SerializerMethodField()

    class Meta:
        model = RoutineDescription
        fields = (
            "id",
            "maintop_no",
            "dart_number",
            "routine_no",
            "routine_description",
            "by_whom",
            "spare_used",
        )

    def get_spare_used(self, instance):
        annotated_value = getattr(instance, "spare_used", None)
        if annotated_value is not None:
            return annotated_value
        return RoutineSpareUsage.objects.filter(
            routine_description=instance,
        ).exists()


class RefitRoutineSerializer(serializers.ModelSerializer):
    equipment_name = serializers.CharField(source="equipment_name.name")
    section = serializers.CharField(source="equipment_name.section.name")
    department = serializers.CharField(
        source="equipment_name.section.department.name",
    )
    routine_name = serializers.CharField(source="routine_name.name")
    next_due_date = serializers.SerializerMethodField()
    next_due_running_hours = serializers.SerializerMethodField()
    available_running_hours = serializers.SerializerMethodField()
    routine_counts = serializers.SerializerMethodField()

    maintop_no = serializers.SerializerMethodField()
    running_hrs_updated_tilldate = serializers.SerializerMethodField()
    total_running_hrs = serializers.SerializerMethodField()
    total_routines = serializers.SerializerMethodField()
    dyd_routines = serializers.SerializerMethodField()
    ss_routines = serializers.SerializerMethodField()

    pk = serializers.IntegerField(source="id", read_only=True)
    date = serializers.SerializerMethodField()
    last_routine_date = serializers.SerializerMethodField()
    last_routine_running_hrs = serializers.FloatField(
        source="last_routine_completion_atrunning_hrs",
        allow_null=True,
        read_only=True,
    )
    next_due_running_hrs = serializers.SerializerMethodField()
    running_hrs_available = serializers.SerializerMethodField()

    class Meta:
        model = AddRoutineDetails
        fields = (
            "id",
            "pk",
            "equipment_name",
            "section",
            "department",
            "routine_name",
            "routine_category",
            "frequency",
            "frequency_in_months",
            "frequency_in_hours",
            "last_routine_completion_date",
            "last_routine_completion_atrunning_hrs",
            "next_due_date",
            "next_due_running_hours",
            "available_running_hours",
            "remarks",
            "converted",
            "converted_at",
            "routine_counts",
            "maintop_no",
            "running_hrs_updated_tilldate",
            "total_running_hrs",
            "total_routines",
            "dyd_routines",
            "ss_routines",
            "date",
            "last_routine_date",
            "last_routine_running_hrs",
            "next_due_running_hrs",
            "running_hrs_available",
        )

    @extend_schema_field(serializers.DateField(allow_null=True))
    def get_running_hrs_updated_tilldate(self, instance):
        if not instance.equipment_name or not getattr(
            instance.equipment_name, "rhsi_updated_until", None
        ):
            return None
        val = instance.equipment_name.rhsi_updated_until
        return val.date() if hasattr(val, "date") else val

    @extend_schema_field(serializers.DateField(allow_null=True))
    def get_last_routine_date(self, instance):
        if not instance.last_routine_completion_date:
            return None
        val = instance.last_routine_completion_date
        return val.date() if hasattr(val, "date") else val

    @extend_schema_field(serializers.DateField(allow_null=True))
    def get_next_due_date(self, instance):
        if (
            instance.routine_category not in {"CALENDAR BASED", "ALTERNATE PERIODIC"}
            or not instance.last_routine_completion_date
            or not instance.frequency_in_months
        ):
            return None
        return (
            instance.last_routine_completion_date
            + relativedelta(months=instance.frequency_in_months)
        ).date()

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_next_due_running_hours(self, instance):
        if instance.routine_category not in {
            "RUNNING HOUR BASED",
            "ALTERNATE PERIODIC",
        }:
            return None
        last_running_hours = instance.last_routine_completion_atrunning_hrs
        frequency = instance.frequency_in_hours
        if last_running_hours is None or not frequency:
            return None
        return round(last_running_hours + frequency, 2)

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_available_running_hours(self, instance):
        next_due = self.get_next_due_running_hours(instance)
        current_running_hours = self._current_running_hours(instance)
        if next_due is None or current_running_hours is None:
            return None
        return round(next_due - current_running_hours, 2)

    @extend_schema_field(
        serializers.DictField(child=serializers.IntegerField()),
    )
    def get_routine_counts(self, instance):
        counts_map = self.context.get("counts_map")
        if counts_map is not None:
            return counts_map.get(
                (instance.equipment_name_id, instance.routine_name_id),
                {"total": 0, "dyd": 0, "ss": 0},
            )
        return self._get_counts(instance)

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_maintop_no(self, instance):
        maintop_map = self.context.get("maintop_map")
        if maintop_map is not None:
            return maintop_map.get(instance.id)
        first_desc = RoutineDescription.objects.filter(
            add_routine_details=instance,
        ).first()
        return first_desc.maintop_no if first_desc else None

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_total_running_hrs(self, instance):
        current_hrs = self._current_running_hours(instance)
        return round(current_hrs, 2) if current_hrs is not None else None

    @extend_schema_field(serializers.IntegerField())
    def get_total_routines(self, instance):
        return self._get_counts(instance)["total"]

    @extend_schema_field(serializers.IntegerField())
    def get_dyd_routines(self, instance):
        return self._get_counts(instance)["dyd"]

    @extend_schema_field(serializers.IntegerField())
    def get_ss_routines(self, instance):
        return self._get_counts(instance)["ss"]

    def _get_counts(self, instance):
        counts_map = self.context.get("counts_map")
        if counts_map is not None:
            return counts_map.get(
                (instance.equipment_name_id, instance.routine_name_id),
                {"total": 0, "dyd": 0, "ss": 0},
            )
        if not hasattr(self, "_cached_counts"):
            self._cached_counts = {}
        cache_key = (instance.equipment_name_id, instance.routine_name_id)
        if cache_key not in self._cached_counts:
            descriptions = RoutineDescription.objects.filter(
                equipment_name=instance.equipment_name,
                routine_name=instance.routine_name,
            )
            self._cached_counts[cache_key] = {
                "total": descriptions.count(),
                "dyd": descriptions.filter(by_whom__iexact="DYD").count(),
                "ss": descriptions.filter(by_whom__iexact="SS").count(),
            }
        return self._cached_counts[cache_key]

    @extend_schema_field(serializers.DateField(allow_null=True))
    def get_date(self, instance):
        return self.get_next_due_date(instance)

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_next_due_running_hrs(self, instance):
        return self.get_next_due_running_hours(instance)

    @extend_schema_field(serializers.FloatField(allow_null=True))
    def get_running_hrs_available(self, instance):
        return self.get_available_running_hours(instance)

    @staticmethod
    def _current_running_hours(instance):
        equipment = instance.equipment_name
        running_hours = equipment.rhsi
        if (
            equipment.state == "ACTIVE"
            and equipment.start_timedate
            and running_hours is not None
        ):
            started_at = equipment.start_timedate
            if timezone.is_naive(started_at):
                started_at = timezone.make_aware(started_at)
            elapsed_hours = (timezone.now() - started_at).total_seconds() / 3600
            return running_hours + elapsed_hours
        return running_hours


class RefitRoutineDetailSerializer(RefitRoutineSerializer):
    routine_descriptions = serializers.SerializerMethodField()

    class Meta(RefitRoutineSerializer.Meta):
        fields = RefitRoutineSerializer.Meta.fields + ("routine_descriptions",)

    def get_routine_descriptions(self, instance):
        descriptions = self.context.get("routine_descriptions")
        if descriptions is None:
            descriptions = RoutineDescription.objects.filter(
                add_routine_details=instance,
            )
        return RefitRoutineDescriptionSerializer(descriptions, many=True).data


class RefitRoutineConversionSerializer(serializers.Serializer):
    routine_name = serializers.PrimaryKeyRelatedField(
        queryset=UniqueRoutineName.objects.all(),
    )
    routine_category = serializers.ChoiceField(
        choices=AddRoutineDetails.routine_category_choices,
    )
    frequency = serializers.CharField(max_length=100)

    def validate_frequency(self, value):
        frequency = value.strip().upper()
        if not frequency:
            raise serializers.ValidationError("Frequency is required.")
        return frequency


class RefitDashboardSerializer(serializers.Serializer):
    total_refit_routines = serializers.IntegerField()
    converted_routines = serializers.IntegerField()
    pending_conversion = serializers.IntegerField()
    routine_descriptions = serializers.IntegerField()


class RefitDashboardKPIResponseSerializer(serializers.Serializer):
    kpis = serializers.ListField(child=serializers.DictField())
    periods = serializers.ListField(child=serializers.CharField(), required=False)
    default_period = serializers.CharField(required=False)


class RefitDashboardResponseSerializer(serializers.Serializer):
    kpis = serializers.ListField(child=serializers.DictField())
    summary = serializers.DictField()
    operational_restoration_and_readiness = serializers.DictField()
    department_readiness = serializers.DictField()
    contextual_search_and_drill_down = serializers.DictField()
    defect_list_and_work_execution = serializers.DictField()
    dependencies_and_external_coordination = serializers.DictField()
    qa_trial_and_acceptance_readiness = serializers.DictField()
    critical_path_risks_and_completion_forecast = serializers.DictField()
