"""Phase B: the CMMS health check and the sync ledger.

Kept apart from tests.py, which covers the pull/push round-trips themselves. Nothing here
touches a real CMMS: the health check is driven against a fake connection, and the ledger is
exercised through throwaway functions rather than the real syncs, so what is being pinned is
the ledger's own behaviour and not any particular sync's.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.response import Response
from rest_framework.test import APIClient

from swmmapi import cmms_health, sync_ledger
from swmmapi.models import CmmsSyncRun


class FakeCursor:
    def execute(self, *args, **kwargs):
        return None

    def fetchone(self):
        return (1,)

    def close(self):
        return None


class FakeConnection:
    def cursor(self):
        return FakeCursor()

    def close(self):
        return None


class CmmsHealthTests(TestCase):
    def setUp(self):
        cmms_health.reset_health_cache()
        self.addCleanup(cmms_health.reset_health_cache)

    def test_select_one_means_reachable(self):
        with patch.object(
            cmms_health, "get_mssql_connection", return_value=FakeConnection()
        ):
            reachable, error = cmms_health.cmms_reachable(force_refresh=True)

        self.assertTrue(reachable)
        self.assertIsNone(error)

    def test_connection_failure_is_an_answer_not_an_exception(self):
        """An unreachable CMMS is the normal state on a ship for long stretches. Callers
        must be able to ask without wrapping the question in try/except."""
        with patch.object(
            cmms_health,
            "get_mssql_connection",
            side_effect=RuntimeError("Login timeout expired"),
        ):
            reachable, error = cmms_health.cmms_reachable(force_refresh=True)

        self.assertFalse(reachable)
        self.assertIn("Login timeout", error)

    def test_answer_is_cached(self):
        """The frontend polls this and several screens gate on it; uncached, each of those
        would open its own MSSQL connection."""
        with patch.object(
            cmms_health, "get_mssql_connection", return_value=FakeConnection()
        ) as connect:
            cmms_health.cmms_reachable(force_refresh=True)
            cmms_health.cmms_reachable()
            cmms_health.cmms_reachable()

        self.assertEqual(connect.call_count, 1)

    def test_force_refresh_bypasses_the_cache(self):
        with patch.object(
            cmms_health, "get_mssql_connection", return_value=FakeConnection()
        ) as connect:
            cmms_health.cmms_reachable(force_refresh=True)
            cmms_health.cmms_reachable(force_refresh=True)

        self.assertEqual(connect.call_count, 2)


class SyncLedgerTests(TestCase):
    def test_successful_run_is_recorded_with_its_tallies(self):
        @sync_ledger.ledgered("pull", "fuss")
        def fake_pull():
            return {"fetched": 10, "created": 4, "updated": 6, "skipped": 0}

        fake_pull()

        run = CmmsSyncRun.objects.get()
        self.assertEqual(run.status, CmmsSyncRun.Status.SUCCESS)
        self.assertEqual((run.fetched, run.created, run.updated), (10, 4, 6))
        self.assertIsNotNone(run.finished_at)

    def test_exception_is_recorded_then_re_raised(self):
        """The ledger observes. It must never swallow a failure the caller has to see."""

        @sync_ledger.ledgered("pull", "fuss")
        def fake_pull():
            raise RuntimeError("CMMS went away")

        with self.assertRaises(RuntimeError):
            fake_pull()

        run = CmmsSyncRun.objects.get()
        self.assertEqual(run.status, CmmsSyncRun.Status.FAILED)
        self.assertIn("CMMS went away", run.error)

    def test_error_response_is_recorded_as_a_failure(self):
        """The push views catch their own exceptions and answer with an error Response, so
        "did not raise" is not the same as "worked" -- the exact hole the ledger closes."""

        @sync_ledger.ledgered("push", "fuss")
        def fake_push():
            return Response({"status": "error", "message": "CMMS MSSQL sync failed"})

        fake_push()

        run = CmmsSyncRun.objects.get()
        self.assertEqual(run.status, CmmsSyncRun.Status.FAILED)
        self.assertIn("CMMS MSSQL sync failed", run.error)

    def test_http_error_status_is_recorded_as_a_failure(self):
        @sync_ledger.ledgered("push", "srar")
        def fake_push():
            return Response({"status": False, "message": "CMMS rejected"}, status=502)

        fake_push()

        self.assertEqual(CmmsSyncRun.objects.get().status, CmmsSyncRun.Status.FAILED)

    def test_ok_response_is_still_a_success(self):
        @sync_ledger.ledgered("push", "fuss")
        def fake_push():
            return Response({"status": "success", "synced_count": 3})

        fake_push()

        self.assertEqual(CmmsSyncRun.objects.get().status, CmmsSyncRun.Status.SUCCESS)

    def test_all_skipped_is_partial_not_success(self):
        """"Ran fine, matched nothing" has to be distinguishable from "ran fine"."""

        @sync_ledger.ledgered("pull", "completed_routines")
        def fake_pull():
            return {"fetched": 40, "created": 0, "updated": 0, "skipped": 40}

        fake_pull()

        self.assertEqual(CmmsSyncRun.objects.get().status, CmmsSyncRun.Status.PARTIAL)

    def test_tuple_returning_sync_functions_are_mapped(self):
        """cmms_pull_change_requests and friends hand back a bare tuple, not a dict."""

        @sync_ledger.ledgered(
            "pull",
            "change_requests",
            adapter=sync_ledger.tuple_stats("inserted", "updated", "skipped", "total"),
        )
        def fake_pull():
            return (3, 5, 1, 9)

        fake_pull()

        run = CmmsSyncRun.objects.get()
        self.assertEqual(
            (run.created, run.updated, run.skipped, run.fetched), (3, 5, 1, 9)
        )

    def test_trigger_defaults_to_manual_and_can_be_set_ambiently(self):
        """Phase D's scheduled reconnect sets the trigger for its whole run rather than
        threading it through every sync function."""

        @sync_ledger.ledgered("pull", "fuss")
        def fake_pull():
            return {}

        fake_pull()
        with sync_ledger.sync_trigger(CmmsSyncRun.Trigger.AUTO):
            fake_pull()

        triggers = list(
            CmmsSyncRun.objects.order_by("id").values_list("trigger", flat=True)
        )
        self.assertEqual(
            triggers, [CmmsSyncRun.Trigger.MANUAL, CmmsSyncRun.Trigger.AUTO]
        )


class SyncStatusEndpointTests(TestCase):
    def setUp(self):
        cmms_health.reset_health_cache()
        self.addCleanup(cmms_health.reset_health_cache)

        self.user = get_user_model().objects.create(username="ledger-test")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_health_endpoint_reports_unreachable_without_raising(self):
        with patch.object(
            cmms_health, "get_mssql_connection", side_effect=RuntimeError("no route")
        ):
            response = self.client.get("/api/v1/swmmapi/cmms/health/?refresh=1")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["reachable"])
        self.assertIn("no route", response.data["error"])

    def test_sync_status_separates_last_success_from_last_attempt(self):
        """A module that worked this morning and has failed on every attempt since still
        looks healthy if you only ask when it last succeeded."""
        CmmsSyncRun.objects.create(
            direction="pull", module="fuss", status=CmmsSyncRun.Status.SUCCESS
        )
        CmmsSyncRun.objects.create(
            direction="pull",
            module="fuss",
            status=CmmsSyncRun.Status.FAILED,
            error="CMMS went away",
        )

        with patch.object(
            cmms_health, "get_mssql_connection", return_value=FakeConnection()
        ):
            response = self.client.get("/api/v1/swmmapi/cmms/sync-status/")

        fuss = next(m for m in response.data["modules"] if m["module"] == "fuss")
        self.assertIsNotNone(fuss["last_success_at"])
        self.assertEqual(fuss["last_attempt_status"], CmmsSyncRun.Status.FAILED)
        self.assertFalse(fuss["never_run"])

    def test_sync_status_shows_modules_that_have_never_run(self):
        """Absent is not the same as fine; a module nobody has ever synced must be visible."""
        with patch.object(
            cmms_health, "get_mssql_connection", return_value=FakeConnection()
        ):
            response = self.client.get("/api/v1/swmmapi/cmms/sync-status/")

        dart = next(m for m in response.data["modules"] if m["module"] == "dart")
        self.assertTrue(dart["never_run"])
        self.assertIsNone(dart["last_success_at"])

    def test_sync_runs_endpoint_filters_by_module(self):
        CmmsSyncRun.objects.create(direction="pull", module="fuss", status="success")
        CmmsSyncRun.objects.create(direction="push", module="dart", status="success")

        response = self.client.get("/api/v1/swmmapi/cmms/sync-runs/?module=dart")

        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["module"], "dart")
