from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponseRedirect, JsonResponse
from django.urls import include, path, re_path, reverse
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from ems import views as ems_views
from ems.urls import integration_urlpatterns as ems_integration_urls
from master.urls import integration_urlpatterns as master_integration_urls
from sfd.urls import integration_urlpatterns as sfd_integration_urls
from sfd.urls import master_urlpatterns as sfd_master_urlpatterns
from srar.urls import integration_urlpatterns as srar_integration_urls
from swmmapi.views import SaveCMMSDefectsAPI

from swmm.task_views import BackgroundTaskStatusView


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
    path("api/v1/dart/", include("op_maintenance.urls")),
    path("api/v1/defect/", include("op_maintenance.defect.urls")),
    path("api/v1/dl-monitoring/", include("dl_monitor.urls")),
    path("api/v1/master/", include((sfd_master_urlpatterns, "sfd-master"))),
    path("api/v1/master/", include("master.urls")),
    path("api/v1/onboard-spares/", include("obs.urls")),
    path("api/v1/wlms/", include("wlms.urls")),
    path("api/v1/inout-tags/", include("inout_tag.urls")),
    path("api/v1/documents/", include("dms.urls")),
    path("api/v1/ilms/", include("ilms.urls")),
    path("api/v1/sfd/", include("sfd.urls")),
    path("api/v1/srar/", include("srar.urls")),
    path("api/v1/tank/", include("tank.urls")),
    path("api/v1/ems/", include("ems.urls")),
    path("api/v1/refit/", include("refit.urls")),
    path("api/v1/ticket-management/", include("ticket_manage.urls")),
    path("api/v1/work-management/", include("work_manage.urls")),
    path("api/v1/hotwork/", include("hotwork.urls")),
    path("api/v1/events/", include("activity_planner.urls")),
    path(
        "api/v1/equipment-status/",
        ems_views.EquipmentStatusView.as_view(),
        name="equipment-status",
    ),
    path("api/v1/crew-management/", include("crew_manage.urls")),
    path("api/v1/swmmapi/", include("swmmapi.urls")),
    path("api/v1/cmms/dart", SaveCMMSDefectsAPI.as_view(), name="root-cmms-dart"),
    path(
        "api/v1/tasks/<str:task_id>/",
        BackgroundTaskStatusView.as_view(),
        name="background-task-status",
    ),
    path("api/v1/refit/", include("refit.urls")),
    path("api/v1/accounts/", include("accounts.urls")),
    path("api/v1/", include(ems_integration_urls)),
    path("api/v1/", include(sfd_integration_urls)),
    path("api/v1/", include(srar_integration_urls)),
    path("api/v1/", include(master_integration_urls)),
    *static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT),
]

if settings.ENABLE_SWAGGER:
    urlpatterns += [
        path("schema/", SpectacularAPIView.as_view(), name="schema"),
        path(
            "swagger/",
            SpectacularSwaggerView.as_view(url_name="schema"),
            name="swagger-ui",
        ),
    ]

urlpatterns += [
    re_path(r"^(?P<path>.*)$", handle_unmatched_endpoint),
]
