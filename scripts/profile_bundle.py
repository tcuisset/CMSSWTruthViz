#!/usr/bin/env python3
"""Measure bundle size and hypothetical reductions without changing the input.

All variants are measurements, not drop-in replacements for the viewer schema.
Only one bundle is loaded; compressed sizes are counted without writing copies.
"""

import argparse
from collections import Counter
import json
from pathlib import Path
import resource
import time
import zlib


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def measure(bundle, omitted=(), allowed_ids=None):
    compressor = zlib.compressobj(6, zlib.DEFLATED, 31)
    size = compressed = 0
    counts = {}

    def feed(chunk):
        nonlocal size, compressed
        size += len(chunk)
        compressed += len(compressor.compress(chunk))

    feed(b"{")
    for index, (key, value) in enumerate(bundle.items()):
        if index:
            feed(b",")
        feed(encoded(key) + b":")
        if key in ("nodes", "edges"):
            feed(b"[")
            count = 0
            for item in value:
                if allowed_ids is not None:
                    if key == "nodes" and item["id"] not in allowed_ids:
                        continue
                    if key == "edges" and not {item["source"], item["target"]} <= allowed_ids:
                        continue
                if count:
                    feed(b",")
                feed(encoded({k: v for k, v in item.items() if k not in omitted})
                     if key == "nodes" else encoded(item))
                count += 1
            counts[key] = count
            feed(b"]")
        elif key == "labelToId" and allowed_ids is not None:
            feed(encoded({k: v for k, v in value.items() if v in allowed_ids}))
        elif key == "metadata" and allowed_ids is not None:
            feed(encoded({**value, "node_count": counts["nodes"], "edge_count": counts["edges"]}))
        else:
            feed(encoded(value))
    feed(b"}")
    compressed += len(compressor.flush())
    return {"bytes": size, "gzip_bytes": compressed, **counts}


def profile(path):
    start = time.monotonic()
    with path.open(encoding="utf-8") as source:
        bundle = json.load(source)
    loaded = time.monotonic()
    print(f"Loaded {len(bundle['nodes']):,} nodes in {loaded - start:.1f}s", flush=True)
    fields = Counter()
    kinds = Counter()
    provenance = Counter()
    signal_ids = set()
    for node in bundle["nodes"]:
        kinds[node.get("truthKind", "unknown")] += 1
        eid = str(node.get("eid", "missing"))
        provenance[eid] += 1
        if eid == "0":
            signal_ids.add(node["id"])
        for key, value in node.items():
            # Includes field key, colon and value; excludes inter-field commas.
            fields[key] += len(encoded(key)) + 1 + len(encoded(value))
    labels = ("detailLabel", "rawLabel", "displayLabel")
    variants = {}
    for name, omitted, ids in (
        ("minified", (), None),
        ("without_detailLabel", ("detailLabel",), None),
        ("without_redundant_labels", labels, None),
        ("eid_zero_induced_subgraph", (), signal_ids),
        ("eid_zero_without_redundant_labels", labels, signal_ids),
    ):
        variants[name] = measure(bundle, omitted, ids)
        print(f"{name}: {variants[name]}", flush=True)
    return {
        "input": str(path.resolve()),
        "original_bytes": path.stat().st_size,
        "metadata": bundle.get("metadata"),
        "node_kinds": dict(kinds),
        "eid_node_counts": dict(provenance.most_common()),
        "node_field_bytes": dict(fields.most_common()),
        "variants": variants,
        "load_seconds": loaded - start,
        "elapsed_seconds": time.monotonic() - start,
        "peak_rss_kib_linux": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "notes": [
            "gzip level 6; sizes measured incrementally, no output bundles written",
            "field sizes include key/colon/value but exclude commas and surrounding object braces",
            "eid=0 is a diagnostic induced subgraph, not a rerun of CMSSW postprocessing",
            "omitting labels requires viewer compatibility work before production use",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--output", type=Path, required=True, help="Write the profiling report, not a modified bundle")
    args = parser.parse_args()
    if args.output.resolve() == args.bundle.resolve():
        parser.error("The report output must differ from the input bundle")
    report = profile(args.bundle)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
