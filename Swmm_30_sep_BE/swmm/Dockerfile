# ---------- Builder ----------
FROM 172.16.50.13/platform/python:3.12-slim-bookworm-build AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=http://172.16.50.12:8081/repository/pypi-group-prod/simple \
    PIP_TRUSTED_HOST=172.16.50.12

WORKDIR /app

COPY pyproject.toml poetry.lock ./

# Install Poetry from Nexus
RUN pip install --no-cache-dir poetry

# Configure Poetry
RUN poetry config virtualenvs.create false

# Install application dependencies from Nexus
RUN poetry install --no-interaction --no-root

COPY . .


# ---------- Runtime ----------
FROM 172.16.50.13/platform/python:3.12-slim-bookworm-runtime-java17-v1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copy Python packages and application
COPY --from=builder /usr/local /usr/local
COPY --from=builder /app /app

# Create application writable directories
USER root

RUN mkdir -p /app/static /app/media && \
    chown appuser:appuser /app/static /app/media

# Run application as non-root user
USER appuser

EXPOSE 8000

CMD [ \
    "gunicorn", \
    "swmm.wsgi:application", \
    "--bind=0.0.0.0:8000", \
    "--workers=3", \
    "--timeout=300", \
    "--access-logfile=-", \
    "--error-logfile=-" \
    ]
