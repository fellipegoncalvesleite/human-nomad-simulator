// LIVING-ECOLOGY / TROPHIC-COUPLING-1B focused causal audit.
//
// Proves the claims the broad trophic audit does not isolate:
//   §5  target_found harvest is bounded by the REAL patch/stock; the estimate
//       (incl. the 0.55 target_found realization factor) can never manufacture
//       food, and depletion equals the real physical draw.
//   §6  outcome learning reads the RESOLVED ACTUAL receipt, not a pre-trip
//       estimate: a high expected return that harvests nothing is recorded as a
//       zero/`none` return, a small real harvest is recorded as useful.
//   §10 herbivore forage is class-compatible (grazers/browsers cannot root
//       underground-storage organs; omnivores can).
//   §11 predators are canonical stocks that human generic hunting can NEVER
//       harvest or deplete.
//   §12 heavy human hunting drives severe local depletion, hunting gets harder
//       as abundance falls, trophic/forage pressure can finish a weakened stock
//       below the human reserve, and an abandoned stock recovers.
import { createServer } from "vite";

const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const { initSimWorld } = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const { advanceWorldOneSeason } = await server.ssrLoadModule("/sim/tick/advance.ts");
  const { buildTickContextCache } = await server.ssrLoadModule("/sim/agents/contextCache.ts");
  const fauna = await server.ssrLoadModule("/sim/agents/faunaStock.ts");
  const plant = await server.ssrLoadModule("/sim/agents/plantStock.ts");

  const first = run();
  const second = run();
  const deterministic = JSON.stringify(first.fingerprint) === JSON.stringify(second.fingerprint);
  const checks = { ...first.checks, deterministic };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "LIVING-ECOLOGY-TROPHIC-COUPLING-1B-FOCUSED",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    evidence: first.evidence,
  }, null, 2));
  if (!pass) process.exitCode = 1;

  function setAbundance(world, stockId, abundance) {
    return {
      ...world,
      faunaStocks: {
        ...(world.faunaStocks ?? {}),
        [stockId]: { ...fauna.getFaunaStockDynamic(world, stockId), abundance },
      },
    };
  }
  function depleteForage(world, stock) {
    return plant.consumePlantForage(
      world,
      [{ consumerId: "audit-drain", tileIds: stock.influenceTileIds, demand: 999 }],
      world.time,
    ).world;
  }

  function run() {
    const base = initSimWorld({ kind: "map2" });
    const world = { ...base, bands: {} }; // world-truth ecology, no human occupancy noise
    const geo = fauna.deriveFaunaStockGeography(world);
    const season = world.time.season;
    const tick = world.time.tick;

    const prey = geo.stocks
      .filter((s) => s.faunaClass === "animal_food" && s.trophicRole !== "predator")
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    const predator = geo.stocks
      .filter((s) => s.trophicRole === "predator")
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    if (prey === undefined || predator === undefined) throw new Error("prey/predator stock unavailable");

    // ---- §5: target_found harvest bounded by real stock, estimate cannot manufacture food ----
    // Huge requested estimate (as if target_found produced a big projection) at a healthy stock:
    const bigRequest = 99;
    const healthy = fauna.resolveFaunaFoodHarvest(world, geo, prey.anchorTileId, "animal_food", season, tick, bigRequest, true);
    const boundedByStock = healthy.harvestedAmount > 0 &&
      healthy.harvestedAmount <= healthy.physicalAvailability + 1e-6 &&
      healthy.harvestedAmount < bigRequest;
    const depletionEqualsDraw = Math.abs(healthy.depletionApplied - healthy.harvestedAmount) < 1e-6;

    // Absent source: a tile with no animal_food stock.
    const absentTile = Object.keys(world.tiles).sort()
      .find((t) => !(geo.byTile.get(t) ?? []).some((s) => s.faunaClass === "animal_food" && s.trophicRole !== "predator"));
    const absent = fauna.resolveFaunaFoodHarvest(world, geo, absentTile, "animal_food", season, tick, bigRequest, true);
    const absentZero = absent.sourceFound === false && absent.harvestedAmount === 0;

    // Exhausted stock (below the human reserve): huge estimate still yields zero.
    const exhaustedWorld = setAbundance(world, prey.id, 0.05);
    const exhausted = fauna.resolveFaunaFoodHarvest(exhaustedWorld, geo, prey.anchorTileId, "animal_food", season, tick, bigRequest, true);
    const exhaustedZero = exhausted.harvestedAmount === 0 && exhausted.failureReason === "physically_exhausted";

    // Limited stock: small physical availability caps a large request.
    const limitedWorld = setAbundance(world, prey.id, 0.14);
    const limited = fauna.resolveFaunaFoodHarvest(limitedWorld, geo, prey.anchorTileId, "animal_food", season, tick, bigRequest, true);
    const limitedBounded = limited.harvestedAmount > 0 && Math.abs(limited.harvestedAmount - limited.physicalAvailability) < 1e-6;

    // Plant target_found equivalently bounded.
    const plantTile = Object.keys(world.tiles).sort()
      .map((t) => world.tiles[t])
      .find((t) => plant.resolvePlantFoodHarvest(world, t, world.time, 99, true).sourceFound === true);
    const plantHealthy = plantTile === undefined ? undefined : plant.resolvePlantFoodHarvest(world, plantTile, world.time, 99, true);
    const plantBounded = plantHealthy !== undefined && plantHealthy.harvestedAmount > 0 &&
      plantHealthy.harvestedAmount <= plantHealthy.physicalAvailability + 1e-6 && plantHealthy.harvestedAmount < 99;

    // ---- §6: outcome learning reads the resolved actual receipt (via a real season) ----
    let human = advanceWorldOneSeason(initSimWorld({ kind: "map2" }));
    const physTrips = Object.values(human.bands)
      .flatMap((b) => (b.recentIntraSeasonTrips ?? []).filter((t) => t.physicalFoodHarvest !== undefined));
    const round4 = (v) => Math.round(v * 10000) / 10000;
    const learningMirrorsActual = physTrips.every((t) => {
      const usable = t.physicalFoodHarvest.usableSupport;
      const kind = t.resourceReturn.returnedResourceKind;
      const kindMatchesActual = usable > 0
        ? ["gathered_plant_food", "harvested_aquatic_food", "hunted_fauna_food"].includes(kind)
        : kind === "none";
      const valueIsActual = Math.abs(round4(t.resourceReturn.estimatedReturnValue) - round4(usable)) < 1e-4;
      return kindMatchesActual && valueIsActual;
    });
    const zeroActualTrips = physTrips.filter((t) => t.physicalFoodHarvest.usableSupport === 0);
    const usefulActualTrips = physTrips.filter((t) => t.physicalFoodHarvest.usableSupport > 0);
    const capturesActualZeroAndUseful = zeroActualTrips.every((t) => t.resourceReturn.returnedResourceKind === "none") &&
      usefulActualTrips.every((t) => t.resourceReturn.estimatedReturnValue > 0);

    // ---- §10: herbivore forage class compatibility ----
    const herbClasses = plant.forageClassesForTrophicRole("herbivore");
    const omniClasses = plant.forageClassesForTrophicRole("omnivore");
    const roleContract = herbClasses !== undefined && omniClasses !== undefined &&
      !herbClasses.includes("roots_tubers_uso") && omniClasses.includes("roots_tubers_uso") &&
      plant.forageClassesForTrophicRole("predator") === undefined &&
      plant.forageClassesForTrophicRole("aquatic_prey") === undefined;
    // Over the whole world, an omnivore can reach at least as much forage as a
    // grazer on identical tiles (USO patches are grazer-inaccessible).
    const allTiles = Object.keys(world.tiles);
    const herbAvail = plant.consumePlantForage(world, [{ consumerId: "h", tileIds: allTiles, demand: 0, forageClasses: herbClasses }], world.time)
      .receipts.get("h").physicalAvailability;
    const omniAvail = plant.consumePlantForage(world, [{ consumerId: "o", tileIds: allTiles, demand: 0, forageClasses: omniClasses }], world.time)
      .receipts.get("o").physicalAvailability;
    const compatibilityActive = omniAvail >= herbAvail - 1e-6;

    // ---- §11: predators are never harvestable by generic human hunting ----
    const predHarvest = fauna.resolveFaunaFoodHarvest(world, geo, predator.anchorTileId, "animal_food", season, tick, bigRequest, true);
    const predAbundanceBefore = fauna.getFaunaStockDynamic(world, predator.id).abundance;
    const predAbundanceAfter = fauna.getFaunaStockDynamic(predHarvest.world, predator.id).abundance;
    const predatorNotHarvested = predHarvest.sourceId !== String(predator.id) &&
      Math.abs(predAbundanceAfter - predAbundanceBefore) < 1e-9;

    // ---- §12: heavy human overhunting → severe depletion, harder hunting, collapse, recovery ----
    let overhunted = world;
    const harvestSeries = [];
    for (let i = 0; i < 20; i += 1) {
      const r = fauna.resolveFaunaFoodHarvest(overhunted, geo, prey.anchorTileId, "animal_food", season, tick, bigRequest, true);
      overhunted = r.world;
      harvestSeries.push(round4(r.harvestedAmount));
    }
    const abundanceAfterOverhunt = fauna.getFaunaStockDynamic(overhunted, prey.id).abundance;
    const severeDepletion = abundanceAfterOverhunt <= 0.081; // driven to the human reserve
    const huntingGetsHarder = harvestSeries[0] > harvestSeries[harvestSeries.length - 1] &&
      harvestSeries[harvestSeries.length - 1] <= harvestSeries[0];
    // A weakened stock with no forage collapses BELOW the human reserve toward 0.
    let collapsing = depleteForage(overhunted, prey);
    for (let i = 0; i < 10; i += 1) collapsing = fauna.advanceFaunaStocks(depleteForage(collapsing, prey), buildTickContextCache(collapsing));
    const abundanceAfterCollapse = fauna.getFaunaStockDynamic(collapsing, prey.id).abundance;
    const canCollapseBelowReserve = abundanceAfterCollapse < abundanceAfterOverhunt && abundanceAfterCollapse < 0.08;
    // Abandonment: a low stock with intact forage and no pressure recovers.
    let recovering = setAbundance(world, prey.id, 0.05);
    const recoverBefore = fauna.getFaunaStockDynamic(recovering, prey.id).abundance;
    for (let i = 0; i < 8; i += 1) recovering = fauna.advanceFaunaStocks(recovering, buildTickContextCache(recovering));
    const recoverAfter = fauna.getFaunaStockDynamic(recovering, prey.id).abundance;
    const recoversAfterAbandonment = recoverAfter > recoverBefore;

    const checks = {
      targetFoundBoundedByStock: boundedByStock,
      depletionEqualsRealDraw: depletionEqualsDraw,
      absentSourceZeroReceipt: absentZero,
      exhaustedSourceZeroReceipt: exhaustedZero,
      limitedStockCapsHarvest: limitedBounded,
      plantTargetFoundBounded: plantBounded,
      learningReadsResolvedActual: learningMirrorsActual,
      capturesActualZeroAndUseful: capturesActualZeroAndUseful,
      forageRoleContract: roleContract,
      forageCompatibilityActive: compatibilityActive,
      predatorNotHuntableGenerically: predatorNotHarvested,
      overhuntingSevereDepletion: severeDepletion,
      huntingHarderWhenDepleted: huntingGetsHarder,
      trophicPressureCanCollapseStock: canCollapseBelowReserve,
      recoversAfterAbandonment: recoversAfterAbandonment,
    };
    const evidence = {
      preyId: String(prey.id), predatorId: String(predator.id),
      healthyHarvest: round4(healthy.harvestedAmount), healthyAvailability: round4(healthy.physicalAvailability),
      limitedHarvest: round4(limited.harvestedAmount), limitedAvailability: round4(limited.physicalAvailability),
      plantHarvest: plantHealthy === undefined ? null : round4(plantHealthy.harvestedAmount),
      physTripCount: physTrips.length, zeroActualTrips: zeroActualTrips.length, usefulActualTrips: usefulActualTrips.length,
      herbClasses, omniClasses, herbAvail: round4(herbAvail), omniAvail: round4(omniAvail),
      predResolvedSourceId: predHarvest.sourceId ?? null, predHarvested: round4(predHarvest.harvestedAmount),
      harvestSeriesFirst: harvestSeries[0], harvestSeriesLast: harvestSeries[harvestSeries.length - 1],
      abundanceAfterOverhunt: round4(abundanceAfterOverhunt), abundanceAfterCollapse: round4(abundanceAfterCollapse),
      recoverBefore: round4(recoverBefore), recoverAfter: round4(recoverAfter),
    };
    return { checks, evidence, fingerprint: { checks, evidence } };
  }
} finally {
  await server.close();
}
