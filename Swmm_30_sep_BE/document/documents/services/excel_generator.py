import io

from openpyxl import Workbook


def generate_excel(data):
    output = io.BytesIO()

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Ship Equipment Report"

    if data:
        headers = list(data[0].keys())

        worksheet.append(headers)

        for item in data:
            worksheet.append(
                [item.get(header, "") for header in headers]
            )

    workbook.save(output)
    output.seek(0)

    return output.getvalue()
