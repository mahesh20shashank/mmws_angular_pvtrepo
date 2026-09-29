from rest_framework import serializers
from .models import DLTracker, DLClose


class DLTrackingSerializer(serializers.ModelSerializer):
    sub_department = serializers.CharField(source="sub_dept_id.name", default="-")
    current_status_updated_on = serializers.SerializerMethodField()

    class Meta:
        model = DLTracker
        fields = (
            "id",
            "sub_department",
            "dl_type",
            "dart_no",
            "equip_name",
            "defect_no",
            "defect_description",
            "ship_remarks",
            "yard_remarks",
            "final_prm",
            "c_no",
            "wi_generation_status",
            "qc_clearance",
            "wi_closing_status",
            "wi_generated_by_yard",
            "dl_importance",
            "weekly_status",
            "current_status_updated_on",
            "status",
        )

    def get_current_status_updated_on(self, obj):
        if obj.current_status_updated_on:
            return obj.current_status_updated_on.strftime("%d-%m-%Y %H:%M")
        return "-"


class DLHistorySerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="dl_tracker.id")
    equip_name = serializers.CharField(source="dl_tracker.equip_name")
    sub_department = serializers.SerializerMethodField()
    dl_type = serializers.CharField(source="dl_tracker.dl_type")
    dart_no = serializers.CharField(source="dl_tracker.dart_no")
    defect_no = serializers.CharField(source="dl_tracker.defect_no")
    defect_description = serializers.CharField(source="dl_tracker.defect_description")
    ship_remarks = serializers.CharField(source="dl_tracker.ship_remarks")
    yard_remarks = serializers.CharField(source="dl_tracker.yard_remarks")
    status = serializers.SerializerMethodField()
    critical = serializers.SerializerMethodField()
    er_date_by_yard = serializers.SerializerMethodField()
    start_work_by_yard = serializers.SerializerMethodField()
    complete_work_by_yard = serializers.SerializerMethodField()

    class Meta:
        model = DLClose
        fields = [
            "id",
            "equip_name",
            "sub_department",
            "dl_type",
            "dart_no",
            "defect_no",
            "defect_description",
            "ship_remarks",
            "yard_remarks",
            "status",
            "critical",
            "er_date_by_yard",
            "start_work_by_yard",
            "complete_work_by_yard",
            "dl_work",
        ]

    def get_sub_department(self, obj):
        return obj.dl_tracker.sub_dept_id.name if obj.dl_tracker.sub_dept_id else "-"

    def get_status(self, obj):
        return obj.dl_tracker.status if obj.dl_tracker.status else "Pending"

    def get_critical(self, obj):
        return "Yes" if obj.dl_tracker.critical else "No"

    def get_er_date_by_yard(self, obj):
        return obj.er_date_by_yard.strftime("%d-%m-%Y") if obj.er_date_by_yard else "-"

    def get_start_work_by_yard(self, obj):
        return (
            obj.start_work_by_yard.strftime("%d-%m-%Y")
            if obj.start_work_by_yard
            else "-"
        )

    def get_complete_work_by_yard(self, obj):
        return (
            obj.complete_work_by_yard.strftime("%d-%m-%Y")
            if obj.complete_work_by_yard
            else "-"
        )
