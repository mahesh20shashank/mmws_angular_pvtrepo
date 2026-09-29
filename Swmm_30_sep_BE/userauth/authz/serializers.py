"""RBAC-config serializers -- every one an explicit field list (anti-pattern
#2; never ``fields = "__all__"`` on a write path)."""

from rest_framework import serializers

from . import models


class ProcessSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Process
        fields = ("id", "name", "code", "description", "active")


class UserRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.UserRole
        fields = (
            "id",
            "name",
            "code",
            "description",
            "authority_rank",
            "active",
        )


class RoleProcessMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RoleProcessMapping
        fields = ("id", "user_role", "process")


class UserProcessRoleMappingSerializer(serializers.ModelSerializer):
    role_code = serializers.CharField(
        source="process_role.user_role.code", read_only=True
    )
    process_code = serializers.CharField(
        source="process_role.process.code", read_only=True
    )

    class Meta:
        model = models.UserProcessRoleMapping
        fields = (
            "id",
            "user",
            "process_role",
            "is_active",
            "assigned_date",
            "assigned_by",
            "role_code",
            "process_code",
        )
        read_only_fields = ("assigned_date", "assigned_by")


class MenuSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Menu
        fields = (
            "id",
            "name",
            "code",
            "parent",
            "url",
            "icon",
            "sequence",
            "active",
        )


class PrivilegeSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Privilege
        fields = ("id", "name", "code", "description", "active")


class AccessLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.AccessLevel
        fields = (
            "id",
            "name",
            "access_level_code",
            "parent",
            "sequence",
            "active",
        )


class RoleMenuMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RoleMenuMapping
        fields = (
            "id",
            "process",
            "role",
            "access_level",
            "menu",
            "privileges",
            "unit_id",
            "active",
        )


class UserMenuMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.UserMenuMapping
        fields = ("id", "user", "menu", "privileges", "unit_id", "active")


class UserAccessLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.UserAccessLevel
        fields = (
            "id",
            "user",
            "access_level",
            "command_id",
            "satellite_unit_id",
            "trial_unit_id",
            "ship_id",
            "is_active",
            "assigned_on",
            "assigned_by",
        )
        read_only_fields = ("assigned_on", "assigned_by")


class RoleAccessLevelMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.RoleAccessLevelMapping
        fields = ("id", "user_role", "access_level", "process")


class NavItemSerializer(serializers.ModelSerializer):
    menu_code = serializers.CharField(source="menu.code", read_only=True)

    class Meta:
        model = models.NavItem
        fields = ("id", "key", "label", "order", "is_active", "menu", "menu_code")


class NavVisibilitySerializer(serializers.ModelSerializer):
    role_code = serializers.CharField(source="role.code", read_only=True)
    nav_key = serializers.CharField(source="nav_item.key", read_only=True)

    class Meta:
        model = models.NavVisibility
        fields = ("id", "role", "nav_item", "is_visible", "role_code", "nav_key")


class RoleRequestSerializer(serializers.ModelSerializer):
    """Create path: the requester and every scope-snapshot field is
    server-set, never client-writable (criterion 2 / criterion 7)."""

    class Meta:
        model = models.RoleRequest
        fields = (
            "id",
            "requester",
            "process",
            "requested_role",
            "requested_access_level",
            "scope_command_id",
            "scope_satellite_unit_id",
            "scope_trial_unit_id",
            "scope_ship_id",
            "scope_unit_id",
            "status",
            "source",
            "remarks",
            "created_on",
            "acted_by",
            "acted_on",
        )
        read_only_fields = (
            "id",
            "requester",
            "scope_command_id",
            "scope_satellite_unit_id",
            "scope_trial_unit_id",
            "scope_ship_id",
            "scope_unit_id",
            "status",
            "source",
            "created_on",
            "acted_by",
            "acted_on",
        )


class RoleRequestCreateSerializer(serializers.Serializer):
    process = serializers.PrimaryKeyRelatedField(
        queryset=models.Process.objects.all()
    )
    requested_role = serializers.PrimaryKeyRelatedField(
        queryset=models.UserRole.objects.all(), required=False, allow_null=True
    )
    requested_access_level = serializers.PrimaryKeyRelatedField(
        queryset=models.AccessLevel.objects.all(), required=False, allow_null=True
    )
    remarks = serializers.CharField(required=False, allow_blank=True)


class RoleRequestActSerializer(serializers.Serializer):
    """Body for ``role-requests/<id>/act/``."""

    decision = serializers.ChoiceField(choices=("approve", "reject"))


class NotificationRecipientsSerializer(serializers.Serializer):
    """Body for the internal service-to-service ``notification-recipients/``
    endpoint (``X-Service-Key`` guarded)."""

    role_code = serializers.CharField()
    process_id = serializers.IntegerField(required=False, allow_null=True)
