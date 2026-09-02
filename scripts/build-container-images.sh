#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Build the two local images docker-compose.yml expects: zyvor-fabricd's own
# (a plain single-context build) and ephemera's (which needs the sibling
# guestkit repo as a second BuildKit build context -- not something a
# docker-compose.yml `build:` block can express portably across Docker
# Compose and Podman Compose versions, so it's built here instead).
#
# Usage:
#   ./scripts/build-container-images.sh
#   BUILDER=docker ./scripts/build-container-images.sh
#   EPHEMERA_DIR=/path/to/Ephemera GUESTKIT_DIR=/path/to/guestkit ./scripts/build-container-images.sh
#
# Prerequisites: Ephemera and guestkit checked out as sibling directories to
# this repo (../Ephemera, ../guestkit) unless overridden above -- the same
# layout Ephemera's own Dockerfile and CI already assume.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILDER="${BUILDER:-podman}"
TAG="${TAG:-local}"
EPHEMERA_DIR="${EPHEMERA_DIR:-${ROOT}/../Ephemera}"
GUESTKIT_DIR="${GUESTKIT_DIR:-${ROOT}/../guestkit}"

if ! command -v "${BUILDER}" >/dev/null; then
  echo "ERROR: ${BUILDER} not found" >&2
  exit 1
fi

if [[ ! -d "${EPHEMERA_DIR}" ]]; then
  echo "ERROR: Ephemera not found at ${EPHEMERA_DIR} (set EPHEMERA_DIR)" >&2
  exit 1
fi

if [[ ! -d "${GUESTKIT_DIR}" ]]; then
  echo "ERROR: guestkit not found at ${GUESTKIT_DIR} (set GUESTKIT_DIR)" >&2
  exit 1
fi

build_args=()
if [[ "${BUILDER}" == "podman" ]]; then
  build_args+=(--format docker)
fi

echo "=== Building zyvor-fabricd:${TAG} ==="
"${BUILDER}" build "${build_args[@]}" -t "zyvor-fabricd:${TAG}" "${ROOT}"

echo "=== Building zyvor-fabric-ephemera:${TAG} (context: ${EPHEMERA_DIR}, +guestkit: ${GUESTKIT_DIR}) ==="
"${BUILDER}" build "${build_args[@]}" \
  --build-context "guestkit=${GUESTKIT_DIR}" \
  -t "zyvor-fabric-ephemera:${TAG}" \
  -f "${EPHEMERA_DIR}/Dockerfile" \
  "${EPHEMERA_DIR}"

echo ""
echo "=== Built ==="
echo "  zyvor-fabricd:${TAG}"
echo "  zyvor-fabric-ephemera:${TAG}"
echo ""
echo "Run: docker compose up -d   (or: podman compose up -d)"
