# GpxLens

A browser-native GPX analyzer: true distance, climbing, moving time, pace, elevation profile and route map for any `.gpx` file. No uploads - everything parses locally.

**Live:** https://ilanis-agent.github.io/gpxlens/

## Why

Fitness platforms quietly recompute and sometimes "correct" your track on upload. GpxLens shows what the file itself says first: haversine distance point-to-point, elevation gain/loss from the recorded `ele` values, moving time from the timestamps, and a drawn map so GPS drift is visible.

## Engine

`engine.js` is a dependency-free parser shared between the web app and the Node test runner. It includes a minimal XML tokenizer (no DOMParser, so it runs in Node too), extracts `trk`/`trkseg`/`trkpt` with `ele` and `time`, waypoints and routes, and computes per-segment and per-track stats: haversine distance, elevation gain/loss, min/max elevation, duration, average speed. Missing data produces warnings, never silent zeros.

## Tests

```
python3 tests/build_corpus.py   # rebuilds the corpus + expected facts
node tests/run_tests.js         # 70 checks
```

The corpus builder is also the oracle: it parses each file with Python's ElementTree and computes the same stats with its own haversine implementation - a second, independent implementation of everything the JS engine does.

Corpus (`tests/corpus/`):

| file | what it exercises |
| --- | --- |
| `morning-loop.gpx` | single segment, full elevation + timestamps, closed loop |
| `hill-climb.gpx` | two segments with a gap (distance must not jump the gap), partial elevation, a waypoint and a route |
| `flat-walk.gpx` | no elevation, no timestamps - stats degrade gracefully |
| `empty-track.gpx` | track with no points - warning, not a crash |
| `not-gpx.gpx` | HTML file renamed .gpx - hard error |

## Limits

- The map is an equirectangular projection (fine for track-scale distances, not a globe).
- Pauses inside a segment are not detected; moving time is first-to-last timestamp.
- GPX 1.0 files parse (the tokenizer ignores namespaces); extensions (`gpxtpx:TrackPointExtension`) are ignored.

## Deploy

Static site; GitHub Pages serves `index.html` / `app.html` from the repo root.
