from django.contrib.auth.models import BaseUserManager
from django.db import transaction


class CustomUserManager(BaseUserManager):
    """Origin: SWMM users/managers.py CustomUserManager.

    The username is always stored upper-cased (see CustomUser.clean and the
    prompt's "username (unique, upper)").
    """

    use_in_migrations = True

    def _create_user(self, username, password, **extra_fields):
        if not username:
            raise ValueError("The username must be set")
        username = username.strip().upper()

        profile_fields = extra_fields.pop("profile_fields", None)
        with transaction.atomic():
            user = self.model(username=username, **extra_fields)
            if user.user_profile_id is None and profile_fields is not None:
                from .models import CustomUserProfile

                user.user_profile = CustomUserProfile.objects.create(**profile_fields)
            user.set_password(password)
            user.save(using=self._db)
        return user

    def create_user(self, username, password=None, **extra_fields):
        extra_fields.setdefault("is_admin", False)
        return self._create_user(username, password, **extra_fields)

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault("is_admin", True)
        extra_fields.setdefault("is_active", True)
        if extra_fields.get("is_admin") is not True:
            raise ValueError("Superuser must have is_admin=True.")
        return self._create_user(username, password, **extra_fields)
