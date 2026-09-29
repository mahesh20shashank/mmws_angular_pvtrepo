# Create your models here.
from django.core.exceptions import ValidationError
from django.db import models
from master.models import Base

# from users import models as usersapp
# from master.models import Department
# from master.models import MDeferment, MReason, MInability
from master.models import Department, Frequency, SubDepartment

from .managers import (
    AddRoutineDetailsQuerySet,
    EquipmentNameManager,
    EquipmentNameQuerySet,
    PlannedRoutineDescriptionQuerySet,
    RoutineDescriptionQuerySet,
    SectionNameQuerySet,
)


class MaintopHeader(Base):
    maintop_id = models.IntegerField(primary_key=True)
    maintop_no = models.CharField(null=True, blank=True)
    maintop_title = models.CharField(max_length=100, null=True, blank=True)
    original_date = models.DateTimeField(null=True, blank=True)
    amendment_no = models.IntegerField(null=True, blank=True)
    amendment_date = models.DateTimeField(null=True, blank=True)
    authority = models.CharField(max_length=500, null=True, blank=True)
    flag = models.BooleanField(null=True, blank=True)  # tinyint
    active = models.BooleanField(null=True, blank=True)  # bit
    created_by = models.IntegerField(null=True, blank=True)
    created_date = models.DateTimeField(null=True, blank=True)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_date = models.DateTimeField(null=True, blank=True)
    reference = models.CharField(max_length=1000, null=True, blank=True)
    department = models.CharField(max_length=10, null=True, blank=True)
    is_non_digitized = models.BooleanField(null=True, blank=True)
    fuss_id = models.IntegerField(null=True, blank=True)
    equipmentcode = models.TextField(null=True, blank=True)  # varchar(max)
    equipment_specification = models.CharField(max_length=2000, null=True, blank=True)
    ship_applicable = models.CharField(max_length=2500, null=True, blank=True)
    documents = models.TextField(null=True, blank=True)  # nvarchar(max)
    reason = models.CharField(max_length=500, null=True, blank=True)
    issue_date = models.DateTimeField(null=True, blank=True)
    universal_id_a_user_created_by = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_t_maintopheader = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_t_fuss = models.CharField(max_length=100, null=True, blank=True)
    authority_date = models.DateTimeField(null=True, blank=True)
    is_draft = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return str(self.maintop_no or self.pk)

    # class Meta:
    #     db_table = "maintop_header"


class MaintopDetail(Base):
    maintopheader_f_key = models.ForeignKey(
        MaintopHeader, on_delete=models.SET_DEFAULT, default="", blank=True, null=True
    )
    frequency_f_key = models.ForeignKey(
        Frequency, on_delete=models.SET_DEFAULT, default="", blank=True, null=True
    )
    routine_id = models.IntegerField(primary_key=True)
    routine_no = models.CharField(max_length=100, null=True, blank=True)
    routine_description = models.TextField(null=True, blank=True)
    routine_brief_description = models.TextField(null=True, blank=True)
    maintop_id = models.IntegerField(null=True, blank=True)
    maintop_no = models.CharField(max_length=100, null=True, blank=True)
    amendment_no = models.IntegerField(null=True, blank=True)
    frequency_id = models.IntegerField(null=True, blank=True)
    frequency = models.CharField(max_length=100, null=True, blank=True)
    frequency_sr_no = models.IntegerField(null=True, blank=True)
    group_heading = models.TextField(null=True, blank=True)
    para_heading = models.TextField(null=True, blank=True)
    alternate_info = models.TextField(null=True, blank=True)
    by_whom = models.CharField(max_length=255, null=True, blank=True)
    category = models.CharField(max_length=100, null=True, blank=True)
    dockyard_remarks = models.TextField(null=True, blank=True)
    admin_remarks = models.TextField(null=True, blank=True)
    jic_id = models.IntegerField(null=True, blank=True)
    active = models.BooleanField(null=True, blank=True)
    created_by = models.CharField(max_length=100, null=True, blank=True)
    created_date = models.DateTimeField(null=True, blank=True)
    updated_by = models.CharField(max_length=100, null=True, blank=True)
    updated_date = models.DateTimeField(null=True, blank=True)
    amendment_date = models.DateTimeField(null=True, blank=True)
    by_whom_id1 = models.IntegerField(null=True, blank=True)
    by_whom_id2 = models.IntegerField(null=True, blank=True)
    by_whom_id3 = models.IntegerField(null=True, blank=True)
    freq_priority = models.IntegerField(null=True, blank=True)
    universal_id_a_user_created_by = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_t_maintopdetail = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_t_maintopheader = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_m_frequency = models.CharField(max_length=100, null=True, blank=True)
    universal_id_t_maintopjic = models.CharField(max_length=100, null=True, blank=True)
    universal_id_m_bywhom1 = models.CharField(max_length=100, null=True, blank=True)
    universal_id_m_bywhom2 = models.CharField(max_length=100, null=True, blank=True)
    universal_id_m_bywhom3 = models.CharField(max_length=100, null=True, blank=True)
    jic = models.CharField(max_length=255, null=True, blank=True)
    ss_proposal = models.TextField(null=True, blank=True)
    applicable_eqpt = models.TextField(null=True, blank=True)
    insma_recommendations = models.TextField(null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    reason = models.TextField(null=True, blank=True)
    routine_type = models.CharField(max_length=100, null=True, blank=True)
    ship_id = models.IntegerField(null=True, blank=True)
    comment = models.TextField(null=True, blank=True)
    remove_reason = models.TextField(null=True, blank=True)
    is_synced = models.BooleanField(default=False)

    def __str__(self):
        return str(self.maintop_no or self.pk)


class ShipMaster(Base):
    ship_name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.ship_name


class SectionName(Base):
    objects = SectionNameQuerySet.as_manager()

    name = models.CharField(max_length=200, null=False)
    department = models.ForeignKey("master.department", on_delete=models.PROTECT)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

    def __str__(self):
        return str(self.name or self.pk)


class EquipmentName(Base):
    objects = EquipmentNameManager.from_queryset(EquipmentNameQuerySet)()

    name = models.CharField(max_length=200, null=False)
    nomenclature = models.CharField(max_length=255, null=True, blank=True)
    equipment_code = models.CharField(max_length=255, null=True, blank=True)
    extra = models.CharField(max_length=200, null=True, blank=True)
    section = models.ForeignKey(
        SectionName, on_delete=models.PROTECT, blank=True, null=True
    )

    sub_department = models.ForeignKey(
        SubDepartment, on_delete=models.PROTECT, blank=True, null=True
    )

    # rhsi = models.FloatField(max_length=200, null=True, blank=True, default=None)
    rhsi = models.FloatField(max_length=200, null=True, blank=True, default=None)
    rhsi_updated_until = models.DateTimeField(null=True, blank=True)
    start_timedate = models.DateTimeField(null=True, blank=True)
    stop_timedate = models.DateTimeField(null=True, blank=True)
    state_choices = [
        ("ACTIVE", "ACTIVE"),
        ("INACTIVE", "INACTIVE"),
    ]
    state = models.CharField(
        max_length=30, default="INACTIVE", choices=state_choices, null=True
    )
    atlocation_category_choices = [
        ("AT HARBOUR", "AT HARBOUR"),
        ("AT SEA", "AT SEA"),
        ("AT ANCHORAGE", "AT ANCHORAGE"),
    ]
    started_at_location = models.CharField(
        max_length=30, default="AT SEA", choices=atlocation_category_choices, null=True
    )
    equipment_code = models.CharField(max_length=100, null=True, blank=True)
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentShipDetail",
    )
    sfd_equipment = models.ForeignKey(
        "sfd.ShipEquipment", on_delete=models.SET_DEFAULT, default="", null=True
    )

    def save(
        self, *args, **kwargs
    ):  # Add *args and **kwargs to handle additional arguments
        super().save(*args, **kwargs)  # Ensure proper call to parent save method
        self.name = self.name.upper()
        # Access instance variables using self
        if isinstance(self.rhsi, str) and self.rhsi.strip().lower() == "na":
            self.rhsi = None  # or set to 0 depending on your logic

        if (
            isinstance(self.rhsi_updated_until, str)
            and self.rhsi_updated_until.strip().lower() == "na"
        ):
            self.rhsi_updated_until = None

    def __str__(self):
        return str(self.name or self.pk)


# created to save equiment start stop history
class PostEquipmentStateChangeHistorySave(Base):
    month_name = models.CharField(max_length=200, blank=False, null=False)
    start_time = models.DateTimeField(null=True, blank=True)
    stop_time = models.DateTimeField(null=True, blank=True)
    atlocation_category_choices = [
        ("AT HARBOUR", "AT HARBOUR"),
        ("AT SEA", "AT SEA"),
        ("AT ANCHORAGE", "AT ANCHORAGE"),
    ]
    started_at_location = models.CharField(
        max_length=30, default="AT SEA", choices=atlocation_category_choices, null=True
    )
    diff_in_hours = models.FloatField(max_length=200, null=False)
    equipment_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    entry_creation_date = models.DateTimeField(auto_now_add=True, null=True)

    def __str__(self):
        return str(self.month_name or self.pk)


class UniqueRoutineName(Base):
    name = models.CharField(max_length=1000, unique=True)

    def __str__(self):
        return str(self.name or self.pk)


class AddRoutineDetails(Base):
    objects = AddRoutineDetailsQuerySet.as_manager()

    class_name = models.CharField(max_length=255, null=True, blank=True)
    ship = models.ForeignKey(
        ShipMaster, on_delete=models.SET_DEFAULT, default="", blank=True, null=True
    )
    equipment_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    equipment_code = models.CharField(max_length=100, null=True, blank=True)
    nomenclature = models.CharField(max_length=255, null=True, blank=True)
    maintop_no = models.CharField(max_length=255, null=True, blank=True)
    dart_number = models.CharField(max_length=255, null=True, blank=True)
    routine_no = models.CharField(max_length=100, null=True, blank=True)
    routine_name = models.ForeignKey(UniqueRoutineName, on_delete=models.CASCADE)
    by_whom = models.CharField(max_length=255, null=True, blank=True)
    frequency_in_months = models.PositiveIntegerField(default=0, null=True, blank=True)
    frequency_in_hours = models.PositiveIntegerField(default=0, null=True, blank=True)
    rhs_i = models.CharField(max_length=100, null=True, blank=True)
    rhs_i_updated_upto = models.DateField(null=True, blank=True)
    last_routine_commencement_date = models.DateTimeField(null=True, blank=True)
    last_routine_completion_date = models.DateTimeField(null=True, blank=True)
    last_routine_completion_atrunning_hrs = models.FloatField(
        null=True, blank=True, default=0
    )
    frequency = models.CharField(max_length=100, null=True, blank=True)
    frequency_f_key = models.ForeignKey(
        Frequency, on_delete=models.SET_DEFAULT, default="", blank=True, null=True
    )
    routine_category_choices = [
        ("RUNNING HOUR BASED", "RUNNING HOUR BASED"),
        ("CALENDAR BASED", "CALENDAR BASED"),
        ("ALTERNATE PERIODIC", "ALTERNATE PERIODIC"),
    ]
    routine_category = models.CharField(
        max_length=200, choices=routine_category_choices, default="RUNNING HOUR BASED"
    )
    remarks = models.CharField(max_length=3000, null=True, blank=True, default="")
    converted = models.BooleanField(default=False)
    converted_at = models.DateTimeField(null=True, blank=True)

    # ... rest of the model ...

    def save(self, *args, **kwargs):
        # Ensure routine_name.name is saved in uppercase
        if self.routine_name_id:
            try:
                routine = UniqueRoutineName.objects.get(id=self.routine_name_id)
                if routine.name:
                    routine.name = routine.name.upper()
                    routine.save()
            except UniqueRoutineName.DoesNotExist:
                pass

        # Clean 'na' values and convert to None
        def clean_na(val):
            return None if isinstance(val, str) and val.strip().lower() == "na" else val

        self.last_routine_completion_date = clean_na(self.last_routine_completion_date)
        self.last_routine_completion_atrunning_hrs = clean_na(
            self.last_routine_completion_atrunning_hrs
        )
        self.frequency_in_months = clean_na(self.frequency_in_months)
        self.frequency_in_hours = clean_na(self.frequency_in_hours)

        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.remarks and len(self.remarks) > 3000:
            raise ValidationError("Remarks cannot exceed 3000 characters.")

    def __str__(self):
        return f"{self.equipment_name} - {self.routine_name}"


class RoutineDescription(Base):
    objects = RoutineDescriptionQuerySet.as_manager()

    equipment_name = models.ForeignKey(EquipmentName, on_delete=models.CASCADE)
    routine_name = models.ForeignKey(UniqueRoutineName, on_delete=models.CASCADE)
    add_routine_details = models.ForeignKey(AddRoutineDetails, on_delete=models.CASCADE)
    maintop_no = models.CharField(max_length=200, null=True, blank=True)
    dart_number = models.CharField(max_length=100, null=True, blank=True)
    routine_no = models.CharField(max_length=500, default="", blank=True)
    routine_description = models.TextField()
    by_whom = models.CharField(max_length=1000)
    is_fuss = models.BooleanField(default=False)
    last_routine_completion_date = models.DateTimeField(null=True, blank=True)
    last_routine_completion_atrunning_hrs = models.CharField(null=True, blank=True)
    universal_id_t_dart = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_Dart"
    )
    universal_id_t_routine_list = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_RoutineList"
    )
    dart_sr_no = models.CharField(max_length=150, null=True, blank=True)

    due_date = models.DateField(null=True, blank=True)
    calendar_revised_date = models.DateField(
        null=True, blank=True, help_text="HOD-revised due date for calendar display"
    )
    previous_completed_date = models.DateField(null=True, blank=True)

    due_at_rh = models.CharField(max_length=150, null=True, blank=True)
    previous_completed_at_rh = models.CharField(max_length=150, null=True, blank=True)

    department_f_key = models.ForeignKey(
        "master.department",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    # 🔥 SELF FOREIGN KEY
    previous_routine = models.ForeignKey(
        "self",
        blank=True,
        on_delete=models.SET_NULL,
        null=True,
        related_name="next_routines",
    )
    maintop_detail = models.ForeignKey(
        MaintopDetail, blank=True, on_delete=models.SET_DEFAULT, default="", null=True
    )

    is_close = models.BooleanField(default=False)
    is_greater_than_3_monthly = models.BooleanField(default=True)
    created_on = models.DateTimeField(auto_now=True, blank=True, null=True)
    updated_on = models.DateTimeField(auto_now=True, blank=True, null=True)

    is_ra_initiate = models.BooleanField(default=False)
    is_dl_initiate = models.BooleanField(default=False)
    is_ra_draft = models.BooleanField(default=False)
    is_dl_draft = models.BooleanField(default=False)
    open_cmms_sync_date = models.DateField(blank=True, null=True)
    close_cmms_sync_date = models.DateField(blank=True, null=True)
    open_cmms_sync_status = models.BooleanField(default=False)
    close_cmms_sync_status = models.BooleanField(default=False)

    def clean(self):
        super().clean()
        if len(self.routine_description) > 3000:
            raise ValidationError("Routine description cannot exceed 3000 characters.")

    def __str__(self):
        return str(self.maintop_no or self.pk)


class PlannedAddRoutineDetails(Base):
    class_name = models.CharField(max_length=255, null=True, blank=True)
    ship = models.ForeignKey(
        ShipMaster, on_delete=models.SET_DEFAULT, default="", blank=True, null=True
    )
    equipment_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    equipment_code = models.CharField(max_length=100, null=True, blank=True)
    nomenclature = models.CharField(max_length=255, null=True, blank=True)
    maintop_no = models.CharField(max_length=255, null=True, blank=True)
    dart_number = models.CharField(max_length=255, null=True, blank=True)
    routine_no = models.CharField(max_length=100, null=True, blank=True)
    routine_name = models.ForeignKey(UniqueRoutineName, on_delete=models.CASCADE)
    by_whom = models.CharField(max_length=255, null=True, blank=True)
    frequency_in_months = models.PositiveIntegerField(default=0, null=True, blank=True)
    frequency_in_hours = models.PositiveIntegerField(default=0, null=True, blank=True)
    rhs_i = models.CharField(max_length=100, null=True, blank=True)
    rhs_i_updated_upto = models.DateField(null=True, blank=True)
    last_routine_commencement_date = models.DateTimeField(null=True, blank=True)
    last_routine_completion_date = models.DateTimeField(null=True, blank=True)
    last_routine_completion_atrunning_hrs = models.FloatField(
        null=True, blank=True, default=0
    )
    frequency = models.CharField(max_length=100, null=True, blank=True)
    routine_category_choices = [
        ("RUNNING HOUR BASED", "RUNNING HOUR BASED"),
        ("CALENDAR BASED", "CALENDAR BASED"),
        ("ALTERNATE PERIODIC", "ALTERNATE PERIODIC"),
    ]

    routine_category = models.CharField(
        max_length=200, choices=routine_category_choices, default="RUNNING HOUR BASED"
    )
    remarks = models.CharField(max_length=3000, null=True, blank=True, default="")

    def save(self, *args, **kwargs):
        # Ensure routine_name.name is saved in uppercase
        if self.routine_name_id:
            try:
                routine = UniqueRoutineName.objects.get(id=self.routine_name_id)
                if routine.name:
                    routine.name = routine.name.upper()
                    routine.save()
            except UniqueRoutineName.DoesNotExist:
                pass

        # Clean 'na' values and convert to None
        def clean_na(val):
            return None if isinstance(val, str) and val.strip().lower() == "na" else val

        self.last_routine_completion_date = clean_na(self.last_routine_completion_date)
        self.last_routine_completion_atrunning_hrs = clean_na(
            self.last_routine_completion_atrunning_hrs
        )
        self.frequency_in_months = clean_na(self.frequency_in_months)
        self.frequency_in_hours = clean_na(self.frequency_in_hours)

        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.remarks and len(self.remarks) > 3000:
            raise ValidationError("Remarks cannot exceed 3000 characters.")

    def __str__(self):
        return f"{self.equipment_name} - {self.routine_name}"

    class Meta:
        db_table = "ems_planned_addroutinedetails"


class PlannedRoutineDescription(Base):
    objects = PlannedRoutineDescriptionQuerySet.as_manager()

    routine_description_id = models.ForeignKey(
        RoutineDescription, on_delete=models.CASCADE, blank=True, null=True
    )
    spares_required = models.BooleanField(default=False)
    planned_commencement_date = models.DateField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "ems_planned_routinedescription"

    def __str__(self):
        return str(self.pk)


class PostRoutineDetails(Base):
    routine_name = models.ForeignKey(AddRoutineDetails, on_delete=models.PROTECT)
    last_to_last_routine_running_hrs = models.FloatField(
        max_length=200, blank=False, null=False
    )  # this is last to last routine running hours at which it was due
    last_routine_due_running_hrs_ideal = models.FloatField(
        max_length=200, blank=True, null=True
    )  # running hours at which routine was suppose to be done
    last_routine_due_running_hrs_actual = models.FloatField(
        max_length=200, blank=True, null=True
    )  # running hours at which last routine was done
    last_to_last_routine_date = models.DateTimeField(
        blank=True, null=True
    )  # this is last to last routine date
    last_routine_date_ideal = models.DateTimeField(
        blank=True, null=True
    )  # ideal date of routine
    last_routine_date_actual = models.DateTimeField(
        blank=True, null=True
    )  # this is last routine date
    remarks = models.CharField(max_length=200, null=True, blank=True, default="")
    hrs_between_two_routines = models.FloatField(
        max_length=200, blank=False, null=False
    )
    no_of_days_to_complete_routine = models.FloatField(
        max_length=200, blank=False, null=False
    )
    entry_creation_date = models.DateTimeField(auto_now_add=True, null=True)

    def __str__(self):
        return str(self.remarks or self.pk)


# less than 3 monthly


class LessAddRoutineDetails(Base):
    class_name = models.CharField(max_length=255, null=True, blank=True)
    ship = models.ForeignKey(
        ShipMaster, on_delete=models.SET_DEFAULT, default="", blank=True, null=True
    )
    equipment_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    equipment_code = models.CharField(max_length=100, null=True, blank=True)
    nomenclature = models.CharField(max_length=255, null=True, blank=True)
    maintop_no = models.CharField(max_length=255, null=True, blank=True)
    dart_number = models.CharField(max_length=255, null=True, blank=True)
    routine_no = models.CharField(max_length=100, null=True, blank=True)
    routine_name = models.ForeignKey(UniqueRoutineName, on_delete=models.CASCADE)
    by_whom = models.CharField(max_length=255, null=True, blank=True)
    frequency_in_months = models.PositiveIntegerField(default=0, null=True, blank=True)
    frequency_in_hours = models.PositiveIntegerField(default=0, null=True, blank=True)
    rhs_i = models.CharField(max_length=100, null=True, blank=True)
    rhs_i_updated_upto = models.DateField(null=True, blank=True)
    last_routine_commencement_date = models.DateTimeField(null=True, blank=True)
    last_routine_completion_date = models.DateTimeField(null=True, blank=True)
    last_routine_completion_atrunning_hrs = models.FloatField(
        null=True, blank=True, default=0
    )
    frequency = models.CharField(max_length=100, null=True, blank=True)
    routine_category_choices = [
        ("OCCASIONAL ROUTINES", "OCCASIONAL ROUTINES"),
        ("DAILY ROUTINES", "DAILY ROUTINES"),
        ("WEEKLY ROUTINES", "WEEKLY ROUTINES"),
        ("MONTHLY ROUTINES", "MONTHLY ROUTINES"),
    ]
    routine_category = models.CharField(
        max_length=200, choices=routine_category_choices, default=""
    )
    remarks = models.CharField(max_length=3000, null=True, blank=True, default="")

    def save(self, *args, **kwargs):
        # Ensure routine_name.name is saved in uppercase
        if self.routine_name_id:
            try:
                routine = UniqueRoutineName.objects.get(id=self.routine_name_id)
                if routine.name:
                    routine.name = routine.name.upper()
                    routine.save()
            except UniqueRoutineName.DoesNotExist:
                pass

        # Clean 'na' values and convert to None
        def clean_na(val):
            return None if isinstance(val, str) and val.strip().lower() == "na" else val

        self.last_routine_completion_date = clean_na(self.last_routine_completion_date)
        self.last_routine_completion_atrunning_hrs = clean_na(
            self.last_routine_completion_atrunning_hrs
        )
        self.frequency_in_months = clean_na(self.frequency_in_months)
        self.frequency_in_hours = clean_na(self.frequency_in_hours)

        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.remarks and len(self.remarks) > 3000:
            raise ValidationError("Remarks cannot exceed 3000 characters.")

    def __str__(self):
        return f"{self.equipment_name} - {self.routine_name}"


class LessRoutineDescription(Base):
    equipment_name = models.ForeignKey(EquipmentName, on_delete=models.CASCADE)
    routine_name = models.ForeignKey(UniqueRoutineName, on_delete=models.CASCADE)
    add_routine_details = models.ForeignKey(
        LessAddRoutineDetails, on_delete=models.CASCADE
    )
    maintop_no = models.CharField(max_length=200, null=True, blank=True)
    dart_number = models.CharField(max_length=100, null=True, blank=True)
    routine_no = models.SlugField(max_length=500, default="", blank=True)
    routine_description = models.TextField()
    by_whom = models.CharField(max_length=1000)

    def clean(self):
        super().clean()
        if len(self.routine_description) > 3000:
            raise ValidationError("Routine description cannot exceed 3000 characters.")

    def __str__(self):
        return str(self.maintop_no or self.pk)


# Models for slip calculation only


class SlipLimit(Base):
    gt_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    delta_n_lpc = models.FloatField(max_length=200, null=True, blank=True, default=0)
    delta_t_ext = models.FloatField(max_length=200, null=True, blank=True, default=0)
    delta_p_air = models.FloatField(max_length=200, null=True, blank=True, default=0)

    def __str__(self):
        return str(self.pk)


class DataPointsExtTemp(Base):
    gt_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    hpc_rpm = models.FloatField(max_length=200, null=False)
    ext_temp = models.FloatField(max_length=200, null=False)
    amb_temp = models.FloatField(max_length=200, default="", blank=True, null=True)

    def __str__(self):
        return str(self.pk)


class DataPointsExtTempGTG(Base):
    gt_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    el_load = models.FloatField(max_length=200, null=False)
    ext_temp = models.FloatField(max_length=200, null=False)
    amb_temp = models.FloatField(max_length=200, default="", blank=True, null=True)

    def __str__(self):
        return str(self.pk)


class DataPointsAirprHPC(Base):
    gt_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    hpc_rpm = models.FloatField(max_length=200, null=False)
    air_pr_hpc = models.FloatField(max_length=200, null=False)
    amb_pressure = models.FloatField(max_length=200, default="", blank=True, null=True)

    def __str__(self):
        return str(self.pk)


class DataPointsGTLPC(Base):
    gt_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    hpc_rpm = models.FloatField(max_length=200, default=None, null=False)
    lpc_rpm = models.FloatField(max_length=200, default=None, null=False)
    amb_temp = models.FloatField(max_length=200, blank=True, null=True, default=None)

    def __str__(self):
        return str(self.pk)


class PostCalculateLPC(Base):
    gt_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    recorded_lpc = models.FloatField(
        max_length=200, null=False, db_column="recorded_LPC"
    )
    recorded_air_pr_after_hpc = models.FloatField(max_length=200, null=False)
    recorded_amb_pr_gtinlet = models.FloatField(max_length=200, null=False)
    recorded_ext_temp = models.FloatField(max_length=200, null=False)
    at_hpc_rpm = models.FloatField(max_length=200, null=False, db_column="at_HPC_rpm")
    current_amb_temp = models.FloatField(max_length=200, null=False)
    calculated_lpc_slip = models.FloatField(max_length=200, null=True)
    calculated_air_slip = models.FloatField(max_length=200, null=True)
    calculated_ext_slip = models.FloatField(max_length=200, null=True)
    calculation_time = models.DateTimeField(auto_now_add=True, null=True)

    def __str__(self):
        return str(self.pk)


class PostCalculateGTG(Base):
    gt_name = models.ForeignKey(EquipmentName, on_delete=models.PROTECT)
    recorded_el_load = models.FloatField(max_length=200, null=False)
    recorded_ext_temp_gtg = models.FloatField(max_length=200, null=False)
    recorded_amb_temp = models.FloatField(max_length=200, null=False)
    calculated_gtg_slip_ext = models.FloatField(max_length=200, null=True)
    calculation_time = models.DateTimeField(auto_now_add=True, null=True)

    def __str__(self):
        return str(self.pk)


class MeasurementFuelsondingFinal(Base):
    """Main measurement table with size categories from 10mm to 90mm"""

    # Store tank information directly as text fields
    tank_type = models.CharField(max_length=255, null=True, blank=True)
    tank_name = models.CharField(max_length=255, null=True, blank=True)

    # Basic fields
    mm = models.FloatField()
    volume = models.FloatField()
    tone = models.FloatField(null=True, blank=True)

    # Measurement fields
    field_10mm = models.FloatField(null=True, blank=True)
    field_20mm = models.FloatField(null=True, blank=True)
    field_30mm = models.FloatField(null=True, blank=True)
    field_40mm = models.FloatField(null=True, blank=True)
    field_50mm = models.FloatField(null=True, blank=True)
    field_60mm = models.FloatField(null=True, blank=True)
    field_70mm = models.FloatField(null=True, blank=True)
    field_80mm = models.FloatField(null=True, blank=True)
    field_90mm = models.FloatField(null=True, blank=True)

    # Percentage fields
    field_100per = models.BooleanField(null=True, blank=True)
    field_95per = models.BooleanField(null=True, blank=True)

    # Timestamp
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        tank_info = (
            f"{self.tank_type} - {self.tank_name}"
            if self.tank_type and self.tank_name
            else "No tank info"
        )
        return f"Measurement {self.id} - {tank_info} - {self.mm}mm - {self.created_at.strftime('%Y-%m-%d')}"

    class Meta:
        db_table = "ems_measurement_fuelsonding_final"


class FussRaiseDetails(Base):
    isclosed_fuss = models.BooleanField(default=False)
    ship = models.CharField(max_length=100, null=True, blank=True)
    department = models.CharField(max_length=100, null=True, blank=True)
    department_f_key = models.ForeignKey(
        Department, on_delete=models.SET_DEFAULT, default="", blank=True, null=True
    )
    serial_no = models.CharField(max_length=50, null=True, blank=True)
    routine_description_id = models.ForeignKey(
        RoutineDescription, on_delete=models.CASCADE, blank=True, default="", null=True
    )
    universal_id_t_fuss = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_Fuss"
    )
    is_sync = models.BooleanField(default=False)
    is_mail_sent = models.BooleanField(default=False)

    fuss_date = models.DateField(null=True, blank=True)

    last_undertaken = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    schedule_date = models.DateField(null=True, blank=True)

    equipment = models.TextField(null=True, blank=True)
    location_on_board = models.CharField(max_length=200, null=True, blank=True)
    equipment_sr_no = models.CharField(max_length=100, null=True, blank=True)
    location_code = models.CharField(max_length=50, null=True, blank=True)

    maintop_no = models.CharField(max_length=100, blank=True, null=True, default="")
    frequency = models.CharField(max_length=200, blank=True, null=True, default="")

    amendment_no = models.CharField(max_length=20, blank=True, null=True)
    new_equipment = models.BooleanField(default=False)

    recomm_deferment = models.ForeignKey(
        "master.MDeferment",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    inability = models.ForeignKey(
        "master.MInability",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    reason = models.ForeignKey(
        "master.MReason",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )

    mo_wed_f_key = models.ForeignKey(
        "master.MMaterialOrganizations",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )  # organizations
    establishment_f_key = models.ForeignKey(
        "master.MEstablishment",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )  # yard

    mos_wed = models.CharField(max_length=100, blank=True, null=True)
    yard = models.CharField(max_length=100, blank=True, null=True)

    last_smp_completed = models.DateField(null=True, blank=True)
    last_smp_duration = models.CharField(max_length=50, blank=True, null=True)

    last_amp_completed = models.DateField(null=True, blank=True)
    last_amp_duration = models.CharField(max_length=50, blank=True, null=True)

    amp_smp_required_wef = models.DateField(null=True, blank=True)
    amp_smp_duration = models.CharField(max_length=50, blank=True, null=True)

    remarks = models.TextField(null=True, blank=True)
    demand_details = models.TextField(blank=True, null=True)
    sapres_required = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    def __str__(self):
        return f"{self.ship} | {self.serial_no}"


class FussSpare(Base):
    fuss_f_ky = models.ForeignKey(
        FussRaiseDetails, on_delete=models.CASCADE, related_name="spares"
    )
    # equipment_id = models.ForeignKey(ShipEquipment, on_delete=models.SET_DEFAULT, default="",null=True ,blank=True)
    pattern = models.CharField(max_length=255)
    description = models.TextField()
    quantity = models.PositiveIntegerField(default=1)

    def __str__(self):
        return str(self.description or self.pk)


class RADLMaster(Base):
    ra_dl_name = models.CharField(max_length=250, null=True, blank=True)
    dockyard_name = models.CharField(max_length=250, null=True, blank=True)
    refit_type_name = models.CharField(max_length=250, null=True, blank=True)
    refit_type_f_key = models.ForeignKey(
        "master.RefitMaintenancePeriod",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        # related_name="ems_radl_masters",
        related_name="ems_radlmaster_created",
    )
    created_date = models.DateField(auto_now_add=True)
    created_time = models.TimeField(auto_now_add=True)

    def __str__(self):
        return str(self.ra_dl_name or self.pk)


class RADLRoutineDescription(Base):
    DL_TYPE_CHOICES = (
        ("DL-I", "DL-I"),
        ("DL-II", "DL-II"),
        ("DL-III", "DL-III"),
        ("RA", "RA"),
    )
    STATUS_CHOICES = (
        ("DRAFT", "DRAFT"),
        ("GENERATED", "GENERATED"),
        ("APPROVED", "APPROVED"),
        ("DELETED", "DELETED"),
    )
    radl_master = models.ForeignKey(
        RADLMaster, on_delete=models.SET_DEFAULT, default="", blank=True, null=True
    )
    routine_description = models.ForeignKey(
        "ems.RoutineDescription", on_delete=models.CASCADE, related_name="ra_dl_entries"
    )
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="DRAFT")
    dl_no = models.CharField(max_length=250, blank=True, null=True)
    dl_type = models.CharField(max_length=20, choices=DL_TYPE_CHOICES)
    dl_key = models.CharField(max_length=250, null=True, blank=True)
    ra_grup_id = models.CharField(max_length=100)
    remarks = models.TextField(blank=True, null=True)
    additional_remarks = models.TextField(blank=True, null=True)
    # is_active = models.BooleanField(default=False)
    active = models.BooleanField(default=False)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.routine_description} - {self.dl_type}"
