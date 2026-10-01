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

- [INSTALL.md](INSTALL.md): Docker development, local setup, static mode, and production images.
- [FRONTEND.md](FRONTEND.md): web app structure, Cytoscape managers, UI controls, layouts, Plotly rechits panel, exports, and keyboard behavior.
- [DATA_FORMAT.md](DATA_FORMAT.md): `bundle.json`, `bundle.js`, `rechits.json`, node and edge fields, and how DOT attributes are mapped.
- [SERVER.md](SERVER.md): Python preprocessing scripts, local HTTP server, upload endpoints, background build status, ROOT rechits extraction, and startup behavior.
- [FEATURES.md](FEATURES.md): user-facing features and common investigation workflows.
- [TECHNICAL_DETAILS.md](TECHNICAL_DETAILS.md): short implementation notes and maintenance guidance.
- [OPENSHIFT.md](OPENSHIFT.md): concise OpenShift deployment notes using the CMSSW EL9 container image.

## Quick Start

For the complete CMSSW-capable environment, use Docker Compose:

```bash
cd CMSSWGraphViz
./dev full-setup
./dev url
```

The host port is assigned dynamically; open the URL printed by `./dev url`.
Source files are bind-mounted, so edits are visible without rebuilding the
image. Use `./dev logs`, `./dev shell`, and `./dev stop` to manage the service.

For prepared/catalogue inputs on a host that already has Python 3.9+ and Node.js
20+, `./run.sh` remains available. It generates the pinned browser libraries,
creates `venv/`, installs Python dependencies, and starts the server, normally
at `http://localhost:8009/app/`. ROOT processing additionally requires a valid
CMSSW runtime. Set `TRUTHVIZ_CMSSW_TOPIC=someone:branch` to create and build a
local CMSSW project from a fork; see [INSTALL.md](INSTALL.md) for details.

To generate viewer inputs directly from a CMSSW EDM ROOT file:

```bash
./visualizeTruthGraph myInputFile.root --event-index 0
```

For a failed or suspicious run, preserve the generated `cmsRun` wrapper and
pipeline logs with `--save-debug /path/to/debug`; artifacts are written below
that directory using the run's job ID.

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
├── dev
├── run.sh
├── Dockerfile
├── Dockerfile.dev
├── compose.yaml
├── requirements.txt
└── package.json
```

The workspace parent may contain example DOT files, but the application repository is this `CMSSWGraphViz/` directory.
