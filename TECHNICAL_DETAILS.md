# Technical Details

This document is the fast orientation guide for adapting the Truth Graph Viewer code.

## Runtime Shape

The viewer is a browser application served from `app/index.html`. It uses plain JavaScript modules attached to global manager objects, not a frontend framework or build step.

Important entry points:

- `app/index.html`: page structure, controls, side panel, modal, CDN libraries, and script load order.
- `app/js/main.js`: application bootstrap. It loads graph data, initializes `GraphManager`, then initializes the panel, search, focus, dependency, keyboard, and upload managers.
- `app/js/graph.js`: Cytoscape graph creation, visual encoding, layout selection, graph filters, selection, highlighting, and viewport fitting.
- `preprocess/build_bundle.py`: DOT-to-JSON bundle orchestration.
- `preprocess/parse_graph.py`: DOT parser and node/edge normalization.
- `preprocess/generate_bundle_js.py`: embeds `data/bundle.json` into `app/js/bundle.js` for static file mode.
- `server.py`: local static file server plus DOT upload endpoint.

## Data Pipeline

The source graph is a Graphviz DOT file such as `truthgraph.dot`, `truthlogicalgraph.dot`

`preprocess/build_bundle.py` calls `parse_graph.parse_dot_file()` and writes `data/bundle.json` with this shape:

```json
{
  "nodes": [],
  "edges": [],
  "labelToId": {},
  "metadata": {
    "graph_name": "TruthLogicalGraph",
    "is_directed": true,
    "node_count": 0,
    "edge_count": 0
  }
}
```

`parse_graph.py` uses:

- `pydot` to parse DOT.
- `networkx` to preserve a graph object during parsing.
- `particle` to convert PDG IDs into display names when possible.

The parser keeps DOT attributes on each node and edge. Styling-oriented DOT attributes are separated from data-oriented attributes when building display labels, but most original attributes are still copied into the final node object. The original DOT `label` is preserved as `rawLabel`; compact graph text is stored as `label` and `displayLabel`; side-panel detail text is stored as `detailLabel`.

For logical truth graphs, compact labels are derived from attributes:

- Vertex-like nodes use `key`, `vertexKey`, `vertex_key`, `barcode`, parsed `key=...`, or the numeric part of IDs like `v12`.
- Particle-like nodes use `particleName`, PDG-related attributes, or parsed label text.
- Unknown nodes fall back to `node: <id-number>`.

After `bundle.json` is written, `build_bundle.py` also calls `generate_bundle_js.py` to create `app/js/bundle.js`. That file assigns the entire bundle to `window.EMBEDDED_BUNDLE_DATA`.

## Bundle Loading Modes

The app supports two data loading modes:

- Static mode: opening `app/index.html` directly from the filesystem, or any page load where `window.EMBEDDED_BUNDLE_DATA` exists. `main.js` reads the embedded object from `app/js/bundle.js`.
- Server mode: opening through HTTP without embedded data. `main.js` fetches `../data/bundle.json`.

Because `index.html` always includes `js/bundle.js`, normal local use will usually enter static mode even when served over HTTP if that file exists.

## Cytoscape Usage

The graph renderer is Cytoscape.js. `index.html` loads these browser libraries from CDNs:

- `cytoscape`
- `dagre`
- `cytoscape-dagre`
- `layout-base`
- `cose-base`
- `cytoscape-fcose`
- `elkjs`
- `cytoscape-elk`

`GraphManager.init(data)` converts bundle data into Cytoscape elements:

- Nodes become `{ data: { id, ...node, label } }`.
- Edges become `{ data: { id: "<source>-<target>", source, target, ...edge } }`.

The Cytoscape stylesheet is defined in `graph.js`. Most node visual properties are functions over element data:

- Fill color comes from logical type, `fillcolor`, or defaults.
- Shape comes from logical type, particle/vertex inference, or DOT `shape`.
- Size is fixed for event/vertex nodes and label-derived for particle nodes.
- Border color and width mark `crossedBoundary=true` and Gen+Sim logical nodes.
- Classes drive temporary states: `highlighted`, `selected`, `dimmed`, `hidden`, `gen-event-filtered`, and `sim-vertex-key0-filtered`.

The original bundle is not mutated. Cytoscape classes are used for view state.

## Layout

The app starts Cytoscape with a `preset` layout and then explicitly runs `GraphManager.relayoutVisible()` after initial filters are applied.

Available layout engines:

- Dagre: hierarchical layout. It uses top-to-bottom ranks, `network-simplex`, `nodeSep: 40`, `edgeSep: 16`, `rankSep: 90`, and `spacingFactor: 1.1`.
- fCoSE: default force-directed layout. It uses `quality: "proof"` and `numIter: 8000`.
- ELK: optional layered layout. It uses `algorithm: "layered"`, rightward direction, 40px layer spacing, 20px node spacing, and orthogonal edge routing.
- Breadthfirst fallback: used only if Dagre extension registration is unavailable.

`GraphManager.registerLayoutExtensions()` registers `cytoscape-dagre`, `cytoscape-fcose`, and `cytoscape-elk` if their CDN globals are present.

Layouts are run only on currently visible nodes plus edges whose endpoints are visible. Visibility excludes elements with these classes:

- `hidden`
- `gen-event-filtered`
- `sim-vertex-key0-filtered`
- `small-subgraph-filtered`

Layout execution is tracked with `activeLayout`, `layoutRunId`, and `canceledLayoutRunId`. Starting a new layout cancels the previous active layout. The status pill is shown while a layout is running, and the Cancel button calls `layout.stop()` when supported.

Dagre edge weights are data-dependent for logical graphs. `getDagreEdgeWeight(edge)` looks for vertex endpoint energy, parses `energy`, `p4`, or `x4`, and uses `log1p(energy)` to weight edges with positive energy.

## Graph Semantics

`GraphManager` has specific logic for `metadata.graph_name === "TruthLogicalGraph"`.

Logical node kind is inferred from explicit `type`, `hasGen`, `hasSim`, raw/detail label text, `domain: GEN`, `domain: SIM`, node shape, and ID patterns:

- `GenEvent`
- `GenVertex`
- `GenParticle`
- `SimVertex`
- `SimTrack`
- `GenSimVertex`
- `GenSimParticle`
- `LogicalVertex`
- `LogicalParticle`

This kind controls labels, colors, shapes, panel summaries, and legend interpretation.

Default view filters hide:

- GenEvent nodes, detected by `rawLabel` or fallback `label` containing `GenEvent`.
- SimVertex key 0 nodes, detected by labels containing `SimVertex` and `key=0`.
- Optional small disconnected subgraphs, detected as undirected connected components with fewer than 10 total nodes.

These filters are independent from focus/dependency filters, so reset and relayout code needs to preserve the distinction between filter classes.

## UI Managers

The frontend is organized as global singleton managers:

- `GraphManager`: Cytoscape lifecycle, style, layout, filters, selection, fit.
- `PanelManager`: side panel display, neighbor lists, DOT attributes, rendered DOT label, breadcrumbs, resize persistence in `localStorage`.
- `SearchManager`: case-insensitive substring search over `label`, `displayLabel`, `detailLabel`, `rawLabel`, and node ID.
- `EgoGraphManager`: N-hop undirected neighborhood using BFS. It adds `hidden` to nodes and edges outside the neighborhood.
- `DependencyExplorer`: directed BFS over incoming/outgoing links, with upstream/downstream/both modes.
- `KeyboardNav`: keyboard navigation and help overlay.
- `UploadManager`: modal upload of a DOT file to the local Python server.

`DependencyExplorer` wraps `PanelManager.open` after `DOMContentLoaded` to dispatch a custom `panelOpened` event. That event updates the selected node label shown in the dependency controls.

## Edge Direction Conventions

The UI labels use graph direction, but the naming is domain-specific:

- Side panel "Connected Towards This Node" lists `node.incomers('edge').map(edge => edge.source())`.
- Side panel "Connected Away From This Node" lists `node.outgoers('edge').map(edge => edge.target())`.
- Dependency explorer `upstream` currently follows `node.outgoers('node')`.
- Dependency explorer `downstream` currently follows `node.incomers('node')`.

Check this convention before changing traversal behavior, because DOT edge direction may encode truth-graph flow rather than a generic software dependency direction.

## Local Server And Upload

`server.py` serves the project directory with CORS and cache-control headers. It binds to the first available port starting at `8009` and prints the selected URL.

The upload endpoint is `POST /upload`. It accepts multipart form field `dotFile`, saves it as `truthgraph.dot`, and regenerates:

- `data/bundle.json`
- `app/js/bundle.js`

The server-side regeneration runs:

```bash
python preprocess/build_bundle.py truthgraph.dot data/bundle.json
```

Current maintenance note: `app/js/upload.js` posts to `http://localhost:8000/upload`, while `server.py` starts at port `8009`. If upload is required, align these ports or make the frontend use the current origin.

## Startup Script

`run.sh` is the normal entry point. It:

1. Resolves the selected DOT file.
2. Creates `venv/` if missing.
3. Installs `preprocess/requirements.txt` if `pydot` or `networkx` are unavailable.
4. Rebuilds `data/bundle.json` when missing, stale, or generated from a different DOT file.
5. Writes `data/.bundle.source` with the absolute source DOT path.
6. Regenerates `app/js/bundle.js` when needed.
7. Starts `server.py`.

The default DOT lookup order is:

1. `./truthgraph.dot`
2. `../truthgraph.dot`
3. `./dependency.gv`

Pass `./run.sh --dot ../truthlogicalgraph.dot` to select another DOT file.

## Adaptation Notes

When changing parsing, keep `rawLabel`, `detailLabel`, and copied DOT attributes stable unless the UI is updated at the same time. The side panel and search depend on those fields.

When changing graph visibility, prefer adding/removing CSS classes over removing Cytoscape elements. Layout, reset, and filter composition assume elements remain present.

When changing layouts, route through `getLayoutConfig()` and `relayoutVisible()` so the status UI, cancellation, and visible-element filtering keep working.

When changing node semantics, update both parser-side label generation and client-side inference in `GraphManager`; the bundle can be opened statically later, so the frontend still needs to handle older bundle data.
