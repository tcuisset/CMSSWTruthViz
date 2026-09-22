#!/usr/bin/env python3
"""
Parse Graphviz DOT file into structured JSON format.
Extracts nodes, edges, and builds label-to-ID mapping.
"""

import sys
import json
import re
import networkx as nx

from dot_reader import read_dot
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
    """Normalize a DOT attribute value for display and JSON output."""
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
        name = Particle.from_pdgid(pdgid).html_name
    except Exception:
        return None

    # The HEP particle package reports PDG 23 as Z0; use the shorter label
    # typically expected in graph displays.
    if name == "Z0":
        return "Z"

    return name


def particle_id_from_attrs(data_attrs):
    """Return the particle identifier stored by known DOT producers."""
    return (
        data_attrs.get("pdgId")
        or data_attrs.get("pdgid")
        or data_attrs.get("pid")
        or data_attrs.get("pdg")
    )


def vertex_key_from_attrs(node_id, attrs, data_attrs):
    """Return the vertex key for compact on-canvas labels."""
    for key in ("key", "vertexKey", "vertex_key", "barcode"):
        if key in data_attrs:
            return str(data_attrs[key])

    raw_label = clean_attr_value(attrs.get("label", ""))
    label_match = (
        re.search(r"\b(?:GenVertex|SimVertex)[^<\n]*\bkey=([^\s<]+)", raw_label, re.I)
        or re.search(r"\bkey=([^\s<]+)", raw_label, re.I)
    )
    if label_match:
        return label_match.group(1)

    return node_id[1:] if node_id.startswith("v") and node_id[1:].isdigit() else node_number(node_id)


# Truth levels, most signal-like first. The dominant level drives the node colour.
# The levels a particle can carry, most signal-like first. The names are the ones
# PhysicsTools/TruthInfo/interface/TruthLevels.h writes, plus "signal", which the
# selection post-processing owns and the dumper appends to the same attribute.
# visibleTau and stableLegsFromUpstream are the earlier spelling of the name above
# them; each keeps the rank of its successor, so a DOT dumped before the rename
# reads exactly as it did.
TRUTH_LEVEL_ORDER = (
    "signal",
    "hardProcess",
    "partonJets",
    "bHadrons",
    "cHadrons",
    "tauVisibleHadronic",
    "tauVisibleLeptonic",
    "visibleTau",
    "reconstructableFromSignal",
    "reconstructableFinalState",
    "stableLegsFromInitialState",
    "stableLegsFromUpstream",
    "stableDecayProducts",
    "caloBoundary",
    "underlyingEvent",
)

# Roles of the artificial vertices the post-processor adds. "isr/upstream" is the
# earlier name of the initial-state role, kept for a DOT dumped before the rename.
ARTIFICIAL_ROLES = {
    "interaction": "interaction",
    "initial state": "initialState",
    "isr/upstream": "initialState",
    "beam side input": "beamSideInput",
    "underlying event": "underlyingEvent",
}

ARTIFICIAL_ROLE_TITLES = {
    "interaction": "hard interaction",
    "initialState": "initial state",
    "beamSideInput": "beam side input",
    "underlyingEvent": "underlying event",
}


def parse_number(value):
    """Return a float for a DOT attribute, or None when it is not a number."""
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def parse_count(value):
    number = parse_number(value)
    return int(number) if number is not None else 0


def tuple_values(value):
    """Return the components of a tuple-like DOT attribute."""
    if not isinstance(value, str):
        return []

    cleaned = value.strip().strip("<>").strip()
    if not (cleaned.startswith("(") and cleaned.endswith(")")):
        return []

    return [part.strip() for part in cleaned[1:-1].split(",")]


def format_energy(value):
    """Format an energy in GeV with a precision that suits its size."""
    energy = parse_number(value)
    if energy is None:
        return None
    if energy >= 100:
        return f"{energy:.0f} GeV"
    if energy >= 1:
        return f"{energy:.1f} GeV"
    return f"{energy * 1000:.0f} MeV"


def producer_big_name(attrs):
    """Return the title the producer put on the node.

    TruthLogicalGraphDumper writes the particle role into the first row of the
    HTML label rather than into an attribute, so a connector and a signal
    stand-in are only named there.
    """
    raw = clean_attr_value(attrs.get("label", ""))
    if not raw:
        return None

    match = re.search(r'POINT-SIZE="22"><B>(.*?)</B>', raw, re.S)
    if not match:
        return None

    name = match.group(1).strip()
    return name or None


def is_pileup(data_attrs):
    """Return whether the node comes from a pile-up collision.

    The raw eventId encodes the pp collision. The signal interaction is bunch
    crossing 0 and event 0, which encodes to 0, so any other value is pile-up.
    """
    value = parse_number(data_attrs.get("eid"))
    return bool(value is not None and value != 0)


def truth_levels_from_attrs(data_attrs):
    """Return the levels stamped on a logical-graph particle."""
    raw = str(data_attrs.get("levels", "") or "")
    return [level for level in (part.strip() for part in raw.split(",")) if level]


def dominant_truth_level(levels):
    """Return the most signal-like level, which drives the node colour."""
    for level in TRUTH_LEVEL_ORDER:
        if level in levels:
            return level
    return None


def artificial_role_from_attrs(data_attrs):
    """Return the role of an artificial vertex, or None for a real node."""
    domain = str(data_attrs.get("domain", "") or "").strip().strip("<>")
    if domain.lower() != "internal":
        return None

    role = str(data_attrs.get("role", "") or "").strip().lower()
    return ARTIFICIAL_ROLES.get(role, "interaction")


def subgraph_sim_hits(data_attrs):
    """Return the sim hits of the particle's whole subgraph, over all channels.

    The subgraph count already contains the particle's own hits, but the direct
    count is taken as well so a malformed pair cannot report zero.
    """
    total = 0
    for channel in ("", "Tracker", "Mtd", "Muon"):
        direct = parse_count(data_attrs.get(f"nDirect{channel}SimHits"))
        subgraph = parse_count(data_attrs.get(f"nSubgraph{channel}SimHits"))
        total += max(direct, subgraph)
    return total


def hit_footprint_from_attrs(data_attrs):
    """Return where the particle deposits, which drives the node border."""
    if parse_count(data_attrs.get("nSubgraphRecHits")) or parse_count(data_attrs.get("nDirectRecHits")):
        return "caloRec"
    if parse_count(data_attrs.get("nSubgraphSimHits")) or parse_count(data_attrs.get("nDirectSimHits")):
        return "caloSim"
    for key in (
        "nSubgraphTrackerSimHits",
        "nDirectTrackerSimHits",
        "nSubgraphMtdSimHits",
        "nDirectMtdSimHits",
        "nSubgraphMuonSimHits",
        "nDirectMuonSimHits",
        "nSubgraphMtdRecHits",
    ):
        if parse_count(data_attrs.get(key)):
            return "tracker"
    return "none"


def is_particle_node(node_id, data_attrs, shape):
    if "pid" in data_attrs:
        return True
    if shape == "diamond":
        return False
    return bool(node_id.startswith("p") and node_id[1:].isdigit())


def truth_classification(node_id, attrs):
    """Classify a logical-graph node into the kind, level and footprint that the
    viewer draws, and build its two-line label and its hover summary."""
    data_attrs = {
        key: clean_attr_value(value)
        for key, value in attrs.items()
        if key not in GRAPH_STYLE_ATTRIBUTES and key != "shape"
    }
    shape = clean_attr_value(attrs.get("shape", ""))

    role = artificial_role_from_attrs(data_attrs)
    if role is not None:
        title = ARTIFICIAL_ROLE_TITLES[role]
        out_count = parse_count(data_attrs.get("nOut"))
        hover = [title, "artificial vertex"]
        position = tuple_values(data_attrs.get("x4"))
        if len(position) >= 3:
            hover.append(f"z = {position[2]} cm")
        hover.append(f"{parse_count(data_attrs.get('nIn'))} in, {out_count} out")
        return {
            "truthKind": "artificial",
            "truthRole": role,
            "truthPileup": 1 if is_pileup(data_attrs) else 0,
            "truthTitle": title,
            "truthSubtitle": f"{out_count} out" if out_count else "",
            "truthHover": "\n".join(hover),
        }

    if not is_particle_node(node_id, data_attrs, shape):
        reason = str(data_attrs.get("reason", "") or "").strip()
        in_count = parse_count(data_attrs.get("nIn"))
        out_count = parse_count(data_attrs.get("nOut"))
        # The same title the dumper writes in the first row of the DOT label. The
        # reason comes from the Geant4 process, so a GEN-only vertex has none and
        # the topology names it: one incoming particle decays, more produce.
        if reason and reason != "Unknown":
            title = reason
        else:
            title = "decay" if in_count == 1 else "production"
        hover = [title, f"{in_count} in, {out_count} out"]
        x4 = str(data_attrs.get("x4", "") or "").strip()
        if x4:
            hover.append(f"x4: {x4}")
        # The canvas shows where the vertex is as a short radius and z; the full
        # four-position stays in the hover, so neighbouring labels do not collide.
        position = tuple_values(data_attrs.get("x4"))
        subtitle = f"{out_count} out"
        if len(position) >= 3:
            try:
                rho = (float(position[0]) ** 2 + float(position[1]) ** 2) ** 0.5
                subtitle = f"r {rho:.1f}, z {float(position[2]):.1f} cm"
            except (TypeError, ValueError):
                pass
        return {
            "truthKind": "vertex",
            "truthReason": reason,
            "truthPileup": 1 if is_pileup(data_attrs) else 0,
            "truthTitle": title,
            "truthSubtitle": subtitle,
            "truthHover": "\n".join(hover),
        }

    particle_id = particle_id_from_attrs(data_attrs)
    has_pdg_identity = particle_id is not None and str(particle_id).strip() not in ("", "0")
    title = (
        (particle_name_from_id(particle_id) if has_pdg_identity else None)
        or producer_big_name(attrs)
        or (str(particle_id) if particle_id is not None else node_id)
    )
    levels = truth_levels_from_attrs(data_attrs)
    level = dominant_truth_level(levels)
    footprint = hit_footprint_from_attrs(data_attrs)
    energy = format_energy(fourth_tuple_value(data_attrs.get("p4")))

    hover = [title]
    if has_pdg_identity:
        hover[0] = f"{title} ({particle_id})"
    if energy and has_pdg_identity:
        hover.append(f"E = {energy}")
    hover.append(f"levels: {', '.join(levels) if levels else 'none'}")

    calo_rec = parse_count(data_attrs.get("nSubgraphRecHits"))
    calo_sim = parse_count(data_attrs.get("nSubgraphSimHits"))
    tracker_sim = parse_count(data_attrs.get("nSubgraphTrackerSimHits"))
    hover.append(f"hits: {calo_rec} calo rec, {calo_sim} calo sim, {tracker_sim} tracker sim")

    markers = []
    if str(data_attrs.get("isRoot", "")).strip() == "1":
        markers.append("root")
    if str(data_attrs.get("isLeaf", "")).strip() == "1":
        markers.append("leaf")
    if str(data_attrs.get("backscattered", "")).strip() == "1":
        markers.append("backscattered")
    if parse_count(data_attrs.get("nCheckpoints")):
        markers.append(f"{parse_count(data_attrs.get('nCheckpoints'))} checkpoints")
    if markers:
        hover.append(", ".join(markers))

    energy_value = parse_number(fourth_tuple_value(data_attrs.get("p4")))

    return {
        "truthKind": "particle",
        "truthLevel": level or "",
        "truthLevels": levels,
        "truthFootprint": footprint,
        "truthEnergy": energy_value if energy_value is not None else -1.0,
        "truthSimHits": subgraph_sim_hits(data_attrs),
        "truthPileup": 1 if is_pileup(data_attrs) else 0,
        "truthTitle": title,
        "truthSubtitle": (energy or "") if has_pdg_identity else "",
        "truthHover": "\n".join(hover),
    }


def build_display_label(node_id, attrs):
    """Build the default node label shown in Cytoscape."""
    data_attrs = {
        key: clean_attr_value(value)
        for key, value in attrs.items()
        if key not in GRAPH_STYLE_ATTRIBUTES and key != "shape"
    }

    shape = clean_attr_value(attrs.get("shape", ""))
    if shape == "diamond" or (node_id.startswith("v") and node_id[1:].isdigit()):
        return vertex_key_from_attrs(node_id, attrs, data_attrs)

    particle_id = particle_id_from_attrs(data_attrs)
    if particle_id is not None and str(particle_id) != "0":
        particle_name = particle_name_from_id(particle_id)
        if particle_name:
            return particle_name
        return str(particle_id)

    return f"node: {node_number(node_id)}"


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

    # A truth graph that keeps the shower of the main event runs to tens of
    # megabytes, and dot_reader also takes it gzipped.
    graph = read_dot(dot_path)
    graph_name = clean_attr_value(graph["graph_name"])
    is_logical_graph = graph_name == "TruthLogicalGraph"

    # Create NetworkX graph (preserve direction if digraph)
    is_directed = graph["is_directed"]
    G = nx.DiGraph() if is_directed else nx.Graph()

    # Parse nodes
    nodes = []
    label_to_id = {}
    valid_node_ids = set()

    for node_id, attrs in graph["nodes"]:
        clean_attrs = {
            key: clean_attr_value(value)
            for key, value in attrs.items()
        }

        # Skip invisible layout-helper nodes. The truth-graph dumper adds a hidden
        # "__center__" hub (shape=point, style=invis) with invisible weighted spokes
        # to drive the neato radial layout; it is meaningless in an interactive view.
        # Edges referencing it are dropped automatically by the valid-node check below.
        if node_id == "__center__" or "invis" in str(clean_attrs.get("style", "")).lower():
            continue

        # Build a readable display label from DOT attributes. The raw Graphviz
        # label is preserved separately because truthgraph.dot uses HTML labels.
        raw_label = clean_attrs.get("label")
        label = build_display_label(node_id, clean_attrs)
        detail_label = build_detail_label(node_id, clean_attrs)
        data_attrs = {
            key: clean_attr_value(value)
            for key, value in clean_attrs.items()
            if key not in GRAPH_STYLE_ATTRIBUTES and key != "shape"
        }
        particle_id = particle_id_from_attrs(data_attrs)
        particle_name = particle_name_from_id(particle_id) if particle_id is not None else None
        vertex_key = vertex_key_from_attrs(node_id, clean_attrs, data_attrs) if clean_attrs.get("shape") == "diamond" else None

        # Truth-graph classification. The logical graph is standalone, so the node
        # is described by its own truth level, footprint and role, not by GEN/SIM.
        truth = truth_classification(node_id, clean_attrs) if is_logical_graph else {}
        title = truth.get("truthTitle") or label
        subtitle = truth.get("truthSubtitle") or ""
        if is_logical_graph:
            label = f"{title}\n{subtitle}" if subtitle else title

        # Build node object
        node_obj = {
            "id": node_id,
            "label": label,
            "displayLabel": label,
            "detailLabel": detail_label,
            "rawLabel": raw_label,
        }
        node_obj.update(truth)
        if particle_name:
            node_obj["particleName"] = particle_name
        if vertex_key:
            node_obj["vertexKey"] = vertex_key

        # Add all other attributes
        for key, value in clean_attrs.items():
            if key != "label":
                node_obj[key] = value

        nodes.append(node_obj)
        valid_node_ids.add(node_id)

        # Add to NetworkX graph
        G.add_node(node_id, **node_obj)

        # Build label-to-ID mapping. The title is registered too, so a search for
        # a particle name matches a node whose on-canvas label carries two lines.
        if label:
            label_to_id[label] = node_id
        if title and title not in label_to_id:
            label_to_id[title] = node_id

    print(f"  Parsed {len(nodes)} nodes")

    # Parse edges
    edges = []
    skipped_edges = 0

    for source, target, attrs in graph["edges"]:
        # Skip edges that reference non-existent nodes
        if source not in valid_node_ids or target not in valid_node_ids:
            skipped_edges += 1
            continue

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
        "graph_name": graph_name,
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
        "graph_name": result["graph_name"],
        "is_directed": result["is_directed"]
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
