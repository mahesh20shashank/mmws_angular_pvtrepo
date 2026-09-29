import pandas as pd
from celery import shared_task
from django.utils import timezone

from tank.models import TankSoundingData, TankSoundingMaster, TankTypeDetail


@shared_task(name="tank.tasks.upload_sounding_master")
def upload_sounding_master_task(file_path, tank_detail_id):
    tank_detail = TankTypeDetail.objects.get(id=tank_detail_id)
    if file_path.endswith(".csv"):
        dataframe = pd.read_csv(file_path)
    else:
        dataframe = pd.read_excel(file_path)
    dataframe.columns = dataframe.columns.str.strip().str.lower()
    required = ["mm", "volume"]
    missing = [column for column in required if column not in dataframe.columns]
    if missing:
        return {
            "success": False,
            "status_code": 400,
            "result": {
                "status": "error",
                "message": f"Missing columns: {', '.join(missing)}",
            },
        }
    if dataframe.empty:
        return {
            "success": False,
            "status_code": 400,
            "result": {"status": "error", "message": "File is empty"},
        }

    TankSoundingMaster.objects.filter(tank_category_detail=tank_detail).delete()
    created_records = []
    warnings = []
    for index, row in dataframe.iterrows():
        try:
            mm_val = row.get("mm")
            vol_val = row.get("volume")
            pct_val = (
                row.get("percentage_flag")
                if "percentage_flag" in dataframe.columns
                else None
            )
            if pd.isna(mm_val) or str(mm_val).strip() == "":
                warnings.append(f"Row {index + 2}: MM empty - skipped")
                continue
            if pd.isna(vol_val) or str(vol_val).strip() == "":
                warnings.append(f"Row {index + 2}: Volume empty - skipped")
                continue
            percentage_flag = None
            if pd.notna(pct_val) and str(pct_val).strip():
                pct_int = int(float(pct_val))
                if pct_int in [95, 100]:
                    percentage_flag = pct_int
            master = TankSoundingMaster.objects.create(
                tank_category_detail=tank_detail,
                mm_level=float(mm_val),
                volume=float(vol_val),
                percentage_flag=percentage_flag,
            )
            created_records.append(master.id)
        except Exception as exc:
            warnings.append(f"Row {index + 2}: {exc}")

    if not created_records:
        return {
            "success": False,
            "status_code": 400,
            "result": {
                "status": "error",
                "message": "No records created",
                "warnings": warnings,
            },
        }
    result = {
        "status": "success",
        "tank_detail_id": tank_detail_id,
        "tank_name": tank_detail.tank.manual_name,
        "created_records": len(created_records),
    }
    if warnings:
        result["warnings"] = warnings
    return {"success": True, "status_code": 200, "result": result}


@shared_task(name="tank.tasks.upload_sounding_data")
def upload_sounding_data_task(file_path):
    if file_path.endswith(".csv"):
        dataframe = pd.read_csv(file_path)
    else:
        dataframe = pd.read_excel(file_path)
    dataframe.columns = dataframe.columns.str.strip().str.lower()
    required = ["tank_name", "mm_measurement"]
    missing = [column for column in required if column not in dataframe.columns]
    if missing:
        return {
            "success": False,
            "status_code": 400,
            "result": {
                "status": "error",
                "message": f"Missing columns: {', '.join(missing)}",
            },
        }
    if dataframe.empty:
        return {
            "success": False,
            "status_code": 400,
            "result": {"status": "error", "message": "File is empty"},
        }

    created_records = []
    warnings = []
    for index, row in dataframe.iterrows():
        try:
            tank_name = str(row.get("tank_name", "")).strip()
            mm_val = row.get("mm_measurement")
            if not tank_name:
                warnings.append(f"Row {index + 2}: tank_name empty - skipped")
                continue
            if pd.isna(mm_val):
                warnings.append(f"Row {index + 2}: mm_measurement empty - skipped")
                continue
            tank_detail = (
                TankTypeDetail.objects.select_related("tank")
                .filter(tank__manual_name=tank_name)
                .first()
            )
            if not tank_detail:
                warnings.append(f"Row {index + 2}: Tank '{tank_name}' not found")
                continue
            tonnes = None
            if "tonnes" in dataframe.columns and pd.notna(row.get("tonnes")):
                try:
                    tonnes = float(row["tonnes"])
                except (ValueError, TypeError):
                    tonnes = None
            reading_time = timezone.now()
            if "reading_time" in dataframe.columns and pd.notna(
                row.get("reading_time")
            ):
                try:
                    import dateutil.parser

                    reading_time = dateutil.parser.parse(str(row["reading_time"]))
                except Exception:
                    reading_time = timezone.now()
            sounding = TankSoundingData.objects.create(
                tank_category_detail=tank_detail,
                mm_measurement=float(mm_val),
                tonnes=tonnes,
                reading_time=reading_time,
            )
            created_records.append(sounding.id)
        except Exception as exc:
            warnings.append(f"Row {index + 2}: {exc}")

    if not created_records:
        return {
            "success": False,
            "status_code": 400,
            "result": {
                "status": "error",
                "message": "No records created",
                "warnings": warnings,
            },
        }
    result = {"status": "success", "created_records": len(created_records)}
    if warnings:
        result["warnings"] = warnings
    return {"success": True, "status_code": 200, "result": result}
