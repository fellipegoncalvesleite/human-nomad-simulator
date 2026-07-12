import { createServer } from "vite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const returns = await server.ssrLoadModule("/sim/agents/physicalFoodReturn.ts");
  const food = await server.ssrLoadModule("/sim/agents/humanFoodSupport.ts");
  const plant = await server.ssrLoadModule("/sim/agents/plantStock.ts");
  const fauna = await server.ssrLoadModule("/sim/agents/faunaStock.ts");
  const runner = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const first = run(returns, food, plant, fauna, runner);
  const second = run(returns, food, plant, fauna, runner);
  const checks = { ...first.checks, deterministic: JSON.stringify(first.fingerprint) === JSON.stringify(second.fingerprint) };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "POST-ECOLOGY explicit return-kind semantics audit",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    inventory: first.inventory,
    controlled: first.controlled,
    ledger: first.ledger,
    live: first.live,
    compatibility: first.compatibility,
    sourceGuards: first.sourceGuards,
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await server.close();
}

function run(returns, food, plant, fauna, runner) {
  const classify = (resourceClassId, taskGroupType, outcome) =>
    returns.classifyActivityReturnKind({ resourceClassId, taskGroupType, outcome });
  const fixtureWorld = runner.initSimWorld({ kind: "map2" });
  const plantFixture = resolvePlantAbsenceFixtures(plant, fixtureWorld);
  const faunaAbsent = fauna.resolveFaunaFoodHarvest(
    fixtureWorld,
    fauna.deriveFaunaStockGeography(fixtureWorld),
    "tile:return-audit-absent",
    "animal_food",
    fixtureWorld.time.season,
    fixtureWorld.time.tick,
    0.2,
    true,
  );
  const controlled = {
    plantGathering: classify("generic_plant_food", "plant_gathering_group", "partial_success"),
    aquaticHarvest: classify("aquatic_food", "fishing_group", "partial_success"),
    faunaHunting: classify("animal_food", "hunting_group", "target_found"),
    targetFoundNoPhysicalAvailability: plantFixture.observation.failureReason,
    exhaustedPlantPatch: plantFixture.exhausted.failureReason,
    absentFauna: faunaAbsent.failureReason,
    fiberMaterial: classify("fiber_material", "plant_followup_group", "partial_success"),
    fuelMaterial: classify("fuel_material", "plant_followup_group", "partial_success"),
    observationOnly: classify("generic_plant_food", "plant_gathering_group", "successful_observation"),
    failedTrip: classify("generic_plant_food", "plant_gathering_group", "failed_due_to_distance"),
    opportunisticFood: classify("fallback_food", "local_foraging_group", "partial_success"),
  };
  const receipt = {
    sourceKind: "plant_patch", sourceClass: "generic_plant_food", knownness: "known_target",
    attempted: true, physicalSourceFound: true, physicalAvailability: 0.3, harvestedAmount: 0.24,
    depletionApplied: 0.02, transportLoss: 0.02, processingLoss: 0.02, usableSupport: 0.2,
    worldTruthDebugOnly: true, reasonIds: ["reason:receipt"],
  };
  const makeTrip = (kind, consumedByEconomy, physicalFoodHarvest, value = 0.2) => ({
    tick: 1,
    resourceReturn: {
      returnedResourceKind: kind,
      semantics: returns.getActivityReturnSemantics(kind),
      estimatedReturnValue: value,
      returnConfidence: 0.8,
      consumedByEconomy,
      noYieldCoupling: true,
      noCarryingCapacityCoupling: !consumedByEconomy,
      noPopulationChange: true,
      noStressChange: true,
      noSupportChange: !consumedByEconomy,
      reasonIds: [],
    },
    ...(physicalFoodHarvest === undefined ? {} : { physicalFoodHarvest }),
  });
  const ledgerFor = (trip) => food.deriveHumanFoodSupportLedger({ id: "band:return-audit", recentIntraSeasonTrips: [trip] }, 20);
  const physicalLedger = ledgerFor(makeTrip("gathered_plant_food", true, receipt));
  const discoveryLedger = ledgerFor(makeTrip("food_observation_only", false, undefined, 0.5));
  const materialLedger = ledgerFor(makeTrip("gathered_fiber_material", true, receipt, 0.5));
  const failureLedger = ledgerFor(makeTrip("none", false, { ...receipt, physicalSourceFound: false, usableSupport: 0, harvestedAmount: 0 }, 0));
  const discoveryWithoutReceiptLedger = ledgerFor(makeTrip("none", false, undefined, 0));

  let world = runner.initSimWorld({ kind: "map2" });
  world = runner.stepSim(world, 2, "seasonal");
  const trips = Object.values(world.bands).flatMap((band) => band.recentIntraSeasonTrips ?? []);
  const physicalTrips = trips.filter((trip) => trip.physicalFoodHarvest !== undefined && trip.physicalFoodHarvest.usableSupport > 0);
  const resolvedZero = trips.filter((trip) => trip.physicalFoodHarvest !== undefined && trip.physicalFoodHarvest.usableSupport === 0);

  const sourceFiles = allFiles(join(process.cwd(), "src")).filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"));
  const source = sourceFiles.map((path) => readFileSync(path, "utf8")).join("\n");
  const suffixMatches = source.match(/\.endsWith\(["']_placeholder["']\)/g) ?? [];
  const physicalSource = readFileSync(join(process.cwd(), "src/sim/agents/physicalFoodReturn.ts"), "utf8");
  const adaptationSource = readFileSync(join(process.cwd(), "src/sim/agents/foragingAdaptation.ts"), "utf8");
  const registry = returns.ACTIVITY_RETURN_SEMANTICS;
  const checks = {
    exhaustiveRegistry: Object.keys(registry).length === 10 && physicalSource.includes("satisfies Record<ActivityReturnResourceKind, ActivityReturnSemantics>"),
    plantPhysicalFood: controlled.plantGathering === "gathered_plant_food" && registry[controlled.plantGathering].contributesToNutrition,
    aquaticPhysicalFood: controlled.aquaticHarvest === "harvested_aquatic_food" && registry[controlled.aquaticHarvest].contributesToNutrition,
    faunaPhysicalFood: controlled.faunaHunting === "hunted_fauna_food" && registry[controlled.faunaHunting].contributesToNutrition,
    targetDiscoveryNoNutrition: controlled.observationOnly === "food_observation_only" && discoveryLedger.totalUsableSupport === 0,
    absentExhaustedZero: plantFixture.observation.sourceFound === true && plantFixture.observation.harvestedAmount === 0 &&
      plantFixture.exhausted.physicalAvailability === 0 && plantFixture.exhausted.harvestedAmount === 0 &&
      faunaAbsent.sourceFound === false && faunaAbsent.physicalAvailability === 0 && faunaAbsent.harvestedAmount === 0 &&
      failureLedger.totalUsableSupport === 0 && discoveryWithoutReceiptLedger.totalUsableSupport === 0,
    materialExplicitNonFood: controlled.fiberMaterial === "gathered_fiber_material" && controlled.fuelMaterial === "gathered_fuel_material" &&
      registry[controlled.fiberMaterial].category === "physical_material" && !registry[controlled.fiberMaterial].contributesToNutrition,
    materialCannotFeedLedger: materialLedger.totalUsableSupport === 0,
    observationInformational: registry.food_observation_only.category === "opportunity" && !registry.food_observation_only.isPhysical,
    failedTripNone: controlled.failedTrip === "none",
    opportunisticFoodExplicit: controlled.opportunisticFood === "gathered_plant_food",
    realPhysicalFoodFeedsLedger: physicalLedger.totalUsableSupport === 20,
    liveReceiptsExplicitOnly: physicalTrips.length > 0 && physicalTrips.every((trip) =>
      returns.isPhysicalFoodReturnKind(trip.resourceReturn.returnedResourceKind) && trip.resourceReturn.consumedByEconomy),
    liveZeroReceiptsReturnNone: resolvedZero.every((trip) => trip.resourceReturn.returnedResourceKind === "none" && !trip.resourceReturn.consumedByEconomy),
    adaptationReadsResolvedReceipt: adaptationSource.includes("isPhysicalFoodReturnKind(trip.resourceReturn.returnedResourceKind)") &&
      adaptationSource.includes("trip.resourceReturn.estimatedReturnValue"),
    noPlaceholderSuffixBehavior: suffixMatches.length === 0,
    legacyBoundarySafe: returns.normalizeLegacyActivityReturnKind("gathered_food_placeholder") === "none" &&
      returns.normalizeLegacyActivityReturnKind("gathered_plant_food") === "gathered_plant_food",
  };
  return {
    checks,
    inventory: Object.entries(registry).map(([kind, semantics]) => ({ kind, ...semantics })),
    controlled,
    ledger: {
      physicalFoodSupport: physicalLedger.totalUsableSupport,
      discoverySupport: discoveryLedger.totalUsableSupport,
      materialSupport: materialLedger.totalUsableSupport,
      failedSupport: failureLedger.totalUsableSupport,
    },
    live: { tripCount: trips.length, physicalReceiptCount: physicalTrips.length, resolvedZeroCount: resolvedZero.length },
    compatibility: {
      liveWorldSnapshotsPersisted: false,
      historicalPlaceholderNormalization: "legacy values normalize to none at the boundary; never directly to calories",
    },
    sourceGuards: { sourceFiles: sourceFiles.length, placeholderSuffixChecks: suffixMatches.length },
    fingerprint: { controlled, ledger: [physicalLedger.totalUsableSupport, discoveryLedger.totalUsableSupport, materialLedger.totalUsableSupport], live: [trips.length, physicalTrips.length, resolvedZero.length] },
  };
}

function resolvePlantAbsenceFixtures(plant, initialWorld) {
  let sourceTile;
  let observation;
  for (const tile of Object.values(initialWorld.tiles)) {
    const candidate = plant.resolvePlantFoodHarvest(initialWorld, tile, initialWorld.time, 0.2, false);
    if (candidate.sourceFound) {
      sourceTile = tile;
      observation = candidate;
      break;
    }
  }
  if (sourceTile === undefined || observation === undefined) {
    throw new Error("return-kind audit could not find a deterministic physical plant source");
  }
  let world = initialWorld;
  let exhausted;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const draw = plant.resolvePlantFoodHarvest(world, sourceTile, world.time, 10, true);
    world = draw.world;
    exhausted = plant.resolvePlantFoodHarvest(world, sourceTile, world.time, 0.2, true);
    if (exhausted.failureReason === "physically_exhausted") break;
  }
  if (exhausted?.failureReason !== "physically_exhausted") {
    throw new Error("return-kind audit failed to exhaust its controlled plant patch");
  }
  return { observation, exhausted };
}

function allFiles(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? allFiles(path) : [path];
  });
}
