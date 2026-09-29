#!/bin/bash
set -e

REPO_DIR="/home/gitlab-runner/be-30th-sept-v1.0-swmm-ship/swmm"
REPO_DIR2="/home/gitlab-runner/be-30th-sept-v1.0-swmm-ship/userauth"

BRANCH="swmm_dev"

echo "========================================="
echo "OFFLINE SWMM DEPLOYMENT"
echo "========================================="

echo "Runner hostname: $(hostname)"
echo "Runner user: $(whoami)"

echo "Docker version:"
docker --version

echo "Repository: $REPO_DIR"
echo "Respository: $REPO_DIR2"

echo "Branch: $BRANCH"

cd "$REPO_DIR"

echo "========================================="
echo "Updating repository"
echo "========================================="

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "Current commit:"
git log -1 --oneline

echo "========================================="
echo "Checking environment files"
echo "========================================="

test -f "$REPO_DIR/.env" || {
    echo "ERROR: Root .env not found"
    exit 1
}

test -f "$REPO_DIR/swmm/.env" || {
    echo "ERROR: swmm/.env not found"
    exit 1
}

test -f "$REPO_DIR2/userauth/.env" || {
    echo "ERROR: userauth/.env not found"
    exit 1
}

echo "Root .env: OK"
echo "Backend .env: OK"

echo "========================================="
echo "Checking Docker"
echo "========================================="

docker info >/dev/null

echo "Docker daemon: OK"

echo "========================================="
echo "Logging in to Harbor"
echo "========================================="

echo "$HARBOR_PASSWORD" | \
docker login "$HARBOR_URL" \
-u "$HARBOR_USERNAME" \
--password-stdin

echo "========================================="
echo "Pulling latest images"
echo "========================================="

export IMAGE_TAG=dev

docker compose pull

echo "========================================="
echo "Starting SWMM containers"
echo "========================================="

docker compose up -d --remove-orphans

echo "=================================="
echo "Waiting for Backend"
echo "=================================="

sleep 20

echo "=================================="
echo "Running Migrations"
echo "=================================="

docker compose exec -T swmm-backend-dev python manage.py migrate --noinput

docker compose exec -T swmm-userauth-dev python manage.py migrate --noinput

echo "=================================="
echo "Collecting Static Files"
echo "=================================="

docker compose exec -T swmm-backend-dev python manage.py collectstatic --noinput

docker compose exec -T swmm-userauth-dev python manage.py collectstatic --noinput

docker compose exec -T swmm-backend-dev python seed_all.py

# Developed with Understanding: first-deployment seed for swmm (reference masters and the
# unit master). Idempotent - the unit step is skipped once master.Unit has rows.
docker compose exec -T swmm-backend-dev python manage.py seed_data

docker compose exec -T swmm-userauth-dev python manage.py seed_rbac

echo "========================================="
echo "Container status"
echo "========================================="

docker compose ps

echo "========================================="
echo "Restarting Nginx"
echo "========================================="

docker restart swmm-nginx

echo "========================================="
echo "Deployment completed successfully"
echo "========================================="

docker logout "$HARBOR_URL"
