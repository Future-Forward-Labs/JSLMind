#!/usr/bin/env bash
# seed-minio.sh — create MinIO buckets for all medallion layers
# Run after: docker compose up -d minio
set -euo pipefail

MINIO_ALIAS="jslmind"
ACCESS_KEY="${MINIO_ROOT_USER:-jslmind}"
SECRET_KEY="${MINIO_ROOT_PASSWORD:-jslmind_minio_2024}"

echo ""
echo "=== Seeding MinIO buckets ==="

# Wait for MinIO to be ready
echo "Waiting for MinIO..."
until curl -sf "http://localhost:9000/minio/health/live" >/dev/null 2>&1; do
  sleep 2
done
echo "MinIO ready."

# Use mc via Docker to create buckets
docker run --rm --network jslmind_jslmind \
  minio/mc:latest \
  sh -c "
    mc alias set ${MINIO_ALIAS} http://minio:9000 ${ACCESS_KEY} ${SECRET_KEY} --quiet &&
    mc mb --ignore-existing ${MINIO_ALIAS}/bronze-sap-mm &&
    mc mb --ignore-existing ${MINIO_ALIAS}/silver &&
    mc mb --ignore-existing ${MINIO_ALIAS}/gold &&
    mc mb --ignore-existing ${MINIO_ALIAS}/platinum &&
    echo 'Buckets: bronze-sap-mm, silver, gold, platinum'
  "

echo "=== MinIO seed complete ==="
echo ""
