from accounts.models import CustomUserProfile
from django.db import models
from django.utils import timezone
from master.models import Base

from .managers import BaseManager

# Create your models here.
#########################

# class MeasurementType(models.Model):
#     """Model to store different types of measurements"""
#     name = models.CharField(max_length=100)
#     description = models.TextField(blank=True, null=True)

#     def __str__(self):
#         return self.name

#     class Meta:
#         verbose_name = "Measurement Type"
#         verbose_name_plural = "Measurement Types"


class MeasurementFuelsondingFinal(Base):
    objects = BaseManager()
    """Main measurement table with size categories from 10mm to 90mm"""

    # Store tank information directly as text fields
    tank_type = models.CharField(max_length=255, blank=True)
    tank_name = models.CharField(max_length=255, blank=True)

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
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    def __str__(self):
        tank_info = (
            f"{self.tank_type} - {self.tank_name}"
            if self.tank_type and self.tank_name
            else "No tank info"
        )
        created = self.created_at.strftime("%Y-%m-%d") if self.created_at else "unknown"
        return f"Measurement {self.id} - {tank_info} - {self.mm}mm - {created}"

    class Meta:
        verbose_name = "Measurement"
        verbose_name_plural = "Measurements"
        ordering = ["-created_at"]


class TankCategory(Base):  # Avcat Tank, Sludge Tank, etc
    objects = BaseManager()
    id = models.AutoField(primary_key=True)
    tank_category = models.CharField(max_length=255, blank=True)
    manual_name = models.CharField(max_length=100, blank=True)
    fluid = models.ForeignKey(
        "Fluid",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )

    # ✅ New Column: Used to define the display order on the dashboard
    graph_no = models.IntegerField(
        null=True,
        blank=True,
        help_text="Order in which this graph appears (e.g. 1, 2, 3...)",
    )

    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )

    class Meta:
        # Optional: Makes sure they always come out in order when queried
        ordering = ["graph_no", "tank_category"]

    def __str__(self):
        return (
            f"{self.graph_no}. {self.tank_category}"
            if self.graph_no
            else self.tank_category
        )


class TankFluidUnit(Base):
    objects = BaseManager()
    """Units for tank capacity (m³, Litre, MT, KL, Gallon)"""

    id = models.AutoField(primary_key=True)
    fluid_unit = models.CharField(max_length=255)
    date = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.fluid_unit or ""

    class Meta:
        ordering = ["id"]


class FluidType(Base):  # oil, sea water, fresh water, sludge, etc
    objects = BaseManager()
    id = models.AutoField(primary_key=True)
    fluid_type = models.CharField(max_length=255)
    # date = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )

    # fluid_unit = models.ForeignKey(TankFluidUnit, on_delete=models.SET_DEFAULT, default="", null=True, blank=True)
    def __str__(self):
        return self.fluid_type or ""


class Fluid(Base):  # Avcat HFHSD, etc
    objects = BaseManager()
    id = models.AutoField(primary_key=True)
    fluid = models.CharField(max_length=255, blank=True)
    fluid_type = models.ForeignKey(
        FluidType, on_delete=models.CASCADE, related_name="fluids"
    )
    measuring_unit = models.CharField(max_length=255, blank=True)
    # date = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )

    def __str__(self):
        return self.fluid or ""


class TankLocation(Base):
    objects = BaseManager()
    id = models.AutoField(primary_key=True)
    location_name = models.CharField(max_length=255, blank=True)
    # date = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )

    def __str__(self):
        return self.location_name or ""


class TankFuelSounding(Base):
    objects = BaseManager()
    id = models.AutoField(primary_key=True)
    mm = models.FloatField()
    volume = models.FloatField()
    tone = models.FloatField()
    type = models.ForeignKey("TankCategory", on_delete=models.CASCADE)
    date = models.DateTimeField(default=timezone.now)

    def __str__(self):
        # 'serial' field does not exist on this model; use id and safe access to type
        type_name = (
            self.type.tank_category
            if self.type and hasattr(self.type, "tank_category")
            else "Unknown"
        )
        return f"{type_name} - ID {self.id}"


class TankOil(Base):
    objects = BaseManager()
    id = models.AutoField(primary_key=True)
    oil_type = models.CharField(max_length=255)
    date = models.DateTimeField(default=timezone.now)  # auto save current date

    def __str__(self):
        return self.oil_type or ""


class Hierarchyforchart(Base):
    objects = BaseManager()
    node_type = models.CharField(
        max_length=50, default="co"
    )  # co/hod/divisional_officer/division/sailor
    division_name = models.CharField(max_length=255, blank=True)
    user_id = models.IntegerField(null=True, blank=True)
    name = models.CharField(max_length=255)
    rank = models.CharField(max_length=255)
    designation = models.CharField(max_length=255)
    personal_number = models.CharField(max_length=50)
    photo = models.ImageField(upload_to="masters/hierarchy/")
    parent = models.ForeignKey(
        "self",  # ✅ self-reference instead of CustomUser
        blank=True,
        on_delete=models.SET_NULL,
        null=True,
        related_name="children",
    )
    is_commander_officer = models.BooleanField(default=False)
    date = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.name or ""


class TankRecord(Base):
    objects = BaseManager()
    id = models.BigAutoField(primary_key=True)
    tank_category = models.ForeignKey(
        TankCategory,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    location = models.ForeignKey(
        TankLocation,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    oil_type = models.ForeignKey(
        TankOil,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    manual_name = models.CharField(max_length=100, blank=True)
    mm_measurement = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    volume = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reading_time = models.DateTimeField(null=True, blank=True)  # Add this field

    def __str__(self):
        tank_cat = self.tank_category.tank_category if self.tank_category else "Unknown"
        manual = self.manual_name or ""
        return f"{manual} - {tank_cat}"

    class Meta:
        ordering = ["-created_at"]


class FuellingDetails(Base):
    objects = BaseManager()
    fuelling_at = models.CharField(max_length=100, blank=True)
    fuelling_start_date = models.DateField(blank=True, null=True)
    fuelling_start_time = models.TimeField(blank=True, null=True)
    fuelling_stop_date = models.DateField(blank=True, null=True)
    fuelling_stop_time = models.TimeField(blank=True, null=True)
    received_at_station = models.CharField(max_length=255, blank=True)
    received_from_ship = models.CharField(max_length=255, blank=True)
    fluid_in_tank = models.CharField(max_length=100, blank=True)
    received_through = models.CharField(max_length=100, blank=True)
    # tank_category = models.CharField(max_length=255, blank=True, null=True)
    tank_category = models.ForeignKey(
        "TankCategory",
        on_delete=models.CASCADE,
        related_name="tank_category_fuelling_details",
        blank=True,
        null=True,
    )
    fuel_received = models.DecimalField(
        max_digits=10, decimal_places=3, blank=True, null=True
    )
    actual_fuel_received = models.DecimalField(
        max_digits=10, decimal_places=3, blank=True, null=True
    )
    fuelling_rate = models.DecimalField(
        max_digits=10, decimal_places=3, blank=True, null=True
    )
    is_fuelling_completed = models.BooleanField(default=False)
    remarks = models.TextField(blank=True)
    voucher_pdf = models.FileField(
        upload_to="fuelling_vouchers/", blank=True, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    def __str__(self):
        return f"{self.fluid_in_tank} - {self.fuelling_start_date}"


class FluidInTank(Base):
    objects = BaseManager()
    id = models.AutoField(primary_key=True)
    fluid_name = models.CharField(max_length=255)
    tank_category = models.ForeignKey(
        "TankCategory", on_delete=models.CASCADE, related_name="fluids"
    )
    date_added = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.fluid_name} ({self.tank_category.tank_category})"


class TankTypeDetail(Base):
    objects = BaseManager()
    tank_type = models.CharField(max_length=100, blank=True, default="")
    fluid_type = models.ForeignKey(
        "FluidType",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    # oil = models.ForeignKey("TankOil", on_delete=models.SET_DEFAULT, default="", null=True, blank=True)
    location = models.ForeignKey(
        "TankLocation",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    unit = models.ForeignKey(
        "TankFluidUnit",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    # tank = models.OneToOneField("TankCategory", on_delete=models.CASCADE, related_name='detail')
    tank = models.ForeignKey(
        "TankCategory", on_delete=models.CASCADE, related_name="details"
    )
    tank_subtype = models.CharField(max_length=20, default="storage", blank=True)

    # New column added here
    capacity = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
        help_text="Capacity of the tank (usually in Tonnes)",
    )

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        unit_str = self.unit.fluid_unit if self.unit else "N/A"
        return f"{self.tank.manual_name} - {unit_str}"

    class Meta:
        verbose_name = "Tank Type Detail"
        verbose_name_plural = "Tank Type Details"
        ordering = ["tank__tank_category"]


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3 - TANK SOUNDING MASTER (Common reference curve)
# ═══════════════════════════════════════════════════════════════════════════════


class TankSoundingMaster(Base):
    objects = BaseManager()
    tank_category_detail = models.ForeignKey(
        "TankTypeDetail", on_delete=models.CASCADE, related_name="sounding_master"
    )
    mm_level = models.FloatField()  # e.g., 0, 100, 200, 300... 1000
    volume = models.FloatField()  # MAXIMUM CAPACITY at this MM level (in tank's unit)
    percentage_flag = models.IntegerField(
        choices=[(95, "95%"), (100, "100%")], null=True, blank=True
    )  # Mark 95% or 100% capacity levels
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        unique_together = ("tank_category_detail", "mm_level")
        ordering = ["tank_category_detail", "mm_level"]
        verbose_name = "Tank Sounding Master"
        verbose_name_plural = "Tank Sounding Masters"

    def __str__(self):
        unit_str = (
            self.tank_category_detail.unit.fluid_unit
            if self.tank_category_detail.unit
            else "units"
        )
        return f"{self.tank_category_detail.tank.manual_name} – {self.mm_level}mm → {self.volume} {unit_str}"


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3 - TANK SOUNDING DATA (Current readings)
# ═══════════════════════════════════════════════════════════════════════════════


class TankSoundingData(Base):
    objects = BaseManager()
    """
    Stores current sounding readings per tank.
    Each entry is a snapshot of one tank at one moment.

    REMOVED: volume field (was redundant with master table)
    REMOVED: percentage_flag (now in TankSoundingMaster only)
    KEPT: mm_measurement, tonnes (optional)
    """

    tank_category_detail = models.ForeignKey(
        "TankTypeDetail", on_delete=models.CASCADE, related_name="sounding_data"
    )
    mm_measurement = models.FloatField()  # Current MM reading
    tonnes = models.FloatField(null=True, blank=True)  # Optional: weight at current MM
    reading_time = models.DateTimeField()  # When was this reading taken?
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-reading_time"]
        verbose_name = "Tank Sounding Data"
        verbose_name_plural = "Tank Sounding Data"
        indexes = [
            models.Index(fields=["tank_category_detail", "-reading_time"]),
        ]

    def __str__(self):
        tank_name = self.tank_category_detail.tank.manual_name
        return f"{tank_name} – {self.mm_measurement}mm @ {self.reading_time}"


class SoundingDraft(Base):
    objects = BaseManager()
    """
    Table to save draft entries of the Sounding Matrix.
    """

    # Operation ID (Linking to your Master RAS/Operation table)
    # If you have a specific Model for RAS_MO, change IntegerField to a ForeignKey
    ras_monitor_id = models.ForeignKey(
        "FuellingDetails",
        on_delete=models.CASCADE,
        related_name="ras_monitor_sounding_drafts",
    )

    # Specific Tank reference (Linking to TankTypeDetail ID)
    tank = models.ForeignKey(
        "TankTypeDetail", on_delete=models.CASCADE, related_name="sounding_drafts"
    )

    # 1. Initial Tank Sounding (mm) - User Input
    initial_sounding_mm = models.DecimalField(
        max_digits=10, decimal_places=1, null=True, blank=True
    )

    # 2. Start of RAS/Held (Tons) - Calculated/Synced
    start_ras_tons = models.DecimalField(
        max_digits=10, decimal_places=1, null=True, blank=True
    )

    # 3. 95% Limiting Sounding (mm) - Static Snapshot
    limiting_sounding_mm = models.DecimalField(
        max_digits=10, decimal_places=1, null=True, blank=True
    )

    # 4. Enter Sounding During RAS/Fueling (mm) - User Input
    during_sounding_mm = models.DecimalField(
        max_digits=10, decimal_places=1, null=True, blank=True
    )

    # 5. During RAS (Tons) - Calculated
    during_ras_tons = models.DecimalField(
        max_digits=10, decimal_places=1, null=True, blank=True
    )

    # 6. Received Fuel (Tons) - Calculated (During - Start)
    received_fuel_tons = models.DecimalField(
        max_digits=10, decimal_places=1, null=True, blank=True
    )

    # 7. 95% Capacity (Tons) - Static Snapshot
    capacity_tons = models.DecimalField(
        max_digits=10, decimal_places=1, null=True, blank=True
    )

    # 8. Short (Tons) - Calculated (Capacity - Start)
    short_tons = models.DecimalField(
        max_digits=10, decimal_places=1, null=True, blank=True
    )

    # Status tracking
    is_finalized = models.BooleanField(
        default=False, help_text="True if 'Fueling Completed' was clicked"
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Sounding Draft"
        verbose_name_plural = "Sounding Drafts"
        # Ensure we only have one draft per tank per operation
        unique_together = ("ras_monitor_id", "tank")

    def __str__(self):
        return f"Op {self.ras_monitor_id} - Tank: {self.tank.tank_type} (Draft)"
