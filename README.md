# Human Nomad Simulator

Human Nomad Simulator is a browser simulation about small nomadic bands moving through a seasonal world. The bands search for food and water, remember useful places, avoid places that hurt them, split when a group gets too large, and leave behind stories that come from the run itself.

The goal is to make the simulation readable. You can inspect numbers when you need them, but the main view is written like a field note or a short history page.

## What You Can Do

1. Pick a band and read what it is doing, where it is living, what it knows, who it has met and what risks it faces.
2. Open the Chronicle tab to see a wiki style article built from that band's actual history.
3. Paint the map before starting a run so the world has the terrain you want to test.
4. Watch bands move through seasons on the canvas map.
5. Open the architecture view to see how the simulation systems connect.

## How It Works

The simulation core lives in `src/sim` and is written in TypeScript. It does not depend on React or the DOM. A seeded generator controls variation, so the same seed produces the same history.

The interface uses React, Vite and Zustand. The world is drawn on canvas, and a worker keeps the simulation moving without blocking the main screen.

## Running it

```bash
npm install
npm run dev        # development server
npm run build      # type check and production build
```

## Benchmark CLI

The simulation can also run without the browser for performance checks and behavior checks:

```bash
npm run sim:benchmark
```

Scenarios cover crowded deltas, overloaded core areas, daughter band expansion, dry margins and other cases. The benchmark script also supports reproducible checks when you want to confirm that the same setup gives the same run.

## Status

Actively developed. The current focus is making generated histories easier to read and keeping long runs fast.
