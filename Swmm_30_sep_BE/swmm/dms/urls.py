from django.urls import path

from .views import (
    CategoryNameViewSet,
    CertificateViewSet,
    EquipmentCategoryViewSet,
    EquipmentDocumentViewSet,
)

app_name = "dms"

certificates = CertificateViewSet.as_view({"get": "list", "post": "create"})
certificates_by_type = CertificateViewSet.as_view({"get": "list_by_type"})
shared_certificates_by_type = CertificateViewSet.as_view({"get": "list_shared_by_type"})
certificate_detail = CertificateViewSet.as_view({"get": "retrieve"})
certificate_delete = CertificateViewSet.as_view({"get": "destroy", "delete": "destroy"})
certificate_dashboard = CertificateViewSet.as_view({"get": "dashboard"})
share_certificate = CertificateViewSet.as_view({"post": "share_certificate"})
in_mail_view = CertificateViewSet.as_view({"get": "in_mail"})
out_mail_view = CertificateViewSet.as_view({"get": "out_mail"})
certificate_stream = CertificateViewSet.as_view({"get": "stream_attachment"})
certificate_export_excel = CertificateViewSet.as_view({"get": "export_excel"})
certificate_download_template = CertificateViewSet.as_view({"get": "download_template"})
certificate_import_excel = CertificateViewSet.as_view({"post": "import_excel"})

categories = CategoryNameViewSet.as_view({"get": "list", "post": "create"})
category_update = CategoryNameViewSet.as_view({"post": "update_from_payload"})
category_delete = CategoryNameViewSet.as_view({"post": "delete_from_payload"})
category_export_excel = CategoryNameViewSet.as_view({"get": "export_excel"})
category_download_template = CategoryNameViewSet.as_view({"get": "download_template"})
category_import_excel = CategoryNameViewSet.as_view({"post": "import_excel"})

equipment_categories = EquipmentCategoryViewSet.as_view(
    {"get": "list", "post": "create"}
)
equipment_category_delete = EquipmentCategoryViewSet.as_view(
    {"get": "destroy", "delete": "destroy"}
)
equipment_category_export_excel = EquipmentCategoryViewSet.as_view(
    {"get": "export_excel"}
)
equipment_category_download_template = EquipmentCategoryViewSet.as_view(
    {"get": "download_template"}
)
equipment_category_import_excel = EquipmentCategoryViewSet.as_view(
    {"post": "import_excel"}
)

equipment_documents = EquipmentDocumentViewSet.as_view(
    {"get": "list", "post": "create"}
)
equipment_document_detail = EquipmentDocumentViewSet.as_view({"get": "retrieve"})
equipment_document_stream = EquipmentDocumentViewSet.as_view(
    {"get": "stream_attachment"}
)
equipment_document_delete = EquipmentDocumentViewSet.as_view(
    {"get": "destroy", "delete": "destroy"}
)
equipment_document_export_excel = EquipmentDocumentViewSet.as_view(
    {"get": "export_excel"}
)
equipment_document_download_template = EquipmentDocumentViewSet.as_view(
    {"get": "download_template"}
)
equipment_document_import_excel = EquipmentDocumentViewSet.as_view(
    {"post": "import_excel"}
)

urlpatterns = [
    path("get/<str:cert_type>/", certificates_by_type, name="get_certificates"),
    path(
        "get_shared/<str:cert_type>/",
        shared_certificates_by_type,
        name="get_certificates_shared",
    ),
    path("add/", certificates, name="add_certificate"),
    path("delete/<int:cert_id>/", certificate_delete, name="delete_certificate"),
    path("detail/<int:cert_id>/", certificate_detail, name="certificate_detail"),
    path("view/<int:cert_id>/", certificate_stream, name="view_certificate"),
    path(
        "other/",
        certificates_by_type,
        {"cert_type": "other"},
        name="other_certificates",
    ),
    path(
        "correspondence/",
        certificates_by_type,
        {"cert_type": "correspondence"},
        name="correspondence_certificates",
    ),
    path("dashboard/", certificate_dashboard, name="dashboard"),
    path("in_mail/", in_mail_view, name="in_mail"),
    path("out_mail/", out_mail_view, name="out_mail"),
    path("masters/", categories, name="masters"),
    path("get_category/", categories, name="get_category"),
    path("save_category/", categories, name="save_category"),
    path("update_category/", category_update, name="update_category"),
    path("delete_category/", category_delete, name="delete_category"),
    path("share_certificate/", share_certificate, name="share_certificate"),
    path(
        "sharepoint/",
        certificates_by_type,
        {"cert_type": "sharepoint"},
        name="sharepoint",
    ),
    path(
        "add_equipment_category/",
        equipment_categories,
        name="add_equipment_category",
    ),
    path(
        "get_equipment_categories/",
        equipment_categories,
        name="get_equipment_categories",
    ),
    path(
        "delete_equipment_category/<int:equipment_id>/",
        equipment_category_delete,
        name="delete_equipment_category",
    ),
    path(
        "add_equipment_document/",
        equipment_documents,
        name="add_equipment_document",
    ),
    path(
        "get_equipment_documents/",
        equipment_documents,
        name="get_equipment_documents",
    ),
    path(
        "get_document_detail/<int:document_id>/",
        equipment_document_detail,
        name="get_document_detail",
    ),
    path(
        "delete_equipment_document/<int:document_id>/",
        equipment_document_delete,
        name="delete_equipment_document",
    ),
    path(
        "view_document/<int:document_id>/",
        equipment_document_stream,
        name="view_document",
    ),
    path(
        "certificates/export-excel/",
        certificate_export_excel,
        name="certificates_export_excel",
    ),
    path(
        "certificates/download-template/",
        certificate_download_template,
        name="certificates_download_template",
    ),
    path(
        "certificates/import-excel/",
        certificate_import_excel,
        name="certificates_import_excel",
    ),
    path(
        "categories/export-excel/",
        category_export_excel,
        name="categories_export_excel",
    ),
    path(
        "categories/download-template/",
        category_download_template,
        name="categories_download_template",
    ),
    path(
        "categories/import-excel/",
        category_import_excel,
        name="categories_import_excel",
    ),
    path(
        "equipment-categories/export-excel/",
        equipment_category_export_excel,
        name="equipment_categories_export_excel",
    ),
    path(
        "equipment-categories/download-template/",
        equipment_category_download_template,
        name="equipment_categories_download_template",
    ),
    path(
        "equipment-categories/import-excel/",
        equipment_category_import_excel,
        name="equipment_categories_import_excel",
    ),
    path(
        "equipment-documents/export-excel/",
        equipment_document_export_excel,
        name="equipment_documents_export_excel",
    ),
    path(
        "equipment-documents/download-template/",
        equipment_document_download_template,
        name="equipment_documents_download_template",
    ),
    path(
        "equipment-documents/import-excel/",
        equipment_document_import_excel,
        name="equipment_documents_import_excel",
    ),
    path(
        "technical/", certificates_by_type, {"cert_type": "technical"}, name="technical"
    ),
]
