"""The onboard-spares viewsets and views, split into cohesive submodules.

`obs/views.py` was a single 6,817-line flat file - 26 classes, with `SparesViewSet` alone
spanning roughly 4,500 lines and doing seven unrelated jobs. This package originally split
it along its own natural seams (`base`, `catalog`, `spares_import`, `spares_core`,
`workflow`, `planning`, `misc_master_data`) with no behaviour change; the obs
package-consolidation pass later folded `misc_master_data` into `catalog` (both are simple
master/reference-data CRUD) and `planning` into `workflow` (its viewsets are
supporting/transactional viewsets in the same spirit as workflow's Issue/Return/Survey/
Demand/Receive set), leaving `base`, `catalog`, `spares_import`, `spares_core` and
`workflow` here.

Every name `obs/urls.py` imports from `.views`, and every other module that imports from
`obs.views` directly (e.g. `obs/management/commands/seed_obs_demo_patterns.py`'s
`IMPORT_TEMPLATE_DIR`), is re-exported here so neither needs a single import-line change.
"""

from .base import (  # noqa: F401
    CanPurgeSpares,
    CanUseMastersPage,
    CleanValidationMixin,
    CleanValidationModelViewSet,
    SUB_DEPARTMENT_UNASSIGNED,
    SubDepartmentScope,
    _D787J_IMPORT_DENIED_MESSAGE,
    _SubDepartmentScopedFilterBackend,
    _SubDepartmentScopedObjectPermission,
    _can_import_d787j,
    _requested_scope_value,
    _resolve_selected_sub_department,
    _scope_queryset_to_sub_department,
    can_add_equipment_class,
    payload_pk,
    request_user_department_id,
    user_display_name,
)
from .catalog import (  # noqa: F401
    MISC_MASTER_DATA_HOD_ONLY_MESSAGE,
    MISC_MASTER_DATA_HOD_ONLY_TYPES,
    MISC_MASTER_DATA_MODELS,
    SPARE_CLASS_CLOSED_LIST_MESSAGE,
    AuthorityViewSet,
    DenominationViewSet,
    EditMiscellaneousMasterDataView,
    EquipmentClassViewSet,
    MiscellaneousMasterDataView,
    SpareClassViewSet,
    _misc_master_data_department_id,
)
from .spares_import import (  # noqa: F401
    DISPLAY_ONLY_IMPORT_TARGETS,
    IMPORT_TEMPLATE_DEPARTMENT_CODES,
    IMPORT_TEMPLATE_DIR,
    IMPORT_TEMPLATE_ROUTES,
    IMPORT_TEMPLATE_ROUTES_BY_PREFIX,
    IMPORT_TEMPLATE_SUB_DEPARTMENT_CODES,
    PURGE_CONFIRMATION_PHRASE,
    XLSX_CONTENT_TYPE,
    SparesImportMixin,
)
from .spares_core import (  # noqa: F401
    EXECUTIVE_DEPARTMENT,
    SparesViewSet,
    _department_option,
    _is_executive_department,
    _sub_department_summary,
    _visible_sub_departments_for,
    build_histories,
)
from .workflow import (  # noqa: F401
    RAISE_DART_RETIRED_MESSAGE,
    DemandViewSet,
    IssueListViewSet,
    IssueViewSet,
    NotInCattedItemViewSet,
    PlannedRoutineSpareListViewSet,
    PostDemandViewSet,
    PostReceiveViewSet,
    PostSurveyViewSet,
    ReceiveViewSet,
    ReturnViewSet,
    RoutineSpareUsageViewSet,
    SparesMappingViewSet,
    SurveyViewSet,
    _raise_dart_for_rows,
    _reject_rows_awaiting_incatting,
)
