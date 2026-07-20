// CORRECTION-8 — terminal failure classification for same-day food trips.
//
// CORRECTION-7 measured that ordinary same-day trips return food only 2.9% of the time
// (rich 39.2%). That is a BINARY gate, not a yield curve. This probe assigns EXACTLY ONE
// terminal classification to every attempted same-day food trip, in execution order, and
// records the hidden physical state alongside it for audit.
//
// Measurement only. It reads the trip records the production path already writes and
// mutates nothing. The production selector keeps using band knowledge only; the hidden
// `physicalAvailability` is read here for AUDIT and is never fed back into any decision.
//
// The decisive column is `availableButRefused`: trips where the physical patch HAD stock
// (physicalAvailability > 0) and the trip still returned nothing. Those are not scarcity.
import { createServer } from "vite";

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});
const arg = (name, fallback) =>
  process.argv.includes(name) ? Number(process.argv[process.argv.indexOf(name) + 1]) : fallback;
const years = arg("--years", 40);
// CORRECTION-8 — bounded multi-seed viability matrix. The seed varies the run seed only;
// site scoring stays identical so the same physical habitats are compared across seeds.
const seed = process.argv.includes("--seed")
  ? String(process.argv[process.argv.indexOf("--seed") + 1])
  : "";
const seedSuffix = seed === "" ? "" : `-seed${seed}`;

// Terminal classification, evaluated in the same order the production code decides.
// Returns exactly one code per trip.
function classifyTerminal(trip) {
  const harvest = trip.physicalFoodHarvest;
  const reasons = (trip.activityOutcomeReasonIds ?? []).join("|");
  const outcome = String(trip.activityOutcome);
  const units = harvest?.usableSupport ?? 0;

  if (units > 0) return "productive_harvest";

  // Gate order mirrors deriveActivityOutcomeDetail -> classifyActivityOutcome ->
  // resolvePhysicalFoodHarvest.
  if (harvest === undefined) return "resource_unknown_or_non_physical";
  if (reasons.includes(":risk:bad-water")) return "water_provision_constraint";
  if (reasons.includes(":distance:access-low")) return "route_time_infeasible";
  if (reasons.includes(":season:mismatch")) return "seasonally_inactive";
  if (reasons.includes(":memory:low-confidence")) return "confidence_insufficient";
  if (outcome === "failed_due_to_distance") return "route_time_infeasible";
  if (outcome === "delayed_return") return "task_duration_infeasible";

  const failure = harvest.failureReason;
  if (failure === "physical_source_absent") return "target_absent";
  if (failure === "physically_exhausted") return "depleted_below_threshold";
  if (failure === "activity_failed") {
    // Physically stocked but nothing taken => an eligibility/request gate refused, not scarcity.
    return harvest.physicalAvailability > 0 ? "activity_ineligible_despite_stock" : "activity_ineligible_no_stock";
  }
  return `other:${outcome}:${failure ?? "none"}`;
}

try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const spawn = await server.ssrLoadModule("/sim/agents/spawn.ts");
  const plantPatches = await server.ssrLoadModule("/sim/agents/plantPatches.ts");

  // Identical site scoring to sameDayTargetChurnProbe.mjs so cases are comparable.
  const REACH = 10;
  const scoreWorld = runner.initSimWorld({ kind: "map2" }, "habitat-scoring");
  const tiles = Object.values(scoreWorld.tiles);
  const byCoord = new Map(tiles.map((t) => [`${t.coord.x}:${t.coord.y}`, t]));
  const scoreCenter = (c) => {
    let stock = 0, water = 0, wt = 0, usable = 0;
    for (let dy = -REACH; dy <= REACH; dy += 1) for (let dx = -REACH; dx <= REACH; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > REACH) continue;
      const t = byCoord.get(`${c.coord.x + dx}:${c.coord.y + dy}`);
      if (t === undefined) continue;
      usable += 1; water += t.resourceProfile.waterAccess;
      if (t.resourceProfile.waterAccess > 0.55) wt += 1;
      if (t.isAquatic === true) continue;
      for (const p of plantPatches.derivePlantPatchesForTile(t, scoreWorld.time)) stock += p.baseAbundance * p.currentAbundance;
    }
    return { stock: Math.round(stock * 100) / 100, meanWater: usable ? water / usable : 0, waterTiles: wt };
  };
  const cands = [];
  for (const t of tiles) {
    if (t.isAquatic === true) continue;
    if (t.coord.x % 6 !== 0 || t.coord.y % 6 !== 0) continue;
    if (t.coord.x < 12 || t.coord.y < 12 || t.coord.x > 208 || t.coord.y > 128) continue;
    const s = scoreCenter(t);
    if (s.stock <= 0.5 || s.waterTiles === 0) continue;
    cands.push({ tileId: t.id, ...s });
  }
  cands.sort((a, b) => b.stock - a.stock || String(a.tileId).localeCompare(String(b.tileId)));
  const withWater = cands.filter((c) => c.meanWater >= 0.3 && c.waterTiles >= 8);
  const sites = {
    rich: withWater[0],
    ordinary: cands[Math.floor(cands.length / 2)],
    marginal: cands.filter((c) => c.stock <= cands[Math.floor(cands.length * 0.9)].stock)[0] ?? cands[cands.length - 1],
  };

  const out = {};
  for (const [name, site] of Object.entries(sites)) {
    let world = runner.initSimWorld({ kind: "map2" }, `habitat-${name}${seedSuffix}`);
    world = spawn.removeInitialBands(world, Object.keys(world.bands));
    world = spawn.spawnCustomBands(world, [{ tileId: site.tileId, population: 22, name: `habitat-${name}${seedSuffix}` }], `habitat-${name}${seedSuffix}`);
    const bandId = Object.keys(world.bands)[0];

    const seen = new Set();
    const terminal = new Map();
    const samples = [];
    let seasonsAlive = 0;
    let attempted = 0;
    let unitsTotal = 0;
    let availableButRefused = 0;
    let stockSeenWhenRefused = 0;
    let nonPhysical = 0;
    const causeCounts = new Map();
    const classCounts = new Map();
    const nonPhysicalSamples = [];

    for (let season = 0; season < years * 4; season += 1) {
      world = runner.stepSim(world, 1, "seasonal");
      const band = world.bands[bandId];
      if (band === undefined) break;
      seasonsAlive += 1;
      for (const trip of band.recentIntraSeasonTrips ?? []) {
        const key = `${Number(trip.day)}|${String(trip.targetTileId)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (trip.inspectionOnly === true) continue;
        const harvest = trip.physicalFoodHarvest;
        // Do NOT skip trips without a harvest record. A trip that never reached the
        // physical resolver is still an expended foraging day and is the largest
        // terminal class in poor habitat — skipping it was what hid the real gate.
        attempted += 1;
        if (harvest === undefined) {
          const code = `never_attempted_physical:${String(trip.taskGroupType)}`;
          terminal.set(code, (terminal.get(code) ?? 0) + 1);
          nonPhysical += 1;
          causeCounts.set(String(trip.cause), (causeCounts.get(String(trip.cause)) ?? 0) + 1);
          classCounts.set(String(trip.resourceClassId ?? "none"), (classCounts.get(String(trip.resourceClassId ?? "none")) ?? 0) + 1);
          if (nonPhysicalSamples.length < 25) {
            nonPhysicalSamples.push({
              day: Number(trip.day), season: String(trip.season), target: String(trip.targetTileId),
              cause: String(trip.cause), taskGroupType: String(trip.taskGroupType),
              resourceClass: String(trip.resourceClassId ?? "none"),
              activityOutcome: String(trip.activityOutcome),
              returnedKind: String(trip.resourceReturn?.returnedResourceKind),
              reasons: (trip.activityOutcomeReasonIds ?? []).map(String),
            });
          }
          continue;
        }
        const code = classifyTerminal(trip);
        terminal.set(code, (terminal.get(code) ?? 0) + 1);
        const units = harvest.usableSupport ?? 0;
        unitsTotal += units;
        if (units <= 0 && harvest.physicalAvailability > 0) {
          availableButRefused += 1;
          stockSeenWhenRefused += harvest.physicalAvailability;
        }
        if (samples.length < 40) {
          samples.push({
            day: Number(trip.day),
            season: String(trip.season),
            target: String(trip.targetTileId),
            resourceClass: String(trip.resourceClassId ?? "n/a"),
            cause: String(trip.cause),
            activityOutcome: String(trip.activityOutcome),
            returnedKind: String(trip.resourceReturn?.returnedResourceKind),
            returnConfidence: trip.resourceReturn?.returnConfidence ?? null,
            terminal: code,
            // hidden physical truth — AUDIT ONLY, never read by the selector
            hiddenPhysicalAvailability: harvest.physicalAvailability,
            harvestedAmount: harvest.harvestedAmount,
            usableSupport: units,
            failureReason: harvest.failureReason ?? "none",
            reasons: (trip.activityOutcomeReasonIds ?? []).map(String),
          });
        }
      }
    }

    const dist = [...terminal.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count, share: Math.round((count / Math.max(1, attempted)) * 10000) / 10000 }));

    out[name] = {
      site,
      seasonsAlive,
      attemptedTrips: attempted,
      unitsTotal: Math.round(unitsTotal * 10000) / 10000,
      unitsPerSeason: Math.round((unitsTotal / Math.max(1, seasonsAlive)) * 10000) / 10000,
      productiveRate: Math.round(((terminal.get("productive_harvest") ?? 0) / Math.max(1, attempted)) * 10000) / 10000,
      // the decisive number: failed trips where the patch demonstrably HAD stock
      availableButRefused,
      availableButRefusedShare: Math.round((availableButRefused / Math.max(1, attempted)) * 10000) / 10000,
      meanStockWhenRefused: Math.round((stockSeenWhenRefused / Math.max(1, availableButRefused)) * 10000) / 10000,
      // trips that never reached the physical resolver at all (selection, not scarcity)
      nonPhysicalTrips: nonPhysical,
      nonPhysicalShare: Math.round((nonPhysical / Math.max(1, attempted)) * 10000) / 10000,
      nonPhysicalByCause: [...causeCounts.entries()].sort((a, b) => b[1] - a[1]),
      nonPhysicalByResourceClass: [...classCounts.entries()].sort((a, b) => b[1] - a[1]),
      terminalDistribution: dist,
      samples,
      nonPhysicalSamples,
    };
  }

  console.log(JSON.stringify({ probe: "sameDayFailureGate", years, breakEvenUnitsPerSeason: 0.1875, cases: out }, null, 2));
} finally {
  await server.close();
}
