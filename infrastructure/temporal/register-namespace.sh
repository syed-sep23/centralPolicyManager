#!/bin/sh
set -eu

TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-temporal:7233}"
NAMESPACE="${NAMESPACE:-default}"
RETENTION="${RETENTION:-72h}"

echo "=============================================="
echo "  Temporal Namespace Registration"
echo "=============================================="

echo "[1/2] Waiting for Temporal server at $TEMPORAL_ADDRESS..."
MAX_RETRIES=60
RETRY_COUNT=0
until temporal operator cluster health --address "$TEMPORAL_ADDRESS" 2>/dev/null | grep -q SERVING; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    echo "ERROR: Temporal server not ready after $MAX_RETRIES attempts. Exiting."
    exit 1
  fi
  echo "  Attempt $RETRY_COUNT/$MAX_RETRIES - Temporal not ready, retrying in 3s..."
  sleep 3
done
echo "  -> Temporal server is SERVING"

echo "[2/2] Registering namespace: $NAMESPACE (retention: $RETENTION)"
if temporal operator namespace describe --namespace "$NAMESPACE" --address "$TEMPORAL_ADDRESS" > /dev/null 2>&1; then
  echo "  -> Namespace '$NAMESPACE' already exists (skipped)"
else
  temporal operator namespace create \
    --namespace "$NAMESPACE" \
    --address "$TEMPORAL_ADDRESS" \
    --retention "$RETENTION" \
    --description "CES workflow namespace"
  echo "  -> Namespace '$NAMESPACE' registered successfully"
fi

echo "=============================================="
echo "  Namespace registration complete"
echo "=============================================="
