"""URL routing for the In/Out Tag API.

Mounted at ``/api/v1/inout-tags/`` (see ``swmm/urls.py``). Full route list:

    GET    dashboard/                         DashboardView          (legacy inouthome)
    GET    history/                           HistoryAPIView         (legacy history)

    GET    tagouts/                           TagOutViewSet.list     (legacy tagoutlist)
    POST   tagouts/                           TagOutViewSet.create   (legacy addtagout)
    GET    tagouts/{id}/                      TagOutViewSet.retrieve (legacy get_tagout_details)
    GET    tagouts/form_meta/                 add-tag-out dropdowns
    GET    tagouts/ship_equipments/           equipment option list
    GET    tagouts/approval_list/             pending tag-outs        (legacy approvetagot)
    POST   tagouts/{id}/approve/              approve / reject        (legacy approvetagot)
    GET    tagouts/{id}/print_slip/           PDF tag slip            (legacy print_tagout_slip)
    GET    tagouts/export-excel/              }
    GET    tagouts/download-template/         }  ExcelImportExportMixin
    POST   tagouts/import-excel/              }

    GET    tagins/                            TagInViewSet.list      (legacy tag_in)
    POST   tagins/                            TagInViewSet.create    (legacy add_tagin)
    GET    tagins/{id}/                       TagInViewSet.retrieve  (legacy get_tagin_details)
    GET    tagins/form_meta/                  eligible tag-outs      (legacy add_tagin GET)
    GET    tagins/ship_equipments/            equipment option list
    GET    tagins/approval_list/              pending tag-ins        (legacy approvetagin)
    POST   tagins/{id}/approve/               per-department sign-off (legacy approvetagin)
    GET    tagins/export-excel/               }
    GET    tagins/download-template/          }  ExcelImportExportMixin
    POST   tagins/import-excel/               }
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "inouttag"

router = DefaultRouter()
router.register("tagouts", views.TagOutViewSet, basename="tagout")
router.register("tagins", views.TagInViewSet, basename="tagin")

urlpatterns = [
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("history/", views.HistoryAPIView.as_view(), name="history"),
    path("", include(router.urls)),
]
