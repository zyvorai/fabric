#!/usr/bin/env bash
# CI smoke: build vmspawnd, start on localhost, run audit-ux-apis.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND="$REPO/backend"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/vmspawnd-ci.XXXXXX")"
BIN="$BACKEND/target/release/vmspawnd"
API_HOST="http://127.0.0.1:19095"
API_PORT="19095"
ADMIN_PASS="${VMSPAWND_ADMIN_PASSWORD:-ci-audit-password}"
JWT_SECRET="${VMSPAWND_JWT_SECRET:-ci-audit-jwt-secret-for-github-actions}"

cleanup() {
  if [[ -n "${DAEMON_PID:-}" ]] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    kill "$DAEMON_PID" 2>/dev/null || true
    wait "$DAEMON_PID" 2>/dev/null || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

mkdir -p "$WORKDIR/data/images"

cat > "$WORKDIR/vmspawnd.toml" <<EOF
[daemon]
listen = "127.0.0.1:${API_PORT}"

[storage]
path = "$WORKDIR/data"
image_path = "$WORKDIR/data/images"

[network]
bridge = "br0"

[auth]
enabled = true
jwt_secret = "$JWT_SECRET"
db_path = "$WORKDIR/data/auth.db"
default_admin_password = "$ADMIN_PASS"
EOF

echo "==> Building vmspawnd (release)..."
(cd "$BACKEND" && cargo build --release -p vmspawnd)

echo "==> Starting vmspawnd (config: $WORKDIR/vmspawnd.toml)..."
export VMSPAWND_CONFIG="$WORKDIR/vmspawnd.toml"
export VMSPAWND_ADMIN_PASSWORD="$ADMIN_PASS"
export VMSPAWND_JWT_SECRET="$JWT_SECRET"
"$BIN" >"$WORKDIR/vmspawnd.log" 2>&1 &
DAEMON_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -sf "$API_HOST/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$DAEMON_PID" 2>/dev/null; then
    echo "vmspawnd exited early:" >&2
    cat "$WORKDIR/vmspawnd.log" >&2 || true
    exit 1
  fi
  sleep 0.5
done

if [[ "$ready" -ne 1 ]]; then
  echo "vmspawnd failed to become ready:" >&2
  cat "$WORKDIR/vmspawnd.log" >&2 || true
  exit 1
fi

echo "==> Running UX API audit..."
VMSPAWN_USER=admin VMSPAWN_PASS="$ADMIN_PASS" "$SCRIPT_DIR/audit-ux-apis.sh" "$API_HOST"

echo "==> POST smoke tests..."
VMSPAWN_USER=admin VMSPAWN_PASS="$ADMIN_PASS" "$SCRIPT_DIR/audit-ux-apis-post.sh" "$API_HOST"

echo "==> API prefix parity (/api vs /api/v1)..."
VMSPAWN_USER=admin VMSPAWN_PASS="$ADMIN_PASS" "$SCRIPT_DIR/test-api-prefix-parity.sh" "$API_HOST"

echo "==> OpenAPI tier-1 coverage..."
python3 "$SCRIPT_DIR/check-openapi-coverage.py"

echo "==> CI API audit passed"
