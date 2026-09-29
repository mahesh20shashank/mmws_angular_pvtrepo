from celery import shared_task

from swmm.excel_background import import_excel_with_serializer


@shared_task(name="dms.tasks.import_excel")
def import_excel_task(serializer_path, file_path, dry_run=False, max_rows=5000):
    return import_excel_with_serializer(
        serializer_path=serializer_path,
        file_path=file_path,
        dry_run=dry_run,
        max_rows=max_rows,
    )
