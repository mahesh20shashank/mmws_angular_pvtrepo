import sys
from datetime import timedelta
from pathlib import Path

import environ

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Initialize environ
env = environ.Env()


# Take environment variables from .env file
environ.Env.read_env(BASE_DIR / ".env")

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env("SECRET_KEY")

DEBUG = env.bool("DEBUG")

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")

# Fallback app-identity strings for AppInfoAPIView (master app) — used only when no `active`
# master.models.AppInfo row exists yet (fresh DB, before any row is seeded). The real,
# editable source of truth is the AppInfo DB table (also editable via Django admin); these are
# just the values a brand-new deployment shows before anyone creates that first row.
APP_VERSION = env.str("APP_VERSION", default="V0.0 Beta")
APP_COPYRIGHT_TEXT = env.str("APP_COPYRIGHT_TEXT", default="Copyright @2026 | Content Owned")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-Party Apps
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    "corsheaders",
    "django_filters",
    # Project Apps
    # authz_service integration + local identity: token verification,
    # per-request shadow-sync, role map, live-permission classes, the
    # department-scoped RBAC (`accounts.rbac`), and the local shadow identity
    # models. SWMM mints no tokens; `AUTH_USER_MODEL` is `accounts.CustomUser`.
    "accounts",
    "op_maintenance",
    "master",
    "sfd",
    "ems",
    "ilms",
    "inout_tag",
    "obs",
    "wlms",
    "dms",
    "hotwork",
    "dl_monitor",
    "activity_planner",
    "srar",
    "tank",
    "ticket_manage",
    "work_manage",
    "refit",
    "crew_manage",
    "swmmapi",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "swmm.middleware.SecurityHeadersMiddleware",
]

ROOT_URLCONF = "swmm.urls"

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

WSGI_APPLICATION = "swmm.wsgi.application"


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases
# Database Selection (SQLite for development, PostgreSQL for Production)
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
DB_SCHEMA = env.str("DB_SCHEMA", default="swmm")
# Attempt `CREATE SCHEMA IF NOT EXISTS` on the first connection (see
# authz_service/db.py). Turn off when the schema is provisioned out of band and
# the DB role lacks CREATE on the database.
DB_CREATE_SCHEMA = env.bool("DB_CREATE_SCHEMA", default=DEBUG)
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


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

AUTH_USER_MODEL = "accounts.CustomUser"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.authentication.FleetJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "swmm.exceptions.custom_exception_handler",
}

# --------------------------------------------------------------------------
# authz_service integration -- SWMM is a resource server: it verifies RS256
# bearers minted by authz_service with the shared public key and mints none.
# --------------------------------------------------------------------------
AUTHZ_BASE_URL = env.str("AUTHZ_BASE_URL", default="http://authz-service:8000")
AUTHZ_JWT_PUBLIC_KEY_PATH = env.str(
    "AUTHZ_JWT_PUBLIC_KEY_PATH",
    default=str(BASE_DIR.parent / "keys" / "jwt_public.pem"),
)
AUTHZ_LIVE_CHECK_TTL = env.int("AUTHZ_LIVE_CHECK_TTL", default=45)
AUTHZ_REDIS_URL = env.str("AUTHZ_REDIS_URL", default="")
INTERNAL_SERVICE_KEY = env.str("INTERNAL_SERVICE_KEY", default="")
AUTHZ_ROLE_MAP = env.json("AUTHZ_ROLE_MAP", default={})

# Developed with Understanding: the only swmm view names an other-ship login (a guest,
# D28) may reach. accounts.authentication.FleetJWTAuthentication answers 403 on every other
# swmm endpoint for such a user. Each entry is a resolved view name - "namespace:name" when
# the app's urls.py sets app_name (accounts uses "users"), the bare name otherwise (master).
# Only swmm endpoints are listed - the userauth calls of the SPA never reach this service.
GUEST_ALLOWED_URL_NAMES = (
    # Developed with Understanding: GET api/v1/accounts/me/unit-status/ - the guest's own
    # status, read by the SPA after login (D29).
    "users:me-unit-status",
    # Developed with Understanding: GET api/v1/master/this-ship/ - the ship badge, read on
    # every signed-in layout start (frontend Sidebar.ngOnInit -> ThisShipService.load).
    "this-ship",
    # Developed with Understanding: GET api/v1/master/app-info/ - version and copyright,
    # read on every page by the shared footer (frontend Footer.ngOnInit -> Call.getAppInfo).
    "app-info",
)

SIMPLE_JWT = {
    # Informational once integrated -- authz_service owns the real lifetime;
    # `exp` is carried in the token and enforced by SimpleJWT.
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=360),
    "ALGORITHM": "RS256",
    "SIGNING_KEY": "",
    "VERIFYING_KEY": Path(AUTHZ_JWT_PUBLIC_KEY_PATH).read_text(encoding="utf-8"),
    "USER_ID_CLAIM": "user_id",
    "USER_ID_FIELD": "id",
    "AUTH_HEADER_TYPES": ("Bearer",),
    "LEEWAY": 10,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "SWMM Backend APIs",
    "VERSION": "1.0.0",
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "ENUM_NAME_OVERRIDES": {
        "ApprovalStatusE94Enum": "SrarApprovalStatus",
        "ApprovalStatus5d5Enum": "ObsApprovalStatus",
        "DlTypeBb1Enum": "ObsDlType",
        "DlType55fEnum": "SfdDlType",
        "Status9a8Enum": "HotworkStatus",
        "Status547Enum": "CrewStatus",
    },
}

ENABLE_SWAGGER = env.bool("ENABLE_SWAGGER", default=False)

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "cross-origin"
SECURE_CROSS_ORIGIN_RESOURCE_POLICY = "cross-origin"
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=False)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=not DEBUG)
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=not DEBUG)
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS",
    default=[
        "http://localhost:4200",
    ],
)
SECURE_HSTS_SECONDS = env.int(
    "SECURE_HSTS_SECONDS",
    default=31536000 if not DEBUG else 0,
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=not DEBUG,
)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=not DEBUG)
PERMISSIONS_POLICY = (
    "accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), "
    "magnetometer=(), microphone=(), payment=(), usb=()"
)
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "form-action 'self'; "
    "object-src 'none'; "
    "img-src 'self' data: https:; "
    "font-src 'self' data: https:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self' 'unsafe-inline'"
)


# Optional -- LDAP/AD login now belongs to authz_service. These are only read by
# the legacy users.services AD/HRCDF provisioning helpers, kept for admin use.
LDAP_SERVER = env.str("LDAP_SERVER", default="")
LDAP_BASE_DN = env.str("LDAP_BASE_DN", default="")

# HRCDF "lite" personnel lookup, queried after a successful AD bind to
# auto-provision the local CustomUser/CustomUserProfile pair (see
# users.services.save_hrcdf_to_db). Defaults to the Navy intranet endpoint;
# override in .env for a different deployment.
HRCDF_API_URL = env.str(
    "HRCDF_API_URL",
    default="http://hrcdf.nausena.mil:10081/epps-cdf/personnelMaster/v1/personnel/lite",
)

# Developed with Understanding: HRCDF bulk roster sync (accounts.hrcdf_client and
# accounts.hrcdf_sync, CP-C). Keys and defaults follow IIMA's HRCDF_SYNC block (R1 G1 step 1,
# G3) under the HRCDF_SYNC_ prefix, every value env-driven so the NCN values are set at
# deployment (D7, OQ9). BASE_URL empty means "not configured" and every run is refused with a
# plain 400. HRCDF_API_URL above is the unrelated single-person lookup and is left untouched.
# UNIT_FILTER_PARAM (query name that narrows an own-ship run to the home unit code) and
# UNITS_PATH (an HRCDF unit list endpoint for Get Ship Names, OQ7) are optional additions.
HRCDF_SYNC = {
    "BASE_URL": env.str("HRCDF_SYNC_BASE_URL", default=""),
    "USERS_PATH": env.str("HRCDF_SYNC_USERS_PATH", default="/api/users"),
    "AUTH_TOKEN_PATH": env.str("HRCDF_SYNC_AUTH_TOKEN_PATH", default="/api/auth/token"),
    "AUTH_USERNAME": env.str("HRCDF_SYNC_AUTH_USERNAME", default=""),
    "AUTH_PASSWORD": env.str("HRCDF_SYNC_AUTH_PASSWORD", default=""),
    "AUTH_TOKEN_KEY": env.str("HRCDF_SYNC_AUTH_TOKEN_KEY", default="token"),
    "AUTH_HEADER_SCHEME": env.str("HRCDF_SYNC_AUTH_HEADER_SCHEME", default="Bearer"),
    "PAGE_PARAM": env.str("HRCDF_SYNC_PAGE_PARAM", default="page"),
    "PAGE_SIZE_PARAM": env.str("HRCDF_SYNC_PAGE_SIZE_PARAM", default="pageSize"),
    "PAGE_SIZE": env.int("HRCDF_SYNC_PAGE_SIZE", default=500),
    "MAX_PAGES": env.int("HRCDF_SYNC_MAX_PAGES", default=1000),
    "TIMEOUT_SECONDS": env.int("HRCDF_SYNC_TIMEOUT_SECONDS", default=60),
    "VERIFY_TLS": env.bool("HRCDF_SYNC_VERIFY_TLS", default=True),
    "UNIT_FILTER_PARAM": env.str("HRCDF_SYNC_UNIT_FILTER_PARAM", default=""),
    "UNITS_PATH": env.str("HRCDF_SYNC_UNITS_PATH", default=""),
}
# Developed with Understanding: lifetime of the single-run lock in the swmm cache. Six hours
# outlasts any roster pull, so a worker that dies mid-run frees the lock by itself.
HRCDF_SYNC_LOCK_TTL_SECONDS = env.int("HRCDF_SYNC_LOCK_TTL_SECONDS", default=21600)

CELERY_BROKER_URL = env.str(
    "CELERY_BROKER_URL",
    # Redis doubles as both broker and result backend now (RabbitMQ dropped) — DB 2, since DB 0
    # is the result backend below and DB 1 is already REDIS_CACHE_URL (Django's cache).
    default="redis://swmm-redis:6379/2",
)
CELERY_RESULT_BACKEND = env.str(
    "CELERY_RESULT_BACKEND",
    default="redis://swmm-redis:6379/0",
)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_RESULT_EXPIRES = 3600
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_WORKER_CANCEL_LONG_RUNNING_TASKS_ON_CONNECTION_LOSS = True
CELERY_WORKER_ENABLE_REMOTE_CONTROL = True
CELERY_HEALTHCHECK_TIMEOUT = env.float("CELERY_HEALTHCHECK_TIMEOUT", default=1.0)
CELERY_HEALTHCHECK_CACHE_TTL = env.float("CELERY_HEALTHCHECK_CACHE_TTL", default=5.0)

# REDIS_ENABLED=False in .env (local dev without Redis): Django cache becomes in-process
# (see CACHES) and Celery tasks run inline with an in-memory broker/result backend.
REDIS_ENABLED = env.bool("REDIS_ENABLED", default=True)
CELERY_TASK_ALWAYS_EAGER = False
if not REDIS_ENABLED:
    CELERY_BROKER_URL = "memory://"
    CELERY_RESULT_BACKEND = "cache+memory://"
    CELERY_TASK_ALWAYS_EAGER = True
if "test" in sys.argv:
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True


MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "static"

STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

DEFAULT_FILE_STORAGE = "django.core.files.storage.FileSystemStorage"
FILE_UPLOAD_MAX_MEMORY_SIZE = 5242880  # 5MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 5242880  # 5MB


CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

if REDIS_ENABLED:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": env.str("REDIS_CACHE_URL", default="redis://swmm-redis:6379/1"),
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "IGNORE_EXCEPTIONS": True,
            },
            "KEY_PREFIX": "swmm",
            "TIMEOUT": 300,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "swmm-local",
            "KEY_PREFIX": "swmm",
            "TIMEOUT": 300,
        }
    }

DJANGO_REDIS_IGNORE_EXCEPTIONS = True
DJANGO_REDIS_LOG_IGNORED_EXCEPTIONS = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

DEBUG = env.bool("DEBUG", default=False)
if DEBUG is True:
    DOCUMENT_SERVICE_URLS = (
        "http://127.0.0.1:8090/api/v1/documents/generate_report/"
    )
else:
    DOCUMENT_SERVICE_URLS = (
        "http://172.16.40.87:8000/api/v1/documents/generate_report/"
    )
