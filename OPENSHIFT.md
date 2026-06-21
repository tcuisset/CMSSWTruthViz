# OpenShift S2I Deployment

This repository can be deployed with the OpenShift Python S2I builder. More general setup notes are in [INSTALL.md](INSTALL.md).

Create the app from the `CMSSWGraphViz` repository root:

```bash
oc new-app python:3.11~https://github.com/waredjeb/CMSSWGraphViz.git
```

The S2I build installs `requirements.txt`. At runtime `.s2i/bin/run` starts:

```bash
python server.py --host 0.0.0.0 --start-port ${PORT:-8080} --no-auto-find-port
```

On startup, `server.py`:

- uses `data/bundle.json` if it exists,
- generates `data/bundle.json` from `truthgraph.dot` or `dependency.gv` if either file is present,
- otherwise creates an empty bundle so the web UI can start and accept DOT uploads.

Expose the service if needed:

```bash
oc expose service/cmsswgraphviz
```

The browser still needs access to the CDN-hosted frontend libraries listed in [FRONTEND.md](FRONTEND.md), unless those assets are vendored into `app/index.html`.
