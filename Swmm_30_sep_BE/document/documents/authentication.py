import hashlib
import hmac
import time

from django.conf import settings
from rest_framework import authentication, exceptions

from documents.models import ServiceClient


class ServiceClientPrincipal:
    """Stand-in for request.user: this service trusts the calling backend,
    not an individual end user, so there is no local user model to attach.
    """

    is_authenticated = True

    def __init__(self, service_client: ServiceClient):
        self.service_client = service_client
        self.name = service_client.name
        self.source_system = service_client.source_system

    def __str__(self):
        return self.name


class ServiceKeyAuthentication(authentication.BaseAuthentication):
    """Service-to-service trust auth.

    Each calling backend (SWMM's monolith, an ITTTM service) authenticates
    its own end users itself, then signs its request to this service with
    a per-client shared secret:

        X-Service-Key: <client_key>
        X-Timestamp:   <unix epoch seconds>
        X-Signature:   hex(HMAC-SHA256(secret, "<method>.<path>.<client_key>.<timestamp>"))

    This sidesteps reconciling SWMM's HS256 JWTs against ITTTM's RS256 JWTs
    entirely - the document service never verifies end-user tokens.
    """

    def authenticate(self, request):
        client_key = request.headers.get("X-Service-Key")
        timestamp = request.headers.get("X-Timestamp")
        signature = request.headers.get("X-Signature")

        if not client_key or not timestamp or not signature:
            return None

        try:
            client = ServiceClient.objects.get(client_key=client_key, is_active=True)
        except ServiceClient.DoesNotExist as exc:
            raise exceptions.AuthenticationFailed("Unknown service client.") from exc

        self._check_timestamp(timestamp)
        self._check_signature(request, client, timestamp, signature)

        return ServiceClientPrincipal(client), None

    def authenticate_header(self, request):
        # Tells DRF to respond 401 (not 403) on auth failure - without this
        # AuthenticationFailed/NotAuthenticated fall back to 403.
        return "Service"

    def _check_timestamp(self, timestamp: str) -> None:
        try:
            request_time = int(timestamp)
        except ValueError as exc:
            raise exceptions.AuthenticationFailed("Invalid X-Timestamp header.") from exc

        skew = abs(int(time.time()) - request_time)
        if skew > settings.SERVICE_AUTH_MAX_SKEW_SECONDS:
            raise exceptions.AuthenticationFailed("Request timestamp outside allowed window.")

    def _check_signature(
        self, request, client: ServiceClient, timestamp: str, signature: str
    ) -> None:
        # Signs method + path + client_key + timestamp only, not the request
        # body: upload requests carry large multipart file payloads, and
        # requiring the caller to buffer + hash the whole body before it can
        # even start streaming the upload would defeat the point of
        # streaming. The timestamp window plus a private network between
        # this service and its two callers is the accepted tradeoff.
        message = ".".join(
            [request.method, request.path, client.client_key, timestamp]
        ).encode()

        expected = hmac.new(
            client.secret.encode(), message, hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected, signature):
            raise exceptions.AuthenticationFailed("Invalid request signature.")
