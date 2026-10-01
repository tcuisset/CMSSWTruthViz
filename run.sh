#!/usr/bin/env bash
# Local development bootstrap for CMSSW Graph Visualization.

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_root"

usage() {
    cat <<'EOF'
Usage: ./run.sh [options]

Prepare local JavaScript, Python, and CMSSW dependencies, then start the server.

Options:
  -h, --help         Show this help message

CMSSW customization:
  TRUTHVIZ_CMSSW_RELEASE       Base release (default: CMSSW_20_1_0_pre3)
  TRUTHVIZ_SCRAM_ARCH          SCRAM architecture (default: el9_amd64_gcc14)
  TRUTHVIZ_CMSSW_TOPIC         Optional fork topic, for example user:branch
  TRUTHVIZ_CMSSW_BUILD_JOBS    Parallel jobs used to build a topic (default: 4)
  TRUTHVIZ_CMSSW_INSTALL_ROOT  Managed-project parent (default: data/cmssw)

Server configuration:
  TRUTHVIZ_SERVER_HOST            Bind host (default: localhost)
  TRUTHVIZ_SERVER_PORT            Port (default: 8009)
  TRUTHVIZ_SERVER_AUTO_FIND_PORT  Set to 0 to require the selected port
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

echo "============================================================"
echo "Truth Graph Viewer: local setup"
echo "============================================================"
echo

if [ ! -f app/vendor/plotly-2.35.2.min.js ]; then
    command -v npm >/dev/null 2>&1 || {
        echo "Error: frontend dependencies are missing and npm was not found." >&2
        echo "Install Node.js 20 or newer, then run 'npm ci && npm run vendor'." >&2
        exit 1
    }
    echo "Installing frontend dependencies..."
    npm ci --ignore-scripts --no-audit --no-fund
    npm run vendor
fi

python_candidates="python3 python3.14 python3.13 python3.12 python3.11 python3.10 python3.9"
select_python() {
    local candidate
    for candidate in "${TRUTHVIZ_PYTHON:-}" $python_candidates; do
        [ -n "$candidate" ] || continue
        command -v "$candidate" >/dev/null 2>&1 || continue
        if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    return 1
}

venv_python="$project_root/venv/bin/python"
if [ ! -x "$venv_python" ] || ! "$venv_python" -m pip --version >/dev/null 2>&1; then
    python_bin="$(select_python)" || {
        echo "Error: Python 3.9 or newer was not found." >&2
        exit 1
    }
    if [ -d venv ]; then
        "$python_bin" -m venv --clear venv
    else
        "$python_bin" -m venv venv
    fi
fi

if ! "$venv_python" -c 'import networkx, particle, uproot' 2>/dev/null; then
    echo "Installing Python dependencies..."
    "$venv_python" -m pip install -q -r requirements.txt
fi

cmsset_default="${CMSSET_DEFAULT:-/cvmfs/cms.cern.ch/cmsset_default.sh}"
release="${TRUTHVIZ_CMSSW_RELEASE:-CMSSW_20_1_0_pre3}"
arch="${TRUTHVIZ_SCRAM_ARCH:-el9_amd64_gcc14}"
topic="${TRUTHVIZ_CMSSW_TOPIC:-}"
install_root="${TRUTHVIZ_CMSSW_INSTALL_ROOT:-$project_root/data/cmssw}"

find_truthinfo_src() {
    local candidate="$1"
    if [ -f "$candidate/PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py" ]; then
        printf '%s\n' "$candidate"
        return 0
    fi
    return 1
}

if [ -z "${TRUTHVIZ_CMSSW_SRC:-}" ] && [ -z "${CMSSW_BASE:-}" ]; then
    cmssw_src=""
    if [ -n "$topic" ]; then
        if [ "${TRUTHVIZ_SKIP_CMSSW_INSTALL:-0}" != 1 ]; then
            "$project_root/scripts/install-cmssw.sh" \
                --release "$release" \
                --arch "$arch" \
                --install-root "$install_root" \
                --topic "$topic" \
                --jobs "${TRUTHVIZ_CMSSW_BUILD_JOBS:-4}"
            cmssw_src="$install_root/$release/src"
        fi
    else
        for candidate in \
            "$project_root/../$release/src" \
            "$project_root/$release/src" \
            "$install_root/$release/src" \
            "/cvmfs/cms.cern.ch/$arch/cms/cmssw/$release/src"; do
            if cmssw_src="$(find_truthinfo_src "$candidate")"; then
                break
            fi
            cmssw_src=""
        done
        if [ -z "$cmssw_src" ] && [ "${TRUTHVIZ_SKIP_CMSSW_INSTALL:-0}" != 1 ] && [ -r "$cmsset_default" ]; then
            "$project_root/scripts/install-cmssw.sh" \
                --release "$release" \
                --arch "$arch" \
                --install-root "$install_root"
            cmssw_src="$install_root/$release/src"
        fi
    fi

    if [ -n "$cmssw_src" ]; then
        export TRUTHVIZ_CMSSW_SRC="$cmssw_src"
        echo "Using TRUTHVIZ_CMSSW_SRC=$TRUTHVIZ_CMSSW_SRC"
    elif [ "${TRUTHVIZ_SKIP_CMSSW_INSTALL:-0}" != 1 ]; then
        echo "Warning: no usable CMSSW source area was found; ROOT processing is unavailable." >&2
    fi
fi

if [ -r "$cmsset_default" ]; then
    export VO_CMS_SW_DIR="${VO_CMS_SW_DIR:-/cvmfs/cms.cern.ch}"
    set +u
    # shellcheck disable=SC1090
    source "$cmsset_default"
    set -u
fi

if [ -z "${TRUTHVIZ_CMSRUN_WRAPPER:-}" ]; then
    scram_arch=""
    if command -v scram >/dev/null 2>&1; then
        scram_arch="$(scram arch 2>/dev/null || true)"
    fi
    if [[ "$scram_arch" != el9* ]] && command -v cmssw-el9 >/dev/null 2>&1; then
        export TRUTHVIZ_CMSRUN_WRAPPER=cmssw-el9
        echo "Using TRUTHVIZ_CMSRUN_WRAPPER=cmssw-el9 for local ROOT jobs"
    fi
fi

echo
echo "Starting web server..."
exec "${TRUTHVIZ_SERVER_PYTHON:-$project_root/venv/bin/python}" "$project_root/server.py"
