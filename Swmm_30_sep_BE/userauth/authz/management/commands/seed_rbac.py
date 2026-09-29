"""Idempotent RBAC seed.

    python manage.py seed_rbac [--super-admin-username SVC_ADMIN --super-admin-password ...]

Creates: privileges, access levels (SUPER_ADMIN -> ... -> SHIP), a default
Process, the canonical roles + the SWMM-derived roles (all with stable codes),
a full RoleMenuMapping for the RBAC-admin menu, the nav items + nav-visibility
matrix, and one SUPER_ADMIN account. Safe to re-run.

Deliverable #3.
"""

import csv
import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from authz import rbac
from authz.models import (
    AccessLevel,
    Menu,
    NavItem,
    NavVisibility,
    Privilege,
    Process,
    RoleMenuMapping,
    RoleProcessMapping,
    UserMenuMapping,
    UserProcessRoleMapping,
    UserRole,
)

User = get_user_model()

PRIVILEGES = [
    ("View", "view"),
    ("Add", "add"),
    ("Edit", "edit"),
    ("Delete", "delete"),
    ("Export", "export"),
]

ACCESS_LEVELS = [
    ("Super Admin", "SUPER_ADMIN", 1),
    ("NHQ", "NHQ", 2),
    ("Command", "COMMAND", 3),
    ("AA/OA", "AA_OA", 4),
    ("NATAA", "NATAA", 5),
    ("Trial Agency", "TRIAL_AGENCY", 6),
    ("Satellite Unit", "SATELLITE_UNIT", 7),
    ("Ship", "SHIP", 8),
]

ROLES = [
    ("Super Admin", rbac.ROLE_SUPER_ADMIN, 0),
    ("Command Admin", rbac.ROLE_COMMAND_ADMIN, 10),
    ("Unit Admin", rbac.ROLE_UNIT_ADMIN, 20),
    ("Approver", rbac.ROLE_APPROVER, 30),
    ("Recommender", rbac.ROLE_RECOMMENDER, 40),
    ("Initiator", rbac.ROLE_INITIATOR, 50),
    # Canonical low-authority role. Display name is "Guest user" -- it doubles
    # as the SWMM "Guest user" role and the nav fallback role; code stays USER.
    ("Guest user", rbac.ROLE_USER, 90),
    # --- SWMM-derived roles (seed_all.py port). Coexist with the canonical set;
    # ranks are slotted between the canonical ranks. ADMIN + SHIPADMIN are
    # admin-ish -- see authz.rbac.ROLE_AUTHORITY / NAV_VISIBILITY_LOCKED_ROLES.
    # NOTE: the SWMM "COMMAND" role was folded into the canonical "Command Admin"
    # (code COMMAND_ADMIN, rank 10) -- they were the same command-level admin.
    ("ADMIN", rbac.ROLE_ADMIN, 5),
    ("SHIPADMIN", rbac.ROLE_SHIPADMIN, 25),
    ("Head of Department", rbac.ROLE_HOD, 35),
    ("DY HOD", rbac.ROLE_DY_HOD, 45),
    ("HODWRITER", rbac.ROLE_HODWRITER, 55),
    ("Maintainer", rbac.ROLE_MAINTAINER, 65),
    ("STOREKEEPER", rbac.ROLE_STOREKEEPER, 75),
]

NAV_ITEMS = [
    # SWMM nav registry (seed_all.py / users.rbac.NAV_ITEMS); labels + order
    # supplied by the product owner.
    ("home", "Home", 10),
    ("activity_planner", "Activity Planner", 20),
    ("ship_configuration", "Ship Configuration", 30),
    ("op_maintenance", "Op. Maintenance", 40),
    ("inventory", "Inventory", 50),
    ("ship_returns", "Ship Returns", 60),
    ("trials", "Trials", 65),
    ("refit_maintenance", "Refit Maintenance", 70),
    ("other_utilities", "Other Utilities", 80),
    ("kms", "KMS", 85),
    ("help_desk", "Help Desk", 90),
    ("ship_crew", "Ship Crew", 100),
    ("nav_visibility", "Nav Visibility", 110),
    ("users", "Users", 120),
    # Canonical authz nav items, retained alongside the SWMM set.
    ("role_requests", "Role Requests", 130),
    ("delegation", "Delegation", 140),
    ("rbac_admin", "RBAC Admin", 150),
]

# SWMM nav-visibility matrix (seed_all.py NAV_MATRIX + the canonical authz
# roles), keyed by role DISPLAY NAME. A role listed here gets an explicit
# NavVisibility row for every nav item (ticked / unticked per the set) and a
# RoleMenuMapping (all actions) for each ticked key; roles NOT listed keep the
# USER-fallback behaviour in rbac.visible_nav_keys and get no role-menu rows.
NAV_MATRIX = {
    # (the SWMM "COMMAND" role folded into "Command Admin" below.)
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
    # --- canonical authz roles. The two admin roles mirror their SWMM
    # analogues (COMMAND / SHIPADMIN) plus role_requests; the workflow trio
    # (Approver / Recommender / Initiator) differ from each other by action,
    # not by screen visibility, so they share the operational screen set.
    "Command Admin": {
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
        "nav_visibility",
        "role_requests",
    },
    "Unit Admin": {
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
        "role_requests",
    },
    "Approver": {
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
    },
    "Recommender": {
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
    },
    "Initiator": {
        "home",
        "activity_planner",
        "op_maintenance",
        "inventory",
        "ship_returns",
        "trials",
        "refit_maintenance",
        "kms",
        "help_desk",
        "ship_crew",
    },
}


# --------------------------------------------------------------------------
# SWMM user port (seed_all.py). Rank / designation / sub-department master data
# is DROPPED; the org columns the authz_service profile DOES have
# (department_id/name, ship_id/name) plus the UserAccessLevel command/ship ids
# are populated from --org-ids (real SWMM master PKs) when supplied -- see
# _load_org_ids / _seed_swmm_users. Every user gets ONE role in the DEFAULT
# process and ONE UserAccessLevel row.
# --------------------------------------------------------------------------
SEED_PASS = "12345"
ADMIN_PASS = "admin"

# access_level string in the SWMM data -> AccessLevel.access_level_code here.
ACCESS_LEVEL_MAP = {"0": "SUPER_ADMIN", "1": "COMMAND", "2": "SHIP"}

# FALLBACK command ids for the COMMAND access level, used only when --org-ids is
# not supplied. With --org-ids these are ignored in favour of the real
# Master_master_command PKs. Users with neither get a COMMAND row with
# command_id=None (empty scope until an id is set).
COMMAND_IDS = {"WNC": 1, "ENC": 2, "SNC": 3, "ANC": 4}

# (username, firstname, lastname, role display name, command, access_level,
#  department) -- department is the canonical SWMM Department name (or an alias
#  from seed_all.py::DEPARTMENT_ALIASES); it is looked up in the --org-ids
#  "departments" map to a real Master_department PK. From seed_all.py
#  EXISTING_USERS + IMAGE_USERS, minus the 16 ADMIN_PASS users that moved to
#  TRIALS_USERS below = 23 rows.
SWMM_USERS = [
    ("1234", "System", "Administrator", "Super Admin", "ANC", "0", "ADMIN"),
    ("ENG1234", "Engineering", "User", "Head of Department", "ENC", "1", "ENGINEERING"),
    (
        "TABAR_ENG_HOD",
        "Tabar Engineering",
        "User",
        "Head of Department",
        "ENC",
        "1",
        "ENGINEERING",
    ),
    ("ELEC1234", "Electronic", "User", "Head of Department", "ENC", "1", "ELECTRICAL"),
    ("LOG1234", "Logistics", "User", "DY HOD", "ENC", "1", "EXECUTIVE"),
    ("EXE1234", "Executive", "User", "Head of Department", "ENC", "1", "EXECUTIVE"),
    ("MED1234", "Medical", "User", "Head of Department", "ENC", "1", "MEDICAL"),
    ("MET1234", "Meteolicical", "User", "Head of Department", "ENC", "1", "EXECUTIVE"),
    ("HULL1234", "Hull", "User", "Head of Department", "SNC", "1", "HULL"),
    ("DYHULL", "Dy Hull", "User", "DY HOD", "SNC", "1", "EXECUTIVE"),
    ("DYNBCD", "Dy MBCD", "User", "DY HOD", "SNC", "1", "EXECUTIVE"),
    ("DYCOMMUNIC", "Dy Communication", "User", "DY HOD", "SNC", "1", "EXECUTIVE"),
    ("DYGUNNERY", "Dy Gunner", "User", "DY HOD", "ANC", "1", "EXECUTIVE"),
    ("DYASW", "Dy ASW", "User", "DY HOD", "SNC", "1", "EXECUTIVE"),
    ("DYND", "Dy Nd", "User", "DY HOD", "WNC", "1", "EXECUTIVE"),
    ("DYAVIATION", "Dy Aviation", "User", "DY HOD", "ENC", "1", "EXECUTIVE"),
    ("ADMIN", "Ship", "Admin", "SHIPADMIN", "ENC", "0", "ADMIN"),
    ("CMD1234", "Command", "User", "Command Admin", "ENC", "1", "EXECUTIVE"),
    ("DYEX1234", "Dy Executive", "User", "DY HOD", "WNC", "1", "EXECUTIVE"),
    ("MAINT1234", "Maintainer", "User", "Maintainer", "WNC", "2", "ENGINEERING"),
    ("STORE1234", "Store", "User", "STOREKEEPER", "WNC", "2", "EXECUTIVE"),
    ("WRITER1234", "HOD", "Writer", "HODWRITER", "SNC", "2", "ENGINEERING"),
    ("GUEST1234", "Guest", "User", "Guest user", "ANC", "2", "ENGINEERING"),
]

# Same 7-tuple shape as SWMM_USERS. The former ADMIN_PASSWORD_USERNAMES set,
# reshaped and given canonical workflow roles (Unit Admin / Approver /
# Recommender / Initiator) by username prefix. command / access_level /
# department carried over from their seed_all.py EXISTING_USERS rows.
TRIALS_USERS = [
    ("UA_INS_NILGIRI", "Unit", "Admin Nilgiri", "Unit Admin", "WNC", "1", "EXECUTIVE"),
    ("UA_INS_KOLKATA", "Unit", "Admin Kolkata", "Unit Admin", "WNC", "1", "EXECUTIVE"),
    ("INS_KA", "Kolkata", "Admin", "Unit Admin", "WNC", "1", "EXECUTIVE"),
    (
        "LO_INS_KOLKATA",
        "Logistics",
        "Officer Kolkata",
        "Approver",
        "WNC",
        "1",
        "LOGISTICS",
    ),
    (
        "HOD_INS_KOLKATA",
        "HOD",
        "Officer Kolkata",
        "Approver",
        "WNC",
        "1",
        "ENGINEERING",
    ),
    (
        "LO_WRITER_INS_KOLKATA",
        "LO",
        "Writer Kolkata",
        "Recommender",
        "WNC",
        "2",
        "LOGISTICS",
    ),
    (
        "HOD_WRITER_INS_KOLKATA",
        "HOD",
        "Writer Kolkata",
        "Recommender",
        "WNC",
        "2",
        "ENGINEERING",
    ),
    ("VIKRANT_U1", "Vikrant", "User 1", "Initiator", "SNC", "2", "ENGINEERING"),
    ("VIKRANT_U2", "Vikrant", "User 2", "Initiator", "SNC", "2", "ENGINEERING"),
    ("MAHE_U1", "Mahe", "User 1", "Initiator", "WNC", "2", "ENGINEERING"),
    ("MAHE_U2", "Mahe", "User 2", "Initiator", "WNC", "2", "ENGINEERING"),
    ("VIPUL_U1", "Vipul", "User 1", "Initiator", "WNC", "2", "ENGINEERING"),
    ("VIPUL_U2", "Vipul", "User 2", "Initiator", "WNC", "2", "ENGINEERING"),
    ("NASHK_U1", "Nashak", "User 1 Sub", "Initiator", "WNC", "2", "ENGINEERING"),
    ("NASHK_USER1", "Nashak", "User 1", "Initiator", "WNC", "2", "ENGINEERING"),
    ("NASHK_U2", "Nashak", "User 2", "Initiator", "WNC", "2", "ENGINEERING"),
    # Throwaway account for manually verifying the itttm sync end-to-end.
    ("ITTTM_TEST", "Itttm", "Test", "Maintainer", "WNC", "2", "ENGINEERING"),
]

# Lower-cased usernames seeded with ADMIN_PASS instead of SEED_PASS -- exactly
# the TRIALS_USERS set (was a hand-listed copy of seed_all.py's credentials).
ADMIN_PASSWORD_USERNAMES = frozenset(row[0].lower() for row in TRIALS_USERS)

# itttm_backend_microservice's own role vocabulary for the accounts above, keyed
# the same way as ADMIN_PASSWORD_USERNAMES. Ported from seed_all.py's
# ITTTM_ROLE_NAMES. Deliberately separate from the `role_name` value in
# TRIALS_USERS -- that value drives local RBAC (a seeded `UserRole`), which
# must stay untouched; these are itttm-side role strings sent by
# authz.itttm_sync.sync_user_to_itttm, called from _seed_swmm_users below.
ITTTM_ROLE_NAMES = {
    "ua_ins_nilgiri": "Unit Admin",
    "ua_ins_kolkata": "Unit Admin",
    "ins_ka": "User",
    "lo_writer_ins_kolkata": "User",
    "hod_writer_ins_kolkata": "User",
    "lo_ins_kolkata": "User",
    "hod_ins_kolkata": "User",
    "vikrant_u2": "User",
    "vikrant_u1": "User",
    "mahe_u2": "User",
    "mahe_u1": "User",
    "vipul_u2": "User",
    "vipul_u1": "User",
    "nashk_u2": "User",
    "nashk_user1": "User",
    "nashk_u1": "User",
    "itttm_test": "User",
}

# is_staff / is_admin in seed_all.py: only "1234" and "ADMIN".
SWMM_ADMIN_USERNAMES = {"1234", "ADMIN"}

# --------------------------------------------------------------------------
# SWMM master reference data -- transcribed from swmm/seed_all.py so the
# accounts master tables (Department / SubDepartment / MasterCommand / Rank /
# Designation, added for the SWMM login-response ``profile`` block) carry the
# same canonical rows. Seeded by Command._seed_master_data(); the SWMM user
# rows below then link to them.
# --------------------------------------------------------------------------

# name -> (code, dep_code). seed_all.py::DEPARTMENTS + its commented-out
# "LOGISTICS": ("X", "04") row (TRIALS_USERS reference department "LOGISTICS").
MASTER_DEPARTMENTS = {
    "ADMIN": ("ADMIN", None),
    "ENGINEERING": ("E", "02"),
    "ELECTRICAL": ("L", "03"),
    "EXECUTIVE": ("X", "04"),
    "MEDICAL": ("M", None),
    "HULL": ("H", "01"),
}

# (sub-department name, parent department name). seed_all.py::SUB_DEPARTMENTS.
MASTER_SUB_DEPARTMENTS = [
    ("PGD", "ELECTRICAL"),
    ("OMS", "ENGINEERING"),
    ("LOGISTICS", "EXECUTIVE"),
    ("NBCD", "EXECUTIVE"),
]

# code -> (unit_name, command_name). seed_all.py::COMMANDS. ``code`` is the
# stable (unique) key; ``command_name`` is what the HRCDF login enrichment
# matches on to set ``profile.command_ref``. The SWMM user rows below reference
# commands by ``code``.
MASTER_COMMANDS = {
    "WNC": ("WNC", "Western Naval Command"),
    "ENC": ("ENC", "Eastern Naval Command"),
    "SNC": ("SNC", "Southern Naval Command"),
    "ANC": ("ANC", "Andaman and Nicobar Command"),
}

# Unit master (sheet ``Unit_Mst_03aug`` of "unit master with full form.xlsx"),
# columns: code, name, command_code, description. ``code`` is the stable
# (unique) key; ``name`` is what the HRCDF login enrichment matches on to set
# ``profile.unit_ref``. A command_code that is not a MASTER_COMMANDS key (NHQ,
# OTHERS, NA) leaves the unit's command NULL.
MASTER_UNITS_CSV = Path(__file__).resolve().parent.parent / "data" / "master_units.csv"


def _load_master_units():
    """[(code, name, command_code, description)] from ``MASTER_UNITS_CSV``."""
    with open(MASTER_UNITS_CSV, newline="", encoding="utf-8") as handle:
        return [
            (row["code"], row["name"], row["command_code"], row["description"])
            for row in csv.DictReader(handle)
        ]


# Distinct rank strings in seed_all.py::EXISTING_USERS.
MASTER_RANKS = [
    "Captain",
    "Commander",
    "Lieutenant Commander",
    "Lieutenant",
    "Chief Petty Officer",
    "Petty Officer",
]

# Distinct designation strings in seed_all.py::EXISTING_USERS + IMAGE_USERS.
MASTER_DESIGNATIONS = [
    "Commanding Officer",
    "Admin Officer",
    "Writer",
    "HOD",
    "Maintainer",
    "Engineer Officer (EO)",
    "Electrical Officer (LO)",
    "Logistics Officer (LOGO)",
    "Executive Officer (XO)",
    "Medical Officer (MO)",
    "Meteorological Officer (METO)",
    "Hull Maintenance Officer (HMO)",
    "NBCD Officer (NBCDO)",
    "Signal Communication Officer (SCO)",
    "Gunnery Officer (GO)",
    "Anti-Submarine Warfare Officer (ASWO)",
    "Navigation Officer (NO)",
    "Aviation Officer (AVO)",
    "Ship Administrator",
    "Command",
    "Deputy HOD",
    "Storekeeper",
    "HOD Writer",
    "Guest",
]

# username -> (rank name | None, designation name). Per-user rank/designation
# from seed_all.py::EXISTING_USERS (rank + designation) and ::IMAGE_USERS
# (designation only -> rank None). Used to link SWMM_USERS / TRIALS_USERS
# profiles to the master rows above.
SWMM_USER_RANK_DESIGNATION = {
    "1234": (None, "Ship Administrator"),
    "UA_INS_NILGIRI": ("Lieutenant", "Admin Officer"),
    "UA_INS_KOLKATA": ("Lieutenant", "Admin Officer"),
    "INS_KA": ("Lieutenant", "Admin Officer"),
    "LO_WRITER_INS_KOLKATA": ("Petty Officer", "Writer"),
    "HOD_WRITER_INS_KOLKATA": ("Chief Petty Officer", "Writer"),
    "LO_INS_KOLKATA": ("Lieutenant", "Admin Officer"),
    "HOD_INS_KOLKATA": ("Commander", "HOD"),
    "VIKRANT_U1": ("Lieutenant", "Maintainer"),
    "VIKRANT_U2": ("Lieutenant Commander", "Maintainer"),
    "MAHE_U1": ("Lieutenant", "Maintainer"),
    "MAHE_U2": ("Lieutenant Commander", "Maintainer"),
    "VIPUL_U1": ("Lieutenant", "Maintainer"),
    "VIPUL_U2": ("Lieutenant Commander", "Maintainer"),
    "NASHK_U1": ("Lieutenant", "Maintainer"),
    "NASHK_USER1": ("Lieutenant", "Maintainer"),
    "NASHK_U2": ("Lieutenant Commander", "Maintainer"),
    "ENG1234": (None, "Engineer Officer (EO)"),
    "TABAR_ENG_HOD": (None, "Engineer Officer (EO)"),
    "ELEC1234": (None, "Electrical Officer (LO)"),
    "LOG1234": (None, "Logistics Officer (LOGO)"),
    "EXE1234": (None, "Executive Officer (XO)"),
    "MED1234": (None, "Medical Officer (MO)"),
    "MET1234": (None, "Meteorological Officer (METO)"),
    "HULL1234": (None, "Hull Maintenance Officer (HMO)"),
    "DYHULL": (None, "Hull Maintenance Officer (HMO)"),
    "DYNBCD": (None, "NBCD Officer (NBCDO)"),
    "DYCOMMUNIC": (None, "Signal Communication Officer (SCO)"),
    "DYGUNNERY": (None, "Gunnery Officer (GO)"),
    "DYASW": (None, "Anti-Submarine Warfare Officer (ASWO)"),
    "DYND": (None, "Navigation Officer (NO)"),
    "DYAVIATION": (None, "Aviation Officer (AVO)"),
    "ADMIN": (None, "Ship Administrator"),
    "CMD1234": (None, "Command"),
    "DYEX1234": (None, "Deputy HOD"),
    "MAINT1234": (None, "Maintainer"),
    "STORE1234": (None, "Storekeeper"),
    "WRITER1234": (None, "HOD Writer"),
    "GUEST1234": (None, "Guest"),
}


class Command(BaseCommand):
    help = "Idempotently seed processes, roles, access levels, menus, privileges, a SUPER_ADMIN."

    def add_arguments(self, parser):
        parser.add_argument("--super-admin-username", default="SVC_ADMIN")
        parser.add_argument("--super-admin-password", default="change-me-now-01")
        parser.add_argument("--process-code", default="DEFAULT")
        parser.add_argument("--process-name", default="Default Process")
        parser.add_argument(
            "--org-ids",
            default=None,
            help=(
                "Path to a JSON file of real SWMM master PKs "
                '({"commands": {...}, "departments": {...}, "ships": {...}}), '
                "produced by SWMM's `manage.py dump_org_ids`. When given, the "
                "ported users get real department_id / ship_id / command_id "
                "instead of the COMMAND_IDS placeholders."
            ),
        )

    @staticmethod
    def _load_org_ids(path):
        """Return {"commands": {}, "departments": {}, "ships": {}} from the
        --org-ids JSON file, or all-empty dicts when no path is given / the file
        is missing. Keys are whatever the SWMM seed rows carry (a command code
        like ``WNC``, a department name/alias like ``ENGINEERING`` / ``E``)."""
        empty = {"commands": {}, "departments": {}, "ships": {}}
        if not path:
            return empty
        try:
            with open(path, encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError) as exc:  # missing / unreadable / bad JSON
            raise CommandError(f"--org-ids: cannot read {path!r}: {exc}") from exc
        return {section: dict(data.get(section) or {}) for section in empty}

    @transaction.atomic
    def handle(self, *args, **opts):
        self._log = self.stdout.write if opts.get("verbosity", 1) else lambda *_: None
        privileges = {
            code: Privilege.objects.get_or_create(code=code, defaults={"name": name})[0]
            for name, code in PRIVILEGES
        }
        self._log(f"privileges: {len(privileges)}")

        parent = None
        for name, code, seq in ACCESS_LEVELS:
            parent = AccessLevel.objects.update_or_create(
                access_level_code=code,
                defaults={"name": name, "sequence": seq, "parent": parent},
            )[0]
        self._log(f"access levels: {AccessLevel.objects.count()}")

        process = Process.objects.get_or_create(
            code=opts["process_code"],
            defaults={"name": opts["process_name"]},
        )[0]

        roles = {}
        for name, code, rank in ROLES:
            roles[code] = UserRole.objects.update_or_create(
                code=code,
                defaults={"name": name, "authority_rank": rank},
            )[0]
            RoleProcessMapping.objects.get_or_create(
                user_role=roles[code], process=process
            )
        self._log(f"roles: {len(roles)}")

        rbac_menu = Menu.objects.get_or_create(
            code=rbac.RBAC_ADMIN_MENU_CODE,
            defaults={
                "name": "RBAC Admin",
                "url": "/rbac",
                "sequence": 90,
            },
        )[0]
        # SUPER_ADMIN gets every action on the RBAC-admin menu in this process.
        rmm = RoleMenuMapping.objects.get_or_create(
            process=process,
            role=roles[rbac.ROLE_SUPER_ADMIN],
            menu=rbac_menu,
            access_level=None,
            unit_id=None,
        )[0]
        rmm.privileges.set(privileges.values())

        # Every nav entry gets a paired authorization Menu (code == key), so the
        # two tables stay 1:1: NavVisibility keeps driving what shows in the
        # sidebar, while the linked Menu is where that screen's action-level
        # privileges (RoleMenuMapping) live. rbac_admin's Menu is already seeded
        # above, so get_or_create just reuses it.
        nav_items = {}
        nav_menus = {}
        for key, label, order in NAV_ITEMS:
            item, created = NavItem.objects.get_or_create(
                key=key, defaults={"label": label, "order": order}
            )
            menu = Menu.objects.get_or_create(
                code=key,
                defaults={"name": label, "url": f"/{key}", "sequence": order},
            )[0]
            if item.menu_id != menu.id:
                item.menu = menu
                item.save(update_fields=["menu"])
            nav_items[key] = item
            nav_menus[key] = menu
            NavVisibility.objects.update_or_create(
                role=roles[rbac.ROLE_SUPER_ADMIN],
                nav_item=item,
                defaults={"is_visible": True},
            )
            NavVisibility.objects.get_or_create(
                role=roles[rbac.ROLE_USER],
                nav_item=item,
                defaults={"is_visible": key == "home"},
            )

        # SWMM nav-visibility matrix. Runs after the SUPER_ADMIN / USER pass and
        # uses update_or_create, so a matrix row (e.g. "Guest user" -> ship_crew)
        # wins over the coarse default set above.
        roles_by_name = {r.name: r for r in roles.values()}
        for role_name, visible_keys in NAV_MATRIX.items():
            matrix_role = roles_by_name.get(role_name)
            if matrix_role is None:
                self._log(
                    self.style.WARNING(
                        f"NAV_MATRIX: no seeded role named {role_name!r}; skipped"
                    )
                )
                continue
            for key, item in nav_items.items():
                NavVisibility.objects.update_or_create(
                    role=matrix_role,
                    nav_item=item,
                    defaults={"is_visible": key in visible_keys},
                )
        self._log(f"nav items: {NavItem.objects.count()}")

        # --- SUPER_ADMIN account ---
        from accounts.models import CustomUserProfile

        username = opts["super_admin_username"].strip().upper()
        user = User.objects.filter(username=username).first()
        if user is None:
            profile = CustomUserProfile.objects.create(
                firstname="Service",
                lastname="Admin",
                approval_status="APPROVED",
                user_active=True,
                has_credentials=True,
            )
            user = User(username=username, user_profile=profile, is_admin=True)
            user.set_password(opts["super_admin_password"])
            user.save()
            self._log(
                self.style.WARNING(
                    f"created SUPER_ADMIN {username} -- CHANGE THE PASSWORD."
                )
            )
        else:
            if user.user_profile is None:
                user.user_profile = CustomUserProfile.objects.create(
                    firstname="Service",
                    lastname="Admin",
                    approval_status="APPROVED",
                    user_active=True,
                    has_credentials=True,
                )
            user.user_profile.approval_status = "APPROVED"
            user.user_profile.has_credentials = True
            user.user_profile.user_active = True
            user.user_profile.save()
            user.is_admin = True
            user.is_active = True
            user.save()

        # denormalized home role on the profile (accounts.CustomUserProfile.role)
        sa_role = roles[rbac.ROLE_SUPER_ADMIN]
        if user.user_profile and user.user_profile.role_id != sa_role.id:
            user.user_profile.role = sa_role
            user.user_profile.save(update_fields=["role"])

        role_process = RoleProcessMapping.objects.get(
            user_role=roles[rbac.ROLE_SUPER_ADMIN], process=process
        )
        UserProcessRoleMapping.objects.get_or_create(
            user=user, process_role=role_process, defaults={"is_active": True}
        )
        AccessLevel.objects.filter(access_level_code="SUPER_ADMIN").first()
        from authz.models import UserAccessLevel

        UserAccessLevel.objects.get_or_create(
            user=user,
            access_level=AccessLevel.objects.get(access_level_code="SUPER_ADMIN"),
            defaults={"is_active": True},
        )

        self._seed_master_data()
        self._seed_swmm_users(process, roles, self._load_org_ids(opts.get("org_ids")))
        self._seed_menu_mappings(
            process, roles_by_name, nav_menus, list(privileges.values())
        )

        self._log(self.style.SUCCESS("seed_rbac complete."))

    @staticmethod
    def _upsert_command(code, unit_name, command_name):
        """Create/update the ``LocalCopyMasterCommand`` keyed on ``code``. A row
        from an older seed (keyed on ``unit_name``, ``code`` NULL) is adopted
        rather than duplicated."""
        from accounts.models import LocalCopyMasterCommand as LocalCommand

        cmd = (
            LocalCommand.objects.filter(code=code).first()
            or LocalCommand.objects.filter(
                code__isnull=True, unit_name=unit_name
            ).first()
            or LocalCommand(code=code)
        )
        cmd.code = code
        cmd.unit_name = unit_name
        cmd.command_name = command_name
        cmd.save()
        return cmd

    def _seed_master_data(self):
        """Idempotently seed the accounts master tables (Department /
        SubDepartment / MasterCommand / MasterUnit / Rank / Designation) from
        the SWMM reference data (swmm/seed_all.py DEPARTMENTS / SUB_DEPARTMENTS
        / COMMANDS + MASTER_UNITS + the distinct rank/designation strings).
        These back the SWMM login response's ``profile`` ``*_detail`` blocks and
        the HRCDF ``command_ref`` / ``unit_ref`` lookups."""
        from accounts.models import LocalCopyDepartment as LocalDepartment
        from accounts.models import LocalCopyDesignation as LocalDesignation
        from accounts.models import LocalCopyMasterCommand as LocalCommand
        from accounts.models import LocalCopyMasterUnit as LocalUnit
        from accounts.models import LocalCopyRank as LocalRank
        from accounts.models import LocalCopySubDepartment as LocalSubDepartment

        depts = {}
        for name, (code, dep_code) in MASTER_DEPARTMENTS.items():
            depts[name], _ = LocalDepartment.objects.update_or_create(
                name=name, defaults={"code": code or "", "dep_code": dep_code}
            )
        for sub_name, dept_name in MASTER_SUB_DEPARTMENTS:
            LocalSubDepartment.objects.get_or_create(
                department=depts.get(dept_name),
                name=sub_name,
                defaults={"code": sub_name},
            )
        commands = {
            code: self._upsert_command(code, unit_name, command_name)
            for code, (unit_name, command_name) in MASTER_COMMANDS.items()
        }
        self._seed_master_units(LocalUnit, commands)
        for name in MASTER_RANKS:
            LocalRank.objects.get_or_create(name=name)
        for name in MASTER_DESIGNATIONS:
            LocalDesignation.objects.get_or_create(designation_name=name)

        self._log(
            f"master data: {LocalDepartment.objects.count()} dept / "
            f"{LocalSubDepartment.objects.count()} sub-dept / "
            f"{LocalCommand.objects.count()} command / "
            f"{LocalUnit.objects.count()} unit / "
            f"{LocalRank.objects.count()} rank / "
            f"{LocalDesignation.objects.count()} designation"
        )

    def _seed_master_units(self, LocalUnit, commands):
        """Bulk create/update ``LocalCopyMasterUnit`` from ``MASTER_UNITS_CSV``,
        keyed on ``code`` (~3k rows, so no per-row update_or_create)."""
        existing = {u.code: u for u in LocalUnit.objects.all()}
        to_create, to_update = [], []
        no_command = 0
        for code, name, command_code, description in _load_master_units():
            command = commands.get(command_code)
            no_command += command is None
            description = description or None
            unit = existing.get(code)
            if unit is None:
                to_create.append(
                    LocalUnit(
                        code=code, name=name, command=command, description=description
                    )
                )
            elif (unit.name, unit.command_id, unit.description) != (
                name,
                command.pk if command else None,
                description,
            ):
                unit.name, unit.command, unit.description = name, command, description
                to_update.append(unit)
        LocalUnit.objects.bulk_create(to_create, batch_size=500)
        LocalUnit.objects.bulk_update(
            to_update, ["name", "command", "description"], batch_size=500
        )
        self._log(
            f"master units: +{len(to_create)} ~{len(to_update)} "
            f"({no_command} with no seeded command)"
        )

    def _seed_menu_mappings(self, process, roles_by_name, nav_menus, all_privileges):
        """Split menu-permission seeding by who assigned each user's role:

          * role assigned by user 1234       -> RoleMenuMapping for that role
          * role assigned by user SVC_ADMIN  -> UserMenuMapping for that user

        Both draw their menu set from the role's ``NAV_MATRIX`` entry (all
        actions). SUPER_ADMIN (``role_assigned_by`` NULL) needs neither -- it is
        short-circuited in ``effective_menu_permissions`` and already has the
        rbac_admin row from ``handle``. Runs after ``_seed_swmm_users`` so it can
        read the stamped ``role_assigned_by``."""
        p_1234 = self._profile_of("1234")
        p_svc = self._profile_of("SVC_ADMIN")

        role_menu_role_names = set()
        user_menu_targets = []
        users = User.objects.select_related(
            "user_profile__role", "user_profile__role_assigned_by"
        )
        for u in users:
            prof = u.user_profile
            if prof is None or prof.role_id is None or prof.role_assigned_by_id is None:
                continue
            if p_1234 and prof.role_assigned_by_id == p_1234.pk:
                role_menu_role_names.add(prof.role.name)
            elif p_svc and prof.role_assigned_by_id == p_svc.pk:
                user_menu_targets.append((u, prof.role.name))

        self._seed_role_menu_mappings(
            process,
            roles_by_name,
            nav_menus,
            all_privileges,
            only_role_names=role_menu_role_names,
        )
        self._seed_user_menu_mappings(nav_menus, all_privileges, user_menu_targets)

    def _seed_user_menu_mappings(self, nav_menus, all_privileges, targets):
        """One ``UserMenuMapping`` per (user, menu) for each ``(user, role_name)``
        in ``targets``, covering the menus paired with that role's ``NAV_MATRIX``
        nav keys, all actions. Materializes the role's menu set as a per-user
        override so ``effective_menu_permissions`` serves it via the user_menu
        path. Idempotent -- keyed on (user, menu)."""
        created = seen = 0
        for user, role_name in targets:
            visible_keys = NAV_MATRIX.get(role_name)
            if not visible_keys:
                continue
            for key in visible_keys:
                menu = nav_menus.get(key)
                if menu is None:
                    continue
                mapping, was_created = UserMenuMapping.objects.get_or_create(
                    user=user, menu=menu
                )
                mapping.privileges.set(all_privileges)
                created += int(was_created)
                seen += 1
        self._log(f"user-menu mappings: +{created} ~{seen - created}")

    def _seed_role_menu_mappings(
        self, process, roles_by_name, nav_menus, all_privileges, only_role_names=None
    ):
        """One global ``RoleMenuMapping`` per (role, menu), granting ALL
        action-level privileges on the Menu paired with each of that role's
        ``NAV_MATRIX`` nav keys, in ``process``.

        ``only_role_names`` (a set of role DISPLAY names) restricts the pass to
        those roles -- here, the roles held by users whose role was assigned by
        1234. Roles outside the set (or outside ``NAV_MATRIX``) get no role-menu
        rows. SUPER_ADMIN is unaffected -- it is short-circuited to full access
        in ``effective_menu_permissions``. Idempotent -- keyed on
        (process, role, menu)."""
        created = seen = 0
        for role_name, visible_keys in NAV_MATRIX.items():
            if only_role_names is not None and role_name not in only_role_names:
                continue
            matrix_role = roles_by_name.get(role_name)
            if matrix_role is None:
                continue  # already warned in the nav-visibility pass
            for key in visible_keys:
                menu = nav_menus.get(key)
                if menu is None:
                    self._log(
                        self.style.WARNING(
                            f"NAV_MATRIX: no seeded menu for nav key {key!r}; skipped"
                        )
                    )
                    continue
                mapping, was_created = RoleMenuMapping.objects.get_or_create(
                    process=process,
                    role=matrix_role,
                    menu=menu,
                    access_level=None,
                    unit_id=None,
                )
                mapping.privileges.set(all_privileges)
                created += int(was_created)
                seen += 1
        self._log(f"role-menu mappings: +{created} ~{seen - created}")

    @staticmethod
    def _profile_of(username):
        """The ``CustomUserProfile`` of ``username`` (upper-cased), or None if
        that user / its profile does not exist yet."""
        u = (
            User.objects.filter(username=username.strip().upper())
            .select_related("user_profile")
            .first()
        )
        return u.user_profile if u else None

    def _seed_swmm_users(self, process, roles, org_ids):
        """Port the seed_all.py users (SWMM_USERS + TRIALS_USERS). One role in
        ``process`` and one UserAccessLevel row each. Each profile is linked to
        the accounts master rows seeded by ``_seed_master_data`` -- access_level
        (from the row's ``lvl``), department_ref, command_ref (+ the
        denormalized command_name / command_id), and rank / designation from
        ``SWMM_USER_RANK_DESIGNATION``. The profile's department_id /
        department_name / command_id and the UserAccessLevel command_id /
        ship_id are populated from ``org_ids`` (real SWMM master PKs) when
        supplied. Idempotent -- keyed on the upper-cased username."""
        from accounts.models import CustomUserProfile
        from accounts.models import LocalCopyDepartment as LocalDepartment
        from accounts.models import LocalCopyDesignation as LocalDesignation
        from accounts.models import LocalCopyMasterCommand as LocalCommand
        from accounts.models import LocalCopyRank as LocalRank

        from authz.models import UserAccessLevel

        roles_by_name = {r.name: r for r in roles.values()}
        levels = {a.access_level_code: a for a in AccessLevel.objects.all()}
        dept_ids = org_ids["departments"]
        command_ids = org_ids["commands"]
        have_org_ids = bool(dept_ids or command_ids or org_ids["ships"])
        # Each row carries the username that "assigned" its role: 1234 for the
        # SWMM users, SVC_ADMIN for the TRIALS users. Resolved to a profile per
        # row (lazily -- 1234 is itself the first SWMM row) and stamped onto
        # role_assigned_by / role_assigned_on.
        all_rows = [(*row, "1234") for row in SWMM_USERS] + [
            (*row, "SVC_ADMIN") for row in TRIALS_USERS
        ]
        created = updated = 0
        unmapped_depts = set()

        for (
            username,
            first,
            last,
            role_name,
            command,
            lvl,
            department,
            assigner_username,
        ) in all_rows:
            uname = username.strip().upper()
            role_obj = roles_by_name.get(role_name)
            if role_obj is None:
                self._log(
                    self.style.WARNING(
                        f"SWMM user {uname}: no seeded role {role_name!r}; skipped"
                    )
                )
                continue

            is_admin = uname in SWMM_ADMIN_USERNAMES
            password = (
                ADMIN_PASS
                if username.lower() in ADMIN_PASSWORD_USERNAMES or uname == "ADMIN"
                else SEED_PASS
            )

            # profile.department_id is a CharField (HRCDF branchCode).
            dept_id = dept_ids.get(department)
            dept_id = str(dept_id) if dept_id is not None else None
            if department and dept_id is None and have_org_ids:
                unmapped_depts.add(department)

            user = User.objects.filter(username=uname).first()
            if user is None:
                profile = CustomUserProfile.objects.create(
                    firstname=first,
                    lastname=last,
                    approval_status="APPROVED",
                    user_active=True,
                    has_credentials=True,
                    role=role_obj,
                    department_id=dept_id,
                    department_name=department or "",
                )
                user = User(username=uname, user_profile=profile, is_admin=is_admin)
                user.set_password(password)
                user.save()
                created += 1
            else:
                profile = user.user_profile or CustomUserProfile.objects.create()
                profile.firstname = first
                profile.lastname = last
                profile.approval_status = "APPROVED"
                profile.user_active = True
                profile.has_credentials = True
                profile.role = role_obj
                profile.department_id = dept_id
                profile.department_name = department or ""
                profile.save()
                user.user_profile = profile
                user.is_admin = is_admin
                user.is_active = True
                user.set_password(password)
                user.save()
                updated += 1

            # --- SWMM expanded-profile fields (swmm/seed_all.py), linked to the
            #     master rows from _seed_master_data(). ``lvl`` is the SWMM
            #     access_level string ("0".."3"). department_id keeps the real
            #     org id when --org-ids gave one, else falls back to the local
            #     Department pk so the claim and ``department_detail`` agree in a
            #     bare seed. ---
            profile.access_level = lvl
            fields_to_update = ["access_level"]
            if department:
                local_dept, _ = LocalDepartment.objects.get_or_create(
                    name=department, defaults={"code": department}
                )
                profile.department_ref = local_dept
                fields_to_update.append("department_ref")
                if profile.department_id is None:
                    profile.department_id = str(local_dept.id)
                    profile.department_name = department
                    fields_to_update += ["department_id", "department_name"]
            if command:
                command_obj = LocalCommand.objects.filter(code=command).first()
                if command_obj is None:
                    unit_name, full_name = MASTER_COMMANDS.get(
                        command, (command, command)
                    )
                    command_obj = self._upsert_command(command, unit_name, full_name)
                profile.command_ref = command_obj
                profile.command_name = command_obj.command_name or ""
                profile.command_id = command_ids.get(command) or COMMAND_IDS.get(
                    command
                )
                fields_to_update += ["command_ref", "command_name", "command_id"]

            rank_name, desig_name = SWMM_USER_RANK_DESIGNATION.get(uname, (None, None))
            if rank_name:
                profile.rank = LocalRank.objects.get_or_create(name=rank_name)[0]
                fields_to_update.append("rank")
            if desig_name:
                profile.designation_master = LocalDesignation.objects.get_or_create(
                    designation_name=desig_name
                )[0]
                profile.designation = desig_name
                fields_to_update += ["designation_master", "designation"]
            if uname == "1234" and not profile.personal_number:
                profile.personal_number = "PN0001"
                fields_to_update.append("personal_number")

            profile.save(update_fields=fields_to_update)

            # role_assigned_by / role_assigned_on audit stamp. A profile does not
            # assign its own role -- 1234 (assigner "1234", its own row) is left
            # with both audit columns NULL.
            assigner = self._profile_of(assigner_username)
            if assigner is not None and assigner.pk == profile.pk:
                assigner = None
            if assigner is None:
                profile.role_assigned_by = None
                profile.role_assigned_on = None
            else:
                rbac.stamp_role_assignment(profile, assigner)
            profile.save(update_fields=["role_assigned_by", "role_assigned_on"])

            role_process = RoleProcessMapping.objects.get_or_create(
                user_role=role_obj, process=process
            )[0]
            UserProcessRoleMapping.objects.update_or_create(
                user=user,
                process_role=role_process,
                defaults={"is_active": True},
            )

            level_code = ACCESS_LEVEL_MAP[lvl]
            ual_defaults = {"is_active": True}
            if level_code == "COMMAND":
                ual_defaults["command_id"] = command_ids.get(
                    command
                ) or COMMAND_IDS.get(command)
            UserAccessLevel.objects.update_or_create(
                user=user,
                access_level=levels[level_code],
                defaults=ual_defaults,
            )

            # itttm sync -- ported from seed_all.py's create_or_update_user(). Only
            # the 16 ship/unit-admin accounts in ADMIN_PASSWORD_USERNAMES are pushed;
            # every other SWMM_USERS/TRIALS_USERS row never triggers this. Best-effort
            # and never raises (see authz.itttm_sync), so a failure here can't roll
            # back the seeding above.
            if uname.lower() in ADMIN_PASSWORD_USERNAMES:
                from authz.itttm_sync import sync_user_to_itttm

                sync_user_to_itttm(
                    profile=profile,
                    username=uname,
                    password=password,
                    # Unlike seed_all.py's EXISTING_USERS, SWMM_USERS/TRIALS_USERS
                    # here carry no per-user ship -- itttm_sync treats this as "".
                    ship_name=None,
                    role_name=ITTTM_ROLE_NAMES.get(uname.lower(), role_name),
                )

        self._log(f"SWMM users: +{created} ~{updated} (of {len(all_rows)})")
        if unmapped_depts:
            self._log(
                self.style.WARNING(
                    "--org-ids: no department PK for "
                    + ", ".join(sorted(unmapped_depts))
                    + " (those users get department_id=NULL)"
                )
            )
