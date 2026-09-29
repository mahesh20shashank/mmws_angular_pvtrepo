# seed_all.py
#
# Combines seed_users.py (users, departments, commands, ranks, designations,
# roles) and seed_nav_visibility.py (nav items + nav visibility matrix) into
# a single seed script.

import os
import sys
from pathlib import Path

import django

# ---------------------------------------------------------------------------
# Django setup
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "swmm.settings")
django.setup()

import django.db
from accounts import rbac
from accounts.models import (
    CustomUserProfile,
    Designation,
    Rank,
    Role,
)
from django.contrib.auth import get_user_model
from django.db import transaction
from master.models import Department, MasterCommand, SubDepartment

User = get_user_model()


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SEED_PASS = "12345"
ADMIN_PASS = "admin"

# Usernames (case-insensitive) that are seeded with ADMIN_PASS instead of
# SEED_PASS, per the credentials list in "All Users.txt".
ADMIN_PASSWORD_USERNAMES = {
    "lo_ins_kolkata",
    "ua_ins_nilgiri",
    "ua_ins_kolkata",
    "ins_ka",
    "lo_writer_ins_kolkata",
    "hod_writer_ins_kolkata",
    "hod_ins_kolkata",
    "vikrant_u2",
    "vikrant_u1",
    "mahe_u2",
    "mahe_u1",
    "vipul_u2",
    "vipul_u1",
    "nashk_u2",
    "nashk_user1",
    "nashk_u1",
}


# ---------------------------------------------------------------------------
# Roles
#
# The Role table is kept fixed to exactly these 9 roles. COMMAND and
# SHIPADMIN are reserved for the accounts already seeded with those roles in
# EXISTING_USERS / IMAGE_USERS (e.g. "1234", "shipadmin", "co", "ADMIN",
# "CMD1234"); every other user is randomly assigned one of the remaining 7
# roles instead of the role hardcoded in the data below.
# ---------------------------------------------------------------------------

ROLES_FIXED = [
    "ADMIN",
    "COMMAND",
    "DY HOD",
    "Guest user",
    "Head of Department",
    "HODWRITER",
    "Maintainer",
    "SHIPADMIN",
    "STOREKEEPER",
]

# ---------------------------------------------------------------------------
# Departments
#
# Exact department master rows from generic_db_snapshot_edited.sql.
# below. These are seeded into Master_department first so that user profiles
# can be linked by department id (FK) instead of a raw department name.
# ---------------------------------------------------------------------------

DEPARTMENTS = {
    # name: (code, dep_code)
    "ADMIN": (
        "ADMIN",
        None,
    ),
    "ENGINEERING": ("E", "02"),
    "ELECTRICAL": ("L", "03"),
    "EXECUTIVE": ("X", "04"),
    # "LOGISTICS": ("X", "04"),
    "MEDICAL": ("M", None),
    # "MET": ("MET", None),
    # "COMMUNICATION": ("", None),
    "HULL": ("H", "01"),
    # "OPS": ("Operations", None),
    # "EE": ("Electrical Engineering", None),
    # "ME": ("Marine Engineering", None),
}


# ---------------------------------------------------------------------------
# Sub-departments
#
# Exact sub-department rows from generic_db_snapshot_edited.sql.
# Master_sub_department table. That table's department_name_id values don't
# line up with this project's Department ids, so they are re-mapped to
# department codes by content:
#   source dept 2 -> ME        (OMS/E-R/AMR&CONTROLS: engine-room equipment)
#   source dept 3 -> OPS       (PGD/NDC/ASW/GG/MISSILE/VOLNA: weapon systems)
#   source dept 4 -> HULL      (standalone HULL entry)
#   source dept 6 -> EXECUTIVE (NBCD/HULL/GUNNERY/ASW/COMMUNICATION/ND/
#                                AVIATION/HYGIENE: matches the sub_department
#                                values already used by the EXECUTIVE DY HOD
#                                entries in IMAGE_USERS above)
# Names repeat (e.g. "HULL", "ASW") across different departments; that's
# expected and preserved as-is.
# ---------------------------------------------------------------------------

SUB_DEPARTMENTS = [
    # (name, department_name)
    # ("AMR&CONTROLS", "ENGINEERING"),
    ("PGD", "ELECTRICAL"),
    ("OMS", "ENGINEERING"),
    # ("NDC", "ELECTRICAL"),
    # ("ASW", "ELECTRICAL"),
    # ("GG", "ELECTRICAL"),
    # ("MISSILE", "ELECTRICAL"),
    ("LOGISTICS", "EXECUTIVE"),
    ("NBCD", "EXECUTIVE"),
    # ("HULL", "EXECUTIVE"),
    # ("OMS 1", "ENGINEERING"),
    # ("OMS 2", "ENGINEERING"),
    # ("VOLNA", "ELECTRICAL"),
    # HULL department otherwise seeds with zero Sub Departments — Auto-Assign (RHSI Master)
    # then has nowhere to route HULL equipment and always reports it "pending", no matter
    # how many times Step 1/RHSI sync reruns. Ported from Aug_15 (2026-09-10/11 SFD testing).
    ("HULL", "HULL"),
    # ("FWD E/R", "ENGINEERING"),
    # ("AFT E/R", "ENGINEERING"),
    # ("GUNNERY", "EXECUTIVE"),
    # ("ASW", "EXECUTIVE"),
    # ("COMMUNICATION", "EXECUTIVE"),
    # ("ND", "EXECUTIVE"),
    # ("AVIATION", "EXECUTIVE"),
    # ("HYGIENE", "EXECUTIVE"),
]


# Existing user seed data uses these department aliases. They resolve to the
# corresponding canonical snapshot department names.
DEPARTMENT_ALIASES = {
    "ADMIN": "ADMIN",
    "E": "ENGINEERING",
    # "EE": "ELECTRICAL ENGINEERING",
    "L": "ELECTRICAL",
    "ME": "ENGINEERING",
    "OPS": "EXECUTIVE",
    # "LOG": "LOGISTICS",
    # "LOGISTICS": "LOGISTICS",
    "EXECUTIVE": "EXECUTIVE",
    "MEDICAL": "MEDICAL",
    # "MET": "MET",
    "HULL": "HULL",
}


def canonical_department_name(value):
    if not value:
        return None
    return DEPARTMENT_ALIASES.get(value, value)


# ---------------------------------------------------------------------------
# Commands
#
# Naval command abbreviations referenced by EXISTING_USERS, expanded into
# MasterCommand records so profiles can be linked by command id.
# ---------------------------------------------------------------------------

COMMANDS = {
    "WNC": "Western Naval Command",
    "ENC": "Eastern Naval Command",
    "SNC": "Southern Naval Command",
    "ANC": "Andaman and Nicobar Command",
}


# ---------------------------------------------------------------------------
# Existing users from seed_data_2.py
#
# Format:
# (
#     username,
#     first_name,
#     last_name,
#     rank,
#     designation,
#     department,
#     role,
#     command,
#     ship,
#     access_level,
#     is_staff,
# )
#
# The rank/designation/department/role/command/ship fields are retained
# because they are part of the original seed data.
# ---------------------------------------------------------------------------

EXISTING_USERS = [
    (
        "1234",
        "System",
        "Administrator",
        "Captain",
        "Commanding Officer",
        "ADMIN",
        "ADMIN",
        "WNC",
        None,
        "0",
        True,
    ),
    # INS NILGIRI
    (
        "UA_INS_NILGIRI",
        "Unit",
        "Admin Nilgiri",
        "Lieutenant",
        "Admin Officer",
        "OPS",
        "SHIPADMIN",
        "WNC",
        None,
        "1",
        False,
    ),
    # INS KOLKATA
    (
        "UA_INS_KOLKATA",
        "Unit",
        "Admin Kolkata",
        "Lieutenant",
        "Admin Officer",
        "OPS",
        "SHIPADMIN",
        "WNC",
        None,
        "1",
        False,
    ),
    (
        "INS_KA",
        "Kolkata",
        "Admin",
        "Lieutenant",
        "Admin Officer",
        "OPS",
        "SHIPADMIN",
        "WNC",
        None,
        "1",
        False,
    ),
    (
        "LO_WRITER_INS_KOLKATA",
        "LO",
        "Writer Kolkata",
        "Petty Officer",
        "Writer",
        "EXECUTIVE",
        "STOREKEEPER",
        "WNC",
        None,
        "2",
        False,
    ),
    (
        "HOD_WRITER_INS_KOLKATA",
        "HOD",
        "Writer Kolkata",
        "Chief Petty Officer",
        "Writer",
        "ME",
        "Maintainer",
        "WNC",
        None,
        "2",
        False,
    ),
    (
        "LO_INS_KOLKATA",
        "Logistics",
        "Officer Kolkata",
        "Lieutenant",
        "Admin Officer",
        "EXECUTIVE",
        "SHIPADMIN",
        "WNC",
        None,
        "1",
        False,
    ),
    (
        "HOD_INS_KOLKATA",
        "HOD",
        "Officer Kolkata",
        "Commander",
        "HOD",
        "ME",
        "SHIPADMIN",
        "WNC",
        None,
        "1",
        False,
    ),
    # INS VIKRANT
    (
        "VIKRANT_U2",
        "Vikrant",
        "User 2",
        "Lieutenant Commander",
        "Maintainer",
        "ME",
        "Maintainer",
        "SNC",
        None,
        "2",
        False,
    ),
    (
        "VIKRANT_U1",
        "Vikrant",
        "User 1",
        "Lieutenant",
        "Maintainer",
        "ME",
        "Maintainer",
        "SNC",
        None,
        "2",
        False,
    ),
    # INS MAHE
    (
        "MAHE_U2",
        "Mahe",
        "User 2",
        "Lieutenant Commander",
        "Maintainer",
        "ME",
        "Maintainer",
        "WNC",
        None,
        "2",
        False,
    ),
    (
        "MAHE_U1",
        "Mahe",
        "User 1",
        "Lieutenant",
        "Maintainer",
        "ME",
        "Maintainer",
        "WNC",
        None,
        "2",
        False,
    ),
    # INS VIPUL
    (
        "VIPUL_U2",
        "Vipul",
        "User 2",
        "Lieutenant Commander",
        "Maintainer",
        "ME",
        "Maintainer",
        "WNC",
        None,
        "2",
        False,
    ),
    (
        "VIPUL_U1",
        "Vipul",
        "User 1",
        "Lieutenant",
        "Maintainer",
        "ME",
        "Maintainer",
        "WNC",
        None,
        "2",
        False,
    ),
    # INS NASHAK
    (
        "NASHK_U2",
        "Nashak",
        "User 2",
        "Lieutenant Commander",
        "Maintainer",
        "ME",
        "Maintainer",
        "WNC",
        None,
        "2",
        False,
    ),
    (
        "NASHK_USER1",
        "Nashak",
        "User 1",
        "Lieutenant",
        "Maintainer",
        "ME",
        "Maintainer",
        "WNC",
        None,
        "2",
        False,
    ),
    (
        "NASHK_U1",
        "Nashak",
        "User 1 Sub",
        "Lieutenant",
        "Maintainer",
        "ME",
        "Maintainer",
        "WNC",
        None,
        "2",
        False,
    ),
]


# ---------------------------------------------------------------------------
# Users from the images
#
# The screenshots provide username, role, department and designation.
# They do NOT provide personal first/last names, so those are intentionally
# kept blank rather than inventing names.
# ---------------------------------------------------------------------------

IMAGE_USERS = [
    # -----------------------------------------------------------------------
    # Department HODs
    # -----------------------------------------------------------------------
    {
        "username": "ENG1234",
        "role": "Head of Department",
        "department": "E",
        "designation": "Engineer Officer (EO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "TABAR_ENG_HOD",
        "role": "Head of Department",
        "department": "E",
        "designation": "Engineer Officer (EO)",
        "access_level": "1",
        "is_staff": False,
        "password": SEED_PASS,
    },
    {
        "username": "ELEC1234",
        "role": "Head of Department",
        "department": "L",
        "designation": "Electrical Officer (LO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "LOG1234",
        "role": "Head of Department",
        "department": "EXECUTIVE",
        "designation": "Logistics Officer (LOGO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "EXE1234",
        "role": "Head of Department",
        "department": "EXECUTIVE",
        "designation": "Executive Officer (XO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "MED1234",
        "role": "Head of Department",
        "department": "MEDICAL",
        "designation": "Medical Officer (MO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "MET1234",
        "role": "Head of Department",
        "department": "EXECUTIVE",
        "designation": "Meteorological Officer (METO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "HULL1234",
        "role": "Head of Department",
        "department": "HULL",
        "designation": "Hull Maintenance Officer (HMO)",
        "access_level": "1",
        "is_staff": False,
    },
    # -----------------------------------------------------------------------
    # Executive Deputy HODs
    # -----------------------------------------------------------------------
    {
        "username": "DYHULL",
        "role": "DY HOD",
        "department": "EXECUTIVE",
        # "sub_department": "HULL",
        "designation": "Hull Maintenance Officer (HMO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "DYNBCD",
        "role": "DY HOD",
        "department": "EXECUTIVE",
        # "sub_department": "NBCD",
        "designation": "NBCD Officer (NBCDO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "DYCOMMUNIC",
        "role": "DY HOD",
        "department": "EXECUTIVE",
        # "sub_department": "COMMUNICATION",
        "designation": "Signal Communication Officer (SCO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "DYGUNNERY",
        "role": "DY HOD",
        "department": "EXECUTIVE",
        # "sub_department": "GUNNERY",
        "designation": "Gunnery Officer (GO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "DYASW",
        "role": "DY HOD",
        "department": "EXECUTIVE",
        # "sub_department": "ASW",
        "designation": "Anti-Submarine Warfare Officer (ASWO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "DYND",
        "role": "DY HOD",
        "department": "EXECUTIVE",
        # "sub_department": "ND",
        "designation": "Navigation Officer (NO)",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "DYAVIATION",
        "role": "DY HOD",
        "department": "EXECUTIVE",
        # "sub_department": "AVIATION",
        "designation": "Aviation Officer (AVO)",
        "access_level": "1",
        "is_staff": False,
    },
    # -----------------------------------------------------------------------
    # Application users
    # -----------------------------------------------------------------------
    {
        "username": "ADMIN",
        "role": "SHIPADMIN",
        "department": "ADMIN",
        "designation": "Ship Administrator",
        "access_level": "0",
        "is_staff": True,
        "password": ADMIN_PASS,
    },
    {
        "username": "CMD1234",
        "role": "COMMAND",
        "department": "EXECUTIVE",
        "designation": "Command",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "DYEX1234",
        "role": "DY HOD",
        "department": "EXECUTIVE",
        "designation": "Deputy HOD",
        "access_level": "1",
        "is_staff": False,
    },
    {
        "username": "MAINT1234",
        "role": "Maintainer",
        "department": "E",
        "designation": "Maintainer",
        "access_level": "2",
        "is_staff": False,
    },
    {
        "username": "STORE1234",
        "role": "STOREKEEPER",
        "department": "EXECUTIVE",
        "designation": "Storekeeper",
        "access_level": "2",
        "is_staff": False,
    },
    {
        "username": "WRITER1234",
        "role": "HODWRITER",
        "department": "E",
        "designation": "HOD Writer",
        "access_level": "2",
        "is_staff": False,
    },
    {
        "username": "GUEST1234",
        "role": "Guest user",
        "department": "E",
        "designation": "Guest",
        "access_level": "2",
        "is_staff": False,
    },
]


# ---------------------------------------------------------------------------
# Nav items (rows of the matrix) -- sourced from users.rbac.NAV_ITEMS, the
# single canonical registry, so this seeder can never drift from it.
# ---------------------------------------------------------------------------

NAV_ITEMS = rbac.NAV_ITEMS

# ---------------------------------------------------------------------------
# Nav visibility matrix (columns of the matrix)
#
# role_name -> set of nav item keys visible to that role. Transcribed from
# the Nav Visibility admin screen. Role names match the literal role_name
# values already used by IMAGE_USERS above (COMMAND, DY HOD, Head of
# Department, HODWRITER, Maintainer, SHIPADMIN, STOREKEEPER) plus
# "Guest user", which matches users.rbac.ROLE_GUEST.
# ---------------------------------------------------------------------------

NAV_MATRIX = {
    "COMMAND": {
        "home",
        "activity_planner",
        "ship_configuration",
        "op_maintenance",
        "inventory",
        "ship_returns",
        "trials",
        "refit_maintenance",
        "other_utilities",
        "kms",
        "ship_crew",
        "users",
    },
    "DY HOD": {
        "home",
        "activity_planner",
        "ship_configuration",
        "op_maintenance",
        "inventory",
        "ship_returns",
        "trials",
        "refit_maintenance",
        "other_utilities",
        "kms",
        "help_desk",
        "ship_crew",
        "users",
    },
    "Guest user": {
        "home",
        "ship_crew",
    },
    "Head of Department": {
        "home",
        "activity_planner",
        "ship_configuration",
        "op_maintenance",
        "inventory",
        "ship_returns",
        "trials",
        "refit_maintenance",
        "other_utilities",
        "kms",
        "help_desk",
        "ship_crew",
        "users",
    },
    "HODWRITER": {
        "home",
        "activity_planner",
        "ship_configuration",
        "ship_returns",
        "trials",
        "kms",
        "ship_crew",
    },
    "Maintainer": {
        "home",
        "op_maintenance",
        "trials",
        "other_utilities",
        "kms",
        "ship_crew",
    },
    "SHIPADMIN": {
        "activity_planner",
        "ship_configuration",
        "op_maintenance",
        "inventory",
        "ship_returns",
        "trials",
        "refit_maintenance",
        "other_utilities",
        "kms",
        "help_desk",
        "ship_crew",
        "nav_visibility",
        "users",
    },
    "STOREKEEPER": {
        "home",
        "inventory",
        "ship_crew",
    },
    "ADMIN": {
        "home",
        "activity_planner",
        "ship_configuration",
        "op_maintenance",
        "refit_maintenance",
        "inventory",
        "ship_returns",
        "trials",
        "other_utilities",
        "kms",
        "ship_crew",
        "nav_visibility",
        "users",
        "help_desk",
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_table_name(model):
    """Return the database table name for a model."""
    return model._meta.db_table


def table_exists(model):
    """Check whether a model's database table exists."""
    if model is None:
        return False

    table_name = get_table_name(model)

    with django.db.connection.cursor() as cursor:
        return table_name in {
            table.name
            for table in django.db.connection.introspection.get_table_list(cursor)
        }


_department_cache = {}
_rank_cache = {}
_designation_cache = {}
_role_cache = {}
_command_cache = {}


def get_or_create_department(department_name):
    """Look up (or create) a Department by canonical name.

    The snapshot contains departments with duplicate/blank codes (e.g. the
    source uses code X for both EXECUTIVE and LOGISTICS), so department name
    is the stable seed key. Snapshot source IDs are retained in DEPARTMENTS
    for traceability but are not forced into the target database.
    """
    if not department_name:
        return None

    if department_name in _department_cache:
        return _department_cache[department_name]

    if not table_exists(Department):
        return None

    (
        code,
        dep_code,
    ) = DEPARTMENTS[department_name]

    # name__iexact, not name= — a case-only mismatch between this dict's key and a
    # department already in the DB (e.g. CMMS-synced "Hull" vs this seed's "HULL") used to
    # create a second duplicate Department row instead of recognising the existing one.
    # Ported from Aug_15 (2026-09-10/11 SFD testing), where this was caught live: a fresh
    # seed with a duplicate dict key created two "Hull" rows, and separately an existing DB
    # with a differently-cased department also duplicated on reseed.
    existing = Department.objects.filter(name__iexact=department_name).order_by("id")
    department = existing.first()

    if department is None:
        department = Department.objects.create(
            name=department_name,
            code=code,
            dep_code=dep_code,
            description=department_name,
            sfd_applicable=1,
        )
    elif existing.count() > 1:
        print(
            f"[WARN] {existing.count()} Department rows share name={department_name!r}; "
            f"using id={department.id} (lowest id)"
        )

    _department_cache[department_name] = department
    return department


def seed_departments():
    """Create/verify every department present in generic_db_snapshot_edited.sql."""
    print("\n" + "=" * 70)
    print("SEEDING DEPARTMENTS")
    print("=" * 70)

    for department_name, (code, dep_code) in DEPARTMENTS.items():
        department = get_or_create_department(department_name)
        if department is None:
            print(
                f"[SKIPPED] {department_name:<20} (Master_department table not found)"
            )
            continue
        print(
            f"[OK] id={department.id:<5} "
            f"name={department_name:<20} code={code or '-':<10} "
            f"dep_code={dep_code or '-':<5}"
        )


def get_or_create_sub_department(name, department_name):
    """Look up (or create) a SubDepartment by (department, name)."""
    if not name:
        return None

    if not table_exists(SubDepartment):
        return None

    department = get_or_create_department(department_name)

    sub_department, _ = SubDepartment.objects.get_or_create(
        department_name=department,
        name=name,
    )
    return sub_department


def seed_sub_departments():
    """Create/verify every sub-department present in the snapshot."""
    print("\n" + "=" * 70)
    print("SEEDING SUB-DEPARTMENTS")
    print("=" * 70)

    for name, department_name in SUB_DEPARTMENTS:
        sub_department = get_or_create_sub_department(name, department_name)
        if sub_department is None:
            print(f"[SKIPPED] {name:<20} (Master_sub_department table not found)")
            continue
        print(
            f"[OK] id={sub_department.id:<5} "
            f"name={name:<20} department={department_name:<15} "
        )


def get_or_create_rank(name):
    """Look up (or create) a Rank by name, returning the instance."""
    if not name:
        return None

    if name in _rank_cache:
        return _rank_cache[name]

    if not table_exists(Rank):
        return None

    rank, _ = Rank.objects.get_or_create(name=name)
    _rank_cache[name] = rank
    return rank


def get_or_create_designation(name):
    """Look up (or create) a Designation by name, returning the instance."""
    if not name:
        return None

    if name in _designation_cache:
        return _designation_cache[name]

    if not table_exists(Designation):
        return None

    designation, _ = Designation.objects.get_or_create(designation_name=name)
    _designation_cache[name] = designation
    return designation


def get_or_create_role(name):
    """Look up (or create) a Role by name, returning the instance."""
    if not name:
        return None

    if name in _role_cache:
        return _role_cache[name]

    if not table_exists(Role):
        return None

    role, _ = Role.objects.get_or_create(role_name=name)
    _role_cache[name] = role
    return role


def get_or_create_command(code):
    """Look up (or create) a MasterCommand by unit_name, returning the instance."""
    if not code:
        return None

    if code in _command_cache:
        return _command_cache[code]

    if not table_exists(MasterCommand):
        return None

    command = MasterCommand.objects.filter(unit_name=code).first()
    if not command:
        command = MasterCommand.objects.create(
            unit_name=code,
            command_name=COMMANDS.get(code, code),
        )
    elif command.command_name != COMMANDS.get(code, code):
        command.command_name = COMMANDS.get(code, code)
        command.save(update_fields=["command_name"])
    _command_cache[code] = command
    return command


def seed_commands():
    """Create/verify every naval command in COMMANDS in Master_master_command."""
    print("\n" + "=" * 70)
    print("SEEDING COMMANDS")
    print("=" * 70)

    for code, command_name in COMMANDS.items():
        command = get_or_create_command(code)
        if command is None:
            print(f"[SKIPPED] {code:<10} (Master_master_command table not found)")
            continue
        print(
            f"[OK] id={command.id:<5} unit_name={code:<10} command_name={command_name}"
        )


def create_or_update_profile(
    *,
    personal_number,
    first_name="",
    last_name="",
    access_level="0",
    department_code=None,
    rank_name=None,
    designation_name=None,
    role_name=None,
    command_code=None,
):
    """
    Create or update CustomUserProfile.

    The existing seed_data_2.py uses PN0001, PN0002, ... style personal
    numbers and stores firstname, lastname, credentials, active status and
    access level.
    """
    if not table_exists(CustomUserProfile):
        return None

    department = get_or_create_department(canonical_department_name(department_code))
    rank = get_or_create_rank(rank_name)
    designation = get_or_create_designation(designation_name)
    role = get_or_create_role(role_name)
    command = get_or_create_command(command_code)

    profile = CustomUserProfile.objects.filter(personal_number=personal_number).first()

    if not profile:
        profile = CustomUserProfile.objects.create(
            personal_number=personal_number,
            firstname=first_name,
            lastname=last_name,
            has_credentials=True,
            user_active=True,
            access_level=access_level,
            department=department,
            rank=rank,
            designation=designation_name or "",
            designation_master=designation,
            role_master=role,
            command_name=command,
        )
    else:
        profile.firstname = first_name
        profile.lastname = last_name
        profile.has_credentials = True
        profile.user_active = True
        profile.access_level = access_level
        profile.department = department
        profile.rank = rank
        profile.designation = designation_name or ""
        profile.designation_master = designation
        profile.role_master = role
        profile.command_name = command
        profile.save()

    return profile


def create_or_update_user(
    *,
    username,
    first_name="",
    last_name="",
    access_level="0",
    is_staff=False,
    personal_number,
    password=SEED_PASS,
    department_code=None,
    rank_name=None,
    designation_name=None,
    role_name=None,
    command_code=None,
):
    """
    Create or update a Django User.

    Username matching is case-insensitive and the stored username is
    uppercase.
    """
    raw_username = username
    username = username.upper()

    profile = create_or_update_profile(
        personal_number=personal_number,
        first_name=first_name,
        last_name=last_name,
        access_level=access_level,
        department_code=department_code,
        rank_name=rank_name,
        designation_name=designation_name,
        role_name=role_name,
        command_code=command_code,
    )

    # Existing seed logic:
    # 1234 / shipadmin / co are administrators, as are is_staff users.
    is_admin = (
        raw_username.lower()
        in {
            "1234",
        }
        or is_staff
    )

    user_defaults = {
        "is_active": True,
        "is_admin": is_admin,
    }

    if profile is not None:
        user_defaults["user_profile"] = profile

    user = User.objects.filter(username__iexact=username).first()

    created = False

    if not user:
        user = User.objects.create(
            username=username,
            **user_defaults,
        )
        created = True
    else:
        for field, value in user_defaults.items():
            setattr(user, field, value)

        user.save()

    user.set_password(password)
    user.save()

    return user, created


# ---------------------------------------------------------------------------
# User seeder
# ---------------------------------------------------------------------------


@transaction.atomic
def seed_users():
    """
    Seed all application users.

    Sources:
        1. Existing users from seed_data_2.py
        2. Users supplied in the UI screenshots
    """

    created_count = 0
    updated_count = 0

    # -----------------------------------------------------------------------
    # 0. Departments
    # -----------------------------------------------------------------------

    seed_departments()
    seed_sub_departments()

    # -----------------------------------------------------------------------
    # 1. Existing users from seed_data_2.py
    # -----------------------------------------------------------------------

    print("\n" + "=" * 70)
    print("SEEDING EXISTING USERS")
    print("=" * 70)

    personal_number = 1

    for (
        username,
        first_name,
        last_name,
        rank,
        designation,
        department,
        role,
        command,
        ship,
        access_level,
        is_staff,
    ) in EXISTING_USERS:
        user, created = create_or_update_user(
            username=username,
            first_name=first_name,
            last_name=last_name,
            access_level=access_level,
            is_staff=is_staff,
            personal_number=f"PN{personal_number:04d}",
            password=(
                ADMIN_PASS
                if username.lower() in ADMIN_PASSWORD_USERNAMES
                else SEED_PASS
            ),
            department_code=department,
            rank_name=rank,
            designation_name=designation,
            role_name=role,
            command_code=command,
        )

        if created:
            created_count += 1
            action = "CREATED"
        else:
            updated_count += 1
            action = "UPDATED"

        profile = user.user_profile

        print(
            f"[{action}] "
            f"{user.username:<25} "
            f"department_id={(profile.department_id if profile else None) or '-':<5} "
            f"rank_id={(profile.rank_id if profile else None) or '-':<5} "
            f"designation_master_id={(profile.designation_master_id if profile else None) or '-':<5} "
            f"role_master_id={(profile.role_master_id if profile else None) or '-':<5} "
            f"command_name_id={(profile.command_name_id if profile else None) or '-':<5}"
        )

        personal_number += 1

    # -----------------------------------------------------------------------
    # 2. Users from images
    # -----------------------------------------------------------------------

    print("\n" + "=" * 70)
    print("SEEDING USERS FROM IMAGES")
    print("=" * 70)

    for user_data in IMAGE_USERS:
        username = user_data["username"]

        user, created = create_or_update_user(
            username=username,
            first_name=user_data.get("first_name", ""),
            last_name=user_data.get("last_name", ""),
            access_level=user_data.get("access_level", "0"),
            is_staff=user_data.get("is_staff", False),
            personal_number=f"PN{personal_number:04d}",
            password=user_data.get("password", SEED_PASS),
            department_code=user_data.get("department"),
            designation_name=user_data.get("designation"),
            role_name=user_data.get("role"),
        )

        if created:
            created_count += 1
            action = "CREATED"
        else:
            updated_count += 1
            action = "UPDATED"

        print(
            f"[{action}] "
            f"{user.username:<25} "
            f"role={role or '-':<20} "
            f"department_id={user.department_id or '-':<15} "
            f"designation={user_data.get('designation') or '-'}"
        )

        personal_number += 1

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------

    total_users = User.objects.count()

    print("\n" + "=" * 70)
    print("USER SEED COMPLETED")
    print("=" * 70)
    print(f"Created : {created_count}")
    print(f"Updated : {updated_count}")
    print(f"Total DB users : {total_users}")
    print("=" * 70)


# ---------------------------------------------------------------------------
# Nav visibility seeder
# ---------------------------------------------------------------------------


# def seed_nav_items():
#     """Create/update the NavItem registry (rows of the matrix)."""
#     print("\n" + "=" * 70)
#     print("SEEDING NAV ITEMS")
#     print("=" * 70)

#     if not table_exists(NavItem):
#         print("[SKIPPED] nav_item table not found")
#         return {}

#     items = {}

#     for key, label, order in NAV_ITEMS:
#         item, created = NavItem.objects.get_or_create(
#             key=key, defaults={"label": label, "order": order, "is_active": True}
#         )
#         if not created and (item.label != label or item.order != order):
#             item.label = label
#             item.order = order
#             item.save(update_fields=["label", "order"])

#         items[key] = item
#         action = "CREATED" if created else "OK"
#         print(f"[{action}] key={key:<20} label={label:<20} order={order}")

#     return items


# def seed_nav_visibility(items):
#     """Create/update every NavVisibility cell to match NAV_MATRIX."""
#     print("\n" + "=" * 70)
#     print("SEEDING NAV VISIBILITY")
#     print("=" * 70)

#     if not table_exists(NavVisibility):
#         print("[SKIPPED] nav_visibility table not found")
#         return

#     all_keys = [key for key, _label, _order in NAV_ITEMS]

#     for role_name, visible_keys in NAV_MATRIX.items():
#         role = get_or_create_role(role_name)
#         if role is None:
#             print(f"[SKIPPED] role={role_name:<20} (Role table not found)")
#             continue

#         for key in all_keys:
#             item = items.get(key)
#             if item is None:
#                 continue

#             is_visible = key in visible_keys

#             cell, created = NavVisibility.objects.get_or_create(
#                 role=role, nav_item=item, defaults={"is_visible": is_visible}
#             )
#             if not created and cell.is_visible != is_visible:
#                 cell.is_visible = is_visible
#                 cell.save(update_fields=["is_visible"])

#         print(
#             f"[OK] role={role_name:<20} visible={len(visible_keys):>2}/{len(all_keys)}"
#         )


# @transaction.atomic
# def seed_nav_visibility_data():
#     items = seed_nav_items()
#     seed_nav_visibility(items)

#     print("\n" + "=" * 70)
#     print("NAV VISIBILITY SEED COMPLETED")
#     print("=" * 70)
#     print(f"Nav items : {NavItem.objects.count() if table_exists(NavItem) else 0}")
#     print(
#         f"Nav cells : "
#         f"{NavVisibility.objects.count() if table_exists(NavVisibility) else 0}"
#     )
#     print("=" * 70)


# ---------------------------------------------------------------------------
# Main seeder
# ---------------------------------------------------------------------------


@transaction.atomic
def seed_reference_data():
    """Seed only the master/reference rows SWMM still owns after the
    authz_service cutover: departments, sub-departments, naval commands, and
    the fixed ``Role`` name rows that ``users/rbac.py`` looks up by name (it
    maps an authz ``role_code`` -> ``Role.role_name``). Users, credentials and
    the nav-visibility matrix now belong to authz_service and are NOT seeded
    here."""
    seed_departments()
    seed_sub_departments()
    seed_commands()
    seed_users()

    print("\n" + "=" * 70)
    print("SEEDING FIXED ROLES")
    print("=" * 70)
    for role_name in ROLES_FIXED:
        role = get_or_create_role(role_name)
        print(f"[OK] role={role_name}" if role else f"[SKIPPED] role={role_name}")


def seed_all():
    """Run every seeder SWMM still owns. authz_service (userauth/) is now the
    sole identity provider: user rows, credentials and the nav matrix are
    seeded there via ``seed_rbac --org-ids``, not here.

    The legacy ``seed_users()`` + ``seed_nav_visibility_data()`` are kept in
    this module for reference / a pre-cutover checkout but are no longer
    called."""
    seed_reference_data()

    return True


# ---------------------------------------------------------------------------
# Script entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    seed_all()
