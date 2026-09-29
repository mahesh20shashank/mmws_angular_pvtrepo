"""Shared test helpers."""

import base64
import uuid

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import CustomUser, CustomUserProfile, UserSession
from accounts.serializers import build_user_claims
from authz.models import (
    AccessLevel,
    Menu,
    Privilege,
    Process,
    RoleMenuMapping,
    RoleProcessMapping,
    UserAccessLevel,
    UserProcessRoleMapping,
    UserRole,
)


def encrypt_password(plain: str) -> str:
    """RSA-OAEP(SHA-256) + base64, matching accounts.encryption.decrypt_password."""
    with open(settings.LOGIN_PUBLIC_KEY_PATH, "rb") as fh:
        pub = serialization.load_pem_public_key(fh.read())
    ct = pub.encrypt(
        plain.encode("utf-8"),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(ct).decode("ascii")


def make_profile(**kw):
    defaults = dict(
        firstname="Test",
        lastname="User",
        approval_status="APPROVED",
        user_active=True,
        has_credentials=True,
    )
    defaults.update(kw)
    return CustomUserProfile.objects.create(**defaults)


def make_user(username, password="pw-secret-01", is_admin=False, profile=None, **pkw):
    username = username.upper()
    profile = profile or make_profile(**pkw)
    user = CustomUser(username=username, user_profile=profile, is_admin=is_admin)
    user.set_password(password)
    user.is_active = True
    user.save()
    return user


def default_process():
    return Process.objects.get_or_create(code="DEFAULT", defaults={"name": "Default"})[0]


def role(code):
    return UserRole.objects.get(code=code)


def grant_role(user, role_code, process=None, is_active=True):
    process = process or default_process()
    r = role(role_code)
    rp, _ = RoleProcessMapping.objects.get_or_create(user_role=r, process=process)
    return UserProcessRoleMapping.objects.create(
        user=user, process_role=rp, is_active=is_active
    )


def grant_access_level(user, level_code, **org_ids):
    return UserAccessLevel.objects.create(
        user=user,
        access_level=AccessLevel.objects.get(access_level_code=level_code),
        is_active=True,
        **org_ids,
    )


def grant_menu_privilege(role_code, menu_code, actions, process=None):
    process = process or default_process()
    menu, _ = Menu.objects.get_or_create(
        code=menu_code, defaults={"name": menu_code.title(), "sequence": 50}
    )
    rmm, _ = RoleMenuMapping.objects.get_or_create(
        process=process,
        role=role(role_code),
        menu=menu,
        access_level=None,
        unit_id=None,
    )
    privs = [
        Privilege.objects.get_or_create(code=a, defaults={"name": a.title()})[0]
        for a in actions
    ]
    rmm.privileges.set(privs)
    return rmm


def auth_client(user, role_id=None, process_id=None, with_session=True):
    """An APIClient carrying a live access token for ``user`` (+ a UserSession
    row so LiveJWTAuthentication's session check passes)."""
    session_id = uuid.uuid4().hex if with_session else None
    if with_session:
        UserSession.objects.create(
            user=user, username=user.username, session_id=session_id, is_active=True
        )
    refresh = RefreshToken.for_user(user)
    claims = build_user_claims(
        user, role_id=role_id, process_id=process_id, session_id=session_id
    )
    access = refresh.access_token
    for k, v in claims.items():
        access[k] = v
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client, str(access)
