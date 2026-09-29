import math

import numpy as np
import pandas as pd
from celery import shared_task

from ems.models import SectionName as Section
from master.models import Department, SubDepartment
from sfd.models import Equipment, EquipmentType, ShipEquipment, Supplier
from sfd.utils import get_this_ship


def _clean_val(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null", ""}:
        return None
    return text


def _to_boolean(value):
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "1.0", "yes", "y", "true"}


@shared_task(name="sfd.tasks.import_sfd_excel")
def import_sfd_excel_task(file_path):
    dataframe = pd.read_excel(file_path)
    dataframe.columns = dataframe.columns.str.strip()
    dataframe = dataframe.replace([np.nan, "nan", "NaN", "NULL", ""], None)

    count_new = 0
    count_update = 0
    for _, row in dataframe.iterrows():
        ship_obj = get_this_ship()
        supplier_name = _clean_val(row.get("SupplierName"))
        supplier_obj = None
        if supplier_name:
            supplier_obj, _ = Supplier.objects.get_or_create(
                SupplierCode=_clean_val(row.get("SupplierCode")),
                defaults={
                    "SupplierName": supplier_name,
                    "Universal_ID_M_Supplier": _clean_val(
                        row.get("Universal_ID_M_Supplier")
                    ),
                },
            )

        eq_type_obj = None
        eq_type_val = _clean_val(row.get("Equipment Type"))
        if eq_type_val:
            eq_type_obj, _ = EquipmentType.objects.get_or_create(
                Universal_ID_Ch_Master_Equipment_Type=_clean_val(
                    row.get("Universal_ID_Ch_Master_Equipment_Type")
                ),
                defaults={"Equipment_Desc": eq_type_val},
            )

        dept_name = _clean_val(row.get("Department"))
        if not dept_name:
            continue
        dept_obj, _ = Department.objects.get_or_create(
            name=dept_name[: Department._meta.get_field("name").max_length]
        )

        sub_dep_obj = None
        sub_dep_name = _clean_val(row.get("SubDepartment"))
        if sub_dep_name:
            target_dept = dept_obj
            if dept_obj.name in {
                "HULL",
                "NBCD",
                "Gunnery",
                "ASW",
                "Communication",
                "ND",
                "Aviation",
                "Hygiene",
            }:
                target_dept = (
                    Department.objects.filter(name="EXECUTIVE").first() or dept_obj
                )
            sub_dep_obj, _ = SubDepartment.objects.get_or_create(
                name=sub_dep_name[: SubDepartment._meta.get_field("name").max_length],
                department_name=target_dept,
            )

        section_obj = None
        section_name = _clean_val(row.get("SectionName"))
        if section_name:
            target_dept = dept_obj
            if dept_obj.name in {
                "HULL",
                "NBCD",
                "Gunnery",
                "ASW",
                "Communication",
                "ND",
                "Aviation",
                "Hygiene",
            }:
                target_dept = (
                    Department.objects.filter(name="EXECUTIVE").first() or dept_obj
                )
            section_obj, _ = Section.objects.get_or_create(
                name=section_name[: Section._meta.get_field("name").max_length],
                department=target_dept,
            )

        maintop = _clean_val(row.get("MaintopNumber"))
        if maintop and "." in maintop:
            maintop = maintop.split(".")[0]

        equipment_obj, _ = Equipment.objects.get_or_create(
            equipment_code=_clean_val(row.get("EquipmentCode")),
            defaults={
                "model": _clean_val(row.get("EquipmentModel")),
                "equipment_class": _clean_val(row.get("EquipmentName")),
                "maintop_number": maintop,
                "universal_id_m_equipment": _clean_val(
                    row.get("Universal_ID_M_Equipment")
                ),
            },
        )

        installation_date = _clean_val(row.get("InstallationDate"))
        if installation_date:
            installation_date = str(installation_date).split(" ")[0]

        _, created = ShipEquipment.objects.update_or_create(
            ship=ship_obj,
            nomenclature=_clean_val(row.get("Nomenclature")),
            defaults={
                "equipment": equipment_obj,
                "department": dept_obj,
                "sub_department_f_key": sub_dep_obj,
                "equipment_type_f_key": eq_type_obj,
                "supplier": supplier_obj,
                "section_f_key": section_obj,
                "installation_date": installation_date,
                "equipment_serial_no": _clean_val(row.get("EquipmentSrNo")),
                "location_on_board": _clean_val(row.get("LocationOnBoard")),
                "installation_remarks": _clean_val(row.get("InstallationRemarks")),
                "is_srar": _to_boolean(row.get("SRARApplicable")),
                "authority_installation": _clean_val(
                    row.get("Authority_Of_Installation")
                ),
                "quantity": _clean_val(row.get("Quantity")) or 1,
                "eq_rhsi": _clean_val(row.get("RHSI") or row.get("rhsi")),
                "t_equipment_ship_detail": _clean_val(
                    row.get("Universal_ID_T_EquipmentShipDetail")
                ),
                "status": "Active",
            },
        )
        if created:
            count_new += 1
        else:
            count_update += 1

    return {
        "success": True,
        "status_code": 200,
        "result": {
            "status": "success",
            "message": f"Finished Excel import. New: {count_new}, Updated: {count_update}",
        },
    }


@shared_task(name="sfd.tasks.generate_report_export")
def generate_report_export_task(job_id, filters=None):
    """Renders a ReportExportJob's file in the background — dispatched by
    ReportExportAPIView.post() right after it creates the (pending) job, so the request/response
    cycle doesn't block on PDF/Excel generation. sfd_reports.report_export does the actual work;
    this task's job is just the job-status bookkeeping around it.
    """
    import os

    from django.conf import settings as django_settings

    from .models import ReportExportJob
    from .report_export import (
        REPORT_TITLES,
        render_excel,
        render_pdf,
        fetch_report_rows,
    )

    try:
        job = ReportExportJob.objects.get(id=job_id)
    except ReportExportJob.DoesNotExist:
        return

    job.status = ReportExportJob.Status.RUNNING
    job.save(update_fields=["status", "updated_at"])

    try:
        rows = fetch_report_rows(job.report_key, filters or {})
        title = REPORT_TITLES.get(job.report_key, job.report_key)

        if job.export_format == ReportExportJob.ExportFormat.PDF:
            file_bytes = render_pdf(job.report_key, title, rows)
            extension = "pdf"
        else:
            file_bytes = render_excel(job.report_key, title, rows)
            extension = "xlsx"

        export_dir = os.path.join(django_settings.MEDIA_ROOT, "report_exports")
        os.makedirs(export_dir, exist_ok=True)
        # Forward slashes even on Windows dev boxes — this gets persisted to the DB and later
        # re-joined with MEDIA_ROOT by ReportExportJobDownloadAPIView, possibly on a different
        # (Linux/Docker) host than the one that generated it; os.path.join's native "\" separator
        # would come back as a literal backslash in the filename there instead of a path split.
        relative_path = f"report_exports/{job.id}.{extension}"
        with open(
            os.path.join(
                django_settings.MEDIA_ROOT, "report_exports", f"{job.id}.{extension}"
            ),
            "wb",
        ) as f:
            f.write(file_bytes)

        job.file_path = relative_path
        job.status = ReportExportJob.Status.SUCCESS
        job.error = None
        job.save(update_fields=["file_path", "status", "error", "updated_at"])
    except Exception as exc:
        job.status = ReportExportJob.Status.FAILED
        job.error = str(exc)
        job.save(update_fields=["status", "error", "updated_at"])
