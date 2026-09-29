from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "ilms"

# Same treatment `obs`/`wlms` already got: replace manual `path()` +
# `ViewSet.as_view({...})` bindings with a `DefaultRouter`. Every custom action below
# (pending-list, send-for-approval, add-to-cart, etc.) is already `@action`-decorated on
# its viewset, so the router discovers them automatically — no manual bindings were needed
# for any of them (unlike wlms's `context_from_query`, ilms has no plain, non-`@action`
# viewset method). Prefixes were derived from a full grep of every literal
# `/api/v1/ilms/...` URL `ilms/tests.py` hits: items, vendors, mo-mappings,
# planned-descriptions, planned-spares, surveys, pts, demands, iif, dart-mo-spares.
router = DefaultRouter()
router.register("items", views.ItemViewSet)
router.register("vendors", views.VendorViewSet)
router.register("mo-mappings", views.MoMappingTableViewSet)
router.register("planned-descriptions", views.MOPlannedSparesDescriptionViewSet)
router.register("planned-spares", views.PlannedMOSpareListViewSet)
router.register("surveys", views.SurveyDetailsViewSet)
router.register("pts", views.PTSDetailsViewSet)
router.register("demands", views.DemandDetailsViewSet)
router.register("receive-details", views.ReceiveDetailsViewSet)
router.register("iif", views.IIFViewSet)
router.register("dart-mo-spares", views.DartMOSpareViewSet)
router.register("mo-item-equipment", views.MOItemEquipmentViewSet)
router.register("customers", views.CustomerViewSet)
router.register("item-lines", views.ItemLineViewSet)
router.register("customer-equipment", views.CustomerEquipmentViewSet)
router.register("customer-equipment-line", views.CustomerEquipmentLineViewSet)
router.register("prices", views.PriceViewSet)
router.register("items-issued", views.ItemIssuedViewSet)
router.register("issued-details", views.IssuedDetailsViewSet)
router.register("item-vendors", views.ItemVendorViewSet)
router.register("item-extras", views.ItemExtraViewSet)
router.register("vendor-lists", views.VendorListViewSet)
router.register("vendor-pils", views.VendorPilViewSet)
# `WedInventoryViewSet` is a plain `viewsets.ViewSet` with no `queryset` attribute (it's a
# read-only wrapper over several `obs` models depending on the action), so the router can't
# infer a basename from a queryset the way it does for every `ModelViewSet` above.
router.register("wed-inventory", views.WedInventoryViewSet, basename="wed-inventory")

urlpatterns = [
    # Standalone `@api_view` functions — not ViewSets, so they stay as manual bindings
    # alongside the router (matching `obs`/`wlms`'s pattern for their own non-ViewSet
    # endpoints).
    path(
        "demand-data-send-ilms/",
        views.demand_data_send_ilms,
        name="demand_data_send_ilms",
    ),
    path("pts-data-send-ilms/", views.pts_data_send_ilms, name="pts_data_send_ilms"),
    path("approve-pts/", views.approve_pts, name="approve_pts"),
    path("ilms-history/", views.ilms_history, name="ilms_history"),
    path("ilms-inbox/", views.ilms_combined_inbox, name="ilms_combined_inbox"),
    path("ilms-outbox/", views.ilms_combined_outbox, name="ilms_combined_outbox"),
] + router.urls
