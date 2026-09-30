# Truth Graph Viewer

Interactive browser viewer for truth graphs extracted from CMSSW. The app reads a Graphviz DOT truth graph, converts it to JSON, and displays it with Cytoscape.js. It can also load rechit coordinates from a ROOT file and show direct or descendant hits in a Plotly 3D panel.

The current app is about simulation truth graph exploration, not CMSSW module dependency/configuration browsing.

## What It Does

- Displays `GenEvent`, `GenVertex`, `GenParticle`, `SimVertex`, `SimTrack`, and combined Gen+Sim nodes.
- Preserves DOT attributes and shows them in the side panel.
- Builds compact node labels from particle IDs, vertex keys, and DOT attributes.
- Supports search, advanced attribute search, focus radius, upstream/downstream link filters, and multiple layouts.
- Exports the current Cytoscape viewport as PNG or PDF.
- Runs either as a static HTML page with embedded JSON or through the local Python server.
- In server mode, stores each processed event in the submitting browser rather
  than publishing a pod-wide current event.
- Opens with saved browser sessions, persistent catalogue samples, CMSSW ROOT
  upload/EOS input, and prepared DOT plus optional rechits choices.
- In CMSSW-capable server mode, accepts a CMSSW EDM ROOT file and runs the
  TruthInfo dumper/conversion pipeline automatically.

## Documentation Map

- [INSTALL.md](INSTALL.md): local setup, Python and npm dependencies, static mode, server mode, and OpenShift deployment.
- [FRONTEND.md](FRONTEND.md): web app structure, Cytoscape managers, UI controls, layouts, Plotly rechits panel, exports, and keyboard behavior.
- [DATA_FORMAT.md](DATA_FORMAT.md): `bundle.json`, `bundle.js`, `rechits.json`, node and edge fields, and how DOT attributes are mapped.
- [SERVER.md](SERVER.md): Python preprocessing scripts, local HTTP server, upload endpoints, background build status, ROOT rechits extraction, and startup behavior.
- [FEATURES.md](FEATURES.md): current user-facing feature reference.
- [USAGE_EXAMPLES.md](USAGE_EXAMPLES.md): common truth-graph investigation workflows.
- [TECHNICAL_DETAILS.md](TECHNICAL_DETAILS.md): short implementation notes and maintenance guidance.
- [OPENSHIFT.md](OPENSHIFT.md): concise OpenShift deployment notes using the CMSSW EL9 container image.

## Quick Start

```bash
cd CMSSWGraphViz
chmod +x run.sh
./run.sh
```

`run.sh` generates `app/vendor/` from the pinned npm dependencies when needed,
creates `venv/`, installs Python dependencies, prepares or
reuses a managed `CMSSW_20_1_0_pre3` project under `data/cmssw` when needed,
and starts the isolated-job server. Select input from the browser launcher.

The server prints the selected application URL. By default it starts at:

```text
http://localhost:8009/app/
```

If that port is busy, `server.py` tries subsequent ports.

To generate viewer inputs directly from a CMSSW EDM ROOT file:

```bash
./visualizeTruthGraph myInputFile.root --event-index 0
```

This requires a CMSSW runtime with the TruthInfo plugins available. The script
uses `--cmssw-src`, `TRUTHVIZ_CMSSW_SRC`, `CMSSW_BASE/src`, the managed
`data/cmssw/CMSSW_20_1_0_pre3/src` project, or the sibling
`CMSSW_20_1_0_pre3/src` checkout.

## Static Mode

After generating the embedded JavaScript bundle, the app can be opened directly:

```bash
python preprocess/build_bundle.py truthgraph.dot data/bundle.json
open app/index.html
```

Static mode uses:

- `app/js/bundle.js`, generated from `data/bundle.json`
- `app/js/rechits.js`, optionally generated from `data/rechits.json`

File upload is hidden in static mode because uploads require the Python server.

## Repository Layout

```text
CMSSWGraphViz/
├── package.json
├── package-lock.json
├── app/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── main.js
│       ├── graph.js
│       ├── panel.js
│       ├── search.js
│       ├── ego.js
│       ├── dependency.js
│       ├── plot3d.js
│       ├── upload.js
│       ├── session-store.js
│       └── export.js
├── preprocess/
│   ├── parse_graph.py
│   ├── build_bundle.py
│   ├── generate_bundle_js.py
│   └── build_rechits_json.py
├── data/
│   ├── bundle.json
│   └── rechits.json
├── samples/
│   ├── catalog.json
│   └── artifacts/
├── job_manager.py
├── server.py
├── truth_pipeline.py
├── visualizeTruthGraph
├── run.sh
├── requirements.txt
└── .s2i/bin/run
```

The workspace parent may contain example DOT files, but the application repository is this `CMSSWGraphViz/` directory.
