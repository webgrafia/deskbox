#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Launch Electron with hardware acceleration enabled
exec ./node_modules/.bin/electron . "$@"
