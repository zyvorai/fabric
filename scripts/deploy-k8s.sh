#!/usr/bin/env bash
# Local / CI deploy: kubectl apply k8s/base for zyvor-fabric.
# Env:
#   BUILD_IMAGES=true  — build zyvor-fabricd (+ fluxvm if siblings present) first
#   IMAGE_TAG=local    — image tag (default local)
#   ADMIN_PASSWORD     — used when creating secret (default: random)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NAMESPACE="zyvor-fabric"
IMAGE_TAG="${IMAGE_TAG:-local}"
NODE_PORT="${NODE_PORT:-30095}"

cd "$REPO_DIR"

echo "Deploying Zyvor Fabric to Kubernetes (namespace=${NAMESPACE})..."

kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/fabricd-configmap.yaml

if ! kubectl get secret zyvor-fabric-secrets -n "${NAMESPACE}" &>/dev/null; then
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18 2>/dev/null || python3 -c 'import secrets; print(secrets.token_urlsafe(18))')}"
  JWT_SECRET="$(openssl rand -base64 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
  kubectl create secret generic zyvor-fabric-secrets \
    --from-literal=admin-password="${ADMIN_PASSWORD}" \
    --from-literal=jwt-secret="${JWT_SECRET}" \
    -n "${NAMESPACE}"
  echo "Created secret zyvor-fabric-secrets (admin password printed once below)."
  echo "  admin-password: ${ADMIN_PASSWORD}"
else
  echo "Secret zyvor-fabric-secrets already exists"
fi

if [ "${BUILD_IMAGES:-}" = "true" ]; then
  echo "Building container images (IMAGE_TAG=${IMAGE_TAG})..."
  TAG="${IMAGE_TAG}" ./scripts/build-container-images.sh || {
    echo "Full image build failed — building zyvor-fabricd only..."
    BUILDER="${BUILDER:-podman}"
    if ! command -v "${BUILDER}" >/dev/null 2>&1; then
      BUILDER=docker
    fi
    "${BUILDER}" build -t "zyvor-fabricd:${IMAGE_TAG}" .
  }
fi

kubectl apply -f k8s/base/fluxvm-daemonset.yaml
kubectl apply -f k8s/base/fabricd-daemonset.yaml
kubectl apply -f k8s/base/fabricd-service.yaml

echo "Waiting for DaemonSets..."
kubectl rollout status daemonset/fluxvm -n "${NAMESPACE}" --timeout=180s || \
  echo "WARN: fluxvm DaemonSet not ready (need /dev/kvm + zyvor-fabric-fluxvm:${IMAGE_TAG})"
kubectl rollout status daemonset/zyvor-fabricd -n "${NAMESPACE}" --timeout=180s

echo ""
echo "Status:"
kubectl get pods,svc -n "${NAMESPACE}"
echo ""
echo "Access:"
echo "  NodePort: http://<node-ip>:${NODE_PORT}/health"
echo "  hostNetwork: http://<node-ip>:9095/health"
echo "  kubectl -n ${NAMESPACE} port-forward ds/zyvor-fabricd 9095:9095"
