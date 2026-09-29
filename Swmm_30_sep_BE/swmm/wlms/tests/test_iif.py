"""Issue-in-Fault (IIF) workflow tests: `IIFApiTests`.

Split out of the former flat `wlms/tests.py` (the wlms file-structure split, mirroring
the earlier `obs/tests/` package split). Includes the `raise_iif` action's tests (item 4
of the wlms port-real-gaps plan) alongside the pre-existing `add_items` tests.
"""

from django.test import TestCase

from ..models import WEDIIF, WEDIIFDetails
from ._shared import WLMSApiFixtureMixin


class IIFApiTests(WLMSApiFixtureMixin, TestCase):
    def test_obs_spare_can_be_added_to_wed_iif_without_duplicates(self):
        from obs.models import (
            Authority,
            EquipmentClass,
            SpareClass,
            Spares,
        )

        spare_class = SpareClass.objects.create(name="WED IIF CLASS")
        equipment_class = EquipmentClass.objects.create(
            name="WED IIF EQUIPMENT",
            spare_class=spare_class,
        )
        authority = Authority.objects.create(name="WED")
        obs_spare = Spares.objects.create(
            equipment_class=equipment_class,
            pattern_number="OBS-WED-IIF-1",
            description="Weapon support item awaiting incat",
            quantity_authorised=1,
            quantity_available=1,
            authority=authority,
        )

        first_response = self.client.post(
            "/api/v1/wlms/wediif/add-items/",
            {"spare_ids": [obs_spare.pk]},
            format="json",
        )
        second_response = self.client.post(
            "/api/v1/wlms/wediif/add-items/",
            {"spare_ids": [obs_spare.pk]},
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(WEDIIF.objects.filter(spare_id=obs_spare).count(), 1)

    def test_add_items_tags_iif_cart_by_spare_category(self):
        from obs.models import (
            Authority,
            EquipmentClass,
            SpareClass,
            Spares,
        )

        spare_class = SpareClass.objects.create(name="WED IIF CART CLASS")
        equipment_class = EquipmentClass.objects.create(
            name="WED IIF CART EQUIPMENT",
            spare_class=spare_class,
        )
        authority = Authority.objects.create(name="WED CART")
        permanent_spare = Spares.objects.create(
            equipment_class=equipment_class,
            pattern_number="OBS-WED-IIF-CART-P",
            description="Permanent spare awaiting incat",
            quantity_authorised=1,
            quantity_available=1,
            authority=authority,
            category=Spares.PERMANENT,
        )
        consumable_spare = Spares.objects.create(
            equipment_class=equipment_class,
            pattern_number="OBS-WED-IIF-CART-C",
            description="Consumable spare awaiting incat",
            quantity_authorised=1,
            quantity_available=1,
            authority=authority,
            category=Spares.CONSUMABLE,
        )

        response = self.client.post(
            "/api/v1/wlms/wediif/add-items/",
            {
                "spare_ids": [permanent_spare.pk, consumable_spare.pk],
                "cart_type": "pts",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        # PERMANENT (and QUASI_PERMANENT) honour the requested survey/pts cart_type ...
        self.assertEqual(
            WEDIIF.objects.get(spare_id=permanent_spare).iif_cart, "pts"
        )
        # ... every other category always resolves to 'demand', regardless of cart_type.
        self.assertEqual(
            WEDIIF.objects.get(spare_id=consumable_spare).iif_cart, "demand"
        )

    def test_wlms_iif_detail_and_approval_flow(self):
        from obs.models import Authority, Denomination as ObsDenomination
        from obs.models import EquipmentClass, SpareClass, Spares
        from master.models import Department

        department = Department.objects.create(name="WED", code="WED")
        spare_class = SpareClass.objects.create(name="WED CLASS", department=department)
        equipment_class = EquipmentClass.objects.create(
            name="WED EQPT",
            spare_class=spare_class,
        )
        denomination = ObsDenomination.objects.create(name="NOS", department=department)
        authority = Authority.objects.create(name="WED")
        obs_spare = Spares.objects.create(
            equipment_class=equipment_class,
            pattern_number="OBS-WED-1",
            description="WED onboard spare",
            category=Spares.PERMANENT,
            denomination=denomination,
            quantity_authorised=2,
            quantity_available=1,
            authority=authority,
        )
        add_response = self.client.post(
            "/api/v1/wlms/wediif/add-items/",
            {"spare_ids": [obs_spare.pk]},
            format="json",
        )
        iif_id = add_response.data["created"][0]["id"]
        detail_response = self.client.post(
            "/api/v1/wlms/wediif-details/",
            {"wed_iif": iif_id, "iif_no": "WED-IIF-001"},
            format="json",
        )
        send_response = self.client.post(
            f"/api/v1/wlms/wediif/{iif_id}/send-for-approval/"
        )
        approve_response = self.client.post(f"/api/v1/wlms/wediif/{iif_id}/approve/")

        self.assertEqual(add_response.status_code, 201)
        self.assertEqual(detail_response.status_code, 201)
        self.assertEqual(send_response.status_code, 200)
        self.assertEqual(approve_response.status_code, 200)
        iif = WEDIIF.objects.get(pk=iif_id)
        self.assertEqual(iif.user_id, self.user_profile)
        self.assertTrue(iif.is_hod)
        self.assertTrue(iif.is_approval)
        self.assertTrue(WEDIIFDetails.objects.filter(wed_iif=iif).exists())

    def test_raise_iif_for_existing_spare_creates_wediif_pair(self):
        from obs.models import Authority, EquipmentClass, SpareClass, Spares

        spare_class = SpareClass.objects.create(name="RAISE IIF CLASS")
        equipment_class = EquipmentClass.objects.create(
            name="RAISE IIF EQUIPMENT",
            spare_class=spare_class,
        )
        authority = Authority.objects.create(name="RAISE IIF AUTHORITY")
        obs_spare = Spares.objects.create(
            equipment_class=equipment_class,
            pattern_number="OBS-RAISE-IIF-1",
            description="Existing catalogued spare",
            quantity_authorised=1,
            quantity_available=1,
            authority=authority,
        )

        response = self.client.post(
            "/api/v1/wlms/wediif/raise-iif/",
            {"spare_id": str(obs_spare.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        wed_iif = WEDIIF.objects.get(pk=response.data["wed_iif"]["id"])
        self.assertEqual(wed_iif.spare_id, obs_spare)
        self.assertEqual(wed_iif.user_id, self.user_profile)
        details = WEDIIFDetails.objects.get(wed_iif=wed_iif)
        self.assertTrue(details.iif_no)
        self.assertEqual(details.pattern_number, "")
        self.assertEqual(details.category, "")

    def test_raise_iif_for_other_spare_stores_free_form_fields(self):
        from obs.models import Denomination

        Denomination.objects.create(name="NOS", department=self.department)

        response = self.client.post(
            "/api/v1/wlms/wediif/raise-iif/",
            {
                "spare_id": "other",
                "pattern_number": "NEW-OTHER-PART-1",
                "description": "A spare not yet catalogued in OBS",
                "category": "PERMANENT",
                "denomination": "nos",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        wed_iif = WEDIIF.objects.get(pk=response.data["wed_iif"]["id"])
        self.assertIsNone(wed_iif.spare_id)
        details = WEDIIFDetails.objects.get(wed_iif=wed_iif)
        self.assertEqual(details.pattern_number, "NEW-OTHER-PART-1")
        self.assertEqual(details.description, "A spare not yet catalogued in OBS")
        self.assertEqual(details.category, "P")
        self.assertEqual(details.denomination.name, "NOS")
        self.assertTrue(details.iif_no)

    def test_raise_iif_other_spare_missing_required_fields_returns_400(self):
        response = self.client.post(
            "/api/v1/wlms/wediif/raise-iif/",
            {"spare_id": "other", "description": "Missing pattern number and category"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_raise_iif_other_spare_unknown_category_returns_400(self):
        response = self.client.post(
            "/api/v1/wlms/wediif/raise-iif/",
            {
                "spare_id": "other",
                "pattern_number": "NEW-OTHER-PART-2",
                "description": "Has an invalid category",
                "category": "NOT-A-REAL-CATEGORY",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_raise_iif_other_spare_unknown_denomination_returns_400(self):
        response = self.client.post(
            "/api/v1/wlms/wediif/raise-iif/",
            {
                "spare_id": "other",
                "pattern_number": "NEW-OTHER-PART-3",
                "description": "Has an unknown denomination",
                "category": "CONSUMABLE",
                "denomination": "NO-SUCH-DENOMINATION",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
