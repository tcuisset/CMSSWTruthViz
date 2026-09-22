# OpenShift Deployment

The recommended OpenShift deployment uses the included `Dockerfile`, based on
`cmssw/el9:x86_64`. This avoids nested Singularity/Apptainer: the Python server
and `cmsRun` run in the same EL9-compatible container, and CMSSW is installed
into a writable PVC at runtime. `Containerfile` is kept with the same contents
for local Podman/Docker workflows. More general setup notes are in
[INSTALL.md](INSTALL.md).

Build from the `CMSSWGraphViz` repository root with Docker strategy:

```bash
oc new-build --strategy=docker --binary --name=cmssw-truth-viz-dev
oc start-build cmssw-truth-viz-dev --from-dir=. --follow
oc new-app cmsswgraphviz
```

Do not use the classic OpenShift source/S2I launch path for pods that also use
the CERN EOS annotation
`eos.okd.cern.ch/mount-eos-with-credentials-from-secret`. That annotation mounts
an `emptyDir` over `/tmp` so Kerberos credentials can be shared between the init,
sidecar, and application containers. Classic S2I images commonly start the app
through `/tmp/scripts/run`; the EOS `/tmp` mount hides that generated script and
the pod fails with:

```text
/bin/sh: line 1: /tmp/scripts/run: No such file or directory
```

The included `Dockerfile` avoids this by baking the app into
`/opt/app-root/src` and using `/opt/app-root/src/.s2i/bin/run` as the image
command. If an existing Deployment still has a command such as
`/tmp/scripts/run`, override it to the checked-in script path:

```bash
oc set command deployment/cmsswgraphviz -- /opt/app-root/src/.s2i/bin/run
```

For `/process-root` and catalogue samples, the runtime environment must provide:

- `/cvmfs/cms.cern.ch` mounted in the running pod,
- a writable persistent volume for `TRUTHVIZ_JOB_ROOT`.

At runtime, `.s2i/bin/run`:

- looks for the configured release under `TRUTHVIZ_CMSSW_INSTALL_ROOT`,
- otherwise sources `/cvmfs/cms.cern.ch/cmsset_default.sh`,
- creates a regular `CMSSW_20_1_0_pre3` project with `scram project`,
- links the release's `PhysicsTools/TruthInfo` source into the project and exports
  `TRUTHVIZ_CMSSW_SRC` to its `src` directory,
- uses direct `scram`/`cmsRun` in the EL9 container.

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
- rejects startup if neither direct CMSSW tooling nor a configured wrapper is available.

Useful runtime configuration:

```bash
TRUTHVIZ_JOB_ROOT=/persistent/jobs
TRUTHVIZ_CMSSW_INSTALL_ROOT=/persistent/cmssw
TRUTHVIZ_CMSSW_RELEASE=CMSSW_20_1_0_pre3
TRUTHVIZ_SCRAM_ARCH=el9_amd64_gcc14
TRUTHVIZ_CATALOG=/opt/app-root/src/samples/catalog.json
TRUTHVIZ_MAX_UPLOAD_MB=2048
TRUTHVIZ_CMSRUN_TIMEOUT_SEC=3600
CMSSET_DEFAULT=/cvmfs/cms.cern.ch/cmsset_default.sh
TRUTHVIZ_SKIP_CMSSW_INSTALL=1  # only when TRUTHVIZ_CMSSW_SRC/CMSSW_BASE is provided another way
```

The old Python S2I flow can still serve prepared DOT/ROOT files, but it is not
recommended for CMSSW processing because `cmssw-el9` requires
Singularity/Apptainer, which is normally absent or blocked inside S2I Python
runtime images.

Expose the service if needed:

```bash
oc expose service/cmsswgraphviz
```

The browser still needs access to the CDN-hosted frontend libraries listed in [FRONTEND.md](FRONTEND.md), unless those assets are vendored into `app/index.html`.
