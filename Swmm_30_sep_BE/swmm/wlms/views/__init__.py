"""The WLMS (Weapon Engineering Department stores) viewsets and views, split into
cohesive submodules.

`wlms/views.py` was a single 2,607-line flat file. This package splits it along its own
natural seams, mirroring the earlier `obs/views/` package split (`obs/views/__init__.py`
has the fuller account of why obs did this): `base` (shared mixin/viewset infrastructure
and module-level QR/numbering/annotation/scoping helpers), `equipment` (catalogue
viewsets), `survey`, `pts_demand`, `iif` (including the `raise_iif` action and its
`RaiseIIFSerializer` wiring), `signal_demand`, and `sync` (the standalone `@api_view`
functions that aren't ViewSets). No behaviour change.

Every name `wlms/urls.py` imports from `.views` is re-exported here so it needs no
import-line changes.
"""

from .base import (  # noqa: F401
    ApprovalWorkflowMixin,
    WLMSModelViewSet,
    _annotate_pending_wlms_entry,
    _base_cert_offset,
    _department_scoped,
    _expand_by_qty,
    _generate_qr_b64,
    _next_ref_seq,
    _routine_description_summary,
    _scoped_equipment_class_ids,
    _zero_padded,
)
from .equipment import (  # noqa: F401
    DartWedSpareViewSet,
    PlannedSparesDescriptionViewSet,
    PlannedWEDSpareListViewSet,
    SpareDataMapViewSet,
    WLMSEquipmentViewSet,
    WLMSSpareViewSet,
)
from .iif import (  # noqa: F401
    WEDIIFDetailsViewSet,
    WEDIIFViewSet,
)
from .pts_demand import (  # noqa: F401
    DemandDetailsViewSet,
    PTSDemandDetailsViewSet,
    PTSItemsViewSet,
    ReceiveDemandDetailsObjectPermission,
    ReceiveDemandDetailsViewSet,
)
from .signal_demand import SignalDemandViewSet  # noqa: F401
from .survey import (  # noqa: F401
    SurveyFormsDetailsViewSet,
    SurveyFormsItemsViewSet,
    SurveyReceiptsDetailsViewSet,
)
from .sync import (  # noqa: F401
    _annotate_wlms_cart_entry,
    _extract_sync_ids,
    _normalize_ids,
    _sync_wlms_rows,
    hod_approval,
    send_wed_common_api,
    sync_equipment_from_wed,
    sync_spares_from_wed,
    wlms_combined_outbox,
)
