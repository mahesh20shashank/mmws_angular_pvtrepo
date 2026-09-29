from rest_framework import serializers
from documents.models import Document, FileObject

class FileObjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = FileObject
        fields = [
            "id",
            "original_name",
            "size",
            "mime_type",
            "checksum",
            "source_system",
            "uploaded_by_user_id",
            "created_at",
        ]
        read_only_fields = fields

class DocumentSerializer(serializers.ModelSerializer):
    file = FileObjectSerializer(read_only=True)
    document_id = serializers.UUIDField(
        source="file.id",
        read_only=True,
    )
    class Meta:
        model = Document
        fields = [
            "document_id",
            "id",
            "file",
            "title",
            "description",
            "category",
            "tags",
            "expiry_date",
            "source_system",
            "reference_type",
            "reference_id",
            "is_global",
            "department_id",
            "ship_or_unit_id",
            "shared_with_user_ids",
            "created_by_user_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "file", "created_at", "updated_at"]

class DocumentUploadSerializer(serializers.Serializer):
    file = serializers.FileField(required=True)
    ship_code = serializers.CharField(max_length=15,required=True)
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False,allow_blank=True,default="")
    category = serializers.CharField(required=False,allow_blank=True,max_length=100,default="")
    tags = serializers.ListField(child=serializers.CharField(),required=False,default=list)
    expiry_date = serializers.DateField(required=False,allow_null=True,default=None)
    source_system = serializers.ChoiceField(choices=["swmm", "ittm"])
    reference_type = serializers.CharField(required=False,allow_blank=True,max_length=100,default="")
    reference_id = serializers.CharField(required=False,allow_blank=True,max_length=100,default="")
    is_global = serializers.BooleanField(required=False,default=False)
    department_id = serializers.CharField(required=False,allow_blank=True,max_length=64,default="")
    ship_or_unit_id = serializers.CharField(required=False,allow_blank=True,max_length=64,default="")
    shared_with_user_ids = serializers.ListField(child=serializers.CharField(),required=False,default=list,
    )
    uploaded_by_user_id = serializers.CharField(required=False,allow_blank=True,max_length=64,default="",
    )

class ExportSerializer(serializers.Serializer):

    format = serializers.ChoiceField(
        choices=[
            'excel',
            'csv',
            'pdf'
        ]
    )

    filename = serializers.CharField(
        required=False,
        default='export'
    )

    data = serializers.ListField(
        child=serializers.DictField()
    )


class DocumentExportSerializer(serializers.Serializer):
    report = serializers.CharField()
    format = serializers.ChoiceField(
        choices=["pdf", "csv", "excel"]
    )

    def to_internal_value(self, data):
        """
        report aur format ko validate karo.
        Baaki saare fields ko dynamic filters ke roop me allow karo.
        """

        if not isinstance(data, dict):
            raise serializers.ValidationError(
                "Request body must be a JSON object."
            )

        if "report" not in data:
            raise serializers.ValidationError({
                "report": "This field is required."
            })

        if "format" not in data:
            raise serializers.ValidationError({
                "format": "This field is required."
            })

        report = data.get("report")
        file_format = data.get("format")

        if not report:
            raise serializers.ValidationError({
                "report": "This field may not be blank."
            })

        if file_format not in ["pdf", "csv", "excel"]:
            raise serializers.ValidationError({
                "format": (
                    "Format must be one of: pdf, csv, excel."
                )
            })

        validated = {
            "report": report,
            "format": file_format,
        }

        # report + format ke alawa har field dynamic filter hai
        for key, value in data.items():

            if key in ["report", "format"]:
                continue

            if value is not None and value != "":
                validated[key] = value

        return validated
