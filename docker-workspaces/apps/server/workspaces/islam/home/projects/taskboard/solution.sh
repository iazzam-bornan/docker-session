#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOLUTIONS_DIR="$ROOT_DIR/solutions"

copy_if_exists() {
  local source_path="$1"
  local target_path="$2"

  if [[ -f "$source_path" ]]; then
    cp "$source_path" "$target_path"
    echo "updated $(basename "$target_path")"
  fi
}

copy_if_exists "$SOLUTIONS_DIR/backend.Dockerfile" "$ROOT_DIR/backend/Dockerfile"
copy_if_exists "$SOLUTIONS_DIR/frontend.Dockerfile" "$ROOT_DIR/frontend/Dockerfile"
copy_if_exists "$SOLUTIONS_DIR/docker-compose.yml" "$ROOT_DIR/docker-compose.yml"

echo
echo "Solution files copied into place."
echo "Next:"
echo "  docker compose up --build"
