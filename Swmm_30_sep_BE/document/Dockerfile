# ---------- Builder ----------
FROM 172.16.50.13/platform/python:3.12-slim-bookworm-build AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=http://172.16.50.12:8081/repository/pypi-group-prod/simple \
    PIP_TRUSTED_HOST=172.16.50.12

WORKDIR /app

COPY pyproject.toml poetry.lock* ./

RUN pip install --no-cache-dir poetry
RUN poetry config virtualenvs.create false
RUN poetry install --no-interaction --no-root

COPY . .


# ---------- Runtime ----------
FROM 172.16.50.13/platform/python:3.12-slim-bookworm-runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY --from=builder /usr/local /usr/local
COPY --from=builder /app /app

USER root

RUN mkdir -p /app/static /data/files && \
    chown appuser:appuser /app/static /data/files

USER appuser

EXPOSE 8002

CMD [ \
    "gunicorn", \
    "document.wsgi:application", \
    "--bind=0.0.0.0:8002", \
    "--workers=3", \
    "--timeout=300", \
    "--access-logfile=-", \
    "--error-logfile=-" \
    ]
