from rest_framework import serializers
from drf_spectacular.utils import extend_schema_serializer

from op_maintenance.models import InitiateDart
from sfd.models import ShipEquipment
from accounts import rbac

from . import models


class _StampedCustomUserMixin:
    """`custom_user` is the record owner, stamped from the acting user's own
    profile on create. A privileged caller (`rbac.can_see_all_departments`)
    may still pass an explicit `custom_user` to create/edit on someone
    else's behalf, validated to be a real profile; a non-privileged
    caller's forged `custom_user` is rejected rather than silently
    overwritten, so it fails loudly instead of quietly succeeding with a
    different owner substituted in. `request` is `None` for the Excel
    bulk-import path (`swmm/excel_background.py`), which has no
    authenticated user to stamp from — both hooks below no-op in that case,
    leaving `custom_user` however the row itself set it (nullable)."""

    def validate_custom_user(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if request is not None and not rbac.can_see_all_departments(user):
            own_profile = getattr(user, "user_profile", None)
            if own_profile is None or value.pk != own_profile.pk:
                raise serializers.ValidationError(
                    "You may not set custom_user to another user's profile."
                )
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        if request is not None and "custom_user" not in validated_data:
            profile = getattr(request.user, "user_profile", None)
            if profile is not None:
                validated_data["custom_user"] = profile
        return super().create(validated_data)


class MOItemEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MOItemEquipment
        fields = (
            "id",
            "itemcode",
            "eask_item_code",
            "eask_type",
            "qty_constituent",
            "qty_range_scale",
            "eask_book_ref",
            "datetime_approved",
            "approved_by",
            "datetime_closed",
            "closed_by",
            "trigger_remarks",
            "user_remarks",
            "eask_serial",
        )


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Item
        fields = (
            "item_code",
            "item_desc",
            "item_deno",
            "crp_category",
            "inventory_holder",
            "obsolescence",
            "obsolete",
            "oem_name",
            "oem_vendor_code",
            "datetime_approved",
            "approved_by",
            "incat_yn",
        )


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Vendor
        fields = (
            "vendor_code",
            "name",
            "vendor_class",
            "manufacturer_priority",
            "addressee",
            "address_line1",
            "address_line2",
            "address_line3",
            "city",
            "state",
            "pin_code",
            "country_code",
            "datetime_approved",
            "approved_by",
            "date_banned_upto",
            "section_head",
            "kompass_control_no",
            "remarks",
            "station_code",
            "ncage",
            "gem_seller_id",
            "business_id",
            "def_proc_id",
            "msme_registration_no",
            "gst_no",
            "pan",
        )


class MoMappingTableSerializer(serializers.ModelSerializer):
    ilms_spare_id = serializers.PrimaryKeyRelatedField(
        queryset=models.Item.objects.all()
    )
    vendor_id = serializers.PrimaryKeyRelatedField(queryset=models.Vendor.objects.all())
    equipment = serializers.PrimaryKeyRelatedField(
        queryset=models.MoMappingTable._meta.get_field(
            "equipment"
        ).remote_field.model.objects.all()
    )

    class Meta:
        model = models.MoMappingTable
        fields = ("id", "ilms_spare_id", "vendor_id", "equipment")


class MOPlannedSparesDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MOPlannedSparesDescription
        fields = ("id", "item_id", "routine_description_id", "is_deleted")


class PlannedMOSpareListSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PlannedMOSpareList
        fields = (
            "id",
            "pattern_number",
            "planned_spares_description",
            "quantity_required",
            "is_deleted",
        )


class SurveyDetailsSerializer(_StampedCustomUserMixin, serializers.ModelSerializer):
    class Meta:
        model = models.SurveyDetails
        fields = (
            "id",
            "custom_user",
            "vendor_id",
            "ilms_spare_id",
            "obs_spare_id",
            "mo_routine_plan",
            "mo_dart",
            "demand_number",
            "survey_cart_no",
            "in_progress_status",
            "is_survey",
            "is_sync",
            "is_hod",
            "is_hod_approval",
            "mo_survey_status",
        )
        extra_kwargs = {"custom_user": {"required": False}}


class PTSDetailsSerializer(_StampedCustomUserMixin, serializers.ModelSerializer):
    class Meta:
        model = models.PTSDetails
        fields = (
            "id",
            "custom_user",
            "vendor_id",
            "ilms_spare_id",
            "obs_spare_id",
            "mo_routine_plan",
            "mo_dart",
            "in_progress_status",
            "pts_number",
            "pts_cart_no",
            "is_pts",
            "is_sync",
            "is_hod",
            "is_hod_approval",
            "mo_pts_status",
        )
        extra_kwargs = {"custom_user": {"required": False}}


@extend_schema_serializer(component_name="IlmsDemandDetails")
class DemandDetailsSerializer(_StampedCustomUserMixin, serializers.ModelSerializer):
    class Meta:
        model = models.DemandDetails
        fields = (
            "id",
            "custom_user",
            "vendor_id",
            "ilms_spare_id",
            "obs_spare_id",
            "mo_routine_plan",
            "mo_dart",
            "in_progress_status",
            "demand_number",
            "demand_cart_no",
            "is_demand",
            "is_sync",
            "is_hod",
            "is_hod_approval",
            "mo_status",
        )
        extra_kwargs = {"custom_user": {"required": False}}


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Customer
        fields = (
            "customer_code",
            "name",
            "customer_type",
            "mother_depot",
            "addressee",
            "address_line1",
            "address_line2",
            "address_line3",
            "city",
            "state",
            "pin_code",
            "allowance_annual_rs",
            "date_introduced",
            "date_closed",
            "remarks",
            "admin_authority",
            "station_code",
            "added_by",
            "closed_by",
        )


class ItemLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ItemLine
        fields = (
            "item_code",
            "station_code",
            "sh_no",
            "qty_war_reserve",
            "qty_msl",
            "qty_usl",
            "qty_acl",
            "days_lt_proc",
            "datetime_added",
            "datetime_closed",
            "item_line_serial",
        )
        read_only_fields = ("item_line_serial",)


class CustomerEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.CustomerEquipment
        fields = (
            "id",
            "customer",
            "equipment",
            "qty_ship_fit",
            "qty_present",
            "date_quantity_present",
            "added_by",
            "datetime_added",
            "approved_by",
            "datetime_approved",
            "closed_by",
            "datetime_closed",
        )


class CustomerEquipmentLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.CustomerEquipmentLine
        fields = (
            "customer_eqpt_line_ser",
            "customer",
            "equipment",
            "eqpt_serial_number",
            "position_specific_yn",
            "fitment_port_stbd",
            "rotation_rl",
            "eqpt_nomenclature",
            "generic_code",
            "eqpt_type",
            "manufacturer_name",
            "supplier_name",
            "parent_eqpt",
            "location_code",
            "location_onboard",
            "location_fit",
            "remarks",
            "added_by",
            "datetime_added",
            "closed_by",
            "datetime_closed",
        )
        read_only_fields = ("customer_eqpt_line_ser",)


class PriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Price
        fields = (
            "id",
            "item",
            "price_type",
            "price_date",
            "price_ref",
            "price_cc",
            "currency_code",
            "vendor",
            "qty",
            "datetime_approved",
            "approved_by",
            "station_code",
        )


class ItemIssuedSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ItemIssued
        fields = (
            "id",
            "customer",
            "demand_no",
            "item",
            "sh_no",
            "qty",
            "price_rs",
            "datetime_obd",
            "issue_datetime",
            "issued_by",
            "station_code",
            "issued_type",
        )


class IssuedDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.IssuedDetails
        fields = (
            "id",
            "abc_ved_year",
            "station_code",
            "item",
            "no_of_issues",
            "qty_issued",
            "issued_cost",
        )


class ItemVendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ItemVendor
        fields = (
            "item",
            "vendor",
            "active_yn",
            "rating",
            "certification_no",
            "certification_type",
            "pac_ref",
            "date_pac",
            "datetime_approved",
            "approved_by",
            "remarks",
            "datetime_till",
            "closed_by",
            "station_code",
            "datetime_closed",
            "item_vendor_serial_no",
        )
        read_only_fields = ("item_vendor_serial_no",)


class ItemExtraSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ItemExtra
        fields = (
            "item_code",
            "item_desc",
            "equipment_name",
            "category",
            "critical",
            "item_deno",
            "ved_category",
            "abc_category",
            "crp_category",
            "datetime_approved",
            "approved_by",
            "remarks",
            "image",
        )


class VendorListSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.VendorList
        fields = (
            "id",
            "vendorcode",
            "name",
            "class_field",
            "manufacturerpriority",
            "addressee",
            "addressline1",
            "addressline2",
            "addressline3",
            "city",
            "state",
            "pincode",
            "countrycode",
            "datetimeapproved",
            "approvedby",
            "datebannedupto",
            "sectionhead",
            "kompasscontrolno",
            "remarks",
            "stationcode",
            "ncage",
            "gemsellerid",
            "businesstype",
            "defprocid",
            "msmeregistrationno",
            "gstno",
            "pan",
        )


class VendorPilSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.VendorPil
        fields = (
            "id",
            "eqpt_code",
            "eqpt_desc",
            "oem_name",
            "vendor_name",
            "vendor_code",
            "characteristics_name",
            "char_value",
            "item_code",
            "item_desc",
            "substitute_item_code",
            "substitute_type",
            "eask_type",
            "country_of_origin",
            "currency_code",
            "ved_cat",
            "make_model",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")


class DartMOSpareSerializer(serializers.ModelSerializer):
    equipment_id = serializers.PrimaryKeyRelatedField(
        allow_null=True,
        queryset=ShipEquipment.objects.all(),
        required=False,
    )
    dart_id = serializers.PrimaryKeyRelatedField(
        allow_null=True,
        queryset=InitiateDart.objects.all(),
        required=False,
    )
    quantity = serializers.IntegerField(max_value=9999, min_value=1)

    class Meta:
        model = models.DartMOSpare
        fields = (
            "id",
            "issue_obj",
            "equipment_id",
            "dart_id",
            "mo_spare",
            "pattern",
            "description",
            "quantity",
            "created_date",
            "modified_date",
            "is_delete",
        )
        read_only_fields = ("created_date", "modified_date")


class IIFSerializer(_StampedCustomUserMixin, serializers.ModelSerializer):
    class Meta:
        model = models.IIF
        fields = (
            "id",
            "custom_user",
            "spare_id",
            "mo_item_id",
            "vendor_id",
            "eqpt_id",
            "swmm_iifno",
            "in_progress_status",
            "phone_number",
            "addressee",
            "state",
            "email_id",
            "pan_number",
            "gst_number",
            "fax",
            "NCAGE_code",
            "year_introduced",
            "function_anticipated",
            "ACL_anticipated",
            "NSN_inventory_type",
            "classification_of_item",
            "shelf_life",
            "price_ref",
            "price_date",
            "currency_code",
            "price_cc",
            "qty",
            "eask_book_ref",
            "qty_war_reserve",
            "qty_constituent",
            "qty_range_scale",
            "qty_ship_fit",
            "qty_present",
            "immediate_usage",
            "end_usage",
            "olditem_code",
            "is_sync",
            "is_hod",
            "is_hod_approval",
            "mo_status",
            "is_delete",
        )
        extra_kwargs = {"custom_user": {"required": False}}


class ReceiveDetailsSerializer(serializers.ModelSerializer):
    demand_details = serializers.PrimaryKeyRelatedField(
        allow_null=True,
        queryset=models.DemandDetails.objects.all(),
        required=False,
    )
    pts_details = serializers.PrimaryKeyRelatedField(
        allow_null=True,
        queryset=models.PTSDetails.objects.all(),
        required=False,
    )
    survey_details = serializers.PrimaryKeyRelatedField(
        allow_null=True,
        queryset=models.SurveyDetails.objects.all(),
        required=False,
    )
    demand_quantity = serializers.IntegerField(
        max_value=999999,
        min_value=0,
        required=False,
    )

    class Meta:
        model = models.ReceiveDetails
        fields = (
            "id",
            "demand_details",
            "pts_details",
            "survey_details",
            "demand_number",
            "demand_date",
            "demand_quantity",
            "original_demand_qty",
            "demand_status",
            "swmm_demandno",
            "dart_no",
            "gate_pass_no",
            "gate_pass_date",
            "received_qty",
            "received_date",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")


class AddToWorkflowCartSerializer(serializers.Serializer):
    SOURCE_CHOICES = (
        ("planned", "Planned MO spare"),
        ("dart", "DART MO spare"),
        ("obs", "Onboard spare"),
    )

    source = serializers.ChoiceField(choices=SOURCE_CHOICES)
    source_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )

    class Meta:
        ref_name = "ILMSAddToWorkflowCart"


class AddToIIFCartSerializer(serializers.Serializer):
    spare_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )

    class Meta:
        ref_name = "ILMSAddToIIFCart"
