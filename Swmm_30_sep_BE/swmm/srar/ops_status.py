"""What a SRAR equipment row may carry once its status is not OPS.

A form row whose status is "Non OPS" or "Not Held" has no readings to give: there is
nothing running to read, and on a "Not Held" row there is no equipment at all. The
screens were still accepting a torsion meter reading and a max RPM on such rows and
saving them, so returns went out — and were pushed into CMMS — carrying figures for
equipment the same row declared absent.

The status codes come from the `ops_choices` every one of these models declares:
1 = OPS, 2 = Non OPS, 3 = Not Held.

Cleared fields are the *measured* ones — readings, and the calibration / trial / test
dates that only mean something for equipment that is actually held and running. What
survives is the row's identity (nomenclature, code, location, serial), its status, its
`non_ops_since` date, and any free-text remarks: those are precisely how an operator
explains why the row is not OPS, so wiping them would destroy the useful part.
"""

OPS = 1
NON_OPS = 2
NOT_HELD = 3

# model name -> the fields that are only meaningful while the row is OPS.
READING_FIELDS = {
    "TorsionMeter": (
        "torsion_meter_rdg",
        "max_rpm_achieved",
        "last_calibration_date",
        "next_calibration_date",
    ),
    "H2SSensor": ("last_calibration_date", "next_calibration_date"),
    "Iccp": (),
    "MagazineFFSystemFloodingSystem": (
        "status",
        "last_trials_taken",
        "next_trials_due",
    ),
    # `remarks` deliberately stays: on an unsat or non-ops plant it is where the
    # explanation goes.
    "STP": ("effluent_status", "effluent_test_date"),
    "OpsStatusofLubOilandCoolantTestKits": (
        "calibration",
        "next_calibration_due_date",
        "last_trials_taken",
        "next_trials_due",
    ),
    "SrarCentrifuge": ("last_calibrated_on", "next_calibration"),
}


def is_ops(status):
    """True for a row explicitly marked OPS."""
    if status in (None, ""):
        return False
    try:
        return int(status) == OPS
    except (TypeError, ValueError):
        # The screens post the label rather than the code on some forms.
        return str(status).strip().upper() in {"OPS", "OPERATIONAL", "SAT"}


def is_not_ops(status):
    """True only when the row carries a status that positively says it is not OPS.

    An unset status returns False rather than True. A row nobody has answered for is
    not a declaration that the equipment is absent, and treating it as one would
    silently discard a reading an operator had already typed.
    """
    if status in (None, ""):
        return False
    return not is_ops(status)


def reading_fields_for(model):
    """The OPS-only fields of `model`, or () if it has no status at all."""
    return READING_FIELDS.get(model.__name__, ())


def blanked_for_status(model, status, data):
    """`data` with the OPS-only fields blanked when `status` is not OPS.

    Returns a new dict; the caller decides what to do with it. Used on the way in
    (serializer validation, so nothing is stored) and on the way out to CMMS (so rows
    saved before this rule existed are not pushed either).
    """
    fields = reading_fields_for(model)
    if not fields or not is_not_ops(status):
        return data
    cleaned = dict(data)
    for field in fields:
        if field in cleaned:
            cleaned[field] = None
    return cleaned


def clear_on_instance(instance):
    """Blank the OPS-only fields on a model instance in place. Returns the field names
    it changed, so a caller can pass them to save(update_fields=...)."""
    fields = reading_fields_for(type(instance))
    if not fields or not is_not_ops(getattr(instance, "ops_or_non_ops", None)):
        return []
    changed = []
    for field in fields:
        if getattr(instance, field, None) is not None:
            setattr(instance, field, None)
            changed.append(field)
    return changed
