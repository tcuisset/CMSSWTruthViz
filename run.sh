#!/bin/bash
# Quick start script for CMSSW Graph Visualization

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

usage() {
    cat <<EOF
Usage: ./run.sh [options]

Options:
  -d, --dot FILE     DOT file to use when generating data/bundle.json
  -h, --help         Show this help message

If --dot is omitted, the script uses the first existing file from:
  ./truthgraph.dot
  ../truthgraph.dot
  ./dependency.gv
EOF
}

DOT_FILE=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        -d|--dot)
            if [ "$#" -lt 2 ]; then
                echo "Error: $1 requires a file path"
                echo ""
                usage
                exit 1
            fi
            DOT_FILE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: Unknown option: $1"
            echo ""
            usage
            exit 1
            ;;
    esac
done

resolve_path() {
    local path="$1"
    if command -v realpath >/dev/null 2>&1; then
        realpath "$path"
    else
        python3 -c 'import os, sys; print(os.path.abspath(sys.argv[1]))' "$path"
    fi
}

select_default_dot_file() {
    local candidate
    for candidate in "truthgraph.dot" "../truthgraph.dot" "dependency.gv"; do
        if [ -f "$candidate" ]; then
            echo "$candidate"
            return 0
        fi
    done

    echo "truthgraph.dot"
}

if [ -z "$DOT_FILE" ]; then
    DOT_FILE="$(select_default_dot_file)"
fi

if [ ! -f "$DOT_FILE" ]; then
    echo "Error: DOT file not found: $DOT_FILE"
    echo ""
    usage
    exit 1
fi

DOT_FILE_ABS="$(resolve_path "$DOT_FILE")"
BUNDLE_PATH="data/bundle.json"
BUNDLE_SOURCE_PATH="data/.bundle.source"

echo "============================================================"
echo "CMSSW Module Dependency Graph Visualization"
echo "============================================================"
echo ""
echo "Using DOT file: $DOT_FILE_ABS"
echo ""

# The app needs Python 3.9 or newer. The system python3 can be older.
PYTHON_CANDIDATES="python3 python3.14 python3.13 python3.12 python3.11 python3.10 python3.9"

select_python() {
    local candidate
    for candidate in "${TRUTHVIZ_PYTHON:-}" $PYTHON_CANDIDATES; do
        [ -n "$candidate" ] || continue
        command -v "$candidate" >/dev/null 2>&1 || continue
        if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

report_python_candidates() {
    local candidate version
    for candidate in $PYTHON_CANDIDATES; do
        if command -v "$candidate" >/dev/null 2>&1; then
            version="$("$candidate" -V 2>&1)"
            echo "  $candidate: $version"
        fi
    done
}

# Check if virtual environment exists
VENV_PYTHON="venv/bin/python"
if [ ! -x "$VENV_PYTHON" ] || ! "$VENV_PYTHON" -m pip --version >/dev/null 2>&1; then
    if ! PYTHON_BIN="$(select_python)"; then
        echo "Error: no python3 of version 3.9 or newer was found."
        echo "Interpreters on this machine:"
        report_python_candidates
        echo "Install one, for example 'sudo apt install python3-venv', or set"
        echo "TRUTHVIZ_PYTHON to a suitable interpreter."
        exit 1
    fi
    if [ -d "venv" ]; then
        echo "Rebuilding incompatible virtual environment with $PYTHON_BIN..."
        "$PYTHON_BIN" -m venv --clear venv
    else
        echo "Creating virtual environment with $PYTHON_BIN..."
        "$PYTHON_BIN" -m venv venv
    fi
    echo "✓ Virtual environment created"
    echo ""
fi

# Check if dependencies are installed
echo "Checking dependencies..."
if ! "$VENV_PYTHON" -c "import networkx" 2>/dev/null; then
    echo "Installing Python dependencies..."
    "$VENV_PYTHON" -m pip install -q -r preprocess/requirements.txt
    echo "✓ Dependencies installed"
else
    echo "✓ Dependencies already installed"
fi
echo ""

CMSSET_DEFAULT="${CMSSET_DEFAULT:-/cvmfs/cms.cern.ch/cmsset_default.sh}"
if [ -z "${TRUTHVIZ_CMSRUN_WRAPPER:-}" ]; then
    if [ -r "$CMSSET_DEFAULT" ]; then
        export VO_CMS_SW_DIR="${VO_CMS_SW_DIR:-/cvmfs/cms.cern.ch}"
        # shellcheck source=/cvmfs/cms.cern.ch/cmsset_default.sh
        source "$CMSSET_DEFAULT"
    fi

    scram_arch=""
    if command -v scram >/dev/null 2>&1; then
        scram_arch="$(scram arch 2>/dev/null || true)"
    fi

    if [[ "$scram_arch" != el9* ]]; then
        if command -v cmssw-el9 >/dev/null 2>&1; then
            export TRUTHVIZ_CMSRUN_WRAPPER="cmssw-el9"
            if [ -n "$scram_arch" ]; then
                echo "Using TRUTHVIZ_CMSRUN_WRAPPER=$TRUTHVIZ_CMSRUN_WRAPPER for local cmsRun jobs because scram arch is $scram_arch"
            else
                echo "Using TRUTHVIZ_CMSRUN_WRAPPER=$TRUTHVIZ_CMSRUN_WRAPPER for local cmsRun jobs because scram arch is unavailable"
            fi
            echo ""
        elif [ -n "$scram_arch" ]; then
            echo "Warning: scram arch is $scram_arch, but cmssw-el9 was not found; local cmsRun jobs may fail."
            echo ""
        else
            echo "Warning: scram arch is unavailable and cmssw-el9 was not found; local cmsRun jobs may fail."
            echo ""
        fi
    fi
fi

# When the DOT comes from a prepared event folder, load the associations and the rechit
# table of that same event, so the reco objects and the 3D panel are there as well.
EVENT_DIR="$(dirname "$DOT_FILE_ABS")"
EVENT_SOURCE_PATH="data/.event.source"
if [ -f "$EVENT_DIR/event.json" ] && [ -f "$EVENT_DIR/trackster_associations.json" ]; then
    mkdir -p data
    if [ ! -f "$EVENT_SOURCE_PATH" ] || [ "$(cat "$EVENT_SOURCE_PATH")" != "$EVENT_DIR" ] \
            || [ ! -f data/associations.json ]; then
        echo "Loading the associations and the rechits of $(basename "$EVENT_DIR")..."
        cp "$EVENT_DIR/trackster_associations.json" data/associations.json
        if [ -f "$EVENT_DIR/rechits_nano.root" ]; then
            event_index=$("$VENV_PYTHON" -c "import json; print(json.load(open('$EVENT_DIR/event.json'))['eventIndex'])")
            "$VENV_PYTHON" preprocess/build_rechits_json.py "$EVENT_DIR/rechits_nano.root" \
                data/rechits.json --event-index "$event_index" > /dev/null
        fi
        printf '%s\n' "$EVENT_DIR" > "$EVENT_SOURCE_PATH"
        rm -f app/js/associations.js app/js/rechits.js
        echo ""
    fi
fi

should_build_bundle=false
if [ ! -f "$BUNDLE_PATH" ]; then
    echo "Bundle not found. Generating from selected DOT file..."
    should_build_bundle=true
elif [ ! -f "$BUNDLE_SOURCE_PATH" ]; then
    echo "Bundle source marker not found. Regenerating from selected DOT file..."
    should_build_bundle=true
elif [ "$(cat "$BUNDLE_SOURCE_PATH")" != "$DOT_FILE_ABS" ]; then
    echo "Selected DOT file differs from the bundle source. Regenerating bundle..."
    should_build_bundle=true
elif [ "$DOT_FILE_ABS" -nt "$BUNDLE_PATH" ]; then
    echo "Selected DOT file is newer than the bundle. Regenerating bundle..."
    should_build_bundle=true
elif [ "preprocess/parse_graph.py" -nt "$BUNDLE_PATH" ] || [ "preprocess/build_bundle.py" -nt "$BUNDLE_PATH" ]; then
    # The bundle records the fields the preprocessing knew about when it ran. After
    # an update the DOT file is unchanged, so only the code timestamp reveals that
    # the bundle is stale.
    echo "Preprocessing is newer than the bundle. Regenerating bundle..."
    should_build_bundle=true
else
    echo "✓ Bundle is up to date"
fi

if [ "$should_build_bundle" = true ]; then
    echo ""
    "$VENV_PYTHON" preprocess/build_bundle.py "$DOT_FILE_ABS" "$BUNDLE_PATH"
    mkdir -p data
    printf '%s\n' "$DOT_FILE_ABS" > "$BUNDLE_SOURCE_PATH"
    echo ""
fi

# Generate bundle.js for static mode
if [ ! -f "app/js/bundle.js" ] || [ "data/bundle.json" -nt "app/js/bundle.js" ]; then
    echo "Generating bundle.js for static mode..."
    "$VENV_PYTHON" preprocess/generate_bundle_js.py
    echo ""
fi

# Same for the associations, so a page opened as a file shows the reco objects too.
if [ -f "data/associations.json" ] && { [ ! -f "app/js/associations.js" ] \
        || [ "data/associations.json" -nt "app/js/associations.js" ]; }; then
    "$VENV_PYTHON" preprocess/generate_associations_js.py
fi

if [ -f "data/rechits.json" ] && { [ ! -f "app/js/rechits.js" ] \
        || [ "data/rechits.json" -nt "app/js/rechits.js" ]; }; then
    "$VENV_PYTHON" -c "
import json, sys
sys.path.insert(0, 'preprocess')
from build_rechits_json import write_js
write_js(json.load(open('data/rechits.json')), __import__('pathlib').Path('app/js/rechits.js'))
print('Wrote app/js/rechits.js')
"
fi

# Start server
echo ""
echo "Starting web server..."
echo "============================================================"
echo ""
"$VENV_PYTHON" server.py
