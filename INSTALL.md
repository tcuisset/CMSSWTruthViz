# Installation And Deployment

This repository is a Python-assisted static web app. The frontend has no npm build step in the current codebase; JavaScript libraries are loaded from CDNs by `app/index.html`.

## Requirements

- Python 3.9 or newer. Verified on 3.12 and on 3.13.
- Python `venv` support. On Debian and Ubuntu this is the `python3-venv` package.
- A modern browser such as Chrome or Firefox.
- Network access from the browser for CDN libraries unless those scripts are vendored locally.
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

## Quick Local Run

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

Use a specific DOT file:

```bash
./run.sh --dot /path/to/truthgraph.dot
```

## What run.sh Does

`run.sh` performs the local setup and launch:

1. Selects a DOT file from `--dot` or the default lookup list.
2. Creates `venv/` if it does not exist.
3. Activates the virtual environment.
4. Installs Python dependencies from `preprocess/requirements.txt` if needed.
5. Reuses or creates the configured CMSSW release under `data/cmssw` when no
   `TRUTHVIZ_CMSSW_SRC` or `CMSSW_BASE` is supplied.
6. Builds `data/bundle.json` from the selected DOT file when missing or stale.
7. Records the source DOT path in `data/.bundle.source`.
8. Generates `app/js/bundle.js` for static mode.
9. Starts `server.py`.

Default DOT lookup:

1. `./truthgraph.dot`
2. `../truthgraph.dot`
3. `./dependency.gv`

## Manual Setup

```bash
cd CMSSWGraphViz
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

## Server Mode Upload

Start the server:

```bash
./run.sh
```

In the browser, use **Upload Files** to upload:

- a required DOT file
- an optional ROOT file
- an optional rechits event index

The server processes uploads in the background and the browser reloads when processing completes.

## OpenShift

The recommended OpenShift deployment uses `Dockerfile`, based on
`cmssw/el9:x86_64`, so the app and CMSSW jobs run in an EL9-compatible
container without nested Singularity/Apptainer. `Containerfile` is kept with the
same contents for local Podman/Docker workflows.

Build from the `CMSSWGraphViz` repository root:

```bash
oc new-build --strategy=docker --binary --name=cmsswgraphviz
oc start-build cmsswgraphviz --from-dir=. --follow
oc new-app cmsswgraphviz
```

Use Docker strategy for deployments with the CERN EOS pod annotation. That
annotation mounts an `emptyDir` over `/tmp`; classic S2I startup commands that
execute `/tmp/scripts/run` will then fail because the script is hidden by the
mount. The included `Dockerfile` starts
`/opt/app-root/src/.s2i/bin/run` directly.

At runtime `.s2i/bin/run` executes:

```bash
python server.py --host 0.0.0.0 --start-port ${PORT:-8080} --no-auto-find-port
```

For CMSSW ROOT processing, mount `/cvmfs/cms.cern.ch` and a writable persistent
volume. The entrypoint sources:

```bash
export VO_CMS_SW_DIR=/cvmfs/cms.cern.ch
source /cvmfs/cms.cern.ch/cmsset_default.sh
```

then creates a regular `CMSSW_20_1_0_pre3` project with SCRAM in
`TRUTHVIZ_CMSSW_INSTALL_ROOT` when that release is not installed. In the
recommended `cmssw/el9:x86_64` image, `cmsRun` runs directly through
`scram runtime -sh`. Set `TRUTHVIZ_CMSSW_SRC` or `CMSSW_BASE` to override runtime
install.

Expose the service if needed:

```bash
oc expose service/cmsswgraphviz
```

On first startup, the server uses an existing `data/bundle.json`, generates one from `truthgraph.dot` or `dependency.gv`, or creates an empty bundle so the upload UI can still be used.

## Troubleshooting

### DOT file not found

Pass the graph explicitly:

```bash
./run.sh --dot /absolute/path/to/truthgraph.dot
```

### Browser shows CDN errors

The current frontend loads Cytoscape, layout plugins, jsPDF, and Plotly from CDNs. Ensure the browser can reach those CDNs or vendor the libraries and update `app/index.html`.

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

### Rebuild from scratch

```bash
rm -f data/bundle.json data/.bundle.source app/js/bundle.js
./run.sh --dot truthgraph.dot
```
