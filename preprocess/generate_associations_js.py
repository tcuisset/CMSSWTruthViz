#!/usr/bin/env python3
"""Generate associations.js from associations.json for static mode.

A page opened as a file cannot fetch data/associations.json, so the reco objects and
their matches are embedded the same way the graph bundle and the rechits are.
"""

import json
import sys
from pathlib import Path


def generate_associations_js(json_path, output_path):
    json_path = Path(json_path)
    output_path = Path(output_path)
    if not json_path.exists():
        print(f"No {json_path}, nothing to embed")
        return

    with open(json_path, encoding="utf-8") as handle:
        data = json.load(handle)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        handle.write(
            "/**\n"
            " * associations.js - Embedded reco to truth associations for static mode\n"
            " * Auto-generated from associations.json\n"
            " */\n\n"
            f"window.EMBEDDED_ASSOCIATION_DATA = {json.dumps(data, separators=(',', ':'))};\n\n"
            "console.log('Embedded association data loaded:', {\n"
            "    recoObjects: window.EMBEDDED_ASSOCIATION_DATA.recoObjects?.length || 0\n"
            "});\n"
        )
    print(f"Wrote {output_path} ({output_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "data" / "associations.json"
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "app" / "js" / "associations.js"
    generate_associations_js(src, dst)
