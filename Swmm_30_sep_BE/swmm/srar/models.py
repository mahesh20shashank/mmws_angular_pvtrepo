from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from master.models import Base, Frequency, Lubricant, Ship
from sfd.models import ShipEquipment

from .managers import (
    NamedActiveQuerySet,
    SrarEquipmentTypeListQuerySet,
    SrarMonthlyHeaderQuerySet,
    SrarMonthlyShipActivityQuerySet,
)

# Legacy / Reference imports
# from swmm_dateutil.relativedelta import relativedelta
# from ems.models import ShipMaster
# from Master.models import *
# from SFD.models import Ship

User = get_user_model()

# SRAR Models


class ShipState(Base):
    objects = NamedActiveQuerySet.as_manager()

    name = models.CharField(max_length=250, unique=True)
    Universal_ID_Ch_Master_Ship_State = models.CharField(
        max_length=100, null=True, blank=True
    )
    code = models.CharField(
        max_length=250,
        null=True,
        blank=True,
    )

    def __str__(self):
        return str(self.name or self.pk)


class ShipLocation(Base):
    objects = NamedActiveQuerySet.as_manager()

    name = models.CharField(max_length=250, unique=True)
    Universal_ID_Ch_Master_Ship_Location = models.CharField(
        max_length=100, null=True, blank=True
    )

    Universal_ID_Ch_Master_Ship_State = models.CharField(
        max_length=100, null=True, blank=True
    )
    code = models.CharField(
        max_length=250,
        null=True,
        blank=True,
    )
    ship_state = models.ForeignKey(
        ShipState,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ship_locations_instate",
    )

    def __str__(self):
        return str(self.name or self.pk)


class ShipActivityType(Base):
    objects = NamedActiveQuerySet.as_manager()

    name = models.CharField(max_length=250, unique=True)
    Universal_ID_Ch_Master_Ship_Activity_Type = models.CharField(
        max_length=100, null=True, blank=True
    )

    Universal_ID_Ch_Master_Ship_Location = models.CharField(
        max_length=100, null=True, blank=True
    )
    code = models.CharField(
        max_length=250,
    )
    ship_location = models.ForeignKey(
        ShipLocation, on_delete=models.CASCADE, null=True, blank=True
    )

    def __str__(self):
        return str(self.name or self.pk)


class ShipActivityDetail(Base):
    objects = NamedActiveQuerySet.as_manager()

    ship_activity_type = models.ForeignKey(
        ShipActivityType, on_delete=models.CASCADE, null=True, blank=True
    )
    Universal_ID_Ch_Master_Ship_Activity_Detail = models.CharField(
        max_length=100, null=True, blank=True
    )

    Universal_ID_Ch_Master_Ship_Activity_Type = models.CharField(
        max_length=100, null=True, blank=True
    )

    name = models.CharField(max_length=250, unique=True)
    code = models.CharField(max_length=250)

    def __str__(self):
        return str(self.name or self.pk)


class CmmsProvenance(Base):
    """Marks which side of the integration a row came from.

    CMMS-pulled data and SWMM form data land in the *same* SRAR tables: the pull writes
    ten of them (header, ship running, equipment exploitation, ship activity, fuel,
    AVCAT, boiler, ICCP, centrifuge) and the SRAR form writes those same ten plus about
    twenty more. Nothing recorded which was which, so the two became indistinguishable
    once they were in the database.

    This records the row's *origin* and is set once, at creation:

      * ``cmms`` — written by the CMMS pull (swmmapi.views.pull_srar_*).
      * ``swmm`` — entered through the SRAR form (srar.services.save_srar_report).

    It is origin, not last-writer, on purpose: a return pulled from CMMS and then edited
    on board stays ``cmms``, and who touched it afterwards is answered by the Base
    audit columns (modified_by / modified_on). Nothing reads this field to make a
    decision — it is there so the data can be told apart, and can be filtered on
    (db_index=True) without changing any existing behaviour.
    """

    SOURCE_CMMS = "cmms"
    SOURCE_SWMM = "swmm"
    source_choices = [(SOURCE_CMMS, "CMMS Sync"), (SOURCE_SWMM, "SWMM Form")]

    data_source = models.CharField(
        max_length=8,
        choices=source_choices,
        default=SOURCE_SWMM,
        db_index=True,
    )

    class Meta:
        abstract = True


class SrarMonthlyHeader(CmmsProvenance, Base):
    objects = SrarMonthlyHeaderQuerySet.as_manager()

    # ship = models.ForeignKey(ShipMaster, on_delete=models.CASCADE)
    ship = models.ForeignKey(Ship, on_delete=models.CASCADE, null=True, blank=True)
    srar_month = models.IntegerField(db_index=True)
    srar_year = models.IntegerField(db_index=True)
    # During the month
    hours_underway_month_hr = models.IntegerField(null=True, blank=True)
    hours_underway_month_min = models.IntegerField(null=True, blank=True)

    distance_run_month = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    # distance_run_month = models.FloatField(null=True, blank=True)
    # Since commissioning
    hours_underway_since_commissioning_hr = models.CharField(
        max_length=10, null=True, blank=True
    )
    hours_underway_since_commissioning_min = models.CharField(
        max_length=10, null=True, blank=True
    )

    hours_underway_month_minutes = models.BigIntegerField(null=True, blank=True)

    # hours_underway_since_commissioning_hr = models.IntegerField(null=True, blank=True)
    # Distance, max speed, duration remain float
    distance_run_since_commissioning = models.FloatField(null=True, blank=True)
    # Maximum Sustained Speed:
    max_speed = models.FloatField(null=True, blank=True)
    max_duration = models.FloatField(null=True, blank=True)
    max_duration_min = models.IntegerField(null=True, blank=True)
    max_duration_hr = models.IntegerField(null=True, blank=True)
    max_speed_date = models.DateField(null=True, blank=True)
    max_shaft_rpm = models.FloatField(null=True, blank=True)

    eo_writer_contact_no = models.CharField(max_length=250, null=True, blank=True)
    eo_name = models.TextField(null=True, blank=True)
    eo_rank = models.CharField(max_length=250, null=True, blank=True)
    eo_personal_no = models.CharField(max_length=250, null=True, blank=True)
    eo_contact_no = models.CharField(max_length=250, null=True, blank=True)
    is_saved = models.BooleanField(default=False)
    send_to_co = models.BooleanField(default=False)
    co_approved = models.BooleanField(default=False)
    cmms_sync_date = models.DateField(null=True, blank=True)
    cmms_sync_status = models.BooleanField(default=False, null=True, blank=True)
    universal_id_m_ship = models.CharField(max_length=250, null=True, blank=True)
    universal_id_t_srar_mthly_header = models.CharField(
        max_length=250, null=True, blank=True, unique=True
    )

    def __str__(self):
        return str(self.hours_underway_since_commissioning_hr or self.pk)


class SrarMonthlyShipActivity(CmmsProvenance, Base):
    objects = SrarMonthlyShipActivityQuerySet.as_manager()

    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_monthly_ship_activities",
        null=True,
        blank=True,
    )
    ship_activity_detail = models.ForeignKey(
        ShipActivityDetail, on_delete=models.CASCADE, null=True, blank=True
    )
    ship_activity_type = models.ForeignKey(
        ShipActivityType, on_delete=models.CASCADE, null=True, blank=True
    )
    ship_location = models.ForeignKey(
        ShipLocation, on_delete=models.CASCADE, null=True, blank=True
    )
    ship_state = models.ForeignKey(
        ShipState, on_delete=models.CASCADE, null=True, blank=True
    )

    from_date = models.DateField(null=True, blank=True)
    to_date = models.DateField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    remarks = models.CharField(max_length=250, null=True, blank=True)
    # CMMS row id for this activity, from Ch_ShipMonthlyMasterActivity — the table
    # the SRAR push writes activity to. Needed so the pull updates the row the push
    # created instead of adding a second copy of it; unlike the equipment-linked
    # tabs there is no natural key here, since a return can hold several activities.
    universal_id_ch_shipmonthlymasteractivity = models.CharField(
        max_length=250, null=True, blank=True, unique=True
    )

    def __str__(self):
        return str(self.serial_no or self.pk)


class SrarMonthlyLubricant(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_monthly_lubricants",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=250, null=True, blank=True)
    lubricant = models.ForeignKey(
        Lubricant,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="srar_monthly_lubricants_of_type",
    )
    # lubricant = models.ForeignKey(Lubricant, on_delete=models.CASCADE, related_name='srar_monthly_lubricants_of_type')
    # M_Lubricant
    quantity = models.FloatField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    unit = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.name or self.pk)


class SrarMonthlyBoiler(
    CmmsProvenance, Base
):  # equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, null=True, blank=True)
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_monthly_boilers",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    hrs_steamed_in_month = models.CharField(max_length=20, null=True, blank=True)
    # hrs_steamed_since_commissioning = models.FloatField(null=True, blank=True)
    hrs_steamed_since_commissioning = models.CharField(
        max_length=20, null=True, blank=True
    )  # Use CharField for HH:MM
    highest_salinity_during_month = models.TextField(null=True, blank=True)
    lowest_salinity_during_month = models.TextField(null=True, blank=True)

    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_monthly_boilers",
        null=True,
        blank=True,
    )

    # Newly added fields based on frontend payload
    # hrs_above_20_percent = models.FloatField(null=True, blank=True)
    hrs_above_20_percent = models.CharField(
        max_length=20, null=True, blank=True
    )  # Use CharField for HH:MM

    last_int_clg_date = models.DateField(null=True, blank=True)

    hrs_steamed_since_last_int_clg = models.CharField(
        max_length=20, null=True, blank=True
    )

    # hrs_steamed_since_last_int_clg = models.FloatField(null=True, blank=True)

    last_ext_clg_date = models.DateField(null=True, blank=True)
    hrs_steamed_at_last_int_clg = models.CharField(max_length=50, null=True, blank=True)
    hrs_steamed_since_last_ext_clg = models.CharField(
        max_length=20, null=True, blank=True
    )
    # hrs_steamed_since_last_ext_clg = models.FloatField(null=True, blank=True)

    hrs_steamed_at_last_ext_clg = models.CharField(max_length=20, null=True, blank=True)
    # hrs_steamed_at_last_ext_clg = models.FloatField(null=True, blank=True)

    last_retubing_date = models.DateField(null=True, blank=True)

    hrs_steamed_since_last_retubing = models.CharField(
        max_length=20, null=True, blank=True
    )
    # hrs_steamed_since_last_retubing = models.FloatField(null=True, blank=True)

    hrs_steamed_at_last_retubing = models.CharField(
        max_length=20, null=True, blank=True
    )
    # hrs_steamed_at_last_retubing = models.FloatField(null=True, blank=True)

    date_of_last_durability_test = models.DateField(null=True, blank=True)
    due_date_for_next_inspection = models.DateField(null=True, blank=True)

    life_assessed_in_months = models.CharField(max_length=20, null=True, blank=True)
    # life_assessed_in_months = models.FloatField(null=True, blank=True)

    def __str__(self):
        return f"{self.name or 'Boiler'} ({self.serial_no or 'No Serial'})"


class SrarBoilerAlkalinitySalinityDetail(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_boiler_alkalinity_salinity_details",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_boiler_alkalinity_salinity_details",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    salinity_last_week = models.CharField(max_length=50, null=True, blank=True)
    chloride_during_month = models.CharField(max_length=50, null=True, blank=True)
    lowest_salinity_chloride = models.CharField(max_length=50, null=True, blank=True)
    alkalinity_n = models.CharField(max_length=50, null=True, blank=True)
    ph = models.CharField(max_length=50, null=True, blank=True)
    tds_ppm = models.CharField(max_length=50, null=True, blank=True)
    phosphate_lowest = models.CharField(max_length=50, null=True, blank=True)
    phosphate_ppm_0 = models.CharField(max_length=50, null=True, blank=True)
    alkalinity_mg_l_lowest = models.CharField(max_length=50, null=True, blank=True)
    alk_ppm = models.CharField(max_length=50, null=True, blank=True)
    y150_alkalinity_percent = models.CharField(max_length=50, null=True, blank=True)
    y150_ph = models.CharField(max_length=50, null=True, blank=True)
    y164_tds_ppm = models.CharField(max_length=50, null=True, blank=True)
    y164_phosphate_lowest = models.CharField(max_length=50, null=True, blank=True)
    vkd_alkalinity_percent = models.CharField(max_length=50, null=True, blank=True)
    vkd_alk_ppm = models.CharField(max_length=50, null=True, blank=True)
    vkd_alkalinity_mg_l = models.CharField(max_length=50, null=True, blank=True)
    vkd_phosphate_ppm = models.CharField(max_length=50, null=True, blank=True)
    jw_common = models.CharField(max_length=50, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class SrarMonthlyEquipment(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_monthly_equipments",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_monthly_equipments",
        null=True,
        blank=True,
    )
    hours_for_a_month = models.FloatField(null=True, blank=True)
    frequency = models.ForeignKey(
        Frequency,
        on_delete=models.CASCADE,
        related_name="srar_monthly_equipments_with_frequency",
        null=True,
        blank=True,
    )
    routine_due = models.TextField(null=True, blank=True)
    routine_id = models.IntegerField(null=True, blank=True)
    over_due_flag = models.TextField(null=True, blank=True)
    hours_from_installation = models.FloatField(null=True, blank=True)
    source = models.IntegerField(null=True, blank=True)  # check if id
    hours_since_install_flag = models.BigIntegerField(null=True, blank=True)
    fprh = models.FloatField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class SrarEquipmentExploitation(CmmsProvenance, Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="equipment_exploitations",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="equipment_exploitations",
        null=True,
        blank=True,
    )
    hrs_for_month = models.BigIntegerField(
        null=True,
        blank=True,
    )
    hrs_for_month_min = models.BigIntegerField(null=True, blank=True)
    hrs_for_month_hrs = models.BigIntegerField(null=True, blank=True)

    rhsi_till_prev_month = models.BigIntegerField(
        # max_length=20,
        null=True,
        blank=True,
    )
    rhsi_till_prev_month_min = models.BigIntegerField(
        # max_length=20,
        null=True,
        blank=True,
    )
    rhsi_till_prev_month_hrs = models.BigIntegerField(
        # max_length=20,
        null=True,
        blank=True,
    )

    rhsi_till_current_month = models.BigIntegerField(
        # max_length=20,
        null=True,
        blank=True,
    )
    rhsi_till_current_month_min = models.BigIntegerField(
        # max_length=20,
        null=True,
        blank=True,
    )
    rhsi_till_current_month_hr = models.BigIntegerField(
        # max_length=20,
        null=True,
        blank=True,
    )

    def __str__(self):
        return f"{self.sfd_details} - {self.srar_monthly_header}"

    # def rhsi_prev_hhmm(self):
    #     return minutes_to_hhmm(self.rhsi_till_prev_month_min)

    # def rhsi_current_hhmm(self):
    #     return minutes_to_hhmm(self.rhsi_till_current_month_min)


class SrarLinkedEquipment(Base):
    srar_equipment = models.ForeignKey(
        ShipEquipment, on_delete=models.CASCADE, null=True, blank=True
    )
    # equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, null=True, blank=True)
    # equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, null=True, blank=True)
    ship = models.ForeignKey(Ship, on_delete=models.CASCADE, null=True, blank=True)

    def __str__(self):
        return str(self.pk)

    # location = models.ForeignKey(Location, on_delete=models.CASCADE, null=True, blank=True)


class FuelConsumptionMonth(CmmsProvenance, Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_fuel_consumption_months",
        null=True,
        blank=True,
    )
    b_f_from_last_month = models.FloatField(null=True, blank=True)
    recieved = models.FloatField(null=True, blank=True)
    consumed_in_harbour = models.FloatField(null=True, blank=True)
    consumed_at_anchorage = models.FloatField(null=True, blank=True)
    consumed_at_sea = models.FloatField(null=True, blank=True)
    total_consumed = models.FloatField(null=True, blank=True)
    defueled = models.FloatField(null=True, blank=True)
    balance_left_on_board = models.FloatField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    # CMMS's own row id (Ch_Ship_Mthly_Fuel_Consumption.Universal_ID_Ch_Ship_Mthly_-
    # Fuel_Consumption) — set by pull_srar_fuel_consumption (swmmapi/views.py) so a
    # re-sync updates this row in place instead of creating a duplicate, the same way
    # SrarMonthlyHeader.universal_id_t_srar_mthly_header keys the header pull.
    universal_id_ch_ship_mthly_fuel_consumption = models.CharField(
        max_length=250, null=True, blank=True, unique=True
    )

    def __str__(self):
        return str(self.serial_no or self.pk)


class AvcatStatus(CmmsProvenance, Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_avcat_statuses",
        null=True,
        blank=True,
    )
    b_f_from_last_month = models.FloatField(null=True, blank=True)
    recieved = models.FloatField(null=True, blank=True)
    given_to_ac = models.FloatField(null=True, blank=True)
    used_for_trials_drained = models.FloatField(null=True, blank=True)
    total_consumed = models.FloatField(null=True, blank=True)
    defuelded = models.FloatField(null=True, blank=True)
    balance_left_on_board = models.FloatField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    # CMMS's own row id (Ch_Ship_Mnthly_Avcat_Status.Universal_ID_Ch_Ship_Mnthly_-
    # Avcat_Status) — see FuelConsumptionMonth.universal_id_ch_ship_mthly_fuel_-
    # consumption for why.
    universal_id_ch_ship_mnthly_avcat_status = models.CharField(
        max_length=250, null=True, blank=True, unique=True
    )

    def __str__(self):
        return str(self.serial_no or self.pk)


class TorsionMeter(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_torsion_meter",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="torsion_meter",
        null=True,
        blank=True,
    )

    # "Not Held" was missing here alone, while every other status-bearing SRAR
    # model has it and the torsion form offers it -- so picking it produced a
    # 400 ("3" is not a valid choice) and the row silently failed to save.
    ops_choices = [(1, "OPS"), (2, "Non OPS"), (3, "Not Held")]
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    torsion_meter_rdg = models.CharField(max_length=250, null=True, blank=True)
    max_rpm_achieved = models.CharField(max_length=250, null=True, blank=True)

    ops_or_non_ops = models.IntegerField(choices=ops_choices, null=True, blank=True)
    non_ops_since = models.DateField(null=True, blank=True)

    # non_ops_since = models.CharField(max_length=250, null=True, blank=True)
    last_calibration_date = models.DateField(null=True, blank=True)
    next_calibration_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class Iccp(CmmsProvenance, Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_iccps",
        null=True,
        blank=True,
    )
    ops_choices = [(1, "OPS"), (2, "Non OPS"), (3, "Not Held")]
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_iccps",
        null=True,
        blank=True,
    )
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    ops_or_non_ops = models.IntegerField(choices=ops_choices, null=True, blank=True)
    non_ops_since = models.DateField(null=True, blank=True)

    # non_ops_since = models.CharField(max_length=250, null=True, blank=True)
    # a----new fields add #
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)

    # end------------


class H2SSensor(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_h2s_sensors",
        null=True,
        blank=True,
    )
    ops_choices = [(1, "OPS"), (2, "Non OPS"), (3, "Not Held")]
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_h2s_sensors",
        null=True,
        blank=True,
    )
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    ops_or_non_ops = models.IntegerField(choices=ops_choices, null=True, blank=True)
    non_ops_since = models.DateField(null=True, blank=True)

    # non_ops_since = models.CharField(max_length=250, null=True, blank=True)
    last_calibration_date = models.DateField(null=True, blank=True)
    next_calibration_date = models.DateField(null=True, blank=True)
    # a----new fields add #
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)

    # end------------


class STP(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_stps",
        null=True,
        blank=True,
    )
    ops_choices = [(1, "OPS"), (2, "Non OPS"), (3, "Not Held")]
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_stps",
        null=True,
        blank=True,
    )
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    ops_or_non_ops = models.IntegerField(choices=ops_choices, null=True, blank=True)
    non_ops_since = models.DateField(null=True, blank=True)
    # non_ops_since = models.CharField(max_length=250, null=True, blank=True)
    effluent_test_date = models.DateField(null=True, blank=True)
    status_choices = [(1, "SAT"), (2, "Unsat")]
    effluent_status = models.IntegerField(choices=status_choices, null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    # a----new fields add #
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)

    # end------------


class MagazineFFSystemFloodingSystem(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_magazine_ff_system_flooding_systems",
        null=True,
        blank=True,
    )
    ops_choices = [(1, "OPS"), (2, "Non OPS"), (3, "Not Held")]
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_magazine_ff_system_flooding_systems",
        null=True,
        blank=True,
    )
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    ops_or_non_ops = models.IntegerField(choices=ops_choices, null=True, blank=True)
    non_ops_since = models.DateField(null=True, blank=True)

    # non_ops_since = models.CharField(max_length=250, null=True, blank=True)
    last_trials_taken = models.DateField(null=True, blank=True)
    next_trials_due = models.DateField(null=True, blank=True)
    # a----new fields add #
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    status_choices = [(1, "SAT"), (2, "Unsat")]
    status = models.IntegerField(choices=status_choices, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)

    # end------------


class OpsStatusofLubOilandCoolantTestKits(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_ops_status_of_lub_oil_and_coolant_test_kits",
        null=True,
        blank=True,
    )
    description = models.TextField(null=True, blank=True)
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_ops_status_of_lub_oil_and_coolant_test_kits",
        null=True,
        blank=True,
    )
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    ops_choices = [(1, "OPS"), (2, "Non OPS"), (3, "Not Held")]
    ops_or_non_ops = models.IntegerField(choices=ops_choices, null=True, blank=True)
    # non_ops_since = models.CharField(max_length=250, null=True, blank=True)
    non_ops_since = models.DateField(null=True, blank=True)
    last_trials_taken = models.DateField(null=True, blank=True)
    next_trials_due = models.DateField(null=True, blank=True)
    # a----new fields add #
    calibration = models.DateField(null=True, blank=True)
    next_calibration_due_date = models.DateField(null=True, blank=True)
    universal_id = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


# FORM NO:7
class InjectorFIPCalibrationReplacement(Base):  # doubt for fields
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_injector_fip_calibration_replacements",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_injector_fip_calibration_replacements",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    ops_choices = [(1, "OPS"), (2, "Non OPS"), (3, "Not Held")]
    ops_or_non_ops = models.IntegerField(choices=ops_choices, null=True, blank=True)
    non_ops_since = models.DateField(null=True, blank=True)
    # non_ops_since = models.CharField(max_length=250, null=True, blank=True)
    last_trials_taken = models.DateField(null=True, blank=True)
    next_trials_due = models.DateField(null=True, blank=True)
    hrs_run_below_33_percent = models.CharField(max_length=50, null=True, blank=True)
    hrs_run_33_to_50_percent = models.CharField(max_length=50, null=True, blank=True)
    hrs_run_50_to_70_percent = models.CharField(max_length=50, null=True, blank=True)
    hrs_run_70_to_100_percent = models.CharField(max_length=50, null=True, blank=True)
    lub_oil_consumption_in_month = models.CharField(
        max_length=50, null=True, blank=True
    )
    date_of_inj_fip_calibration = models.DateField(null=True, blank=True)
    occasion = models.TextField(null=True, blank=True)
    rh_at_which_replaced = models.CharField(max_length=50, null=True, blank=True)
    fuel_consumption_in_month = models.CharField(max_length=50, null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    running_hours_at_replaced = models.CharField(max_length=50, null=True, blank=True)
    running_hours_months = models.CharField(max_length=20, null=True, blank=True)
    running_hours_since_installation = models.CharField(
        max_length=20, null=True, blank=True
    )

    def __str__(self):
        return str(self.serial_no or self.pk)


# FORM NO :8
class DGUF(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_dgufs",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_dgufs",
        null=True,
        blank=True,
    )
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    da_number = models.CharField(max_length=250, null=True, blank=True)
    rh_at_sea_and_anchorage = models.CharField(max_length=20, null=True, blank=True)
    rh_at_port = models.CharField(max_length=20, null=True, blank=True)
    total_rh_in_month = models.CharField(max_length=20, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class DGUFSeaHarbourRunningHourDataInput(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="srar_dguf_sea_harbour_running_hour_data_inputs",
    )
    total_rh_at_sea = models.CharField(max_length=20, null=True, blank=True)
    hours_underway = models.CharField(max_length=20, null=True, blank=True)
    anchorage = models.CharField(max_length=20, null=True, blank=True)
    drifting = models.CharField(max_length=20, null=True, blank=True)
    no_of_hours_in_harbour = models.CharField(max_length=20, null=True, blank=True)
    hours_shore_supply_avl_when_alongs = models.CharField(
        max_length=20, null=True, blank=True
    )
    no_of_cold_moves_in_harbour = models.FloatField(null=True, blank=True)
    cmts_wrt_to_non_avl_shore_supply = models.TextField(null=True, blank=True)
    other_cmts_wrt_to_non_avl_shore_supply = models.TextField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


# #check for options in db is it text based or integer based
class DGUFLimits(Base):
    exceeded_reason_choices = [(1, "Yes"), (2, "No")]
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_dguf_limits",
        null=True,
        blank=True,
    )

    limiting_value_sea = models.FloatField(null=True, blank=True)
    limiting_value_harbour = models.FloatField(null=True, blank=True)

    actual_dguf_sea = models.FloatField(null=True, blank=True)
    actual_dguf_harbour = models.FloatField(null=True, blank=True)

    EXCEED_REASON_SEA_CHOICES = [
        ("1", "Operational Requirement"),
        ("2", "Unable to maintain power supply in single DG"),
        ("3", "To meet additional load"),
        ("4", "Within limit"),
        ("5", "Any other"),
    ]
    EXCEED_REASON_HARBOUR_CHOICES = [
        ("1", "Shore supply not available"),
        ("2", "Ship is at 3rd or 4th berthing position"),
        ("3", "Sea and Action checks"),
        ("4", "Machinery / Weapon Trials"),
        ("5", "Shore DG not available (for ANC ships)"),
        ("6", "Ship is at foreign port"),
        ("7", "Shore supply fluctuation"),
        ("8", "Duty ready ship"),
        ("9", "Cold Move"),
        ("10", "Within limit"),
        ("11", "Any other"),
    ]

    exceed_reason_sea = models.CharField(
        choices=EXCEED_REASON_SEA_CHOICES, null=True, blank=True
    )
    exceed_reason_harbour = models.CharField(
        choices=EXCEED_REASON_HARBOUR_CHOICES, null=True, blank=True
    )

    other_exceed_reason_sea = models.CharField(null=True, blank=True)
    other_exceed_reason_harbour = models.CharField(null=True, blank=True)

    serial_no = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


# FORM NO : 7
class SafetyDeviceCheckTrial(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_safety_device_check_trials",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_safety_device_check_trials",
        null=True,
        blank=True,
    )
    sdc_conducted_by = models.CharField(max_length=250, null=True, blank=True)
    date_of_sdc = models.DateField(null=True, blank=True)
    sfc_in_gm_kwh = models.FloatField(null=True, blank=True)
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    last_sfc_trial_date = models.DateField(null=True, blank=True)
    displacement_during_sfc_trial = models.FloatField(null=True, blank=True)
    status_choices = [(1, "SAT"), (2, "Unsat")]
    status = models.IntegerField(choices=status_choices, null=True, blank=True)

    def status_display(self):
        return dict(self.status_choices).get(self.status)

    def __str__(self):
        return str(self.eqpt_name or self.pk)


class FullPowerTrialsMainEngine(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_full_power_trials_main_engines",
        null=True,
        blank=True,
    )
    date = models.DateField(null=True, blank=True)
    occasion_reason = models.TextField(null=True, blank=True)
    draught_fwd = models.FloatField(null=True, blank=True)
    draught_aft = models.FloatField(null=True, blank=True)
    displacement = models.FloatField(null=True, blank=True)
    max_speed = models.FloatField(null=True, blank=True)
    conducted_by = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    torsion_meter_reading = models.CharField(max_length=250, null=True, blank=True)
    sea_state = models.CharField(max_length=250, null=True, blank=True)
    pending_dr_activities_reason = models.TextField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class FPTEquipmentWise(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_fpt_equipments",
        null=True,
        blank=True,
    )
    fpt_main_engine = models.ForeignKey(
        FullPowerTrialsMainEngine,
        on_delete=models.CASCADE,
        related_name="srar_fpt_main_engines",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_fpt_equipments",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    fuel_rack_dbr_max = models.FloatField(null=True, blank=True)
    marking_max = models.FloatField(null=True, blank=True)
    undertaken_on = models.DateField(null=True, blank=True)
    pitch = models.CharField(max_length=250, null=True, blank=True)
    max_rpm = models.FloatField(null=True, blank=True)
    rated_power = models.FloatField(null=True, blank=True)
    max_achieved_power = models.FloatField(null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class FPTDieselAlternators(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_fpt_diesel_alternators",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_fpt_diesel_alternators",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    occasion = models.TextField(null=True, blank=True)
    rated_load = models.FloatField(null=True, blank=True)
    max_load_achieved = models.FloatField(null=True, blank=True)
    conducted_by = models.CharField(max_length=250, null=True, blank=True)
    # last_ehm_trials_undertaken_on = models.TextField(null=True, blank=True)
    last_ehm_trials_undertaken_on = models.DateField(null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class ReductionGearExploitation(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_reduction_gear_exploitations",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_reduction_gear_exploitations",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    total_rh_in_month = models.CharField(null=True, blank=True)
    total_rh_si = models.CharField(null=True, blank=True)
    total_rh_regime1_in_month = models.CharField(null=True, blank=True)
    total_rh_regime1_si = models.CharField(null=True, blank=True)
    total_rh_regime2_in_month = models.CharField(null=True, blank=True)
    total_rh_regime2_si = models.CharField(null=True, blank=True)
    total_rh_regime3_in_month = models.CharField(null=True, blank=True)
    total_rh_regime3_si = models.CharField(null=True, blank=True)
    trailing_rh_in_month = models.CharField(null=True, blank=True)
    trailing_rh_si = models.CharField(null=True, blank=True)
    service_life_in_month = models.CharField(null=True, blank=True)
    service_life_si = models.CharField(null=True, blank=True)
    no_of_eng_regime1_in_month = models.CharField(null=True, blank=True)
    no_of_eng_regime1_si = models.CharField(null=True, blank=True)
    no_of_eng_regime2_in_month = models.CharField(null=True, blank=True)
    no_of_eng_regime2_si = models.CharField(null=True, blank=True)
    no_of_eng_regime3_in_month = models.CharField(null=True, blank=True)
    no_of_eng_regime3_si = models.CharField(null=True, blank=True)
    no_of_eng_regime4_in_month = models.CharField(null=True, blank=True)
    no_of_eng_regime4_si = models.CharField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class DieselReductionGearExploitation(Base):
    """Tab 7 "Diesel Reduction Gear" — the main *diesel* engine's reduction gear.

    Separate from ReductionGearExploitation, which is the gas-turbine reduction gear
    on Tab 10 and carries the Regime I/II/III breakdown. The diesel RG return only
    asks for hours this month and hours since installation, and the two tabs are
    driven by two different CMMS Ch_Master_Equipment_Type categories: 4 "Reduction
    Gear" here, 35 "Reduction Gear(Gas Turbine)" there. They need their own tables
    because `_sync_relation` (srar/services.py) deletes every row of a model not
    present in its payload key, so two tabs sharing one model would wipe each other.
    """

    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_diesel_reduction_gear_exploitations",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_diesel_reduction_gear_exploitations",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    # HH:MM strings, same convention as the other running-hours columns.
    hrs_for_month = models.CharField(max_length=50, null=True, blank=True)
    hrs_since_installation = models.CharField(max_length=50, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class GasTurbineExploitation(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_gas_turbine_exploitations",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_gas_turbine_exploitations",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    total_rh_in_month = models.FloatField(null=True, blank=True)
    total_rh_si = models.FloatField(null=True, blank=True)
    no_of_hot_starts_in_month = models.FloatField(null=True, blank=True)
    no_of_hot_starts_si = models.FloatField(null=True, blank=True)
    no_of_cold_starts_in_month = models.FloatField(null=True, blank=True)
    no_of_cold_starts_si = models.FloatField(null=True, blank=True)
    no_of_false_starts_in_month = models.FloatField(null=True, blank=True)
    no_of_false_starts_si = models.FloatField(null=True, blank=True)
    rg_exploitation = models.ForeignKey(
        ReductionGearExploitation,
        on_delete=models.CASCADE,
        related_name="srar_gas_turbine_exploitations",
        null=True,
        blank=True,
    )
    no_of_tech_starts_in_month = models.FloatField(null=True, blank=True)
    no_of_tech_starts_si = models.FloatField(null=True, blank=True)
    STATUS_CHOICES = (
        ("1", "OPS"),
        ("2", "Non OPS"),
        ("3", "Not Held"),  # Corrected this line
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=1,
        verbose_name="Status*",
        help_text="Operational status of the equipment.",
    )
    non_ops_since = models.DateField(null=True, blank=True)

    # non_ops_since = models.CharField(
    #     verbose_name="Non Ops Since*",
    #     null=True,
    #     blank=True,
    #     help_text="Date since the equipment has been non-operational."
    # )
    last_calibration_date_of_fitted_fuel_eqpt = models.DateField(null=True, blank=True)
    last_ehm_trial_date = models.DateField(null=True, blank=True)
    last_fpt_date = models.DateField(null=True, blank=True)
    fuel_eqpt_calibration_due_on = models.DateField(null=True, blank=True)
    rh_regime_1_in_mth = models.CharField(max_length=255, null=True, blank=True)
    rh_regime_1_si = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00, null=True, blank=True
    )

    # Fields for R/H (Regime II - 0.7 to 0.8)
    rh_regime_2_in_mth = models.CharField(
        max_length=255,
        verbose_name="R/H (Regime II - 0.7 to 0.8) In Mth",
        help_text="Running hours in Regime II, measured in months.",
        null=True,
        blank=True,
    )
    rh_regime_2_si = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        verbose_name="R/H (Regime II - 0.7 to 0.8) SI",
        help_text="SI value for Regime II.",
        null=True,
        blank=True,
    )

    # Fields for R/H (Regime III - 0.9 to 1.0)
    rh_regime_3_in_mth = models.CharField(
        max_length=255,
        verbose_name="R/H (Regime III - 0.9 to 1.0) In Mth",
        help_text="Running hours in Regime III, measured in months.",
        null=True,
        blank=True,
    )
    rh_regime_3_si = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        verbose_name="R/H (Regime III - 0.9 to 1.0) SI",
        help_text="SI value for Regime III.",
        null=True,
        blank=True,
    )

    # Fields for No of Astern Engagements
    no_of_astern_engagements_in_mth = models.CharField(
        max_length=255,
        verbose_name="No of Astern Engagements In Mth",
        help_text="Number of astern engagements, measured in months.",
        null=True,
        blank=True,
    )
    no_of_astern_engagements_count = models.IntegerField(
        default=0,
        verbose_name="No of Astern Engagements",
        help_text="The total count of astern engagements.",
        null=True,
        blank=True,
    )
    # Fields for No of Stop Orders
    no_of_stop_orders_in_mth = models.CharField(
        max_length=255,
        verbose_name="No of Astern Engagements In Mth",
        help_text="Number of astern engagements, measured in months.",
        null=True,
        blank=True,
    )
    no_of_stop_orders_si = models.IntegerField(
        default=0,
        verbose_name="No of Astern Engagements",
        help_text="The total count of astern engagements.",
        null=True,
        blank=True,
    )
    last_chem_clg = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"Equipment Status {self.id}"


class ReplacementOfMajorAssemblies(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_replacement_of_major_assemblies",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_replacement_of_major_assemblies",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    eqpt_sr_number = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    date_of_replacement = models.DateField(null=True, blank=True)  # Added field
    # unit_sub_units = models.FloatField(null=True, blank=True)
    unit_sub_units = models.CharField(max_length=250, null=True, blank=True)

    reason_for_replacement = models.TextField(null=True, blank=True)
    replacement_remarks = models.TextField(null=True, blank=True)
    tab_value = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


# FORM NO:7
class AnnualSRMRRoutineUndertaken(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_annual_srmr_routine_undertakens",
        null=True,
        blank=True,
    )
    equipment = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_annual_srmr_routine_undertakens",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    eqpt_sr_number = models.CharField(max_length=250, null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    description_of_routine = models.TextField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    by_whom = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="srar_annual_srmr_routine_undertakens",
        null=True,
        blank=True,
    )
    undertaken_by_whom = models.CharField(max_length=250, null=True, blank=True)
    tab_value = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


# 11.
class GasTurbineGeneratorExploitation(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_gas_turbine_generator_exploitations",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_gas_turbine_generator_exploitations",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    total_rh_in_month = models.CharField(max_length=250, null=True, blank=True)
    total_rh_si = models.CharField(max_length=250, null=True, blank=True)
    total_rh_in_harbour = models.CharField(max_length=250, null=True, blank=True)
    total_rh_in_sea = models.CharField(max_length=250, null=True, blank=True)

    no_of_hot_starts_in_month = models.FloatField(null=True, blank=True)
    no_of_hot_starts_si = models.FloatField(null=True, blank=True)
    no_of_cold_starts_in_month = models.FloatField(null=True, blank=True)
    no_of_cold_starts_si = models.FloatField(null=True, blank=True)
    no_of_battery_cold_starts_in_month = models.FloatField(null=True, blank=True)
    no_of_battery_cold_starts_si = models.FloatField(null=True, blank=True)
    no_of_battery_hot_starts_in_month = models.FloatField(null=True, blank=True)
    no_of_battery_hot_starts_si = models.FloatField(null=True, blank=True)
    date = models.DateField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class GasTurbineGeneratorExploitationGufEntry(Base):
    EXCEED_REASON_SEA_CHOICES = [
        ("1", "Operational Requirement"),
        ("2", "Unable to maintain power supply in single DG"),
        ("3", "To meet additional load"),
        ("4", "Within limit"),
        ("5", "Any other"),
    ]
    EXCEED_REASON_HARBOUR_CHOICES = [
        ("1", "Shore supply not available"),
        ("2", "Ship is at 3rd or 4th berthing position"),
        ("3", "Sea and Action checks"),
        ("4", "Machinery / Weapon Trials"),
        ("5", "Shore DG not available (for ANC ships)"),
        ("6", "Ship is at foreign port"),
        ("7", "Shore supply fluctuation"),
        ("8", "Duty ready ship"),
        ("9", "Cold Move"),
        ("10", "Within limit"),
        ("11", "Any other"),
    ]
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_gas_turbine_generator_exploitationguf",
        null=True,
        blank=True,
    )
    guf_sea = models.DecimalField(max_digits=10, decimal_places=2)
    reason_exceed_sea = models.CharField(
        choices=EXCEED_REASON_SEA_CHOICES, max_length=255
    )
    guf_hbr = models.DecimalField(max_digits=15, decimal_places=2)
    reason_exceed_hbr = models.CharField(
        choices=EXCEED_REASON_HARBOUR_CHOICES, max_length=255
    )

    def __str__(self):
        return str(self.reason_exceed_sea or self.pk)


class ReductionGearExploitationofGTG(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_reduction_gear_exploitationsofgtg",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_reduction_gear_exploitationsofgtg",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    rg_running_hours = models.FloatField(null=True, blank=True)
    no_of_hot_starts = models.FloatField(null=True, blank=True)
    no_of_cold_starts = models.FloatField(null=True, blank=True)
    rh_in_harbour = models.FloatField(null=True, blank=True)
    rh_in_sea = models.FloatField(null=True, blank=True)
    in_months_si = models.FloatField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class ReplacementOfMajorAssembliesofGTG(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_replacement_of_major_assembliesofgtgs",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_replacement_of_major_assembliesofgtgs",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    eqpt_sr_number = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    # unit_sub_units = models.FloatField(null=True, blank=True)
    unit_sub_units = models.CharField(max_length=250, null=True, blank=True)
    reason_for_replacement = models.TextField(null=True, blank=True)
    replacement_remarks = models.TextField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class AnnualSRMRRoutineUndertakenofGTG(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_annual_srmr_routine_undertakensofgtg",
        null=True,
        blank=True,
    )
    equipment = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_annual_srmr_routine_undertakensofgtg",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    eqpt_sr_number = models.CharField(max_length=250, null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    description_of_routine = models.TextField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    by_whom = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="srar_annual_srmr_routine_undertakensofgtg",
        null=True,
        blank=True,
    )
    undertaken_by_whom = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class GTGParameters(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_gtg_parameters",
        null=True,
        blank=True,
    )
    gtg_exploitation = models.ForeignKey(
        GasTurbineGeneratorExploitation,
        on_delete=models.CASCADE,
        related_name="srar_gtg_parameters",
        null=True,
        blank=True,
    )
    fe_value = models.FloatField(null=True, blank=True)
    cu_value = models.FloatField(null=True, blank=True)
    fnt_filter_date = models.DateField(null=True, blank=True)
    ct_500_filter_date = models.DateField(null=True, blank=True)
    lub_oil_water_content = models.FloatField(null=True, blank=True)
    lub_oil_mechanical_impurities = models.FloatField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class GTGrecordOfCleaningServiceTank(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_gtg_record_of_cleaning_service_tanks",
        null=True,
        blank=True,
    )
    gtg_exploitation = models.ForeignKey(
        GasTurbineGeneratorExploitation,
        on_delete=models.CASCADE,
        related_name="srar_gtg_record_of_cleaning_service_tanks",
        null=True,
        blank=True,
    )
    tank_no = models.IntegerField(null=True, blank=True)
    date_of_cleaning = models.DateField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


# #still doubt in GT parameters as it is being recorded inside the GTG parameters section
class RHExtension(Base):
    EquipmentTypes = [(1, "Main Engine"), (2, "Diesel Alternator")]
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_rh_extension_main_engines",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_rh_extension_main_engines",
        null=True,
        blank=True,
    )
    eqpt_name = models.CharField(max_length=250, null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.CharField(max_length=250, null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    # total_rh_in_month = models.FloatField(null=True, blank=True)
    total_rh_in_month = models.CharField(max_length=255, null=True, blank=True)
    # on_routine = models.CharField(max_length=250, null=True, blank=True)
    on_routine = models.ForeignKey(
        Frequency,
        on_delete=models.SET_NULL,
        max_length=250,
        null=True,
        blank=True,
    )
    on_routine_text = models.CharField(max_length=250, null=True, blank=True)
    # rh_ext_at_conduct_of_ext_trial = models.FloatField(null=True, blank=True)
    rh_ext_at_conduct_of_ext_trial = models.CharField(
        max_length=255, null=True, blank=True
    )
    authority_letter_for_extension_trial = models.CharField(
        max_length=250, null=True, blank=True
    )
    # rh_extension_granted_upto = models.FloatField(null=True, blank=True)
    rh_extension_granted_upto = models.CharField(max_length=255, null=True, blank=True)
    # rh_left_for_expiry_of_extension = models.FloatField(null=True, blank=True)
    rh_left_for_expiry_of_extension = models.CharField(
        max_length=255, null=True, blank=True
    )
    equipment_type = models.IntegerField(choices=EquipmentTypes, null=True, blank=True)
    trial_conducted_by = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class EEF(Base):
    REASON_CHOICES = [
        ("1", "Operational Reason"),
        ("2", "EHM/Machinery Trial"),
        ("3", "PRT/PST"),
        ("4", "Within Limit / SAT"),
    ]

    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_eefs",
        null=True,
        blank=True,
    )
    designed = models.FloatField(null=True, blank=True)
    actual = models.FloatField(null=True, blank=True)
    reason_for_exceeding = models.TextField(
        choices=REASON_CHOICES, null=True, blank=True
    )
    ship_remarks = models.TextField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return f"EEF for {self.srar_monthly_header}"


class EquipmentRoutineDueOn(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_equipment_routine_due_ons",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_equipment_routine_due_ons",
        null=True,
        blank=True,
    )
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    hrs_from_installations = models.FloatField(null=True, blank=True)
    frequency = models.ForeignKey(
        Frequency,
        on_delete=models.CASCADE,
        related_name="srar_equipment_routine_due_ons",
        null=True,
        blank=True,
    )
    running_hr_routine_due = models.FloatField(null=True, blank=True)
    date_of_nxt_routine = models.DateField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class SrarAdjustment(Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_srar_adjustments",
        null=True,
        blank=True,
    )
    adjustment_type_choices = [
        (1, "Ship Running Hours"),
        (2, "Equipment Running Hours"),
    ]
    adjustment_type = models.IntegerField(
        choices=adjustment_type_choices, null=True, blank=True
    )
    ship = models.ForeignKey(
        Ship,
        on_delete=models.CASCADE,
        related_name="srar_srar_adjustments",
        null=True,
        blank=True,
    )
    month = models.IntegerField(null=True, blank=True)
    year = models.IntegerField(null=True, blank=True)
    hours_underway_since_first_commissioning = models.FloatField(null=True, blank=True)
    distance_run_since_first_commissioning = models.FloatField(null=True, blank=True)
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="srar_srar_adjustments",
        null=True,
        blank=True,
    )
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    hours_for_month = models.FloatField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


# new model to intigrate added
class SrarCentrifuge(CmmsProvenance, Base):
    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="SrarCentrifuge_srar_header",
        null=True,
        blank=True,
    )
    sfd_details = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="SrarCentrifuge_sfd_details",
        null=True,
        blank=True,
    )
    ops_choices = [(1, "OPS"), (2, "Non OPS"), (3, "Not Held")]
    ops_or_non_ops = models.IntegerField(choices=ops_choices, null=True, blank=True)
    non_ops_since = models.DateField(null=True, blank=True)

    # non_ops_since = models.CharField(max_length=250, null=True, blank=True)
    eqpt_name = models.TextField(null=True, blank=True)
    nomenclature = models.CharField(max_length=250, null=True, blank=True)
    eqpt_code = models.TextField(null=True, blank=True)
    serial_no = models.CharField(max_length=250, null=True, blank=True)
    loc_on_board = models.TextField(null=True, blank=True)
    # Step 6's "Last Calibrated Date" / "Next Calibration Due" for a purifier. The form
    # has always shown these two as editable, and Step 6 validation makes them mandatory
    # for an Ops purifier -- but there was nowhere to put them: absent from the save
    # payload, and the restore hardcoded them back to blank. So a user filled two
    # mandatory fields and watched them clear again on the next save.
    last_calibrated_on = models.DateField(null=True, blank=True)
    next_calibration = models.DateField(null=True, blank=True)

    def __str__(self):
        return str(self.serial_no or self.pk)


class SrarEquipmentTypeList(CmmsProvenance, Base):
    objects = SrarEquipmentTypeListQuerySet.as_manager()

    # OneToOneField rather than ForeignKey(unique=True): the two are the same thing at the
    # database level (a foreign key with a unique constraint), and Django says so itself with
    # fields.W342. Spelling it as the one-to-one it already was is what clears that warning —
    # and it is also the honest description, since the unique=True meant a ShipEquipment
    # could only ever have one row here.
    #
    # Safe to swap because the only thing that changes is the reverse accessor, which goes
    # from a manager to a single object, and nothing reads it: `sfd_shipequipment_id` appears
    # nowhere in the codebase outside this declaration.
    equipment_id = models.OneToOneField(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="sfd_shipequipment_id",
        null=True,
        blank=True,
    )
    srar_type = models.CharField(max_length=250, null=True, blank=True)
    srar_txt = models.CharField(max_length=250, null=True, blank=True)
    universal_id = models.CharField(max_length=250, null=True, blank=True)
    equipment_type_id = models.CharField(max_length=255, null=True, blank=True)
    equipment_desc = models.CharField(max_length=255, null=True, blank=True)
    status = models.CharField(max_length=50, null=True, blank=True)
    cmms_id = models.CharField(max_length=100, null=True, blank=True)
    cmms_ship_id = models.CharField(max_length=100, null=True, blank=True)
    equipment_category_code = models.CharField(max_length=100, null=True, blank=True)
    universal_id_a_user_created_by = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_ch_master_equipment_type = models.CharField(
        max_length=100, null=True, blank=True, db_index=True
    )

    class Meta:
        constraints = [
            # Scoped to the bare category rows (equipment_id IS NULL) the CMMS
            # Ch_Master_Equipment_Type sync owns — see pull_srar_equipment_types
            # (swmmapi/views.py) and SrarMasterEquipmentsAPIView's docstring. Many
            # equipment-linked rows legitimately share one equipment_type_id (every
            # piece of equipment under that category), so this can't be a plain
            # unique=True on the field.
            models.UniqueConstraint(
                fields=["equipment_type_id"],
                condition=models.Q(equipment_id__isnull=True),
                name="unique_srar_equipment_type_catalog_row",
            )
        ]

    def __str__(self):
        return str(self.srar_type or self.pk)


class SrarMasterEquipment(Base):
    equipment_type_id = models.CharField(
        db_column="Equipment_Type_ID", max_length=255, primary_key=True
    )
    equipment_desc = models.CharField(
        db_column="Equipment_Desc", max_length=255, null=True, blank=True
    )
    status = models.CharField(db_column="Status", max_length=50, null=True, blank=True)
    cmms_id = models.CharField(
        db_column="CMMS_ID", max_length=100, null=True, blank=True
    )
    cmms_ship_id = models.CharField(
        db_column="CMMS_Ship_ID", max_length=100, null=True, blank=True
    )
    equipment_category_code = models.CharField(
        db_column="Equipment_Category_Code", max_length=100, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=100,
        null=True,
        blank=True,
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_ch_master_equipment_type = models.CharField(
        db_column="Universal_ID_Ch_Master_Equipment_Type",
        max_length=100,
        null=True,
        blank=True,
    )
    order_by = models.IntegerField(db_column="Order_By", null=True, blank=True)

    class Meta:
        db_table = "srar_masterequipment"
        ordering = ["order_by", "equipment_type_id"]

    def __str__(self):
        return str(self.equipment_desc or self.equipment_type_id)


class SrarEquipmentValidity(Base):
    equipment = models.OneToOneField(
        ShipEquipment, on_delete=models.CASCADE, related_name="validity_master"
    )

    last_calibration_date = models.DateField(null=True, blank=True)
    validity_months = models.PositiveIntegerField(null=True, blank=True)
    next_calibration_due = models.DateField(blank=True, null=True)

    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        # Auto calculate next calibration date
        if self.last_calibration_date and self.validity_months:
            self.next_calibration_due = self.last_calibration_date + relativedelta(
                months=self.validity_months
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.equipment.nomenclature} – Calibration Validity"


class ChMasterFullPowerConductedBy(Base):
    """Local mirror of CMMS `Ch_Master_Full_Power_Conducted_By`, used to power the
    'Conducted By'/'Trial Conducted By' dropdowns across the SRAR forms."""

    full_power_conducted_by_id = models.CharField(max_length=250, unique=True)
    full_power_conducted_by = models.CharField(max_length=250, null=True, blank=True)
    cmms_status = models.CharField(max_length=50, null=True, blank=True)
    universal_id = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return str(self.full_power_conducted_by or self.full_power_conducted_by_id)


class CmmsLubricant(Base):
    """Local mirror of CMMS `M_Lubricant`, used to power the 'Add Lubricant' picker
    (name + unit) in the SRAR Lubricant Consumption tab."""

    lubricant_id = models.CharField(max_length=250, unique=True)
    lubricant_name = models.CharField(max_length=250, null=True, blank=True)
    lubricant_type = models.CharField(max_length=50, null=True, blank=True)
    lubricant_code = models.CharField(max_length=250, null=True, blank=True)
    unit = models.CharField(max_length=50, null=True, blank=True)
    cmms_active = models.BooleanField(default=True)
    universal_id = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return str(self.lubricant_name or self.lubricant_id)


class SrarHalfYearlyHeader(Base):
    """CMMS's T_SRARHlfYrlyHeader, for which SWMM raises no return of its own.

    Seven CMMS SRAR tables -- the GT/RG gas and reduction exploitations, the GTG
    generator and its utilisation factor, the diesel-alternator full power trials,
    half-yearly lubricant consumption and the running-hours extension trials -- key on a
    half-yearly return rather than a monthly one. Every SWMM form behind them hangs off
    the monthly header instead, so there was no half-yearly identity to hand CMMS and
    none of those seven tables could be written at all.

    One row per ship and half-year holds the identity CMMS knows that period by, so
    those rows have a parent to belong to and a re-push updates the same CMMS rows
    rather than adding a second set.
    """

    ship = models.ForeignKey(
        Ship,
        on_delete=models.CASCADE,
        related_name="srar_half_yearly_headers",
        null=True,
        blank=True,
    )
    srar_year = models.IntegerField(null=True, blank=True)
    # 1 = the Jan-Jun half, 2 = Jul-Dec. CMMS records the period as a month, so this
    # goes out as SRARMonth 6 or 12.
    srar_half = models.IntegerField(null=True, blank=True)
    universal_id_t_srar_hlf_yrly_header = models.CharField(
        max_length=250, null=True, blank=True, unique=True
    )

    class Meta:
        db_table = "srar_srarhalfyearlyheader"
        unique_together = ("ship", "srar_year", "srar_half")

    def __str__(self):
        return f"{self.ship} H{self.srar_half} {self.srar_year}"


class SrarMonthlyShipRunning(CmmsProvenance, Base):
    """Mirrors CMMS T_SRARMthlyShipRunning — days at sea / at harbour per return.

    This is the return's own record of the sea/harbour split. It had no local model, which
    is why the dashboard had to derive days at sea and harbour from SRAR form 8 columns
    (A) and (E) instead; with this in place the KPIs can read the field the return actually
    reports, and fall back to form 8 only when a return has not filled it in.
    """

    srar_monthly_header = models.ForeignKey(
        SrarMonthlyHeader,
        on_delete=models.CASCADE,
        related_name="srar_monthly_ship_runnings",
        null=True,
        blank=True,
    )
    months = models.CharField(max_length=20, null=True, blank=True)
    at_sea_in_month = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    at_harbour_in_month = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    remark_of_month = models.TextField(null=True, blank=True)

    universal_id_t_srar_mthly_ship_running = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_t_srar_mthly_header = models.CharField(
        max_length=100, null=True, blank=True
    )
    universal_id_m_ship = models.CharField(max_length=100, null=True, blank=True)
    is_synced = models.BooleanField(default=False)

    class Meta:
        db_table = "srar_srarmonthlyshiprunning"

    def __str__(self):
        return str(self.months or self.pk)
