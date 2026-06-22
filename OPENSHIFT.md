# OpenShift S2I Deployment

This repository can be deployed with OpenShift S2I, but CMSSW ROOT processing
requires a CMSSW-capable runtime image. More general setup notes are in
[INSTALL.md](INSTALL.md).

Create the app from the `CMSSWGraphViz` repository root:

```bash
oc new-app python:3.11~https://github.com/waredjeb/CMSSWGraphViz.git
```

The current S2I entrypoint validates CMSSW on startup because this deployment is
intended to support `/process-root` and catalogue samples. Use a custom
builder/runtime image that has:

- the CMSSW release and `PhysicsTools/TruthInfo` plugins built,
- `scram` and `cmsRun` available,
- a writable persistent volume for `TRUTHVIZ_JOB_ROOT`.

Set one of:

```bash
TRUTHVIZ_CMSSW_SRC=/path/to/CMSSW/src
# or
CMSSW_BASE=/path/to/CMSSW
```

At runtime `.s2i/bin/run` validates that CMSSW can be initialized before it starts:

```bash
python server.py --host 0.0.0.0 --start-port ${PORT:-8080} --no-auto-find-port
```

On startup, `server.py`:

- uses `data/bundle.json` if it exists,
- generates `data/bundle.json` from `truthgraph.dot` or `dependency.gv` if either file is present,
- otherwise creates an empty bundle so the web UI can start and accept DOT uploads.
- rejects startup if `cmsRun` is unavailable and neither `TRUTHVIZ_CMSSW_SRC`
  nor `CMSSW_BASE` points to an initializable CMSSW area.

Useful runtime configuration:

```bash
TRUTHVIZ_JOB_ROOT=/persistent/jobs
TRUTHVIZ_CATALOG=/opt/app-root/src/samples/catalog.json
TRUTHVIZ_MAX_UPLOAD_MB=2048
TRUTHVIZ_CMSRUN_TIMEOUT_SEC=3600
```

Expose the service if needed:

```bash
oc expose service/cmsswgraphviz
```

The browser still needs access to the CDN-hosted frontend libraries listed in [FRONTEND.md](FRONTEND.md), unless those assets are vendored into `app/index.html`.
