from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import TicketCommentViewSet, TicketFileViewSet, TicketViewSet

app_name = "ticketmanagement"

router = DefaultRouter()
router.register("tickets", TicketViewSet)
router.register("comments", TicketCommentViewSet)
router.register("files", TicketFileViewSet)

urlpatterns = [
    path("", TicketViewSet.as_view({"get": "dashboard"}), name="ticket_management"),
    path(
        "form_ticket/",
        TicketViewSet.as_view({"get": "form_info", "post": "create"}),
        name="form_ticket",
    ),
    path(
        "form_ticket/<int:pk>/",
        TicketViewSet.as_view({"get": "retrieve", "post": "add_comment"}),
        name="form_ticket_detail",
    ),
    path(
        "my_tickets/", TicketViewSet.as_view({"get": "my_tickets"}), name="my_tickets"
    ),
    path(
        "close_ticket/<int:pk>/",
        TicketViewSet.as_view({"post": "close"}),
        name="close_ticket",
    ),
] + router.urls
urlpatterns += router.urls
