#!/usr/bin/env bash
# Create or update the Fabric Kubernetes credentials Secret (not systemd files).
#
# Defaults (new deployments):
#   admin-username = admin
#   admin-password = Admin@321
#
# Usage:
#   ./scripts/k8s-set-admin-secret.sh                 # create if missing
#   ./scripts/k8s-set-admin-secret.sh --apply         # create or replace
#   FABRIC_ADMIN_PASSWORD='Secret!' ./scripts/k8s-set-admin-secret.sh --apply
#   ./scripts/k8s-set-admin-secret.sh --apply --restart
set -euo pipefail

NAMESPACE="${NAMESPACE:-zyvor-fabric}"
SECRET_NAME="${SECRET_NAME:-zyvor-fabric-secrets}"
ADMIN_USER="${FABRIC_ADMIN_USERNAME:-admin}"
ADMIN_PASS="${FABRIC_ADMIN_PASSWORD:-Admin@321}"
APPLY=false
RESTART=false

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --restart) RESTART=true ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

if kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" &>/dev/null && ! $APPLY; then
  echo "Secret ${SECRET_NAME} already exists in ${NAMESPACE} (pass --apply to replace)."
  exit 0
fi

JWT_SECRET="${FABRIC_JWT_SECRET:-$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)}"

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

kubectl create secret generic "${SECRET_NAME}" \
  --from-literal=admin-username="${ADMIN_USER}" \
  --from-literal=admin-password="${ADMIN_PASS}" \
  --from-literal=jwt-secret="${JWT_SECRET}" \
  -n "${NAMESPACE}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Applied Secret/${SECRET_NAME} in ${NAMESPACE}"
echo "  admin-username: ${ADMIN_USER}"
echo "  admin-password: (from FABRIC_ADMIN_PASSWORD or default Admin@321)"

if $RESTART; then
  kubectl -n "${NAMESPACE}" rollout restart daemonset/zyvor-fabricd 2>/dev/null || true
  echo "Restarted daemonset/zyvor-fabricd (password seed only applies when auth.db is empty)."
fi
