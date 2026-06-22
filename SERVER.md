# Server And Preprocessing

The Python side has three jobs:

1. Convert DOT and optional ROOT input files into JSON consumed by the browser.
2. Serve the app locally and support browser uploads in server mode.
3. Run the CMSSW dumper on a CMSSW EDM ROOT input and publish the generated viewer files.

## Python Dependencies

Dependencies are listed in both `requirements.txt` and `preprocess/requirements.txt`:

```text
pydot
networkx
particle
uproot
```

`run.sh` installs from `preprocess/requirements.txt` into `venv/`.

## DOT To Bundle

Primary command:

```bash
python preprocess/build_bundle.py truthgraph.dot data/bundle.json
```

`build_bundle.py` calls `parse_graph.parse_dot_file()` and writes:

- `data/bundle.json`
- `app/js/bundle.js`, through `preprocess/generate_bundle_js.py`

Default DOT lookup when no argument is provided:

1. `./truthgraph.dot`
2. `../truthgraph.dot`
3. `./dependency.gv`

`parse_graph.py` uses:

- `pydot` for Graphviz DOT parsing.
- `networkx` for an internal graph object during parsing.
- `particle` for PDG ID to particle-name conversion.

The parser keeps most DOT node and edge attributes as JSON fields. It separates display labels from raw DOT labels so the browser can show compact canvas labels and full detail-panel metadata.

## ROOT Rechits To JSON

Primary command:

```bash
python preprocess/build_rechits_json.py rechits.root data/rechits.json --event-index 0
```

By default the script also writes:

```text
app/js/rechits.js
```

Use `--no-js-output` to write only JSON.

The script reads one event from a ROOT tree with `uproot`. Defaults:

- Tree: `Events`
- Event index: `0`
- Static JS output: `app/js/rechits.js`

Required branches:

- `rechits_rechit_ID`
- `rechits_rechit_x`
- `rechits_rechit_y`
- `rechits_rechit_z`

## Local Server

Start manually with:

```bash
python server.py
```

Useful options:

```bash
python server.py --host localhost --start-port 8009
python server.py --host 0.0.0.0 --start-port 8080 --no-auto-find-port
```

Defaults:

- Host: `localhost`
- First port: `8009`
- Auto-find next free port: enabled
- Max port attempts: `100`

The server serves the repository root, so the app URL is:

```text
http://localhost:8009/app/
```

or the port printed at startup.

## Startup Bundle Handling

On startup, `server.py` calls `ensure_initial_bundle()`:

- If `data/bundle.json` exists, it is used.
- Otherwise it tries to generate a bundle from `truthgraph.dot` or `dependency.gv`.
- If no DOT file exists, it creates an empty bundle so the app can still start and accept uploads.

## Upload Endpoints

Server mode enables the upload modal in the browser.

### `POST /upload`

Prepared input mode. This keeps the original upload behavior.

Accepts multipart form fields:

- `mode`: optional, must be `prepared` when provided.
- `dotFile`: required DOT graph file.
- `rootFile`: optional ROOT file containing rechits.
- `rechitsEventIndex`: optional non-negative integer, default `0`.

The server saves uploads to:

- `truthgraph.dot`
- `rechits.root`, when a ROOT file is provided.

It then starts a background thread that regenerates:

- `data/bundle.json`
- `app/js/bundle.js`
- `data/rechits.json`, when a ROOT file is provided.

### `GET /upload-status`

Returns current background build state:

```json
{
  "success": true,
  "build": {
    "state": "idle",
    "message": "No bundle build is running.",
    "startedAt": null,
    "finishedAt": null
  }
}
```

Build states are `idle`, `queued`, `running`, `success`, and `error`.
The status object also includes `phase`, `jobId`, and `outputs` when available.

`app/js/upload.js` polls this endpoint until upload processing finishes, then reloads the page.

### `POST /process-root`

CMSSW input mode. Accepts multipart form fields:

- `rootFile`: required CMSSW EDM ROOT file.
- `eventIndex`: optional non-negative integer, default `0`.
- `dumperArgs`: optional extra arguments passed to `dumpTruthGraphsFromGENSIMRECO_cfg.py`.

The server stores the upload under `TRUTHVIZ_JOB_ROOT`, runs:

```bash
cmsRun PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py <input.root> -n 1 --skipEvents <eventIndex> -o <job>/cmssw
```

Then it converts the event-suffixed logical DOT and generated `rechits_nano*.root`
into the current viewer files.

### `GET /samples`

Returns the configured sample catalogue from `TRUTHVIZ_CATALOG`, defaulting to
`samples/catalog.json`.

### `POST /samples/<id>/process`

Starts a CMSSW processing job for one manifest-declared sample. The browser never
sends arbitrary server paths; it can only request sample ids listed in the manifest.

Manifest shape:

```json
{
  "samples": [
    {
      "id": "zmm",
      "label": "Z to muons",
      "description": "Small GEN-SIM-RECO sample",
      "path": "/data/samples/zmm.root",
      "eventIndex": 0,
      "dumperArgs": "--no-keepSpectators -s 23"
    }
  ]
}
```

## CMSSW Pipeline

The reusable pipeline lives in `truth_pipeline.py`. Runtime configuration:

- `TRUTHVIZ_CMSSW_SRC`: CMSSW `src` directory.
- `TRUTHVIZ_JOB_ROOT`: writable job directory, default `data/jobs`.
- `TRUTHVIZ_CATALOG`: sample manifest path, default `samples/catalog.json`.
- `TRUTHVIZ_MAX_UPLOAD_MB`: upload size limit in MiB, default `2048`.
- `TRUTHVIZ_CMSRUN_TIMEOUT_SEC`: cmsRun timeout, default `3600`.
- `TRUTHVIZ_CMSRUN_WRAPPER`: optional wrapper for only the `cmsRun` step,
  for example `cmssw-el9` on non-EL9 hosts.

Local CLI:

```bash
./visualizeTruthGraph myInputFile.root --event-index 0
./visualizeTruthGraph myInputFile.root --event-index 4 --no-server
TRUTHVIZ_CMSRUN_WRAPPER=cmssw-el9 ./visualizeTruthGraph myInputFile.root --no-server
```

## run.sh

`run.sh` is the normal local entry point. It:

1. Resolves the selected DOT file from `--dot` or the default lookup list.
2. Creates `venv/` if missing.
3. Activates the virtual environment.
4. Installs Python dependencies if `pydot` or `networkx` are unavailable.
5. Rebuilds `data/bundle.json` when missing, stale, or generated from a different DOT file.
6. Writes `data/.bundle.source` with the absolute DOT path.
7. Regenerates `app/js/bundle.js` when needed.
8. Starts `server.py`.

The banner still contains some historical wording, but the app it starts is the Truth Graph Viewer.
