import hashlib
import hmac
import time

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse

from documents.models import Document, FileObject, ServiceClient


def sign(method, path, client_key, secret, timestamp):
    message = ".".join([method, path, client_key, timestamp]).encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


class ServiceAuthMixin:
    def setUp(self):
        super().setUp()
        self.client_key = "test-client-key"
        self.secret = "test-secret"
        self.service_client = ServiceClient.objects.create(
            name="swmm-backend",
            client_key=self.client_key,
            secret=self.secret,
            source_system="swmm",
        )

    def auth_headers(self, method, path):
        timestamp = str(int(time.time()))
        signature = sign(method, path, self.client_key, self.secret, timestamp)
        return {
            "HTTP_X_SERVICE_KEY": self.client_key,
            "HTTP_X_TIMESTAMP": timestamp,
            "HTTP_X_SIGNATURE": signature,
        }


class DocumentFlowTests(ServiceAuthMixin, TestCase):
    def test_upload_list_download_delete_flow(self):
        upload_path = reverse("document-upload")
        upload = SimpleUploadedFile(
            "cert.pdf", b"%PDF-1.4 fake pdf bytes", content_type="application/pdf"
        )
        response = self.client.post(
            upload_path,
            data={
                "file": upload,
                "title": "Fire Safety Certificate",
                "source_system": "swmm",
                "reference_type": "certificate",
                "reference_id": "123",
                "uploaded_by_user_id": "42",
            },
            format="multipart",
            **self.auth_headers("POST", upload_path),
        )
        self.assertEqual(response.status_code, 201, response.content)
        document_id = response.data["id"]

        self.assertEqual(FileObject.objects.count(), 1)
        self.assertEqual(Document.objects.count(), 1)

        list_path = reverse("document-list")
        response = self.client.get(
            list_path,
            {"source_system": "swmm"},
            **self.auth_headers("GET", list_path),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

        detail_path = reverse("document-detail", args=[document_id])
        response = self.client.get(
            detail_path, **self.auth_headers("GET", detail_path)
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Fire Safety Certificate")

        download_path = reverse("document-download", args=[document_id])
        response = self.client.get(
            download_path, **self.auth_headers("GET", download_path)
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"%PDF-1.4 fake pdf bytes")

        response = self.client.delete(
            detail_path, **self.auth_headers("DELETE", detail_path)
        )
        self.assertEqual(response.status_code, 204)

        response = self.client.get(
            detail_path, **self.auth_headers("GET", detail_path)
        )
        self.assertEqual(response.status_code, 404)


class ServiceAuthRejectionTests(ServiceAuthMixin, TestCase):
    def test_missing_headers_rejected(self):
        response = self.client.get(reverse("document-list"))
        self.assertEqual(response.status_code, 401)

    def test_bad_signature_rejected(self):
        path = reverse("document-list")
        timestamp = str(int(time.time()))
        response = self.client.get(
            path,
            HTTP_X_SERVICE_KEY=self.client_key,
            HTTP_X_TIMESTAMP=timestamp,
            HTTP_X_SIGNATURE="not-a-real-signature",
        )
        self.assertEqual(response.status_code, 401)

    def test_stale_timestamp_rejected(self):
        path = reverse("document-list")
        old_timestamp = str(int(time.time()) - 10_000)
        signature = sign("GET", path, self.client_key, self.secret, old_timestamp)
        response = self.client.get(
            path,
            HTTP_X_SERVICE_KEY=self.client_key,
            HTTP_X_TIMESTAMP=old_timestamp,
            HTTP_X_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 401)

    def test_unknown_client_rejected(self):
        path = reverse("document-list")
        timestamp = str(int(time.time()))
        signature = sign("GET", path, "someone-else", "wrong-secret", timestamp)
        response = self.client.get(
            path,
            HTTP_X_SERVICE_KEY="someone-else",
            HTTP_X_TIMESTAMP=timestamp,
            HTTP_X_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 401)
