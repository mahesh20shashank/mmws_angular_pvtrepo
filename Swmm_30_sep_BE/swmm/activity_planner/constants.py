from django.db import models

FMU = "FMU / Support"
ALLOWED_EVENT_MANAGER_ROLES = ["Head of Department", "DY HOD", "HODWRITER"]


class PlannerCategory(models.TextChoices):
    DEFECT = "defect", "Defect"
    ROUTINE = "routine", "Routine"
    PLANNED_ROUTINE = "planned_routine", "Planned Routine"
    TRIAL = "trial", "Trials / Inspections"
    AUDIT = "audit", "Audit"
    MEETING = "meeting", "Meeting"
    LECTURE = "lecture", "Lecture"
    OTHERS = "others", "Others"


class PlannerLane(models.TextChoices):
    ENGINEERING = "eng", "Engineering"
    ELECTRICAL = "elec", "Electrical"
    WEAPON = "wpn", "Weapon"
    OPERATIONS = "ops", "Operations"
    FMU = "fmu", FMU
    TRIALS = "tri", "Trials & Inspection"
    ADMIN = "adm", "Admin / Other"


class PlannerStatus(models.TextChoices):
    SCHEDULED = "scheduled", "Scheduled"
    ACTIVE = "active", "Active"
    DELAYED = "delayed", "Delayed"
    CONFLICT = "conflict", "Conflict"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class PlannerPriority(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    CRITICAL = "critical", "Critical"


DEPARTMENT_TO_LANE = {
    "Engineering": PlannerLane.ENGINEERING,
    "Electrical": PlannerLane.ELECTRICAL,
    "Weapon": PlannerLane.WEAPON,
    "Operations": PlannerLane.OPERATIONS,
    FMU: PlannerLane.FMU,
    "Trials & Inspection": PlannerLane.TRIALS,
    "Admin": PlannerLane.ADMIN,
}


def get_lane_for_department(
    department_name: str | None, default: str = PlannerLane.ENGINEERING
) -> str:
    if not department_name:
        return default
    return DEPARTMENT_TO_LANE.get(department_name, default)
