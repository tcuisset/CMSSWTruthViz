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
set +u
# shellcheck disable=SC1090
source "$cmsset_default"
set -u

cmssw_src="${TRUTHVIZ_CMSSW_SRC:-}"
if [ -z "$cmssw_src" ] && [ -n "${CMSSW_BASE:-}" ]; then
    cmssw_src="$CMSSW_BASE/src"
fi
if [ -z "$cmssw_src" ]; then
    echo "Error: production requires TRUTHVIZ_CMSSW_SRC or CMSSW_BASE." >&2
    exit 1
fi
if [ ! -f "$cmssw_src/PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py" ]; then
    echo "Error: configured CMSSW area does not contain PhysicsTools/TruthInfo: $cmssw_src" >&2
    exit 1
fi

exec "$project_root/scripts/start-server.sh"
