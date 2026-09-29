from celery.result import AsyncResult
from rest_framework.response import Response
from rest_framework.views import APIView

from swmm.celery import app as celery_app


class BackgroundTaskStatusView(APIView):
    def get(self, request, task_id):
        result = AsyncResult(task_id, app=celery_app)
        payload = {
            "task_id": task_id,
            "status": result.status,
        }
        if result.ready():
            payload["result"] = result.result
        return Response(payload)
