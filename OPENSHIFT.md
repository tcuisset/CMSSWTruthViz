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

For uploaded ROOT and EOS processing, the runtime environment must provide:

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

On startup, `server.py` opens the event launcher, starts one FIFO processing
worker, and cleans abandoned random job directories older than the configured
TTL. It does not publish a shared current event. Catalogue choices read the
prebuilt JSON shipped below `samples/artifacts`; ROOT and EOS choices use
temporary capability-scoped job directories.

Useful runtime configuration:

```bash
TRUTHVIZ_JOB_ROOT=/persistent/jobs
TRUTHVIZ_CMSSW_INSTALL_ROOT=/persistent/cmssw
TRUTHVIZ_CMSSW_RELEASE=CMSSW_20_1_0_pre3
TRUTHVIZ_SCRAM_ARCH=el9_amd64_gcc14
TRUTHVIZ_CATALOG=/opt/app-root/src/samples/catalog.json
TRUTHVIZ_MAX_UPLOAD_MB=2048
TRUTHVIZ_CMSRUN_TIMEOUT_SEC=3600
TRUTHVIZ_JOB_TTL_SEC=86400
CMSSET_DEFAULT=/cvmfs/cms.cern.ch/cmsset_default.sh
TRUTHVIZ_SKIP_CMSSW_INSTALL=1  # only when TRUTHVIZ_CMSSW_SRC/CMSSW_BASE is provided another way
```

The result JSON is saved in the submitting browser's IndexedDB before the
temporary server directory is acknowledged and deleted. Browser sessions are
local to one origin and browser profile; they are not stored in the PVC.

Expose the service if needed:

```bash
oc expose service/cmsswgraphviz
```

The container build installs the pinned npm packages in a Node.js build stage
and copies the generated browser libraries into the final CMSSW image. The
running browser does not need CDN access.
