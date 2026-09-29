from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(str(env_file))

SECRET_KEY = env.str("SECRET_KEY", default="dev-secret-key-not-for-production")
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["*"])

EXISTING_SERVICE_URL = "http://127.0.0.1:8000"
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "corsheaders",
    "documents",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.security.SecurityMiddleware",
]

ROOT_URLCONF = "document.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

WSGI_APPLICATION = "document.wsgi.application"

# Database
# Shares the existing swmm_30 Postgres instance/database but is isolated in
# its own schema - no other service should read/write this schema directly,
# they only reach it through this service's HTTP API.
DB_SCHEMA = env.str("DB_SCHEMA", default="document")
DB_CREATE_SCHEMA = env.bool("DB_CREATE_SCHEMA", default=True)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env.str("DB_NAME", default="swmm_30"),
        "USER": env.str("DB_USER"),
        "PASSWORD": env.str("DB_PASSWORD"),
        "HOST": env.str("DB_HOST", default="localhost"),
        "PORT": env.str("DB_PORT", default="5432"),
        # Persistent connections -- default 0 means Django opens a fresh Postgres
        # connection (TCP handshake + backend process fork + this OPTIONS.options
        # search_path re-applied) on every single request. 60s reuses one instead.
        "CONN_MAX_AGE": env.int("DB_CONN_MAX_AGE", default=60),
        "OPTIONS": {
            "options": f'-c search_path="{DB_SCHEMA}"',
        },
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "static"

# Local filesystem storage for uploaded files. In docker-compose this path
# is a mounted named volume so files persist across container restarts.
STORAGE_ROOT = Path(env.str("STORAGE_ROOT", default=str(BASE_DIR)))
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
# CORS / CSRF
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

ENABLE_SWAGGER = env.bool("ENABLE_SWAGGER", default=False)

# Service-to-service HMAC auth: how old an X-Timestamp header may be before
# a signed request is rejected as a possible replay.
SERVICE_AUTH_MAX_SKEW_SECONDS = env.int("SERVICE_AUTH_MAX_SKEW_SECONDS", default=300)

REST_FRAMEWORK = {
    # "DEFAULT_AUTHENTICATION_CLASSES": (
    #     "documents.authentication.ServiceKeyAuthentication",
    # ),
    # "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    # No django.contrib.auth installed (no local user model - see
    # ServiceKeyAuthentication) so DRF can't fall back to AnonymousUser.
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
}
SPECTACULAR_SETTINGS = {
    "TITLE": "Document Service API",
    "DESCRIPTION": "Shared document/file storage microservice used by SWMM and ITTTM.",
    "VERSION": "1.0.0",
    "COMPONENT_SPLIT_REQUEST": True,
    "FILEFIELD_FORMAT": "binary",
}
