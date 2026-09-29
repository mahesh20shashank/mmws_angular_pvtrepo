"""`SparesPurgeTests` - Clear OBS Spares.

Split out of the former flat `obs/tests.py` (Part 1 of the obs file-structure split).
"""

from rest_framework import status
from rest_framework.test import APITestCase

from accounts import rbac

from ..models import Authority, Denomination, EquipmentClass, Issue, SpareClass, Spares
from ._shared import MastersImportFixtureMixin, make_user


class SparesPurgeTests(MastersImportFixtureMixin, APITestCase):
    """Clear OBS Spares - the way back from a wrong import.

    `Spares` carries no provenance: no column records which import a row arrived on or who ran
    it. So "the spares he imported" cannot be expressed and is not what this does. A Head of
    Department clears HIS DEPARTMENT, all of it, and the confirmation says so in those words.
    """

    PURGE_STATE_URL = "/api/v1/onboard-spares/spares/purge-state/"
    PURGE_URL = "/api/v1/onboard-spares/spares/purge/"

    def _spare_for(self, department, pattern_number):
        """One saved spare, with the master rows it needs. Saved through the ORM rather than the
        import, because what is under test is the DELETE and not how the row got there."""
        spare_class, _ = SpareClass.objects.get_or_create(
            name="SPARES_EQUIPMENT", department=department
        )
        equipment_class, _ = EquipmentClass.objects.get_or_create(
            name="FIRE EXTINGUISHER", spare_class=spare_class
        )
        denomination, _ = Denomination.objects.get_or_create(
            name="NOS", department=department
        )
        authority, _ = Authority.objects.get_or_create(name="CNAL")
        return Spares.objects.create(
            pattern_number=pattern_number,
            description="SHAFT SLEEVE",
            equipment_class=equipment_class,
            denomination=denomination,
            authority=authority,
            category="PERMANENT",
            quantity_authorised=2,
            quantity_available=2,
        )

    def test_a_head_of_department_clears_his_own_department_and_no_other(self):
        engineering = self._department("ENGINEERING")
        electrical = self._department("ELECTRICAL")
        self._spare_for(engineering, "ENG-0001")
        self._spare_for(electrical, "ELE-0001")
        self._login_for(engineering)

        response = self.client.post(self.PURGE_URL, {"confirm": "DELETE"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["scope"], "department")
        self.assertFalse(Spares.objects.filter(
            equipment_class__spare_class__department=engineering
        ).exists())
        self.assertTrue(Spares.objects.filter(
            equipment_class__spare_class__department=electrical
        ).exists())

    def test_an_administrator_clears_every_department(self):
        engineering = self._department("ENGINEERING")
        electrical = self._department("ELECTRICAL")
        self._spare_for(engineering, "ENG-0001")
        self._spare_for(electrical, "ELE-0001")
        self._login_for(engineering, role_name=rbac.ROLE_ADMIN)

        response = self.client.post(self.PURGE_URL, {"confirm": "DELETE"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["scope"], "all")
        self.assertFalse(Spares.objects.exists())

    def test_a_dy_hod_is_refused_the_purge_outright(self):
        """The one role separation the requirement is explicit about.

        `rbac.is_hod_role` returns True for a Dy HOD, so `CanPurgeSpares` deliberately does not
        use it. This case is what keeps that from being quietly "simplified" back.
        """
        engineering = self._department("ENGINEERING")
        self._spare_for(engineering, "ENG-0001")
        self._login_for(engineering, role_name=rbac.ROLE_DY_HOD)

        self.assertEqual(
            self.client.get(self.PURGE_STATE_URL).status_code, status.HTTP_403_FORBIDDEN
        )
        self.assertEqual(
            self.client.post(self.PURGE_URL, {"confirm": "DELETE"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertTrue(Spares.objects.filter(
            equipment_class__spare_class__department=engineering
        ).exists())

    def test_a_storekeeper_is_refused_the_purge(self):
        engineering = self._department("ENGINEERING")
        self._spare_for(engineering, "ENG-0001")
        self.client.force_authenticate(self._make_user(engineering, suffix="99"))

        self.assertEqual(
            self.client.post(self.PURGE_URL, {"confirm": "DELETE"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertTrue(Spares.objects.filter(
            equipment_class__spare_class__department=engineering
        ).exists())

    def test_the_wrong_confirmation_phrase_deletes_nothing(self):
        engineering = self._department("ENGINEERING")
        self._spare_for(engineering, "ENG-0001")
        self._login_for(engineering)

        response = self.client.post(self.PURGE_URL, {"confirm": "yes"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Spares.objects.filter(
            equipment_class__spare_class__department=engineering
        ).exists())

    def test_a_spare_that_has_been_issued_is_deleted_with_its_issue_record(self):
        """The whole reason `purge_spares` is a service and not a one-line `.delete()`."""
        engineering = self._department("ENGINEERING")
        spare = self._spare_for(engineering, "ENG-0001")
        user = self._login_for(engineering)
        # `Issue.username` is a `CustomUserProfile` FK despite its name, not a string.
        Issue.objects.create(spare=spare, quantity_issued=1, username=user.user_profile)

        response = self.client.post(self.PURGE_URL, {"confirm": "DELETE"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Spares.objects.filter(pk=spare.pk).exists())
        self.assertFalse(Issue.objects.exists())

    def test_the_purge_state_reports_the_scope_and_the_live_count(self):
        """The count is what lets the confirmation name a real number instead of "all data"."""
        engineering = self._department("ENGINEERING")
        self._spare_for(engineering, "ENG-0001")
        self._spare_for(engineering, "ENG-0002")
        self._login_for(engineering)

        response = self.client.get(self.PURGE_STATE_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["scope"], "department")
        self.assertEqual(response.data["department_name"], "ENGINEERING")
        self.assertEqual(response.data["spare_count"], 2)
