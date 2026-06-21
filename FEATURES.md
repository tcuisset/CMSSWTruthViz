# Features Reference

This is the user-facing feature reference for the Truth Graph Viewer.

## Graph Display

- Cytoscape.js rendering of DOT-derived truth graphs.
- Directed edges from the input DOT graph.
- Legend entries for Gen, Sim, and combined Gen+Sim node categories.
- Compact labels generated from particle IDs, vertex keys, or fallback node IDs.
- Side-panel access to the original DOT attributes.

Visual encodings include:

- Distinct colors and shapes for event, vertex, particle, and track-like nodes.
- Special styling for combined Gen+Sim nodes.
- Marker styling for `crossedBoundary=true`.
- Optional hiding of selected graph categories.

## Layouts

Use the layout selector in the header:

- Dagre: hierarchical layout, default.
- fCoSE: force-directed layout.
- ELK: layered layout with orthogonal routing.

The layout status indicator appears while a layout is running. Use **Cancel** to stop a long layout when supported by the layout engine.

## Search

Basic search matches node IDs and label fields:

- `label`
- `displayLabel`
- `detailLabel`
- `rawLabel`

Advanced search matches node attributes. Examples:

```text
pid==211
hasGen AND hasSim
crossedBoundary
particleName contains mu
energy>50
```

Multiple results can be stepped through with the previous/next controls.

## Side Panel

Click a node to open the side panel. It shows:

- Node ID, particle name, PDG ID, energy, and momentum-like fields when available.
- Ancestors and descendants.
- Rendered DOT label.
- All copied DOT attributes.
- Breadcrumb navigation history.

The panel is resizable and stores width in `localStorage`.

## Focus Radius

Focus radius shows the undirected N-hop neighborhood around the selected node.

Typical use:

1. Select a node.
2. Choose a radius from 1 to 5.
3. Click the apply checkmark.
4. Use **Reset View** to return to the full graph.

## Link Filtering

The link controls show directed context around the selected node:

- **Upstream**: source-side traversal according to the app's truth-graph convention.
- **Downstream**: target-side traversal according to the app's truth-graph convention.
- **Both**: combined directed context.
- **None**: clears the link filter.

Depth controls how many link steps are followed.

## Default Visibility Filters

Header checkboxes can hide:

- GenEvent nodes.
- `SimVertex` nodes with `key=0`.
- Parton-shower status-2 gluons, while preserving continuity with bypass edges.
- Disconnected components with fewer than 10 nodes.

## 3D Rechit View

The 3D display mode can be:

- **Hide**
- **Direct hits**
- **Subgraph hits**

Direct hits use `directHitsDetIds` on the selected node. Subgraph hits collect direct hits from the selected node and descendants. Coordinates come from `data/rechits.json` in server mode or `app/js/rechits.js` in static mode.

## Export

The header provides:

- **Save PNG**
- **Save PDF**

Both export the current Cytoscape viewport, not the entire unbounded graph.

## Upload

In server mode, **Upload Files** accepts:

- a required DOT file
- an optional ROOT rechits file
- a rechits event index

The server rebuilds the JSON bundle in the background and the page reloads when processing finishes.

Upload is hidden in static `file://` mode.

## Keyboard Shortcuts

Press `?` in the app to show help.

| Key | Action |
| --- | --- |
| Arrow keys | Move to the nearest node in that direction |
| Tab | Cycle through visible nodes |
| Enter | Open selected node details |
| Esc | Close panel and clear selection |
| R | Reset view |
| ? | Toggle help |
