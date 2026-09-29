"""Regression tests for the CMMS pull/push round-trips.

CI has no CMMS instance, so every test here drives the real pull function against a stub
cursor that answers the exact queries it issues. That is enough to pin the two things that
actually broke in production: which CMMS column a closure is read from, and what a null
CMMS `Status` is allowed to mean for equipment that is already approved.
"""

from unittest.mock import patch

from django.test import TestCase

from ems.models import FussRaiseDetails
from sfd.models import ShipEquipment
from swmmapi import views


class StubCursor:
    """Answers the queries pull_cmms_fuss / cmms_refresh_equipment_status actually issue.

    `rows_for` maps a substring of the query to (columns, rows); the first match wins, so a
    test only has to describe the tables it cares about.
    """

    def __init__(self, rows_for):
        self.rows_for = rows_for
        self._columns = []
        self._rows = []

    def execute(self, query, params=None):
        for needle, (columns, rows) in self.rows_for.items():
            if needle in query:
                self._columns, self._rows = columns, rows
                return
        self._columns, self._rows = [], []

    @property
    def description(self):
        return [(name,) for name in self._columns]

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def close(self):
        pass


FUSS_COLUMNS = [
    "Universal_ID_T_Fuss",
    "CancelDate",
    "IsNoRoutineUndertaken",
    "IsMailSent",
]


def fuss_row(cancel_date=None, is_no_routine_undertaken=None):
    return ("FUSS-1", cancel_date, is_no_routine_undertaken, 0)


class PullCmmsFussClosureTests(TestCase):
    """A FUSS closed in SWMM is pushed up as IsNoRoutineUndertaken, so the pull has to read
    that column back. Reading only CancelDate silently reverted the close on every sync."""

    def _pull(self, row):
        cursor = StubCursor({"T_Fuss": (FUSS_COLUMNS, [row])})
        with patch.object(views, "get_this_ship", return_value=None):
            return views.pull_cmms_fuss(cursor, "SHIP-1")

    def test_is_no_routine_undertaken_closes_the_fuss(self):
        stats = self._pull(fuss_row(is_no_routine_undertaken=1))

        self.assertEqual(stats["created"], 1)
        self.assertTrue(FussRaiseDetails.objects.get(universal_id_t_fuss="FUSS-1").isclosed_fuss)

    def test_cancel_date_still_closes_the_fuss(self):
        from datetime import datetime

        stats = self._pull(fuss_row(cancel_date=datetime(2026, 9, 1, 10, 0)))

        self.assertEqual(stats["created"], 1)
        self.assertTrue(FussRaiseDetails.objects.get(universal_id_t_fuss="FUSS-1").isclosed_fuss)

    def test_open_fuss_stays_open(self):
        self._pull(fuss_row())

        self.assertFalse(FussRaiseDetails.objects.get(universal_id_t_fuss="FUSS-1").isclosed_fuss)

    def test_close_survives_a_second_pull(self):
        """The actual production symptom: push sets IsNoRoutineUndertaken, and the next pull
        used to read CancelDate (still null) and flip the row back to open."""
        self._pull(fuss_row(is_no_routine_undertaken=1))
        self._pull(fuss_row(is_no_routine_undertaken=1))

        self.assertTrue(FussRaiseDetails.objects.get(universal_id_t_fuss="FUSS-1").isclosed_fuss)


EQUIPMENT_COLUMNS = [
    "Universal_ID_T_EquipmentShipDetail",
    "Status",
    "INSMAREMARKS",
    "Active",
]


class RefreshEquipmentStatusTests(TestCase):
    def setUp(self):
        views._CMMS_COLUMN_CACHE.clear()
        self.addCleanup(views._CMMS_COLUMN_CACHE.clear)

    def _refresh(self, cmms_row, has_active_column=True):
        columns = [("Universal_ID_T_EquipmentShipDetail",), ("Status",), ("INSMAREMARKS",)]
        if has_active_column:
            columns.append(("Active",))
        cursor = StubCursor(
            {
                "INFORMATION_SCHEMA.COLUMNS": (["COLUMN_NAME"], columns),
                "T_EquipmentShipDetail": (EQUIPMENT_COLUMNS, [cmms_row]),
            }
        )
        return views.cmms_refresh_equipment_status(cursor)

    def _equipment(self, status):
        return ShipEquipment.objects.create(
            universal_id_t_equipment_ship_detail="EQ-1",
            status=status,
            active=True,
        )

    def test_approved_submission_goes_active(self):
        """Unchanged behaviour for equipment still awaiting review."""
        equipment = self._equipment("2")

        self._refresh(("EQ-1", 1, None, 1))

        equipment.refresh_from_db()
        self.assertEqual(equipment.status, "active")

    def test_rejected_submission_goes_to_three(self):
        equipment = self._equipment("2")

        self._refresh(("EQ-1", 3, None, 1))

        equipment.refresh_from_db()
        self.assertEqual(equipment.status, "3")

    def test_active_equipment_is_not_pushed_back_under_review(self):
        """The trap in widening the filter: CMMS leaves Status null on long-approved rows,
        so 'not 1' must not be read as 'under review' for equipment already active."""
        equipment = self._equipment("active")

        self._refresh(("EQ-1", None, None, 1))

        equipment.refresh_from_db()
        self.assertEqual(equipment.status, "active")
        self.assertTrue(equipment.active)

    def test_active_equipment_rejected_in_cmms_is_detected(self):
        """The reason the filter was widened: this used to be invisible, because an already
        active row had left the old status__in=["2","3"] queryset for good."""
        equipment = self._equipment("active")

        updated, checked = self._refresh(("EQ-1", 3, None, 1))

        equipment.refresh_from_db()
        self.assertEqual(equipment.status, "3")
        self.assertEqual((updated, checked), (1, 1))

    def test_explicit_cmms_deactivation_deactivates_locally(self):
        equipment = self._equipment("active")

        self._refresh(("EQ-1", None, None, 0))

        equipment.refresh_from_db()
        self.assertFalse(equipment.active)

    def test_missing_active_column_is_not_a_deactivation(self):
        """Deployments whose T_EquipmentShipDetail has no Active column select NULL for it;
        that must read as 'no signal', not as 'deactivated'."""
        equipment = self._equipment("active")

        self._refresh(("EQ-1", None, None, None), has_active_column=False)

        equipment.refresh_from_db()
        self.assertTrue(equipment.active)


class SyncAllSrarDirectionTests(TestCase):
    """Sync All's SRAR module has to PUSH what the ship has approved, then PULL what CMMS has.

    SRARSyncByMonthYearAPIView picks its direction from cmms_sync_status when no `mode` is
    given, so "approved but not yet synced" -- the exact state of every return this button
    exists to send -- read as "first time, pull from CMMS". The old caller passed no mode
    and only ever asked for the current month, so it could not push at all.

    The pull half then only ran when there was nothing to push, so a ship carrying any
    backlog of its own never saw a return entered in CMMS. Both halves now run, in that
    order: pushing first mints CMMS's identity onto the local returns, so the pull matches
    them instead of landing a second copy of the same month.
    """

    def setUp(self):
        from srar.models import SrarMonthlyHeader

        self.header_model = SrarMonthlyHeader
        self.view = views.SyncAllTransactionsAPIView()

        # The pull runs on every call now, so it has to be stubbed for all of these or each
        # test opens a real MSSQL connection and waits out its login timeout -- which is
        # what made this suite take two minutes instead of two seconds.
        self.pull_patch = patch.object(
            views.SRARPullFromCMMSAPIView,
            "_stream_pull",
            side_effect=lambda request: iter(["[NEW] Monthly headers inserted: 1\n"]),
        )
        self.pull = self.pull_patch.start()
        self.addCleanup(self.pull_patch.stop)

    def _request(self, user):
        from rest_framework.test import APIRequestFactory

        request = APIRequestFactory().post("/api/v1/swmmapi/sync-all-transactions/")
        request.user = user
        return request

    def _co_user(self):
        from django.contrib.auth import get_user_model

        user = get_user_model()(username="co-test")
        user.is_admin = True  # rbac.is_co_role accepts admins
        return user

    def _approved_pending_return(self):
        return self.header_model.objects.create(
            srar_month=4, srar_year=2024, co_approved=True, cmms_sync_status=False
        )

    def test_approved_unsynced_return_is_pushed_with_mode_push(self):
        self._approved_pending_return()
        seen = {}

        class FakeResponse:
            status_code = 200
            data = {"status": True, "message": "SRAR return written to CMMS."}

        def fake_view(sub_request):
            seen.update(sub_request.GET.dict())
            return FakeResponse()

        with patch.object(
            views.SRARSyncByMonthYearAPIView, "as_view", return_value=fake_view
        ):
            result = self.view._run_srar(self._request(self._co_user()))

        # The whole point: mode=push, and the return's own month -- not today's.
        self.assertEqual(seen.get("mode"), "push")
        self.assertEqual((seen.get("month"), seen.get("year")), ("4", "2024"))
        self.assertTrue(result["status"])
        self.assertIn("Pushed 1", result["message"])

    def test_nothing_pending_still_pulls(self):
        """A fresh database has nothing to send, and seeding from CMMS is right there."""
        result = self.view._run_srar(self._request(self._co_user()))

        self.pull.assert_called_once()
        self.assertTrue(result["status"])
        self.assertIn("No SRAR return pending push", result["message"])

    def test_pending_returns_do_not_stop_the_pull(self):
        """The gap this closes: a ship with a backlog of its own never saw CMMS's returns,
        because the pull used to run only when there was nothing local to push."""
        self._approved_pending_return()

        class FakeResponse:
            status_code = 200
            data = {"status": True, "message": "SRAR return written to CMMS."}

        with patch.object(
            views.SRARSyncByMonthYearAPIView,
            "as_view",
            return_value=lambda sub_request: FakeResponse(),
        ):
            result = self.view._run_srar(self._request(self._co_user()))

        self.pull.assert_called_once()
        self.assertIn("Pushed 1", result["message"])
        self.assertIn("1 new record(s)", result["message"])

    def test_unapproved_return_is_not_pushed(self):
        """CO approval gates the push; an unapproved return is not 'pending'."""
        self.header_model.objects.create(
            srar_month=5, srar_year=2024, co_approved=False, cmms_sync_status=False
        )

        with patch.object(views.SRARSyncByMonthYearAPIView, "as_view") as push_view:
            result = self.view._run_srar(self._request(self._co_user()))

        push_view.assert_not_called()
        self.pull.assert_called_once()
        self.assertIn("No SRAR return pending push", result["message"])

    def test_non_co_user_is_reported_as_a_skip_not_a_failure(self):
        from django.contrib.auth import get_user_model

        self._approved_pending_return()
        user = get_user_model()(username="rating-test")

        result = self.view._run_srar(self._request(user))

        self.assertTrue(result["status"])
        self.assertIn("only a CO login", result["message"])

    def test_push_failure_is_reported_as_a_failure(self):
        self._approved_pending_return()

        class FakeResponse:
            status_code = 502
            data = {"status": False, "message": "CMMS rejected the write"}

        with patch.object(
            views.SRARSyncByMonthYearAPIView,
            "as_view",
            return_value=lambda sub_request: FakeResponse(),
        ):
            result = self.view._run_srar(self._request(self._co_user()))

        self.assertFalse(result["status"])
        self.assertIn("CMMS rejected the write", result["message"])
