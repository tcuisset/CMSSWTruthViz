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
`TRUTHVIZ_CMSSW_RELEASE`. For an unmodified upstream release, `run.sh` uses the
release directly from CVMFS when it is available. No local CMSSW project is
needed. You can also put the viewer checkout and a CMSSW area side by side:

```text
<work area>/
├── CMSSW_20_1_0_pre3/src/
└── CMSSWTruthViz/
```

To retain pipeline diagnostics, pass `--save-debug DIR` to
`visualizeTruthGraph`. Each run gets a `DIR/<job-id>/` directory containing
the generated wrapper, `pipeline.log`, and separate `cmsRun` stdout/stderr
logs. The same behavior can be enabled for server-side ROOT jobs with the
`TRUTHVIZ_DEBUG_DIR` environment variable.

To create a managed project explicitly:

```bash
scripts/install-cmssw.sh \
  --release CMSSW_20_1_0_pre3 \
  --arch el9_amd64_gcc14 \
  --install-root data/cmssw
```

To install code from a fork, add the topic understood by
`git cms-rebase-topic`. The installer creates the base release, enters its
runtime, rebases the topic, and runs `scram b`:

```bash
scripts/install-cmssw.sh \
  --release CMSSW_20_1_0_pre3 \
  --arch el9_amd64_gcc14 \
  --install-root data/cmssw-my-topic \
  --topic someone:my-branch \
  --jobs 8
```

For local development, the equivalent environment variables can be passed to
`run.sh`; it invokes the installer automatically when a topic is requested:

```bash
TRUTHVIZ_CMSSW_TOPIC=someone:my-branch \
TRUTHVIZ_CMSSW_INSTALL_ROOT=data/cmssw-my-topic \
./run.sh
```

An existing managed project is reused only when its recorded topic matches.
Choose a different install root for a different topic or base release.

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
4. Uses an explicit CMSSW area, an existing local project, or the upstream CVMFS
   release. It creates a managed project only when needed, including fork topics.
5. Starts `server.py` with one isolated-job worker.

## Visualization Only

Install the pinned frontend assets once:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run vendor
```

Then use `./visualizeTruthGraph bundle.json`, optionally with `--rechits FILE`
and `--associations FILE`. A version 1 event envelope includes these data directly.
JSON viewing requires only Python's standard library. The CLI opens a read-only
static viewer on an automatically allocated port; it never starts the processing
backend. `--no-browser` prints the URL, and Ctrl-C stops the server.

For ROOT input use `./visualizeTruthGraph input.root --event-index 0` in a configured
CMSSW environment (such as the devcontainer). The launcher prefers `venv/bin/python`
when available; `TRUTHVIZ_PYTHON` selects another interpreter. ROOT conversion needs
`requirements.txt` installed in that interpreter and TruthInfo available. It writes
an isolated job under `data/jobs/` (or `--job-root`), then serves its graph, rechits
and associations directly. `--no-server` converts without opening a viewer. There
is no packaged standalone end-user container yet; the existing image is the full
backend deployment image.

You can also open `app/index.html` or serve `app/` with any static HTTP server.
The **Open JSON** dialog reads files entirely client side. Generated legacy embedded
JS wrappers remain supported, but are no longer required to open JSON. Backend
features are enabled only when `server.py` serves `runtime-config.js`, independently
of `file://` versus HTTP.

## Manual Backend Setup (Debugging)

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run vendor
python3 -m venv venv
venv/bin/python -m pip install -r requirements.txt
venv/bin/python server.py
```

Normal development uses `./run.sh` instead. `server.py` accepts
`TRUTHVIZ_SERVER_HOST`, `TRUTHVIZ_SERVER_PORT`, and
`TRUTHVIZ_SERVER_AUTO_FIND_PORT`; explicit CLI arguments override those defaults.
Both development and production bootstraps invoke it directly. There is no
separate `start-server.sh` launcher.

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
browser dependencies and Python environment, then uses the small
`scripts/run-production.sh` entrypoint on port 8080. The production entrypoint
does not install npm packages or create a venv. It validates the configured
CMSSW area and may provision a requested fork topic under an installation lock.

The default production image derives the upstream CVMFS path from
`TRUTHVIZ_CMSSW_RELEASE` and `TRUTHVIZ_SCRAM_ARCH`. For a fork deployment, set
`TRUTHVIZ_CMSSW_TOPIC` and a writable `TRUTHVIZ_CMSSW_INSTALL_ROOT`; the
production entrypoint automatically provisions the fork on first startup and
reuses it afterward. An explicit `TRUTHVIZ_CMSSW_SRC` overrides automatic
installation. See [OPENSHIFT.md](OPENSHIFT.md).

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
