import csv
import os
import subprocess
from collections import defaultdict
from datetime import date, timedelta

from django.utils import timezone
from openpyxl import Workbook

from .models import CompleteDefectDart, InitiateDart, InitiateRADL

DART_HISTORY_DATE_FORMAT = "%d %b %Y"


class DartDashboardService:
    PERIOD_DAYS = {
        "6M": 180,
        "1Y": 365,
        "2Y": 730,
    }

    ACTIVITY_DAYS = {
        "today": 1,
        "week": 7,
        "month": 30,
        "quarter": 90,
        "year": 365,
    }

    @classmethod
    def get_dashboard(
        cls,
        period="ALL",
        department=None,
        activity_period="month",
    ):
        darts = InitiateDart.objects.select_related(
            "symptom_code",
            "severity_code",
            "remark_code",
            "require_assistance_for_code",
            "department_id",
            "equipment_ship",
            "equipment_ems",
        )

        period_start = cls._get_period_start(period)

        if period_start:
            darts = darts.filter(
                dart_date__gte=period_start,
            )

        if department:
            darts = darts.filter(
                department_id__isnull=False,
            )
            darts = [dart for dart in darts if cls._department_name(dart) == department]

        if isinstance(darts, list):
            dashboard_darts = darts
            open_darts = [dart for dart in darts if not dart.is_closed]
        else:
            dashboard_darts = darts
            open_darts = darts.open()

        return {
            "cards": cls._cards(dashboard_darts, open_darts),
            "alerts": cls._alerts(open_darts),
            "quick_actions": cls._quick_actions(),
            "open_darts_by_department": cls._open_darts_by_department(open_darts),
            "open_darts_by_severity": cls._open_darts_by_severity(open_darts),
            "dart_lifecycle_trend": cls._lifecycle_trend(dashboard_darts),
            "dart_load_by_department": cls._dart_load_by_department(open_darts),
            "recent_activity": cls._recent_activity(
                activity_period=activity_period,
                department=department,
            ),
        }

    # ------------------------------------------------------------------
    # Cards
    # ------------------------------------------------------------------

    @classmethod
    def _cards(cls, darts, open_darts):
        severity_counts = defaultdict(int)

        for dart in open_darts:
            severity = cls._severity_name(dart)

            if severity:
                severity_counts[cls._normalize(severity)] += 1

        opdef_count = sum(
            count
            for severity, count in severity_counts.items()
            if severity
            in {
                "opdef",
                "opdef (sta)",
            }
        )

        guarantee_alerts = sum(1 for dart in open_darts if dart.is_guarantee_defect)

        active_ra_count = (
            InitiateRADL.objects.filter(
                # is_active=True,
                active=True,
            )
            .exclude(
                status="DELETED",
            )
            .count()
        )

        return {
            "total_active_defects": {
                "value": len(open_darts),
                "available": True,
            },
            "opdef_opdef_sta": {
                "value": opdef_count,
                "available": True,
            },
            "ra_with_fmu_yard": {
                "value": active_ra_count,
                "available": True,
                "note": (
                    "Total active RA/DL records. "
                    "FMU/Yard split requires the FMU business field."
                ),
            },
            "guarantee_exposure_alerts": {
                "value": guarantee_alerts,
                "available": True,
            },
            "certificates_issued": {
                "value": None,
                "available": False,
                "note": (
                    "CertificateTypeMaster contains certificate types, "
                    "not issued certificates."
                ),
            },
        }

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------

    @classmethod
    def _alerts(cls, open_darts):
        darts = list(open_darts)

        darts.sort(
            key=lambda dart: (
                dart.dart_date or date.min,
                dart.id,
            ),
            reverse=True,
        )

        alerts = []

        for dart in darts[:10]:
            severity = cls._severity_name(dart)

            if dart.is_guarantee_defect:
                alert_type = "Guarantee"
            elif severity and "opdef" in severity.lower():
                alert_type = "DART"
            else:
                alert_type = "DART"

            alerts.append(
                {
                    "id": dart.id,
                    "dart_number": dart.dart_number,
                    "title": (f"{dart.dart_number or 'DART'} raised"),
                    "equipment": cls._equipment_name(dart),
                    "severity": severity,
                    "department": cls._department_name(dart),
                    "type": alert_type,
                    "status": "In Progress",
                    "date": dart.dart_date,
                }
            )

        return alerts

    # ------------------------------------------------------------------
    # Quick actions
    # ------------------------------------------------------------------

    @staticmethod
    def _quick_actions():
        return [
            {
                "key": "add_defect",
                "label": "Add Defect / DART",
                "action": "ADD_DEFECT",
            },
            {
                "key": "approval_ra_status",
                "label": "View Approval / RA Status",
                "action": "VIEW_RA_STATUS",
            },
            {
                "key": "guarantee",
                "label": "Add / Extend Guarantee",
                "action": "ADD_GUARANTEE",
            },
        ]

    # ------------------------------------------------------------------
    # Open DARTs by department
    # ------------------------------------------------------------------

    @classmethod
    def _open_darts_by_department(cls, darts):
        counts = defaultdict(int)

        for dart in darts:
            department = cls._department_name(dart)

            if department:
                counts[department] += 1

        return [
            {
                "department": department,
                "count": count,
            }
            for department, count in sorted(
                counts.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ]

    # ------------------------------------------------------------------
    # Open DARTs by severity
    # ------------------------------------------------------------------

    @classmethod
    def _open_darts_by_severity(cls, darts):
        counts = defaultdict(int)

        for dart in darts:
            severity = cls._severity_name(dart)

            if severity:
                counts[severity] += 1

        return [
            {
                "severity": severity,
                "count": count,
            }
            for severity, count in sorted(
                counts.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ]

    # ------------------------------------------------------------------
    # DART lifecycle trend
    # ------------------------------------------------------------------

    @classmethod
    def _lifecycle_trend(cls, darts):
        today = timezone.now().date()

        months = {}

        for offset in range(5, -1, -1):
            month_date = cls._subtract_months(today, offset)

            key = month_date.strftime("%Y-%m")

            months[key] = {
                "month": month_date.strftime("%b"),
                "raised": 0,
                "closed": 0,
            }

        for dart in darts:
            # Raised: count by dart_date (creation date)
            if dart.dart_date:
                key = dart.dart_date.strftime("%Y-%m")
                if key in months:
                    months[key]["raised"] += 1

            # Closed: count by rectification_date (closing date)
            if dart.is_closed and dart.rectification_date:
                key = dart.rectification_date.strftime("%Y-%m")
                if key in months:
                    months[key]["closed"] += 1

        return list(months.values())

    # ------------------------------------------------------------------
    # DART load
    # ------------------------------------------------------------------

    @classmethod
    def _dart_load_by_department(cls, darts):
        return cls._open_darts_by_department(darts)

    # ------------------------------------------------------------------
    # Recent activity
    # ------------------------------------------------------------------

    @classmethod
    def _recent_activity(
        cls,
        activity_period,
        department=None,
    ):
        days = cls.ACTIVITY_DAYS.get(
            activity_period.lower(),
            cls.ACTIVITY_DAYS["month"],
        )

        start_date = timezone.now().date() - timedelta(days=days)

        queryset = InitiateDart.objects.select_related(
            "severity_code",
            "department_id",
            "equipment_ship",
            "equipment_ems",
        ).filter(
            dart_date__gte=start_date,
        )

        queryset = queryset.order_by(
            "-dart_date",
            "-id",
        )

        result = []

        for dart in queryset:
            dart_department = cls._department_name(dart)

            if department and dart_department != department:
                continue

            result.append(
                {
                    "id": dart.id,
                    "date": dart.dart_date,
                    "equipment": cls._equipment_name(dart),
                    "action": ("Closed" if dart.is_closed else "Raised"),
                    "department": dart_department,
                    "reason": cls._severity_name(dart),
                    "status": ("Verified" if dart.is_closed else "In Progress"),
                }
            )

            if len(result) >= 50:
                break

        return result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _severity_name(dart):
        if not dart.severity_code:
            return None

        return str(dart.severity_code)

    @staticmethod
    def _department_name(dart):
        if not dart.department_id:
            return None

        return str(dart.department_id)

    @staticmethod
    def _equipment_name(dart):
        if dart.equipment_ems:
            return str(dart.equipment_ems)

        if dart.equipment_ship:
            return str(dart.equipment_ship)

        return dart.defective_component

    @staticmethod
    def _normalize(value):
        return " ".join(value.lower().split())

    @classmethod
    def _get_period_start(cls, period):
        period = period.upper()

        if period == "ALL":
            return None

        days = cls.PERIOD_DAYS.get(period)

        if not days:
            return None

        return timezone.now().date() - timedelta(days=days)

    @staticmethod
    def _subtract_months(value, months):
        month = value.month - months
        year = value.year

        while month <= 0:
            month += 12
            year -= 1

        return value.replace(
            year=year,
            month=month,
            day=1,
        )


def get_pending_defects_for_export():
    return (
        InitiateDart.objects.filter(is_closed=False, is_ra_initiate=False)
        .exclude(defective_discriptions__isnull=True)
        .exclude(defective_discriptions="")
        .select_related("equipment_ship", "equipment_ship__equipment", "severity_code")
        .order_by("id")
    )


def build_pending_defect_export_rows():
    rows = []
    for index, defect in enumerate(get_pending_defects_for_export(), start=1):
        equipment_ship = defect.equipment_ship
        equipment = equipment_ship.equipment if equipment_ship else None
        rows.append(
            [
                index,
                defect.dart_number or "",
                (defect.dart_date.strftime("%d %b %Y") if defect.dart_date else ""),
                equipment.equipment_class if equipment else "",
                equipment_ship.nomenclature if equipment_ship else "",
                defect.defective_component or "",
                defect.defective_discriptions or "",
                defect.severity_code.severity_name if defect.severity_code else "",
                defect.dart_occasion or defect.maintenance_period or "",
            ]
        )
    return rows


def get_closed_dart_history_queryset():
    return (
        InitiateDart.objects.filter(is_closed=True)
        .select_related(
            "symptom_code",
            "severity_code",
            "remark_code",
            "department_id",
            "equipment_ship",
            "equipment_ship__equipment",
            "equipment_ship__sub_department_f_key",
            "equipment_ship__department",
        )
        .prefetch_related("ra_dl_entries")
        .order_by("-id")
    )


def get_latest_radl_key(dart, dl_types):
    dl_types = {dl_types} if isinstance(dl_types, str) else set(dl_types)
    entries = getattr(dart, "_prefetched_objects_cache", {}).get("ra_dl_entries")
    if entries is None:
        latest_entry = (
            dart.ra_dl_entries.filter(dl_type__in=dl_types).order_by("-id").first()
        )
    else:
        matching_entries = [entry for entry in entries if entry.dl_type in dl_types]
        latest_entry = max(matching_entries, key=lambda entry: entry.id, default=None)
    return (
        (latest_entry.dl_key or latest_entry.dl_no or latest_entry.ra_grup_id)
        if latest_entry
        else "NA"
    )


def build_dart_history_row(dart, maintenance_key, maintenance_default=""):
    equipment_ship = dart.equipment_ship
    equipment = equipment_ship.equipment if equipment_ship else None
    sub_department = (
        getattr(equipment_ship, "sub_department_f_key", None)
        if equipment_ship
        else None
    )
    department = getattr(equipment_ship, "department", None) if equipment_ship else None
    complete_dart = CompleteDefectDart.objects.filter(dart_details=dart).first()

    return {
        "dartNo": dart.dart_number or "",
        "cmmsSyncStatus": getattr(dart, "cmms_sync_status", False),
        "opraNo": get_latest_radl_key(dart, "RA"),
        "raRaised": dart.is_ra_initiate or False,
        "dlNo": get_latest_radl_key(dart, {"DL-II", "DL-III"}),
        "dlRaised": getattr(dart, "is_dl_initiate", False),
        "equipmentName": equipment.equipment_class if equipment else "",
        "equipmentNomenclature": equipment_ship.nomenclature if equipment_ship else "",
        "defectDescription": dart.defective_discriptions or "",
        "subDepartment": sub_department.name if sub_department else "",
        "department": department.name if department else "",
        "symptomCode": (
            dart.symptom_code.symptom_code
            if dart.symptom_code and getattr(dart.symptom_code, "symptom_code", None)
            else ""
        ),
        "severityCode": (
            dart.severity_code.severity_name
            if dart.severity_code and getattr(dart.severity_code, "severity_name", None)
            else ""
        ),
        "closureDate": (
            complete_dart.rectified_date.strftime(DART_HISTORY_DATE_FORMAT)
            if complete_dart and getattr(complete_dart, "rectified_date", None)
            else ""
        ),
        "repairAgency": (
            getattr(complete_dart.repair_agency_code, "repair_agency_name", None)
            or getattr(complete_dart.repair_agency_code, "repair_agency_code", None)
            or (
                str(complete_dart.repair_agency_code)
                if complete_dart.repair_agency_code
                else ""
            )
            if complete_dart and getattr(complete_dart, "repair_agency_code", None)
            else ""
        ),
        "diagnosisCode": (
            complete_dart.diagnostic_code.diagnostic_name
            if complete_dart
            and getattr(complete_dart, "diagnostic_code", None)
            and getattr(complete_dart.diagnostic_code, "diagnostic_name", None)
            else ""
        ),
        "daysDelayed": (
            complete_dart.days_delay
            if complete_dart and getattr(complete_dart, "days_delay", None)
            else ""
        ),
        "delayReason": (
            complete_dart.other_reasons
            if complete_dart and getattr(complete_dart, "other_reasons", None)
            else ""
        ),
        "lessonLearnt": (
            complete_dart.lesson_learnt
            if complete_dart and getattr(complete_dart, "lesson_learnt", None)
            else ""
        ),
        "dartOccasion": dart.dart_occasion or "",
        "defectDate": (
            dart.dart_date.strftime(DART_HISTORY_DATE_FORMAT) if dart.dart_date else ""
        ),
        "shipRemarks": dart.remark_code.description if dart.remark_code else "",
        "id": dart.id,
        maintenance_key: dart.maintenance_period or maintenance_default,
        "refitType": dart.maintenance_period or "",
    }


def build_simple_pdf(title, lines):
    escaped_lines = [
        str(line).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        for line in [title, "", *lines]
    ]
    text_commands = ["BT", "/F1 12 Tf", "50 790 Td"]
    for index, line in enumerate(escaped_lines):
        if index:
            text_commands.append("0 -18 Td")
        text_commands.append(f"({line}) Tj")
    text_commands.append("ET")
    stream = "\n".join(text_commands).encode("utf-8")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length "
        + str(len(stream)).encode("ascii")
        + b" >>\nstream\n"
        + stream
        + b"\nendstream",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref_start = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF"
        ).encode("ascii")
    )
    return bytes(pdf)


def ensure_empty_accdb_template():
    """Ensure base empty_template.accdb exists in templates/ directory."""
    template_dir = os.path.join(os.path.dirname(__file__), "templates")
    template_path = os.path.abspath(os.path.join(template_dir, "empty_template.accdb"))
    if not os.path.exists(template_path):
        os.makedirs(template_dir, exist_ok=True)
        # 1. Try win32com if available in python
        try:
            import win32com.client

            cat = win32com.client.Dispatch("ADOX.Catalog")
            conn_str = f"Provider=Microsoft.ACE.OLEDB.12.0;Data Source={template_path};"
            cat.Create(conn_str)
            return template_path
        except Exception:
            pass

        # 2. Try PowerShell ADOX COM (Built-in Windows COM)
        try:
            ps_path = template_path.replace("\\", "\\\\")
            ps_script = f"""
$path = "{ps_path}"
$providers = @("Microsoft.ACE.OLEDB.12.0", "Microsoft.ACE.OLEDB.16.0", "Microsoft.Jet.OLEDB.4.0")
foreach ($p in $providers) {{
    try {{
        $cat = New-Object -ComObject ADOX.Catalog
        $connStr = "Provider=$p;Data Source=$path;"
        $cat.Create($connStr)
        Write-Output "SUCCESS"
        break
    }} catch {{
        if (Test-Path $path) {{ Remove-Item $path -ErrorAction SilentlyContinue }}
    }}
}}
"""
            for ps_exe in [
                r"C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe",
                "powershell.exe",
            ]:
                try:
                    res = subprocess.run(
                        [
                            ps_exe,
                            "-NoProfile",
                            "-ExecutionPolicy",
                            "Bypass",
                            "-Command",
                            ps_script,
                        ],
                        capture_output=True,
                        text=True,
                        timeout=15,
                    )
                    if "SUCCESS" in res.stdout and os.path.exists(template_path):
                        return template_path
                except Exception:
                    continue
        except Exception:
            pass

    return template_path


def _generate_accdb_via_jackcess(abs_path, tables_to_process):
    """Write real tables/rows into a fresh .accdb using Jackcess via JPype.

    Cross-platform implementation. No ODBC/ACE driver required.
    Raises an explicit error when the Jackcess bridge cannot be used.
    """
    import shutil

    from swmm.jvm_bridge import (
        get_jackcess,
        AccdbBridgeUnavailable,
    )

    # ---------------------------------------------------------------
    # Load Jackcess classes through the shared JVM bridge
    # ---------------------------------------------------------------
    try:
        classes = get_jackcess()
    except AccdbBridgeUnavailable as exc:
        raise RuntimeError(f"Jackcess bridge unavailable: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(
            f"Failed to initialize Jackcess bridge: {type(exc).__name__}: {exc}"
        ) from exc

    DatabaseBuilder = classes["DatabaseBuilder"]
    TableBuilder = classes["TableBuilder"]
    ColumnBuilder = classes["ColumnBuilder"]
    DataType = classes["DataType"]
    File = classes["File"]

    # ---------------------------------------------------------------
    # Get ACCDB template
    # ---------------------------------------------------------------
    try:
        template_path = ensure_empty_accdb_template()
    except Exception as exc:
        raise RuntimeError(
            f"Failed to create/find ACCDB template: {type(exc).__name__}: {exc}"
        ) from exc

    if not os.path.exists(template_path):
        raise RuntimeError(f"ACCDB template does not exist: {template_path}")

    # ---------------------------------------------------------------
    # Copy template
    # ---------------------------------------------------------------
    try:
        shutil.copyfile(template_path, abs_path)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to copy ACCDB template to '{abs_path}': "
            f"{type(exc).__name__}: {exc}"
        ) from exc

    # ---------------------------------------------------------------
    # Open database
    # ---------------------------------------------------------------
    try:
        db = DatabaseBuilder(File(abs_path)).open()
    except Exception as exc:
        raise RuntimeError(
            f"Jackcess could not open ACCDB '{abs_path}': {type(exc).__name__}: {exc}"
        ) from exc

    try:
        # -----------------------------------------------------------
        # Create tables
        # -----------------------------------------------------------
        for tbl in tables_to_process:
            t_name = tbl["name"]
            t_headers = tbl["headers"]
            t_rows = tbl.get("rows", [])

            clean_headers = [
                str(h)
                .replace("[", "")
                .replace("]", "")
                .replace("'", "")
                .replace(" ", "_")
                or f"col_{i}"
                for i, h in enumerate(t_headers)
            ]

            try:
                # Jackcess 3.x does NOT have db.newTable().
                table_builder = TableBuilder(t_name)

                for header in clean_headers:
                    column_builder = ColumnBuilder(
                        header,
                        DataType.TEXT,
                    )
                    table_builder.addColumn(column_builder)

                table = table_builder.toTable(db)

            except Exception as exc:
                raise RuntimeError(
                    f"Jackcess failed creating table '{t_name}': "
                    f"{type(exc).__name__}: {exc}"
                ) from exc

            # -------------------------------------------------------
            # Insert rows
            # -------------------------------------------------------
            for row_index, row in enumerate(t_rows, start=1):
                try:
                    values = ["" if v is None else str(v) for v in row]

                    table.addRow(values)

                except Exception as exc:
                    raise RuntimeError(
                        f"Jackcess failed inserting row {row_index} "
                        f"into table '{t_name}': "
                        f"{type(exc).__name__}: {exc}"
                    ) from exc

    finally:
        try:
            db.close()
        except Exception:
            pass

    # ---------------------------------------------------------------
    # Verify output
    # ---------------------------------------------------------------
    if not os.path.exists(abs_path):
        raise RuntimeError(
            f"Jackcess completed but ACCDB file was not created: {abs_path}"
        )

    file_size = os.path.getsize(abs_path)

    if file_size <= 0:
        raise RuntimeError(
            f"Jackcess completed but generated an empty ACCDB file: {abs_path}"
        )

    return True


def generate_accdb_file(
    filepath, headers=None, rows=None, table_name="ExportData", tables=None
):
    """
    Cross-platform ACCDB exporter.

    Tries:
      1. win32com / ADOX
      2. PowerShell / ADOX
      3. JPype / Jackcess

    No empty ACCDB fallback.
    Raises RuntimeError with the actual errors when all methods fail.
    """
    import os
    import subprocess

    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    abs_path = os.path.abspath(filepath)

    if os.path.exists(abs_path):
        try:
            os.remove(abs_path)
        except Exception as exc:
            raise RuntimeError(
                f"Could not remove existing ACCDB file '{abs_path}': {exc}"
            ) from exc

    if tables:
        tables_to_process = tables
    else:
        tables_to_process = [
            {
                "name": table_name,
                "headers": headers or [],
                "rows": rows or [],
            }
        ]

    errors = []

    # ------------------------------------------------------------------
    # 1. Try win32com OLEDB / ADOX
    # ------------------------------------------------------------------
    try:
        import win32com.client

        for provider in [
            "Microsoft.ACE.OLEDB.12.0",
            "Microsoft.ACE.OLEDB.16.0",
            "Microsoft.Jet.OLEDB.4.0",
        ]:
            try:
                cat = win32com.client.Dispatch("ADOX.Catalog")

                conn_str = f"Provider={provider};Data Source={abs_path};"
                cat.Create(conn_str)

                conn = win32com.client.Dispatch("ADODB.Connection")
                conn.Open(conn_str)

                try:
                    for tbl in tables_to_process:
                        t_name = tbl["name"]
                        t_headers = tbl["headers"]
                        t_rows = tbl.get("rows", [])

                        clean_headers = [
                            str(h)
                            .replace("[", "")
                            .replace("]", "")
                            .replace("'", "")
                            .replace(" ", "_")
                            or f"col_{i}"
                            for i, h in enumerate(t_headers)
                        ]

                        col_defs = ", ".join(
                            [f"[{h}] TEXT(255)" for h in clean_headers]
                        )

                        conn.Execute(f"CREATE TABLE [{t_name}] ({col_defs})")

                        for r in t_rows:
                            vals = [
                                f"'{str(v).replace(chr(39), chr(39) * 2)}'"
                                if v is not None
                                else "''"
                                for v in r
                            ]

                            conn.Execute(
                                f"INSERT INTO [{t_name}] VALUES ({', '.join(vals)})"
                            )
                finally:
                    conn.Close()

                if os.path.exists(abs_path) and os.path.getsize(abs_path) > 0:
                    return abs_path

                raise RuntimeError(
                    f"Provider {provider} completed but produced an empty file."
                )

            except Exception as exc:
                errors.append(
                    f"win32com provider '{provider}': {type(exc).__name__}: {exc}"
                )

                if os.path.exists(abs_path):
                    try:
                        os.remove(abs_path)
                    except Exception:
                        pass

    except Exception as exc:
        errors.append(f"win32com initialization: {type(exc).__name__}: {exc}")

    # ------------------------------------------------------------------
    # 2. Try PowerShell ADOX Bridge
    # ------------------------------------------------------------------
    try:
        ps_commands = []

        for tbl in tables_to_process:
            t_name = tbl["name"]
            t_headers = tbl["headers"]
            t_rows = tbl.get("rows", [])

            clean_headers = [
                str(h)
                .replace("[", "")
                .replace("]", "")
                .replace("'", "")
                .replace(" ", "_")
                or f"col_{i}"
                for i, h in enumerate(t_headers)
            ]

            col_defs = ", ".join([f"[{h}] TEXT(255)" for h in clean_headers])

            ps_commands.append(f"CREATE TABLE [{t_name}] ({col_defs})")

            for r in t_rows:
                clean_vals = [
                    f"'{str(v).replace(chr(39), chr(39) * 2)}'"
                    if v is not None
                    else "''"
                    for v in r
                ]

                ps_commands.append(
                    f"INSERT INTO [{t_name}] VALUES ({', '.join(clean_vals)})"
                )

        ps_escaped_path = abs_path.replace("\\", "\\\\")

        ps_script = f"""
$ErrorActionPreference = "Stop"

$path = "{ps_escaped_path}"
$providers = @(
    "Microsoft.ACE.OLEDB.12.0",
    "Microsoft.ACE.OLEDB.16.0",
    "Microsoft.Jet.OLEDB.4.0"
)

$created = $false
$lastError = ""

foreach ($p in $providers) {{
    try {{
        $cat = New-Object -ComObject ADOX.Catalog
        $connStr = "Provider=$p;Data Source=$path;"

        $cat.Create($connStr)

        $conn = New-Object -ComObject ADODB.Connection
        $conn.Open($connStr)

        $created = $true
        break
    }}
    catch {{
        $lastError = $_.Exception.ToString()

        if (Test-Path $path) {{
            Remove-Item $path -ErrorAction SilentlyContinue
        }}
    }}
}}

if (-not $created) {{
    Write-Error "Could not create ACCDB. Last provider error: $lastError"
    exit 1
}}

try {{
"""

        for cmd in ps_commands:
            escaped_cmd = cmd.replace('"', '`"')
            ps_script += f'    $conn.Execute("{escaped_cmd}")\n'

        ps_script += """
    $conn.Close()

    if ((Test-Path $path) -and ((Get-Item $path).Length -gt 0)) {
        Write-Output "SUCCESS"
        exit 0
    }

    Write-Error "ACCDB file was not created or is empty."
    exit 1
}
catch {
    Write-Error $_.Exception.ToString()

    try {
        $conn.Close()
    } catch {}

    exit 1
}
"""

        powershell_executables = [
            r"C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe",
            "powershell.exe",
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
        ]

        for ps_exe in powershell_executables:
            try:
                res = subprocess.run(
                    [
                        ps_exe,
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-Command",
                        ps_script,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )

                if (
                    "SUCCESS" in res.stdout
                    and os.path.exists(abs_path)
                    and os.path.getsize(abs_path) > 0
                ):
                    return abs_path

                errors.append(
                    f"PowerShell '{ps_exe}' failed "
                    f"(return code {res.returncode}):\n"
                    f"STDOUT:\n{res.stdout.strip()}\n"
                    f"STDERR:\n{res.stderr.strip()}"
                )

            except FileNotFoundError as exc:
                errors.append(f"PowerShell '{ps_exe}' not found: {exc}")

            except Exception as exc:
                errors.append(f"PowerShell '{ps_exe}': {type(exc).__name__}: {exc}")

    except Exception as exc:
        errors.append(f"PowerShell setup: {type(exc).__name__}: {exc}")

    # ------------------------------------------------------------------
    # 3. Try JPype / Jackcess
    # ------------------------------------------------------------------
    try:
        if _generate_accdb_via_jackcess(
            abs_path,
            tables_to_process,
        ):
            return abs_path

        errors.append(
            "JPype/Jackcess: returned False "
            "(Jackcess bridge unavailable or template missing)."
        )

    except Exception as exc:
        errors.append(f"JPype/Jackcess: {type(exc).__name__}: {exc}")

    # ------------------------------------------------------------------
    # NO EMPTY TEMPLATE FALLBACK
    # ------------------------------------------------------------------
    if os.path.exists(abs_path):
        try:
            os.remove(abs_path)
        except Exception:
            pass

    error_details = "\n\n".join(
        f"[{i}] {error}" for i, error in enumerate(errors, start=1)
    )

    raise RuntimeError(
        "ACCDB export failed. No fallback ACCDB file was created.\n\n"
        f"Attempted methods:\n{error_details}"
    )


def generate_export_file(
    filepath,
    headers=None,
    rows=None,
    export_format="CSV",
    title="Export Data",
    table_name="ExportData",
    tables=None,
):
    """
    Unified, DRY exporter for ACCDB, XLSX, CSV, and PDF formats.
    """
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    fmt = str(export_format or "CSV").strip().lower()

    if fmt == "accdb":
        return generate_accdb_file(
            filepath, headers=headers, rows=rows, table_name=table_name, tables=tables
        )
    elif fmt == "xlsx":
        wb = Workbook()
        ws = wb.active
        ws.title = table_name[:31]
        if tables:
            first = True
            for tbl in tables:
                if first:
                    ws.title = tbl["name"][:31]
                    first = False
                else:
                    ws = wb.create_sheet(title=tbl["name"][:31])
                ws.append(tbl["headers"])
                for r in tbl.get("rows", []):
                    ws.append(r)
        else:
            ws.append(headers or [])
            for r in rows or []:
                ws.append(r)
        wb.save(filepath)
        return filepath
    elif fmt == "pdf":
        rows_to_pdf = rows or (tables[0]["rows"] if tables else [])
        formatted_lines = [" | ".join(str(val) for val in r) for r in rows_to_pdf]
        pdf_bytes = build_simple_pdf(title, formatted_lines)
        with open(filepath, "wb") as f:
            f.write(pdf_bytes)
        return filepath
    else:
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if tables:
                for tbl in tables:
                    writer.writerow([f"=== {tbl['name']} ==="])
                    writer.writerow(tbl["headers"])
                    writer.writerows(tbl.get("rows", []))
                    writer.writerow([])
            else:
                writer.writerow(headers or [])
                writer.writerows(rows or [])
        return filepath
