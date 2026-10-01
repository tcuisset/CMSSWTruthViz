#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

python_bin="${TRUTHVIZ_SERVER_PYTHON:-$project_root/venv/bin/python}"
if [ ! -x "$python_bin" ]; then
    echo "Error: server Python is not executable: $python_bin" >&2
    exit 1
fi

server_args=(
    --host "${TRUTHVIZ_SERVER_HOST:-localhost}"
    --start-port "${TRUTHVIZ_SERVER_PORT:-8009}"
)

case "${TRUTHVIZ_SERVER_AUTO_FIND_PORT:-1}" in
    0|false|no)
        server_args+=(--no-auto-find-port)
        ;;
    1|true|yes|'')
        ;;
    *)
        echo "Error: TRUTHVIZ_SERVER_AUTO_FIND_PORT must be 0/1, true/false, or yes/no" >&2
        exit 1
        ;;
esac

exec "$python_bin" server.py "${server_args[@]}"
