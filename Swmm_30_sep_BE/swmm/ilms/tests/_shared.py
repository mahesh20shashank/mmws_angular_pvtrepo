"""Shared fixtures for the `ilms` test package: `_make_user` and `ILMSApiFixtureMixin`,
the common user/item/vendor/equipment/routine fixtures every ilms API-flow test needs.

Split out of the former flat `ilms/tests.py` (the ilms file-structure split, mirroring
`wlms/tests/_shared.py`'s pattern, itself mirroring `obs/tests/_shared.py`). This module
is deliberately named `_shared.py`, not `test_shared.py` - Django's test runner
discovers test modules by name, and `ILMSApiFixtureMixin` declares no `TestCase` base of
its own, so naming it `test_*` would risk it being collected on its own with nothing to
run. Every test submodule that needs these fixtures imports the mixin from here rather
than from one another, since every domain (`test_catalog`, `test_masters`,
`test_planning`, `test_workflow`, `test_iif`) needs the same
user/item/vendor/equipment/routine setup the original single flat
`ILMSApiFlowTests.setUp` built.
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from accounts import rbac
from accounts.models import CustomUserProfile, Role
from op_maintenance.models import InitiateDart
from ems.models import (
    AddRoutineDetails,
    EquipmentName,
    RoutineDescription,
    UniqueRoutineName,
)
from sfd.models import Equipment, ShipEquipment

from ..models import Item, Vendor


# Developed by Unknown: THE ONE WAY THIS FILE MAKES A USER — see the identical note in
# `obs/tests/_shared.py`. `accounts.managers.CustomUserManager.create_user` takes
# `(username, user_profile, password)` and nothing else — `is_staff` is not a field of
# either `CustomUser` or `CustomUserProfile` (it's a read-only property mirroring
# `is_admin`), so every call here that passed `is_staff=True` raised `TypeError` in
# `setUp` before this fix, and none of these 25 tests ever ran.
def _make_user(username, password="Pass@12345", role_name=rbac.ROLE_CO):
    """`role_name` defaults to `ROLE_CO` (Commanding Officer) — one of
    `accounts.rbac.PRIVILEGED_ROLES_LEVELS` — rather than department-scoping the test
    account to a specific `master.Department` these flow tests don't otherwise set up.
    This is what the deleted `is_staff=True` was reaching for: an account that may see
    and act on every department's ILMS records freely, exactly like `obs`'s own
    `make_user` fixture does for the same reason."""
    role = None
    if role_name:
        role, _ = Role.objects.get_or_create(role_name=role_name)
    profile = CustomUserProfile.objects.create(
        firstname="Storekeeper",
        personal_number=username[:15],
        role_master=role,
    )
    user = get_user_model().objects.create(username=username, user_profile=profile)
    user.set_password(password)
    user.save()
    return user


class ILMSApiFixtureMixin:
    """The user, item/vendor catalog rows, ship equipment/DART and routine fixtures
    every ilms API-flow test class needs.

    Carried as a MIXIN and not as a base test class, deliberately - it declares no
    `TestCase` base of its own, so each concrete class states that for itself and the
    mixin cannot be collected as a test case in its own right.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = _make_user("ilms-manager")
        self.client.force_authenticate(self.user)
        self.item = Item.objects.create(
            item_code="ILMS-1001",
            item_desc="HYDRAULIC FILTER ELEMENT",
            item_deno="NOS",
            crp_category="C",
            inventory_holder="ENGINEERING",
            oem_name="ACME HYDRAULICS",
            oem_vendor_code="VEN-001",
            incat_yn=True,
        )
        self.vendor = Vendor.objects.create(
            vendor_code="VEN-001",
            name="NAVAL SPARES SUPPLIER",
            vendor_class="OEM",
            country_code="IN",
        )
        self.ship_equipment = ShipEquipment.objects.create(
            nomenclature="Hydraulic System",
            equipment_serial_no="ILMS-501",
        )
        self.equipment = Equipment.objects.create(
            equipment_code="ILMS-EQ-501",
            ilms_eq_code="ILMS-501",
        )
        self.dart = InitiateDart.objects.create(
            equipment_ship=self.ship_equipment,
            dart_number="D-ILMS-001",
        )
        self.ems_equipment = EquipmentName.objects.create(
            name="Hydraulic System",
            equipment_code="ILMS-EMS-01",
        )
        self.routine_name = UniqueRoutineName.objects.create(
            name="Hydraulic System Quarterly Routine",
        )
        self.routine = AddRoutineDetails.objects.create(
            equipment_name=self.ems_equipment,
            routine_name=self.routine_name,
            routine_no="ILMS-RT-01",
        )
        self.routine_description = RoutineDescription.objects.create(
            equipment_name=self.ems_equipment,
            routine_name=self.routine_name,
            add_routine_details=self.routine,
            routine_no="ILMS-RT-01",
            routine_description="Inspect hydraulic system consumable spares.",
            by_whom="Engineering Department",
        )
