#!/bin/bash

set -euo pipefail

# ============================================================
# SWMM FRONTEND OFFLINE DEPLOYMENT
# ============================================================

REPO_DIR="${CI_PROJECT_DIR:-$(pwd)}"

IMAGE_TAG="${IMAGE_TAG:-dev}"

NGINX_CONTAINER="swmm-nginx"

echo "============================================================"
echo "             SWMM FRONTEND DEPLOYMENT"
echo "============================================================"

echo "Runner hostname : $(hostname)"
echo "Runner user     : $(whoami)"
echo "Repository      : $REPO_DIR"
echo "Branch          : ${CI_COMMIT_REF_NAME:-unknown}"
echo "Commit          : ${CI_COMMIT_SHORT_SHA:-unknown}"
echo "Image tag       : $IMAGE_TAG"
echo "Docker version  : $(docker --version)"

# ============================================================
# 1. MOVE TO GITLAB CHECKOUT
# ============================================================

cd "$REPO_DIR"

echo
echo "============================================================"
echo "Current Git commit"
echo "============================================================"

git log -1 --oneline

# ============================================================
# 2. CHECK FRONTEND ENVIRONMENT
# ============================================================

echo
echo "============================================================"
echo "Checking Frontend environment"
echo "============================================================"

# ============================================================
# 3. CHECK DOCKER
# ============================================================

echo
echo "============================================================"
echo "Checking Docker"
echo "============================================================"

if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker daemon is not accessible"
    exit 1
fi

echo "Docker daemon: OK"

# ============================================================
# 4. HARBOR VARIABLES
# ============================================================

echo
echo "============================================================"
echo "Checking Harbor variables"
echo "============================================================"

: "${HARBOR_URL:?ERROR: HARBOR_URL is not set}"
: "${HARBOR_USERNAME:?ERROR: HARBOR_USERNAME is not set}"
: "${HARBOR_PASSWORD:?ERROR: HARBOR_PASSWORD is not set}"

echo "Harbor variables: OK"

# ============================================================
# 5. HARBOR LOGIN
# ============================================================

echo
echo "============================================================"
echo "Logging in to Harbor"
echo "============================================================"

echo "$HARBOR_PASSWORD" | docker login "$HARBOR_URL" \
    --username "$HARBOR_USERNAME" \
    --password-stdin

echo "Harbor login: OK"

# ============================================================
# 6. CHECK COMPOSE
# ============================================================

echo
echo "============================================================"
echo "Checking Docker Compose"
echo "============================================================"

docker compose config >/dev/null

echo "Docker Compose configuration: OK"

# ============================================================
# 7. PULL FRONTEND IMAGE
# ============================================================

echo
echo "============================================================"
echo "Pulling Frontend image"
echo "============================================================"

export IMAGE_TAG="$IMAGE_TAG"

docker compose pull

echo "Frontend image pulled successfully"

# ============================================================
# 8. START FRONTEND
# ============================================================

echo
echo "============================================================"
echo "Starting Frontend container"
echo "============================================================"

docker compose up -d --remove-orphans

echo "Frontend container started"

# ============================================================
# 9. WAIT FOR FRONTEND
# ============================================================

echo
echo "============================================================"
echo "Waiting for Frontend"
echo "============================================================"

sleep 10

# ============================================================
# 10. CHECK STATUS
# ============================================================

echo
echo "============================================================"
echo "Frontend container status"
echo "============================================================"

docker compose ps

# ============================================================
# 11. VERIFY CONTAINER IS RUNNING
# ============================================================

echo
echo "============================================================"
echo "Verifying Frontend"
echo "============================================================"

RUNNING_COUNT=$(docker compose ps --status running --services | wc -l)

if [ "$RUNNING_COUNT" -lt 1 ]; then
    echo "ERROR: Frontend container is not running"

    docker compose ps

    exit 1
fi

echo "Frontend container: RUNNING"

# ============================================================
# 12. RESTART NGINX
# ============================================================

echo
echo "============================================================"
echo "Restarting Nginx"
echo "============================================================"

if docker ps --format '{{.Names}}' | grep -qx "$NGINX_CONTAINER"; then

    docker restart "$NGINX_CONTAINER"

    echo "Nginx restarted successfully"

else

    echo "WARNING: Nginx container '$NGINX_CONTAINER' not found"
    echo "Skipping Nginx restart"

fi

# ============================================================
# 13. FINAL STATUS
# ============================================================


echo
echo "============================================================"
echo "FINAL FRONTEND STATUS"
echo "============================================================"

docker compose ps


echo
echo "All running containers:"
docker ps --format \
    'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

# ============================================================
# 14. HARBOR LOGOUT
# ============================================================

echo
echo "============================================================"
echo "Logging out from Harbor"
echo "============================================================"

docker logout "$HARBOR_URL" || true

# ============================================================
# COMPLETE
# ============================================================

echo
echo "============================================================"
echo "       FRONTEND DEPLOYMENT COMPLETED SUCCESSFULLY"
echo "============================================================"

echo "Commit deployed:"
git log -1 --oneline

echo "Deployment completed at: $(date)"

echo "============================================================"
