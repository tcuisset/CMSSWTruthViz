# Technical Details

This file is the short maintenance guide. The broader implementation areas are documented in:

- [FRONTEND.md](FRONTEND.md)
- [DATA_FORMAT.md](DATA_FORMAT.md)
- [SERVER.md](SERVER.md)
- [INSTALL.md](INSTALL.md)

## Current Architecture

The app is a browser-based truth graph viewer with Python preprocessing:

```text
DOT truth graph
  -> preprocess/parse_graph.py
  -> preprocess/build_bundle.py
  -> data/bundle.json
  -> app/js/bundle.js
  -> app/index.html + Cytoscape.js
```

Optional rechit data follows a parallel path:

```text
ROOT file
  -> preprocess/build_rechits_json.py
  -> data/rechits.json
  -> app/js/rechits.js
  -> Plotly 3D panel
```

`server.py` serves static files and handles upload/rebuild workflows. `run.sh` is the normal local entry point.

## Frontend Shape

The frontend is plain JavaScript. There is no current npm package, bundler, or framework. `app/index.html` loads CDN libraries, embedded data scripts, then local app scripts.

Main global managers:

- `GraphManager`: Cytoscape setup, style, semantic node typing, layouts, filters, highlights, and selection.
- `PanelManager`: side panel, breadcrumbs, neighbors, labels, and DOT attributes.
- `SearchManager`: text search and advanced attribute queries.
- `EgoGraphManager`: undirected focus-radius filtering.
- `DependencyExplorer`: directed link filtering.
- `Plot3DPanelManager`: direct/subgraph rechit display.
- `UploadManager`: server-mode upload and status polling.
- `ExportManager`: PNG/PDF export.
- `KeyboardNav`: keyboard selection and help overlay.

## Data Contract

The graph bundle contract is intentionally simple:

- `nodes`: flat node objects with `id`, generated labels, raw DOT label, and copied DOT attributes.
- `edges`: flat edge objects with `source`, `target`, and copied DOT attributes.
- `labelToId`: convenience mapping from generated labels to IDs.
- `metadata`: graph name, directedness, and counts.

The frontend depends on `rawLabel`, `detailLabel`, copied DOT attributes, and stable node IDs. Avoid removing or renaming those fields without updating the UI at the same time.

## Truth-Graph Semantics

The current semantic logic targets `TruthLogicalGraph` data. Node kind is inferred from explicit attributes when possible and falls back to labels, shapes, and ID patterns. The kinds are used for visual styling and legend entries.

Keep parser-side label generation and client-side type inference aligned. Static bundles may be opened later without regenerating data, so the frontend should remain tolerant of older or incomplete fields.

## Filtering Model

Visibility is implemented with Cytoscape classes rather than removing elements. This lets search, reset, relayout, and composed filters operate on the full graph.

Important filter classes include:

- `hidden`
- `gen-event-filtered`
- `sim-vertex-key0-filtered`
- `small-subgraph-filtered`

When adding a new persistent filter, use a dedicated class and update visible-element logic in `GraphManager`.

## Layout Model

Route layout changes through `GraphManager.getLayoutConfig()` and `GraphManager.relayoutVisible()`. That keeps layout status, cancellation, visible-element filtering, and viewport fitting consistent.

Currently supported engines:

- Dagre
- fCoSE
- ELK

## Upload Model

`UploadManager` posts files to `../upload`, then polls `../upload-status`. `server.py` processes uploads in a background thread and returns build states. Uploads overwrite the local `truthgraph.dot` and optional `rechits.root`.

The upload workflow regenerates both JSON and static JS wrappers so the newly uploaded data also works in static mode after processing.

## Maintenance Notes

- Preserve copied DOT attributes unless there is a strong reason to drop them.
- Prefer adding parser support for explicit attributes over parsing display text in the browser.
- Keep `DATA_FORMAT.md` updated when adding fields consumed by UI code.
- Keep `INSTALL.md` updated if frontend dependencies move from CDN scripts to npm or vendored assets.
- Check static mode after data-pipeline changes because it exercises the embedded JS wrappers.
