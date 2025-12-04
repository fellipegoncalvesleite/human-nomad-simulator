// FrontierKnowledge v0 (checkpoint M0.6) — Bounded, anti-omniscient NEAR-WATER MARGIN
// (shoreline / around-lake corridor) knowledge FORMATION.
//
// WHY THIS EXISTS (M0.5 lake audit `truth_overlay_only_unknown_to_band`): a genuinely
// reachable rich opposite-shore patch (the audit's `tile:53:67`) stays truth-only
// through year 200 — no band ever observes it, so it never enters any candidate /
// opportunity set. The cause is a KNOWLEDGE gap, not a movement bug: a band's known
// world only ever grows by its own 2-ring observation on a move and by re-scouting
// already-known patches (`selectResourceScoutTarget` iterates `patchMemories` only).
// The around-lake LAND corridor is never traversed, so the far shore is never learned.
// (M0.6 geography note: that lake's shoreline is fragmented into tiny disconnected
// pockets separated by open water; the ONLY land link between a band's lakeside and the
// target's approach pocket is a corridor that hugs the water within ~2 tiles — so a
// strict "shore-adjacent only" rule cannot bridge it, but a near-water margin can.)
//
// WHAT THIS DOES: a band with sustained presence ON a near-water margin tile gradually
// INFERS the EXISTENCE of the next reachable NEAR-WATER LAND tiles — one bounded ring
// per season, stepping outward from its OWN band-known margin tiles (observed or already
// inferred). The "near-water margin" is the land corridor within `MARGIN_WATER_DISTANCE`
// tiles of any water (the plausible "follow the water's edge around" route). Over seasons
// this walks the around-lake corridor, so a reachable far shore can BECOME band-known
// through plausible, local, deterministic steps.
//
// HARD SCOPE LOCK (M0.6):
//   * NO omniscient richness — an inferred tile stores ONLY existence + near-water
//     topology + provenance. It has NO richness / yield / water value of any kind.
//     "Knowing a tile exists ≠ knowing its resources."
//   * NO rich-tile migration / NO forced movement — formation itself stores only the
//     knowledge substrate. M0.7 may let a settled band send a residence-unchanged
//     probe to OBSERVE a nearby inferred land tile, but only real visitation ever
//     learns richness.
//   * NO crossing open water — inference only ever adds LAND tiles (never an aquatic
//     tile), each adjacent to an already-known near-water LAND tile; it never jumps
//     across water. No directing toward a hidden target (selection is id-ordered).
//   * Bounded & deterministic — small per-season cap, hard total cap, id-ordered
//     selection, no `unseeded random call`, no `any`, no full-map scan (it iterates only the
//     band's own bounded memory + immediate neighbour rings; the near-water test is a
//     bounded depth-`MARGIN_WATER_DISTANCE` local BFS), no UI imports.

import type { ReasonId, TickNumber, TileId } from "../core/types";
import type { KnownTileRecord } from "../knowledge/types";
import type { Band, FrontierKnowledgeState, InferredFrontierTile } from "./types";
import type { Tile, WorldState } from "../world/types";
import { getTile } from "../world/generate";
import { isBandPassableDestination } from "../world/passability";

const EMPTY_TILE_IDS: readonly TileId[] = [];

interface ObservedFrontierClassification {
  readonly marginIds: readonly TileId[];
  readonly corridorIds: readonly TileId[];
}

// PERF-2: memoize the margin/corridor classification of a band's observed
// tiles, keyed on the (immutable) observedTiles object. Pure function of that
// object + static world topology (memoized predicates), so reuse is
// byte-identical and preserves the exact `Object.keys` iteration order.
const observedFrontierClassificationMemo = new WeakMap<
  Readonly<Record<TileId, KnownTileRecord>>,
  ObservedFrontierClassification
>();

function classifyObservedFrontierTiles(
  world: WorldState,
  observedTiles: Readonly<Record<TileId, KnownTileRecord>>,
): ObservedFrontierClassification {
  const cached = observedFrontierClassificationMemo.get(observedTiles);

  if (cached !== undefined) {
    return cached;
  }

  const marginIds: TileId[] = [];
  const corridorIds: TileId[] = [];

  for (const tileId of Object.keys(observedTiles)) {
    const tile = getTile(world, tileId as TileId);

    if (tile === undefined) {
      continue;
    }

    if (isNearWaterMarginLand(world, tile)) {
      marginIds.push(tileId as TileId);
    }

    if (isChannelCorridorLand(world, tile)) {
      corridorIds.push(tileId as TileId);
    }
  }

  const classification: ObservedFrontierClassification = { marginIds, corridorIds };
  observedFrontierClassificationMemo.set(observedTiles, classification);

  return classification;
}

// --- Bounds (all small: a slow, local near-water crawl, never a map reveal) ---
// Sustained presence: the band must have dwelt on this margin tile before it starts
// inferring the corridor around it (repeated presence near a water frontier).
const SHORE_PRESENCE_MIN_VISITS = 2;
// How close to water a LAND tile must be to count as the near-water margin corridor
// (graph distance in tiles, via a bounded local BFS). 2 keeps the crawl hugging the
// water's edge — enough to bridge fragmented shore pockets, not a whole-land flood.
const MARGIN_WATER_DISTANCE = 2;
// Per-season ring growth — how many new margin tiles are inferred each supported season.
const PROPAGATION_CAP_PER_SEASON = 2;
// Hard total cap per band (bounds memory; an around-lake corridor crawl, not a flood).
const MAX_INFERRED_TILES = 256;
// Existence-only belief confidence — low; it is inferred, never visited.
const INFERRED_CONFIDENCE = 0.2;

// --- M0.12: corridor-continuation inference bounds -------------------------
// Evidence: the band must personally KNOW this many channel-corridor tiles (it
// has genuinely walked/observed a stretch of channel) before continuing it.
const CORRIDOR_MIN_OBSERVED_EVIDENCE = 4;
// Per-season chain growth (its own budget — does not consume the margin cap).
const CORRIDOR_PROPAGATION_CAP_PER_SEASON = 2;
// Own hard cap for corridor-sourced records (a thin chain travels far on a
// small budget; this is ~50-90 tiles of bank — never a whole-river reveal).
const MAX_CORRIDOR_INFERRED_TILES = 96;
// Unvisited corridor beliefs FADE: a continuation the band never goes to see
// stops being carried after ~15 years (margin-sourced records keep M0.6's
// accepted no-decay semantics — only the new source decays).
const CORRIDOR_INFERENCE_TTL_TICKS = 60;

// --- M0.16: off-corridor SIDE inference bounds -----------------------------
// The PERPENDICULAR analogue of M0.12. A band that has personally walked enough
// of a channel corridor (same evidence threshold) also infers the EXISTENCE of
// the adjacent off-corridor side land it passes — never its richness. Evidence:
// reuse the corridor-walked threshold (a band that knows the corridor well
// enough to continue it has had the same chance to glimpse the side-country).
const SIDE_MIN_CORRIDOR_EVIDENCE = CORRIDOR_MIN_OBSERVED_EVIDENCE;
// Perpendicular reach: how many graph-steps OFF a channel-corridor tile a side
// tile may be and still be "passing-by observable". 2 keeps it a thin apron
// hugging the corridor (side valley mouths, creek-adjacent plains, the hill
// beside the bank) — never a flood into the deep backcountry. Matches the
// MARGIN_WATER_DISTANCE=2 "near-water" depth for symmetry.
const SIDE_REACH_DISTANCE = 2;
// Per-season perpendicular growth (its own budget — does not consume the margin
// or corridor caps).
const SIDE_PROPAGATION_CAP_PER_SEASON = 2;
// Own hard cap for side-sourced records: a 2-deep apron along a long known
// corridor, never a whole-hinterland reveal. Smaller than the corridor chain's
// 96 because perpendicular fringe is wider per unit length and must stay thin.
const MAX_SIDE_INFERRED_TILES = 64;
// Unvisited side beliefs FADE on the same ~15-year clock as corridor beliefs:
// side-country the band never goes to scout stops being carried (observed tiles
// always supersede immediately; only the inferred existence belief decays).
const SIDE_INFERENCE_TTL_TICKS = 60;

// Static-topology memo (perf, behaviour-identical): margin/corridor classification
// depends ONLY on immutable world tile data, but the predicates below were being
// re-evaluated (with a bounded BFS) for every observed tile of every band on every
// tick — the top sim hotspot in profiling (~11% of run time). Tiles records are
// reference-stable for a world's lifetime, so results are cached per tiles object.
const marginLandMemo = new WeakMap<Readonly<Record<TileId, Tile>>, Map<TileId, boolean>>();
const corridorLandMemo = new WeakMap<Readonly<Record<TileId, Tile>>, Map<TileId, boolean>>();
const sideReachMemo = new WeakMap<Readonly<Record<TileId, Tile>>, Map<TileId, boolean>>();

function memoizedTopology(
  memo: WeakMap<Readonly<Record<TileId, Tile>>, Map<TileId, boolean>>,
  world: WorldState,
  tile: Tile,
  compute: (world: WorldState, tile: Tile) => boolean,
): boolean {
  let cache = memo.get(world.tiles);

  if (cache === undefined) {
    cache = new Map();
    memo.set(world.tiles, cache);
  }

  const cached = cache.get(tile.id);

  if (cached !== undefined) {
    return cached;
  }

  const result = compute(world, tile);
  cache.set(tile.id, result);

  return result;
}

// A LAND tile within MARGIN_WATER_DISTANCE tiles of water (the near-water margin /
// around-lake corridor). Bounded depth-K local BFS — never a full-map scan. Exported so
// M0.8 corridor relocation can keep a relocation step ON the shore corridor.
export function isNearWaterMarginLand(world: WorldState, tile: Tile): boolean {
  return memoizedTopology(marginLandMemo, world, tile, computeIsNearWaterMarginLand);
}

function computeIsNearWaterMarginLand(world: WorldState, tile: Tile): boolean {
  if (tile.isAquatic) {
    return false; // water itself is never a land margin tile (and never passable)
  }

  const visited = new Set<string>([String(tile.id)]);
  let frontier: TileId[] = [tile.id];

  for (let depth = 0; depth < MARGIN_WATER_DISTANCE; depth += 1) {
    const next: TileId[] = [];

    for (const tileId of frontier) {
      const current = getTile(world, tileId);

      if (current === undefined) {
        continue;
      }

      for (const neighborId of current.neighbors) {
        const neighbor = getTile(world, neighborId);

        if (neighbor === undefined) {
          continue;
        }
        if (neighbor.isAquatic) {
          return true; // water within MARGIN_WATER_DISTANCE → this is a margin tile
        }
        if (!visited.has(String(neighborId))) {
          visited.add(String(neighborId));
          next.push(neighborId);
        }
      }
    }

    frontier = next;
  }

  return false;
}

// M0.12 — Channel-corridor LAND: a land tile that carries a creek line
// (hasCreek — sub-tile stream corridors, Map 2) or hugs a river channel
// (4-adjacent to an isRiver tile — main rivers, tributaries, seasonal/dry
// rivers on both maps). The channel's own aquatic tiles are never corridor
// tiles (no open-water inference). Static topology only — no richness read.
export function isChannelCorridorLand(world: WorldState, tile: Tile): boolean {
  return memoizedTopology(corridorLandMemo, world, tile, computeIsChannelCorridorLand);
}

function computeIsChannelCorridorLand(world: WorldState, tile: Tile): boolean {
  if (tile.isAquatic) {
    return false;
  }

  if (tile.hasCreek === true) {
    return true;
  }

  for (const neighborId of tile.neighbors) {
    const neighbor = getTile(world, neighborId);

    if (neighbor !== undefined && neighbor.isRiver) {
      return true;
    }
  }

  return false;
}

// M0.16 — Off-corridor SIDE land: PASSABLE land that is NOT itself a channel
// corridor (Stage 2 owns those) and NOT a near-water margin (Stage 1 owns
// those), but lies within SIDE_REACH_DISTANCE graph-steps of the river-VALLEY
// apron — i.e. of a channel-corridor OR near-water-margin land tile. Anchoring
// reach to the VALLEY (corridor + margin), not the bare channel, is essential:
// along a wet river EVERY tile within 2 of the channel is also within 2 of the
// water, so it is a margin tile — the genuine off-corridor side-country (the
// side valley / plain / basin the band glimpses from the river) begins just
// BEYOND that riverside margin. This predicate therefore captures the thin band
// of non-margin land hugging the OUTER edge of the river valley (side valleys,
// creek-adjacent plains, the hill/ridge beside the bank, tributary-mouth land,
// dry margins, open land adjacent to the valley). The bounded depth-K local BFS
// is the HARD perpendicular-depth clamp: side knowledge can never extend deeper
// than SIDE_REACH_DISTANCE beyond the valley apron, so it stays a thin off-valley
// fringe, never a backcountry flood. Static topology only — NO richness read.
export function isWithinSideReachOfCorridor(world: WorldState, tile: Tile): boolean {
  return memoizedTopology(sideReachMemo, world, tile, computeIsWithinSideReachOfCorridor);
}

function computeIsWithinSideReachOfCorridor(world: WorldState, tile: Tile): boolean {
  if (tile.isAquatic) {
    return false; // water is never side land (and never passable)
  }
  if (!isBandPassableDestination(tile)) {
    return false; // never infer side land through impassable ground (mountain walls)
  }
  if (isChannelCorridorLand(world, tile)) {
    return false; // a corridor tile is the route itself — Stage 2's domain, not "side"
  }
  if (isNearWaterMarginLand(world, tile)) {
    return false; // a near-water margin tile is Stage 1's domain, not off-corridor "side"
  }

  // Within SIDE_REACH_DISTANCE steps of the river-valley apron (a channel
  // corridor OR a near-water margin tile)? Bounded local BFS — never a full-map
  // scan. The tile itself is non-corridor AND non-margin (excluded above), so we
  // look outward for the nearest valley-apron tile within the reach.
  const visited = new Set<string>([String(tile.id)]);
  let frontier: TileId[] = [tile.id];

  for (let depth = 0; depth < SIDE_REACH_DISTANCE; depth += 1) {
    const next: TileId[] = [];

    for (const tileId of frontier) {
      const current = getTile(world, tileId);

      if (current === undefined) {
        continue;
      }

      for (const neighborId of current.neighbors) {
        if (visited.has(String(neighborId))) {
          continue;
        }

        const neighbor = getTile(world, neighborId);

        if (neighbor === undefined) {
          continue;
        }
        if (isChannelCorridorLand(world, neighbor) || isNearWaterMarginLand(world, neighbor)) {
          return true; // valley apron within SIDE_REACH_DISTANCE → this is off-valley side land
        }

        visited.add(String(neighborId));
        next.push(neighborId);
      }
    }

    frontier = next;
  }

  return false;
}

function makeFrontierKnowledgeReasonId(band: Band, tick: TickNumber): ReasonId {
  return `reason:${String(band.id)}:${String(tick)}:frontier_margin_inference` as ReasonId;
}

function makeCorridorInferenceReasonId(band: Band, tick: TickNumber): ReasonId {
  return `reason:${String(band.id)}:${String(tick)}:corridor_continuation_inference` as ReasonId;
}

function makeSideInferenceReasonId(band: Band, tick: TickNumber): ReasonId {
  return `reason:${String(band.id)}:${String(tick)}:off_corridor_side_inference` as ReasonId;
}

// Tick-gated advance (mirrors FrontierIntent / FrontierResidence: the first context pass
// this tick advances it, later passes see the same tick and return the prior state
// unchanged, so propagation is exactly one bounded ring step per season — deterministic).
export function advanceFrontierShorelineKnowledge(
  world: WorldState,
  band: Band,
): FrontierKnowledgeState | undefined {
  const tick = world.time.tick;
  const prior = band.frontierKnowledge;

  if (prior !== undefined && prior.lastUpdatedTick === tick) {
    return prior;
  }

  // Conversion cleanup (M0.7): once the band has PERSONALLY OBSERVED a tile (e.g. it
  // physically explored onto an inferred corridor step), the real KnownTileRecord
  // supersedes the existence-only inference — drop it from the inferred set so inference
  // never shadows real knowledge and a visit reads as a genuine inference→observation
  // conversion. M0.12 adds TTL decay for corridor-sourced beliefs only: a continuation
  // the band never goes to see stops being carried after CORRIDOR_INFERENCE_TTL_TICKS
  // (margin-sourced records keep M0.6's accepted no-decay semantics). Deterministic.
  const shouldDrop = (tileId: string, record: InferredFrontierTile): boolean => {
    if (band.knowledge.observedTiles[tileId as TileId] !== undefined) {
      return true;
    }

    const age = Number(tick) - Number(record.inferredAtTick);

    if (record.source === "corridor_continuation_inference") {
      return age > CORRIDOR_INFERENCE_TTL_TICKS;
    }

    // M0.16: unvisited off-corridor side beliefs fade on their own TTL clock.
    if (record.source === "off_corridor_side_inference") {
      return age > SIDE_INFERENCE_TTL_TICKS;
    }

    // Margin-sourced records keep M0.6's accepted no-decay semantics.
    return false;
  };

  const pruneObserved = (
    tiles: Readonly<Record<string, InferredFrontierTile>>,
  ): Record<string, InferredFrontierTile> => {
    // Fast path (perf, behaviour-identical): most seasons drop nothing — reuse the
    // existing (frozen-in-practice, read-only) record instead of rebuilding it.
    let anyDropped = false;

    for (const tileId of Object.keys(tiles)) {
      if (shouldDrop(tileId, tiles[tileId])) {
        anyDropped = true;
        break;
      }
    }

    if (!anyDropped) {
      return tiles as Record<string, InferredFrontierTile>;
    }

    const result: Record<string, InferredFrontierTile> = {};

    for (const tileId of Object.keys(tiles)) {
      if (!shouldDrop(tileId, tiles[tileId])) {
        result[tileId] = tiles[tileId];
      }
    }

    return result;
  };

  const inertFromPruned = (
    pruned: Readonly<Record<string, InferredFrontierTile>>,
  ): FrontierKnowledgeState | undefined => {
    if (prior === undefined) {
      return undefined;
    }

    return {
      ...prior,
      lastUpdatedTick: tick,
      inferredTiles: pruned,
      cumulativeInferredCount: Object.keys(pruned).length,
      lastAddedTileIds: [],
      reasonIds: [],
    };
  };

  // Helper: when this season does not propagate, keep the (pruned) inferred set but bump
  // the tick-gate (so later passes this tick are inert) and clear the per-season "newly
  // added" surface so the debug/report does not show stale additions.
  const inertThisSeason = (): FrontierKnowledgeState | undefined => {
    return prior === undefined ? undefined : inertFromPruned(pruneObserved(prior.inferredTiles));
  };

  const positionTile = getTile(world, band.position);

  if (positionTile === undefined) {
    return inertThisSeason();
  }

  // Gate (allowed source: "repeated presence near a frontier" / a known boundary):
  // the band must have sustained presence AND be ON a near-water margin land tile
  // (M0.6 shoreline stage) or ON a channel-corridor land tile (M0.12 corridor stage).
  const memory = band.placeMemory[band.position];
  const sustainedPresence = (memory?.visitCount ?? 0) >= SHORE_PRESENCE_MIN_VISITS;
  const onMargin = isNearWaterMarginLand(world, positionTile);
  const onCorridor = isChannelCorridorLand(world, positionTile);

  if (!sustainedPresence || (!onMargin && !onCorridor)) {
    return inertThisSeason();
  }

  const pruned = pruneObserved(prior?.inferredTiles ?? {});
  let inferred: Record<string, InferredFrontierTile> = pruned as Record<string, InferredFrontierTile>;
  let inferredIsMutable = pruned !== prior?.inferredTiles;
  const mutableInferred = (): Record<string, InferredFrontierTile> => {
    if (!inferredIsMutable) {
      inferred = { ...inferred };
      inferredIsMutable = true;
    }

    return inferred;
  };
  let marginTotal = 0;
  let corridorTotal = 0;
  let sideTotal = 0;

  for (const tileId of Object.keys(inferred)) {
    const source = inferred[tileId].source;

    if (source === "corridor_continuation_inference") {
      corridorTotal += 1;
    } else if (source === "off_corridor_side_inference") {
      sideTotal += 1;
    } else {
      marginTotal += 1;
    }
  }

  // Single classification pass over the band's observed memory (perf,
  // behaviour-identical): both stages need the observed tiles classified with
  // the (memoized) static-topology predicates; iterating once and feeding both
  // stages preserves the exact per-stage ordering the separate loops produced.
  // PERF-2: the classification (which known tiles are margin/corridor) is a
  // pure function of the band's observedTiles object + static world topology,
  // so it is memoized on that object — it stays valid (and is re-served) across
  // every context pass and every tick until the band actually observes a new
  // tile (which produces a fresh observedTiles object). This was the top sim
  // hotspot (advanceFrontierShorelineKnowledge ~5% self-time) because it
  // re-scanned 200+ known tiles for every water-adjacent band every tick.
  let observedMarginIds: readonly TileId[] = EMPTY_TILE_IDS;
  let observedCorridorIds: readonly TileId[] = EMPTY_TILE_IDS;

  if ((onMargin && marginTotal < MAX_INFERRED_TILES) || onCorridor) {
    const classification = classifyObservedFrontierTiles(world, band.knowledge.observedTiles);
    observedMarginIds = classification.marginIds;
    observedCorridorIds = classification.corridorIds;
  }

  // --- Stage 1 (M0.6, semantics unchanged): undirected near-water margin ring.
  // Margin-sourced records keep their own 256 cap — the corridor budget is separate.
  const marginAdded: TileId[] = [];

  if (onMargin && marginTotal < MAX_INFERRED_TILES) {
    // Observed margin tiles in memory order, then ALL inferred tiles — exactly
    // the frontier the dedicated collector produced.
    const knownMarginTileIds: TileId[] = [
      ...observedMarginIds,
      ...(Object.keys(inferred) as TileId[]),
    ];

    // One bounded ring outward: unknown near-water margin LAND neighbours of the
    // band-known margin tiles. Never a water tile (no open-water crossing), never an
    // already-known tile. candidateTileId -> the band-known origin tile (provenance).
    const candidates = new Map<string, TileId>();

    for (const knownId of knownMarginTileIds) {
      const knownTile = getTile(world, knownId);

      if (knownTile === undefined) {
        continue;
      }

      for (const neighborId of knownTile.neighbors) {
        const key = String(neighborId);

        if (candidates.has(key)) {
          continue;
        }
        if (band.knowledge.observedTiles[neighborId] !== undefined) {
          continue; // already personally observed — not an inference target
        }
        if (inferred[key] !== undefined) {
          continue; // already inferred
        }

        const neighborTile = getTile(world, neighborId);

        if (neighborTile === undefined || neighborTile.isAquatic) {
          continue; // land only — never infer/cross an open-water tile
        }
        if (!isNearWaterMarginLand(world, neighborTile)) {
          continue; // stay on the near-water corridor (the reachable around-lake margin)
        }

        candidates.set(key, knownId);
      }
    }

    // Deterministic id-ordered selection; small per-season cap; hard total cap.
    const ordered = takeLowestCandidateEntries(
      candidates,
      Math.min(PROPAGATION_CAP_PER_SEASON, MAX_INFERRED_TILES - marginTotal),
    );

    for (const [candidateId, originId] of ordered) {
      if (marginAdded.length >= PROPAGATION_CAP_PER_SEASON || marginTotal >= MAX_INFERRED_TILES) {
        break;
      }

      mutableInferred()[candidateId] = {
        tileId: candidateId as TileId,
        inferredAtTick: tick,
        source: "near_water_margin_inference",
        originKnownTileId: originId,
        isNearWaterMargin: true,
        confidence: INFERRED_CONFIDENCE,
        noOmniscientRichness: true,
      };
      marginAdded.push(candidateId as TileId);
      marginTotal += 1;
    }
  }

  // --- Stage 2 (M0.12): DIRECTED corridor-chain continuation. A band that has
  // personally walked enough of a river/creek corridor continues the chain past
  // its band-known endpoints — unknown channel-corridor land adjacent to known
  // corridor tiles. Existence-only, land-only, passable-only, id-ordered, its own
  // small per-season cap and total budget. Unlike the undirected margin flood
  // (which spends its budget circling local water), a thin chain travels far —
  // this is what lets a deep dry-margin band eventually LEARN that its channel
  // continues downstream, without ever being told what is there.
  const corridorAdded: TileId[] = [];

  if (onCorridor && corridorTotal < MAX_CORRIDOR_INFERRED_TILES) {
    const observedEvidence = observedCorridorIds.length;
    const knownCorridorIds: TileId[] = [...observedCorridorIds];

    for (const tileId of Object.keys(inferred)) {
      if (inferred[tileId].source === "corridor_continuation_inference") {
        knownCorridorIds.push(tileId as TileId);
      }
    }

    if (observedEvidence >= CORRIDOR_MIN_OBSERVED_EVIDENCE) {
      const candidates = new Map<string, TileId>();

      for (const knownId of knownCorridorIds) {
        const knownTile = getTile(world, knownId);

        if (knownTile === undefined) {
          continue;
        }

        for (const neighborId of knownTile.neighbors) {
          const key = String(neighborId);

          if (candidates.has(key)) {
            continue;
          }
          if (band.knowledge.observedTiles[neighborId] !== undefined) {
            continue; // already personally observed — not an inference target
          }
          if (inferred[key] !== undefined) {
            continue; // already inferred
          }

          const neighborTile = getTile(world, neighborId);

          if (neighborTile === undefined || neighborTile.isAquatic) {
            continue; // land only — never infer across open water
          }
          if (!isBandPassableDestination(neighborTile)) {
            continue; // never infer through impassable ground (mountain walls)
          }
          if (!isChannelCorridorLand(world, neighborTile)) {
            continue; // stay ON the channel corridor — a chain, not a flood
          }

          candidates.set(key, knownId);
        }
      }

      const ordered = takeLowestCandidateEntries(
        candidates,
        Math.min(CORRIDOR_PROPAGATION_CAP_PER_SEASON, MAX_CORRIDOR_INFERRED_TILES - corridorTotal),
      );

      for (const [candidateId, originId] of ordered) {
        if (
          corridorAdded.length >= CORRIDOR_PROPAGATION_CAP_PER_SEASON ||
          corridorTotal >= MAX_CORRIDOR_INFERRED_TILES
        ) {
          break;
        }

        const candidateTile = getTile(world, candidateId as TileId);

        mutableInferred()[candidateId] = {
          tileId: candidateId as TileId,
          inferredAtTick: tick,
          source: "corridor_continuation_inference",
          originKnownTileId: originId,
          isNearWaterMargin:
            candidateTile !== undefined && isNearWaterMarginLand(world, candidateTile),
          confidence: INFERRED_CONFIDENCE,
          noOmniscientRichness: true,
        };
        corridorAdded.push(candidateId as TileId);
        corridorTotal += 1;
      }
    }
  }

  // --- Stage 3 (M0.16): PERPENDICULAR off-corridor side inference. A band that
  // has personally walked enough of a channel corridor (same observed evidence as
  // Stage 2) also infers the EXISTENCE of the off-VALLEY side land it passes —
  // unknown, passable, non-corridor, non-margin land within SIDE_REACH_DISTANCE of
  // the band-known river-valley apron. It grows off the band's observed corridor
  // AND observed margin tiles (its known riverside), plus its inferred corridor
  // chain and its own already-inferred side tiles, but each candidate must pass
  // isWithinSideReachOfCorridor, so the fringe can NEVER extend deeper than
  // SIDE_REACH_DISTANCE beyond the valley apron — a thin observation platform, not
  // a backcountry flood. Existence-only, land-only, passable-only, id-ordered; its
  // own small per-season cap and total budget. This is the perpendicular analogue
  // of Stage 2: it gives a corridor founder a band-known, anti-omniscient SIDE
  // region to consider WITHOUT truth richness or a hidden "go to green" pull.
  const sideAdded: TileId[] = [];

  if (onCorridor && sideTotal < MAX_SIDE_INFERRED_TILES) {
    const observedEvidence = observedCorridorIds.length;

    if (observedEvidence >= SIDE_MIN_CORRIDOR_EVIDENCE) {
      // Grow off the band's known river-VALLEY apron — observed corridor tiles
      // AND observed margin tiles (the riverside the band saw while travelling) —
      // plus the band's inferred corridor chain (Stage 2) and its own already-
      // inferred side tiles. The observed margin tiles are the essential stepping
      // stones: along a wet river the side-country begins just beyond the margin,
      // so without margin origins the inference could never reach off-valley land.
      const knownOriginIds: TileId[] = [...observedCorridorIds, ...observedMarginIds];

      for (const tileId of Object.keys(inferred)) {
        const source = inferred[tileId].source;

        if (
          source === "corridor_continuation_inference" ||
          source === "off_corridor_side_inference"
        ) {
          knownOriginIds.push(tileId as TileId);
        }
      }

      const candidates = new Map<string, TileId>();

      for (const knownId of knownOriginIds) {
        const knownTile = getTile(world, knownId);

        if (knownTile === undefined) {
          continue;
        }

        for (const neighborId of knownTile.neighbors) {
          const key = String(neighborId);

          if (candidates.has(key)) {
            continue;
          }
          if (band.knowledge.observedTiles[neighborId] !== undefined) {
            continue; // already personally observed — not an inference target
          }
          if (inferred[key] !== undefined) {
            continue; // already inferred (any source)
          }

          const neighborTile = getTile(world, neighborId);

          if (neighborTile === undefined) {
            continue;
          }
          // The predicate is the single gate: passable LAND, non-aquatic,
          // non-corridor, non-margin, and within SIDE_REACH_DISTANCE of a channel.
          if (!isWithinSideReachOfCorridor(world, neighborTile)) {
            continue;
          }

          candidates.set(key, knownId);
        }
      }

      const ordered = takeLowestCandidateEntries(
        candidates,
        Math.min(SIDE_PROPAGATION_CAP_PER_SEASON, MAX_SIDE_INFERRED_TILES - sideTotal),
      );

      for (const [candidateId, originId] of ordered) {
        if (
          sideAdded.length >= SIDE_PROPAGATION_CAP_PER_SEASON ||
          sideTotal >= MAX_SIDE_INFERRED_TILES
        ) {
          break;
        }

        mutableInferred()[candidateId] = {
          tileId: candidateId as TileId,
          inferredAtTick: tick,
          source: "off_corridor_side_inference",
          originKnownTileId: originId,
          // Side tiles are non-margin by construction (the predicate excludes
          // margin tiles), so this is honestly false — recorded, not assumed.
          isNearWaterMargin: false,
          confidence: INFERRED_CONFIDENCE,
          noOmniscientRichness: true,
        };
        sideAdded.push(candidateId as TileId);
        sideTotal += 1;
      }
    }
  }

  const added: TileId[] = [...marginAdded, ...corridorAdded, ...sideAdded];

  // No new tile this season (frontier fully known locally) → keep prior set, inert surface.
  if (added.length === 0) {
    return inertFromPruned(pruned);
  }

  const reasonIds: ReasonId[] = [];

  if (marginAdded.length > 0) {
    reasonIds.push(makeFrontierKnowledgeReasonId(band, tick));
  }

  if (corridorAdded.length > 0) {
    reasonIds.push(makeCorridorInferenceReasonId(band, tick));
  }

  if (sideAdded.length > 0) {
    reasonIds.push(makeSideInferenceReasonId(band, tick));
  }

  return {
    bandId: band.id,
    lastUpdatedTick: tick,
    inferredTiles: inferred,
    cumulativeInferredCount: marginTotal + corridorTotal + sideTotal,
    lastAddedTileIds: added,
    // Debug label of the newest stage that added this season (no behaviour).
    lastSource:
      sideAdded.length > 0
        ? "off_corridor_side_inference"
        : corridorAdded.length > 0
          ? "corridor_continuation_inference"
          : "near_water_margin_inference",
    reasonIds,
    noOmniscientRichness: true,
  };
}

function takeLowestCandidateEntries(
  candidates: ReadonlyMap<string, TileId>,
  limit: number,
): readonly (readonly [string, TileId])[] {
  if (limit <= 0) {
    return [];
  }

  const selected: (readonly [string, TileId])[] = [];

  for (const entry of candidates.entries()) {
    const insertAt = selected.findIndex(([candidateId]) => entry[0] < candidateId);

    if (insertAt === -1) {
      if (selected.length < limit) {
        selected.push(entry);
      }
      continue;
    }

    selected.splice(insertAt, 0, entry);
    if (selected.length > limit) {
      selected.pop();
    }
  }

  return selected;
}

// Read-only query helper (used by the audit / future consumers): is a tile within the
// band's formed frontier knowledge — either personally observed OR margin-inferred?
// Existence-level "band-known"; richness is NOT implied for an inferred-only tile.
export function isTileWithinFrontierKnowledge(band: Band, tileId: TileId): boolean {
  if (band.knowledge.observedTiles[tileId] !== undefined) {
    return true;
  }

  return band.frontierKnowledge?.inferredTiles[tileId] !== undefined;
}
