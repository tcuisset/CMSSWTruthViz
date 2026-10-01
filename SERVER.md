> Supported launchers: `run.sh` (configured development shell), `dev` (Compose),
> and `visualizeTruthGraph FILE` (local visualization only). `server.py` is the
> processing backend implementation. Production uses its internal image bootstrap.
> See [README.md](README.md#supported-entry-points) for the mode/launcher matrix.
>
> The local viewer CLI does not start this backend or expose its APIs. The backend
> explicitly enables frontend processing features through `app/js/runtime-config.js`.

# Server And Session Processing

The HTTP deployment has no pod-wide current event. Every uploaded CMSSW ROOT or
prepared DOT/rechit input is processed in a random directory below
`TRUTHVIZ_JOB_ROOT`. A single FIFO worker executes jobs so several users can
submit work without running several `cmsRun` processes in one pod.

## Browser handoff

The result is a versioned JSON envelope containing session metadata, the graph
bundle, optional rechits, and optional associations. The browser downloads the
envelope, commits and verifies it in IndexedDB, and then acknowledges the job.
Only that acknowledgement deletes the temporary directory. Finished jobs that
are never acknowledged are removed after `TRUTHVIZ_JOB_TTL_SEC` (24 hours by
default), including after a pod restart.

The random job ID is a bearer capability: anyone who knows it can read that
job's status and result. It provides isolation between browser clients, not user
authentication.

## API

- `POST /api/jobs/root`: multipart CMSSW ROOT upload or `source=path` EOS input.
  Fields are `rootFile` or `rootPath`, `eventIndex`, optional `dumperArgs`, and
  optional `sessionName`.
- `POST /api/jobs/prepared`: multipart `dotFile`, optional rechit `rootFile`,
  `rechitsEventIndex`, and optional `sessionName`.
- `GET /api/jobs/<id>/status`: job state, processing phase, and FIFO queue
  position. States are `queued`, `running`, `success`, and `error`.
- `GET /api/jobs/<id>/result`: complete JSON result after success. Reading this
  endpoint does not delete anything and may safely be retried.
- `DELETE /api/jobs/<id>`: acknowledge a terminal job and delete all of its
  server-side files.
- `GET /api/catalog`: public metadata for persistent prebuilt samples.
- `GET /api/catalog/<id>/result`: persistent graph and rechit JSON for one
  catalogue sample. This endpoint never runs `cmsRun`.

The older global `/upload`, `/process-root`, `/upload-status`, and runtime sample
processing endpoints are intentionally removed.

## Catalogue artifacts

`samples/catalog.json` retains each ROOT input and its dumper settings for
provenance, and adds `artifacts.bundle`, `artifacts.rechits`, and optionally
`artifacts.associations`. These JSON files are deployed with the app and are
never deleted by job cleanup.

Rebuild one or all samples in a configured CMSSW environment with:

```bash
venv/bin/python preprocess/build_catalog_artifacts.py
venv/bin/python preprocess/build_catalog_artifacts.py --sample dy-to-tautau
```

## Runtime configuration

- `TRUTHVIZ_JOB_ROOT`: temporary job parent, default `data/jobs`.
- `TRUTHVIZ_JOB_TTL_SEC`: terminal-job retention, default `86400`.
- `TRUTHVIZ_CATALOG`: catalogue manifest, default `samples/catalog.json`.
- `TRUTHVIZ_MAX_UPLOAD_MB`: maximum request size, default `2048`.
- `TRUTHVIZ_CMSRUN_TIMEOUT_SEC`: CMSSW timeout, default `3600`.
- `TRUTHVIZ_CMSSW_SRC`, `CMSSW_BASE`, and `TRUTHVIZ_CMSRUN_WRAPPER`: CMSSW
  runtime selection.
- `TRUTHVIZ_CMSSW_TOPIC`: optional `user:branch` passed to the local CMSSW
  installer. Production startup never installs a topic automatically.
- `TRUTHVIZ_ALLOW_LOCAL_ROOT_PATHS=1`: permit non-EOS server paths for local
  development only.

Server-mode jobs never write `data/bundle.json`, `data/rechits.json`, or
generated `app/js/*.js`. Those paths remain available only to explicit static
export preprocessing commands.
