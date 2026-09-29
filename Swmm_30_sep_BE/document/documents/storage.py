import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import PurePosixPath
from zoneinfo import ZoneInfo
from django.conf import settings
from django.core.files.storage import FileSystemStorage

class DocumentStorage:
    """Thin wrapper around FileSystemStorage rooted at STORAGE_ROOT.
    Kept behind this class so a future move to S3/MinIO is a swap
    of this module instead of a rewrite of the API layer.
    """

    def __init__(self):
        self._fs = FileSystemStorage(
            location=str(settings.STORAGE_ROOT)
        )

    def build_relative_path(self,source_system: str,ship_code: str,original_name: str) -> str:
        now = datetime.now(ZoneInfo("Asia/Kolkata"))
        ext = PurePosixPath(original_name).suffix.lower()
        timestamp_ms = int(now.timestamp() * 1000)
        filename = f"{now:%Y%m%d%H%M%S%f}"[:17] + ext
        # filename = f"{uuid.uuid4()}{ext}"
        return f"{source_system}/"f"{ship_code}/{now:%Y}/{now:%b}/{filename}"

    def save(self,relative_path: str,file_obj) -> str:
        return self._fs.save(relative_path,file_obj)

    def open(
        self,
        relative_path: str,
    ):
        return self._fs.open(
            relative_path,
            "rb",
        )

    def delete(
        self,
        relative_path: str,
    ) -> None:
        if self._fs.exists(relative_path):
            self._fs.delete(relative_path)

    def exists(
        self,
        relative_path: str,
    ) -> bool:
        return self._fs.exists(relative_path)

    @staticmethod
    def checksum(file_obj) -> str:
        digest = hashlib.sha256()

        for chunk in file_obj.chunks():
            digest.update(chunk)

        file_obj.seek(0)

        return digest.hexdigest()


document_storage = DocumentStorage()
