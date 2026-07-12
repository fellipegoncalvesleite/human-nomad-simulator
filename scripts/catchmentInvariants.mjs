// Focused diagnostic for checkpoint 2J.1A: prove the shared-catchment math is
// safe by driving the REAL implementation (buildSharedCatchmentIndex /
// getTileSupportShare / getOverlappingBandIds / getBandForagingFootprint) with
// small controlled worlds and printing concrete numbers. Read-only; no sim state
// is mutated and nothing here ships in the app bundle.
import { createServer } from "vite";

const server = await createServer({
  root: `${process.cwd()}/src`,
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});
const sc = await server.ssrLoadModule("/sim/agents/sharedCatchment.ts");
const { buildSharedCatchmentIndex, getTileSupportShare, getOverlappingBandIds, getBandForagingFootprint } = sc;

const TILE_SUPPORT = 10; // synthetic intrinsic yield per tile, constant for clarity

// A line of tiles t(0..N) at y=0 with 4-neighbour (here 2-neighbour) adjacency.
function makeTiles(maxX) {
  const tiles = {};
  for (let x = 0; x <= maxX; x += 1) {
    const id = `tile:${x},0`;
    const neighbors = [];
    if (x - 1 >= 0) neighbors.push(`tile:${x - 1},0`);
    if (x + 1 <= maxX) neighbors.push(`tile:${x + 1},0`);
    tiles[id] = { id, coord: { x, y: 0 }, neighbors };
  }
  return tiles;
}

function makeBand(id, position, catchment, { adults = 10, dependents = 0, elders = 0 } = {}) {
  const observedTiles = {};
  for (const t of catchment) observedTiles[t] = { tileId: t };
  return {
    id,
    position,
    knowledge: { observedTiles },
    demography: { workingAdults: adults, dependents, elders },
    residentialAnchor: { catchmentTileIds: catchment },
  };
}

function makeWorldCache(maxX, bandList) {
  const bands = {};
  for (const b of bandList) bands[b.id] = b;
  const world = { tiles: makeTiles(maxX), bands };
  const cache = {
    activeBandIds: bandList.map((b) => b.id).sort((a, c) => String(a).localeCompare(String(c))),
    sharedCatchmentMemo: {},
  };
  return { world, cache };
}

const draw = (a, d, e) => Math.max(1, a * 1.0 + d * 0.65 + e * 0.85);

// Total support a band receives across its footprint = sum_tiles support * share.
function totalSupport(index, world, bandId) {
  const footprint = index.footprintByBandId.get(bandId) ?? [];
  let total = 0;
  const perTile = [];
  for (const ft of footprint) {
    const share = getTileSupportShare(index, ft.tileId, ft.weight);
    const got = TILE_SUPPORT * share;
    total += got;
    perTile.push({ tile: ft.tileId, dist: ft.distance, weight: ft.weight, share: round(share), got: round(got) });
  }
  return { total: round(total), perTile };
}

const round = (v) => Math.round(v * 1e4) / 1e4;
const ok = (b) => (b ? "PASS" : "FAIL");

console.log("=== 2J.1A SHARED-CATCHMENT INVARIANTS (TILE_SUPPORT=" + TILE_SUPPORT + " per tile) ===\n");

// ---------------------------------------------------------------------------
// Invariant 1: solo band support is unchanged vs. no overlap.
// ---------------------------------------------------------------------------
{
  const A = makeBand("band:A", "tile:0,0", ["tile:0,0", "tile:1,0", "tile:2,0"], { adults: 10 });
  const { world, cache } = makeWorldCache(10, [A]);
  const index = buildSharedCatchmentIndex(world, cache);
  const s = totalSupport(index, world, "band:A");
  const allOne = s.perTile.every((t) => t.share === 1);
  console.log("[1] SOLO band → every share == 1.0, support == sum(tileSupport)");
  console.table(s.perTile);
  console.log(`    total=${s.total}  expectedSolo=${3 * TILE_SUPPORT}  allSharesAre1=${allOne}  => ${ok(allOne && s.total === 3 * TILE_SUPPORT)}\n`);
}

// ---------------------------------------------------------------------------
// Invariant 4: a far, non-overlapping band does not change A's support.
// ---------------------------------------------------------------------------
{
  const A = makeBand("band:A", "tile:0,0", ["tile:0,0", "tile:1,0", "tile:2,0"], { adults: 10 });
  const soloIdx = buildSharedCatchmentIndex(...Object.values(makeWorldCache(30, [A])));
  const soloTotal = totalSupport(soloIdx, null, "band:A").total;

  const Cfar = makeBand("band:C", "tile:25,0", ["tile:25,0", "tile:26,0", "tile:27,0"], { adults: 30 });
  const farPack = makeWorldCache(30, [A, Cfar]);
  const farIdx = buildSharedCatchmentIndex(farPack.world, farPack.cache);
  const withFarTotal = totalSupport(farIdx, farPack.world, "band:A").total;
  const overlap = getOverlappingBandIds(farIdx, "band:A");
  console.log("[4] FAR non-overlapping band C (huge demand, distant) added");
  console.log(`    A.supportSolo=${soloTotal}  A.supportWithFarC=${withFarTotal}  A.overlap=${JSON.stringify(overlap)}  => ${ok(soloTotal === withFarTotal && overlap.length === 0)}\n`);
}

// ---------------------------------------------------------------------------
// Invariants 2 & 3: on each contested tile, shares sum to ~1.0 and allocated
// support never exceeds tileSupport.
// ---------------------------------------------------------------------------
{
  const A = makeBand("band:A", "tile:2,0", ["tile:2,0", "tile:3,0", "tile:4,0"], { adults: 12 });
  const B = makeBand("band:B", "tile:3,0", ["tile:2,0", "tile:3,0", "tile:4,0"], { adults: 7, dependents: 4 });
  const D = makeBand("band:D", "tile:3,0", ["tile:3,0", "tile:4,0", "tile:5,0"], { adults: 3, elders: 6 });
  const { world, cache } = makeWorldCache(10, [A, B, D]);
  const index = buildSharedCatchmentIndex(world, cache);

  console.log("[2,3] Per-contested-tile: sum(shares) ~ 1.0 and allocated <= tileSupport");
  const rows = [];
  let worstSum = 0;
  let everUnderOrEq = true;
  for (const [tileId, claim] of index.claimsByTileId) {
    let sumShares = 0;
    for (const bandId of claim.claimantBandIds) {
      const fp = index.footprintByBandId.get(bandId).find((t) => t.tileId === tileId);
      sumShares += getTileSupportShare(index, tileId, fp.weight);
    }
    const allocated = round(TILE_SUPPORT * sumShares);
    worstSum = Math.max(worstSum, Math.abs(1 - sumShares));
    if (allocated > TILE_SUPPORT + 1e-9) everUnderOrEq = false;
    rows.push({ tile: tileId, claimants: claim.claimantBandIds.length, sumShares: round(sumShares), allocated, tileSupport: TILE_SUPPORT });
  }
  console.table(rows);
  console.log(`    maxDeviationFrom1=${round(worstSum)}  allocatedNeverExceedsSupport=${everUnderOrEq}  => ${ok(worstSum < 1e-6 && everUnderOrEq)}\n`);
}

// ---------------------------------------------------------------------------
// Invariant 5: two equal-demand bands on the same catchment split symmetrically.
// ---------------------------------------------------------------------------
{
  const A = makeBand("band:A", "tile:0,0", ["tile:0,0", "tile:1,0", "tile:2,0"], { adults: 10 });
  const B = makeBand("band:B", "tile:0,0", ["tile:0,0", "tile:1,0", "tile:2,0"], { adults: 10 });
  const { world, cache } = makeWorldCache(10, [A, B]);
  const index = buildSharedCatchmentIndex(world, cache);
  const sA = totalSupport(index, world, "band:A");
  const sB = totalSupport(index, world, "band:B");
  const symmetric = sA.total === sB.total && sA.perTile.every((t) => t.share === 0.5);
  console.log("[5] TWO EQUAL-demand bands, identical catchment → 0.5/0.5 symmetric split");
  console.log(`    A.total=${sA.total}  B.total=${sB.total}  allSharesAre0.5=${sA.perTile.every((t) => t.share === 0.5)}  => ${ok(symmetric)}\n`);
}

// ---------------------------------------------------------------------------
// Invariant 6: higher-demand band gets a larger TOTAL share, but per-capita
// return still drops vs. solo (crowding is not magically waived for the big band).
// ---------------------------------------------------------------------------
{
  const big = { adults: 20 };   // draw 20
  const small = { adults: 5 };  // draw 5
  const catch3 = ["tile:0,0", "tile:1,0", "tile:2,0"];

  // Solo references.
  const bigSoloPack = makeWorldCache(10, [makeBand("band:BIG", "tile:0,0", catch3, big)]);
  const bigSoloIdx = buildSharedCatchmentIndex(bigSoloPack.world, bigSoloPack.cache);
  const bigSolo = totalSupport(bigSoloIdx, bigSoloPack.world, "band:BIG").total;

  const A = makeBand("band:BIG", "tile:0,0", catch3, big);
  const B = makeBand("band:SMALL", "tile:0,0", catch3, small);
  const { world, cache } = makeWorldCache(10, [A, B]);
  const index = buildSharedCatchmentIndex(world, cache);
  const sBig = totalSupport(index, world, "band:BIG");
  const sSmall = totalSupport(index, world, "band:SMALL");

  const drawBig = draw(20, 0, 0);
  const drawSmall = draw(5, 0, 0);
  const pcBigSolo = round(bigSolo / drawBig);
  const pcBigContested = round(sBig.total / drawBig);
  const pcSmallContested = round(sSmall.total / drawSmall);

  console.log("[6] HIGHER-demand band gets larger total share, per-capita still reflects crowding");
  console.log(`    BIG.totalShareSupport=${sBig.total}  SMALL.totalShareSupport=${sSmall.total}  (BIG > SMALL = ${sBig.total > sSmall.total})`);
  console.log(`    BIG per-capita: solo=${pcBigSolo} -> contested=${pcBigContested}  (dropped = ${pcBigContested < pcBigSolo})`);
  console.log(`    SMALL per-capita contested=${pcSmallContested}`);
  console.log(`    => ${ok(sBig.total > sSmall.total && pcBigContested < pcBigSolo)}\n`);
}

await server.close();
console.log("=== done ===");
