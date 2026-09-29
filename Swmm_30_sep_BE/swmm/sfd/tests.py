from django.test import SimpleTestCase
from django.urls import resolve


class SFDCompatibilityRouteTests(SimpleTestCase):
    def test_version_one_sfd_routes_resolve(self):
        routes = {
            "/api/v1/sfd/configuration-options/": "sfd:sfd-configuration-options",
            "/api/v1/sfd/add-sfd-equipement/dropdowns": (
                "sfd:add-sfd-equipement-dropdowns"
            ),
            "/api/v1/sfd/reports/filter-options/": "sfd:report-filter-options",
            "/api/v1/sfd/reports/sfd-transactions/": "sfd:sfd-transaction-report",
            "/api/v1/sfd/reports/sfd-installations/": (
                "sfd:equipment-installation-report"
            ),
            "/api/v1/sfd/reports/sfd-locations/": "sfd:equipment-location-report",
            "/api/v1/sfd/reports/removed-equipment/": "sfd:removed-equipment-report",
            "/api/v1/sfd/reports/approval-status/": "sfd:approval-status-report",
            "/api/v1/sfd/reports/ship-equipment-configuration/": (
                "sfd:ship-equipment-configuration-report"
            ),
            "/api/v1/sfd/approval-tracking/": "sfd:approval-tracking",
            "/api/v1/sfd/equipment-system/dropdowns/": (
                "sfd:equipment-system-dropdowns"
            ),
            "/api/v1/sfd/equipment-system/map/": "sfd:equipment-system-map",
            "/api/v1/sfd/equipment-system-mappings/": (
                "sfd:equipment-system-mapping-list"
            ),
        }

        for path, view_name in routes.items():
            with self.subTest(path=path):
                self.assertEqual(resolve(path).view_name, view_name)

    def test_sfd_master_lookup_routes_resolve_before_generic_master_routes(self):
        routes = {
            "/api/v1/master/supplier/": "sfd-master:supplier-list",
            "/api/v1/master/manufacturer/": "sfd-master:manufacturer-list",
            "/api/v1/master/equipment/": "sfd-master:equipment-list",
            "/api/v1/master/systems/": "sfd-master:system-list",
        }

        for path, view_name in routes.items():
            with self.subTest(path=path):
                self.assertEqual(resolve(path).view_name, view_name)

    def test_existing_sfd_cmms_routes_still_resolve(self):
        routes = {
            "/api/v1/cmms/aber": "cmms-aber-equipment",
            "/api/v1/cmms/aber/submit": "cmms-aber-submit",
            "/api/v1/cmms/aber/history": "cmms-aber-history",
            "/api/v1/cmms/sfd": "cmms-sfd-equipment",
            "/api/v1/cmms/sfd/ships": "cmms-sfd-ships",
            "/api/v1/cmms/sfd/payload": "cmms-sfd-payload",
        }

        for path, view_name in routes.items():
            with self.subTest(path=path):
                self.assertEqual(resolve(path).view_name, view_name)
