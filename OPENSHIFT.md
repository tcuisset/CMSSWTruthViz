# OpenShift Deployment

OpenShift builds this project with Docker strategy from the single production
`Dockerfile`. The resulting image contains the application, pinned browser
libraries, Python environment, and `run.sh` entrypoint on port 8080.

Build from the repository root:

```bash
oc new-build --strategy=docker --binary --name=cmssw-truth-viz-dev
oc start-build cmssw-truth-viz-dev --from-dir=. --follow
oc new-app cmssw-truth-viz-dev
oc expose service/cmssw-truth-viz-dev
```

The Deployment should not override the image command. If an older deployment
still has a generated source-build command, clear that override so the
`Dockerfile` command `/opt/app-root/src/run.sh` is used.

## Runtime Storage and CMSSW

ROOT and EOS processing requires:

- `/cvmfs/cms.cern.ch` mounted read-only;
- a writable persistent volume for `TRUTHVIZ_JOB_ROOT`;
- the CERN site configuration at
  `/cvmfs/cms.cern.ch/SITECONF/T2_CH_CERN/`.

When neither `TRUTHVIZ_CMSSW_SRC` nor `CMSSW_BASE` is configured, `run.sh`
creates `CMSSW_20_1_0_pre3` with SCRAM. If `TRUTHVIZ_JOB_ROOT` is
`/persistent/jobs`, the default CMSSW installation is `/persistent/cmssw` so
both can share the same volume. Set `TRUTHVIZ_CMSSW_INSTALL_ROOT` to override
that location.

Useful runtime variables:

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
SITECONFIG_PATH=/cvmfs/cms.cern.ch/SITECONF/T2_CH_CERN/
```

To use an existing CMSSW project instead of provisioning one, set one of:

```bash
TRUTHVIZ_CMSSW_SRC=/path/to/CMSSW/src
CMSSW_BASE=/path/to/CMSSW
```

The container listens on `0.0.0.0:8080` with port auto-selection disabled.
On startup, the server opens the launcher and one FIFO processing worker. Job
results are saved in the submitting browser's IndexedDB before temporary server
data is acknowledged and deleted; browser sessions are not stored in the PVC.
