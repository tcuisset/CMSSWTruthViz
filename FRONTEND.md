# Frontend And UI

The frontend is a plain JavaScript app served from `app/index.html`. There is no npm build step in the current repository. Browser libraries are loaded from CDNs, and project code is loaded as ordered script tags.

## Runtime Entry Points

- `app/index.html`: page structure, controls, upload modal, CDN scripts, embedded data scripts, and app script order.
- `app/js/main.js`: loads data, initializes all managers, updates graph statistics, and hides upload controls in static mode.
- `app/js/graph.js`: Cytoscape lifecycle, stylesheet, layout registration, node/edge semantics, filters, selection, and viewport fitting.
- `app/js/panel.js`: side panel, breadcrumbs, DOT attributes, neighbor lists, rendered DOT labels, and persisted panel width.
- `app/js/search.js`: text search and advanced attribute search.
- `app/js/ego.js`: focus-radius filtering.
- `app/js/dependency.js`: directed upstream/downstream/both link filtering.
- `app/js/plot3d.js`: Plotly rechit display for selected nodes.
- `app/js/export.js`: PNG and PDF export of the current Cytoscape viewport.
- `app/js/upload.js`: server-mode DOT/ROOT upload modal and build-status polling.

## Browser Dependencies

`index.html` loads these libraries from CDNs:

- Cytoscape.js
- dagre and `cytoscape-dagre`
- `layout-base`, `cose-base`, and `cytoscape-fcose`
- ELK and `cytoscape-elk`
- jsPDF
- Plotly.js

Because these are CDN-hosted, first load requires network access unless the libraries are vendored locally.

## Data Loading

`main.js` supports two modes:

- Static mode: when opened with `file://`, it reads `window.EMBEDDED_BUNDLE_DATA` from `app/js/bundle.js`. If present, `window.EMBEDDED_RECHITS_DATA` from `app/js/rechits.js` is attached to the bundle.
- Server mode: when opened through HTTP, it fetches `../data/bundle.json` and optionally `../data/rechits.json`.

Upload controls are enabled only in server mode.

## Cytoscape Graph

`GraphManager.init(data)` turns the bundle into Cytoscape elements:

- Nodes become Cytoscape nodes with `data.id` plus all node fields from the bundle.
- Edges become Cytoscape edges with generated IDs and the bundle's `source`, `target`, and extra edge fields.

The original bundle stays available as `window.bundleData`. View state is represented with Cytoscape classes such as `highlighted`, `selected`, `dimmed`, `hidden`, `gen-event-filtered`, `sim-vertex-key0-filtered`, and `small-subgraph-filtered`.

## Node Semantics

The frontend contains truth-graph-specific inference for:

- `GenEvent`
- `GenVertex`
- `GenParticle`
- `SimVertex`
- `SimTrack`
- `GenSimVertex`
- `GenSimParticle`
- `LogicalVertex`
- `LogicalParticle`

These kinds drive color, shape, legend entries, label handling, and side-panel summaries. Detection uses explicit DOT fields when available, plus fallback checks on labels, raw labels, node IDs, and shape attributes.

## Layouts

The layout selector currently offers:

- Dagre: hierarchical layout, selected by default.
- fCoSE: force-directed layout for denser graph exploration.
- ELK: layered layout with orthogonal edge routing.

Layouts are run on currently visible nodes plus edges whose endpoints are visible. A running layout shows a status pill and can be cancelled when the underlying layout engine supports `stop()`.

Default visibility filters can hide:

- GenEvent nodes.
- `SimVertex` nodes with `key=0`.
- Parton-shower status-2 gluons, with bypass edges inserted client-side for continuity.
- Small disconnected components with fewer than 10 nodes.

## Search

Basic search is a case-insensitive substring search over:

- `label`
- `displayLabel`
- `detailLabel`
- `rawLabel`
- node ID

Advanced search matches flat node attributes with AND-only criteria. Supported forms include:

```text
hasCheckpoints
!crossedBoundary
pid==211
energy>10
particleName contains pi
domain~=GEN
hasGen AND hasSim
```

Multiple text-search results can be stepped through with the previous/next controls.

## Focus And Link Filtering

Focus radius uses undirected breadth-first search from the selected node and hides nodes outside the selected hop count.

The link filter uses directed traversal from the selected node:

- Upstream follows the source-side convention used by the app.
- Downstream follows the target-side convention used by the app.
- Both shows the combined traversal result and edges among visible nodes.

The graph direction comes from the DOT truth graph. Check the domain meaning before renaming upstream/downstream behavior.

## Side Panel

Clicking a node opens the side panel with:

- Compact summary: ID, particle name, PDG ID, energy, and momentum-like fields where available.
- Ancestors and descendants.
- Rendered DOT label.
- Flat DOT attributes copied into the bundle.
- Breadcrumb history.

The panel can be resized. Width is stored in `localStorage`.

## 3D Rechit Panel

The 3D controls can show:

- Direct hits: rechits listed in the selected node's `directHitsDetIds`.
- Subgraph hits: direct hits from the selected node and its descendants.

Real rechit data comes from `data/rechits.json` in server mode or `app/js/rechits.js` in static mode. If no real rechit data exists, the panel creates placeholder points so the UI remains testable.

## Keyboard Shortcuts

Press `?` in the app for the overlay. Current shortcuts include:

| Key | Action |
| --- | --- |
| Arrow keys | Move to a nearby node in that screen direction |
| Tab | Cycle through visible nodes |
| Enter | Open the side panel for the selected node |
| Esc | Close the panel and clear selection |
| R | Reset view |
| ? | Toggle shortcut help |

Shortcuts are ignored while typing in form fields.
