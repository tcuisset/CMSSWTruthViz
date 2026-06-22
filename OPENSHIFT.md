# OpenShift S2I Deployment

This repository can be deployed with OpenShift S2I. The runtime container does
not need `cmsRun` installed directly, but it must have `/cvmfs` mounted so the
entrypoint can source the CMS bootstrap and run CMSSW jobs through `cmssw-el9`.
More general setup notes are in [INSTALL.md](INSTALL.md).

Create the app from the `CMSSWGraphViz` repository root:

```bash
oc new-app python:3.11~https://github.com/waredjeb/CMSSWGraphViz.git
```

The S2I build installs `requirements.txt`. CMSSW is installed at runtime into a
writable volume, because Deployment PVCs are not mounted during the image build.
For `/process-root` and catalogue samples, the runtime environment must provide:

- `/cvmfs/cms.cern.ch` mounted in the running pod so `cmssw-el9` is available,
- a writable persistent volume for `TRUTHVIZ_JOB_ROOT`.

At runtime, `.s2i/bin/run`:

- looks for an existing `CMSSW_*/src` under `TRUTHVIZ_CMSSW_INSTALL_ROOT`,
- otherwise sources `/cvmfs/cms.cern.ch/cmsset_default.sh`,
- runs `/cvmfs/cms-ci.cern.ch/week0/cms-sw/cmssw/51213/54154/install.sh` in
  `TRUTHVIZ_CMSSW_INSTALL_ROOT`,
- exports `TRUTHVIZ_CMSSW_SRC` to the installed `CMSSW_*/src`,
- uses `cmssw-el9` as `TRUTHVIZ_CMSRUN_WRAPPER` when direct `cmsRun` is absent.

By default, `TRUTHVIZ_CMSSW_INSTALL_ROOT` is derived from `TRUTHVIZ_JOB_ROOT`:
`$(dirname "$TRUTHVIZ_JOB_ROOT")/cmssw`. If `TRUTHVIZ_JOB_ROOT=/persistent/jobs`,
CMSSW installs into `/persistent/cmssw`.

You can override the CMSSW source directly with:

```bash
TRUTHVIZ_CMSSW_SRC=/path/to/CMSSW/src
# or
CMSSW_BASE=/path/to/CMSSW
```

After CMSSW setup, `.s2i/bin/run` starts:

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
TRUTHVIZ_CMSSW_INSTALL_ROOT=/persistent/cmssw
TRUTHVIZ_CATALOG=/opt/app-root/src/samples/catalog.json
TRUTHVIZ_MAX_UPLOAD_MB=2048
TRUTHVIZ_CMSRUN_TIMEOUT_SEC=3600
CMSSET_DEFAULT=/cvmfs/cms.cern.ch/cmsset_default.sh
TRUTHVIZ_CMSSW_INSTALL_SCRIPT=/cvmfs/cms-ci.cern.ch/week0/cms-sw/cmssw/51213/54154/install.sh
TRUTHVIZ_SKIP_CMSSW_INSTALL=1  # only when TRUTHVIZ_CMSSW_SRC/CMSSW_BASE is provided another way
```

Expose the service if needed:

```bash
oc expose service/cmsswgraphviz
```

The browser still needs access to the CDN-hosted frontend libraries listed in [FRONTEND.md](FRONTEND.md), unless those assets are vendored into `app/index.html`.
