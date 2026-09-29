"""`MastersPageRoleTests` - who may reach the References > Masters screen.

Split out of the former flat `obs/tests.py` (Part 1 of the obs file-structure split).
"""

from accounts import rbac
from rest_framework import status
from rest_framework.test import APITestCase

from ._shared import MastersImportFixtureMixin


class MastersPageRoleTests(MastersImportFixtureMixin, APITestCase):
    """Who may reach the Masters screen at all.

    The gate is applied PER ACTION in `SparesViewSet.get_permissions`, not class-wide, because
    the same viewset serves Search and Add Spare - which every role on the ship uses. The last
    case here is the one that proves that separation actually holds.
    """

    AUTHORITIES_URL = "/api/v1/onboard-spares/spares/import-authorities/"
    TEMPLATE_ROUTES_URL = "/api/v1/onboard-spares/spares/template-routes/"

    def test_the_four_entitled_roles_reach_the_masters_endpoints(self):
        for suffix, role_name in enumerate(
            (
                rbac.ROLE_HOD,
                rbac.ROLE_DY_HOD,
                rbac.ROLE_ADMIN,
                rbac.ROLE_ADMIN_LEGACY,
            ),
            start=1,
        ):
            with self.subTest(role=role_name):
                department = self._department("ENGINEERING")
                user = self._make_user(department, role_name, suffix=f"r{suffix}")
                self.client.force_authenticate(user)
                response = self.client.get(
                    self.AUTHORITIES_URL, {"department": department.pk}
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_a_storekeeper_is_refused_every_masters_endpoint(self):
        department = self._department("ENGINEERING")
        self.client.force_authenticate(self._make_user(department, suffix="98"))

        for url in (self.AUTHORITIES_URL, self.TEMPLATE_ROUTES_URL):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url, {"department": department.pk}).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_a_storekeeper_may_still_search_the_ship_inventory(self):
        """The gate is per action. If this ever fails, the Masters restriction has been applied
        class-wide and has taken the day job of every rating on the ship with it."""
        department = self._department("ENGINEERING")
        self.client.force_authenticate(self._make_user(department, suffix="97"))

        response = self.client.get("/api/v1/onboard-spares/spares/search/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
