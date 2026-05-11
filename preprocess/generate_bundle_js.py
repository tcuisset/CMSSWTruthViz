#!/usr/bin/env python3
"""
Generate bundle.js from bundle.json for static HTML mode.
This allows the app to work without a server by embedding the data.
"""

import json
import sys
from pathlib import Path


def generate_bundle_js(json_path, output_path):
    """
    Convert bundle.json to bundle.js with embedded data.
    """
    print("=" * 60)
    print("Generating bundle.js for static mode")
    print("=" * 60)

    # Read bundle.json
    print(f"\nReading: {json_path}")
    with open(json_path, 'r', encoding='utf-8') as f:
        bundle_data = json.load(f)

    json_size = json_path.stat().st_size
    print(f"  Size: {json_size:,} bytes ({json_size/1024/1024:.2f} MB)")
    print(f"  Nodes: {len(bundle_data['nodes']):,}")
    print(f"  Edges: {len(bundle_data['edges']):,}")
    print(f"  Modules: {len(bundle_data.get('modules', {})):,}")

    # Generate JavaScript file
    print(f"\nGenerating: {output_path}")

    # Create JavaScript content
    js_content = f"""/**
 * bundle.js - Embedded bundle data for static mode
 * Auto-generated from bundle.json
 *
 * This file allows the application to run without a server
 * by embedding the graph data directly in JavaScript.
 */

// Set the embedded bundle data
window.EMBEDDED_BUNDLE_DATA = {json.dumps(bundle_data, separators=(',', ':'), ensure_ascii=False)};

console.log('Embedded bundle data loaded:', {{
    nodes: window.EMBEDDED_BUNDLE_DATA.nodes.length,
    edges: window.EMBEDDED_BUNDLE_DATA.edges.length,
    modules: Object.keys(window.EMBEDDED_BUNDLE_DATA.modules || {{}}).length
}});
"""

    # Write to file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_content)

    js_size = output_path.stat().st_size
    print(f"  Size: {js_size:,} bytes ({js_size/1024/1024:.2f} MB)")

    print("\n" + "=" * 60)
    print("bundle.js generated successfully!")
    print("=" * 60)
    print("\nThe application can now run in two modes:")
    print("  1. Static: Open app/index.html directly in browser")
    print("  2. Server: Run './run.sh' for upload functionality")
    print()


def main():
    # Default paths
    project_root = Path(__file__).parent.parent
    json_path = project_root / "data" / "bundle.json"
    output_path = project_root / "app" / "js" / "bundle.js"

    # Allow command-line overrides
    if len(sys.argv) >= 2:
        json_path = Path(sys.argv[1])
    if len(sys.argv) >= 3:
        output_path = Path(sys.argv[2])

    # Validate input
    if not json_path.exists():
        print(f"Error: bundle.json not found: {json_path}")
        print("\nRun 'python preprocess/build_bundle.py' first to generate bundle.json")
        sys.exit(1)

    generate_bundle_js(json_path, output_path)


if __name__ == "__main__":
    main()
