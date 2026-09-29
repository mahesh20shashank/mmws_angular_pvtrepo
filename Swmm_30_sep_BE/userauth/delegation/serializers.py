"""Delegation serializers -- explicit field lists (anti-pattern #2)."""

from django.utils import timezone
from rest_framework import serializers

from .models import RightsTransfer, RightsTransferLog


class RightsTransferSerializer(serializers.ModelSerializer):
    delegator_name = serializers.SerializerMethodField()
    delegatee_name = serializers.SerializerMethodField()

    class Meta:
        model = RightsTransfer
        fields = (
            "id",
            "delegator",
            "delegatee",
            "delegator_name",
            "delegatee_name",
            "transfer_type",
            "start_date_time",
            "end_date_time",
            "actual_retrieved_at",
            "status",
            "reason",
            "created_on",
        )
        read_only_fields = (
            "id",
            "delegator",
            "actual_retrieved_at",
            "status",
            "created_on",
        )

    def _name(self, user):
        if user is None:
            return None
        profile = getattr(user, "user_profile", None)
        if profile is not None:
            full = profile.get_full_name()
            if full:
                return full
        return user.username

    def get_delegator_name(self, obj):
        return self._name(obj.delegator)

    def get_delegatee_name(self, obj):
        return self._name(obj.delegatee)

    def validate(self, attrs):
        start = attrs.get("start_date_time")
        end = attrs.get("end_date_time")
        if start and end and end <= start:
            raise serializers.ValidationError(
                {"end_date_time": "Must be after start_date_time."}
            )
        if end and end <= timezone.now():
            raise serializers.ValidationError(
                {"end_date_time": "Must be in the future."}
            )
        return attrs


class RightsTransferLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = RightsTransferLog
        fields = (
            "id",
            "transfer",
            "action_type",
            "previous_status",
            "new_status",
            "previous_end_date_time",
            "new_end_date_time",
            "performed_by",
            "performed_at",
            "reason",
        )
        read_only_fields = fields
