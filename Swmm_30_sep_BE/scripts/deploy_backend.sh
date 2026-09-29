#!/bin/bash

set -euo pipefail

REPO_DIR="/home/gitlab-runner/be-30th-sept-v1.0-swmm-ship"

cd "$REPO_DIR"

NGINX_CONTAINER="swmm-nginx"

export IMAGE_TAG="${IMAGE_TAG:-dev}"

echo "========================================="
echo "SWMM BACKEND DEPLOYMENT"
echo "========================================="

echo "Host   : $(hostname)"
echo "User   : $(whoami)"
echo "Docker : $(docker --version)"
echo "Tag    : ${IMAGE_TAG}"

echo
echo "Checking Docker..."
docker info >/dev/null
echo "Docker OK"

echo
echo "Checking environment files..."

test -f swmm/.env
test -f userauth/.env
test -f document/.env

echo "Environment files OK"

echo
echo "Checking keys..."

test -f /opt/keys/jwt_public.pem
test -f /opt/keys/jwt_private.pem
test -f /opt/keys/login_public.pem
test -f /opt/keys/login_private.pem

echo "Keys OK"

echo
echo "Checking Compose configuration..."

docker compose config >/dev/null

echo "Compose configuration OK"

echo
echo "Logging into Harbor..."

echo "$HARBOR_PASSWORD" | docker login "$HARBOR_URL" \
    --username "$HARBOR_USERNAME" \
    --password-stdin

echo
echo "Pulling images..."

docker compose pull

echo
echo "Starting services..."

docker compose up -d --force-recreate --remove-orphans

echo
echo "Waiting for containers..."

sleep 15

echo
echo "Container status:"

docker compose ps

echo
echo "Checking containers..."

for container in \
    swmm-redis \
    swmm-backend-dev \
    swmm-userauth-dev \
    swmm-document-dev \
    swmm-celery-worker
do

    status=$(docker inspect \
        --format '{{.State.Status}}' \
        "$container" 2>/dev/null || true)

    if [ "$status" != "running" ]; then

        echo
        echo "ERROR: $container is $status"
        echo
        docker logs --tail 100 "$container" || true

        exit 1
    fi

    echo "$container: running"

done

echo
echo "Running migrations..."

docker compose exec -T \
    swmm-backend-dev \
    python manage.py migrate --noinput

# Developed with Understanding: first-deployment seed for swmm (reference masters and the
# unit master). Idempotent - the unit step is skipped once master.Unit has rows.
docker compose exec -T \
    swmm-backend-dev \
    python manage.py seed_data

docker compose exec -T \
    swmm-userauth-dev \
    python manage.py migrate --noinput

docker compose exec -T \
    swmm-document-dev \
    python manage.py migrate --noinput

echo
echo "Collecting static files..."

docker compose exec -T \
    swmm-backend-dev \
    python manage.py collectstatic --noinput

docker compose exec -T \
    swmm-userauth-dev \
    python manage.py collectstatic --noinput

docker compose exec -T \
    swmm-document-dev \
    python manage.py collectstatic --noinput

echo
echo "========================================="
echo "Checking Nginx"
echo "========================================="

if ! docker ps --format '{{.Names}}' | grep -qx "$NGINX_CONTAINER"; then
    echo "ERROR: Nginx container '$NGINX_CONTAINER' is not running"
    exit 1
fi

echo "Nginx container is running"

echo "========================================="
echo "Nginx Test and Reload"
echo "========================================="

docker exec "$NGINX_CONTAINER" nginx -t
docker exec "$NGINX_CONTAINER" nginx -s reload


echo
echo "========================================="
echo "DEPLOYMENT SUCCESSFUL"
echo "========================================="

docker compose ps

docker logout "$HARBOR_URL" >/dev/null 2>&1 || true
