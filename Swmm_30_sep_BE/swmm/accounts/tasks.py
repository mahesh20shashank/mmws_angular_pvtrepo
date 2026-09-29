# Developed with Understanding: Celery tasks of the accounts app. swmm.celery calls
# app.autodiscover_tasks() with no arguments, which under the Django fixup looks for a
# tasks module in every INSTALLED_APPS entry, and "accounts" is installed, so this module
# is picked up by the swmm-celery-worker with no registration step.
"""Background tasks for the accounts app."""

import logging

from celery import shared_task
from django.utils import timezone

from .hrcdf_client import HrcdfSyncError
from .hrcdf_sync import (
    LINE_ERROR,
    ProgressWriter,
    execute_sync,
    job_summary,
    release_lock,
)
from .models import HrcdfSyncJob

logger = logging.getLogger(__name__)

UNEXPECTED_FAILURE_MESSAGE = (
    "HRCDF sync failed unexpectedly. The traceback is in the swmm worker log."
)


# Developed with Understanding: one HRCDF roster sync run (CP-C, D9). The worker runs it
# when dispatch_task queues it, and dispatch_task runs the same body inline when no worker
# answers, so both paths share one code path. The returned dict is what
# sync_task_response hands back on the inline path.
@shared_task(name="accounts.tasks.run_hrcdf_sync")
def run_hrcdf_sync(job_id):
    """Run the HRCDF sync job job_id and return its final summary."""
    return run_hrcdf_sync_job(job_id)


# Developed with Understanding: the task body - load the job, mark it running, run the
# engine, close the job finished or failed with the message the operator reads, and
# release the single-run lock in finally. It never raises, because a failed run is a job
# outcome the page shows, not a worker crash. client is injectable for the tests only.
def run_hrcdf_sync_job(job_id, client=None):
    """Run one queued HrcdfSyncJob to its end and return the task result dict."""
    job = HrcdfSyncJob.objects.select_related("started_by").filter(pk=job_id).first()
    if job is None:
        release_lock(job_id)
        return {
            "status": HrcdfSyncJob.Status.FAILED.value,
            "message": "The HRCDF sync job no longer exists.",
            "job_id": str(job_id),
            "summary": None,
        }
    progress = ProgressWriter(job)
    job.status = HrcdfSyncJob.Status.RUNNING
    job.started_at = timezone.now()
    job.updated_at = job.started_at
    job.save(update_fields=["status", "started_at", "updated_at"])
    final_status = HrcdfSyncJob.Status.FAILED
    message = UNEXPECTED_FAILURE_MESSAGE
    try:
        message = execute_sync(job, progress, client=client)
        final_status = HrcdfSyncJob.Status.FINISHED
    except HrcdfSyncError as exc:
        logger.warning("HRCDF sync job %s refused: %s", job_id, exc)
        message = exc.message
        progress.emit(LINE_ERROR, message)
    except Exception:
        logger.exception("HRCDF sync job %s failed unexpectedly", job_id)
        message = UNEXPECTED_FAILURE_MESSAGE
        progress.emit(LINE_ERROR, message)
    finally:
        # Developed with Understanding: the last lines reach the cache before the status
        # turns terminal, so a page that stops polling on "finished" has every line.
        try:
            progress.flush()
        except Exception:
            logger.exception("HRCDF sync job %s could not flush progress", job_id)
        now = timezone.now()
        HrcdfSyncJob.objects.filter(pk=job.pk).update(
            status=final_status,
            finished_at=now,
            message=message,
            errors=progress.errors,
            updated_at=now,
        )
        release_lock(job.pk)
    job.refresh_from_db()
    return {
        "status": job.status,
        "message": job.message,
        "job_id": str(job.pk),
        "summary": job_summary(job),
    }
