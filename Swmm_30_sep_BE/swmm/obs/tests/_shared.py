"""Shared fixtures for the `obs` test package: `make_user`, `IMPORT_PASSWORD` and
`MastersImportFixtureMixin`.

Split out of the former flat `obs/tests.py` (Part 1 of the obs file-structure split). This
module is deliberately named `_shared.py`, not `test_shared.py` - Django's test runner
discovers test modules by name, and none of what lives here is a `TestCase` in its own
right (`MastersImportFixtureMixin` declares no `APITestCase` base of its own - see its own
docstring), so naming it `test_*` would risk it being collected on its own with nothing to
run. Every test submodule that needs these imports them from here rather than from one
another, since several of them (`test_import_rules` - which now also carries the former
`test_masters_page`'s `MastersPageRoleTests`, folded in during the obs
package-consolidation pass -, `test_customer_code`, `test_purge`, `test_pattern`,
`test_images`) need the same fixtures and none of them should have to import from a
sibling test module.
"""

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from master.models import Department, MShipCommand, Ship, UnitType
from openpyxl import load_workbook

from accounts import rbac
from accounts.models import CustomUserProfile, Role
from ilms.models import MOItemSourceOfTruth

from .. import services
from ..models import Authority, Denomination, EquipmentClass, SpareClass
from ..views import IMPORT_TEMPLATE_DIR


# Developed by Unknown: THE ONE WAY THIS FILE MAKES A USER, and why it cannot be
# `create_user(username=..., password=..., is_staff=True)`.
#
# `accounts.managers.CustomUserManager.create_user` takes `(username, user_profile, password)`
# and NOTHING else - `user_profile` is required and is used as an id. `CustomUser` is a thin
# credentials row; the person, their department and their role live on `CustomUserProfile`,
# and `is_staff` is not a field of either (it is a read-only property mirroring `is_admin`).
# Every call in this file that passed `is_staff` raised `TypeError` in `setUp`.
#
# The role matters and is not decoration. `accounts.rbac`'s department scoping reads it, so a
# profile with no role reaches no other department's spares. `ROLE_ADMIN` is what the deleted
# `is_staff=True` was reaching for - an account that may see the whole ship - and it is what
# these flow tests need, because they read and write across departments freely.
def make_user(
    username,
    *,
    department=None,
    role_name=None,
    personal_number=None,
    password=None,
    sub_department="",
    firstname="Storekeeper",
):
    """A `CustomUser` with the profile, department and role its tests need."""
    role = None
    if role_name:
        role, _ = Role.objects.get_or_create(role_name=role_name)
    profile = CustomUserProfile.objects.create(
        firstname=firstname,
        # `CustomUserProfile.personal_number` is a SlugField(max_length=15), so a username
        # longer than that has to be cut or Postgres refuses the row outright.
        personal_number=personal_number or username[:15],
        department=department,
        role_master=role,
        executive_sub_department=sub_department,
    )
    # `create`, not `create_user`: the manager takes the profile as an ID and sets no other
    # field, so the plain create plus `set_password` is the same hash by a clearer route.
    user = get_user_model().objects.create(username=username, user_profile=profile)
    if password:
        user.set_password(password)
        user.save()
    return user




# Developed by Unknown: the password every Masters import re-authentication call uses. Moved
# here from beside `CANONICAL_IMPORT_WORKBOOKS` (now in `test_import_rules.py`, the one file
# that still needs that dict) because this constant alone is shared across six test modules.
IMPORT_PASSWORD = "Import@12345"


class MastersImportFixtureMixin:
    """Developed by Unknown: the ship, the departments and the logins every Masters case needs.

    Carried as a MIXIN and not as a base test class, deliberately. Four test classes need these
    fixtures and only one of them - `SparesImportRuleRegisterTests` below - owns the workbook
    cases. Subclassing that class to reuse its `setUp` would have re-run all twenty-nine workbook
    imports inside each of the other three, turning a twenty-second suite into a five-minute one
    and reporting the same failure four times over.

    It deliberately declares no `APITestCase` base of its own, so each concrete class states that
    for itself and the mixin cannot be collected as a test case in its own right.
    """

    def setUp(self):
        self.command = MShipCommand.objects.create(
            command_id=1,
            command_code="WNC",
            command_name="Western Naval Command",
            active=True,
        )
        self.unit_type = UnitType.objects.create(name="Ship")
        self.ship = Ship.objects.create(
            code="SHIP-31",
            name="Trial Ship",
            command=self.command,
            unit_type=self.unit_type,
        )
        self.departments = {}

    def _department(self, name):
        """One `master.Department` per departmental name the workbooks use."""
        if name not in self.departments:
            self.departments[name] = Department.objects.create(
                name=name,
                code=name[:4],
            )
        return self.departments[name]

    # Developed by Unknown: The account now needs three things it did not before - a real
    # password, because the import re-authenticates the operator, a role, because the D787J
    # route is refused without an entitled one, and an Executive sub-department when the role
    # under test is DY HOD.
    def _make_user(self, department, role_name=None, sub_department="", suffix="01"):
        # Developed by Unknown: the same `make_user` the flow tests use, so this file has one
        # account-building routine rather than two that can drift. Only the naming convention
        # is this mixin's own - a personal number and username derived from the department and
        # a suffix, because these tests make several accounts per department.
        return make_user(
            f"import-{department.name.lower()}-{suffix}",
            department=department,
            role_name=role_name,
            personal_number=f"{department.name[:6]}{suffix}",
            password=IMPORT_PASSWORD,
            sub_department=sub_department,
        )

    def _login_for(self, department, role_name=rbac.ROLE_HOD, sub_department=""):
        """Authenticate as a Head of Department of one department.

        A Head of Department rather than a role-less storekeeper, because the D787J route is
        refused to any other role and five of the seven canonical workbooks are D787J
        workbooks. `ROLE_HOD` is not one of the roles `accounts.rbac.can_see_all_departments`
        admits, so the account is still scoped to its own department exactly as before -
        `SparesViewSet._import_department` resolves that department for every row.
        """
        user = self._make_user(department, role_name, sub_department)
        self.client.force_authenticate(user)
        return user

    def _seed_masters(self, department, workbook_path):
        """Set the ship's master data up the way a configured ship already holds it.

        The import no longer creates master data, so every spare class, equipment class,
        denomination and authority a workbook names has to exist first. The spare classes
        come from the rule engine's own department-and-route matrix, the equipment classes
        from the workbook's own EQUIPMENT CLASS column, and the denominations and
        authorities from the register's permitted lists.
        """
        spare_classes = set()
        for route in (services.IMPORT_ROUTE_D787J, services.IMPORT_ROUTE_OTHERS):
            spare_classes |= services.permitted_spare_classes(department.name, route)

        workbook = load_workbook(workbook_path, read_only=True, data_only=True)
        worksheet = workbook["OBS"]
        rows = list(worksheet.iter_rows(values_only=True))
        headers = [str(header).strip().upper() if header else "" for header in rows[0]]
        equipment_column = headers.index("EQUIPMENT CLASS")
        spare_class_column = headers.index("SPARE CLASS")
        pattern_column = headers.index("PATTERN NUMBER")
        # Developed by Unknown: the workbook's OWN pairing of spare class to equipment class,
        # first occurrence wins. This used to be a cross product - every permitted spare class
        # crossed with every equipment name in the sheet - which was always broader than the
        # sheet actually says and is now impossible: an equipment class name is unique per
        # DEPARTMENT, not per spare class, so the same name under two spare classes of one
        # department violates `obs_equipmentclass_unique_name_per_department`. Taking the real
        # pairing seeds the ship exactly as the workbook describes it.
        equipment_by_name = {}
        pattern_numbers = set()
        for values in rows[1:]:
            equipment_name = values[equipment_column]
            spare_class_name = values[spare_class_column]
            pattern_number = values[pattern_column]
            if pattern_number not in (None, ""):
                pattern_numbers.add(str(pattern_number).strip().upper())
            if equipment_name in (None, "") or spare_class_name in (None, ""):
                continue
            equipment_by_name.setdefault(
                str(equipment_name).strip().upper(),
                str(spare_class_name).strip().upper(),
            )
        workbook.close()

        # Developed by Unknown: `get_or_create` throughout, because one department's two
        # workbooks are now both seeded within a single test - see
        # `test_the_rule_engine_still_fails_every_row_a_refused_workbook_breaches`.
        for spare_class_name in spare_classes:
            SpareClass.objects.get_or_create(
                name=spare_class_name,
                department=department,
            )
        # Developed by Unknown: ONE row per equipment name per department, which is what the
        # model's own uniqueness constraint requires. The spare class it hangs off is the
        # first one the sheet pairs it with, and that choice does not narrow anything - the
        # import resolves an equipment class by name within the department, and which spare
        # class may name it is rules 2.6.2 and 2.6.3, checked separately.
        for equipment_name, spare_class_name in equipment_by_name.items():
            # Developed by Unknown: a sheet may name a spare class its own department is not
            # permitted - that is what several of the deliberate breach rows do - so the
            # parent is created here rather than assumed to be in the permitted set above.
            spare_class, _ = SpareClass.objects.get_or_create(
                name=spare_class_name,
                department=department,
            )
            # Developed by Unknown: matched on NAME AND DEPARTMENT, which is what the
            # `obs_equipmentclass_unique_name_per_department` constraint is on. Matching on
            # `spare_class` instead - as this did - meant that seeding a department's second
            # workbook, where the same equipment name is paired with a different spare class,
            # found nothing, tried to insert, and hit the constraint.
            if not EquipmentClass.objects.filter(
                name=equipment_name, department=department
            ).exists():
                EquipmentClass.objects.create(
                    name=equipment_name,
                    spare_class=spare_class,
                )
        for denomination in services.DENOMINATIONS:
            Denomination.objects.get_or_create(name=denomination, department=department)
        for authority in services.AUTHORITIES:
            Authority.objects.get_or_create(name=authority)

        # Developed by Unknown: the pattern-number cross-check has a source of truth to read.
        # CP-11 made a typed PATTERN NUMBER that matches no item code in any of the four
        # sources a row-level failure ("PATTERN-NOT-FOUND"), and every canonical workbook
        # types one on every row, so without this the whole shipped set classifies as
        # invalid for a reason none of their GUIDANCE sheets claims.
        #
        # `crp_category` is left EMPTY on purpose. A source that carries one would
        # auto-correct CATEGORY through `apply_source_of_truth`, and several of these rows
        # breach clauses 2.3, 2.4 and 2.8 deliberately - correcting them would silently
        # disarm the very breaches the workbook exists to prove. `source_category("")`
        # returns `None`, which is what makes "leave the row's own value alone" reachable now
        # that the column is NOT NULL and a real `None` can no longer be stored.
        MOItemSourceOfTruth.objects.bulk_create(
            [
                MOItemSourceOfTruth(
                    item_code=services.normalise_item_code(code), crp_category=""
                )
                for code in sorted(pattern_numbers)
                if services.normalise_item_code(code)
            ],
            ignore_conflicts=True,
        )

    IMPORT_PREVIEW_URL = "/api/v1/onboard-spares/spares/import-excel-preview/"

    def _preview(self, file_name, route, authority, password=IMPORT_PASSWORD):
        """Upload one shipped workbook to the preview endpoint and return the response."""
        path = IMPORT_TEMPLATE_DIR / file_name
        with path.open("rb") as handle:
            content = handle.read()
        return self.client.post(
            self.IMPORT_PREVIEW_URL,
            {
                "file": SimpleUploadedFile(file_name, content),
                "route": route,
                "authority": authority,
                "password": password,
            },
            format="multipart",
        )
