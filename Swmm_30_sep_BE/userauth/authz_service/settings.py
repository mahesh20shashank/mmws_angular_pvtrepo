"""
Django settings for authz_service.

Env-driven, fail-fast on missing secrets. DEBUG defaults to False.

Origin map (see README.md):
- JWT-only API, token_blacklist installed .............. SWMM swmm/settings.py
- RS256 shared key pair (service signs, all verify) ...... ITTTM user_service/settings.py
- Redis cache + Celery broker/beat ...................... ITTTM user_service/settings.py
- Fail-fast ImproperlyConfigured on missing secrets ...... anti-pattern #9 / #13
"""

from datetime import timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)
# Read a local .env if present (never required in production).
environ.Env.read_env(BASE_DIR / ".env")

DEBUG = env("DEBUG")


def _require(name, default=None):
    """Fetch a setting from the environment or fail fast.

    Anti-pattern #9 from the build prompt: no hardcoded insecure defaults for
    SECRET_KEY / audit key. In DEBUG a throwaway default is allowed so a fresh
    checkout can `runserver`; outside DEBUG an unset value is fatal.
    """
    try:
        return env(name)
    except environ.ImproperlyConfigured:
        if default is not None and DEBUG:
            return default
        raise ImproperlyConfigured(
            f"Required setting {name!r} is not set. Refusing to start."
        )


SECRET_KEY = _require("DJANGO_SECRET_KEY", default="dev-only-insecure-secret-key")

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"] if DEBUG else [])

SERVICE_NAME = env("SERVICE_NAME", default="authz_service")

# --------------------------------------------------------------------------
# Applications
# --------------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_celery_beat",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    # local
    "accounts",
    "authz",
    "delegation",
    "audit",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Centralized audit -- clears thread-local in finally, never swallows the
    # request, redacts secrets. Origin: ITTTM middleware.py::AuditLogMiddleware.
    "audit.middleware.AuditLogMiddleware",
]

ROOT_URLCONF = "authz_service.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "authz_service.wsgi.application"
ASGI_APPLICATION = "authz_service.asgi.application"

# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
# This service owns exactly one schema -- DB_SCHEMA -- and never reaches across
# into another service's schema (build prompt anti-pattern #10). The database may
# be shared with the SWMM app, whose tables (incl. django_migrations) live in
# public; keeping public OFF the search_path is what isolates this service's
# migration history and tables from it. The name is double-quoted everywhere it
# is used (search_path here, CREATE SCHEMA in authz_service/db.py) so a mixed-case
# value like "UserAuth" is honoured as-is rather than folded to lower-case.
DB_SCHEMA = env.str("DB_SCHEMA", default="UserAuth")
# Attempt `CREATE SCHEMA IF NOT EXISTS` on the first connection (see
# authz_service/db.py). Turn off when the schema is provisioned out of band and
# the DB role lacks CREATE on the database.
DB_CREATE_SCHEMA = env.bool("DB_CREATE_SCHEMA", default=DEBUG)

# Postgres when DB_NAME is set; sqlite otherwise (fresh checkout / tests).
if env.str("DB_NAME", default=""):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env.str("DB_NAME"),
            "USER": env.str("DB_USER"),
            "PASSWORD": env.str("DB_PASSWORD"),
            "HOST": env.str("DB_HOST", default="localhost"),
            "PORT": env.str("DB_PORT", default="5432"),
            # Persistent connections -- default 0 means Django opens a fresh Postgres
            # connection (TCP handshake + backend process fork + this OPTIONS.options
            # search_path re-applied) on every single request. 60s reuses one instead.
            "CONN_MAX_AGE": env.int("DB_CONN_MAX_AGE", default=60),
            "OPTIONS": {
                # libpq connect option: -c search_path=... scopes every query,
                # DDL and migration on this connection to DB_SCHEMA only (no
                # public fallback -- see note above). Postgres tolerates a
                # not-yet-existing schema here; authz_service.db creates it.
                # Add ',public' back only if you install extensions there.
                "options": f'-c search_path="{DB_SCHEMA}"',
            },
        }
    }

else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.CustomUser"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "static"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------
# ITTTM user sync (authz/itttm_sync.py, called from seed_rbac)
# --------------------------------------------------------------------------
ITTTM_USER_SERVICE_URL = env.str(
    "ITTTM_USER_SERVICE_URL",
    default="http://127.0.0.1:8000/api/auth/swmm-user-signup/",
)
ITTTM_USER_SERVICE_KEY = env.str("ITTTM_USER_SERVICE_KEY", default="")

# --------------------------------------------------------------------------
# CORS -- the SPA logs in against this service directly (it is the fleet's
# only login surface), so the browser origins that host it must be allowed.
# --------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=(["http://localhost:4200", "http://127.0.0.1:4200"] if DEBUG else []),
)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS", default=list(CORS_ALLOWED_ORIGINS)
)

# --------------------------------------------------------------------------
# DRF -- JWT-only for the API. IsAuthenticated floor, explicit classes on top.
# Origin: SWMM swmm/settings.py (JWT-only, no SessionAuthentication).
# --------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("authz.authentication.LiveJWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "EXCEPTION_HANDLER": "audit.exception_handler.swmm_exception_handler",
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# --------------------------------------------------------------------------
# RS256 key pair -- the service signs, every service verifies.
# Origin: ITTTM user_service/settings.py + user_service/encryption.py.
# ImproperlyConfigured if missing (anti-pattern #13).
# --------------------------------------------------------------------------
# A relative KEYS_DIR is resolved against BASE_DIR (the userauth/ project root),
# not the process CWD, so `KEYS_DIR=../keys` always means the shared repo root
# (the parent of swmm/ and userauth/) regardless of where manage.py is launched.
KEYS_DIR = Path(env("KEYS_DIR", default="../keys"))
if not KEYS_DIR.is_absolute():
    KEYS_DIR = (BASE_DIR / KEYS_DIR).resolve()

JWT_PRIVATE_KEY_PATH = Path(
    env("JWT_PRIVATE_KEY_PATH", default=str(KEYS_DIR / "jwt_private.pem"))
)
JWT_PUBLIC_KEY_PATH = Path(
    env("JWT_PUBLIC_KEY_PATH", default=str(KEYS_DIR / "jwt_public.pem"))
)
# RSA-OAEP password-decryption key for login (mandatory decrypt -- anti-pattern #4).
LOGIN_PRIVATE_KEY_PATH = Path(
    env("LOGIN_PRIVATE_KEY_PATH", default=str(KEYS_DIR / "login_private.pem"))
)
LOGIN_PUBLIC_KEY_PATH = Path(
    env("LOGIN_PUBLIC_KEY_PATH", default=str(KEYS_DIR / "login_public.pem"))
)

for _p in (JWT_PRIVATE_KEY_PATH, JWT_PUBLIC_KEY_PATH):
    if not _p.is_file():
        raise ImproperlyConfigured(
            f"JWT key file missing: {_p}. Generate an RS256 key pair "
            f"(see README.md 'Keys') before starting."
        )

JWT_PRIVATE_KEY = JWT_PRIVATE_KEY_PATH.read_text(encoding="utf-8")
JWT_PUBLIC_KEY = JWT_PUBLIC_KEY_PATH.read_text(encoding="utf-8")

# Login password decryption may be disabled only in DEBUG (tests / local curl).
# In production a missing key is fatal; a decrypt failure is always a rejected
# login, never a plaintext fallback.
LOGIN_DECRYPTION_REQUIRED = env.bool("LOGIN_DECRYPTION_REQUIRED", default=not DEBUG)

ACCESS_TOKEN_LIFETIME_MIN = env.int("ACCESS_TOKEN_LIFETIME_MIN", default=20)
REFRESH_TOKEN_LIFETIME_HOURS = env.int("REFRESH_TOKEN_LIFETIME_HOURS", default=12)

# When True, a successful login ends every other active session for that user
# and blacklists their outstanding refresh tokens (single-session-per-user).
ENFORCE_SINGLE_SESSION = env.bool("ENFORCE_SINGLE_SESSION", default=True)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=ACCESS_TOKEN_LIFETIME_MIN),
    "REFRESH_TOKEN_LIFETIME": timedelta(hours=REFRESH_TOKEN_LIFETIME_HOURS),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "RS256",
    "SIGNING_KEY": JWT_PRIVATE_KEY,
    "VERIFYING_KEY": JWT_PUBLIC_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "TOKEN_OBTAIN_SERIALIZER": "accounts.serializers.TokenObtainSerializer",
}

# --------------------------------------------------------------------------
# Redis cache (cross-service user-profile cache) + Celery broker.
# Origin: ITTTM user_service/settings.py.
# --------------------------------------------------------------------------
REDIS_URL = env("REDIS_URL", default="redis://127.0.0.1:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    }
}
# Tests and dev boxes without Redis fall back to local memory.
if env.bool("USE_LOCMEM_CACHE", default=DEBUG):
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }

USER_PROFILE_CACHE_TTL = env.int("USER_PROFILE_CACHE_TTL", default=900)

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default=REDIS_URL)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default=REDIS_URL)
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TIMEZONE = TIME_ZONE

# delegation lifecycle sweep cadence (seconds). Origin: ITTTM transfer_rights
# Celery-beat "every 60s".
DELEGATION_LIFECYCLE_INTERVAL_SECONDS = env.int(
    "DELEGATION_LIFECYCLE_INTERVAL_SECONDS", default=60
)

# --------------------------------------------------------------------------
# Audit service client. Key from env, no default (anti-pattern #9).
# --------------------------------------------------------------------------
AUDIT_ENABLED = env.bool("AUDIT_ENABLED", default=not DEBUG)
AUDIT_SERVICE_URL = env("AUDIT_SERVICE_URL", default="")
if AUDIT_ENABLED and not AUDIT_SERVICE_URL:
    raise ImproperlyConfigured("AUDIT_ENABLED is on but AUDIT_SERVICE_URL is unset.")
AUDIT_SERVICE_KEY = _require("AUDIT_SERVICE_KEY", default="dev-audit-key")
AUDIT_HTTP_TIMEOUT = env.float("AUDIT_HTTP_TIMEOUT", default=2.0)

# Shared secret guarding internal service-to-service endpoints (no default).
INTERNAL_SERVICE_KEY = _require("INTERNAL_SERVICE_KEY", default="dev-internal-key")

# --------------------------------------------------------------------------
# LDAP (optional). When LDAP_AUTH is off, ad_user accounts fall back to local
# password check. Origin: ITTTM accounts/serializers.py LDAP branch, reduced
# to a pluggable hook (no synchronous HRCDF/master calls on the login path --
# anti-pattern #11).
# --------------------------------------------------------------------------
LDAP_AUTH = env.bool("LDAP_AUTH", default=False)
LDAP_SERVER_URI = env("LDAP_SERVER_URI", default="")
LDAP_BIND_DOMAIN = env("LDAP_BIND_DOMAIN", default="")

# HRCDF (optional). Per-login personnel lookup used by MyTokenObtainSerializer
# to keep rank/designation/unit fresh on every AD-backed login. A lookup
# failure never blocks login -- it just skips enrichment for that request.
HRCDF_URL = env("HRCDF_URL", default="")
HRCDF_HTTP_TIMEOUT = env.float("HRCDF_HTTP_TIMEOUT", default=60.0)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
}


SPECTACULAR_SETTINGS = {
    "TITLE": "SWMM User Authentication RBAC APIs",
    "VERSION": "1.0.0",
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
}


ENABLE_SWAGGER = env.bool("ENABLE_SWAGGER", default=False)
