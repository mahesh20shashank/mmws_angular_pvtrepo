"""Report export rendering for the async xlsx/pdf export job pipeline -- used by
dart.tasks.generate_dart_report_export_task.

Reuses dart.report_registry's ReportDefinition (queryset_fn + serializer_class +
filterset_class), the same source of truth the on-screen report grids and the existing
synchronous CSV export (OPMReportExportAPIView) already use -- so this can't drift from
what those show. Columns are derived from the serializer's own output keys, in the order
the serializer defines them, rather than a separately maintained column map.
"""

import html as html_lib
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from weasyprint import HTML

from .report_registry import apply_filterset, get_report_definition


def fetch_report_rows(report_key: str, filters: dict) -> list[dict]:
    """Filtered, serialized rows for a report -- the full (unpaginated) result set."""
    definition = get_report_definition(report_key)
    if not definition:
        raise ValueError(f"Unknown report_key: {report_key}")

    queryset = apply_filterset(definition, filters or {})
    serializer = definition.serializer_class(queryset, many=True)
    return list(serializer.data)


def _cell_text(value) -> str:
    return "" if value is None else str(value)


def render_excel(title: str, rows: list[dict]) -> bytes:
    columns = list(rows[0].keys()) if rows else []
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = (title or "Report")[:31]

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(
        start_color="1D96E9", end_color="1D96E9", fill_type="solid"
    )

    sheet.append(columns)
    for cell in sheet[1]:
        cell.font = header_font
        cell.fill = header_fill

    for row in rows:
        sheet.append([_cell_text(row.get(field)) for field in columns])

    for col_cells in sheet.columns:
        longest = max((len(str(c.value)) for c in col_cells if c.value), default=10)
        sheet.column_dimensions[col_cells[0].column_letter].width = min(
            max(longest + 2, 10), 40
        )

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def render_pdf(title: str, rows: list[dict]) -> bytes:
    columns = list(rows[0].keys()) if rows else []
    header_html = "".join(f"<th>{html_lib.escape(str(c))}</th>" for c in columns)
    body_html = "".join(
        "<tr>"
        + "".join(
            f"<td>{html_lib.escape(_cell_text(row.get(field)))}</td>"
            for field in columns
        )
        + "</tr>"
        for row in rows
    )
    html_string = f"""
    <html>
      <head>
        <style>
          @page {{ size: A4 landscape; margin: 1.5cm; }}
          body {{ font-family: Arial, sans-serif; color: #111; }}
          h1 {{ font-size: 16px; margin: 0 0 12px; }}
          table {{ width: 100%; border-collapse: collapse; font-size: 9px; }}
          th, td {{ border: 1px solid #ccc; padding: 4px 6px; text-align: left; }}
          th {{ background: #1D96E9; color: #fff; }}
          tr:nth-child(even) {{ background: #f7f7f7; }}
        </style>
      </head>
      <body>
        <h1>{html_lib.escape(title)}</h1>
        <table>
          <thead><tr>{header_html}</tr></thead>
          <tbody>{body_html}</tbody>
        </table>
      </body>
    </html>
    """
    return HTML(string=html_string).write_pdf()
