from rest_framework import serializers

from .models import (
    CoMessage,
    Department,
    HierarchyForChart,
    MemberDetail,
    OrderDuty,
    Quote,
    Ship,
    ShipRole,
    ShipRoleImage,
    SubDepartment,
    UpdateEntry,
)


class UpdateEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = UpdateEntry
        fields = (
            "id",
            "uploaded_date",
            "from_date",
            "to_date",
            "update_text",
            "event_file",
        )
        read_only_fields = ("uploaded_date",)


class ShipRoleImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipRoleImage
        fields = (
            "id",
            "image",
        )


class ShipRoleSerializer(serializers.ModelSerializer):
    images = ShipRoleImageSerializer(many=True, read_only=True)

    class Meta:
        model = ShipRole
        fields = (
            "id",
            "role_title",
            "current_text",
            "uploaded_date",
            "images",
        )
        read_only_fields = ("uploaded_date",)


class MemberDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemberDetail
        fields = (
            "id",
            "name",
            "designation",
            "rank",
            "image_path",
            "uploaded_date",
            "date_joining",
        )
        read_only_fields = ("uploaded_date",)


class OrderDutySerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderDuty
        fields = (
            "id",
            "filename",
            "uploaded_at",
            "source",
            "pdf_path",
            "roster_name",
            "from_date",
            "to_date",
            "description",
            "date",
            "officer_details",
            "routine_details",
            "batch_id",
            "allocation_type",
        )
        read_only_fields = ("uploaded_at",)


class QuoteSerializer(serializers.ModelSerializer):
    quoteText = serializers.CharField(source="quote_text", read_only=True)
    addedDate = serializers.DateTimeField(
        source="uploaded_date",
        format="%Y-%m-%d",
        read_only=True,
    )

    class Meta:
        model = Quote
        fields = (
            "id",
            "quote_text",
            "quoteText",
            "uploaded_date",
            "addedDate",
            # "is_active",
            "active",
            "is_displayed",
            "last_displayed_date",
        )
        read_only_fields = (
            "uploaded_date",
            "addedDate",
        )


class CoMessageSerializer(serializers.ModelSerializer):
    uploaded_date = serializers.DateTimeField(format="%Y-%m-%d", read_only=True)

    class Meta:
        model = CoMessage
        fields = (
            "id",
            "message",
            "valid_till_date",
            "uploaded_date",
        )
        read_only_fields = ("uploaded_date",)


class HierarchyForChartSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(
        source="user.firstname",
        read_only=True,
        default="",
    )
    last_name = serializers.CharField(
        source="user.lastname",
        read_only=True,
        default="",
    )
    designation = serializers.CharField(
        source="user.designation",
        read_only=True,
    )
    personnel_number = serializers.CharField(
        source="user.personal_number",
        read_only=True,
        default="",
    )
    name = serializers.ReadOnlyField()
    rank = serializers.CharField(read_only=True)

    class Meta:
        model = HierarchyForChart
        fields = (
            "id",
            "node_type",
            "division_name",
            "user",
            "photo",
            "is_regulator",
            "parent",
            "is_commander_officer",
            "date",
            "assigned_regulator",
            # User details
            "name",
            "first_name",
            "last_name",
            "designation",
            "personnel_number",
            "rank",
        )


class ShipKnowYourShipSerializer(serializers.ModelSerializer):
    ship_category = serializers.CharField(
        source="ship_category_string",
        read_only=True,
    )
    class_name = serializers.CharField(
        source="class_master_string",
        read_only=True,
    )
    command_name = serializers.CharField(
        source="command_string",
        read_only=True,
    )
    authority_name = serializers.CharField(
        source="authority_string",
        read_only=True,
    )
    propulsion_name = serializers.CharField(
        source="propulsion_string",
        read_only=True,
    )

    ship_image = serializers.SerializerMethodField()
    specifications = serializers.SerializerMethodField()

    class Meta:
        model = Ship
        exclude = (
            "universal_id_m_ship",
            "universal_id_m_ship_category",
            "universal_id_m_ship_class",
            "universal_id_m_command",
            "universal_id_m_ops_authority",
            "universal_id_m_propulsion",
            "universal_id_a_user_created_by",
            "universal_id_a_user_updated_by",
            "universal_id_m_overseeing_team",
            "universal_id_m_ship_unit_category",
        )

    def get_ship_image(self, obj) -> str | None:
        request = self.context.get("request")

        if not obj.ship_image:
            return None

        return request.build_absolute_uri(obj.ship_image.url)

    def get_specifications(self, obj) -> list[dict]:
        """The six Know Your Ship cards, in display order.

        Nothing here is hard-coded or entered by hand. The ship itself is whichever one
        Step 0 selected (`ActiveShipConfig`, resolved by the view through
        `get_this_ship()`), and every value below is written by the Step 1 CMMS pull
        (`swmmapi.views.CMMSFDDataAPI`) except the crew count, which is counted off the
        ship's own user records.

        Source per card:

        * Ship Class  -- `M_ShipClass`, reached through `M_Ship.ClassID`. Step 1 upserts
          that row into `MShipClass` (description + code) and points `Ship.class_master`
          at it.
        * Ship Authority -- `M_OpsAuthority`, through `M_Ship.AuthorityID`.
        * Ship Length / Top Speed -- `M_Ship.LengthOverall` / `M_Ship.MaxContSpeed`.
        * Displacement -- `M_Ship.Displacement`, falling back to `M_Ship.StandardDisp`.
        * Crew Capacity -- live count of `CustomUserProfile` rows posted to this ship.

        The FK is read *before* the denormalised `*_string` column on purpose: Step 1
        writes the FKs and never writes those string columns, so reading the string
        first meant a freshly synced ship showed blank cards. The string columns stay as
        a fallback for rows that predate the CMMS sync.

        Ship Type is deliberately not a card: its only source is CMMS's own category
        label (`MShipCategory.ship_category_name`), which is a classification bucket
        like "SMALL FRONTLINE/LANDING SHIPS(TONNAGE <=1000T)" rather than a ship type,
        and it is far too long to sit in a tile this size. It is still on the payload as
        the `ship_category` field for anything that wants it.
        """
        # Local import: accounts.models imports master.models for its `ship` FK, so a
        # module-level import here would be circular.
        from accounts.models import CustomUserProfile

        def first_filled(*candidates):
            for candidate in candidates:
                text = str(candidate).strip() if candidate is not None else ""
                if text:
                    return text
            return None

        def with_unit(value, unit):
            return f"{value} {unit}" if value else None

        ship_class = first_filled(
            obj.class_master.description if obj.class_master else None,
            obj.class_master.class_code if obj.class_master else None,
            obj.class_master_string,
        )
        authority = first_filled(
            obj.authority.ops_authority if obj.authority else None,
            obj.authority_string,
        )

        # Borne strength, not a sanctioned figure -- CMMS holds no complement column, so
        # the crew posted to this ship is the only real source. `user_active` is the
        # posting flag and `active` the soft-delete flag; a filled `ship_leaving_date`
        # means the person has already left, so they no longer count.
        crew_count = (
            CustomUserProfile.objects.filter(
                ship=obj,
                active=True,
                user_active=True,
                ship_leaving_date__isnull=True,
            ).count()
            if obj.pk
            else 0
        )

        cards = [
            {
                "label": "Ship Class",
                "value": ship_class,
                "icon": "Shield",
                "theme": "blue",
            },
            {
                "label": "Ship Authority",
                "value": authority,
                "icon": "Anchor",
                "theme": "purple",
            },
            {
                "label": "Crew Capacity",
                "value": with_unit(crew_count or None, "Personnel"),
                "icon": "Users",
                "theme": "cyan",
            },
            {
                "label": "Ship Length",
                "value": with_unit(first_filled(obj.length_overall), "Meters"),
                "icon": "Ruler",
                "theme": "amber",
            },
            {
                "label": "Top Speed",
                "value": with_unit(first_filled(obj.max_cont_speed), "Knots"),
                "icon": "Gauge",
                "theme": "teal",
            },
            {
                "label": "Displacement",
                # M_Ship.Displacement, with M_Ship.StandardDisp as the fallback -- CMMS
                # fills one or the other depending on the hull, and they are the same
                # measurement in tonnes.
                "value": with_unit(
                    first_filled(obj.displacement, obj.standard_disp), "Tonnes"
                ),
                "icon": "Weight",
                "theme": "pink",
            },
        ]

        for card in cards:
            if not card["value"]:
                card["value"] = "—"
        return cards


# ─────────────────────────────────────────────────────────────
# CMMS Refit Integration Serializers
# ─────────────────────────────────────────────────────────────


class GenericSuccessResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    message = serializers.CharField()
    data = serializers.JSONField(required=False, default=None, allow_null=True)


class MaintenanceNomenclatureSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    type = serializers.ChoiceField(choices=("OPERATIONAL", "REFIT"))
    name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    maintenance_period = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    occasion = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)


class MaintenanceNomenclatureResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    maint_nomenclature = MaintenanceNomenclatureSerializer(many=True)


class MaintenanceNomenclatureDeleteSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    type = serializers.ChoiceField(choices=("OPERATIONAL", "REFIT"))


class RefitCompletionCreateSerializer(serializers.Serializer):
    ship_code = serializers.CharField(required=True)
    refit_type = serializers.CharField(required=True)
    planned_start_date = serializers.DateField(required=True)
    planned_end_date = serializers.DateField(required=True)
    actual_start_date = serializers.DateField(required=False, allow_null=True)
    actual_end_date = serializers.DateField(required=False, allow_null=True)
    refit_place = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    universal_id_m_command = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )


class RefitCompletionResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    Universal_ID_T_RefComp = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )


class RefitDelinquencyCreateSerializer(serializers.Serializer):
    delinquency_code = serializers.CharField(required=True)
    description = serializers.CharField(required=True)
    days_delayed = serializers.IntegerField(required=True)
    remarks = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class RefitDryDockingCreateSerializer(serializers.Serializer):
    dock_entry_date = serializers.DateField(required=True)
    dock_undock_date = serializers.DateField(required=True)
    yard_dock_name = serializers.CharField(required=True)
    hull_inspection_status = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )


class RefitOCRCreateSerializer(serializers.Serializer):
    report_ref_no = serializers.CharField(required=True)
    clearance_status = serializers.CharField(required=True)
    trial_outcome = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    report_date = serializers.DateField(required=True)


class RefitSyncPayloadResponseSerializer(serializers.Serializer):
    M_Delinquery = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    T_RefComDelinquery_Detail = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_Refit = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    T_DryDocking = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_OCR = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    T_Refcomp = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )


class SubDepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubDepartment
        fields = (
            "id",
            "name",
            "code",
            "description",
            "active",
            "equipment_count",
        )


class DepartmentSerializer(serializers.ModelSerializer):
    subdepartments = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = (
            "id",
            "name",
            "code",
            "dep_code",
            "subdepartments",
        )

    def get_subdepartments(self, obj):
        subdepartments = SubDepartment.objects.filter(department_name=obj)
        return SubDepartmentSerializer(subdepartments, many=True).data


class CreateRegulatorSerializer(serializers.Serializer):
    firstname = serializers.CharField(required=True, allow_blank=False, max_length=255)
    lastname = serializers.CharField(required=False, allow_blank=True, default="")
    designation = serializers.CharField(required=False, allow_blank=True, default="")
    personal_number = serializers.CharField(
        required=False, allow_blank=True, max_length=15
    )
    department_id = serializers.IntegerField(required=False, allow_null=True)
    executive_sub_department = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    rank_id = serializers.IntegerField(
        required=False,
        allow_null=True
    )

class UpdateRegulatorProfileSerializer(serializers.Serializer):
    node_db_id = serializers.IntegerField(required=True)

    rank_id = serializers.IntegerField(
        required=False,
        allow_null=True
    )

    personal_number = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=15
    )

    firstname = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255
    )

    lastname = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255
    )

    designation = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255
    )

    department_id = serializers.IntegerField(
        required=False,
        allow_null=True
    )

    executive_sub_department = serializers.CharField(
        required=False,
        allow_blank=True
    )

class UpdateRegulatorPhotoSerializer(serializers.Serializer):
    node_db_id = serializers.IntegerField(required=True)
    photo = serializers.FileField(required=False, allow_null=True)
    remove_photo = serializers.BooleanField(
        required=False,
        default=False
    )

class UpdateRegulatorProfileSerializer(serializers.Serializer):
    node_db_id = serializers.IntegerField(required=True)
    rank_id = serializers.IntegerField(required=False, allow_null=True)
    personal_number = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=15
    )
    firstname = serializers.CharField(required=False, allow_blank=True)
    lastname = serializers.CharField(required=False, allow_blank=True)
    designation = serializers.CharField(required=False, allow_blank=True)
    department_id = serializers.IntegerField(
        required=False,
        allow_null=True
    )
    executive_sub_department = serializers.CharField(
        required=False,
        allow_blank=True
    )

class DeleteRegulatorSerializer(serializers.Serializer):
    node_db_id = serializers.IntegerField(required=True)

class ToggleSailorRegulatorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    is_reg = serializers.BooleanField()