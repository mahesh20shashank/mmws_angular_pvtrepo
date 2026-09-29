from django.db import models
from master.models import SubDepartment
from sfd.models import ShipEquipment
from master.models import Base


class DLTracker(Base):
    defect_no = models.CharField(max_length=100, blank=True, null=True)
    sub_dept_id = models.ForeignKey(
        SubDepartment, on_delete=models.SET_NULL, null=True, blank=True
    )  # ← ADDED
    ship_equip = models.ForeignKey(
        ShipEquipment, on_delete=models.SET_NULL, null=True, blank=True
    )  # ← ADDED
    dl_type = models.CharField(max_length=255, blank=True, null=True)
    equip_name = models.CharField(max_length=255, blank=True, null=True)
    dart_no = models.CharField(max_length=255, blank=True, null=True)
    defect_description = models.CharField(max_length=1000, blank=True, null=True)
    ship_remarks = models.CharField(max_length=1000, blank=True, null=True)
    yard_remarks = models.CharField(
        max_length=1000, blank=True, null=True
    )  # {from Navyojana} for DL1, DL2, DL3
    final_prm = models.CharField(
        max_length=255, blank=True, null=True
    )  # {from Navyojana} for DL1, DL2, DL3
    c_no = models.CharField(
        max_length=255, blank=True, null=True
    )  # {from Navyojana} for DL1, DL2, DL3
    remarks_status = models.CharField(
        max_length=255, blank=True, null=True
    )  # {from Navyojana} for DL1, DL2, DL3
    view_wi = models.CharField(max_length=255, blank=True, null=True)
    interact = models.CharField(max_length=255, blank=True, null=True)
    wi_generation_status = models.CharField(
        max_length=10, blank=True, null=True
    )  # {by default its No will come from Navyojana} for DL1, DL2, DL3
    qc_clearance = models.CharField(
        max_length=10, blank=True, null=True
    )  # {will come from Navyojana} for DL1, DL2, DL3
    wi_closing_status = models.CharField(
        max_length=10, blank=True, null=True
    )  # {will come from Navyojana} for DL1, DL2, DL3
    wi_generated_by_yard = models.CharField(
        max_length=10, blank=True, null=True
    )  # SS fills manually
    weekly_status = models.CharField(
        max_length=255, blank=True, null=True
    )  # {this we ll show in Navyojana for update of yard} for DL1, DL2, DL3
    # action = models.CharField(max_length=255, blank=True, null=True) #{show button Close DL} for DL1, DL2, DL3
    defect_key = models.CharField(max_length=255, blank=True, null=True)
    equip_location = models.CharField(max_length=255, blank=True, null=True)
    equip_sys = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(
        max_length=50, blank=True, null=True, default="Not yet started"
    )
    dl_importance = models.CharField(
        max_length=50, blank=True, null=True, default="Normal DL"
    )
    current_status_updated_on = models.DateTimeField(null=True, blank=True)
    critical = models.BooleanField(default=False, null=True, blank=True)
    is_closed = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.defect_no} - {self.dl_type}"

    class Meta:
        ordering = ["-id"]


class DLClose(Base):
    dl_tracker = models.OneToOneField(
        DLTracker, on_delete=models.CASCADE, related_name="dl_close"
    )
    er_date_by_yard = models.DateField(null=True, blank=True)
    start_work_by_yard = models.DateField(null=True, blank=True)
    complete_work_by_yard = models.DateField(null=True, blank=True)
    dl_work = models.IntegerField(null=True, blank=True)  # auto calculated days

    def save(self, *args, **kwargs):
        # Auto calculate days between start and complete
        if self.start_work_by_yard and self.complete_work_by_yard:
            self.dl_work = (self.complete_work_by_yard - self.start_work_by_yard).days
        else:
            self.dl_work = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"DL Close - {self.dl_tracker.id}"
