from .filters import DartsReportFilter
from .models import InitiateDart
from .serializers import DartsReportSerializer


def darts_report_queryset():
    return InitiateDart.objects.all().order_by("-dart_date", "-pk")


class ReportDefinition:
    def __init__(
        self, queryset_fn, serializer_class, filterset_class, title, context_fn=None
    ):
        self.queryset_fn = queryset_fn
        self.serializer_class = serializer_class
        self.filterset_class = filterset_class
        self.title = title
        self.context_fn = context_fn

    def get_queryset(self):
        return self.queryset_fn()

    def get_context(self):
        return self.context_fn() if self.context_fn else {}


REPORT_REGISTRY = {
    "darts-report": ReportDefinition(
        queryset_fn=darts_report_queryset,
        serializer_class=DartsReportSerializer,
        filterset_class=DartsReportFilter,
        title="DARTs Report",
    ),
}
