# OpenShift S2I Deployment

This repository can be deployed with OpenShift S2I. The runtime container does
not need `cmsRun` installed directly, but it must have `/cvmfs` mounted so the
entrypoint can source the CMS bootstrap and run CMSSW jobs through `cmssw-el9`.
More general setup notes are in [INSTALL.md](INSTALL.md).

Create the app from the `CMSSWGraphViz` repository root:

```bash
oc new-app python:3.11~https://github.com/waredjeb/CMSSWGraphViz.git
```

The S2I build installs `requirements.txt`. For `/process-root` and catalogue
samples, the runtime environment must provide:

- `/cvmfs/cms.cern.ch` mounted in the running pod,
- a CMSSW checkout or mounted CMSSW area containing the `PhysicsTools/TruthInfo`
  dumper config and built plugins,
- a writable persistent volume for `TRUTHVIZ_JOB_ROOT`.

Set one of these to point at the CMSSW `src` directory used inside the
`cmssw-el9` container:

```bash
TRUTHVIZ_CMSSW_SRC=/path/to/CMSSW/src
# or
CMSSW_BASE=/path/to/CMSSW
```

At runtime `.s2i/bin/run`:

- uses direct `cmsRun` if it is already available,
- otherwise sources `/cvmfs/cms.cern.ch/cmsset_default.sh`,
- verifies that `cmssw-el9` is available,
- exports `TRUTHVIZ_CMSRUN_WRAPPER=cmssw-el9` so only the `cmsRun` job runs in
  the EL9 CMSSW container while the Python server stays in the S2I container.

It then starts:

```bash
python server.py --host 0.0.0.0 --start-port ${PORT:-8080} --no-auto-find-port
```

On startup, `server.py`:

- uses `data/bundle.json` if it exists,
- generates `data/bundle.json` from `truthgraph.dot` or `dependency.gv` if either file is present,
- otherwise creates an empty bundle so the web UI can start and accept DOT uploads.
- rejects startup if neither direct `cmsRun` nor `/cvmfs` + `cmssw-el9` is available.

Useful runtime configuration:

```bash
TRUTHVIZ_JOB_ROOT=/persistent/jobs
TRUTHVIZ_CATALOG=/opt/app-root/src/samples/catalog.json
TRUTHVIZ_MAX_UPLOAD_MB=2048
TRUTHVIZ_CMSRUN_TIMEOUT_SEC=3600
CMSSET_DEFAULT=/cvmfs/cms.cern.ch/cmsset_default.sh
```

Expose the service if needed:

```bash
oc expose service/cmsswgraphviz
```

The browser still needs access to the CDN-hosted frontend libraries listed in [FRONTEND.md](FRONTEND.md), unless those assets are vendored into `app/index.html`.
