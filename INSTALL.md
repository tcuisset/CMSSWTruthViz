# Installation And Deployment

This repository is a Python-assisted static web app. The frontend has no npm build step in the current codebase; JavaScript libraries are loaded from CDNs by `app/index.html`.

## Requirements

- Python 3.9 or newer recommended.
- Python `venv` support.
- A modern browser such as Chrome or Firefox.
- Network access from the browser for CDN libraries unless those scripts are vendored locally.
- A Graphviz DOT truth graph, usually `truthgraph.dot`.
- Optional: a ROOT rechits file readable by `uproot`.

Python packages:

```text
pydot
networkx
particle
uproot
```

Graphviz command-line tools are useful for validating DOT files, but the current preprocessing path parses DOT with `pydot`.

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
5. Builds `data/bundle.json` from the selected DOT file when missing or stale.
6. Records the source DOT path in `data/.bundle.source`.
7. Generates `app/js/bundle.js` for static mode.
8. Starts `server.py`.

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

## OpenShift S2I

The repository includes `.s2i/bin/run` for the OpenShift Python S2I builder.

Create an app from the repository root:

```bash
oc new-app python:3.11~https://github.com/waredjeb/CMSSWGraphViz.git
```

The S2I build installs `requirements.txt`. At runtime `.s2i/bin/run` executes:

```bash
python server.py --host 0.0.0.0 --start-port ${PORT:-8080} --no-auto-find-port
```

For CMSSW ROOT processing, the S2I container may run without direct `cmsRun`.
It must have `/cvmfs/cms.cern.ch` mounted. The entrypoint sources:

```bash
export VO_CMS_SW_DIR=/cvmfs/cms.cern.ch
source /cvmfs/cms.cern.ch/cmsset_default.sh
```

and defaults `TRUTHVIZ_CMSRUN_WRAPPER=cmssw-el9` when direct `cmsRun` is not
available. Set `TRUTHVIZ_CMSSW_SRC` or `CMSSW_BASE` to the CMSSW checkout that
contains the TruthInfo dumper config and built plugins.

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
