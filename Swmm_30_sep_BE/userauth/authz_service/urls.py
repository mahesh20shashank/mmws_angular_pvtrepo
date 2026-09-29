"""Root URLconf.

The test suite (tests/test_url_permissions.py, build prompt criterion 11)
introspects everything mounted here and fails on any view left at bare
``IsAuthenticated`` outside the documented allowlist.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponseRedirect, JsonResponse
from django.urls import include, path, re_path, reverse
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


@csrf_exempt
def handle_unmatched_endpoint(request, path=None):
    """Return JSON 404s for API requests and optionally redirect browsers to Swagger.

    csrf_exempt because this is the catch-all: without it, CsrfViewMiddleware rejects any
    POST/PUT/DELETE to an unmatched URL before this view runs, so a simple wrong-URL or
    not-yet-reloaded-route mistake surfaced as Django's "CSRF token missing" HTML page
    instead of the "Endpoint not found" 404 that actually explains the problem.
    """
    accept_header = request.headers.get("Accept", "")

    if (
        request.path.startswith(("/api/", "/media/", "/static/"))
        or "application/json" in accept_header
    ):
        return JsonResponse(
            {"detail": "Endpoint not found"},
            status=404,
        )

    if settings.ENABLE_SWAGGER:
        return HttpResponseRedirect(reverse("swagger-ui"))

    return JsonResponse(
        {"detail": "Endpoint not found"},
        status=404,
    )


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/authz/", include("authz.urls")),
    path("api/v1/delegation/", include("delegation.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "swagger/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    *static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT),
]

urlpatterns += [
    re_path(r"^(?P<path>.*)$", handle_unmatched_endpoint),
]
