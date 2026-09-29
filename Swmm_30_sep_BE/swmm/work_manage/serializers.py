from rest_framework import serializers

from .models import Duty, TimeSlot, WorkAssignment


class DutySerializer(serializers.ModelSerializer):
    class Meta:
        model = Duty
        fields = [
            "id",
            "user",
            "created_by",
            "department",
            "duty_name",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "created_by",
            "department",
            "created_at",
            "updated_at",
        ]

    def validate_duty_name(self, value):
        duty_name = value.strip()
        request = self.context.get("request")
        department = getattr(request.user, "department", None) if request else None
        queryset = Duty.objects.filter(
            department=department,
            created_by=getattr(request, "user", None),
            duty_name__iexact=duty_name,
        )
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("Duty name already exists.")
        return duty_name


class TimeSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeSlot
        fields = [
            "id",
            "user",
            "created_by",
            "department",
            "date",
            "from_time",
            "to_time",
            # "is_active",
            "active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "created_by",
            "department",
            "created_at",
            "updated_at",
        ]


class WorkAssignmentSerializer(serializers.ModelSerializer):
    assignee_name = serializers.CharField(source="assignee.username", read_only=True)
    assigner_name = serializers.CharField(source="assigner.username", read_only=True)
    duty_name = serializers.CharField(source="duty.duty_name", read_only=True)

    class Meta:
        model = WorkAssignment
        fields = [
            "id",
            "assigner",
            "assigner_name",
            "created_by",
            "assignee",
            "assignee_name",
            "timeslot",
            "duty",
            "duty_name",
            "department",
            "assignment_date",
            "notes",
            "role",
            "location",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "assigner",
            "assigner_name",
            "created_by",
            "department",
            "assignee_name",
            "duty_name",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = WorkAssignment(**{**attrs})
        if self.instance:
            for field_name, value in attrs.items():
                setattr(instance, field_name, value)
            instance.id = self.instance.id
        try:
            instance.clean()
        except Exception as error:
            raise serializers.ValidationError(
                getattr(error, "message_dict", str(error))
            ) from error
        return attrs


class AvailableUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    full_name = serializers.CharField()
