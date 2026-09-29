import re

from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view


def tagged_viewset(tag, create_examples=None):
    return extend_schema_view(
        list=extend_schema(tags=[tag]),
        create=extend_schema(tags=[tag], examples=create_examples or []),
        retrieve=extend_schema(tags=[tag]),
        update=extend_schema(tags=[tag]),
        partial_update=extend_schema(tags=[tag]),
        destroy=extend_schema(tags=[tag]),
    )


def generate_ilms_reference(model, number_field, tag, department=None, ship=None, lock=True):
    """Business-meaningful reference-number generator, one shared implementation of what
    source duplicated near-identically across `pts_send_hod_approval`/
    `demand_send_hod_approval`/`survey_send_hod_approval`/`iif_send_hod_approval`
    (`ILMS/views.py:1994-2410`).

    Builds the exact source format `{2-digit year}{ship customer code}{department
    code}{TAG}{00001}` (e.g. `26SHIP01ENGPTS00001`) and returns the next zero-padded
    reference for that prefix+tag, following `wlms.utils.generate_sequence_number`'s
    locking discipline: `select_for_update()` over every existing row sharing the prefix,
    so two concurrent callers racing for the same tag never compute the same next number
    (the caller must run this inside a `transaction.atomic()` block for the lock to have
    any effect — matching `generate_sequence_number`'s own contract).

    `ship` defaults to `master.utils.get_this_ship()` (the one ship this SWMM install
    operates on) and `department` should be the acting user's `master.Department` — pass
    `None` for either and its code segment is simply left empty, so the function still
    produces a stable (if less specific) reference rather than raising.

    Pass `lock=False` for a display-only preview, exactly as `generate_sequence_number`
    does; a caller that will persist the returned value must use the default `lock=True`
    inside an atomic block.
    """
    if ship is None:
        from master.utils import get_this_ship

        ship = get_this_ship()

    customer_code = (getattr(ship, "customer_code", "") or "").strip()
    department_code = (getattr(department, "code", "") or "").strip()
    year_code = str(timezone.now().year)[-2:]
    prefix = f"{year_code}{customer_code}{department_code}"
    tagged_prefix = f"{prefix}{tag}"
    pattern = re.compile(rf"^{re.escape(tagged_prefix)}(\d+)$")

    queryset = model.objects.filter(
        **{f"{number_field}__startswith": tagged_prefix}
    )
    if lock:
        queryset = queryset.select_for_update()
    existing = queryset.values_list(number_field, flat=True)

    max_seq = 0
    for value in existing:
        match = pattern.match(value or "")
        if match:
            max_seq = max(max_seq, int(match.group(1)))

    return f"{tagged_prefix}{max_seq + 1:05d}"
