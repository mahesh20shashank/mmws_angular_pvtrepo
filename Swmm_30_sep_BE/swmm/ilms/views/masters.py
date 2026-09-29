"""Thin, largely-independent ILMS master-data CRUD viewsets — plain `ILMSModelViewSet`
subclasses with no `@action`s and little to no custom logic, as opposed to the
business-logic-bearing catalog viewsets in `catalog.py`.
"""

from .. import models, serializers
from ..utils import tagged_viewset
from .base import ILMSModelViewSet


@tagged_viewset("ILMS")
class CustomerViewSet(ILMSModelViewSet):
    queryset = models.Customer.objects.all()
    serializer_class = serializers.CustomerSerializer


@tagged_viewset("ILMS")
class ItemLineViewSet(ILMSModelViewSet):
    queryset = models.ItemLine.objects.select_related("item_code")
    serializer_class = serializers.ItemLineSerializer


@tagged_viewset("ILMS")
class CustomerEquipmentViewSet(ILMSModelViewSet):
    queryset = models.CustomerEquipment.objects.select_related(
        "customer",
        "equipment",
    )
    serializer_class = serializers.CustomerEquipmentSerializer


@tagged_viewset("ILMS")
class CustomerEquipmentLineViewSet(ILMSModelViewSet):
    queryset = models.CustomerEquipmentLine.objects.select_related(
        "customer",
        "equipment",
    )
    serializer_class = serializers.CustomerEquipmentLineSerializer


@tagged_viewset("ILMS")
class PriceViewSet(ILMSModelViewSet):
    queryset = models.Price.objects.select_related("item", "vendor")
    serializer_class = serializers.PriceSerializer


@tagged_viewset("ILMS")
class ItemIssuedViewSet(ILMSModelViewSet):
    queryset = models.ItemIssued.objects.select_related("customer", "item")
    serializer_class = serializers.ItemIssuedSerializer


@tagged_viewset("ILMS")
class IssuedDetailsViewSet(ILMSModelViewSet):
    queryset = models.IssuedDetails.objects.select_related("item")
    serializer_class = serializers.IssuedDetailsSerializer


@tagged_viewset("ILMS")
class ItemVendorViewSet(ILMSModelViewSet):
    queryset = models.ItemVendor.objects.select_related("item", "vendor")
    serializer_class = serializers.ItemVendorSerializer


@tagged_viewset("ILMS")
class ItemExtraViewSet(ILMSModelViewSet):
    queryset = models.ItemExtra.objects.select_related("item_deno")
    serializer_class = serializers.ItemExtraSerializer


@tagged_viewset("ILMS")
class VendorListViewSet(ILMSModelViewSet):
    queryset = models.VendorList.objects.all()
    serializer_class = serializers.VendorListSerializer


@tagged_viewset("ILMS")
class VendorPilViewSet(ILMSModelViewSet):
    queryset = models.VendorPil.objects.all()
    serializer_class = serializers.VendorPilSerializer
