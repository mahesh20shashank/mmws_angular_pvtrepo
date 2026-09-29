"""IIF (Item Issue Form) cart tests: `IIFApiTests`.

Split out of the former flat `ilms/tests.py` (the ilms file-structure split).
"""

from django.test import TestCase

from ..models import IIF
from ._shared import ILMSApiFixtureMixin


class IIFApiTests(ILMSApiFixtureMixin, TestCase):
    def test_obs_spares_can_be_added_to_iif_cart_without_duplicates(self):
        from obs.models import (
            Authority,
            EquipmentClass,
            SpareClass,
            Spares,
        )

        spare_class = SpareClass.objects.create(name="MO CLASS")
        equipment_class = EquipmentClass.objects.create(
            name="MO EQUIPMENT",
            spare_class=spare_class,
        )
        authority = Authority.objects.create(name="MO")
        spare = Spares.objects.create(
            equipment_class=equipment_class,
            pattern_number="OBS-IIF-1",
            description="Not incatted item",
            quantity_authorised=1,
            quantity_available=1,
            authority=authority,
        )

        first_response = self.client.post(
            "/api/v1/ilms/iif/add-items/",
            {"spare_ids": [spare.pk]},
            format="json",
        )
        second_response = self.client.post(
            "/api/v1/ilms/iif/add-items/",
            {"spare_ids": [spare.pk]},
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(IIF.objects.filter(spare_id=spare).count(), 1)

    # -- IIF reshape (item 3: source migration 0013) ------------------------------

    def test_iif_is_hod_field_replaces_renamed_sync_response(self):
        from obs.models import Authority, EquipmentClass, SpareClass, Spares

        spare_class = SpareClass.objects.create(name="MO CLASS 2")
        equipment_class = EquipmentClass.objects.create(
            name="MO EQUIPMENT 2",
            spare_class=spare_class,
        )
        authority = Authority.objects.create(name="MO 2")
        spare = Spares.objects.create(
            equipment_class=equipment_class,
            pattern_number="OBS-IIF-2",
            description="IIF reshape spare",
            quantity_authorised=1,
            quantity_available=1,
            authority=authority,
        )

        entry = IIF.objects.create(
            spare_id=spare,
            mo_item_id=self.item,
            vendor_id=self.vendor,
            is_hod=False,
        )
        self.assertFalse(hasattr(entry, "sync_response"))

        response = self.client.post(
            "/api/v1/ilms/iif/bulk-send-for-approval/",
            {"ids": [entry.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        entry.refresh_from_db()
        self.assertTrue(entry.is_hod)
        self.assertEqual(entry.mo_status, "Pending HOD Approval")
        self.assertTrue(entry.swmm_iifno)
        self.assertTrue(entry.swmm_iifno.endswith("IIF00001"))
