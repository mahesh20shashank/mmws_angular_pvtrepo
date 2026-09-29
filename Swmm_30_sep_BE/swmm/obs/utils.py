import os
import shutil
import uuid

from django.db import transaction
from drf_spectacular.utils import extend_schema, extend_schema_view
from master.utils import CMMS_DEPT_CODE_BY_NAME

# `master.utils.canonical_department_name`: does not exist in target's `master` app (out of
# scope for this obs-only merge; not added there). Bridged locally here, reproducing source's
# `master/utils.py::canonical_department_name` logic against target's existing
# `master.utils.CMMS_DEPT_CODE_BY_NAME` map, so both `views.py` and `services.py` can share one
# definition. One simplification: source's version also resolves through a
# `DEPARTMENT_NAME_ALIASES` table (short forms like "ENG"/"EE"/"MED") that exists only in
# source's `master/utils.py` and has no target equivalent - reproduced here locally rather than
# added to `master/`, so a deployment using one of those short forms resolves exactly as before
# this merge (unrecognised, returned stripped/uppercased) until `master` itself grows the alias
# table.
_DEPARTMENT_NAME_ALIASES = {
    "E": "ENGINEERING",
    "ENG": "ENGINEERING",
    "ENGG": "ENGINEERING",
    "ME": "ENGINEERING",
    "L": "ELECTRICAL",
    "EE": "ELECTRICAL",
    "ELEC": "ELECTRICAL",
    "H": "HULL",
    "M": "MEDICAL",
    "MED": "MEDICAL",
    "LOG": "LOGISTICS",
    "EXEC": "EXECUTIVE",
}


def canonical_department_name(value):
    """The canonical uppercase department name for a `master.Department` row, or for a bare
    name. See the module bridge note above for why this lives here rather than in
    `master/utils.py`."""
    name = (getattr(value, "name", None) if not isinstance(value, str) else value) or ""
    name = name.strip().upper()
    if name in CMMS_DEPT_CODE_BY_NAME:
        return name
    aliased = _DEPARTMENT_NAME_ALIASES.get(name)
    if aliased:
        return aliased
    if not isinstance(value, str):
        code = (getattr(value, "code", None) or "").strip().upper()
        if code in CMMS_DEPT_CODE_BY_NAME:
            return code
        aliased = _DEPARTMENT_NAME_ALIASES.get(code)
        if aliased:
            return aliased
    return name


def django_validation_error_detail(error):
    if hasattr(error, "message_dict"):
        return error.message_dict
    if hasattr(error, "messages"):
        return error.messages
    return str(error)


def tagged_viewset(tag, create_examples=None):
    return extend_schema_view(
        list=extend_schema(tags=[tag]),
        create=extend_schema(tags=[tag], examples=create_examples or []),
        retrieve=extend_schema(tags=[tag]),
        update=extend_schema(tags=[tag]),
        partial_update=extend_schema(tags=[tag]),
        destroy=extend_schema(tags=[tag]),
    )


# The name a spare image folder falls back to when the department cannot be resolved.
UNASSIGNED_MEDIA_SEGMENT = "UNASSIGNED"

# Where the shipped placeholder lives inside the app package, and where it is copied to under
# MEDIA_ROOT. It cannot simply live in `media/` - that directory is gitignored, so a fresh
# checkout has no default image at all and every spare without a photo renders a broken frame.
DEFAULT_SPARE_IMAGE_NAME = "obs/default.png"
DEFAULT_SPARE_IMAGE_SOURCE = os.path.join(os.path.dirname(__file__), "assets", "default.png")


def _media_path_segment(value):
    """Developed by Unknown: one folder name of a spare image path, made safe to interpolate.

    The three segments below are MASTER DATA NAMES typed by an operator - a department, a spare
    class, an equipment class. They are interpolated straight into a storage path, so a name
    containing a separator or a `..` would place the file outside the folder it belongs in, and
    in the worst case outside MEDIA_ROOT entirely. Django's storage layer refuses some of that,
    but not all of it, and not on every platform - the check belongs here.

    Spaces are KEPT. `AIR CONDITIONING PLANT` is how the D787J document writes it and how the
    folder should read; a space is harmless in a path.
    """
    cleaned = "".join(
        character
        for character in (value or "").strip().upper()
        if character.isprintable() and character not in '/\\:*?"<>|'
    )
    cleaned = cleaned.replace("..", "").strip(" .")
    return cleaned or UNASSIGNED_MEDIA_SEGMENT


def _department_segment(equipment_class):
    """The department folder for one equipment class.

    `EquipmentClass.department` is derived from `spare_class.department` in `clean()` and is
    nullable only so its migration could be applied before the backfill, so it is read first
    and the spare class traversed only if it is still NULL. Both being NULL is possible on
    legacy rows and yields `UNASSIGNED` rather than an exception - an image is never worth
    failing a save over.
    """
    department = getattr(equipment_class, "department", None)
    if department is None:
        spare_class = getattr(equipment_class, "spare_class", None)
        department = getattr(spare_class, "department", None)
    return _media_path_segment(getattr(department, "name", None))


# Developed by Unknown: The department segment is new. The path used to be
# `obs/{spare class}/{equipment class}/{uuid}` and two departments holding a spare class of the
# same name - which the schema permits, `SpareClass.unique_together` is ("name", "department") -
# dropped their photos into one shared folder. The stored path is per-row, so this changes only
# where NEW images are written; rows imported before it keep working from wherever they are.
#
# No migration is needed: `upload_to` is this callable, and a migration records the reference to
# it, not its body.
def spare_image_upload_path(instance, filename):
    _, extension = os.path.splitext(filename)
    if extension.lower() not in {".png", ".jpg", ".jpeg"}:
        return DEFAULT_SPARE_IMAGE_NAME

    equipment_class = instance.equipment_class
    department = _department_segment(equipment_class)
    spare_class = _media_path_segment(equipment_class.spare_class.name)
    equipment_class_name = _media_path_segment(equipment_class.name)
    unique_name = f"{uuid.uuid4().hex}{extension.lower()}"
    return f"obs/{department}/{spare_class}/{equipment_class_name}/{unique_name}"


def ensure_default_spare_image():
    """Developed by Unknown: put `obs/default.png` under MEDIA_ROOT if it is not there already.

    `Spares.image` defaults to that name, and `media/` is gitignored, so on a fresh checkout the
    default pointed at a file that did not exist and every spare without a photo served a 404.
    The placeholder is committed inside the app package and copied out on demand.

    Idempotent, and returns True only when it actually wrote the file, so the management command
    can say which of the two happened.
    """
    from django.conf import settings

    destination = os.path.join(settings.MEDIA_ROOT, *DEFAULT_SPARE_IMAGE_NAME.split("/"))
    if os.path.exists(destination):
        return False
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    shutil.copyfile(DEFAULT_SPARE_IMAGE_SOURCE, destination)
    return True


def default_spare_image_url(request=None):
    """The absolute URL of the placeholder, for hand-built responses that do not go through
    `SparesSerializer` (which builds its own absolute URL from the request).

    Relative was wrong and was the visible bug: the SPA runs on `:4200` in development and the
    API on `:8000`, so a relative `/media/...` resolved against the SPA's own origin and 404ed.
    """
    from django.conf import settings

    url = f"{settings.MEDIA_URL}{DEFAULT_SPARE_IMAGE_NAME}"
    return request.build_absolute_uri(url) if request is not None else url


def _slug_safe(value):
    """Developed by Unknown: `value` reduced to what a `SlugField` will accept.

    Letters, numbers, underscores and hyphens survive - the four characters Django's slug
    validator permits. Everything else is dropped. Used on both halves of a generated pattern
    number, because the whole string lands in `Spares.pattern_number`, which is a `SlugField`.
    """
    return "".join(
        character
        for character in (value or "").strip().upper()
        if character.isalnum() or character in "-_"
    )


def _trim_for_pattern(name):
    """Developed by Unknown: the four-character stem a generated pattern number carries.

    Non-alphanumeric characters are dropped BEFORE the four are taken. They used not to be,
    and that was a real defect rather than a tidiness point: `Spares.pattern_number` is a
    `SlugField`, so `full_clean()` refuses anything outside letters, numbers, underscores and
    hyphens. An equipment class named `AIR CONDITIONING PLANT` - which is the first equipment
    class in the shipped Engineering D787J workbook - trimmed to `AIR `, with a trailing
    space, and every pattern number generated for it was then rejected by its own model with
    "Enter a valid slug". The row failed on a field the operator had left deliberately blank.

    Padding stays `X`, matching the reference application's own generator.
    """
    cleaned = "".join(
        character
        for character in (name or "").strip().upper()
        if character.isalnum()
    )
    return cleaned[:4].ljust(4, "X")


# Developed by Unknown: The stored, per-equipment-class counter. It replaces
# `secrets.randbelow(900000) + 100000`, which produced a random six-digit tail.
#
# Why a lock and an in-database increment rather than `max(...) + 1` over `obs_spares`:
# two imports running at the same moment would both read the same maximum, both mint the
# same number, and neither would be caught by the existence check below, because at that
# point neither row has been saved. `select_for_update` serialises the two readers on the
# equipment class row itself, so the second waits for the first to commit its increment.
#
# `EquipmentClass` inherits `UppercaseCleanMixin`, whose `save()` calls `full_clean()`, so
# the write is issued as a queryset `.update()` - a single UPDATE, no validation pass, and
# no risk of a stale in-memory `name` being written back over a concurrent rename.
def next_pattern_sequence(equipment_class):
    """Reserve and return the next six-digit sequence number for one equipment class.

    The stored `pattern_sequence` holds the LAST value handed out and starts at 100000, so
    the first number a class ever issues is 100001.

    Opens its own `transaction.atomic()` because `select_for_update` outside a transaction
    raises, and Add Spare (`SparesViewSet.create`) does not run inside one. Where a caller
    IS already inside a transaction - the import's classification pass is - this becomes a
    savepoint within it, so a rolled-back preview also rolls the counter back and a preview
    that is never committed burns no numbers.
    """
    from .models import EquipmentClass

    with transaction.atomic():
        locked = (
            EquipmentClass.objects.select_for_update()
            .filter(pk=equipment_class.pk)
            .values_list("pattern_sequence", flat=True)
            .first()
        )
        if locked is None:
            raise ValueError(
                "Could not generate a unique pattern number. Please enter one manually."
            )
        sequence = int(locked) + 1
        EquipmentClass.objects.filter(pk=equipment_class.pk).update(
            pattern_sequence=sequence
        )
    return sequence


def _resolve_adopted_ship_customer_code():
    """STUB (merge decision, blocker #2 — see obs/services.py's identical stub for the full
    rationale): source read this through `accounts.rbac.resolve_ship_customer_code()`, which
    depends on a persisted `ShipIdentity.customer_code` that does not exist in target's
    `accounts` app and is deliberately not being added there in this pass. Duplicated here
    (rather than imported from `obs.services`) to avoid introducing a module-level import cycle
    with `obs/models.py`, which already imports this module. Always reports "nothing adopted",
    which safely falls through to the `"SHIP"` fallback below exactly as it did before any
    ship-customer-code concept existed.
    """
    return None


# Developed by Unknown: Rewritten from a random generator to a sequential one. The FORMAT
# is unchanged - `{ship customer code}-{SPAR}{EQUI}{NNNNNN}` - and only the six digits
# change how they are produced.
#
# Two consequences worth stating, because they are opposites of what was here before:
#   - the number is now PREDICTABLE, which is what makes a counter possible at all, and
#   - two blank rows of the same equipment class in one sheet receive CONSECUTIVE numbers,
#     not one shared number. The reference application deliberately reused a single suffix
#     per equipment class within a run (`db\\excel_to_db.py` lines 97 to 119). That is not
#     carried across - it would mint deliberate duplicates, and `SparesViewSet.create`'s
#     ship-wide `pattern_number__iexact` duplicate block already refuses them.
#
# The retry loop is kept, with the same `max_attempts` and the same `extra_exclude`
# contract, because a sequence value can still collide - with a pattern number typed by
# hand, with one imported before the counter existed, or with one already handed out
# earlier in this same batch. A collision simply burns that number and takes the next.
def generate_pattern_number(
    equipment_class, *, max_attempts=25, extra_exclude=None, ship_customer_code=None
):
    """Auto-generates a pattern number for a spare whose MO Item Code isn't known,
    for Add Spare's "leave blank to auto-generate" behaviour, and for the Masters
    Excel import's same behaviour on a blank `PATTERN NO` cell. Local import of
    `Spares` avoids a circular import (models.py already imports this module for
    `spare_image_upload_path`).

    `extra_exclude` (optional, upper-cased strings) lets a caller processing many rows
    in one batch — e.g. the Excel import, where candidates aren't persisted until the
    whole row is later saved — reject a candidate that's already been handed out
    earlier in the same batch, on top of the usual DB-existence check.

    Developed by Unknown: `ship_customer_code` (optional) is the code to put at the front of
    the number. It exists for ONE case - the PREVIEW of the very first import, where the
    workbook's code has been read but not yet adopted, so the resolver would still answer "".
    Passing it explicitly is what lets that preview show the numbers the commit will actually
    mint. Every other caller omits it and gets the adopted code.

    Developed by Unknown: the ship lookup itself moved from `master.utils.get_this_ship` to
    a resolver reached through `accounts.rbac`, so this function and `obs/services.py` would
    read one value through one resolver instead of two independent ones. In this pass that
    resolver is stubbed (see `_resolve_adopted_ship_customer_code` above), so it always answers
    "nothing adopted" and this always falls through to the `"SHIP"` fallback - which is exactly
    the behaviour this codebase had before ship-customer-code adoption existed at all, and is
    safe here for the same reason: it is only ever reached on Add Spare, never on the import
    path, which refuses instead, in `services.import_ship_customer_code`."""
    from .models import Spares

    # Developed by Unknown: sanitised for the same reason the stems are - the resulting string
    # is written to a `SlugField`. This value now comes from a SHIP CUSTOMER CODE cell an
    # operator typed, so it can carry a space or a stray symbol in a way the old ship-record
    # lookup was less likely to. `_slug_safe` keeps hyphens and underscores, which are legal
    # in a slug, and drops everything else.
    customer_code = _slug_safe(
        ship_customer_code or _resolve_adopted_ship_customer_code() or "SHIP"
    )
    spare_class_part = _trim_for_pattern(equipment_class.spare_class.name)
    equipment_class_part = _trim_for_pattern(equipment_class.name)

    for _ in range(max_attempts):
        sequence = next_pattern_sequence(equipment_class)
        candidate = (
            f"{customer_code}-{spare_class_part}{equipment_class_part}{sequence:06d}"
        )
        if extra_exclude and candidate.upper() in extra_exclude:
            continue
        if not Spares.objects.filter(pattern_number__iexact=candidate).exists():
            return candidate

    raise ValueError(
        "Could not generate a unique pattern number. Please enter one manually."
    )


# Developed by Unknown: the wording of the criticality escalation message, kept here as a pure
# function rather than inline in the view so the one place the sentence lives can be read and
# tested on its own.
#
# The rule it describes is irreversible and bounded to the calendar year, and the operator reading
# the message is making a stores decision on it. So it states only what actually happened - which
# spare, which grade - plus the one caveat that changes how the grade should be read, that it does
# not come back down. It promises no review, no reversal and no approval step, because the
# application has none. The vocabulary is the application's own: the screens say Criticality
# Strength, and the grades are LOW, MODERATE and HIGH.
def criticality_escalation_message(escalations):
    """Build the operator-facing message for the spares whose criticality strength rose.

    `escalations` is an iterable of `(pattern_number, tier)` pairs, in the order the spares
    were issued. Returns one sentence per spare followed by a single sentence stating the
    rule, or an empty string when no grade changed, so the caller can leave the `message`
    key off the response entirely and an ordinary issue keeps the feedback it has today.
    """
    changes = [
        f"Criticality Strength for {pattern_number} is now {tier}."
        for pattern_number, tier in escalations
        if tier
    ]
    if not changes:
        return ""

    changes.append(
        "This is set automatically from the issue count for the calendar year and is not "
        "lowered again."
    )
    return " ".join(changes)
