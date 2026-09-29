"""Shared fixtures for the `wlms` test package: `WLMSApiFixtureMixin`, the common
department/user/equipment/spare/routine fixtures every wlms API-flow test needs.

Split out of the former flat `wlms/tests.py` (the wlms file-structure split, mirroring
the earlier `obs/tests/_shared.py`'s pattern). This module is deliberately named
`_shared.py`, not `test_shared.py` - Django's test runner discovers test modules by
name, and `WLMSApiFixtureMixin` declares no `TestCase` base of its own, so naming it
`test_*` would risk it being collected on its own with nothing to run. Every test
submodule that needs these fixtures imports the mixin from here rather than from one
another, since every domain (`test_equipment`, `test_survey`, `test_pts_demand`,
`test_iif`, `test_signal_demand`) needs the same department/user/equipment/spare/
routine setup the original single flat `WLMSApiFlowTests.setUp` built.
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from op_maintenance.models import InitiateDart
from ems.models import (
    AddRoutineDetails,
    EquipmentName,
    RoutineDescription,
    UniqueRoutineName,
)
from master.models import Department
from sfd.models import ShipEquipment
from accounts.models import CustomUserProfile

from ..models import WLMSEquipment, WLMSSpare


class WLMSApiFixtureMixin:
    """The department, user, WED equipment/spare, ship equipment and routine fixtures
    every wlms API-flow test class needs.

    Carried as a MIXIN and not as a base test class, deliberately - it declares no
    `TestCase` base of its own, so each concrete class states that for itself and the
    mixin cannot be collected as a test case in its own right.
    """

    def setUp(self):
        self.client = APIClient()
        self.department = Department.objects.create(name="WLMS Dept", code="WLMS")
        self.user_profile = CustomUserProfile.objects.create(
            firstname="WLMS",
            lastname="Manager",
            access_level="1",
            department=self.department,
        )
        self.user = get_user_model().objects.create_user(
            username="wlms-manager",
            user_profile=self.user_profile.pk,
            password="Pass@12345",
        )
        self.client.force_authenticate(self.user)
        self.equipment = WLMSEquipment.objects.create(
            eqpt_id=501,
            eqpt_name="MISSILE LAUNCHER",
            remarks="WED controlled equipment",
            # is_active=True,
            active=True,
            control_cell_id=11,
            sco_id=21,
            depot_id=31,
        )
        self.spare = WLMSSpare.objects.create(
            wlms_inventory="WED-INV-001",
            item_code="WLMS-1001",
            item_desc="LAUNCHER INTERFACE MODULE",
            category="REPAIRABLE",
            eqpt=self.equipment,
            denom_id="NOS",
            sh_name="WED",
            latest_qty=3,
            # is_active=True,
            active=True,
            typeofspare="WEAPON SUPPORT",
        )
        self.ship_equipment = ShipEquipment.objects.create(
            nomenclature="Missile Launcher",
            equipment_serial_no="WED-7001",
        )
        self.ems_equipment = EquipmentName.objects.create(
            name="Missile Launcher",
            equipment_code="WED-EMS-01",
        )
        self.routine_name = UniqueRoutineName.objects.create(
            name="Launcher Quarterly Routine",
        )
        self.routine = AddRoutineDetails.objects.create(
            equipment_name=self.ems_equipment,
            routine_name=self.routine_name,
            routine_no="WED-RT-01",
        )
        self.routine_description = RoutineDescription.objects.create(
            equipment_name=self.ems_equipment,
            routine_name=self.routine_name,
            add_routine_details=self.routine,
            routine_no="WED-RT-01",
            routine_description="Inspect launcher support interfaces.",
            by_whom="Weapon Engineering Department",
        )
        self.dart = InitiateDart.objects.create(
            dart_number="D-WED-801",
            equipment_ship=self.ship_equipment,
        )
