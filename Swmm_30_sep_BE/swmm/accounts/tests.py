"""Smoke tests for the accounts app's authz_service integration.

The end-to-end token / shadow-sync / live-permission behaviour is exercised by
``users/tests_authz_integration.py`` (which imports the ``users`` copies). These
tests only assert that the ``accounts`` copies are wired up and that the pure
helpers behave.
"""

from unittest import mock

from django.test import RequestFactory, TestCase, override_settings

from accounts import authz_roles
from accounts.live_permissions import IsInternalService

# Developed with Understanding: imports for the HRCDF roster sync tests (CP-C).
from datetime import date
from types import SimpleNamespace

from django.core.cache import cache
from master.models import Department, HrcdfCommand, HrcdfUnit, MasterCommand, Unit
from rest_framework.test import APIClient

from accounts import hrcdf_sync
from accounts.live_permissions import IsLiveAuthzUser
from accounts.models import (
    AUTH_SOURCE_HRCDF,
    AUTH_SOURCE_LOCAL,
    CustomUser,
    CustomUserProfile,
    HrcdfSyncJob,
    OtherCustomUserProfile,
    Rank,
    ShipIdentity,
)
from accounts.permissions import IsShipAdminRole
from accounts.tasks import run_hrcdf_sync_job

# Developed with Understanding: imports for the first-login adoption tests (CP-F).
from datetime import timedelta

from django.utils import timezone

from accounts import authz_sync

# Developed with Understanding: imports for the guest guard, unit-status and reclassify
# tests (CP-L).
import io

from django.conf import settings
from django.core.management import call_command
from rest_framework_simplejwt.authentication import JWTAuthentication

from accounts.authentication import GUEST_DENIED_MESSAGE, request_url_name
from accounts.models import Role


class RoleMapTests(TestCase):
    def test_super_admin_always_maps_to_admin(self):
        self.assertEqual(
            authz_roles.swmm_role_name_for("USER", is_super_admin=True), "ADMIN"
        )

    def test_missing_code_is_unassigned(self):
        self.assertIsNone(authz_roles.swmm_role_name_for(""))
        self.assertIsNone(authz_roles.swmm_role_name_for(None))

    def test_known_code_maps(self):
        self.assertEqual(
            authz_roles.swmm_role_name_for("HOD"), "Head of Department"
        )

    def test_unknown_code_falls_back_to_guest(self):
        self.assertEqual(
            authz_roles.swmm_role_name_for("NO_SUCH_ROLE"),
            authz_roles.GUEST_ROLE_NAME,
        )

    @override_settings(AUTHZ_ROLE_MAP={"HOD": "Custom HOD Name"})
    def test_settings_override_wins(self):
        self.assertEqual(
            authz_roles.swmm_role_name_for("HOD"), "Custom HOD Name"
        )


class IsInternalServiceTests(TestCase):
    def setUp(self):
        self.rf = RequestFactory()

    @override_settings(INTERNAL_SERVICE_KEY="s3cr3t")
    def test_matching_key_allows(self):
        request = self.rf.get("/", HTTP_X_SERVICE_KEY="s3cr3t")
        self.assertTrue(IsInternalService().has_permission(request, None))

    @override_settings(INTERNAL_SERVICE_KEY="s3cr3t")
    def test_wrong_key_denies(self):
        request = self.rf.get("/", HTTP_X_SERVICE_KEY="nope")
        self.assertFalse(IsInternalService().has_permission(request, None))

    @override_settings(INTERNAL_SERVICE_KEY="")
    def test_unset_key_denies_everyone(self):
        request = self.rf.get("/", HTTP_X_SERVICE_KEY="")
        self.assertFalse(IsInternalService().has_permission(request, None))


class AuthenticationImportTests(TestCase):
    def test_authenticator_get_user_delegates_to_shadow_sync(self):
        from accounts.authentication import FleetJWTAuthentication

        with mock.patch(
            "accounts.authz_sync.sync_principal", return_value="principal"
        ) as sync:
            result = FleetJWTAuthentication().get_user({"user_id": 1})
        sync.assert_called_once()
        self.assertEqual(result, "principal")


# --------------------------------------------------------------------------
# HRCDF roster sync (CP-C)
# --------------------------------------------------------------------------

HRCDF_TEST_CONFIG = {
    "BASE_URL": "http://hrcdf.test:8080",
    "USERS_PATH": "/api/users",
    "AUTH_TOKEN_PATH": "/api/auth/token",
    "AUTH_USERNAME": "",
    "AUTH_PASSWORD": "",
    "PAGE_PARAM": "page",
    "PAGE_SIZE_PARAM": "pageSize",
    "PAGE_SIZE": 500,
    "MAX_PAGES": 1000,
    "TIMEOUT_SECONDS": 5,
    "VERIFY_TLS": True,
    "UNIT_FILTER_PARAM": "",
    "UNITS_PATH": "",
}
HRCDF_TEST_CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "hrcdf-sync-tests",
    }
}
HOME_CODE = "01234"
HOME_HRCDF_ID = 77
OTHER_CODE = "09999"


# Developed with Understanding: a stand-in for accounts.hrcdf_client.HrcdfClient that
# serves hand-built records as one page, so the engine runs with no network.
class FakeHrcdfClient:
    def __init__(self, records):
        self.records = list(records)
        self.host = "hrcdf.test:8080"
        self.auth_username = ""
        self.users_path = "/api/users"
        self.page_size = 500
        self.pages_fetched = 0
        self.total_records = len(self.records)

    def ensure_configured(self):
        return None

    def authenticate(self):
        return None

    def iter_records(self, emit=None):
        self.pages_fetched = 1
        if emit is not None:
            emit("info", f"Page 1 fetched: {len(self.records)} record(s).")
        yield from self.records

    def close(self):
        return None


# Developed with Understanding: one hand-built HRCDF record. designation and
# dateOfMarriage are included on purpose - the sync must never store them (D14).
def hrcdf_record(number, unit_code=HOME_CODE, unit_id=HOME_HRCDF_ID, **overrides):
    record = {
        "personnelNumber": number,
        "firstName": "Arun",
        "lastName": "Kumar",
        "fullName": "ARUN KUMAR",
        "unitCode": unit_code,
        "unitId": unit_id,
        "unitName": "INS TEST" if unit_code == HOME_CODE else "INS OTHER",
        "commandCode": "WNC",
        "commandName": "Western Naval Command",
        "rankName": "LT",
        "branchName": "HULL",
        "isActive": 1,
        "dateOfBirth": "1990-05-12T00:00:00",
        "designation": "HOD",
        "dateOfMarriage": "2015-01-01T00:00:00",
    }
    record.update(overrides)
    return record


# Developed with Understanding: the shared fixture - a home unit locked on ShipIdentity,
# the EXECUTIVE department, the WNC command, one rank and an admin login that exists
# before any sync, so a CustomUser count taken after a run proves none was created.
@override_settings(HRCDF_SYNC=HRCDF_TEST_CONFIG, CACHES=HRCDF_TEST_CACHES)
class HrcdfSyncTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.home = Unit.objects.create(
            name="INS TEST", code=HOME_CODE, hrcdf_unit_id=HOME_HRCDF_ID
        )
        ShipIdentity.objects.create(
            ship_name="INS TEST", is_locked=True, unit=self.home
        )
        self.executive = Department.objects.create(name="EXECUTIVE", code="EXE")
        self.command = MasterCommand.objects.create(
            unit_name="WNC", command_name="Western Naval Command"
        )
        self.rank = Rank.objects.create(name="LT")
        # Developed with Understanding: the seeded HRCDF masters behind the Step 1
        # dropdowns, one SEED command and the SEED unit of the home ship.
        self.hrcdf_command = HrcdfCommand.objects.create(
            code="WNC", name="Western Naval Command", record_origin="SEED"
        )
        self.hrcdf_home = HrcdfUnit.objects.create(
            code=HOME_CODE,
            name="INS TEST",
            hrcdf_unit_id=HOME_HRCDF_ID,
            command=self.hrcdf_command,
            record_origin="SEED",
        )
        self.admin_profile = CustomUserProfile.objects.create(
            personal_number="ADMIN1", firstname="Admin", has_credentials=True
        )
        self.admin_user = CustomUser.objects.create(
            username="ADMIN1", user_profile=self.admin_profile
        )
        self.users_before = CustomUser.objects.count()

    def run_sync(self, mode, records):
        job = HrcdfSyncJob.objects.create(mode=mode, started_by=self.admin_profile)
        result = run_hrcdf_sync_job(job.pk, client=FakeHrcdfClient(records))
        self.assertEqual(result["status"], HrcdfSyncJob.Status.FINISHED)
        return result["summary"]["stats"]

    # Developed with Understanding: the three master tables a roster run must never touch.
    def unit_table_counts(self):
        return (
            HrcdfUnit.objects.count(),
            HrcdfCommand.objects.count(),
            Unit.objects.count(),
        )

    def tearDown(self):
        # Developed with Understanding: every test also proves the sync never writes a
        # login - no CustomUser appears whatever the run did (AR1 contained, D14).
        self.assertEqual(CustomUser.objects.count(), self.users_before)
        cache.clear()


class HrcdfSyncEngineTests(HrcdfSyncTestBase):
    def test_own_create(self):
        stats = self.run_sync("own", [hrcdf_record("x123a")])
        self.assertEqual(stats["own_created"], 1)
        profile = CustomUserProfile.objects.get(personal_number="X123A")
        self.assertEqual(profile.auth_source, AUTH_SOURCE_HRCDF)
        self.assertFalse(profile.has_credentials)
        self.assertFalse(profile.is_role)
        self.assertTrue(profile.user_active)
        self.assertIsNone(profile.authz_user_id)
        self.assertIsNone(profile.role_master)
        self.assertEqual(profile.department, self.executive)
        self.assertEqual(profile.command_name, self.command)
        self.assertEqual(profile.rank, self.rank)
        self.assertEqual(profile.section, "INS TEST")
        self.assertEqual(profile.unit_code, HOME_CODE)
        self.assertEqual(profile.date_of_birth, date(1990, 5, 12))
        self.assertEqual(profile.designation, "")
        self.assertIsNone(profile.marriage_date)
        self.assertIsNotNone(profile.hrcdf_synced_at)

    def test_own_delta_writes_only_changed_columns(self):
        self.run_sync("own", [hrcdf_record("D100")])
        stats = self.run_sync("own", [hrcdf_record("D100", rankName="CDR")])
        self.assertEqual(stats["own_updated"], 1)
        profile = CustomUserProfile.objects.get(personal_number="D100")
        self.assertEqual(profile.rank_name, "CDR")
        # Developed with Understanding: the rank FK is set on create only (D20).
        self.assertEqual(profile.rank, self.rank)

    def test_unchanged_record_costs_no_write(self):
        self.run_sync("own", [hrcdf_record("U100")])
        before = CustomUserProfile.objects.get(personal_number="U100").updated_at
        stats = self.run_sync("own", [hrcdf_record("U100")])
        self.assertEqual(stats["own_unchanged"], 1)
        after = CustomUserProfile.objects.get(personal_number="U100").updated_at
        self.assertEqual(before, after)

    def test_existing_login_row_keeps_identity_columns(self):
        existing = CustomUserProfile.objects.create(
            personal_number="E100",
            firstname="Old",
            designation="HOD",
            has_credentials=True,
            authz_user_id=5,
            auth_source=AUTH_SOURCE_LOCAL,
        )
        stats = self.run_sync("own", [hrcdf_record("E100")])
        self.assertEqual(stats["own_updated"], 1)
        existing.refresh_from_db()
        self.assertEqual(existing.authz_user_id, 5)
        self.assertEqual(existing.auth_source, AUTH_SOURCE_LOCAL)
        self.assertTrue(existing.has_credentials)
        self.assertEqual(existing.designation, "HOD")
        self.assertEqual(existing.firstname, "Arun")

    def test_other_unit_create(self):
        stats = self.run_sync("others", [hrcdf_record("O100", OTHER_CODE, 900)])
        self.assertEqual(stats["others_created"], 1)
        other = OtherCustomUserProfile.objects.get(personal_number="O100")
        self.assertEqual(other.record_origin, "HRCDF")
        self.assertTrue(other.is_current_other_unit)
        self.assertEqual(other.command_name, "Western Naval Command")
        self.assertEqual(other.unit_code, OTHER_CODE)
        own_rows = CustomUserProfile.objects.filter(personal_number="O100")
        self.assertFalse(own_rows.exists())

    def test_mode_skips_records_it_does_not_write(self):
        stats = self.run_sync("own", [hrcdf_record("S100", OTHER_CODE, 900)])
        self.assertEqual(stats["skipped_other_mode"], 1)
        self.assertFalse(OtherCustomUserProfile.objects.exists())
        self.assertFalse(HrcdfUnit.objects.filter(code=OTHER_CODE).exists())

    def test_leaver_closed_and_moved(self):
        CustomUserProfile.objects.create(
            personal_number="L100", firstname="Leaver", auth_source=AUTH_SOURCE_HRCDF
        )
        stats = self.run_sync("own", [hrcdf_record("L100", OTHER_CODE, 900)])
        self.assertEqual(stats["leavers"], 1)
        own = CustomUserProfile.objects.get(personal_number="L100")
        self.assertIsNotNone(own.ship_leaving_date)
        self.assertFalse(own.user_active)
        self.assertTrue(
            OtherCustomUserProfile.objects.filter(
                personal_number="L100", is_current_other_unit=True
            ).exists()
        )

    def test_rejoin_marks_other_unit_row_not_current(self):
        OtherCustomUserProfile.objects.create(
            personal_number="R100", firstname="Back", lastname="Again"
        )
        stats = self.run_sync("own", [hrcdf_record("R100")])
        self.assertEqual(stats["own_created"], 1)
        other = OtherCustomUserProfile.objects.get(personal_number="R100")
        self.assertFalse(other.is_current_other_unit)

    # Developed with Understanding: Step 2 and Step 3 never write HrcdfUnit, HrcdfCommand
    # or Master_unit, whatever units and commands the roster carries.
    def test_roster_run_writes_no_units(self):
        HrcdfUnit.objects.create(code="05555", name="", record_origin="SEED")
        before = self.unit_table_counts()
        for mode in ("others", "own"):
            stats = self.run_sync(
                mode,
                [
                    hrcdf_record("H100", "05555", 555, unitName="NEW NAME"),
                    hrcdf_record(
                        "H200",
                        "06666",
                        666,
                        unitName="INS HARVEST",
                        commandCode="XYZ",
                        commandName="New Command",
                    ),
                    hrcdf_record("H300"),
                ],
            )
            self.assertEqual(stats["units_created"], 0)
        self.assertEqual(self.unit_table_counts(), before)
        untouched = HrcdfUnit.objects.get(code="05555")
        self.assertEqual(untouched.name, "")
        self.assertIsNone(untouched.hrcdf_unit_id)
        self.assertFalse(HrcdfCommand.objects.filter(code="XYZ").exists())

    # Developed with Understanding: Get Ship Names as a job of mode units, fed by the
    # roster walk of the fake client. New units and commands are created with origin
    # HRCDF, SEED rows are never renamed and only have empty fields filled, and no person
    # is written.
    def test_units_refresh_job_upserts_hrcdf_masters(self):
        HrcdfUnit.objects.create(code="05555", name="SEEDED NAME", record_origin="SEED")
        records = [
            hrcdf_record("H100", "05555", 555, unitName="NEW NAME"),
            hrcdf_record("H101", "05555", 555, unitName="NEW NAME"),
            hrcdf_record(
                "H200",
                "06666",
                666,
                unitName="INS HARVEST",
                commandCode="XYZ",
                commandName="New Command",
            ),
            hrcdf_record("H300", commandName="Renamed Western Command"),
        ]
        profiles_before = CustomUserProfile.objects.count()
        stats = self.run_sync("units", records)
        self.assertEqual(stats["fetched"], 4)
        self.assertEqual(stats["units_seen"], 3)
        self.assertEqual(stats["units_created"], 1)
        self.assertEqual(stats["units_updated"], 1)
        self.assertEqual(stats["units_unchanged"], 1)
        self.assertEqual(stats["commands_created"], 1)

        filled = HrcdfUnit.objects.get(code="05555")
        self.assertEqual(filled.name, "SEEDED NAME")
        self.assertEqual(filled.hrcdf_unit_id, 555)
        self.assertEqual(filled.command, self.hrcdf_command)
        created = HrcdfUnit.objects.get(code="06666")
        self.assertEqual(created.record_origin, "HRCDF")
        self.assertEqual(created.name, "INS HARVEST")
        self.assertEqual(created.command.code, "XYZ")
        self.assertEqual(created.command.name, "New Command")
        self.assertEqual(created.command.record_origin, "HRCDF")
        self.hrcdf_command.refresh_from_db()
        self.assertEqual(self.hrcdf_command.name, "Western Naval Command")

        self.assertEqual(CustomUserProfile.objects.count(), profiles_before)
        self.assertFalse(OtherCustomUserProfile.objects.exists())
        self.assertEqual(Unit.objects.count(), 1)

        job = HrcdfSyncJob.objects.order_by("-started_at").first()
        snapshot = hrcdf_sync.progress_snapshot(job, since=0, limit=2000)
        self.assertEqual(snapshot["mode"], "units")
        self.assertEqual(snapshot["status"], HrcdfSyncJob.Status.FINISHED)
        texts = [line["text"] for line in snapshot["lines"]]
        self.assertIn("New unit 06666 INS HARVEST", texts)
        self.assertIn("New command XYZ New Command", texts)
        self.assertTrue(any(text.startswith("Updated unit 05555") for text in texts))
        self.assertEqual(snapshot["lines"][-1]["level"], "done")

    # Developed with Understanding: Get Ship Names needs no home unit.
    def test_units_refresh_job_runs_without_home_unit(self):
        ShipIdentity.objects.update(unit=None, is_locked=False)
        stats = self.run_sync("units", [hrcdf_record("H400", "07777", 777)])
        self.assertEqual(stats["units_created"], 1)
        self.assertTrue(HrcdfUnit.objects.filter(code="07777").exists())

    def test_bad_records_are_skipped(self):
        stats = self.run_sync(
            "own",
            [
                "not a record",
                {"personnelNumber": "", "unitCode": HOME_CODE},
                {"personnelNumber": "N100"},
                hrcdf_record("G100"),
            ],
        )
        self.assertEqual(stats["skipped"], 3)
        self.assertEqual(stats["own_created"], 1)
        self.assertEqual(stats["fetched"], 4)
        job = HrcdfSyncJob.objects.order_by("-started_at").first()
        self.assertEqual(len(job.errors), 3)

    def test_progress_lines_are_readable(self):
        self.run_sync("own", [hrcdf_record("P100")])
        job = HrcdfSyncJob.objects.order_by("-started_at").first()
        snapshot = hrcdf_sync.progress_snapshot(job, since=0, limit=2000)
        self.assertEqual(snapshot["status"], HrcdfSyncJob.Status.FINISHED)
        self.assertEqual(snapshot["lines"][-1]["level"], "done")
        self.assertFalse(snapshot["gap"])
        self.assertFalse(snapshot["truncated"])
        later = hrcdf_sync.progress_snapshot(job, since=snapshot["last_seq"])
        self.assertEqual(later["lines"], [])


# Developed with Understanding: the HTTP surface. Both permission classes are patched to
# allow, because the gate itself is covered by accounts.permissions and live_permissions.
class HrcdfSyncApiTests(HrcdfSyncTestBase):
    def setUp(self):
        super().setUp()
        for permission in (IsShipAdminRole, IsLiveAuthzUser):
            patcher = mock.patch.object(permission, "has_permission", return_value=True)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)

    @override_settings(HRCDF_SYNC={**HRCDF_TEST_CONFIG, "BASE_URL": ""})
    def test_readiness_unconfigured(self):
        response = self.client.get("/api/v1/accounts/hrcdf-sync/readiness/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["configured"])
        self.assertEqual(response.data["home_unit"]["code"], HOME_CODE)

    @override_settings(HRCDF_SYNC={**HRCDF_TEST_CONFIG, "BASE_URL": ""})
    def test_run_unconfigured_is_400(self):
        response = self.client.post(
            "/api/v1/accounts/hrcdf-sync/runs/", {"mode": "own"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["status"], "error")
        self.assertIn("not configured", response.data["message"])
        self.assertFalse(HrcdfSyncJob.objects.exists())

    def test_second_start_is_409(self):
        queued = {"queued": True, "task": SimpleNamespace(id="task-1")}
        with mock.patch.object(hrcdf_sync, "dispatch_task", return_value=queued):
            first = self.client.post(
                "/api/v1/accounts/hrcdf-sync/runs/", {"mode": "own"}, format="json"
            )
            second = self.client.post(
                "/api/v1/accounts/hrcdf-sync/runs/", {"mode": "others"}, format="json"
            )
        self.assertEqual(first.status_code, 202)
        self.assertIn("job_id", first.data)
        self.assertEqual(second.status_code, 409)
        self.assertIn("already running", second.data["message"])
        self.assertIn("ADMIN1", second.data["message"])

    def test_bad_mode_is_400(self):
        response = self.client.post(
            "/api/v1/accounts/hrcdf-sync/runs/", {"mode": "units"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_home_unit_is_locked_409(self):
        response = self.client.post(
            "/api/v1/accounts/hrcdf-sync/home-unit/",
            {"unit_id": self.hrcdf_home.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 409)

    # Developed with Understanding: home-unit/ takes an HrcdfUnit id and fills the
    # Master_unit this-ship row from it in one transaction, then locks ShipIdentity.
    def test_home_unit_fills_the_this_ship_row(self):
        ShipIdentity.objects.update(unit=None, is_locked=False, ship_name="")
        Unit.objects.all().delete()
        picked = HrcdfUnit.objects.create(
            code="05555",
            name="KESARI",
            hrcdf_unit_id=94,
            station_code="NA",
            description="KESARI",
            unit_type="NAVAL SHIP",
            command=self.hrcdf_command,
            record_origin="SEED",
        )
        response = self.client.post(
            "/api/v1/accounts/hrcdf-sync/home-unit/",
            {"unit_id": picked.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Unit.objects.count(), 1)
        this_ship = Unit.objects.get()
        self.assertEqual(this_ship.name, "KESARI")
        self.assertEqual(this_ship.code, "05555")
        self.assertEqual(this_ship.hrcdf_unit_id, 94)
        self.assertEqual(this_ship.station_code, "NA")
        self.assertEqual(this_ship.description, "KESARI")
        self.assertEqual(this_ship.hrcdf_ship_name, "KESARI")
        self.assertEqual(this_ship.record_origin, "HRCDF")
        self.assertEqual(this_ship.command, self.command)
        self.assertIsNone(this_ship.unit_type)
        identity = ShipIdentity.objects.get()
        self.assertEqual(identity.unit, this_ship)
        self.assertEqual(identity.ship_name, "KESARI")
        self.assertTrue(identity.is_locked)
        home = response.data["home_unit"]
        self.assertEqual(
            set(home),
            {"id", "code", "name", "hrcdf_unit_id", "command_code", "locked"},
        )
        self.assertEqual(home["id"], picked.pk)
        self.assertEqual(home["code"], "05555")
        self.assertEqual(home["command_code"], "WNC")
        self.assertTrue(home["locked"])
        # Developed with Understanding: own-ship detection reads the filled row.
        run = hrcdf_sync._SyncRun("own", hrcdf_sync.home_unit(), mock.Mock())
        self.assertTrue(run.is_own_ship({"unitCode": "05555"}))
        self.assertTrue(run.is_own_ship({"unitCode": "", "unitId": 94}))
        self.assertFalse(run.is_own_ship({"unitCode": OTHER_CODE, "unitId": 900}))

    def test_home_unit_missing_is_400(self):
        ShipIdentity.objects.update(unit=None, is_locked=False)
        response = self.client.post(
            "/api/v1/accounts/hrcdf-sync/home-unit/",
            {"unit_id": 999999},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    # Developed with Understanding: units/ lists HrcdfUnit with HrcdfCommand options and
    # keeps its response keys. The hint follows Master_unit cmms_ship_name.
    def test_units_list_reads_hrcdf_masters(self):
        other_command = HrcdfCommand.objects.create(
            code="ENC", name="Eastern Naval Command", record_origin="SEED"
        )
        other = HrcdfUnit.objects.create(
            code="00359", name="CAR NICOBAR", command=other_command, unit_type="NAVAL SHIP"
        )
        Unit.objects.filter(pk=self.home.pk).update(cmms_ship_name=" car nicobar ")
        response = self.client.get("/api/v1/accounts/hrcdf-sync/units/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["code"] for item in response.data["commands"]], ["ENC", "WNC"]
        )
        self.assertEqual(set(response.data["commands"][0]), {"id", "code", "name"})
        row = next(item for item in response.data["units"] if item["id"] == other.pk)
        self.assertEqual(
            set(row),
            {
                "id",
                "code",
                "name",
                "hrcdf_unit_id",
                "command_id",
                "command_code",
                "unit_type",
                "record_origin",
            },
        )
        self.assertEqual(row["command_code"], "ENC")
        self.assertEqual(row["unit_type"], "NAVAL SHIP")
        self.assertEqual(response.data["hint"], other.pk)
        self.assertEqual(response.data["home_unit"]["id"], self.hrcdf_home.pk)
        filtered = self.client.get(
            "/api/v1/accounts/hrcdf-sync/units/", {"command": other_command.pk}
        )
        self.assertEqual([item["id"] for item in filtered.data["units"]], [other.pk])

    # Developed with Understanding: units/refresh/ answers exactly like runs/ - 202 with a
    # job_id when queued, even with no home unit picked.
    def test_units_refresh_is_queued_as_a_units_job(self):
        ShipIdentity.objects.update(unit=None, is_locked=False)
        queued = {"queued": True, "task": SimpleNamespace(id="task-u")}
        with mock.patch.object(hrcdf_sync, "dispatch_task", return_value=queued):
            response = self.client.post("/api/v1/accounts/hrcdf-sync/units/refresh/")
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["status"], "accepted")
        self.assertEqual(response.data["task_id"], "task-u")
        job = HrcdfSyncJob.objects.get(pk=response.data["job_id"])
        self.assertEqual(job.mode, "units")
        progress = self.client.get(
            f"/api/v1/accounts/hrcdf-sync/runs/{job.pk}/progress/"
        )
        self.assertEqual(progress.status_code, 200)
        self.assertEqual(progress.data["mode"], "units")

    # Developed with Understanding: the inline fallback runs the units job in the request
    # and answers 200 with its summary, as runs/ does.
    def test_units_refresh_inline_fallback(self):
        def run_inline(task, job_id):
            client = FakeHrcdfClient([hrcdf_record("H500", "08888", 888)])
            return {"queued": False, "result": run_hrcdf_sync_job(job_id, client=client)}

        with mock.patch.object(hrcdf_sync, "dispatch_task", side_effect=run_inline):
            response = self.client.post("/api/v1/accounts/hrcdf-sync/units/refresh/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["background_fallback"])
        self.assertEqual(response.data["summary"]["mode"], "units")
        self.assertEqual(response.data["summary"]["stats"]["units_created"], 1)
        self.assertIn("job_id", response.data)
        self.assertTrue(HrcdfUnit.objects.filter(code="08888").exists())

    @override_settings(HRCDF_SYNC={**HRCDF_TEST_CONFIG, "BASE_URL": ""})
    def test_units_refresh_unconfigured_is_400(self):
        response = self.client.post("/api/v1/accounts/hrcdf-sync/units/refresh/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("not configured", response.data["message"])
        self.assertFalse(HrcdfSyncJob.objects.exists())

    def test_personnel_list_pagination_and_search(self):
        for index in range(3):
            CustomUserProfile.objects.create(
                personal_number=f"PL{index}",
                firstname="Crew",
                full_name=f"CREW MEMBER {index}",
                auth_source=AUTH_SOURCE_HRCDF,
            )
        response = self.client.get(
            "/api/v1/accounts/hrcdf-sync/personnel/own/",
            {"page_size": 2, "search": "crew member"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertIsNotNone(response.data["next"])
        self.assertEqual(response.data["results"][0]["personal_number"], "PL0")
        self.assertEqual(response.data["results"][0]["auth_source"], AUTH_SOURCE_HRCDF)

    def test_other_personnel_list_filters(self):
        OtherCustomUserProfile.objects.create(
            personal_number="OL1", firstname="A", lastname="B", command_code="ENC"
        )
        OtherCustomUserProfile.objects.create(
            personal_number="OL2", firstname="C", lastname="D", command_code="WNC"
        )
        response = self.client.get(
            "/api/v1/accounts/hrcdf-sync/personnel/others/", {"command": "WNC"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertIsNone(response.data["results"][0]["user_active"])


# Developed with Understanding: the live userauth probe guards only the data-changing sync
# calls. With the probe refusing (userauth unreachable), the reads the Step 1 dropdowns
# depend on still answer and a POST is still refused.
class HrcdfSyncReadGateTests(HrcdfSyncTestBase):
    def setUp(self):
        super().setUp()
        allow = mock.patch.object(IsShipAdminRole, "has_permission", return_value=True)
        deny = mock.patch.object(IsLiveAuthzUser, "has_permission", return_value=False)
        for patcher in (allow, deny):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin_user)

    def test_units_and_readiness_load_without_the_live_probe(self):
        units = self.client.get("/api/v1/accounts/hrcdf-sync/units/")
        self.assertEqual(units.status_code, 200)
        self.assertIn("units", units.data)
        readiness = self.client.get("/api/v1/accounts/hrcdf-sync/readiness/")
        self.assertEqual(readiness.status_code, 200)

    def test_personnel_list_loads_without_the_live_probe(self):
        response = self.client.get("/api/v1/accounts/hrcdf-sync/personnel/own/")
        self.assertEqual(response.status_code, 200)

    def test_post_still_needs_the_live_probe(self):
        response = self.client.post(
            "/api/v1/accounts/hrcdf-sync/home-unit/", {"unit_id": 1}, format="json"
        )
        self.assertEqual(response.status_code, 403)


# --------------------------------------------------------------------------
# First-login adoption of a synced profile (CP-F)
# --------------------------------------------------------------------------


# Developed with Understanding: sync_principal against an open own-ship row written the
# way the HRCDF roster sync writes it (auth_source HRCDF, has_credentials False, no
# CustomUser, no authz_user_id). A local-memory cache keeps the fingerprint out of Redis.
# Developed with Understanding: HRCDF_API_URL is emptied (CP-K) so the login HRCDF refresh
# never reaches the real HRCDF host from a test.
@override_settings(CACHES=HRCDF_TEST_CACHES, HRCDF_API_URL="")
class FirstLoginAdoptionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.synced = self.synced_row("AB123C")

    def tearDown(self):
        cache.clear()

    # Developed with Understanding: one open synced row, as hrcdf_sync._write_own makes it.
    def synced_row(self, number, **overrides):
        values = {
            "personal_number": number,
            "firstname": "Arun",
            "auth_source": AUTH_SOURCE_HRCDF,
            "has_credentials": False,
            "is_role": False,
            "user_active": True,
        }
        values.update(overrides)
        return CustomUserProfile.objects.create(**values)

    # Developed with Understanding: a verified token payload. The claim is lower-cased on
    # purpose - swmm must upper-case it before matching.
    def token(self, uid=501, **claims):
        payload = {"user_id": uid, "username": "ab123c", "personal_number": "ab123c"}
        payload.update(claims)
        return payload

    def test_first_login_with_claim_adopts_synced_row(self):
        user = authz_sync.sync_principal(self.token())
        self.synced.refresh_from_db()
        self.assertEqual(user.user_profile_id, self.synced.pk)
        self.assertEqual(user.username, "AB123C")
        self.assertFalse(user.has_usable_password())
        self.assertEqual(self.synced.authz_user_id, 501)
        self.assertTrue(self.synced.has_credentials)
        self.assertEqual(self.synced.auth_source, AUTH_SOURCE_HRCDF)
        self.assertEqual(
            CustomUserProfile.objects.filter(personal_number="AB123C").count(), 1
        )
        self.assertEqual(CustomUserProfile.objects.count(), 1)
        self.assertEqual(CustomUser.objects.count(), 1)

    def test_no_claim_keeps_todays_behaviour(self):
        absent = authz_sync.sync_principal({"user_id": 502, "username": "ab123c"})
        blank = authz_sync.sync_principal(
            self.token(uid=503, username="zz100", personal_number="   ")
        )
        self.synced.refresh_from_db()
        self.assertIsNone(self.synced.authz_user_id)
        self.assertFalse(self.synced.has_credentials)
        for created in (absent, blank):
            self.assertNotEqual(created.user_profile_id, self.synced.pk)
            self.assertEqual(created.user_profile.auth_source, authz_sync.AUTH_SOURCE)
        self.assertEqual(CustomUserProfile.objects.count(), 3)

    def test_closed_row_is_not_adopted(self):
        closed = [
            self.synced_row("CL100", ship_leaving_date=timezone.now()),
            self.synced_row("CL200", user_active=False),
        ]
        for index, row in enumerate(closed):
            with self.subTest(number=row.personal_number):
                number = row.personal_number
                user = authz_sync.sync_principal(
                    self.token(uid=600 + index, username=number, personal_number=number)
                )
                row.refresh_from_db()
                self.assertIsNone(row.authz_user_id)
                self.assertFalse(row.has_credentials)
                self.assertNotEqual(user.user_profile_id, row.pk)

    def test_linked_row_is_not_adopted(self):
        linked = self.synced_row("LN100", authz_user_id=900)
        attached = self.synced_row("LN200")
        CustomUser.objects.create(username="LEGACYLN200", user_profile=attached)
        for uid, row in ((701, linked), (702, attached)):
            with self.subTest(number=row.personal_number):
                number = row.personal_number
                user = authz_sync.sync_principal(
                    self.token(uid=uid, username=number, personal_number=number)
                )
                self.assertNotEqual(user.user_profile_id, row.pk)
        linked.refresh_from_db()
        attached.refresh_from_db()
        self.assertEqual(linked.authz_user_id, 900)
        self.assertIsNone(attached.authz_user_id)

    # Developed with Understanding: the second token carries a different username and no
    # claim, so only match 1 (authz_user_id) can return the adopted pair.
    def test_second_login_hits_match_one(self):
        first = authz_sync.sync_principal(self.token())
        cache.clear()
        second = authz_sync.sync_principal(
            self.token(username="renamed", personal_number=None)
        )
        self.assertEqual(second.pk, first.pk)
        self.assertEqual(second.user_profile_id, self.synced.pk)
        self.assertEqual(CustomUser.objects.count(), 1)
        self.assertEqual(CustomUserProfile.objects.count(), 1)

    def test_newest_of_several_is_adopted_and_only_the_count_logged(self):
        older = self.synced
        older.ship_joining_date = timezone.now() - timedelta(days=30)
        older.save(update_fields=["ship_joining_date"])
        newer = self.synced_row("AB123C", ship_joining_date=timezone.now())
        with self.assertLogs("accounts.authz_sync", level="WARNING") as logs:
            user = authz_sync.sync_principal(self.token())
        self.assertEqual(user.user_profile_id, newer.pk)
        older.refresh_from_db()
        self.assertIsNone(older.authz_user_id)
        self.assertIn("found 2 open synced profiles", logs.output[0])
        self.assertNotIn("AB123C", logs.output[0])


# --------------------------------------------------------------------------
# Login routing by ship (CP-K)
# --------------------------------------------------------------------------


# Developed with Understanding: sync_principal with a home unit on the Master_unit
# this-ship row. accounts.login_routing.fetch_person is patched in every test, so HRCDF is
# never called, and HRCDF_API_URL is emptied as a second guard.
@override_settings(CACHES=HRCDF_TEST_CACHES, HRCDF_API_URL="")
class LoginRoutingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.home = Unit.objects.create(
            name="INS TEST", code=HOME_CODE, hrcdf_unit_id=HOME_HRCDF_ID
        )
        patcher = mock.patch("accounts.login_routing.fetch_person", return_value=None)
        self.fetch = patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        cache.clear()

    def token(self, uid, number, **claims):
        payload = {"user_id": uid, "username": number, "personal_number": number}
        payload.update(claims)
        return payload

    def test_own_login_creates_cup(self):
        self.fetch.return_value = hrcdf_record("OW100")
        user = authz_sync.sync_principal(self.token(801, "OW100"))
        self.assertIsNotNone(user.user_profile)
        self.assertIsNone(user.other_profile)
        self.assertFalse(user.is_other_unit)
        self.assertEqual(user.user_profile.authz_user_id, 801)
        self.assertFalse(OtherCustomUserProfile.objects.exists())
        # Developed with Understanding: the record read by classification is reused by the
        # refresh - one HRCDF call for the whole miss.
        self.fetch.assert_called_once()
        profile = CustomUserProfile.objects.get(pk=user.user_profile_id)
        self.assertEqual(profile.firstname, "Arun")
        self.assertEqual(profile.unit_code, HOME_CODE)
        self.assertIsNotNone(profile.hrcdf_synced_at)

    def test_other_login_creates_ocup_and_no_cup(self):
        self.fetch.return_value = hrcdf_record("OT100", OTHER_CODE, 900)
        user = authz_sync.sync_principal(
            self.token(802, "OT100", first_name="Ravi", is_super_admin=False)
        )
        self.assertIsNone(user.user_profile)
        self.assertTrue(user.is_other_unit)
        self.assertFalse(user.is_admin)
        self.assertFalse(user.has_usable_password())
        self.assertFalse(CustomUserProfile.objects.exists())
        other = OtherCustomUserProfile.objects.get(personal_number="OT100")
        self.assertEqual(user.other_profile_id, other.pk)
        self.assertEqual(other.authz_user_id, 802)
        self.assertEqual(other.record_origin, authz_sync.ORIGIN_LOGIN)
        self.assertTrue(other.is_current_other_unit)
        self.assertIsNotNone(other.last_login_at)
        self.assertEqual(other.unit_code, OTHER_CODE)
        self.fetch.assert_called_once()
        # Developed with Understanding: the cache hit of an other-ship login returns the
        # same user with no second classification.
        again = authz_sync.sync_principal(self.token(802, "OT100", first_name="Ravi"))
        self.assertEqual(again.pk, user.pk)
        self.fetch.assert_called_once()

    def test_other_login_adopts_synced_ocup(self):
        synced = OtherCustomUserProfile.objects.create(
            personal_number="OS100",
            firstname="Synced",
            lastname="Person",
            record_origin="HRCDF",
            is_current_other_unit=True,
            hrcdf_synced_at=timezone.now(),
        )
        user = authz_sync.sync_principal(self.token(803, "os100"))
        synced.refresh_from_db()
        self.assertEqual(user.other_profile_id, synced.pk)
        self.assertEqual(synced.authz_user_id, 803)
        self.assertEqual(synced.record_origin, "HRCDF")
        self.assertEqual(OtherCustomUserProfile.objects.count(), 1)
        self.assertFalse(CustomUserProfile.objects.exists())
        # Developed with Understanding: step 3 decided, and the row was read within 24
        # hours, so HRCDF was never called.
        self.fetch.assert_not_called()

    def test_admin_token_from_another_unit_is_own(self):
        for uid, claims in (
            (804, {"role_code": "SHIPADMIN"}),
            (805, {"is_super_admin": True}),
        ):
            number = f"AD{uid}"
            with self.subTest(claims=claims):
                OtherCustomUserProfile.objects.create(
                    personal_number=number, firstname="A", lastname="B"
                )
                user = authz_sync.sync_principal(self.token(uid, number, **claims))
                self.assertIsNotNone(user.user_profile)
                self.assertIsNone(user.other_profile)
                self.assertEqual(user.user_profile.authz_user_id, uid)

    def test_no_home_unit_means_own(self):
        Unit.objects.filter(pk=self.home.pk).update(code=None)
        OtherCustomUserProfile.objects.create(
            personal_number="NH100", firstname="A", lastname="B"
        )
        user = authz_sync.sync_principal(self.token(806, "NH100"))
        self.assertIsNotNone(user.user_profile)
        self.assertIsNone(user.other_profile)

    def test_token_unit_id_decides_when_hrcdf_is_silent(self):
        own = authz_sync.sync_principal(
            self.token(807, "TU100", unit_id=int(HOME_CODE))
        )
        self.assertIsNotNone(own.user_profile)
        with self.assertLogs("accounts.login_routing", level="WARNING") as logs:
            other = authz_sync.sync_principal(self.token(808, "TU200", unit_id=4321))
        self.assertTrue(other.is_other_unit)
        self.assertIn("808", logs.output[0])
        self.assertNotIn("TU200", logs.output[0])

    def test_transfer_own_to_other_moves_link_and_keeps_cup(self):
        self.fetch.return_value = hrcdf_record("TR100")
        first = authz_sync.sync_principal(self.token(809, "TR100"))
        old_profile_id = first.user_profile_id
        # Developed with Understanding: the roster leaver rule closes the own-ship row and
        # writes a current other-unit row (D4, D21).
        CustomUserProfile.objects.filter(pk=old_profile_id).update(
            user_active=False, ship_leaving_date=timezone.now()
        )
        OtherCustomUserProfile.objects.create(
            personal_number="TR100",
            firstname="Arun",
            lastname="Kumar",
            record_origin="HRCDF",
            hrcdf_synced_at=timezone.now(),
        )
        cache.clear()
        second = authz_sync.sync_principal(self.token(809, "TR100"))
        self.assertEqual(second.pk, first.pk)
        self.assertTrue(second.is_other_unit)
        self.assertIsNone(second.user_profile_id)
        other = OtherCustomUserProfile.objects.get(personal_number="TR100")
        self.assertEqual(second.other_profile_id, other.pk)
        self.assertEqual(other.authz_user_id, 809)
        old = CustomUserProfile.objects.get(pk=old_profile_id)
        self.assertIsNone(old.authz_user_id)
        self.assertEqual(CustomUserProfile.objects.count(), 1)

        # Developed with Understanding: and back on board - the roster writes a new open
        # row, which the own-class move adopts. The other-unit row is kept.
        rejoined = CustomUserProfile.objects.create(
            personal_number="TR100", firstname="Arun", auth_source=AUTH_SOURCE_HRCDF
        )
        OtherCustomUserProfile.objects.filter(pk=other.pk).update(
            is_current_other_unit=False
        )
        cache.clear()
        third = authz_sync.sync_principal(self.token(809, "TR100"))
        self.assertEqual(third.pk, first.pk)
        self.assertIsNone(third.other_profile_id)
        self.assertEqual(third.user_profile_id, rejoined.pk)
        self.assertTrue(OtherCustomUserProfile.objects.filter(pk=other.pk).exists())

    def test_hrcdf_refresh_writes_fields_and_is_skipped_inside_24_hours(self):
        synced = CustomUserProfile.objects.create(
            personal_number="RF100",
            firstname="Arun",
            auth_source=AUTH_SOURCE_HRCDF,
            rank_name="LT",
        )
        self.fetch.return_value = hrcdf_record("RF100", rankName="CDR")
        user = authz_sync.sync_principal(self.token(810, "RF100"))
        self.assertEqual(user.user_profile_id, synced.pk)
        synced.refresh_from_db()
        self.assertEqual(synced.rank_name, "CDR")
        self.assertIsNotNone(synced.hrcdf_synced_at)
        self.fetch.assert_called_once()
        cache.clear()
        authz_sync.sync_principal(self.token(810, "RF100"))
        self.fetch.assert_called_once()

    def test_hrcdf_failure_does_not_fail_login(self):
        self.fetch.return_value = hrcdf_record("HF100")
        with mock.patch.object(
            hrcdf_sync, "apply_person_record", side_effect=RuntimeError("boom")
        ):
            with self.assertLogs("accounts.authz_sync", level="WARNING") as logs:
                user = authz_sync.sync_principal(self.token(811, "HF100"))
        self.assertIsNotNone(user.user_profile)
        self.assertIn("RuntimeError", logs.output[-1])
        self.assertNotIn("HF100", logs.output[-1])

    @override_settings(HRCDF_API_URL="http://user:secret@hrcdf.test:10081/lite")
    def test_fetch_person_never_raises(self):
        import requests

        from accounts.hrcdf_client import fetch_person

        with mock.patch(
            "accounts.hrcdf_client.requests.get",
            side_effect=requests.exceptions.ConnectionError("unreachable"),
        ) as get:
            with self.assertLogs("accounts.hrcdf_client", level="WARNING") as logs:
                self.assertIsNone(fetch_person("PN100"))
        self.assertEqual(get.call_args.kwargs["params"], {"personnels": "PN100"})
        self.assertEqual(get.call_args.kwargs["timeout"], 5)
        self.assertNotIn("secret", logs.output[0])
        self.assertNotIn("PN100", logs.output[0])

    def test_cp_f_adoption_still_works_for_own_ship(self):
        synced = CustomUserProfile.objects.create(
            personal_number="CF100",
            firstname="Arun",
            auth_source=AUTH_SOURCE_HRCDF,
            has_credentials=False,
            hrcdf_synced_at=timezone.now(),
        )
        user = authz_sync.sync_principal(self.token(812, "cf100"))
        synced.refresh_from_db()
        self.assertEqual(user.user_profile_id, synced.pk)
        self.assertEqual(synced.authz_user_id, 812)
        self.assertTrue(synced.has_credentials)
        self.assertEqual(CustomUserProfile.objects.count(), 1)
        self.assertFalse(OtherCustomUserProfile.objects.exists())


# --------------------------------------------------------------------------
# Guest guard, unit status and reclassify (CP-L)
# --------------------------------------------------------------------------


# Developed with Understanding: requests through the real URL conf and the real
# FleetJWTAuthentication.authenticate. Only the SimpleJWT verification underneath it is
# patched to hand back a chosen user, so the guard itself runs exactly as in production.
@override_settings(CACHES=HRCDF_TEST_CACHES, HRCDF_API_URL="")
class GuestGuardTests(TestCase):
    def setUp(self):
        cache.clear()
        Unit.objects.create(
            name="INS TEST",
            code=HOME_CODE,
            hrcdf_unit_id=HOME_HRCDF_ID,
            hrcdf_ship_name="TEST",
        )
        other = OtherCustomUserProfile.objects.create(
            personal_number="GU100",
            firstname="Ravi",
            lastname="Nair",
            full_name="RAVI NAIR",
            section="INS OTHER",
            unit_code=OTHER_CODE,
            authz_user_id=901,
        )
        self.guest = CustomUser.objects.create(username="GU100", other_profile=other)
        own_profile = CustomUserProfile.objects.create(
            personal_number="OW200",
            firstname="Arun",
            lastname="Kumar",
            section="INS TEST",
            unit_code=HOME_CODE,
            role_master=Role.objects.create(role_name="Head of Department"),
            authz_user_id=902,
        )
        self.own = CustomUser.objects.create(username="OW200", user_profile=own_profile)
        self.api = APIClient()

    def tearDown(self):
        cache.clear()

    # Developed with Understanding: one GET as user through the whole DRF stack.
    def get_as(self, user, url):
        with mock.patch.object(
            JWTAuthentication, "authenticate", return_value=(user, {"user_id": 1})
        ):
            return self.api.get(url, HTTP_AUTHORIZATION="Bearer test")

    def test_guest_gets_403_not_401_on_a_normal_endpoint(self):
        self.assertTrue(self.guest.is_other_unit)
        response = self.get_as(self.guest, "/api/v1/accounts/ranks/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(), {"status": "error", "message": GUEST_DENIED_MESSAGE}
        )

    def test_guest_gets_200_on_unit_status(self):
        response = self.get_as(self.guest, "/api/v1/accounts/me/unit-status/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "is_other_unit": True,
                "role_display": "GUEST",
                "full_name": "RAVI NAIR",
                "personal_number": "GU100",
                "unit_name": "INS OTHER",
                "unit_code": OTHER_CODE,
                "home_ship_display_name": "INS TEST",
            },
        )

    def test_guest_gets_200_on_this_ship(self):
        response = self.get_as(self.guest, "/api/v1/master/this-ship/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["display_name"], "INS TEST")

    def test_own_user_is_unaffected(self):
        self.assertFalse(self.own.is_other_unit)
        ranks = self.get_as(self.own, "/api/v1/accounts/ranks/")
        self.assertEqual(ranks.status_code, 200)
        response = self.get_as(self.own, "/api/v1/accounts/me/unit-status/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["is_other_unit"])
        self.assertEqual(body["role_display"], "Head of Department")
        self.assertEqual(body["full_name"], "Arun Kumar")
        self.assertEqual(body["unit_code"], HOME_CODE)

    # Developed with Understanding: a request with no resolver_match yet is resolved from its
    # path, and every allowed name resolves to a real route.
    def test_url_name_falls_back_to_resolve(self):
        factory = RequestFactory()
        for path, name in (
            ("/api/v1/accounts/me/unit-status/", "users:me-unit-status"),
            ("/api/v1/master/this-ship/", "this-ship"),
            ("/api/v1/master/app-info/", "app-info"),
        ):
            with self.subTest(path=path):
                request = factory.get(path)
                self.assertIsNone(request.resolver_match)
                self.assertEqual(request_url_name(request), name)
                self.assertIn(name, settings.GUEST_ALLOWED_URL_NAMES)


# Developed with Understanding: manage.py reclassify_login_profiles (D32). One pre-CP-K login
# row of another unit's person (no personal number, another unit's code) and one own-ship
# login row (the home unit code), each with a CustomUser.
@override_settings(CACHES=HRCDF_TEST_CACHES, HRCDF_API_URL="")
class ReclassifyLoginProfilesTests(TestCase):
    def setUp(self):
        cache.clear()
        Unit.objects.create(
            name="INS TEST", code=HOME_CODE, hrcdf_unit_id=HOME_HRCDF_ID
        )
        self.moved_profile = CustomUserProfile.objects.create(
            firstname="Ravi",
            lastname="Nair",
            authz_user_id=911,
            unit_code=OTHER_CODE,
            section="INS OTHER",
            rank_name="LT",
            remarks="JOINED BY LOGIN",
            auth_source=authz_sync.AUTH_SOURCE,
            has_credentials=True,
        )
        self.moved = CustomUser.objects.create(
            username="RC100", user_profile=self.moved_profile
        )
        self.kept_profile = CustomUserProfile.objects.create(
            firstname="Arun", authz_user_id=912, unit_code=HOME_CODE
        )
        self.kept = CustomUser.objects.create(
            username="RC200", user_profile=self.kept_profile
        )

    def tearDown(self):
        cache.clear()

    def run_command(self, *args):
        out = io.StringIO()
        err = io.StringIO()
        call_command("reclassify_login_profiles", *args, stdout=out, stderr=err)
        return out.getvalue()

    def test_dry_run_writes_nothing(self):
        output = self.run_command()
        self.moved.refresh_from_db()
        self.moved_profile.refresh_from_db()
        self.assertEqual(self.moved.user_profile_id, self.moved_profile.pk)
        self.assertIsNone(self.moved.other_profile_id)
        self.assertTrue(self.moved_profile.user_active)
        self.assertEqual(self.moved_profile.authz_user_id, 911)
        self.assertEqual(self.moved_profile.remarks, "JOINED BY LOGIN")
        self.assertFalse(OtherCustomUserProfile.objects.exists())
        self.assertIn("RC100", output)
        self.assertIn("would move", output)
        self.assertIn("Total: 2 examined, 1 classed other, 0 moved", output)

    def test_apply_moves_other_row_and_keeps_cup(self):
        profiles_before = CustomUserProfile.objects.count()
        output = self.run_command("--apply")
        self.moved.refresh_from_db()
        self.moved_profile.refresh_from_db()
        other = OtherCustomUserProfile.objects.get(personal_number="RC100")
        self.assertIsNone(self.moved.user_profile_id)
        self.assertEqual(self.moved.other_profile_id, other.pk)
        self.assertTrue(self.moved.is_other_unit)
        self.assertEqual(other.authz_user_id, 911)
        self.assertEqual(other.record_origin, authz_sync.ORIGIN_LOGIN)
        self.assertTrue(other.is_current_other_unit)
        self.assertEqual(other.firstname, "Ravi")
        self.assertEqual(other.unit_code, OTHER_CODE)
        self.assertEqual(other.section, "INS OTHER")
        self.assertEqual(other.rank_name, "LT")
        # Developed with Understanding: the own-ship row is kept, closed and remarked (D32).
        self.assertEqual(CustomUserProfile.objects.count(), profiles_before)
        self.assertFalse(self.moved_profile.user_active)
        self.assertIsNone(self.moved_profile.authz_user_id)
        today = timezone.localdate().isoformat()
        self.assertEqual(
            self.moved_profile.remarks,
            f"JOINED BY LOGIN moved to other unit on {today}",
        )
        self.kept.refresh_from_db()
        self.assertEqual(self.kept.user_profile_id, self.kept_profile.pk)
        self.assertIsNone(self.kept.other_profile_id)
        self.assertIn("Total: 2 examined, 1 classed other, 1 moved (applied)", output)
        # Developed with Understanding: the next login of the moved person lands on the same
        # CustomUser as an other-ship login, with no new own-ship row.
        with mock.patch("accounts.login_routing.fetch_person", return_value=None):
            user = authz_sync.sync_principal(
                {"user_id": 911, "username": "rc100", "personal_number": "rc100"}
            )
        self.assertEqual(user.pk, self.moved.pk)
        self.assertTrue(user.is_other_unit)
        self.assertEqual(CustomUserProfile.objects.count(), profiles_before)

    def test_apply_links_an_existing_other_unit_row(self):
        synced = OtherCustomUserProfile.objects.create(
            personal_number="RC100",
            firstname="Ravi",
            lastname="Nair",
            record_origin="HRCDF",
            is_current_other_unit=True,
        )
        self.run_command("--apply")
        self.moved.refresh_from_db()
        synced.refresh_from_db()
        self.assertEqual(self.moved.other_profile_id, synced.pk)
        self.assertEqual(synced.authz_user_id, 911)
        self.assertEqual(synced.record_origin, "HRCDF")
        self.assertEqual(OtherCustomUserProfile.objects.count(), 1)
