"""Identity / credentials.

Split identity model kept from SWMM (users/models.py): a thin `CustomUser`
carrying only credentials, plus a `CustomUserProfile` carrying the person /
posting. ITTTM's fat `accounts.models.User` is deliberately NOT copied; only
its *org-scope fields* are ported onto the profile, next to `department`
(build prompt "Data model").
"""

from authz.models import UserRole
from django.contrib.auth.models import AbstractBaseUser
from django.db import models
from django.utils import timezone

from .choices import access_level_choices
from .managers import CustomUserManager

APPROVAL_PENDING = "PENDING"
APPROVAL_APPROVED = "APPROVED"
APPROVAL_REJECTED = "REJECTED"
APPROVAL_CHOICES = (
    (APPROVAL_PENDING, "Pending"),
    (APPROVAL_APPROVED, "Approved"),
    (APPROVAL_REJECTED, "Rejected"),
)


class LocalCopyDepartment(models.Model):
    """Master department. Origin: ``swmm/master/models.py::Department`` -- the
    minimal projection the SWMM login response serializes as ``department_detail``
    (with its nested ``subdepartments``)."""

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=250)
    code = models.CharField(max_length=250, blank=True, default="")
    dep_code = models.CharField(max_length=250, null=True, blank=True)

    class Meta:
        db_table = "accounts_master_department"

    def __str__(self):
        return self.name or f"department #{self.pk}"


class LocalCopySubDepartment(models.Model):
    """Origin: ``swmm/master/models.py::SubDepartment``. Reachable from
    ``Department`` via ``related_name="subdepartments"`` -- the key the SWMM
    frontend reads inside ``department_detail``."""

    id = models.BigAutoField(primary_key=True)
    department = models.ForeignKey(
        LocalCopyDepartment,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="subdepartments",
    )
    name = models.CharField(max_length=250, null=True, blank=True)
    code = models.CharField(max_length=50, null=True, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "accounts_master_sub_department"

    def __str__(self):
        return self.name or f"sub-department #{self.pk}"


class LocalCopyShip(models.Model):
    """Trimmed ``swmm/master/models.py::Ship`` -- only the identity columns the
    SWMM login response needs (``ship`` is emitted as the bare PK)."""

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=250, null=True, blank=True)
    code = models.CharField(max_length=250, null=True, blank=True)

    class Meta:
        db_table = "accounts_master_ship"

    def __str__(self):
        return self.name or f"ship #{self.pk}"


class LocalCopyRank(models.Model):
    """Origin: ``swmm/users/models.py::Rank`` -- serialized as ``rank_detail``."""

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, default="")
    department = models.ForeignKey(
        LocalCopyDepartment, on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        db_table = "accounts_rank"

    def __str__(self):
        return self.name or f"rank #{self.pk}"


class LocalCopyDesignation(models.Model):
    """Origin: ``swmm/users/models.py::Designation`` -- serialized as
    ``designation_master_detail``."""

    id = models.BigAutoField(primary_key=True)
    designation_name = models.CharField(max_length=255)

    class Meta:
        db_table = "accounts_designation"

    def __str__(self):
        return self.designation_name or f"designation #{self.pk}"


class LocalCopyMasterCommand(models.Model):
    """Origin: ``swmm/master/models.py::MasterCommand`` -- serialized as
    ``command_name_detail`` in the SWMM login response."""

    code = models.CharField(max_length=250, unique=True, blank=True, null=True)
    unit_name = models.CharField(max_length=250, blank=True, null=True)
    command_name = models.CharField(max_length=250, blank=True, null=True)
    created_on = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    # created_by = models.ForeignKey(
    #     CustomUserProfile,
    #     on_delete=models.CASCADE,
    #     blank=True,
    #     null=True,
    #     related_name="%(class)s_created_user",
    # )
    created_ip = models.GenericIPAddressField(blank=True, null=True)
    modified_on = models.DateTimeField(auto_now=True, blank=True, null=True)
    # modified_by = models.ForeignKey(
    #     CustomUserProfile,
    #     on_delete=models.CASCADE,
    #     blank=True,
    #     null=True,
    #     related_name="%(class)s_modified_user",
    # )
    modified_ip = models.GenericIPAddressField(blank=True, null=True)
    active = models.SmallIntegerField(
        choices=((1, "active"), (2, "Inactive"), (3, "Delete")),
        default=1,  # Add this default value
    )

    class Meta:
        db_table = "accounts_master_command"

    def __str__(self):
        return self.command_name or self.unit_name or f"command #{self.pk}"


class LocalCopyMasterUnit(models.Model):
    name = models.CharField(max_length=250)
    code = models.CharField(max_length=250, unique=True)
    description = models.TextField(blank=True, null=True)
    command = models.ForeignKey(
        LocalCopyMasterCommand, blank=True, on_delete=models.CASCADE, null=True
    )
    created_on = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    # created_by = models.ForeignKey(
    #     CustomUserProfile,
    #     on_delete=models.CASCADE,
    #     blank=True,
    #     null=True,
    #     related_name="%(class)s_created_user",
    # )
    created_ip = models.GenericIPAddressField(blank=True, null=True)
    modified_on = models.DateTimeField(auto_now=True, blank=True, null=True)
    # modified_by = models.ForeignKey(
    #     CustomUserProfile,
    #     on_delete=models.CASCADE,
    #     blank=True,
    #     null=True,
    #     related_name="%(class)s_modified_user",
    # )
    modified_ip = models.GenericIPAddressField(blank=True, null=True)
    active = models.SmallIntegerField(
        choices=((1, "active"), (2, "Inactive"), (3, "Delete")),
        default=1,  # Add this default value
    )

    class Meta:
        db_table = "Master_unit"

    def __str__(self):
        return str(self.name or self.pk)


class CustomUserProfile(models.Model):
    """Person / posting record. Origin: SWMM CustomUserProfile, with ITTTM's
    org-scope columns ported alongside `department` (unit_id/name, ship_id/name,
    satellite_unit_id, department_id/name, approval_status, ad_user,
    source_unit_*, hrcdf_desig, rankCode/rankName).

    Authoritative org scope is `authz.UserAccessLevel` -- these columns are the
    "home unit" denormalization for signup, peer-listing and the cache payload
    only (build prompt).
    """

    id = models.BigAutoField(primary_key=True)

    firstname = models.CharField(max_length=100, default="")
    lastname = models.CharField(max_length=100, blank=True, default="")
    personal_number = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(max_length=255, blank=True, default="")
    profile_picture = models.ImageField(
        upload_to="users_profile_pic/",
        null=True,
        blank=True,
    )
    nud_mail = models.EmailField(max_length=255, blank=True, default="")
    phone_number = models.CharField(max_length=15, blank=True, default="")
    designation = models.CharField(max_length=100, blank=True, default="", null=True)

    # --- ITTTM org-scope columns (remote PKs in master-service; no cross-DB FK) ---
    unit_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    unit_name = models.CharField(max_length=255, blank=True, default="")
    command_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    command_name = models.CharField(max_length=255, blank=True, default="")
    ship_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    ship_name = models.CharField(max_length=255, blank=True, default="")
    satellite_unit_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    satellite_unit_name = models.CharField(max_length=255, blank=True, default="")
    department_id = models.CharField(
        max_length=255, null=True, blank=True, db_index=True
    )
    department_name = models.CharField(max_length=255, blank=True, default="")
    source_unit_id = models.BigIntegerField(null=True, blank=True)
    source_unit_name = models.CharField(max_length=255, blank=True, default="")

    # id returned by itttm_backend_microservice's user_service on first sync (see
    # authz.itttm_sync). Set once a user has been created there, so a re-run of
    # seed_rbac sends this back as "id" to hit that service's update path instead
    # of failing on "Username already exists".
    itttm_user_id = models.CharField(max_length=50, null=True, blank=True)

    hrcdf_desig = models.CharField(max_length=255, blank=True, default="")
    rankCode = models.CharField(max_length=50, blank=True, default="")
    rankName = models.CharField(max_length=100, blank=True, default="")

    ad_user = models.BooleanField(default=False)
    reason_for_signup = models.TextField(blank=True, default="")

    # --- SWMM account-state fields (server-controlled) ---
    approval_status = models.CharField(
        max_length=20, choices=APPROVAL_CHOICES, default=APPROVAL_PENDING
    )
    user_active = models.BooleanField(default=True)
    has_credentials = models.BooleanField(default=False)

    # --- SWMM role-assignment audit fields ---
    role = models.ForeignKey(
        UserRole,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_roles",
    )

    role_assigned_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="roles_assigned_by_me",
    )
    role_assigned_on = models.DateTimeField(null=True, blank=True)

    # --- SWMM person / posting fields (origin: swmm/users/models.py::
    #     CustomUserProfile). Additive + nullable so existing rows migrate
    #     cleanly. These back the expanded ``profile`` block the SWMM SPA reads
    #     from the login response; authz_sync / authz.scope keep using the
    #     denormalized *_id columns above. ---
    access_level_choices = access_level_choices
    access_level = models.CharField(
        max_length=20, default="2", null=True, choices=access_level_choices
    )
    rank = models.ForeignKey(
        LocalCopyRank, on_delete=models.SET_NULL, null=True, blank=True
    )
    designation_master = models.ForeignKey(
        LocalCopyDesignation, on_delete=models.SET_NULL, null=True, blank=True
    )
    department_ref = models.ForeignKey(
        LocalCopyDepartment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )
    command_ref = models.ForeignKey(
        LocalCopyMasterCommand,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )
    unit_ref = models.ForeignKey(
        LocalCopyMasterUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )
    ship_ref = models.ForeignKey(
        LocalCopyShip,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )
    section = models.CharField(max_length=100, blank=True, default="")
    executive_sub_department = models.CharField(
        max_length=100, blank=True, default="", null=True
    )
    ship_joining_date = models.DateTimeField(
        default=timezone.now, null=True, blank=True
    )
    ship_leaving_date = models.DateTimeField(null=True, blank=True)
    remarks = models.CharField(max_length=200, blank=True, default="")
    is_role = models.BooleanField(default=False, null=True, blank=True)
    is_ood = models.BooleanField(default=False, null=True, blank=True)
    is_regulator = models.BooleanField(default=False, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    date_of_joining = models.DateField(null=True, blank=True)
    is_married = models.BooleanField(default=False, null=True, blank=True)
    marriage_date = models.DateField(null=True, blank=True)
    # Kept as a bare nullable id -- the regulator-hierarchy models are a SWMM
    # domain concern not ported here; the SPA only reads this as null/an id.
    division = models.BigIntegerField(null=True, blank=True)

    created_on = models.DateTimeField(auto_now_add=True)
    updated_on = models.DateTimeField(auto_now=True)
    user_type = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        db_table = "accounts_user_profile"

    def __str__(self):
        name = f"{self.firstname} {self.lastname}".strip()
        return name or (self.personal_number or f"profile #{self.pk}")

    def get_full_name(self):
        return f"{self.firstname} {self.lastname}".strip()


class CustomUser(AbstractBaseUser):
    """Thin credentials model. This is `AUTH_USER_MODEL`.

    Every RBAC table (ITTTM-derived) FKs to `settings.AUTH_USER_MODEL`, so it
    resolves here with no shape change (build prompt "Target architecture").
    """

    id = models.BigAutoField(primary_key=True)
    username = models.CharField(max_length=100, unique=True)
    user_profile = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    is_active = models.BooleanField(default=True)
    is_admin = models.BooleanField(default=False)

    created_on = models.DateTimeField(default=timezone.now)

    objects = CustomUserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ()

    class Meta:
        db_table = "accounts_user"

    def __str__(self):
        return self.username

    def clean(self):
        if self.username:
            self.username = self.username.strip().upper()

    def save(self, *args, **kwargs):
        if self.username:
            self.username = self.username.strip().upper()
        super().save(*args, **kwargs)

    # --- @property shims delegating to the profile (build prompt): so ITTTM-
    # derived serializer / cache / get_effective_scope code can read
    # `user.<attr>` unchanged. SWMM already does this for department*. ---
    @property
    def profile(self):
        return self.user_profile

    @property
    def department(self):
        return self.user_profile.department_name if self.user_profile_id else None

    @property
    def department_id(self):
        return self.user_profile.department_id if self.user_profile_id else None

    @property
    def department_name(self):
        return self.user_profile.department_name if self.user_profile_id else None

    @property
    def unit_id(self):
        return self.user_profile.unit_id if self.user_profile_id else None

    @property
    def unit_name(self):
        return self.user_profile.unit_name if self.user_profile_id else None

    @property
    def ship_id(self):
        return self.user_profile.ship_id if self.user_profile_id else None

    @property
    def ship_name(self):
        return self.user_profile.ship_name if self.user_profile_id else None

    @property
    def satellite_unit_id(self):
        return self.user_profile.satellite_unit_id if self.user_profile_id else None

    @property
    def satellite_unit_name(self):
        return self.user_profile.satellite_unit_name if self.user_profile_id else None

    @property
    def hrcdf_desig(self):
        return self.user_profile.hrcdf_desig if self.user_profile_id else None

    @property
    def rankCode(self):
        return self.user_profile.rankCode if self.user_profile_id else None

    @property
    def approval_status(self):
        return self.user_profile.approval_status if self.user_profile_id else None

    @property
    def is_staff(self):
        return self.is_admin

    @property
    def is_superuser(self):
        # Django-superuser flag: kept aligned with is_admin so DRF/admin helpers
        # behave. RBAC "super admin" is a separate, role-driven concept -- see
        # authz.rbac.is_super_admin.
        return self.is_admin

    def has_perm(self, perm, obj=None):
        return self.is_admin

    def has_module_perms(self, app_label):
        return self.is_admin

    def get_full_name(self):
        if self.user_profile_id:
            name = self.user_profile.get_full_name()
            if name:
                return name
        return self.username

    def get_short_name(self):
        if self.user_profile_id and self.user_profile.firstname:
            return self.user_profile.firstname
        return self.username


class UserSession(models.Model):
    """One row per login. Origin: ITTTM accounts/models.py UserSession.

    `session_id` is also carried as a JWT claim so logout can mark the exact
    session inactive and a refresh can check it is still live.
    """

    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="sessions"
    )
    username = models.CharField(max_length=100, blank=True, default="")
    session_id = models.CharField(max_length=64, unique=True)

    login_time = models.DateTimeField(default=timezone.now)
    logout_time = models.DateTimeField(null=True, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "accounts_user_session"
        ordering = ("-login_time", "-id")

    def __str__(self):
        return f"{self.username} @ {self.login_time:%Y-%m-%d %H:%M}"
