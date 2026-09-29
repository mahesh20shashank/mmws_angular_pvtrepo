import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
)


def generate_pdf(data):
    buffer = io.BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A3),
        rightMargin=20,
        leftMargin=20,
        topMargin=25,
        bottomMargin=25,
    )

    # --------------------------------------------------
    # STYLES
    # --------------------------------------------------

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        alignment=TA_CENTER,
        spaceAfter=10,
    )

    header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7,
        leading=8,
        alignment=TA_CENTER,
        wordWrap="CJK",
        splitLongWords=True,
    )

    cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=8,
        alignment=TA_CENTER,
        wordWrap="CJK",
        splitLongWords=True,
    )

    elements = [
        Paragraph("Ship Equipment Report", title_style),
        Spacer(1, 10),
    ]

    # --------------------------------------------------
    # FIND COLUMNS
    # --------------------------------------------------

    columns = list(
        dict.fromkeys(
            key
            for item in data
            if isinstance(item, dict)
            for key in item.keys()
        )
    )

    if not columns:
        elements.append(
            Paragraph("No data available.", styles["Normal"])
        )

        document.build(elements)
        buffer.seek(0)

        return buffer.getvalue()

    # --------------------------------------------------
    # FORMAT VALUE
    # --------------------------------------------------

    def format_value(value):
        if value is None:
            return ""

        if isinstance(value, (dict, list)):
            return str(value)

        return str(value)

    # --------------------------------------------------
    # TABLE DATA
    # --------------------------------------------------

    table_data = [
        [
            Paragraph(
                str(column).replace("_", " ").title(),
                header_style,
            )
            for column in columns
        ]
    ]

    for item in data:
        if not isinstance(item, dict):
            continue

        table_data.append(
            [
                Paragraph(
                    format_value(
                        item.get(column, "")
                    ).replace("\n", "<br/>"),
                    cell_style,
                )
                for column in columns
            ]
        )

    # --------------------------------------------------
    # COLUMN WIDTHS
    # --------------------------------------------------

    page_width, _ = landscape(A3)

    available_width = (
        page_width
        - document.leftMargin
        - document.rightMargin
    )

    column_widths = []

    for column in columns:

        header_text = (
            str(column)
            .replace("_", " ")
            .title()
        )

        max_width = max(
            35,
            stringWidth(
                header_text,
                "Helvetica-Bold",
                7,
            ) + 12,
        )

        for item in data:
            if not isinstance(item, dict):
                continue

            value = format_value(
                item.get(column, "")
            )

            text_width = (
                stringWidth(
                    value[:40],
                    "Helvetica",
                    7,
                )
                + 12
            )

            max_width = max(
                max_width,
                text_width,
            )

        column_widths.append(
            min(max_width, 120)
        )

    # --------------------------------------------------
    # FIT TABLE TO PAGE
    # --------------------------------------------------

    total_width = sum(column_widths)

    if total_width > available_width:
        scale = available_width / total_width

        column_widths = [
            width * scale
            for width in column_widths
        ]

    # --------------------------------------------------
    # CREATE TABLE
    # --------------------------------------------------

    table = Table(
        table_data,
        colWidths=column_widths,
        repeatRows=1,
        hAlign="LEFT",
    )

    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )

    elements.append(table)

    # --------------------------------------------------
    # BUILD PDF
    # --------------------------------------------------

    document.build(elements)

    buffer.seek(0)

    return buffer.getvalue()
