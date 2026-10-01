# OpenShift Deployment

OpenShift builds this project with Docker strategy from the single production
`Dockerfile`. The resulting image contains the application, pinned browser
libraries, Python environment, and a minimal production entrypoint on port 8080.

Build from the repository root:

```bash
oc new-build --strategy=docker --binary --name=cmssw-truth-viz-dev
oc start-build cmssw-truth-viz-dev --from-dir=. --follow
oc new-app cmssw-truth-viz-dev
oc expose service/cmssw-truth-viz-dev
```

The Deployment should not override the image command. If an older deployment
still has a generated source-build command, clear that override so the
`Dockerfile` command `/opt/app-root/src/scripts/run-production.sh` is used.

## Runtime Storage and CMSSW

ROOT and EOS processing requires:

- `/cvmfs/cms.cern.ch` mounted read-only;
- a writable persistent volume for `TRUTHVIZ_JOB_ROOT`;
- the CERN site configuration at
  `/cvmfs/cms.cern.ch/SITECONF/T2_CH_CERN/`.

For the stock configuration, the image points directly to
`/cvmfs/cms.cern.ch/el9_amd64_gcc14/cms/cmssw/CMSSW_20_1_0_pre3/src`.
The production entrypoint does not provision this stock release at pod startup,
so concurrent pods do not need an installation lock.

To deploy a fork topic, set `TRUTHVIZ_CMSSW_TOPIC` in the application
environment. The production entrypoint then automatically runs the included
installer on first startup, reuses the matching completed project on later
starts, and serializes concurrent startup attempts with a fork-install lock.
Set `TRUTHVIZ_CMSSW_INSTALL_ROOT` explicitly; otherwise it is derived from
`TRUTHVIZ_JOB_ROOT` (`$(dirname "$TRUTHVIZ_JOB_ROOT")/cmssw`). For example:

```bash
TRUTHVIZ_CMSSW_TOPIC=someone:my-branch
TRUTHVIZ_CMSSW_INSTALL_ROOT=/persistent/cmssw
TRUTHVIZ_CMSSW_BUILD_JOBS=8
```

An ordinary Docker/OpenShift build cannot run `cmsrel`: the `cmssw/el9` base
image does not contain CVMFS, and CVMFS is mounted only in the runtime pod.
The runtime fork install therefore requires a writable persistent volume and
network access to the relevant GitHub fork. The equivalent installer command,
useful for a prewarmed volume or a dedicated init container, is:

```bash
/opt/app-root/src/scripts/install-cmssw.sh \
  --release CMSSW_20_1_0_pre3 \
  --arch el9_amd64_gcc14 \
  --install-root /persistent/cmssw \
  --topic someone:my-branch \
  --jobs 8
```

If `TRUTHVIZ_CMSSW_SRC` is supplied, it takes precedence and the automatic
installer is skipped. The installer records the selected topic and refuses to
reuse the directory for a different topic. A stock release normally needs no
install step at all.

Useful runtime variables:

```bash
TRUTHVIZ_JOB_ROOT=/persistent/jobs
TRUTHVIZ_CMSSW_RELEASE=CMSSW_20_1_0_pre3
TRUTHVIZ_SCRAM_ARCH=el9_amd64_gcc14
TRUTHVIZ_CMSSW_SRC=/cvmfs/cms.cern.ch/el9_amd64_gcc14/cms/cmssw/CMSSW_20_1_0_pre3/src
TRUTHVIZ_CATALOG=/opt/app-root/src/samples/catalog.json
TRUTHVIZ_MAX_UPLOAD_MB=2048
TRUTHVIZ_CMSRUN_TIMEOUT_SEC=3600
TRUTHVIZ_JOB_TTL_SEC=86400
CMSSET_DEFAULT=/cvmfs/cms.cern.ch/cmsset_default.sh
SITECONFIG_PATH=/cvmfs/cms.cern.ch/SITECONF/T2_CH_CERN/
```

To use another existing CMSSW project, set one of:

```bash
TRUTHVIZ_CMSSW_SRC=/path/to/CMSSW/src
CMSSW_BASE=/path/to/CMSSW
```

The container listens on `0.0.0.0:8080` with port auto-selection disabled.
On startup, the server opens the launcher and one FIFO processing worker. Job
results are saved in the submitting browser's IndexedDB before temporary server
data is acknowledged and deleted; browser sessions are not stored in the PVC.
