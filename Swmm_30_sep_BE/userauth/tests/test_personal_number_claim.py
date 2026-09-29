# Developed with Understanding: CP-E tests for the personal_number token claim
# (decision D1). They cover the first V2 login token, the refresh and access
# endpoints, the personal_number over username preference, upper-casing, and the
# unchanged V2 login response keys. Paths are the ones mounted in accounts/urls.py.
from unittest import mock

from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from accounts.serializers import build_user_claims
from authz import rbac

from .factories import grant_role, make_user

LOGIN_URL = "/api/v1/auth/token/"
REFRESH_URL = "/api/v1/auth/token/refresh/"
ACCESS_URL = "/api/v1/auth/token/access/"
PASSWORD = "pw-secret-01"

# Developed with Understanding: the V2 login response keys as they stood before
# CP-E (MyTokenObtainSerializer.validate) - the change must not alter this set.
V2_LOGIN_KEYS = {
    "refresh",
    "access",
    "session_id",
    "user_id",
    "login_name",
    "user_email",
    "first_name",
    "last_name",
    "rank_code",
    "rank_name",
    "designation",
    "unit_name",
    "unit_id",
}


# Developed with Understanding: LDAP off so the local password hash is used, and
# the HRCDF lookup patched per test so no outbound call is made.
@override_settings(LDAP_AUTH=False)
class PersonalNumberClaimTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_rbac", verbosity=0)

    # Developed with Understanding: log in through the V2 view with a stubbed
    # HRCDF record and return the response.
    def _login(self, username, hrcdf_record=None):
        with mock.patch(
            "accounts.serializers._fetch_hrcdf_details", return_value=hrcdf_record
        ):
            return self.client.post(
                LOGIN_URL, {"username": username, "password": PASSWORD}, format="json"
            )

    def test_first_login_token_carries_personal_number(self):
        user = make_user("pnlogin1", personal_number="ab123c")
        grant_role(user, rbac.ROLE_USER)
        resp = self._login("pnlogin1")
        self.assertEqual(resp.status_code, 200, resp.content)
        access = AccessToken(resp.json()["access"])
        self.assertEqual(access["personal_number"], "AB123C")

    def test_first_login_token_has_the_same_claim_keys_as_build_user_claims(self):
        user = make_user("pnlogin2", personal_number="CD456E")
        grant_role(user, rbac.ROLE_USER)
        resp = self._login("pnlogin2")
        self.assertEqual(resp.status_code, 200, resp.content)
        access = AccessToken(resp.json()["access"])
        expected = build_user_claims(
            user, role_id=None, process_id=None, session_id=None
        )
        for key in expected:
            self.assertIn(key, access.payload, key)
        self.assertEqual(access["session_id"], resp.json()["session_id"])

    def test_first_login_token_uses_hrcdf_enriched_personal_number(self):
        user = make_user("pnlogin3", personal_number="")
        grant_role(user, rbac.ROLE_USER)
        resp = self._login("pnlogin3", hrcdf_record={"personnelNumber": " zz999x "})
        self.assertEqual(resp.status_code, 200, resp.content)
        access = AccessToken(resp.json()["access"])
        self.assertEqual(access["personal_number"], "ZZ999X")

    def test_claim_prefers_personal_number_over_username(self):
        user = make_user("pnuser4", personal_number="  gh789k  ")
        grant_role(user, rbac.ROLE_USER)
        claims = build_user_claims(user, role_id=None, process_id=None, session_id=None)
        self.assertEqual(claims["personal_number"], "GH789K")

    def test_claim_falls_back_to_upper_cased_username(self):
        user = make_user("pnuser5", personal_number="")
        grant_role(user, rbac.ROLE_USER)
        resp = self._login("pnuser5")
        self.assertEqual(resp.status_code, 200, resp.content)
        access = AccessToken(resp.json()["access"])
        self.assertEqual(access["personal_number"], "PNUSER5")

    def test_refresh_and_access_tokens_carry_personal_number(self):
        user = make_user("pnrefresh6", personal_number="mn321p")
        grant_role(user, rbac.ROLE_USER)
        login = self._login("pnrefresh6")
        self.assertEqual(login.status_code, 200, login.content)

        refreshed = self.client.post(
            REFRESH_URL, {"refresh": login.json()["refresh"]}, format="json"
        )
        self.assertEqual(refreshed.status_code, 200, refreshed.content)
        self.assertEqual(set(refreshed.json()), {"access", "refresh"})
        self.assertEqual(
            AccessToken(refreshed.json()["access"])["personal_number"], "MN321P"
        )

        warmed = self.client.post(
            ACCESS_URL, {"refresh": refreshed.json()["refresh"]}, format="json"
        )
        self.assertEqual(warmed.status_code, 200, warmed.content)
        self.assertEqual(set(warmed.json()), {"access"})
        self.assertEqual(
            AccessToken(warmed.json()["access"])["personal_number"], "MN321P"
        )

    def test_login_response_keys_are_unchanged(self):
        user = make_user("pnkeys7", personal_number="QR654S")
        grant_role(user, rbac.ROLE_USER)
        resp = self._login("pnkeys7")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(set(resp.json()), V2_LOGIN_KEYS)
