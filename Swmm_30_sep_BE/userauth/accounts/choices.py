"""Choice tuples shared by the account models / serializers.

``access_level_choices`` is copied verbatim from ``swmm/users/choices.py`` so the
SWMM frontend keeps receiving the exact ``access_level`` / ``access_level_display``
pair it has always rendered.
"""

access_level_choices = [
    # first value is stored in the DB, second is the human label
    ("0", "ADMINISTRATOR"),
    ("1", "SUPERUSER"),
    ("2", "STOREKEEPER"),
    ("3", "OTHERS"),
]
