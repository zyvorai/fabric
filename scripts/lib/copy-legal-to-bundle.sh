#!/usr/bin/env bash
# Copy Zyvor legal pack into a customer bundle stage directory.
# Usage: copy-legal-to-bundle.sh <stage-dir> <repo-root>
set -euo pipefail

STAGE="${1:?stage directory}"
ROOT="${2:?repo root}"
LEGAL_SRC="${ROOT}/docs/legal"

if [[ ! -f "${ROOT}/LICENSE" ]]; then
  echo "ERROR: missing LICENSE at ${ROOT}/LICENSE" >&2
  exit 1
fi

mkdir -p "${STAGE}/legal/templates"
cp "${ROOT}/LICENSE" "${STAGE}/LICENSE"

for f in README.md CORPORATE.md TRADEMARK-NOTICE.md LICENSING-MODEL.md PROPRIETARY-POLICY.md PRODUCT-MATRIX.md; do
  if [[ -f "${LEGAL_SRC}/${f}" ]]; then
    cp "${LEGAL_SRC}/${f}" "${STAGE}/legal/${f}"
  fi
done

if [[ -d "${LEGAL_SRC}/templates" ]]; then
  cp -R "${LEGAL_SRC}/templates/." "${STAGE}/legal/templates/"
fi

# Plain-text index for customers who open the tarball without Markdown tooling
if [[ -f "${STAGE}/legal/README.md" ]]; then
  cp "${STAGE}/legal/README.md" "${STAGE}/legal/LEGAL-INDEX.md"
  {
    echo "ZyvorAI Labs — legal pack (draft templates; attorney review required)"
    echo "Licensor: ZyvorAI Labs Private Limited | info@zyvor.dev | https://zyvor.dev"
    echo ""
    echo "FILES:"
    echo "  LICENSE              — deploy/install EULA (accept before use)"
    echo "  legal/CORPORATE.md   — company registration reference"
    echo "  legal/LEGAL-INDEX.md — full framework index (Markdown)"
    echo "  legal/templates/     — MSA, ELA, SLA, DPA, Order Form, AUP, Export (drafts)"
    echo ""
    echo "Enterprise sales: execute MSA + Order Form + ELA; add SLA/DPA as needed."
  } > "${STAGE}/LEGAL-INDEX.txt"
fi

echo "Legal pack copied to ${STAGE}/legal/ and LEGAL-INDEX.txt"
