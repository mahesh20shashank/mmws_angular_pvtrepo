import time
from celery import shared_task


@shared_task(name="swmm_fastapi_service.tasks.validate_maintop_sync")
def validate_maintop_sync_task(payload_data: dict) -> dict:
    """
    Asynchronously validates MAINTOP sync payload and reports counts.
    """
    # Simulate processing delay
    time.sleep(0.5)

    headers_count = len(payload_data.get("T_maintopheader", []))
    details_count = len(payload_data.get("T_maintopdetail", []))

    return {
        "status": True,
        "headers_processed": headers_count,
        "details_processed": details_count,
        "message": "MAINTOP sync payload validated successfully in Celery background task.",
    }
