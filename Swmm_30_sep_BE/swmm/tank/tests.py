from django.test import TestCase

from .models import (
    TankCategory,
    TankTypeDetail,
    TankFluidUnit,
    TankFuelSounding,
    MeasurementFuelsondingFinal,
    TankRecord,
)
from .serializers import TankTypeDetailSerializer


class BaseTankTestCase(TestCase):
    def setUp(self):
        self.unit = TankFluidUnit.objects.create(fluid_unit="m3")

        self.tank_category = TankCategory.objects.create(
            tank_category="TestCat",
            manual_name="MN",
        )

        self.tank_type_detail = TankTypeDetail.objects.create(
            tank=self.tank_category,
            unit=self.unit,
            tank_type="MN",
        )

        self.tank_fuel_sounding = TankFuelSounding.objects.create(
            mm=5,
            volume=50,
            tone=1.0,
            type=self.tank_category,
        )

        self.tank_record = TankRecord.objects.create(
            tank_category=self.tank_category,
            manual_name="MN",
            mm_measurement=10.00,
        )


class TankModelTests(BaseTankTestCase):
    def test_create_mock_record(self):
        mock = TankCategory.objects.create(
            tank_category="MockCat",
            manual_name="Mock1",
        )

        self.assertIsNotNone(mock.id)
        self.assertTrue(TankCategory.objects.filter(manual_name="Mock1").exists())

    def test_measurement_str_handles_missing_created_at(self):
        measurement = MeasurementFuelsondingFinal.objects.create(
            mm=10,
            volume=100,
            tone=1.0,
        )

        result = str(measurement)

        self.assertIn("Measurement", result)
        self.assertTrue("10.0mm" in result or "10mm" in result)

    def test_tankfuelsounding_str_no_serial(self):
        result = str(self.tank_fuel_sounding)

        self.assertIn("TestCat", result)
        self.assertIn(f"ID {self.tank_fuel_sounding.id}", result)

    def test_tankrecord_str_handles_nulls(self):
        result = str(self.tank_record)

        self.assertIn("MN", result)


class TankSerializerTests(BaseTankTestCase):
    def test_tanktypedetail_serializer_includes_names(self):
        serializer = TankTypeDetailSerializer(self.tank_type_detail)

        self.assertEqual(serializer.data["tank_name"], "MN")
        self.assertEqual(serializer.data["unit_name"], "m3")
