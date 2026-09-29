from celery import shared_task
from op_maintenance.services import generate_export_file
from swmm.async_jobs import build_export_path, build_media_url

from srar.models import SrarMonthlyHeader
from srar.services import save_srar_report
from srar.utils import build_srar_report_payload


@shared_task(name="srar.tasks.export_report_pdf")
def export_report_pdf_task(header_id):
    header = SrarMonthlyHeader.objects.get(pk=header_id)
    payload = build_srar_report_payload(header)
    filename = f"SRAR_{header.srar_year}_{header.srar_month}.accdb"
    file_path = build_export_path("srar-exports", filename)
    headers = ["section", "record_index", "field_name", "field_value"]
    rows = _payload_to_accdb_rows(payload)
    generate_export_file(
        file_path,
        headers,
        rows,
        export_format="accdb",
        title="SRAR Export",
        table_name="SRARExport",
    )
    return {
        "success": True,
        "status_code": 200,
        "result": {
            "file_path": file_path,
            "download_url": build_media_url(file_path),
            "filename": filename,
        },
    }


def _payload_to_accdb_rows(payload):
    rows = []
    for section, value in payload.items():
        if isinstance(value, list):
            for index, item in enumerate(value, start=1):
                if isinstance(item, dict):
                    for field_name, field_value in item.items():
                        rows.append(
                            [
                                section,
                                index,
                                field_name,
                                _format_accdb_value(field_value),
                            ]
                        )
                else:
                    rows.append([section, index, "value", _format_accdb_value(item)])
        elif isinstance(value, dict):
            for field_name, field_value in value.items():
                rows.append([section, 1, field_name, _format_accdb_value(field_value)])
        else:
            rows.append([section, 1, "value", _format_accdb_value(value)])
    return rows


def _format_accdb_value(value):
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        return str(value)
    return value


@shared_task(name="srar.tasks.save_report")
def save_report_task(payload, user_id):
    return {
        "success": True,
        "status_code": 200,
        "result": save_srar_report(payload),
    }
