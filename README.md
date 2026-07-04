# Human Nomad Simulator

A deterministic simulation of nomadic human bands surviving, migrating and
slowly accumulating history — told back to you as readable stories instead of
numbers.

Bands of foragers move through a seasonal world: they learn which places feed
them, wear paths between camps, remember river crossings that went wrong,
split into daughter bands when they outgrow a territory, and carry knowledge
of places, routes and people across generations. Nothing is scripted — what
happens emerges from terrain, seasons, ecology and the bands' own memory.

## The interface

- **Band panel** — select a band and read its situation through
  player-question tabs: Overview, Doing, Survival, Food, Nature, Place,
  People, Story and Technical. Prose first; raw numbers stay in Technical.
- **Chronicle** — a wiki-style article per band: a lead summary, an infobox,
  recent years in detail, and for old bands a century framing that tells the
  long story from what actually survives (known places, worn corridors,
  remembered dangers). Pages link to each other like a small encyclopedia.
- **Map maker** — paint terrain before pressing Play to set up the world the
  simulation will unfold in.
- **Architecture graph** — an in-app map of the simulation's systems and how
  far along each one is.

## How it works

- The simulation core is pure TypeScript in `src/sim`: no React, no DOM, no
  randomness outside the seeded generator — the same seed always produces the
  same history. One tick is one season.
- The UI is React + Vite + Zustand and renders the world on canvas. A worker
  streams a small live overlay every tick and a full snapshot at a slower
  cadence to keep the map smooth.

## Running it

```bash
npm install
npm run dev        # development server
npm run build      # type-check + production build
```

## Benchmark CLI

The simulation can run headless for performance and behavior checks:

```bash
npm run sim:benchmark -- --scenario harsh_dry_margin --years 100
npm run sim:benchmark -- --scenario over_capacity_core --deterministic
```

Scenarios cover crowded deltas, over-capacity cores, daughter-band
colonization, harsh margins and more; `--deterministic` verifies that a run
reproduces exactly.

## Status

Actively developed. Current focus is readability of the generated histories
and performance of long runs.
