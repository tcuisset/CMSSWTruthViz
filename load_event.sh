#!/bin/bash
# Load one prepared event from demo/ into the viewer and start the server.
#
#   ./load_event.sh demo/z_ee
#   ./load_event.sh                 # lists the events
#
# Each demo folder holds one truth graph as DOT, the trackster associations of the same
# event as JSON, the rechit table as NanoAOD, and event.json with the event index inside
# that table. The three files come from one cmsRun job, so the particle indices of the
# JSON refer to the nodes of the DOT next to it.
set -eu
cd "$(dirname "$0")"

if [ $# -lt 1 ]; then
    echo "usage: ./load_event.sh <event folder>"
    echo
    printf '%-18s %-34s %8s %6s  %s\n' folder sample nodes reco "what to look at"
    for meta in demo/*/event.json; do
        python3 - "$meta" <<'EOF'
import json, os, sys
m = json.load(open(sys.argv[1]))
print('%-18s %-34s %8d %6d  %s' % (os.path.dirname(sys.argv[1]), m['sample'], m['nodes'],
                                   m['reco'], m['look'][:70]))
EOF
    done
    exit 1
fi

dir=${1%/}
[ -f "$dir/event.json" ] || { echo "no event.json in $dir"; exit 1; }

dot=$(python3 -c "
import json, sys
m = json.load(open('$dir/event.json'))
print(m['dot'])")

echo "Loading $dir: $dot"
exec ./run.sh --dot "$dir/$dot"
