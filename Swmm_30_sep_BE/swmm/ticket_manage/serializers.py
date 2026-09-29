from rest_framework import serializers

from .models import Ticket, TicketComment, TicketFile


class TicketFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketFile
        fields = (
            "id",
            "ticket",
            "file",
            "uploaded_at",
        )
        read_only_fields = ("id", "ticket", "uploaded_at")


class TicketCommentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.CustomUsername", read_only=True)

    class Meta:
        model = TicketComment
        fields = (
            "id",
            "ticket",
            "user",
            "user_name",
            "comment",
            "created_at",
        )
        read_only_fields = ("id", "ticket", "user", "user_name", "created_at")


class TicketSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )
    assigned_to_name = serializers.CharField(
        source="assigned_to.username",
        read_only=True,
    )
    comments = TicketCommentSerializer(many=True, read_only=True)
    files = TicketFileSerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = (
            "id",
            "ticket_number",
            "title",
            "description",
            "created_by",
            "created_by_name",
            "assigned_to",
            "assigned_to_name",
            "status",
            "priority",
            "created_on",
            "closed_on",
            "last_commented_on",
            "satellite_unit",
            "department_name",
            "department",
            "unit_name",
            "mobile_no",
            "ncn_no",
            "comments",
            "files",
        )
        read_only_fields = (
            "id",
            "ticket_number",
            "created_by",
            "created_by_name",
            "assigned_to_name",
            "created_on",
            "closed_on",
            "last_commented_on",
            "comments",
            "files",
        )


class TicketCloseSerializer(serializers.Serializer):
    detail = serializers.CharField(read_only=True)
