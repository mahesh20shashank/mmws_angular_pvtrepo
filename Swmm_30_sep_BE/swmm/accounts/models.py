"""Local identity rows for SWMM's ``authz_service`` integration.

SWMM mints no identities of its own. It verifies an RS256 bearer issued by
``authz_service`` and, on each request, shadow-syncs the token's identity + role
+ org scope onto a real local :class:`CustomUser` / :class:`CustomUserProfile`
(see :mod:`accounts.authz_sync`). Keeping real rows -- rather than a
``SimpleNamespace`` principal -- is what lets the department-scoped RBAC in
:mod:`accounts.rbac` and its ~20 consumer apps keep working unchanged: they read
``user.user_profile.role_master.role_name`` / ``.department`` and run
``CustomUserProfile`` querysets.

``AUTH_USER_MODEL = "accounts.CustomUser"``. These models were moved here from
the now-deleted ``users`` app and trimmed to only the fields that
:mod:`accounts.rbac`, :mod:`accounts.authz_sync`, or another SWMM app actually
reads. The join key to the token is ``CustomUserProfile.authz_user_id`` == the
token's ``user_id`` claim.
"""

# Developed with Understanding: uuid gives HrcdfSyncJob a UUID primary key, as sfd ReportExportJob does.
import uuid

from master.models import Base

from django.contrib.auth.models import AbstractBaseUser
from django.db import models
from django.utils.timezone import now

from .choices import access_level_choices
from .managers import CustomUserManager, HRCDFMockQuerySet

Department = "master.Department"
MasterCommand = "master.MasterCommand"

# Master reference models are referenced by string label ("master.Department"
# etc.) rather than imported: master.models imports CustomUserProfile from this
# module, so an eager import here would be a circular import at app-load time.

# Where an account came from. Read by ``rbac.is_static_profile`` /
# ``rbac._exclude_static`` / ``rbac.should_attempt_ldap`` as class-free module
# constants, so they stay importable without touching the model.
#   STATIC -- a seeded installation/test login.
#   AD     -- provisioned from Active Directory.
#   LOCAL  -- created onboard. The default.
#   AUTHZ  -- projected from an ``authz_service`` token by the shadow-sync.
AUTH_SOURCE_STATIC = "STATIC"
AUTH_SOURCE_AD = "AD"
AUTH_SOURCE_LOCAL = "LOCAL"
AUTH_SOURCE_AUTHZ = "authz"
# Developed with Understanding: HRCDF -- an own-ship personnel row written by the HRCDF
# roster sync (AR1, D14). No CustomUser, no role and has_credentials False.
AUTH_SOURCE_HRCDF = "HRCDF"


class AuthSourceChoices(models.TextChoices):
    STATIC = AUTH_SOURCE_STATIC, "Static"
    AD = AUTH_SOURCE_AD, "Active Directory"
    LOCAL = AUTH_SOURCE_LOCAL, "Local"
    AUTHZ = AUTH_SOURCE_AUTHZ, "Authz Service"
    # Developed with Understanding: provenance value for rows created by the HRCDF sync.
    HRCDF = AUTH_SOURCE_HRCDF, "HRCDF"


class UserDepartment(Base):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=50, unique=True)


class Designation(Base):
    id = models.BigAutoField(primary_key=True)
    designation_name = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.designation_name}"


class Rank(Base):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, default="")
    department = models.ForeignKey(
        "master.Department", on_delete=models.PROTECT, null=True, blank=True
    )

    def __str__(self):
        return f"{self.name}"


class Role(Base):
    id = models.BigAutoField(primary_key=True)
    role_name = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.role_name}"


# Developed with Understanding: abstract mixin holding the HRCDF personnel columns from
# R1 B4, shared by CustomUserProfile (own ship) and OtherCustomUserProfile (other units)
# so both tables carry one identical column set. Every column is nullable or blank with an
# empty default so existing rows need no backfill. Nothing on IIMA's not-stored list is
# included (D14, OQ12). The mixin declares no relation, so it adds no related_name.
class HrcdfPersonnelFields(models.Model):
    """HRCDF roster columns shared by the own-ship and other-unit personnel tables."""

    hrcdf_is_active = models.BooleanField(
        null=True,
        blank=True,
        help_text="HRCDF key isActive",
    )
    middle_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="HRCDF key middleName",
    )
    full_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="HRCDF key fullName",
    )
    date_of_commission = models.DateField(
        null=True,
        blank=True,
        help_text="HRCDF key dateOfCommission",
    )
    date_of_seniority = models.DateField(
        null=True,
        blank=True,
        help_text="HRCDF key dateOfSeniority",
    )
    date_of_retirement = models.DateField(
        null=True,
        blank=True,
        help_text="HRCDF key dateOfRetirement",
    )
    official_mobile = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="HRCDF key officialMobileNumber",
    )
    personal_mobile = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="HRCDF key personalMobileNumber",
    )
    nud_email = models.EmailField(
        max_length=255,
        blank=True,
        default="",
        help_text="HRCDF key nudEmailId",
    )
    personnel_email = models.EmailField(
        max_length=255,
        blank=True,
        default="",
        help_text="HRCDF key personnelEmailId",
    )
    gov_email = models.EmailField(
        max_length=255,
        blank=True,
        default="",
        help_text="HRCDF key govEmailId",
    )
    user_type_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="HRCDF key userTypeCode",
    )
    user_type_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="HRCDF key userTypeName",
    )
    gender_id = models.IntegerField(
        null=True,
        blank=True,
        help_text="HRCDF key genderId",
    )
    gender = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="HRCDF key gender",
    )
    gender_name = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="HRCDF key genderName",
    )
    hrcdf_unit_id = models.BigIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="HRCDF key unitId",
    )
    # Developed with Understanding: unitCode is zero-padded, so it is stored as text and
    # never as a number (R1 B4, OB4).
    unit_code = models.CharField(
        max_length=10,
        blank=True,
        default="",
        db_index=True,
        help_text="HRCDF key unitCode, kept as text",
    )
    hrcdf_command_id = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="HRCDF key commandId",
    )
    command_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        db_index=True,
        help_text="HRCDF key commandCode",
    )
    hrcdf_rank_id = models.IntegerField(
        null=True,
        blank=True,
        help_text="HRCDF key rankId",
    )
    rank_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="HRCDF key rankCode",
    )
    rank_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="HRCDF key rankName",
    )
    branch_id = models.IntegerField(
        null=True,
        blank=True,
        help_text="HRCDF key branchId",
    )
    branch_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="HRCDF key branchCode",
    )
    branch_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="HRCDF key branchName",
    )
    cadre_id = models.IntegerField(
        null=True,
        blank=True,
        help_text="HRCDF key cadreId",
    )
    cadre_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="HRCDF key cadreCode",
    )
    cadre_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="HRCDF key cadreName",
    )
    hrcdf_designation = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="HRCDF key designationIdm",
    )
    service_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="HRCDF key serviceCode",
    )
    commission_type = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="HRCDF key commissionType",
    )
    # Developed with Understanding: written by the sync itself, not an HRCDF key.
    hrcdf_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set by the HRCDF sync, not an HRCDF key",
    )

    class Meta:
        abstract = True


# Developed with Understanding: CustomUserProfile now also inherits the HRCDF columns so
# the sync can write own-ship personnel here under AR1 (D14).
class CustomUserProfile(Base, HrcdfPersonnelFields):
    id = models.BigAutoField(primary_key=True)
    rank = models.ForeignKey(Rank, on_delete=models.PROTECT, null=True, blank=True)
    firstname = models.CharField(max_length=100, default="")
    lastname = models.CharField(max_length=100, blank=True, default="")
    designation_master = models.ForeignKey(
        Designation, on_delete=models.PROTECT, null=True, blank=True
    )
    designation = models.CharField(max_length=100, blank=True, default="", null=True)
    personal_number = models.SlugField(max_length=15, default="")
    # Developed with Understanding: widened from 50 to 100 because workbook unit names reach 52 (R1 A5).
    section = models.CharField(max_length=100, blank=True, default="")
    ship_joining_date = models.DateTimeField(default=now, null=True)
    ship_leaving_date = models.DateTimeField(null=True)
    remarks = models.CharField(max_length=200, default="")
    access_level_choices = access_level_choices
    access_level = models.CharField(
        max_length=20, default="2", null=True, choices=access_level_choices
    )
    department = models.ForeignKey(
        Department, on_delete=models.PROTECT, null=True, blank=True
    )
    executive_sub_department = models.CharField(
        max_length=100, blank=True, default="", null=True
    )
    role_master = models.ForeignKey(
        Role, on_delete=models.PROTECT, null=True, blank=True
    )
    command_name = models.ForeignKey(
        MasterCommand,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="user_command",
    )
    ship = models.ForeignKey(
        "master.Ship", on_delete=models.PROTECT, null=True, blank=True
    )
    has_credentials = models.BooleanField(default=False, null=True)
    is_role = models.BooleanField(default=False, null=True)
    user_created_on = models.DateTimeField(auto_now_add=True, null=True)
    user_active = models.BooleanField(default=True)
    is_ood = models.BooleanField(default=False, null=True, blank=True)
    is_regulator = models.BooleanField(default=False, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    date_of_joining = models.DateField(null=True, blank=True)

    # --- NEW COLUMNS ADDED HERE ---
    is_married = models.BooleanField(default=False, null=True, blank=True)
    marriage_date = models.DateField(null=True, blank=True)
    division = models.ForeignKey(
        "MasterRegulatorDivision",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sailors",
    )
    auth_source = models.CharField(
        max_length=10, default=AUTH_SOURCE_LOCAL, choices=AuthSourceChoices.choices
    )
    role_assigned_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="roles_assigned_by_me",
    )
    role_assigned_on = models.DateTimeField(null=True, blank=True)
    profile_picture = models.ImageField(
        upload_to="users_profile_pic/",
        null=True,
        blank=True,
    )
    authz_user_id = models.BigIntegerField(
        null=True, blank=True, unique=True, db_index=True
    )
    additional_duty = models.CharField(
        max_length=150, blank=True, default="", null=True
    )

    class Meta:
        unique_together = (
            "personal_number",
            "ship_joining_date",
        )
        # Developed with Understanding: the sync matches on personal_number alone (OQ6),
        # so it is indexed. unique_together above is kept exactly as it was.
        indexes = [
            models.Index(
                fields=["personal_number"], name="acc_cup_personal_number_idx"
            ),
        ]

    def clean(self):
        if self.firstname:
            self.firstname = self.firstname.capitalize()
        if self.lastname:
            self.lastname = self.lastname.capitalize()
        if self.personal_number:
            self.personal_number = self.personal_number.upper()
        if self.section:
            self.section = self.section.upper()
        if self.designation:
            self.designation = self.designation.upper()
        if self.remarks:
            self.remarks = self.remarks.upper()

    def __str__(self):
        return f"{self.firstname} {self.lastname} ({self.personal_number})"


class CustomUser(AbstractBaseUser):
    id = models.BigAutoField(primary_key=True)
    username = models.CharField(max_length=100, unique=True)
    user_profile = models.ForeignKey(
        CustomUserProfile, on_delete=models.PROTECT, null=True, blank=True
    )
    is_active = models.BooleanField(default=True)
    is_admin = models.BooleanField(default=False)
    # Developed with Understanding: an other-ship login (D25, CP-K) links here instead of
    # user_profile, which stays null, so it never owns an accounts_customuserprofile row.
    # A string reference, because OtherCustomUserProfile is declared further down.
    other_profile = models.ForeignKey(
        "OtherCustomUserProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="login_users",
    )
    objects = CustomUserManager()

    REQUIRED_FIELDS = ("user_profile",)
    USERNAME_FIELD = "username"

    def __str__(self):
        return self.username

    # Developed with Understanding: True for an other-ship login - other_profile set and
    # user_profile empty (D25). Read only, derived from the two links.
    @property
    def is_other_unit(self):
        return self.other_profile_id is not None and self.user_profile_id is None

    @property
    def department(self):
        return self.user_profile.department if self.user_profile_id else None

    @property
    def department_id(self):
        return self.user_profile.department_id if self.user_profile_id else None

    def get_full_name(self):
        if not self.user_profile_id:
            return self.username
        full_name = (
            f"{self.user_profile.firstname or ''} {self.user_profile.lastname or ''}"
        ).strip()
        return full_name or self.username

    def get_short_name(self):
        if self.user_profile_id and self.user_profile.firstname:
            return self.user_profile.firstname
        return self.username

    def has_perm(self, perm, object=None):
        return True

    def has_module_perms(self, app_label):
        return True

    @property
    def is_staff(self):
        return self.is_admin

    def clean(self):
        self.username = self.username.upper()


class role_hierarchy(Base):
    id = models.IntegerField(primary_key=True)  # ✅ manual ID
    role_name = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "role_hierarchy"  # ✅ custom table name
        verbose_name = "Role"
        verbose_name_plural = "Roles"

    def __str__(self):
        return f"{self.id} - {self.role_name}"


# Developed with Understanding: OtherCustomUserProfile now also inherits the HRCDF columns
# and holds personnel of every other unit (D2), matched on personal_number.
class OtherCustomUserProfile(Base, HrcdfPersonnelFields):
    id = models.BigAutoField(primary_key=True)
    firstname = models.CharField(max_length=100)
    lastname = models.CharField(max_length=100)
    personal_number = models.CharField(max_length=50, unique=True)
    rank = models.ForeignKey(Rank, on_delete=models.SET_NULL, null=True, blank=True)
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True
    )
    designation = models.CharField(max_length=100, null=True, blank=True)
    section = models.CharField(max_length=100, null=True, blank=True)
    access_level = models.CharField(
        max_length=2, choices=access_level_choices, default="3"
    )

    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_profiles",
    )
    # Developed with Understanding: HRCDF columns the own-ship table already has or that
    # only the other-unit table needs (R1 B4, D19).
    date_of_birth = models.DateField(null=True, blank=True)
    date_of_joining = models.DateField(null=True, blank=True)
    command_name = models.CharField(max_length=250, blank=True, default="")
    # Developed with Understanding: provenance of the row, HRCDF when written by the sync (R1 B4).
    record_origin = models.CharField(max_length=10, blank=True, default="")
    # Developed with Understanding: False once the person belongs to the home unit (D19).
    # The Ty Loan picker lists only rows where this is True.
    is_current_other_unit = models.BooleanField(default=True, db_index=True)
    # Developed with Understanding: the authz user_id of an other-ship login linked to this
    # row (D25, CP-K) - the join key for that login, as authz_user_id is on the own-ship table.
    authz_user_id = models.BigIntegerField(
        null=True, blank=True, unique=True, db_index=True
    )
    # Developed with Understanding: set by accounts.authz_sync on each other-ship login.
    last_login_at = models.DateTimeField(null=True, blank=True)

    # Developed with Understanding: indexes for the Ty Loan picker filters (D11, D12).
    class Meta:
        indexes = [
            models.Index(
                fields=["is_current_other_unit", "command_code", "unit_code"],
                name="acc_ocup_curr_cmd_unit_idx",
            ),
            models.Index(fields=["section"], name="acc_ocup_section_idx"),
        ]

    def __str__(self):
        return f"{self.firstname} {self.lastname} ({self.get_access_level_display()})"


class MasterRegulatorDivision(Base):
    id = models.BigAutoField(primary_key=True)
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, null=True, blank=True
    )
    regulator = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.CASCADE,
        related_name="regulator_divisions",
    )
    division = models.CharField(max_length=255)

    class Meta:
        db_table = "master_regulator_division"

    def __str__(self):
        return f"{self.division} ({self.regulator.firstname})"


class MasterKnowYourRegulator(Base):
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, null=True, blank=True
    )
    regulator = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.CASCADE,
        related_name="know_regulator",
    )
    # division = models.ForeignKey(MasterRegulatorDivision, on_delete=models.CASCADE)
    # sailors = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='sailor_regulator')
    sailor = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="division_sailor",
    )

    division = models.ForeignKey(
        MasterRegulatorDivision, on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        db_table = "master_know_your_regulator"

    def __str__(self):
        return f"{self.department.name} - {self.regulator.firstname} - {self.division.division}"


class GalleryImage(Base):
    id = models.BigAutoField(primary_key=True)
    image = models.ImageField(upload_to="gallery/")
    title = models.CharField(max_length=200)
    caption = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)
    ship = models.ForeignKey(
        "master.Ship", on_delete=models.PROTECT, null=True, blank=True
    )
    department = models.ForeignKey(
        Department, on_delete=models.PROTECT, null=True, blank=True
    )

    def __str__(self):
        return self.title


class ShipIdentity(Base):
    """
    Code written by Unknown: single-row table holding the name of the ship this
    deployment serves. This application serves one ship only.

    The value is compared against CustomUserProfile.section at login, because
    section is where the HRCDF 'unitName' lands (see save_hrcdf_to_db in
    users/views.py, which does section=unit_name). It is seeded to a known value
    so a fresh install can be initialised, and it self-learns the first time a
    user carrying a real HRCDF section logs in, after which it is locked.

    Developed with Understanding: unit links the home unit picked for the HRCDF
    sync (D15). It follows the confirm-and-lock pattern - once set, ship_name
    takes the unit name and is_locked turns True.
    """

    ship_name = models.CharField(max_length=50, blank=True, default="")
    # Code written by Unknown: once True the name is settled and login stops adopting it.
    is_locked = models.BooleanField(default=False)
    updated_on = models.DateTimeField(auto_now=True)
    # Developed with Understanding: home unit for the HRCDF sync, no reverse accessor on Unit.
    unit = models.ForeignKey(
        "master.Unit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "ship_identity"
        verbose_name = "Ship Identity"
        verbose_name_plural = "Ship Identity"

    def __str__(self):
        return self.ship_name or "(unset)"

    @classmethod
    def get_solo(cls):
        """Code written by Unknown: fetch or create the single row."""
        obj = cls.objects.order_by("id").first()
        if obj is None:
            obj = cls.objects.create(ship_name="", is_locked=False)
        return obj


class HRCDFMock(Base):
    objects = HRCDFMockQuerySet.as_manager()

    personnel_number = models.CharField(max_length=20)
    first_name = models.CharField(max_length=100, null=True, blank=True)
    last_name = models.CharField(max_length=100, null=True, blank=True)
    rank = models.CharField(max_length=100, null=True, blank=True)
    unit = models.CharField(max_length=255, null=True, blank=True)
    designation = models.CharField(max_length=255, null=True, blank=True)
    nud_mail = models.EmailField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "HRCDFMock"

    def __str__(self):
        full_name = " ".join(
            part for part in [self.first_name, self.last_name] if part
        ).strip()
        return full_name or self.personnel_number or ""


class LoginRegistrationImage(Base):
    """
    Stores images to be displayed on the login/registration page
    """

    id = models.BigAutoField(primary_key=True)

    image = models.ImageField(
        upload_to="login_images/", help_text="Upload login page image"
    )
    name = models.CharField(
        max_length=255, blank=True, null=True, help_text="Optional image name"
    )
    # Code written by Unknown: holds the rank/appointment line shown under the name on the landing page gallery
    designation = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Rank/appointment text shown under the name",
    )
    source = models.CharField(max_length=100, default="login-registration-image")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_login_images",
    )
    # is_active = models.BooleanField(default=True)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "login_registration_images"
        ordering = ("-uploaded_at",)
        verbose_name = "Login Registration Image"
        verbose_name_plural = "Login Registration Images"

    def __str__(self):
        return f"Login Image - {self.uploaded_at.strftime('%Y-%m-%d %H:%M')}"


# Developed with Understanding: one row per HRCDF sync run, the job record and history that
# replaces IIMA's JSON state file (R1 G2). Modelled on sfd ReportExportJob (R1 E1) - UUID
# primary key and a TextChoices status. Live progress lines live in the swmm cache, not here.
class HrcdfSyncJob(Base):
    """Record of one HRCDF roster sync run - mode, status, counters and summary."""

    class Mode(models.TextChoices):
        OWN = "own", "Own"
        OTHERS = "others", "Others"
        UNITS = "units", "Units"

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        FINISHED = "finished", "Finished"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mode = models.CharField(max_length=10, choices=Mode.choices)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.QUEUED
    )
    started_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    started_at = models.DateTimeField(default=now)
    finished_at = models.DateTimeField(null=True, blank=True)
    host = models.CharField(max_length=255, blank=True, default="")
    celery_task_id = models.CharField(max_length=64, blank=True, default="")
    # Developed with Understanding: True when dispatch_task fell back to running inline.
    ran_inline = models.BooleanField(default=False)
    total = models.IntegerField(null=True, blank=True)
    processed = models.IntegerField(default=0)
    pages = models.IntegerField(default=0)
    stats = models.JSONField(default=dict, blank=True)
    errors = models.JSONField(default=list, blank=True)
    message = models.TextField(blank=True, default="")

    class Meta:
        db_table = "accounts_hrcdf_sync_job"
        ordering = ("-started_at",)

    def __str__(self):
        return f"HRCDF sync {self.mode} {self.status} {self.started_at:%Y-%m-%d}"
