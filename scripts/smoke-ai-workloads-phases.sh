#!/usr/bin/env bash
# Lab smoke for Fabric AI Workloads Phases 3–6 (dry-run).
# Usage: FABRIC_URL=https://127.0.0.1:8443 ./scripts/smoke-ai-workloads-phases.sh
set -euo pipefail

FABRIC_URL="${FABRIC_URL:-https://127.0.0.1:8443}"
USER="${FABRIC_USER:-admin}"
PASS="${FABRIC_PASS:-}"
if [[ -z "$PASS" && -f /var/lib/zyvor-fabricd/.admin_password ]]; then
  PASS="$(cat /var/lib/zyvor-fabricd/.admin_password)"
fi
PASS="${PASS:?set FABRIC_PASS or admin password file}"

curl_json() {
  curl -sk "$@"
}

echo "== login =="
TOKEN=$(curl_json -X POST "$FABRIC_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" | jq -r .token)
[[ -n "$TOKEN" && "$TOKEN" != null ]]

auth=(-H "authorization: Bearer $TOKEN" -H 'content-type: application/json')
NAME="smoke-phases-$(date +%s)"

echo "== model =="
curl_json -X POST "$FABRIC_URL/api/ai/models" "${auth[@]}" \
  -d "{\"name\":\"$NAME-model\",\"source\":\"hf://Qwen/Qwen3-8B\",\"format\":\"safetensors\"}" | jq -c '{name,source}'

echo "== profile =="
curl_json -X POST "$FABRIC_URL/api/ai/profiles" "${auth[@]}" \
  -d "{\"name\":\"$NAME-profile\",\"runtime\":\"vllm\",\"gpu\":{\"vendor\":\"nvidia\",\"count\":1,\"minimum_vram_gib\":24},\"cpu\":4,\"memory_gib\":16}" | jq -c '{name}'

echo "== deploy =="
curl_json -X POST "$FABRIC_URL/api/ai/deployments" "${auth[@]}" \
  -d "{\"name\":\"$NAME\",\"model\":\"$NAME-model\",\"profile\":\"$NAME-profile\",\"replicas\":2,\"preferred_site\":\"lab\",\"autoscaling\":{\"enabled\":true,\"min_replicas\":1,\"max_replicas\":3,\"scale_out_queue\":5,\"scale_out_seconds\":1,\"scale_in_queue\":1,\"scale_in_seconds\":3600}}" | jq -c '{name,replicas,autoscaling}'

sleep 3
echo "== status =="
curl_json "$FABRIC_URL/api/ai/deployments/$NAME" "${auth[@]}" | jq -c '{phase:.status.phase,replicas:(.status.replicas|length),sites:[.status.replicas[].site]}'

echo "== endpoint =="
curl_json -X POST "$FABRIC_URL/api/ai/endpoints" "${auth[@]}" \
  -d "{\"name\":\"$NAME-ep\",\"deployment\":\"$NAME\",\"protocol\":\"openai\",\"port\":8000,\"routing_strategy\":\"site_local\",\"preferred_site\":\"lab\"}" | jq -c '{name,routing_strategy,preferred_site}'

sleep 12
echo "== metrics =="
curl_json "$FABRIC_URL/api/ai/deployments/$NAME/metrics" "${auth[@]}" | jq -c '{phase,weights:[.replicas[].maglev_weight]}'

echo "== drain =="
curl_json -X POST "$FABRIC_URL/api/ai/deployments/$NAME/drain" "${auth[@]}" \
  -d '{"grace_seconds":5}' | jq -c '{phase:.status.phase,draining:[.status.replicas[].draining]}'

echo "== api key =="
curl_json -X POST "$FABRIC_URL/api/ai/keys" "${auth[@]}" \
  -d "{\"name\":\"$NAME-key\",\"endpoint\":\"$NAME-ep\"}" | jq -c '{id:.key.id,prefix:.key.prefix,secret:(.secret|.[0:12])}'

echo "== cleanup =="
curl_json -X DELETE "$FABRIC_URL/api/ai/endpoints/$NAME-ep" "${auth[@]}" -o /dev/null -w '%{http_code}\n'
# delete keys
for id in $(curl_json "$FABRIC_URL/api/ai/keys" "${auth[@]}" | jq -r --arg n "$NAME-key" '.[]|select(.name==$n)|.id'); do
  curl_json -X DELETE "$FABRIC_URL/api/ai/keys/$id" "${auth[@]}" -o /dev/null
done
curl_json -X DELETE "$FABRIC_URL/api/ai/deployments/$NAME" "${auth[@]}" -o /dev/null -w '%{http_code}\n'
curl_json -X DELETE "$FABRIC_URL/api/ai/profiles/$NAME-profile" "${auth[@]}" -o /dev/null
curl_json -X DELETE "$FABRIC_URL/api/ai/models/$NAME-model" "${auth[@]}" -o /dev/null
echo "OK phases smoke"
