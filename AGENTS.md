# Agent guidance for CMSSWGraphViz

## Scope and purpose

This repository is a Python-assisted browser viewer for CMSSW truth graphs. It
has two materially different runtime paths:

- the prepared/catalogue path, which parses existing DOT and JSON artifacts;
- the CMSSW ROOT path, which runs `cmsRun`, exports a truth graph and rechits,
  and packages the result for the browser.

When a task touches the ROOT path, use the container workflow below. A host
Python environment is sufficient for parser/unit-test work, but it is not a
full validation of CMSSW functionality.

## Source and generated files

Keep source changes focused. Do not commit runtime products created by tests:

- `venv/`
- `data/cmssw/` and `data/jobs/`
- `data/bundle.json`, `data/rechits.json`, `data/associations.json`
- generated `app/js/bundle.js`, `app/js/rechits.js`, and
  `app/js/associations.js`

These paths are ignored intentionally. Preserve supplied ROOT, DOT, demo, and
catalogue assets unless the task explicitly changes them.

## Required full-functionality environment
The application runs inside Docker on container port 3000.

The host port is dynamically allocated by Docker. Never assume that the
application is available on port 3000.

Start the application with:

    ./dev full-setup

To obtain the current browser URL, always run:

    ./dev url

Use the returned URL for browser-based validation.

Example:

    $ ./dev url
    http://localhost:49157

Do not inspect Docker port mappings manually unless debugging the `dev`
script itself.

### Details
The development
image is based on `cmssw/el9:x86_64` but deliberately does not copy the
repository; Compose bind-mounts the working tree into `/workspace`, so source
edits are immediately visible to the running server. The checked-in
`Dockerfile` is the copy-into-image deployment path.

The tested CMSSW defaults are:

```text
CMSSW release: CMSSW_20_1_0_pre3
SCRAM architecture: el9_amd64_gcc14
TruthInfo source: /cvmfs/cms.cern.ch/el9_amd64_gcc14/cms/cmssw/CMSSW_20_1_0_pre3/src
Site configuration: /cvmfs/cms.cern.ch/SITECONF/T2_CH_CERN/
```

When CVMFS is mounted from the host, bind both the CMS root and the selected
architecture subtree. Binding only `/cvmfs` may expose `cmsset_default.sh` but
not the nested architecture/release tree inside the container.
The dev container also sets `SITECONFIG_PATH` explicitly; without it, a real
ROOT upload can fail in `SiteLocalConfigService` even though the web server and
catalogue path are healthy.


Compose uses the current worktree as the source of truth. `run.sh` creates or
reuses the ignored `venv/` and the server's ignored runtime data under `data/`.
Run as the host UID when possible so these files do not become root-owned.
Validate the rendered page from the host as well as with the container health
check; a successful API response alone does not prove that the browser UI
loaded. For a deployment-style test, build `Dockerfile` and exercise its
`scripts/run-production.sh` image entrypoint separately.



## Validation gates

Run the cheap checks first, then the container/API checks when the change
affects runtime behavior:

```bash
bash -n run.sh dev visualizeTruthGraph scripts/*.sh
venv/bin/python -m unittest discover -s tests -v
venv/bin/python -m py_compile server.py truth_pipeline.py visualizeTruthGraph preprocess/*.py tests/*.py
docker compose config
```

The expected baseline is a clean shell/Python check and the complete unittest
suite passing. A server smoke test should verify all of the following from the
same container that runs `./run.sh`:

```bash
curl --fail --silent http://127.0.0.1:8009/app/
curl --fail --silent http://127.0.0.1:8009/api/catalog
curl --fail --silent http://127.0.0.1:8009/api/catalog/ttbar-powheg/result
```

The catalogue endpoint proves that shipped JSON artifacts are loadable; it
does not exercise `cmsRun`. For a ROOT-path smoke test, upload the included
`samples/single-electron-pt35.root` to `POST /api/jobs/root` with
`eventIndex=0`, poll `/api/jobs/<id>/status` until the state is `success`, and
then read `/api/jobs/<id>/result`. HTTP 202 only means that the job was queued.

If frontend behavior is in scope, also load the viewer in a browser and check
the rendered graph, rechit panel, catalogue selection, and browser console/page
errors. API success alone does not prove that the Cytoscape/Plotly UI loaded.

## CMSSW and data-pipeline invariants

- Production uses an explicit `TRUTHVIZ_CMSSW_SRC` when supplied, derives the
  upstream CVMFS release otherwise, and provisions a fork only when
  `TRUTHVIZ_CMSSW_TOPIC` is set. `run.sh` may provision a managed local
  release; a fork topic must use its own install root.
- The generated standalone wrapper must retain both the Alpaka process
  modifier and `process.options.accelerators = cms.untracked.vstring("*")`.
  Either one alone is insufficient for the pre3 runtime.
- Keep `process.truthLogicalGraphDumper.dumpSimHits = cms.bool(True)` when
  rechit selection is expected. Rechit coordinates and node `directHitsDetIds`
  are separate outputs; having one does not imply that the other is usable.
- The wrapper runs one event and downstream rechit conversion uses output-table
  index `0`, even when the physics event number is different.
- Do not assume every workflow is registered in stock pre3. In particular,
  custom workflow `34998.88` requires separate handling rather than a direct
  `runTheMatrix.py` invocation.

## Reporting expectations

Report separately:

1. parser/unit-test results;
2. server/catalogue results;
3. real `cmsRun`/ROOT results; and
4. browser-rendering results.

Do not claim full functionality from unit tests or catalogue JSON alone. State
the container image, CMSSW release/architecture, input sample, event index,
and whether the temporary server/container was cleaned up.
