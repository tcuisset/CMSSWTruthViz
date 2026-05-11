#!/usr/bin/env python3
"""
Parse Graphviz DOT file into structured JSON format.
Extracts nodes, edges, and builds label-to-ID mapping.
"""

import sys
import json
import pydot
import networkx as nx
from pathlib import Path
from particle import Particle


GRAPH_STYLE_ATTRIBUTES = {
    "color",
    "fillcolor",
    "fontcolor",
    "fontsize",
    "height",
    "label",
    "penwidth",
    "style",
    "tooltip",
    "width",
}


def clean_attr_value(value):
    """Normalize pydot attribute values for display and JSON output."""
    if not isinstance(value, str):
        return value

    value = value.strip().strip('"')

    # Graphviz allows HTML-like values wrapped in angle brackets. The truth
    # graph uses this for x4 tuples, where the brackets are only DOT syntax.
    if value.startswith("<") and value.endswith(">") and "\n" not in value:
        value = value[1:-1].strip()

    return value


def node_number(node_id):
    """Return the numeric part of node IDs like n1999 when present."""
    return node_id[1:] if node_id.startswith("n") and node_id[1:].isdigit() else node_id


def fourth_tuple_value(value):
    """Extract the fourth value from a tuple-like DOT attribute."""
    if not isinstance(value, str):
        return None

    cleaned = value.strip().strip("<>").strip()
    if not (cleaned.startswith("(") and cleaned.endswith(")")):
        return None

    parts = [part.strip() for part in cleaned[1:-1].split(",")]
    return parts[3] if len(parts) >= 4 else None


def particle_name_from_id(particle_id):
    """Return a display name from a PDG ID using the particle package."""
    try:
        pdgid = int(particle_id)
    except (TypeError, ValueError):
        return None

    try:
        name = Particle.from_pdgid(pdgid).name
    except Exception:
        return None

    # The HEP particle package reports PDG 23 as Z0; use the shorter label
    # typically expected in graph displays.
    if name == "Z0":
        return "Z"

    return name


def build_display_label(node_id, attrs):
    """Build the default node label shown in Cytoscape."""
    data_attrs = {
        key: clean_attr_value(value)
        for key, value in attrs.items()
        if key not in GRAPH_STYLE_ATTRIBUTES and key != "shape"
    }

    label_parts = [f"node: {node_number(node_id)}"]

    particle_id = (
        data_attrs.get("pdgId")
        or data_attrs.get("pdgid")
        or data_attrs.get("pid")
        or data_attrs.get("pdg")
    )
    if particle_id is not None:
        particle_name = particle_name_from_id(particle_id)
        if particle_name:
            label_parts.append(f"particle: {particle_name}")
        else:
            label_parts.append(f"pdgId/pid: {particle_id}")

    energy = fourth_tuple_value(data_attrs.get("p4")) or fourth_tuple_value(data_attrs.get("x4"))
    if energy is not None:
        label_parts.append(f"E: {energy}")

    return "\n".join(label_parts)


def build_detail_label(node_id, attrs):
    """Build a full multi-line label from all DOT node attributes."""
    label_parts = [node_id]

    data_attrs = {
        key: clean_attr_value(value)
        for key, value in attrs.items()
        if key not in GRAPH_STYLE_ATTRIBUTES and key != "shape"
    }

    preferred_groups = [
        ("pid", "status"),
        ("barcode", "event", "spid"),
        ("p4",),
        ("x4",),
        ("m",),
        ("prodVtx", "endVtx"),
        ("nIn", "nOut"),
    ]

    used = set()
    for group in preferred_groups:
        values = []
        for key in group:
            if key in data_attrs:
                values.append(f"{key}: {data_attrs[key]}")
                used.add(key)
        if values:
            label_parts.append("  ".join(values))

    for key in sorted(data_attrs):
        if key not in used:
            label_parts.append(f"{key}: {data_attrs[key]}")

    return "\n".join(label_parts)


def parse_dot_file(dot_path):
    """
    Parse a DOT file and extract nodes, edges, and mappings.

    Returns:
        dict with keys: nodes, edges, labelToId, nx_graph
    """
    print(f"Parsing DOT file: {dot_path}")

    # Load DOT file
    graphs = pydot.graph_from_dot_file(dot_path)
    if not graphs:
        raise ValueError(f"Failed to parse DOT file: {dot_path}")

    graph = graphs[0]

    # Create NetworkX graph (preserve direction if digraph)
    is_directed = graph.get_type() == "digraph"
    G = nx.DiGraph() if is_directed else nx.Graph()

    # Parse nodes
    nodes = []
    label_to_id = {}
    valid_node_ids = set()

    for node in graph.get_nodes():
        node_name = node.get_name()

        # Skip special DOT keywords
        if node_name in ("node", "graph", "edge"):
            continue

        # Remove quotes from node name
        node_id = node_name.strip('"')

        # Get attributes
        attrs = node.get_attributes()
        clean_attrs = {
            key: clean_attr_value(value)
            for key, value in attrs.items()
        }

        # Build a readable display label from DOT attributes. The raw Graphviz
        # label is preserved separately because truthgraph.dot uses HTML labels.
        raw_label = clean_attrs.get("label")
        label = build_display_label(node_id, clean_attrs)
        detail_label = build_detail_label(node_id, clean_attrs)

        # Build node object
        node_obj = {
            "id": node_id,
            "label": label,
            "displayLabel": label,
            "detailLabel": detail_label,
            "rawLabel": raw_label,
        }

        # Add all other attributes
        for key, value in clean_attrs.items():
            if key != "label":
                node_obj[key] = value

        nodes.append(node_obj)
        valid_node_ids.add(node_id)

        # Add to NetworkX graph
        G.add_node(node_id, **node_obj)

        # Build label-to-ID mapping
        if label:
            label_to_id[label] = node_id

    print(f"  Parsed {len(nodes)} nodes")

    # Parse edges
    edges = []
    skipped_edges = 0

    for edge in graph.get_edges():
        source = edge.get_source().strip('"')
        target = edge.get_destination().strip('"')

        # Skip edges that reference non-existent nodes
        if source not in valid_node_ids or target not in valid_node_ids:
            skipped_edges += 1
            continue

        # Get attributes
        attrs = edge.get_attributes()

        edge_obj = {
            "source": source,
            "target": target,
        }

        # Add all attributes
        for key, value in attrs.items():
            edge_obj[key] = value.strip('"') if isinstance(value, str) else value

        edges.append(edge_obj)

        # Add to NetworkX graph
        G.add_edge(source, target, **attrs)

    print(f"  Parsed {len(edges)} edges")
    if skipped_edges > 0:
        print(f"  Skipped {skipped_edges} edges referencing non-existent nodes")

    return {
        "nodes": nodes,
        "edges": edges,
        "labelToId": label_to_id,
        "nx_graph": G,
        "is_directed": is_directed
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_graph.py <path_to_dot_file>")
        sys.exit(1)

    dot_path = sys.argv[1]

    if not Path(dot_path).exists():
        print(f"Error: File not found: {dot_path}")
        sys.exit(1)

    result = parse_dot_file(dot_path)

    # Don't include NetworkX graph in JSON output
    output = {
        "nodes": result["nodes"],
        "edges": result["edges"],
        "labelToId": result["labelToId"],
        "is_directed": result["is_directed"]
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
