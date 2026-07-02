#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-}"
TARGET_DIR="${2:-}"

if [[ -z "$SOURCE_DIR" || -z "$TARGET_DIR" ]]; then
  echo "Usage: bash tools/safe-copy-overlay.sh <overlay-source-dir> <target-repo-dir>"
  exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source directory does not exist: $SOURCE_DIR"
  exit 1
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Target directory does not exist: $TARGET_DIR"
  exit 1
fi

cd "$SOURCE_DIR"

# Exclude the script itself from being copied into target if it already exists.
mapfile -t FILES < <(find . -type f | sort)

for file in "${FILES[@]}"; do
  rel="${file#./}"
  target="$TARGET_DIR/$rel"

  if [[ "$rel" == "ACCESS_CONTROL_OVERLAY_README.md" ]]; then
    # This file is useful to keep in the repo only if not present.
    :
  fi

  if [[ -e "$target" ]]; then
    echo "Collision: $rel already exists in target. No files copied."
    echo "Resolve manually or remove the colliding file from overlay."
    exit 2
  fi
done

for file in "${FILES[@]}"; do
  rel="${file#./}"
  target="$TARGET_DIR/$rel"
  mkdir -p "$(dirname "$target")"
  cp "$file" "$target"
  echo "Added: $rel"
done

echo "Overlay copied successfully. No existing files were overwritten."
