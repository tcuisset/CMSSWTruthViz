# Installation And Deployment

This repository is a Python-assisted static web app. Browser libraries are
installed as pinned npm dependencies and copied into the generated
`app/vendor/` directory. The application itself remains plain JavaScript and
does not require a bundler.

## Requirements

- Python 3.9 or newer. Verified on 3.12 and on 3.13.
- Python `venv` support. On Debian and Ubuntu this is the `python3-venv` package.
- Node.js 20 or newer with npm, required once after a fresh clone.
- A modern browser such as Chrome or Firefox.
- A Graphviz DOT truth graph, usually `truthgraph.dot`.
- Optional: a ROOT rechits file readable by `uproot`.

Python packages:

```text
networkx
particle
uproot
```

Graphviz command-line tools are useful for validating DOT files and for rendering a
graph to PDF. The preprocessing reads the DOT itself, with `preprocess/dot_reader.py`.

## CMSSW Area

The ROOT processing pipeline runs `cmsRun` on
`PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py`. It looks for the
CMSSW `src` directory in this order:

1. the `--cmssw-src` option of `visualizeTruthGraph`
2. `TRUTHVIZ_CMSSW_SRC`
3. `CMSSW_BASE/src`
4. the local managed project under `data/cmssw`
5. the sibling release directory of this checkout

The release name defaults to `CMSSW_20_1_0_pre3` and is overridden with
`TRUTHVIZ_CMSSW_RELEASE`. `run.sh` reuses or creates a managed project under
`data/cmssw` when CVMFS is available. You can also put the viewer checkout and
the CMSSW area side by side to use an existing project:

```text
<work area>/
├── CMSSW_20_1_0_pre3/src/
└── CMSSWTruthViz/
```

## Docker Development Environment

The supported full-functionality environment is the Docker Compose service. It
uses the CMSSW EL9 image, bind-mounts the checkout, and publishes container port
3000 on a dynamically allocated host port:

```bash
./dev full-setup
./dev url
```

Always use the URL returned by `./dev url`; do not assume a fixed host port.
Other commands are `./dev build`, `./dev start`, `./dev logs`, `./dev shell`,
`./dev test`, and `./dev stop`.

The host must provide `/cvmfs/cms.cern.ch`. If the selected architecture tree
is not visible through that mount, also enable the explicit architecture bind
documented in `compose.yaml`.

## Host Run

```bash
cd CMSSWGraphViz
chmod +x run.sh
./run.sh
```

Open the application URL printed by the server, typically:

```text
http://localhost:8009/app/
```

If port `8009` is in use, the server tries following ports and prints the one it selected.

## What run.sh Does

`run.sh` performs the local setup and launch:

1. Runs `npm ci` and generates `app/vendor/` if the browser dependencies are absent.
2. Creates `venv/` if it does not exist.
3. Installs Python dependencies from `requirements.txt` if needed.
4. Reuses or creates the configured CMSSW release under `data/cmssw` when no
   `TRUTHVIZ_CMSSW_SRC` or `CMSSW_BASE` is supplied.
5. Starts `server.py` with one isolated-job worker.

## Manual Setup

```bash
cd CMSSWGraphViz
npm ci
npm run vendor
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python preprocess/build_bundle.py truthgraph.dot data/bundle.json
python server.py
```

Then open the application URL printed by `server.py`.

## Static Mode

Static mode is useful when you want to open the app without the Python server. It requires generated embedded data:

```bash
cd CMSSWGraphViz
source venv/bin/activate
python preprocess/build_bundle.py truthgraph.dot data/bundle.json
open app/index.html
```

On Linux, use:

```bash
xdg-open app/index.html
```

Static mode reads `app/js/bundle.js`. Upload is disabled because there is no server endpoint.

Optional static rechits:

```bash
python preprocess/build_rechits_json.py rechits.root data/rechits.json --event-index 0
```

This also writes `app/js/rechits.js` unless `--no-js-output` is passed.

## Server Mode Launcher

Start the server:

```bash
./run.sh
```

The opening browser launcher can resume or delete IndexedDB sessions, open a
prebuilt catalogue sample, process CMSSW ROOT upload/EOS input, or process DOT
plus optional rechits. Processed JSON is saved and verified in the browser
before its random server job directory is deleted.

## Production Image and OpenShift

`Dockerfile` is the single production image definition. It builds the pinned
browser dependencies in a Node.js stage, installs the Python environment in the
CMSSW EL9 image, and starts `run.sh` on port 8080. OpenShift must use Docker
strategy. See [OPENSHIFT.md](OPENSHIFT.md) for the deployment commands, mounts,
and runtime variables.

## Troubleshooting

### Prepared DOT file does not load

Choose **Prepared input** in the opening launcher and upload the DOT file there.

### Browser libraries are missing

Run `npm ci && npm run vendor`. The generated `app/vendor/` directory is ignored
by Git and can be regenerated entirely from `package-lock.json`.

### ROOT upload fails

Check that the ROOT file has an `Events` tree and these branches:

```text
rechits_rechit_ID
rechits_rechit_x
rechits_rechit_y
rechits_rechit_z
```

### Port is already in use

`server.py` auto-finds a free port by default. For a fixed port:

```bash
python server.py --start-port 8080 --no-auto-find-port
```

### Rebuild a static bundle from scratch

```bash
rm -f data/bundle.json data/.bundle.source app/js/bundle.js
venv/bin/python preprocess/build_bundle.py truthgraph.dot data/bundle.json
```
