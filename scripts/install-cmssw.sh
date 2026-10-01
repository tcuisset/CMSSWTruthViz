#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: scripts/install-cmssw.sh [options]

Create a CMSSW project from an upstream release and optionally rebase a fork
topic on top of it.

Options:
  --release RELEASE     Base CMSSW release
  --arch ARCH           SCRAM architecture
  --install-root DIR    Parent directory for the CMSSW project
  --topic USER:BRANCH   Fork topic passed to `git cms-rebase-topic`
  --jobs N              Parallel jobs for `scram b` (default: 4)
  -h, --help            Show this help

The corresponding TRUTHVIZ_CMSSW_RELEASE, TRUTHVIZ_SCRAM_ARCH,
TRUTHVIZ_CMSSW_INSTALL_ROOT, TRUTHVIZ_CMSSW_TOPIC, and
TRUTHVIZ_CMSSW_BUILD_JOBS environment variables provide the defaults.
EOF
}

release="${TRUTHVIZ_CMSSW_RELEASE:-CMSSW_20_1_0_pre3}"
arch="${TRUTHVIZ_SCRAM_ARCH:-el9_amd64_gcc14}"
install_root="${TRUTHVIZ_CMSSW_INSTALL_ROOT:-}"
topic="${TRUTHVIZ_CMSSW_TOPIC:-}"
jobs="${TRUTHVIZ_CMSSW_BUILD_JOBS:-4}"
cmsset_default="${CMSSET_DEFAULT:-/cvmfs/cms.cern.ch/cmsset_default.sh}"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --release|--arch|--install-root|--topic|--jobs)
            [ "$#" -ge 2 ] || { echo "Error: $1 requires a value" >&2; exit 2; }
            case "$1" in
                --release) release="$2" ;;
                --arch) arch="$2" ;;
                --install-root) install_root="$2" ;;
                --topic) topic="$2" ;;
                --jobs) jobs="$2" ;;
            esac
            shift 2
            ;;
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

[ -n "$install_root" ] || { echo "Error: --install-root is required" >&2; exit 2; }
[[ "$jobs" =~ ^[1-9][0-9]*$ ]] || { echo "Error: --jobs must be a positive integer" >&2; exit 2; }
[ -r "$cmsset_default" ] || { echo "Error: CMS bootstrap is unavailable: $cmsset_default" >&2; exit 1; }

project_dir="$install_root/$release"
src_dir="$project_dir/src"
marker="$project_dir/.truthviz-topic"

if [ -d "$project_dir/.SCRAM" ]; then
    installed_topic=""
    if [ -f "$marker" ]; then
        installed_topic="$(<"$marker")"
    elif [ -n "$topic" ]; then
        echo "Error: existing project has no TruthViz topic marker: $project_dir" >&2
        echo "Use a different --install-root for topic $topic." >&2
        exit 1
    fi
    if [ "$installed_topic" != "$topic" ]; then
        echo "Error: existing project topic '$installed_topic' does not match '$topic': $project_dir" >&2
        echo "Use a different --install-root for the requested configuration." >&2
        exit 1
    fi
    if [ ! -f "$src_dir/PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py" ]; then
        echo "Error: existing project does not expose PhysicsTools/TruthInfo: $project_dir" >&2
        exit 1
    fi
    printf '%s\n' "$src_dir"
    exit 0
fi

if [ -e "$project_dir" ]; then
    echo "Error: incomplete CMSSW project already exists: $project_dir" >&2
    exit 1
fi

mkdir -p "$install_root"
export SCRAM_ARCH="$arch"
export VO_CMS_SW_DIR="${VO_CMS_SW_DIR:-/cvmfs/cms.cern.ch}"
set +u
# shellcheck disable=SC1090
source "$cmsset_default"
set -u

(
    cd "$install_root"
    cmsrel "$release"
)

(
    cd "$src_dir"
    set +u
    eval "$(scram runtime -sh)"
    set -u

    if [ -n "$topic" ]; then
        git cms-rebase-topic "$topic"
        scram b -j "$jobs"
    fi

    release_truth_info="$CMSSW_RELEASE_BASE/src/PhysicsTools/TruthInfo"
    if [ ! -f "$release_truth_info/test/dumpTruthGraphsFromGENSIMRECO_cfg.py" ]; then
        echo "Error: PhysicsTools/TruthInfo is missing from $CMSSW_RELEASE_BASE" >&2
        exit 1
    fi
    mkdir -p PhysicsTools
    if [ ! -e PhysicsTools/TruthInfo ]; then
        ln -s "$release_truth_info" PhysicsTools/TruthInfo
    fi
)

printf '%s' "$topic" > "$marker"
printf '%s\n' "$src_dir"
