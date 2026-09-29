"""RBAC configuration models.

Adopted from ITTTM user_service/access/models.py (the richer authorization
model), FK'd to `settings.AUTH_USER_MODEL` (= accounts.CustomUser) instead of
ITTTM's fat `accounts.User`. Nav visibility + role requests are ported from
SWMM users/models.py.

`UserRole.code` / `AccessLevel.access_level_code` are the stable keys -- never
string-match on `name` (build prompt "Data model").
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

USER = settings.AUTH_USER_MODEL

ACTIVE_CHOICES = ((1, "Active"), (2, "Inactive"), (3, "Deleted"))


class Base(models.Model):
    """Trimmed version of ITTTM access.models.Base -- audit columns without the
    random-code / cross-schema baggage."""

    active = models.SmallIntegerField(choices=ACTIVE_CHOICES, default=1)
    created_on = models.DateTimeField(auto_now_add=True)
    modified_on = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        USER,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_created",
    )
    modified_by = models.ForeignKey(
        USER,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_modified",
    )

    class Meta:
        abstract = True


# --------------------------------------------------------------------------
# Process x Role  (primary role system -- ITTTM)
# --------------------------------------------------------------------------
class Process(Base):
    name = models.CharField(max_length=200, unique=True)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "authz_process"

    def __str__(self):
        return self.name


class UserRole(Base):
    name = models.CharField(max_length=200, unique=True)
    # Stable key. Never string-match on name (build prompt).
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, default="")
    # Lower number = higher authority. Used by the privilege-escalation guard
    # (can_grant): a grantor can never grant a role at/above their own rank.
    authority_rank = models.PositiveSmallIntegerField(default=100)

    class Meta:
        db_table = "authz_user_role"
        ordering = ("authority_rank", "name")

    def __str__(self):
        return f"{self.name} ({self.code})"


class RoleProcessMapping(models.Model):
    user_role = models.ForeignKey(
        UserRole, on_delete=models.CASCADE, related_name="role_process_mappings"
    )
    process = models.ForeignKey(
        Process, on_delete=models.CASCADE, related_name="role_process_mappings"
    )

    class Meta:
        db_table = "authz_role_process_mapping"
        unique_together = ("user_role", "process")

    def __str__(self):
        return f"{self.user_role.code} @ {self.process.code}"


class UserProcessRoleMapping(models.Model):
    """user x (role, process). All active rows apply. Origin: ITTTM."""

    user = models.ForeignKey(
        USER, on_delete=models.CASCADE, related_name="process_roles"
    )
    process_role = models.ForeignKey(
        RoleProcessMapping,
        on_delete=models.CASCADE,
        related_name="user_process_role_mappings",
    )
    is_active = models.BooleanField(default=True)
    assigned_date = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        USER,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_process_roles",
    )

    class Meta:
        db_table = "authz_user_process_role_mapping"
        unique_together = ("user", "process_role")
        indexes = [models.Index(fields=["user", "is_active"])]

    def __str__(self):
        return f"{self.user} -> {self.process_role}"


# --------------------------------------------------------------------------
# Menu / Privilege  (ITTTM)
# --------------------------------------------------------------------------
class Menu(Base):
    name = models.CharField(max_length=255, unique=True)
    code = models.CharField(max_length=64, unique=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="sub_menus",
    )
    url = models.CharField(max_length=500, blank=True, default="")
    icon = models.CharField(max_length=120, blank=True, default="")
    sequence = models.IntegerField(default=1)

    class Meta:
        db_table = "authz_menu"
        ordering = ("sequence", "id")

    def __str__(self):
        return self.name


class Privilege(Base):
    # action key: view / add / edit / delete / export
    name = models.CharField(max_length=64, unique=True)
    code = models.CharField(max_length=32, unique=True)
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "authz_privilege"

    def __str__(self):
        return self.code


class AccessLevel(Base):
    """Org hierarchy level. `access_level_code` is stable
    (SUPER_ADMIN -> NHQ -> COMMAND -> AA_OA -> NATAA -> TRIAL_AGENCY ->
    SATELLITE_UNIT -> SHIP). Origin: ITTTM."""

    name = models.CharField(max_length=100, unique=True)
    access_level_code = models.CharField(max_length=50, unique=True, db_index=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    sequence = models.PositiveSmallIntegerField(
        default=0, help_text="Lower = higher in hierarchy (1 = Super Admin)."
    )

    class Meta:
        db_table = "authz_access_level"
        ordering = ("sequence",)

    def __str__(self):
        return f"{self.name} ({self.access_level_code})"


class RoleMenuMapping(Base):
    process = models.ForeignKey(
        Process, on_delete=models.CASCADE, related_name="role_menu_mappings"
    )
    role = models.ForeignKey(
        UserRole, on_delete=models.CASCADE, related_name="role_menu_mappings"
    )
    access_level = models.ForeignKey(
        AccessLevel,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="role_menu_mappings",
        help_text="If set, privileges apply only for this hierarchy level.",
    )
    menu = models.ForeignKey(
        Menu, on_delete=models.CASCADE, related_name="menu_mappings"
    )
    privileges = models.ManyToManyField(Privilege, related_name="role_mappings")
    unit_id = models.BigIntegerField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "authz_role_menu_mapping"
        constraints = [
            models.UniqueConstraint(
                fields=("process", "role", "menu"),
                condition=models.Q(access_level__isnull=True, unit_id__isnull=True),
                name="authz_role_menu_global_uq",
            ),
            models.UniqueConstraint(
                fields=("process", "role", "menu", "access_level"),
                condition=models.Q(access_level__isnull=False, unit_id__isnull=True),
                name="authz_role_menu_level_uq",
            ),
            models.UniqueConstraint(
                fields=("process", "role", "menu", "unit_id"),
                condition=models.Q(unit_id__isnull=False, access_level__isnull=True),
                name="authz_role_menu_unit_uq",
            ),
            models.UniqueConstraint(
                fields=("process", "role", "menu", "access_level", "unit_id"),
                condition=models.Q(unit_id__isnull=False, access_level__isnull=False),
                name="authz_role_menu_level_unit_uq",
            ),
        ]

    def __str__(self):
        return f"{self.process.code}/{self.role.code}/{self.menu.code}"


class UserMenuMapping(Base):
    """Per-user override. Present rows short-circuit RoleMenuMapping in
    effective_menu_permissions / check_access. Origin: ITTTM."""

    user = models.ForeignKey(
        USER, on_delete=models.CASCADE, related_name="user_menu_mappings"
    )
    menu = models.ForeignKey(
        Menu, on_delete=models.CASCADE, related_name="user_menu_maps"
    )
    privileges = models.ManyToManyField(Privilege, related_name="user_mappings")
    unit_id = models.BigIntegerField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "authz_user_menu_mapping"
        unique_together = ("user", "menu")

    def __str__(self):
        return f"{self.user} / {self.menu.code}"


class UserAccessLevel(models.Model):
    """user -> one hierarchy level + optional org scope ids. THE authoritative
    org scope (build prompt). Origin: ITTTM."""

    user = models.ForeignKey(
        USER, on_delete=models.CASCADE, related_name="access_levels"
    )
    access_level = models.ForeignKey(
        AccessLevel, on_delete=models.CASCADE, related_name="user_assignments"
    )
    command_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    satellite_unit_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    trial_unit_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    ship_id = models.BigIntegerField(null=True, blank=True, db_index=True)

    is_active = models.BooleanField(default=True)
    assigned_on = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        USER,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_user_access_levels",
    )

    class Meta:
        db_table = "authz_user_access_level"
        indexes = [models.Index(fields=["user", "is_active"])]

    def __str__(self):
        return f"{self.user} @ {self.access_level.access_level_code}"


class RoleAccessLevelMapping(models.Model):
    """Which workflow roles may be used at which hierarchy levels (optionally
    per process). Origin: ITTTM."""

    user_role = models.ForeignKey(
        UserRole, on_delete=models.CASCADE, related_name="role_access_level_mappings"
    )
    access_level = models.ForeignKey(
        AccessLevel,
        on_delete=models.CASCADE,
        related_name="role_access_level_mappings",
    )
    process = models.ForeignKey(
        Process,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="role_access_level_mappings",
    )

    class Meta:
        db_table = "authz_role_access_level_mapping"
        unique_together = ("user_role", "access_level", "process")

    def __str__(self):
        proc = self.process.code if self.process_id else "*"
        return f"{self.user_role.code} @ {self.access_level.access_level_code} ({proc})"


# --------------------------------------------------------------------------
# Nav visibility (SWMM users/models.py) -- menu/screen visibility with a
# fallback for unseeded roles and a lock so an admin cannot revoke their own
# access to the screen that fixes RBAC.
# --------------------------------------------------------------------------
class NavItem(models.Model):
    key = models.SlugField(max_length=64, unique=True)
    label = models.CharField(max_length=120)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    # Optional link to the authorization `Menu` this sidebar entry opens.
    # Nav visibility (the per-role boolean matrix) stays the source of truth for
    # *what shows in the sidebar*; this FK just ties an entry back to the screen
    # whose action-level privileges live in RoleMenuMapping, so "what screens
    # exist" has a single home. Null = a nav entry with no RBAC-guarded menu
    # (e.g. a pure link). `code` and `key` are independent strings; match them
    # by convention in the seed, not by DB constraint.
    menu = models.ForeignKey(
        Menu,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nav_items",
    )

    class Meta:
        db_table = "authz_nav_item"
        ordering = ("order", "id")

    def __str__(self):
        return self.label


class NavVisibility(models.Model):
    role = models.ForeignKey(
        UserRole, on_delete=models.CASCADE, related_name="nav_visibility"
    )
    nav_item = models.ForeignKey(
        NavItem, on_delete=models.CASCADE, related_name="role_visibility"
    )
    is_visible = models.BooleanField(default=False)

    class Meta:
        db_table = "authz_nav_visibility"
        unique_together = ("role", "nav_item")

    def __str__(self):
        return f"{self.role.code} / {self.nav_item.key} = {self.is_visible}"


# --------------------------------------------------------------------------
# Role requests / approval routing (SWMM users/models.py), generalized to
# (process, role, access_level, org unit) instead of just department.
# --------------------------------------------------------------------------
class RoleRequest(models.Model):
    SOURCE_REQUEST = "REQUEST"
    SOURCE_AUTO_LOGIN = "AUTO_LOGIN"
    SOURCE_DIRECT_ADMIN = "DIRECT_ADMIN"
    SOURCE_CHOICES = (
        (SOURCE_REQUEST, "Raised by user"),
        (SOURCE_AUTO_LOGIN, "Raised automatically on login"),
        (SOURCE_DIRECT_ADMIN, "Assigned directly by admin"),
    )

    STATUS_PENDING = "PENDING"
    STATUS_APPROVED = "APPROVED"
    STATUS_REJECTED = "REJECTED"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    )

    requester = models.ForeignKey(
        USER, on_delete=models.CASCADE, related_name="role_requests"
    )
    process = models.ForeignKey(
        Process, on_delete=models.PROTECT, related_name="role_requests"
    )
    requested_role = models.ForeignKey(
        UserRole,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="requests_for_role",
    )
    requested_access_level = models.ForeignKey(
        AccessLevel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="role_requests",
    )
    department = models.ForeignKey(
        "accounts.LocalCopyDepartment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_role_request",
    )
    # Org-unit SNAPSHOT taken at request time (analogue of SWMM's department
    # snapshot) -- approval routing keys off this, not the requester's current
    # posting, which may have moved since.
    scope_command_id = models.BigIntegerField(null=True, blank=True)
    scope_satellite_unit_id = models.BigIntegerField(null=True, blank=True)
    scope_trial_unit_id = models.BigIntegerField(null=True, blank=True)
    scope_ship_id = models.BigIntegerField(null=True, blank=True)
    scope_unit_id = models.BigIntegerField(null=True, blank=True)

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    source = models.CharField(
        max_length=20, choices=SOURCE_CHOICES, default=SOURCE_REQUEST
    )
    remarks = models.CharField(max_length=500, blank=True, default="")
    created_on = models.DateTimeField(auto_now_add=True)
    acted_by = models.ForeignKey(
        USER,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="role_requests_acted",
    )
    acted_on = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "authz_role_request"
        ordering = ("-created_on", "-id")

    def __str__(self):
        role = self.requested_role.code if self.requested_role_id else "any role"
        return f"{self.requester} -> {role} ({self.status})"

    def stamp_action(self, actor, status):
        self.acted_by = actor
        self.acted_on = timezone.now()
        self.status = status
