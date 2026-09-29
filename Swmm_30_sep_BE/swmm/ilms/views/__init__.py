"""The ILMS (Inventory Logistics Management System) viewsets and views, split into
cohesive submodules.

`ilms/views.py` was a single 2,127-line flat file. This package splits it along its own
natural seams, mirroring the `wlms/views/` and `obs/views/` package splits (see
`wlms/views/__init__.py` for the fuller account of why this pattern was adopted):
`base` (shared `ILMSModelViewSet`/`ApprovalWorkflowMixin` infrastructure and
scoping/annotation helpers), `catalog` (the master-data viewsets with real business
logic — `Item`/`Vendor`/`MoMappingTable`/`MOItemEquipment`), `masters` (the thin,
largely-independent CRUD viewsets), `planning` (MO planning/DART-cart viewsets),
`workflow` (the Survey/PTS/Demand HOD-approval workflow plus the Receive stage),
`iif` (the Item Issue Form cart), `wed_inventory` (the read-only obs-backed WED
inventory views), and `sync` (the standalone `@api_view` functions that aren't
ViewSets). ILMS has no `SignalDemand` model/workflow, so unlike `wlms` there is no
`signal_demand.py` here. No behaviour change.

Every name `ilms/urls.py` imports from `.views` is re-exported here so it needs no
import-line changes.
"""

from .base import (  # noqa: F401
    ApprovalWorkflowMixin,
    ILMSModelViewSet,
    _annotate_pending_ilms_entry,
    _request_user_profile,
    _routine_description_summary,
    _scoped_equipment_class_ids,
    _scoped_item_ids,
)
from .catalog import (  # noqa: F401
    ItemViewSet,
    MOItemEquipmentViewSet,
    MoMappingTableViewSet,
    VendorViewSet,
)
from .iif import IIFViewSet  # noqa: F401
from .masters import (  # noqa: F401
    CustomerEquipmentLineViewSet,
    CustomerEquipmentViewSet,
    CustomerViewSet,
    ItemExtraViewSet,
    ItemIssuedViewSet,
    ItemLineViewSet,
    ItemVendorViewSet,
    IssuedDetailsViewSet,
    PriceViewSet,
    VendorListViewSet,
    VendorPilViewSet,
)
from .planning import (  # noqa: F401
    DartMOSpareViewSet,
    MOPlannedSparesDescriptionViewSet,
    PlannedMOSpareListViewSet,
)
from .sync import (  # noqa: F401
    _extract_sync_ids,
    _normalize_ids,
    _request_user_department_id,
    _sync_workflow_rows,
    approve_pts,
    demand_data_send_ilms,
    ilms_combined_inbox,
    ilms_combined_outbox,
    ilms_history,
    pts_data_send_ilms,
)
from .wed_inventory import WedInventoryViewSet  # noqa: F401
from .workflow import (  # noqa: F401
    DemandDetailsViewSet,
    PTSDetailsViewSet,
    ReceiveDetailsObjectPermission,
    ReceiveDetailsViewSet,
    SurveyDetailsViewSet,
)
