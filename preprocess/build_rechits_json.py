#!/usr/bin/env python3
"""
Build rechits JSON data from one event of a ROOT Events tree.
"""

import argparse
import json
import sys
from pathlib import Path


BRANCHES = {
    "ID": "rechits_rechit_ID",
    "x": "rechits_rechit_x",
    "y": "rechits_rechit_y",
    "z": "rechits_rechit_z",
}


def to_float_list(values):
    """Convert one event branch payload to a plain JSON-safe float list."""
    return [float(value) for value in values]


def load_event_rechits(root_path, tree_name="Events", event_index=0):
    try:
        import uproot
    except ImportError as exc:
        raise RuntimeError("uproot is required. Install dependencies from requirements.txt.") from exc

    if event_index < 0:
        raise ValueError(f"Event index must be non-negative, got {event_index}")

    with uproot.open(root_path) as root_file:
        if tree_name not in root_file:
            available = ", ".join(root_file.keys())
            raise KeyError(f"Tree {tree_name!r} not found in {root_path}. Available keys: {available}")

        tree = root_file[tree_name]
        if event_index >= tree.num_entries:
            raise IndexError(
                f"Event index {event_index} is out of range for tree {tree_name!r} "
                f"with {tree.num_entries} entries"
            )

        missing_branches = [branch for branch in BRANCHES.values() if branch not in tree.keys()]
        if missing_branches:
            raise KeyError(f"Missing required branches: {', '.join(missing_branches)}")

        arrays = tree.arrays(
            list(BRANCHES.values()),
            entry_start=event_index,
            entry_stop=event_index + 1,
            library="np",
        )

    vectors = {
        key: to_float_list(arrays[branch_name][0])
        for key, branch_name in BRANCHES.items()
    }

    lengths = {key: len(values) for key, values in vectors.items()}
    if len(set(lengths.values())) != 1:
        raise ValueError(f"Branch lengths differ in event {event_index}: {lengths}")

    rechits = [
        {
            "ID": vectors["ID"][index],
            "x": vectors["x"][index],
            "y": vectors["y"][index],
            "z": vectors["z"][index],
            "energy": 0.0,
        }
        for index in range(lengths["ID"])
    ]

    return rechits


def build_rechits_payload(root_path, tree_name="Events", event_index=0):
    rechits = load_event_rechits(root_path, tree_name, event_index)
    return {
        "rechits": rechits,
        "metadata": {
            "source": str(root_path),
            "tree": tree_name,
            "event_index": event_index,
            "rechit_count": len(rechits),
            "branches": BRANCHES,
        },
    }


def write_json(payload, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(payload, output_file, indent=2)


def write_js(payload, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    js_content = f"""/**
 * rechits.js - Embedded rechits data for static mode
 * Auto-generated from rechits.json
 */

window.EMBEDDED_RECHITS_DATA = {json.dumps(payload, separators=(",", ":"))};

console.log('Embedded rechits data loaded:', {{
    rechits: window.EMBEDDED_RECHITS_DATA.rechits.length
}});
"""
    with open(output_path, "w", encoding="utf-8") as output_file:
        output_file.write(js_content)


def build_rechits_json(root_path, output_path, tree_name="Events", js_output_path=None, event_index=0):
    payload = build_rechits_payload(root_path, tree_name, event_index)

    print("=" * 60)
    print("Building Rechits JSON")
    print("=" * 60)
    print(f"ROOT input: {root_path}")
    print(f"Tree: {tree_name}")
    print(f"Event index: {event_index}")
    print(f"Rechits: {len(payload['rechits']):,}")

    print(f"\nWriting JSON: {output_path}")
    write_json(payload, output_path)
    print(f"  Size: {output_path.stat().st_size:,} bytes")

    if js_output_path:
        print(f"\nWriting static JS: {js_output_path}")
        write_js(payload, js_output_path)
        print(f"  Size: {js_output_path.stat().st_size:,} bytes")

    print("\nRechits generation complete.")
    return payload


def main():
    project_root = Path(__file__).parent.parent
    parser = argparse.ArgumentParser(description="Build rechits JSON from one event in a ROOT file.")
    parser.add_argument(
        "root_file",
        nargs="?",
        type=Path,
        default=project_root.parent / "truth-hits-v1" / "nano_out.root",
        help="Input ROOT file. Defaults to ../truth-hits-v1/nano_out.root.",
    )
    parser.add_argument(
        "output_file",
        nargs="?",
        type=Path,
        default=project_root / "data" / "rechits.json",
        help="Output JSON path. Defaults to data/rechits.json.",
    )
    parser.add_argument("--tree", default="Events", help="ROOT tree name. Defaults to Events.")
    parser.add_argument(
        "--event-index",
        type=int,
        default=0,
        help="Zero-based event index to extract. Defaults to 0.",
    )
    parser.add_argument(
        "--js-output",
        type=Path,
        default=project_root / "app" / "js" / "rechits.js",
        help="Optional static-mode JS output path. Defaults to app/js/rechits.js.",
    )
    parser.add_argument(
        "--no-js-output",
        action="store_true",
        help="Only write JSON; do not write a static-mode JS wrapper.",
    )
    args = parser.parse_args()

    if not args.root_file.exists():
        print(f"Error: ROOT file not found: {args.root_file}", file=sys.stderr)
        sys.exit(1)

    js_output = None if args.no_js_output else args.js_output
    # try:
    build_rechits_json(args.root_file, args.output_file, args.tree, js_output, args.event_index)
    # except Exception as exc:
    #     print(f"Error: {exc}", file=sys.stderr)
    #     sys.exit(1)


if __name__ == "__main__":
    main()
