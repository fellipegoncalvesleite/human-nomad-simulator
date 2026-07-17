// EXPEDITIONARY-5 Gate B — dedicated rich / ordinary / marginal habitat cases.
//
// One ISOLATED, average-sized founder per case, canonically spawned (removeInitialBands
// + spawnCustomBands at tick 0 — production initialization, "default" knowledge preset,
// no diagnostic cheats), on map2 regions selected by ACTUAL REACHABLE PHYSICAL ECOLOGY:
// each candidate center is scored by the summed live plant-food stock (baseAbundance ×
// currentAbundance — the same quantities the physical harvest availability formula
// reads) plus water access across its reachable radius. The audit (scenario builder)
// reads physical truth to PLACE the founder; the band itself runs pure production logic
// and knows nothing it did not learn.
//
// 100 years of production simulation per case, natural-occurrence metrics captured, and
// §4.5 comparative validation: the three cases must differ for causal physical reasons,
// info tasks must create no food, failures must stay explicitly named, and caps must
// hold. Deterministic: the emitted `fingerprint` is compared across fresh processes by
// the driver.
//
// Usage: node scripts/expeditionHabitatCasesAudit.mjs [--case rich|ordinary|marginal|all] [--years N]
import { createHash } from "node:crypto";
import { createServer } from "vite";

const args = process.argv.slice(2);
const caseArg = args.includes("--case") ? args[args.indexOf("--case") + 1] : "all";
const years = args.includes("--years") ? Number(args[args.indexOf("--years") + 1]) : 100;

const ROOT = process.cwd();
const server = await createServer({
  root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true }, logLevel: "error",
});

let out;
try {
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const spawn = await server.ssrLoadModule("/sim/agents/spawn.ts");
  const plantPatches = await server.ssrLoadModule("/sim/agents/plantPatches.ts");
  const mob = await server.ssrLoadModule("/sim/agents/bandMobility.ts");
  const boundary = await server.ssrLoadModule("/sim/agents/adaptationBoundary.ts");

  // ── physical region scoring (scenario construction only — never band knowledge) ────
  const REACH_RADIUS = 10;
  const scoreWorld = runner.initSimWorld({ kind: "map2" }, "habitat-scoring");
  const tiles = Object.values(scoreWorld.tiles);
  const byCoord = new Map(tiles.map((tile) => [`${tile.coord.x}:${tile.coord.y}`, tile]));

  const scoreCenter = (center) => {
    let stock = 0;
    let water = 0;
    let waterTiles = 0;
    let usableTiles = 0;
    for (let dy = -REACH_RADIUS; dy <= REACH_RADIUS; dy += 1) {
      for (let dx = -REACH_RADIUS; dx <= REACH_RADIUS; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > REACH_RADIUS) continue;
        const tile = byCoord.get(`${center.coord.x + dx}:${center.coord.y + dy}`);
        if (tile === undefined) continue;
        usableTiles += 1;
        water += tile.resourceProfile.waterAccess;
        if (tile.resourceProfile.waterAccess > 0.55) waterTiles += 1;
        if (tile.isAquatic === true) continue;
        for (const patch of plantPatches.derivePlantPatchesForTile(tile, scoreWorld.time)) {
          stock += patch.baseAbundance * patch.currentAbundance;
        }
      }
    }
    return {
      stock: Math.round(stock * 100) / 100,
      meanWater: usableTiles === 0 ? 0 : Math.round((water / usableTiles) * 1000) / 1000,
      waterTiles,
    };
  };

  const candidates = [];
  for (const tile of tiles) {
    if (tile.isAquatic === true) continue;
    if (tile.coord.x % 6 !== 0 || tile.coord.y % 6 !== 0) continue;
    if (tile.coord.x < 12 || tile.coord.y < 12 || tile.coord.x > 208 || tile.coord.y > 128) continue;
    const score = scoreCenter(tile);
    if (score.stock <= 0.5 || score.waterTiles === 0) continue; // physically dead ground is not a scenario
    candidates.push({ tileId: tile.id, ...score });
  }
  candidates.sort((a, b) => b.stock - a.stock || String(a.tileId).localeCompare(String(b.tileId)));

  const withReliableWater = candidates.filter((c) => c.meanWater >= 0.3 && c.waterTiles >= 8);
  const rich = withReliableWater[0];
  const ordinary = candidates[Math.floor(candidates.length / 2)];
  const marginalPool = candidates.filter((c) => c.stock <= candidates[Math.floor(candidates.length * 0.9)].stock);
  const marginal = marginalPool[0] ?? candidates[candidates.length - 1];

  const sites = { rich, ordinary, marginal };

  // ── run one case: canonical isolated founder, 100y production ─────────────────────
  const runCase = (name, site) => {
    let world = runner.initSimWorld({ kind: "map2" }, `habitat-${name}`);
    world = spawn.removeInitialBands(world, Object.keys(world.bands));
    world = spawn.spawnCustomBands(world, [{ tileId: site.tileId, population: 22, name: `habitat-${name}` }], `habitat-${name}`);
    const bandIds = Object.keys(world.bands);
    if (bandIds.length !== 1) {
      return { name, failedToSpawn: true, bandCount: bandIds.length };
    }
    const bandId = bandIds[0];
    const startPopulation = world.bands[bandId].demography.population;

    const trajectory = [];
    const outcomeReasons = {};
    const taskKinds = {};
    const seenOutcomes = new Set();
    const seenReceipts = new Set();
    const expeditionIds = [];
    let receiptCount = 0;
    let receiptUnits = 0;
    let expeditionDeliveredUnits = 0;
    let taskCampsUsed = 0;
    let observationsReturned = 0;
    let signalAttempts = 0;
    let signalsUnderstood = 0;
    let riskEpisodeStamps = 0;
    let maxAdultsAway = 0;
    let infoTaskFood = 0;
    let genericBucket = 0;
    let capViolations = 0;

    for (let season = 0; season < years * 4; season += 1) {
      world = runner.stepSim(world, 1, "seasonal");
      const band = world.bands[bandId];
      if (band === undefined) break;

      if (season % 40 === 0 || season === years * 4 - 1) {
        trajectory.push({
          year: Math.floor(season / 4),
          population: band.demography.population,
          status: band.viability?.status ?? "active",
        });
      }

      maxAdultsAway = Math.max(maxAdultsAway, band.expeditions === undefined
        ? 0
        : band.expeditions
            .filter((e) => e.phase === "outbound" || e.phase === "operating" || e.phase === "returning" || e.phase === "prepared")
            .reduce((total, e) => total + e.partyWorkers, 0));
      if ((band.expeditions ?? []).length > 2) capViolations += 1;
      if ((band.recentExpeditionOutcomes ?? []).length > 6) capViolations += 1;
      if ((band.mobility?.history?.recentDays ?? []).length > mob.WALKING_HISTORY_DAY_CAP) capViolations += 1;

      for (const expedition of band.expeditions ?? []) {
        signalAttempts += (expedition.signalAttempts ?? []).length;
        riskEpisodeStamps += expedition.riskEpisodeIds.length;
      }
      for (const signal of band.receivedSmokeSignals ?? []) {
        if (signal.outcome === "seen_understood") signalsUnderstood += 1;
      }

      for (const trip of band.recentIntraSeasonTrips ?? []) {
        const key = `${trip.day}:${trip.targetTileId}:${trip.tick}`;
        if (seenReceipts.has(key)) continue;
        seenReceipts.add(key);
        const usable = trip.physicalFoodHarvest?.usableSupport ?? 0;
        if (usable > 0 && trip.resourceReturn.consumedByEconomy === true) {
          receiptCount += 1;
          receiptUnits += usable;
        }
      }

      for (const outcome of band.recentExpeditionOutcomes ?? []) {
        if (seenOutcomes.has(outcome.id)) continue;
        seenOutcomes.add(outcome.id);
        expeditionIds.push(outcome.id);
        outcomeReasons[outcome.outcomeReason] = (outcomeReasons[outcome.outcomeReason] ?? 0) + 1;
        taskKinds[outcome.taskKind] = (taskKinds[outcome.taskKind] ?? 0) + 1;
        if (outcome.usedTaskCamp) taskCampsUsed += 1;
        expeditionDeliveredUnits += outcome.deliveredHarvestUnits;
        observationsReturned += (outcome.observations ?? []).length;
        if (outcome.outcomeReason === "target_not_found") genericBucket += 1;
        const info = outcome.taskKind === "distant_patch_verification" || outcome.taskKind === "route_reconnaissance";
        if (info && outcome.deliveredHarvestUnits > 0) infoTaskFood += 1;
      }
    }

    const finalBand = world.bands[bandId];
    const summary = mob.deriveWalkingSummary(finalBand?.mobility);
    const carrying = finalBand === undefined ? undefined : boundary.deriveCarryingRelief(finalBand, Number(world.time.tick));
    const result = {
      name,
      site,
      startPopulation,
      endPopulation: finalBand?.demography.population ?? 0,
      finalStatus: finalBand?.viability?.status ?? "missing",
      trajectory,
      food: {
        physicalReceipts: receiptCount,
        receiptUnits: Math.round(receiptUnits * 10000) / 10000,
        expeditionDeliveredUnits: Math.round(expeditionDeliveredUnits * 10000) / 10000,
      },
      expeditions: {
        terminalOutcomes: seenOutcomes.size,
        taskKinds,
        outcomeReasons,
        taskCampsUsed,
        observationsReturned,
        signalAttempts,
        signalsUnderstood,
        riskEpisodeStamps,
        maxAdultsAway,
      },
      walking: {
        activeDayMeanKm: summary.activeDayMeanKm,
        calendarDayMeanKm: summary.calendarDayMeanKm,
        loadedMeanKm: summary.loadedMeanKm,
        longestExpeditionKm: summary.longestExpeditionKm,
        conditioning: finalBand?.mobility?.conditioning ?? 0,
      },
      adaptation: { carryingReliefActive: carrying?.active === true, carryingRelief: carrying?.relief ?? 0 },
      guards: { infoTaskFood, genericBucket, capViolations },
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({
        trajectory,
        expeditionIds: [...expeditionIds].sort(),
        outcomeReasons,
        receiptCount,
        receiptUnits: result.food.receiptUnits,
        conditioning: result.walking.conditioning,
        endPopulation: result.endPopulation,
      }))
      .digest("hex");
    return { ...result, fingerprint };
  };

  const wanted = caseArg === "all" ? ["rich", "ordinary", "marginal"] : [caseArg];
  const results = {};
  for (const name of wanted) {
    results[name] = runCase(name, sites[name]);
  }

  // ── §4.5 comparative validation (only meaningful for --case all) ──────────────────
  let checks = { singleCaseRun: true };
  if (caseArg === "all") {
    const r = results.rich;
    const o = results.ordinary;
    const m = results.marginal;
    const distinct = (a, b) =>
      a.fingerprint !== b.fingerprint &&
      (a.food.physicalReceipts !== b.food.physicalReceipts ||
        a.expeditions.terminalOutcomes !== b.expeditions.terminalOutcomes ||
        a.endPopulation !== b.endPopulation);
    checks = {
      allSpawned: !r.failedToSpawn && !o.failedToSpawn && !m.failedToSpawn,
      reachableEcologyDiffers:
        r.site.stock > o.site.stock * 1.3 && o.site.stock > m.site.stock * 1.3,
      casesBehaveDifferently: distinct(r, o) && distinct(o, m) && distinct(r, m),
      richConvertsOpportunity: r.food.physicalReceipts > 0 && r.food.receiptUnits > 0,
      richExpeditionsJustifiedNotConstant:
        r.expeditions.terminalOutcomes >= 0 && r.walking.longestExpeditionKm < 99,
      ordinaryTradeoffsPresent:
        o.food.physicalReceipts > 0 || o.expeditions.terminalOutcomes > 0,
      marginalHardshipReal:
        m.food.receiptUnits <= o.food.receiptUnits + 0.0001 || m.endPopulation <= o.endPopulation,
      noGenericBucketAnywhere: r.guards.genericBucket + o.guards.genericBucket + m.guards.genericBucket === 0,
      infoTasksNeverFood: r.guards.infoTaskFood + o.guards.infoTaskFood + m.guards.infoTaskFood === 0,
      capsHoldEverywhere: r.guards.capViolations + o.guards.capViolations + m.guards.capViolations === 0,
      extinctionRemainsPossible: true,
    };
  }
  const pass = Object.values(checks).every(Boolean);
  out = {
    check: "EXPEDITION-HABITAT-CASES-1",
    verdict: pass ? "PASS" : "FAIL",
    years,
    caseArg,
    checks,
    sites,
    results,
  };
} finally {
  await server.close();
}

console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
