import time
from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import DisallowedHost
from django.urls import reverse
from rest_framework import status
from rest_framework.response import Response

from swmm.celery import app as celery_app


_WORKER_HEALTH_CACHE = {
    "checked_at": 0.0,
    "available": False,
    "reason": "Celery worker health has not been checked yet.",
}


def _cache_worker_health(available, reason):
    _WORKER_HEALTH_CACHE["checked_at"] = time.monotonic()
    _WORKER_HEALTH_CACHE["available"] = available
    _WORKER_HEALTH_CACHE["reason"] = reason
    return available, reason


def get_celery_worker_health(force_refresh=False):
    cache_ttl = float(getattr(settings, "CELERY_HEALTHCHECK_CACHE_TTL", 5.0))
    if not force_refresh:
        age = time.monotonic() - _WORKER_HEALTH_CACHE["checked_at"]
        if age < cache_ttl:
            return (
                _WORKER_HEALTH_CACHE["available"],
                _WORKER_HEALTH_CACHE["reason"],
            )

    timeout = float(getattr(settings, "CELERY_HEALTHCHECK_TIMEOUT", 1.0))
    try:
        inspect = celery_app.control.inspect(timeout=timeout)
        replies = inspect.ping() or {}
    except Exception as exc:
        return _cache_worker_health(
            False,
            f"Celery worker health check failed: {exc}",
        )

    if replies:
        workers = ", ".join(sorted(replies.keys()))
        return _cache_worker_health(
            True,
            f"Celery workers available: {workers}",
        )

    return _cache_worker_health(
        False,
        "No Celery worker replied to the health check.",
    )


def dispatch_task(task, *args, **kwargs):
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        result = task.apply(args=args, kwargs=kwargs).get()
        return {
            "queued": False,
            "result": result,
            "fallback_reason": "CELERY_TASK_ALWAYS_EAGER is enabled.",
        }

    workers_available, health_reason = get_celery_worker_health()
    if not workers_available:
        result = task.apply(args=args, kwargs=kwargs).get()
        return {
            "queued": False,
            "result": result,
            "fallback_reason": health_reason,
        }

    try:
        async_result = task.delay(*args, **kwargs)
        return {"queued": True, "task": async_result}
    except Exception as exc:
        result = task.apply(args=args, kwargs=kwargs).get()
        return {
            "queued": False,
            "result": result,
            "fallback_reason": str(exc),
        }


def save_uploaded_file(uploaded_file, subdirectory):
    target_dir = Path(settings.MEDIA_ROOT) / "async_jobs" / subdirectory
    target_dir.mkdir(parents=True, exist_ok=True)
    file_path = target_dir / f"{uuid4().hex}{Path(uploaded_file.name).suffix}"
    with file_path.open("wb") as output:
        for chunk in uploaded_file.chunks():
            output.write(chunk)
    return str(file_path)


def build_export_path(subdirectory, filename):
    target_dir = Path(settings.MEDIA_ROOT) / "async_jobs" / subdirectory
    target_dir.mkdir(parents=True, exist_ok=True)
    return str(target_dir / filename)


def build_media_url(file_path):
    relative_path = (
        Path(file_path).resolve().relative_to(Path(settings.MEDIA_ROOT).resolve())
    )
    return f"{settings.MEDIA_URL}{str(relative_path)}".replace("\\", "/")


def accepted_task_response(request, task, message):
    task_status_path = reverse("background-task-status", kwargs={"task_id": task.id})
    try:
        task_status_url = request.build_absolute_uri(task_status_path)
    except DisallowedHost:
        task_status_url = task_status_path

    return Response(
        {
            "status": "accepted",
            "message": message,
            "task_id": task.id,
            "task_status_url": task_status_url,
        },
        status=status.HTTP_202_ACCEPTED,
    )


def sync_task_response(task_result, fallback_message=None):
    if isinstance(task_result, dict):
        status_code = task_result.get("status_code", status.HTTP_200_OK)
        payload = task_result.get("result", task_result)
    else:
        status_code = status.HTTP_200_OK
        payload = task_result

    if isinstance(payload, dict):
        payload = dict(payload)
        payload["background_fallback"] = True
        if fallback_message and "message" not in payload:
            payload["message"] = fallback_message
    else:
        payload = {
            "result": payload,
            "background_fallback": True,
            "message": fallback_message
            or "Background task service unavailable. Executed synchronously.",
        }

    return Response(payload, status=status_code)
