#!/usr/bin/env sh

# FreqDig
# Copyright (c) 2026 Diggercat
# SPDX-License-Identifier: MIT

set -eu

PORT="${1:-8000}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run the local server."
  echo "Download it from https://nodejs.org/"
  exit 1
fi

node scripts/static-server.mjs "$PORT" --open
