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

## Supported Entry Points

| Use case | Command | Frontend mode |
| --- | --- | --- |
| Human development inside a devcontainer / configured CMSSW environment | `./run.sh` | Backend |
| Development and testing from outside the container (human or LLM) | `./dev full-setup`, then `./dev url` | Backend |
| Local end-user viewing | `./visualizeTruthGraph FILE` | Visualization only |
| OpenShift deployment | Production `Dockerfile` | Backend |

`server.py` implements the backend; direct invocation is for debugging an already
configured environment. `scripts/run-production.sh` is an internal image bootstrap,
not another local launcher. The redundant `scripts/start-server.sh` has been removed.

For Compose, the host port is dynamic: always use `./dev url`. Source edits are
bind-mounted. Use `./dev logs`, `./dev shell`, `./dev test`, and `./dev stop`.

`./run.sh` prepares browser/Python dependencies and a CMSSW environment before
starting the backend. It is intended for a shell inside a devcontainer or an
already suitable host. ROOT processing requires a CMSSW runtime.

## Local Visualization

```bash
./visualizeTruthGraph event.json
./visualizeTruthGraph bundle.json --rechits rechits.json --associations associations.json
./visualizeTruthGraph myInputFile.root --event-index 0
```

The CLI opens the selected event directly in the browser. Its HTTP server serves
only static viewer resources and the selected event; it has no upload, catalogue,
or processing API. JSON viewing uses Python's standard library. ROOT input first
runs the CMSSW pipeline with the configured Python/CMSSW environment, then opens
the resulting graph and rechits. Generated files stay in an isolated job directory;
they do not replace another viewer's event.

The default port is automatically allocated. Use `--no-browser` for a remote shell,
`--port PORT` for a fixed port, `--no-server` to validate/convert only, and
`--save-debug DIR` to retain ROOT processing diagnostics. Stop the viewer with Ctrl-C.
Install frontend assets once with `npm ci && npm run vendor`; ROOT conversion also
needs the Python dependencies and TruthInfo plugins described in [INSTALL.md](INSTALL.md).

## Two Frontend Modes

**Visualization only** is the default for static HTTP hosts, `file://`, and the local
CLI. Graph navigation, layouts, search, rechits, associations and exports are client
side. **Open JSON** reads a bundle or complete version 1 event envelope locally,
with optional rechits/associations JSON; no file is uploaded. Open `app/index.html`
(after building vendor assets) or serve `app/` with any static server. Legacy embedded
`app/js/bundle.js`, `rechits.js`, and `associations.js` remain supported.

**Backend mode** is explicitly enabled by `server.py` through
`app/js/runtime-config.js`. Its opening launcher provides saved browser sessions,
server catalogue samples, CMSSW ROOT upload/EOS processing, and prepared DOT plus
optional rechits processing. Results remain isolated and are saved/verified in the
browser before server cleanup. URL protocol alone never enables backend features.

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
├── viewer_cli.py
├── dev
├── run.sh
├── Dockerfile
├── Dockerfile.dev
├── compose.yaml
├── requirements.txt
└── package.json
```

The workspace parent may contain example DOT files, but the application repository is this `CMSSWGraphViz/` directory.
