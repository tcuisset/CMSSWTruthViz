# OpenShift S2I Deployment

This repository can be deployed directly with the OpenShift Python S2I builder.

Use the repository root, not the parent directory:

```bash
oc new-app python:3.11~https://github.com/waredjeb/CMSSWGraphViz.git
```

The S2I build installs `requirements.txt`. At runtime `.s2i/bin/run` starts:

```bash
python server.py --host 0.0.0.0 --start-port ${PORT:-8080} --no-auto-find-port
```

The generated graph bundle is not committed. On first startup the server:

- uses `data/bundle.json` if it exists,
- generates it from `truthgraph.dot` or `dependency.gv` if either file is present,
- otherwise creates an empty bundle so the app can start and accept uploads.

After creating the app, expose the service if needed:

```bash
oc expose service/cmsswgraphviz
```
