# Prepared events

Eight single events, ready to open in the viewer. Each folder holds the truth graph as a
gzipped DOT, the trackster associations of the same event as JSON, the rechit table as
NanoAOD, `event.json` with the event index inside that table, and, where the graph is
small enough to read on a page, the graph rendered to PDF. The three viewer inputs come
from one `cmsRun` job, so the particle indices in the JSON refer to the nodes of the DOT
next to it.

```bash
./load_event.sh              # list them
./load_event.sh demo/z_ee    # load one and start the server
```

| folder | sample | event | nodes | reco objects |
|---|---|---|---|---|
| `dy_to_tautau` | DYToLL M50 14 TeV | 7 | 470 | 9 |
| `ten_taus_event4` | TenTau 15 to 500 GeV | 4 | 511 | 105 |
| `z_ee` | ZEE 14 TeV | 3 | 422 | 18 |
| `ten_taus` | TenTau 15 to 500 GeV | 3 | 1245 | 39 |
| `vbf_h_invisible` | VBF H to ZZ to four neutrinos | 1 | 1368 | 47 |
| `h_gammagamma` | H125 to two photons, gluon fusion | 2 | 2551 | 57 |
| `dy_to_ee` | DYToLL M50 14 TeV | 3 | 3147 | 43 |
| `ttbar` | TTbar 14 TeV | 7 | 7701 | 216 |

Six of the eight are dumped with `truth-adaptive-associator-v1` as of 2026-09-17, on
`CMSSW_20_1_X_2026-09-06-2300`, so they carry the current vocabulary: the tau level split
into `tauVisibleHadronic` and `tauVisibleLeptonic`, `stableLegsFromInitialState` in place of
`stableLegsFromUpstream`, the `signal` level on the resonance, and the `initial state`
vertex role. Their RECO input is a Run4 D120 relval step3 produced with `CMSSW_20_1_0_pre2`,
read on the v1 base with the renamed TICL association products dropped, so only their truth
graph is v1.

`z_ee` and `vbf_h_invisible` are the earlier pair: Run4 D122, era `Phase2C26I13M9`,
conditions `auto:phase2_realistic_T35`, `CMSSW_20_1_X_2026-09-03-1100` with the
`truth-adaptive-associator-v1-recoviz` branch, v1 end to end but before the rename, so they
still carry `visibleTau` and `stableLegsFromUpstream`. The viewer reads both vocabularies.

`event.json` records the dumper preset of each event.

Start with `dy_to_tautau`: a Z to two taus, one hadronic and one leptonic, which is the
smallest graph and shows the two new tau levels. `ttbar` is the busiest: since the main
event keeps its parton shower and every spectator keeps its SIM subgraph, the same event
that used to draw 2566 nodes now draws 7701. Set `Hide E <` to 1 GeV to bring it back to
2079 nodes, or use the level check list.

The graphs are stored gzipped because they run to tens of megabytes and compress about
twenty times. The preprocessing reads a `.dot.gz` directly, so nothing else changes.
