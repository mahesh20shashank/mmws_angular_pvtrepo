from django.db import models


class BaseQuerySet(models.QuerySet):
    def _status_filter(self, enabled=True):
        # if any(field.name == "is_active" for field in self.model._meta.fields):
        #     return {"is_active": enabled}
        if any(field.name == "active" for field in self.model._meta.fields):
            return {"active": enabled}
        return {}

    def active(self):
        filters = self._status_filter(True)
        return self.filter(**filters) if filters else self

    def inactive(self):
        filters = self._status_filter(False)
        return self.filter(**filters) if filters else self.none()


class BaseManager(models.Manager):
    def get_queryset(self):
        return BaseQuerySet(self.model, using=self._db)

    def active(self):
        return self.get_queryset().active()

    def inactive(self):
        return self.get_queryset().inactive()
