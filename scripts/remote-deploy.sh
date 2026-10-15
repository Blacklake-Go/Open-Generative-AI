#!/usr/bin/env bash
set -Eeuo pipefail

echo "REFUSED: legacy remote deployment is disabled. Use the validated scripts/deploy.sh release gate." >&2
exit 2
