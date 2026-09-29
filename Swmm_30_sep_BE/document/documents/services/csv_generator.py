import csv
import io


def generate_csv(data):
    output = io.StringIO()

    if not data:
        return output.getvalue()

    headers = list(data[0].keys())

    writer = csv.DictWriter(
        output,
        fieldnames=headers,
        extrasaction="ignore",
    )

    writer.writeheader()
    writer.writerows(data)

    return output.getvalue()
