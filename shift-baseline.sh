#!/usr/bin/env bash
set -euo pipefail
shift_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$shift_root/scripts/shift-baseline.mjs" "$@"
