#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cmsset_default="${CMSSET_DEFAULT:-/cvmfs/cms.cern.ch/cmsset_default.sh}"

if [ ! -r "$cmsset_default" ]; then
    echo "Error: CMS environment bootstrap is unavailable: $cmsset_default" >&2
    echo "Mount /cvmfs/cms.cern.ch in the production container." >&2
    exit 1
fi

export VO_CMS_SW_DIR="${VO_CMS_SW_DIR:-/cvmfs/cms.cern.ch}"
# cmsset_default supplies scram/cmsRun and the site configuration used by jobs.
set +u
# shellcheck disable=SC1090
source "$cmsset_default"
set -u

release="${TRUTHVIZ_CMSSW_RELEASE:-CMSSW_20_1_0_pre3}"
arch="${TRUTHVIZ_SCRAM_ARCH:-el9_amd64_gcc14}"
topic="${TRUTHVIZ_CMSSW_TOPIC:-}"
cmssw_src="${TRUTHVIZ_CMSSW_SRC:-}"
if [ -z "$cmssw_src" ] && [ -n "${CMSSW_BASE:-}" ]; then
    cmssw_src="$CMSSW_BASE/src"
fi

# A topic requests a local fork project. Stock releases use the read-only
# upstream CVMFS tree below and never need a startup installation.
if [ -n "$topic" ] && [ -z "$cmssw_src" ]; then
    if [ -n "${TRUTHVIZ_CMSSW_INSTALL_ROOT:-}" ]; then
        install_root="$TRUTHVIZ_CMSSW_INSTALL_ROOT"
    elif [ -n "${TRUTHVIZ_JOB_ROOT:-}" ]; then
        install_root="$(dirname "$TRUTHVIZ_JOB_ROOT")/cmssw"
    else
        install_root="$project_root/data/cmssw"
    fi

    project_dir="$install_root/$release"
    fork_src="$project_dir/src"
    topic_marker="$project_dir/.truthviz-topic"
    if [ -f "$topic_marker" ] && [ "$(<"$topic_marker")" = "$topic" ] && \
        [ -f "$fork_src/PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py" ]; then
        cmssw_src="$fork_src"
    elif [ "${TRUTHVIZ_SKIP_CMSSW_INSTALL:-0}" = 1 ]; then
        echo "Error: TRUTHVIZ_CMSSW_TOPIC is set but CMSSW installation is disabled." >&2
        exit 1
    else
        mkdir -p "$install_root"
        # Only fork installs need coordination: several replicas may start
        # against the same persistent volume at the same time.
        lock_dir="$install_root/.truthviz-install-$release.lock"
        while ! mkdir "$lock_dir" 2>/dev/null; do
            echo "Waiting for CMSSW fork installation lock: $lock_dir"
            sleep 10
            if [ -f "$topic_marker" ] && [ "$(<"$topic_marker")" = "$topic" ] && \
                [ -f "$fork_src/PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py" ]; then
                cmssw_src="$fork_src"
                break
            fi
        done

        if [ -z "$cmssw_src" ]; then
            trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT
            echo "Installing CMSSW $release with topic $topic into $install_root"
            "$project_root/scripts/install-cmssw.sh" \
                --release "$release" \
                --arch "$arch" \
                --install-root "$install_root" \
                --topic "$topic" \
                --jobs "${TRUTHVIZ_CMSSW_BUILD_JOBS:-4}"
            cmssw_src="$fork_src"
            rmdir "$lock_dir" 2>/dev/null || true
            trap - EXIT
        fi
    fi
fi

if [ -z "$cmssw_src" ]; then
    # With no explicit area or topic, run directly from the configured release.
    cmssw_src="/cvmfs/cms.cern.ch/$arch/cms/cmssw/$release/src"
fi
if [ ! -f "$cmssw_src/PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py" ]; then
    echo "Error: configured CMSSW area does not contain PhysicsTools/TruthInfo: $cmssw_src" >&2
    exit 1
fi
export TRUTHVIZ_CMSSW_SRC="$cmssw_src"

exec "$project_root/scripts/start-server.sh"
