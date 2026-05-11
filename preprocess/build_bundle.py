#!/usr/bin/env python3
"""
Orchestrate parsing and build final JSON bundle.
Merges graph data with module config data and validates InputTag references.
"""

import json
import sys
from pathlib import Path
from parse_graph import parse_dot_file
from parse_config import parse_config_file


def validate_and_enrich_input_tags(modules, label_to_id):
    """
    Validate InputTag references against graph nodes.
    Add 'found' and 'targetId' fields to each InputTag.

    Returns:
        Updated modules dict
    """
    print("\nValidating InputTag references...")

    total_tags = 0
    found_tags = 0

    for module_name, module_data in modules.items():
        for tag in module_data.get("inputTags", []):
            total_tags += 1

            # Try to find the referenced module in the graph
            referenced_module = tag["module"]

            if referenced_module in label_to_id:
                tag["found"] = True
                tag["targetId"] = label_to_id[referenced_module]
                found_tags += 1
            else:
                tag["found"] = False
                tag["targetId"] = None

    if total_tags > 0:
        print(f"  Found {found_tags}/{total_tags} InputTag references ({100*found_tags/total_tags:.1f}%)")
    else:
        print("  No InputTags found")

    return modules


def build_bundle(dot_path, config_path, output_path):
    """
    Build complete JSON bundle from DOT file and config file.
    """
    print("=" * 60)
    print("Building Graph Bundle")
    print("=" * 60)

    # Parse DOT file
    graph_data = parse_dot_file(dot_path)

    modules = {}
    if config_path and config_path.exists():
        # Parse config file
        modules = parse_config_file(config_path)

        # Validate and enrich InputTags
        modules = validate_and_enrich_input_tags(modules, graph_data["labelToId"])
    else:
        print("\nNo CMSSW config file supplied; using DOT node attributes only")

    # Build final bundle
    bundle = {
        "nodes": graph_data["nodes"],
        "edges": graph_data["edges"],
        "modules": modules,
        "labelToId": graph_data["labelToId"],
        "metadata": {
            "is_directed": graph_data["is_directed"],
            "node_count": len(graph_data["nodes"]),
            "edge_count": len(graph_data["edges"]),
            "module_count": len(modules)
        }
    }

    # Write bundle to file
    print(f"\nWriting bundle to: {output_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(bundle, f, indent=2, ensure_ascii=False)

    file_size = output_path.stat().st_size
    print(f"  Bundle size: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")

    print("\n" + "=" * 60)
    print("Bundle generation complete!")
    print("=" * 60)
    print(f"\nSummary:")
    print(f"  Nodes: {bundle['metadata']['node_count']:,}")
    print(f"  Edges: {bundle['metadata']['edge_count']:,}")
    print(f"  Modules: {bundle['metadata']['module_count']:,}")
    print(f"  Output: {output_path}")

    # Also generate bundle.js for static mode
    try:
        from generate_bundle_js import generate_bundle_js
        js_output = output_path.parent.parent / "app" / "js" / "bundle.js"
        print(f"\nGenerating bundle.js for static mode...")
        generate_bundle_js(output_path, js_output)
    except Exception as e:
        print(f"\nWarning: Could not generate bundle.js: {e}")
        print("Run 'python preprocess/generate_bundle_js.py' manually if needed.")


def main():
    # Default paths relative to project root
    project_root = Path(__file__).parent.parent
    dot_candidates = [
        project_root / "truthgraph.dot",
        project_root.parent / "truthgraph.dot",
        project_root / "dependency.gv",
    ]
    dot_path = next((path for path in dot_candidates if path.exists()), dot_candidates[0])
    config_path = None
    output_path = project_root / "data" / "bundle.json"

    # Allow command-line overrides
    if len(sys.argv) >= 2:
        dot_path = Path(sys.argv[1])
    if len(sys.argv) >= 3:
        config_path = Path(sys.argv[2]) if sys.argv[2] else None
    if len(sys.argv) >= 4:
        output_path = Path(sys.argv[3])

    # Validate input files
    if not dot_path.exists():
        print(f"Error: DOT file not found: {dot_path}")
        print("\nUsage: python build_bundle.py [dot_file] [config_file] [output_file]")
        sys.exit(1)

    build_bundle(dot_path, config_path, output_path)


if __name__ == "__main__":
    main()
