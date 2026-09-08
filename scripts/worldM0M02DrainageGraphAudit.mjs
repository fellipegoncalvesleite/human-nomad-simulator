import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

import { clonePhysicalConstants } from "./lib/worldM0M02Fixture.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRAINAGE_PATH = join(ROOT, "src/sim/world/physical/terrainDrainage.ts");
const CELL_AREA = 62_500;
const DRAINAGE_SOURCE = existsSync(DRAINAGE_PATH) ? readFileSync(DRAINAGE_PATH, "utf8") : "";
const BASE_LABELS = [
  "elevationMeters", "landMask", "routingElevationMeters", "flatRank",
  "terminalKindByCell", "terminalOrdinalByCell",
];
const FLOW_LABELS = [
  ["flowPrimaryReceiver", "i32"],
  ["flowSecondaryReceiver", "i32"],
  ["flowPrimaryWeight", "f64"],
  ["flowSecondaryWeight", "f64"],
  ["flowTerminalReceiver", "i32"],
  ["flowContributingAreaM2", "f64"],
  ["flowTopologicalOrder", "i32"],
];
const TASK8_LABELS = [
  "primaryContributingAreaM2", "catchmentRoot", "persistentEligible",
  "representedSupport", "representedIndegree", "firstReachAssignment",
];
const F567_ELEVATIONS = [
  9, 9, 9, 9, 9,
  9, 6, 5, 6, 9,
  9, 5, 1, 1, 5,
  9, 6, 5, 6, 4,
  9, 9, 9, 9, 3,
];
const ZERO_INTENT = Object.freeze({ a: 0, b: 0, c: 0, d: 0 });

async function loadModules(cacheSuffix = "") {
  const loaded = { loadError: undefined };
  const server = await createServer({
    root: join(ROOT, "src"),
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    logLevel: "error",
  });
  try {
    loaded.scratch = await server.ssrLoadModule(`/sim/world/physical/terrainScratch.ts${cacheSuffix}`);
    loaded.flow = await server.ssrLoadModule(`/sim/world/physical/terrainFlow.ts${cacheSuffix}`);
    loaded.depressions = await server.ssrLoadModule(`/sim/world/physical/terrainDepressions.ts${cacheSuffix}`);
    if (existsSync(DRAINAGE_PATH)) {
      loaded.drainage = await server.ssrLoadModule(`/sim/world/physical/terrainDrainage.ts${cacheSuffix}`);
    }
  } catch (error) {
    loaded.loadError = error instanceof Error ? error.message : String(error);
  } finally {
    await server.close();
  }
  return loaded;
}

const modules = await loadModules();
const hasAuthority = typeof modules.drainage?.extractPersistentDrainageGraph === "function";

function id(namespace, ordinal) {
  return `${namespace}:${ordinal.toString(16).padStart(16, "0")}`;
}

function point(xM, yM) { return { xM, yM }; }
function samePoint(a, b) { return a?.xM === b?.xM && a?.yM === b?.yM; }
function exactArray(actual, expected) {
  return actual?.length === expected.length && expected.every((value, index) => Object.is(actual[index], value));
}
function exactPointArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    expected.every((value, index) => samePoint(actual[index], value));
}
function exactKeys(value, expected) {
  return value && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}
function resultValue(result) { return result?.ok === true ? result.value : undefined; }
function resultError(result) { return result?.ok === false ? result.error : undefined; }

function makeSyntheticFixture(definition) {
  const constants = clonePhysicalConstants();
  if (definition.maxScratchBytes !== undefined) constants.analysis.maxScratchBytes = definition.maxScratchBytes;
  constants.drainage.persistenceAreaM2 = definition.persistenceAreaM2 ?? CELL_AREA;
  constants.drainage.minReachLengthMeters = definition.minReachLengthMeters ?? 500;
  constants.geometry.simplifyToleranceMeters = definition.simplifyToleranceMeters ?? 125;
  if (definition.maxPolygonVerticesPerFeature !== undefined) {
    constants.geometry.maxPolygonVerticesPerFeature = definition.maxPolygonVerticesPerFeature;
  }
  if (definition.maxPolylineVerticesPerFeature !== undefined) {
    constants.geometry.maxPolylineVerticesPerFeature = definition.maxPolylineVerticesPerFeature;
  }
  if (definition.maxNodes !== undefined) constants.drainage.maxNodes = definition.maxNodes;
  if (definition.maxReaches !== undefined) constants.drainage.maxReaches = definition.maxReaches;
  const n = definition.width * definition.height;
  constants.analysis.maxAnalysisCells = Math.max(constants.analysis.maxAnalysisCells, n);
  const budgetResult = modules.scratch?.createTerrainScratchBudget?.(constants.analysis.maxScratchBytes);
  const budget = resultValue(budgetResult);
  const gridResult = budget && modules.scratch?.allocateTerrainScratchGrid?.(
    definition.width * 250, definition.height * 250, constants, budget,
  );
  const grid = resultValue(gridResult);
  if (!grid) return { constants, budget, gridResult };

  const fillOrder = definition.fillOrder === "reverse"
    ? Array.from({ length: n }, (_, index) => n - 1 - index)
    : Array.from({ length: n }, (_, index) => index);
  for (const cell of fillOrder) {
    grid.elevationMeters[cell] = definition.elevations?.[cell] ?? (100 - cell);
    grid.routingElevationMeters[cell] = definition.routing?.[cell] ?? grid.elevationMeters[cell];
    grid.landMask[cell] = definition.landMask?.[cell] ?? 1;
    grid.flatRank[cell] = definition.flatRank?.[cell] ?? 0;
    grid.terminalKindByCell[cell] = definition.kinds?.[cell] ?? 0;
    grid.terminalOrdinalByCell[cell] = definition.ordinals?.[cell] ?? -1;
  }

  const ownersArray = budget.allocateBatch([
    { label: "terminalOwnerCells", kind: "i32", length: definition.owners.length },
  ]);
  if (!ownersArray.ok) return { constants, budget, grid, ownerError: ownersArray.error };
  const terminalOwnerCells = ownersArray.value[0];
  terminalOwnerCells.set(definition.owners);
  const terminalOwners = {
    terminalKindByCell: grid.terminalKindByCell,
    terminalOrdinalByCell: grid.terminalOrdinalByCell,
    terminalOwnerCells,
    terminalCount: definition.owners.length,
  };

  const flowAllocation = budget.allocateBatch(FLOW_LABELS.map(([label, kind]) => ({ label, kind, length: n })));
  if (!flowAllocation.ok) return { constants, budget, grid, terminalOwners, flowError: flowAllocation.error };
  const [primaryReceiver, secondaryReceiver, primaryWeight, secondaryWeight,
    terminalReceiver, contributingAreaM2, topologicalOrder] = flowAllocation.value;
  primaryReceiver.fill(-1);
  secondaryReceiver.fill(-1);
  terminalReceiver.fill(-1);
  topologicalOrder.fill(-1);
  for (let cell = 0; cell < n; cell += 1) {
    primaryReceiver[cell] = definition.primary[cell];
    if (definition.secondary) secondaryReceiver[cell] = definition.secondary[cell];
    primaryWeight[cell] = primaryReceiver[cell] >= 0 ? 1 : 0;
    secondaryWeight[cell] = 0;
    terminalReceiver[cell] = definition.terminalReceiver?.[cell] ??
      (grid.terminalOrdinalByCell[cell] >= 0 ? grid.terminalOrdinalByCell[cell] : -1);
    contributingAreaM2[cell] = definition.splitArea?.[cell] ?? (grid.landMask[cell] === 1 ? CELL_AREA : 0);
  }
  topologicalOrder.set(definition.topologicalOrder);
  const flow = { primaryReceiver, secondaryReceiver, primaryWeight, secondaryWeight,
    terminalReceiver, contributingAreaM2, topologicalOrder };
  const depression = {
    retainedDepressions: definition.retainedDepressions ?? [],
    terminalOwners,
    conditionedDepressionCount: 0,
    repairOperationCount: 0,
  };
  const landCount = Array.from(grid.landMask).filter((value) => value === 1).length;
  const coastline = definition.coastline ?? {
    seaLevelMeters: 0,
    coastline: [],
    landAreaM2: landCount * CELL_AREA,
    oceanAreaM2: (n - landCount) * CELL_AREA,
  };
  return { constants, budget, grid, terminalOwners, flow, depression, coastline };
}

function runSynthetic(definition) {
  const fixture = makeSyntheticFixture(definition);
  const before = fixture.budget?.snapshot();
  const task8Aliases = [];
  const originalAllocateBatch = fixture.budget?.allocateBatch;
  if (definition.captureReleasedAliases && fixture.budget && originalAllocateBatch) {
    fixture.budget.allocateBatch = (requests) => {
      const allocated = originalAllocateBatch(requests);
      if (allocated.ok && requests.some((request) => TASK8_LABELS.includes(request.label))) {
        task8Aliases.push(...allocated.value);
      }
      return allocated;
    };
  }
  let result;
  let accounting;
  const originalRelease = fixture.budget?.release;
  if (definition.captureReleasedAliases && originalRelease) {
    fixture.budget.release = label => {
      if (label === "primaryContributingAreaM2") {
        accounting = { assignment: Array.from(task8Aliases[5]), catchment: Array.from(task8Aliases[1]),
          primary: Array.from(fixture.flow.primaryReceiver), splitArea: Array.from(fixture.flow.contributingAreaM2),
          eligible: Array.from(task8Aliases[2]), support: Array.from(task8Aliases[3]) };
      }
      return originalRelease(label);
    };
  }
  try {
    result = fixture.grid && hasAuthority
      ? modules.drainage.extractPersistentDrainageGraph(
        fixture.grid, fixture.coastline, fixture.flow, fixture.depression, fixture.constants,
      )
      : undefined;
  } finally {
    if (definition.captureReleasedAliases && fixture.budget && originalAllocateBatch) {
      fixture.budget.allocateBatch = originalAllocateBatch;
      fixture.budget.release = originalRelease;
    }
  }
  const releasedAliases = definition.captureReleasedAliases && fixture.flow && fixture.terminalOwners
    ? [...task8Aliases, ...FLOW_LABELS.map(([label]) => ({
      flowPrimaryReceiver: fixture.flow.primaryReceiver,
      flowSecondaryReceiver: fixture.flow.secondaryReceiver,
      flowPrimaryWeight: fixture.flow.primaryWeight,
      flowSecondaryWeight: fixture.flow.secondaryWeight,
      flowTerminalReceiver: fixture.flow.terminalReceiver,
      flowContributingAreaM2: fixture.flow.contributingAreaM2,
      flowTopologicalOrder: fixture.flow.topologicalOrder,
    })[label]), fixture.terminalOwners.terminalOwnerCells]
    : [];
  return { fixture, before, result, accounting, value: resultValue(result), after: fixture.budget?.snapshot(), releasedAliases };
}

function replaceSourceExactlyOnce(source, needle, replacement) {
  const first = source.indexOf(needle);
  if (first < 0 || first !== source.lastIndexOf(needle)) return undefined;
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function independentLocalWitnessSourceGuard(source) {
  return source.includes("reaches[firstReachAssignment[current]].localAreaM2 += scratch.cellAreaM2;") &&
    source.includes("reaches[firstReachAssignment[cell]].localAreaM2 += scratch.cellAreaM2;") &&
    !/localAreaM2\s*=\s*primaryArea\[reach\.measurementCell\]\s*-/.test(source);
}

async function runDrainageSourceMutation(label, mutateSource, exercise) {
  const originalBytes = readFileSync(DRAINAGE_PATH);
  const originalSource = originalBytes.toString("utf8");
  const mutatedSource = mutateSource(originalSource);
  if (typeof mutatedSource !== "string" || mutatedSource === originalSource) {
    return { applied: false, detected: false, restored: readFileSync(DRAINAGE_PATH).equals(originalBytes), detail: null };
  }
  const originalDrainage = modules.drainage;
  let detected = false;
  let loadedSuccessfully = false;
  let executed = false;
  let detail = null;
  try {
    writeFileSync(DRAINAGE_PATH, mutatedSource);
    const loaded = await loadModules(`?task8_mutant=${encodeURIComponent(label)}`);
    if (loaded.loadError !== undefined || typeof loaded.drainage?.extractPersistentDrainageGraph !== "function") {
      detail = { loadError: loaded.loadError ?? "mutated drainage authority absent" };
    } else {
      loadedSuccessfully = true;
      modules.drainage = loaded.drainage;
      executed = true;
      const outcome = exercise(mutatedSource);
      detected = outcome?.detected === true;
      detail = outcome?.detail ?? null;
    }
  } finally {
    modules.drainage = originalDrainage;
    writeFileSync(DRAINAGE_PATH, originalBytes);
  }
  return { applied: true, loaded: loadedSuccessfully, executed, detected, restored: readFileSync(DRAINAGE_PATH).equals(originalBytes), detail };
}

function runWithPushGuard(definition, shouldGuard, limit) {
  const fixture = makeSyntheticFixture(definition);
  const originalPush = Array.prototype.push;
  let guardTrips = 0;
  let thrown;
  let result;
  Array.prototype.push = function (...items) {
    if (items.some(shouldGuard) && this.length + items.length > limit) {
      guardTrips += 1;
      throw new Error(`TASK8_RUNTIME_PUSH_GUARD:${limit}`);
    }
    return originalPush.apply(this, items);
  };
  try {
    result = fixture.grid && hasAuthority
      ? modules.drainage.extractPersistentDrainageGraph(
        fixture.grid, fixture.coastline, fixture.flow, fixture.depression, fixture.constants,
      )
      : undefined;
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  } finally {
    Array.prototype.push = originalPush;
  }
  return { fixture, result, value: resultValue(result), guardTrips, thrown };
}

function runWithArrayCopyGuard(definition) {
  const fixture = makeSyntheticFixture(definition);
  const methodNames = ["map", "slice", "flatMap", "concat"];
  const originals = new Map(methodNames.map((name) => [name, Array.prototype[name]]));
  const trips = [];
  let thrown;
  let result;
  for (const name of methodNames) {
    const original = originals.get(name);
    Array.prototype[name] = function (...args) {
      trips.push({ name, length: this.length });
      throw new Error(`TASK8_RUNTIME_ARRAY_COPY_GUARD:${name}:${this.length}`);
    };
  }
  try {
    result = fixture.grid && hasAuthority
      ? modules.drainage.extractPersistentDrainageGraph(
        fixture.grid, fixture.coastline, fixture.flow, fixture.depression, fixture.constants,
      )
      : undefined;
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  } finally {
    for (const [name, original] of originals) Array.prototype[name] = original;
  }
  return { fixture, result, value: resultValue(result), trips, thrown };
}

function runWithArrayLengthGuard(definition, guardedLength) {
  const fixture = makeSyntheticFixture(definition);
  const NativeArray = globalThis.Array;
  let guardTrips = 0;
  let thrown;
  let result;
  globalThis.Array = new Proxy(NativeArray, {
    construct(target, args, newTarget) {
      if (args.length === 1 && args[0] === guardedLength) {
        guardTrips += 1;
        throw new Error(`TASK8_RUNTIME_ARRAY_LENGTH_GUARD:${guardedLength}`);
      }
      return Reflect.construct(target, args, newTarget);
    },
    apply(target, thisArg, args) { return Reflect.apply(target, thisArg, args); },
  });
  try {
    result = fixture.grid && hasAuthority
      ? modules.drainage.extractPersistentDrainageGraph(
        fixture.grid, fixture.coastline, fixture.flow, fixture.depression, fixture.constants,
      )
      : undefined;
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  } finally {
    globalThis.Array = NativeArray;
  }
  return { fixture, result, value: resultValue(result), guardTrips, thrown };
}

const F1 = Object.freeze({
  width: 5, height: 1,
  primary: [1, 2, 3, 4, -1],
  kinds: [0, 0, 0, 0, 2],
  ordinals: [-1, -1, -1, -1, 0], owners: [4],
  topologicalOrder: [0, 1, 2, 3, 4],
  splitArea: [CELL_AREA, 2 * CELL_AREA, 3 * CELL_AREA, 4 * CELL_AREA, 5 * CELL_AREA],
  persistenceAreaM2: 2 * CELL_AREA,
  elevations: [50, 40, 30, 20, 10],
});
const f1 = runSynthetic(F1);
const f10ReleaseAliases = runSynthetic({ ...F1, captureReleasedAliases: true });
const f10CatchmentBoundGuard = runWithPushGuard(
  { ...F1, maxPolygonVerticesPerFeature: 5, persistenceAreaM2: 10_000_000 },
  (value) => value && typeof value === "object" && Number.isFinite(value.xM) && Number.isFinite(value.yM) &&
    value.xM % 250 === 0 && value.yM % 250 === 0,
  5,
);
const F10_LONG_REACH = Object.freeze({
  width: 8, height: 1,
  primary: [1, 2, 3, 4, 5, 6, 7, -1],
  kinds: [0, 0, 0, 0, 0, 0, 0, 2],
  ordinals: [-1, -1, -1, -1, -1, -1, -1, 0], owners: [7],
  topologicalOrder: [0, 1, 2, 3, 4, 5, 6, 7],
  splitArea: [CELL_AREA, 2 * CELL_AREA, 3 * CELL_AREA, 4 * CELL_AREA, 5 * CELL_AREA, 6 * CELL_AREA, 7 * CELL_AREA, 8 * CELL_AREA],
  persistenceAreaM2: CELL_AREA,
  maxPolygonVerticesPerFeature: 5,
  maxPolylineVerticesPerFeature: 2,
});
const f10ReachBoundGuard = runWithPushGuard(
  F10_LONG_REACH,
  (value) => value && typeof value === "object" && Number.isFinite(value.xM) && Number.isFinite(value.yM) &&
    value.xM % 250 === 125 && value.yM % 250 === 125,
  2,
);
const F10_MANY_TERMINALS = Object.freeze({
  width: 16, height: 1,
  primary: Array(16).fill(-1),
  kinds: Array(16).fill(2),
  ordinals: Array.from({ length: 16 }, (_, index) => index),
  owners: Array.from({ length: 16 }, (_, index) => index),
  topologicalOrder: Array.from({ length: 16 }, (_, index) => index),
  persistenceAreaM2: 10_000_000,
});
const f10TerminalMirrorGuard = runWithArrayLengthGuard(F10_MANY_TERMINALS, 16);
const f10NodeBoundGuard = runWithPushGuard(
  { ...F1, maxNodes: 1 },
  (value) => value && typeof value === "object" && Number.isSafeInteger(value.cell) &&
    (value.kind === "source" || value.kind === "confluence" || value.kind === "terminal"),
  1,
);
const f10ArrayCopyGuard = runWithArrayCopyGuard(F1);
const f10ForbiddenCopySourceMatches = [...DRAINAGE_SOURCE.matchAll(/\.(map|slice|flatMap|concat)\s*\(/g)]
  .map((match) => ({ method: match[1], index: match.index }));
const f8LiteralDomain1Structure =
  /function\s+finalizeCatchmentGeometryDomainV1\s*\(/.test(DRAINAGE_SOURCE) &&
  /originalUnsimplified/.test(DRAINAGE_SOURCE) &&
  /earlierFinal/.test(DRAINAGE_SOURCE) &&
  /laterOriginal/.test(DRAINAGE_SOURCE) &&
  DRAINAGE_SOURCE.indexOf("finalizeCatchmentGeometryDomainV1(") <
    DRAINAGE_SOURCE.indexOf('formatTerrainHydroId("catchment"');
const f8GridToleranceSpecializationExact =
  /2\s*\*\s*toleranceSquared\s*<\s*scratch\.cellSizeMeters\s*\*\s*scratch\.cellSizeMeters/.test(DRAINAGE_SOURCE) &&
  !/rasterCornerHasProtectedCellCenter/.test(DRAINAGE_SOURCE);
const f1ReverseFill = runSynthetic({ ...F1, fillOrder: "reverse" });
const f1ThresholdAt = f1;
const f1ThresholdBelow = runSynthetic({ ...F1, persistenceAreaM2: 2 * CELL_AREA + 1 });
const f1ReliefChanged = runSynthetic({ ...F1, elevations: [500, -20, 900, 3, 777] });

const F2 = Object.freeze({
  width: 6, height: 1,
  primary: [-1, 0, 1, 4, 5, -1],
  kinds: [2, 0, 0, 0, 0, 2],
  ordinals: [0, -1, -1, -1, -1, 1], owners: [0, 5],
  topologicalOrder: [2, 1, 0, 3, 4, 5],
  splitArea: [3 * CELL_AREA, 2 * CELL_AREA, CELL_AREA, CELL_AREA, 2 * CELL_AREA, 3 * CELL_AREA],
  persistenceAreaM2: CELL_AREA,
  elevations: [10, 20, 30, 30, 20, 10],
});
const f2 = runSynthetic(F2);
const f4OwnerBypass = runSynthetic({
  ...F2,
  primary: [5, 0, 1, 4, 5, -1],
  terminalReceiver: [0, -1, -1, -1, -1, 1],
});

const F8_DONUT = Object.freeze({
  width: 4, height: 4,
  landMask: [
    1, 1, 1, 0,
    1, 1, 1, 0,
    1, 1, 1, 0,
    0, 0, 0, 1,
  ],
  primary: [
    -1, 0, 1, -1,
    0, -1, 2, -1,
    4, 8, 9, -1,
    -1, -1, -1, 10,
  ],
  kinds: [
    2, 0, 0, 0,
    0, 3, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ],
  ordinals: [
    1, -1, -1, -1,
    -1, 0, -1, -1,
    -1, -1, -1, -1,
    -1, -1, -1, -1,
  ],
  owners: [5, 0],
  topologicalOrder: [6, 2, 1, 15, 10, 9, 8, 4, 0, 5, -1, -1, -1, -1, -1, -1],
  persistenceAreaM2: 10_000_000,
});
const f8Donut = runSynthetic(F8_DONUT);

const F3 = Object.freeze({
  width: 4, height: 2,
  landMask: [0, 1, 0, 0, 1, 1, 1, 1],
  primary: [-1, 5, -1, -1, 5, 6, 7, -1],
  kinds: [0, 0, 0, 0, 0, 0, 0, 2],
  ordinals: [-1, -1, -1, -1, -1, -1, -1, 0], owners: [7],
  topologicalOrder: [4, 1, 5, 6, 7, -1, -1, -1],
  splitArea: [0, CELL_AREA, 0, 0, CELL_AREA, 2 * CELL_AREA, 3 * CELL_AREA, 5 * CELL_AREA],
  persistenceAreaM2: CELL_AREA,
  elevations: [0, 40, 0, 0, 50, 30, 20, 10],
  minReachLengthMeters: 2_000,
});
const f3 = runSynthetic(F3);
const f3SiblingOrder = runSynthetic({ ...F3, topologicalOrder: [1, 4, 5, 6, 7, -1, -1, -1] });
const f3Cycle = runSynthetic({ ...F3, primary: [-1, 5, -1, -1, 5, 6, 5, -1] });
const f3InvalidReceiver = runSynthetic({ ...F3, primary: [-1, 5, -1, -1, 99, 6, 7, -1] });
const F3_TERMINAL_OWNER_MERGE = Object.freeze({
  width: 2, height: 2,
  landMask: [0, 1, 1, 1],
  primary: [-1, 3, 3, -1],
  kinds: [0, 0, 0, 2],
  ordinals: [-1, -1, -1, 0], owners: [3],
  topologicalOrder: [2, 1, 3, -1],
  splitArea: [0, CELL_AREA, CELL_AREA, 3 * CELL_AREA],
  persistenceAreaM2: CELL_AREA,
  elevations: [0, 40, 50, 30],
});
const f3TerminalOwnerMerge = runSynthetic(F3_TERMINAL_OWNER_MERGE);
const f1BadCoastline = runSynthetic({ ...F1, coastline: {
  seaLevelMeters: 0, coastline: [], landAreaM2: 0, oceanAreaM2: 0,
} });
const f1Preflight = runSynthetic({ ...F1, maxScratchBytes: 443 });
const f1ReleaseProbe = f1.fixture.budget.allocateBatch([
  ...FLOW_LABELS.map(([label, kind]) => ({ label, kind, length: 5 })),
  ...TASK8_LABELS.map((label, index) => ({ label, kind: ["f64", "i32", "u8", "u8", "i32", "i32"][index], length: 5 })),
  { label: "terminalOwnerCells", kind: "i32", length: 1 },
]);

function structuralGraph(value) {
  if (!value) return undefined;
  return {
    terminals: value.terminals,
    catchments: value.catchments,
    nodes: value.nodes,
    reaches: value.reaches.map(({ meanTerrainGradient, localReliefMeters, channelIncisionMeters, ...rest }) => rest),
    retainedDepressionLinks: value.retainedDepressionLinks,
  };
}

function reachByEndpoints(value, upstream, downstream) {
  if (!value) return undefined;
  return value.reaches.find((reach) => {
    const up = value.nodes.find((node) => node.id === reach.upstreamNodeId);
    const down = value.nodes.find((node) => node.id === reach.downstreamNodeId);
    return samePoint(up?.point, upstream) && samePoint(down?.point, downstream);
  });
}

const f1Source = f1.value?.nodes.find((node) => node.kind === "source");
const f1Terminal = f1.value?.terminals[0];
const f1Reach = f1.value?.reaches[0];
const f2Sources = f2.value?.nodes.filter((node) => node.kind === "source") ?? [];
const f3TribA = reachByEndpoints(f3.value, point(125, 125), point(375, 125));
const f3TribB = reachByEndpoints(f3.value, point(375, 375), point(375, 125));
const f3Trunk = reachByEndpoints(f3.value, point(375, 125), point(875, 0));
const f3TerminalMergeTribA = reachByEndpoints(f3TerminalOwnerMerge.value, point(125, 125), point(375, 125));
const f3TerminalMergeTribB = reachByEndpoints(f3TerminalOwnerMerge.value, point(375, 375), point(375, 125));
const f3TerminalMergeTrunk = reachByEndpoints(f3TerminalOwnerMerge.value, point(375, 125), point(375, 0));

const oldTerminalOwnerMergeMutation = await runDrainageSourceMutation(
  "old-terminal-owner-merge",
  (source) => replaceSourceExactlyOnce(
    source,
    "      const terminalMerge = representedIndegree[cell] >= 2 && !samePoint(cellCenter, terminal.point);",
    "      const terminalMerge = false;",
  ),
  () => {
    const mutant = runSynthetic(F3_TERMINAL_OWNER_MERGE);
    return {
      detected: resultError(mutant.result)?.path === "drainage.reaches.localContributingAreaM2" || mutant.result?.ok === true && mutant.value?.nodes.filter((node) => node.kind === "confluence").length === 0 &&
        mutant.value?.reaches.length === 2,
      detail: { error: resultError(mutant.result) ?? null, nodeKinds: mutant.value?.nodes.map((node) => node.kind) ?? null,
        reachCount: mutant.value?.reaches.length ?? null },
    };
  },
);

const droppedOffSupportMutation = await runDrainageSourceMutation(
  "drop-off-support-cell",
  (source) => replaceSourceExactlyOnce(
    source,
    "    if (scratch.landMask[cell] !== 1 || firstReachAssignment[cell] >= 0) continue;",
    "    if (scratch.landMask[cell] !== 1 || firstReachAssignment[cell] >= 0 || representedSupport[cell] !== 1) continue;",
  ),
  () => {
    const mutant = runSynthetic(F1);
    return {
      detected: resultError(mutant.result)?.path === "drainage.reaches.localContributingAreaM2" ||
        mutant.result?.ok === true && mutant.value?.reaches[0]?.localContributingAreaM2 === 4 * CELL_AREA,
      detail: { error: resultError(mutant.result) ?? null,
        localContributingAreaM2: mutant.value?.reaches[0]?.localContributingAreaM2 ?? null },
    };
  },
);

const incomingConfluenceAssignmentMutation = await runDrainageSourceMutation(
  "assign-confluence-cell-incoming",
  (source) => replaceSourceExactlyOnce(
    source,
    "    firstReachAssignment[node.cell] = outgoing.transientOrdinal;",
    "    const incoming = reaches.find((reach) => reach.downstreamCell === node.cell);\n" +
      "    firstReachAssignment[node.cell] = incoming?.transientOrdinal ?? outgoing.transientOrdinal;",
  ),
  () => {
    const mutant = runSynthetic(F3);
    const trunk = reachByEndpoints(mutant.value, point(375, 125), point(875, 0));
    const tribA = reachByEndpoints(mutant.value, point(125, 125), point(375, 125));
    const tribB = reachByEndpoints(mutant.value, point(375, 375), point(375, 125));
    return {
      detected: resultError(mutant.result)?.path === "drainage.reaches.localContributingAreaM2" ||
        mutant.result?.ok === true && (trunk?.localContributingAreaM2 !== 3 * CELL_AREA ||
        tribA?.localContributingAreaM2 !== CELL_AREA || tribB?.localContributingAreaM2 !== CELL_AREA),
      detail: { error: resultError(mutant.result) ?? null, trunkLocal: trunk?.localContributingAreaM2 ?? null,
        tribALocal: tribA?.localContributingAreaM2 ?? null, tribBLocal: tribB?.localContributingAreaM2 ?? null },
    };
  },
);

const residualLocalAreaMutation = await runDrainageSourceMutation(
  "derive-local-as-residual",
  (source) => replaceSourceExactlyOnce(
    source,
    "\n  // Final physical identity sort uses the finalized geometry, not the domain-2",
    "\n  for (const reach of reaches) {\n" +
      "    let upstreamTotalM2 = 0;\n" +
      "    for (const candidate of reaches) {\n" +
      "      if (candidate !== reach && candidate.downstreamCell === reach.upstreamCell) {\n" +
      "        upstreamTotalM2 += primaryArea[candidate.measurementCell];\n" +
      "      }\n" +
      "    }\n" +
      "    reach.localAreaM2 = primaryArea[reach.measurementCell] - upstreamTotalM2;\n" +
      "  }\n\n" +
      "  // Final physical identity sort uses the finalized geometry, not the domain-2",
  ),
  (mutatedSource) => {
    const mutant = runSynthetic(F3);
    return {
      detected: mutant.result?.ok === true && !independentLocalWitnessSourceGuard(mutatedSource),
      detail: { error: resultError(mutant.result) ?? null, sourceGuard: independentLocalWitnessSourceGuard(mutatedSource) },
    };
  },
);

function setupG6() {
  const definition = {
    width: 3, height: 3,
    routing: [100, 98, 100, 97, 97, 97, 100, 100, 100],
    elevations: [100, 98, 100, 97, 97, 97, 100, 100, 100],
    flatRank: Array(9).fill(0),
    kinds: [2, 2, 2, 2, 3, 2, 2, 2, 2],
    ordinals: [3, 5, 7, 2, 0, 8, 1, 4, 6],
    owners: [4, 6, 3, 0, 7, 1, 8, 2, 5],
    primary: Array(9).fill(-1), topologicalOrder: Array(9).fill(-1),
    persistenceAreaM2: 10_000_000,
  };
  const constants = clonePhysicalConstants();
  constants.drainage.persistenceAreaM2 = definition.persistenceAreaM2;
  const budgetResult = modules.scratch?.createTerrainScratchBudget?.(constants.analysis.maxScratchBytes);
  const budget = resultValue(budgetResult);
  const grid = budget && resultValue(modules.scratch?.allocateTerrainScratchGrid?.(750, 750, constants, budget));
  if (!grid) return { constants, budget };
  grid.elevationMeters.set(definition.elevations);
  grid.routingElevationMeters.set(definition.routing);
  grid.landMask.fill(1);
  grid.flatRank.fill(0);
  grid.terminalKindByCell.set(definition.kinds);
  grid.terminalOrdinalByCell.set(definition.ordinals);
  const ownerResult = budget.allocateBatch([{ label: "terminalOwnerCells", kind: "i32", length: 9 }]);
  if (!ownerResult.ok) return { constants, budget, grid };
  const terminalOwnerCells = ownerResult.value[0];
  terminalOwnerCells.set(definition.owners);
  const owners = { terminalKindByCell: grid.terminalKindByCell, terminalOrdinalByCell: grid.terminalOrdinalByCell,
    terminalOwnerCells, terminalCount: 9 };
  const decision = modules.flow?.evaluateDInfinityCellDecision?.(grid, owners, 1);
  const flowResult = modules.flow?.analyzeDInfinityFlow?.(grid, owners, constants);
  const flow = resultValue(flowResult);
  const depression = { retainedDepressions: [], terminalOwners: owners, conditionedDepressionCount: 0, repairOperationCount: 0 };
  const coastline = { seaLevelMeters: 0, coastline: [], landAreaM2: 9 * CELL_AREA, oceanAreaM2: 0 };
  const drainageResult = flow && hasAuthority
    ? modules.drainage.extractPersistentDrainageGraph(grid, coastline, flow, depression, constants)
    : undefined;
  return { constants, budget, grid, owners, decision, flowResult, drainageResult, value: resultValue(drainageResult) };
}
const g6 = setupG6();

function runF67(kind) {
  const constants = clonePhysicalConstants();
  constants.drainage.persistenceAreaM2 = CELL_AREA;
  if (kind === "F6") {
    constants.depression.retainedMinAreaM2 = 1_000_000;
    constants.depression.retainedMinDepthMeters = 10;
    constants.depression.protectedClosedBasinRatePer65536 = 42_612;
  } else {
    constants.depression.retainedMinAreaM2 = 125_000;
    constants.depression.retainedMinDepthMeters = 3;
    constants.depression.protectedClosedBasinRatePer65536 = 0;
  }
  const budget = resultValue(modules.scratch?.createTerrainScratchBudget?.(constants.analysis.maxScratchBytes));
  const grid = budget && resultValue(modules.scratch?.allocateTerrainScratchGrid?.(1250, 1250, constants, budget));
  if (!grid) return { constants, budget };
  grid.elevationMeters.set(F567_ELEVATIONS);
  grid.landMask.fill(1);
  const depressionResult = modules.depressions?.analyzeTerrainDepressionsAndBoundaries?.(
    grid, 0, ZERO_INTENT, constants,
  );
  const depression = resultValue(depressionResult);
  const flowResult = depression && modules.flow?.analyzeDInfinityFlow?.(grid, depression.terminalOwners, constants);
  const flow = resultValue(flowResult);
  const coastline = { seaLevelMeters: 0, coastline: [], landAreaM2: 25 * CELL_AREA, oceanAreaM2: 0 };
  const drainageResult = depression && flow && hasAuthority
    ? modules.drainage.extractPersistentDrainageGraph(grid, coastline, flow, depression, constants)
    : undefined;
  return { constants, budget, grid, depressionResult, depression, flowResult, drainageResult, value: resultValue(drainageResult) };
}
const f6 = runF67("F6");
const f7 = runF67("F7");

const A = [point(0, 0), point(100, 100), point(200, 0)];
const B = [point(50, 20), point(100, -10), point(150, 20)];

// Independent audit-side oracle for the frozen §8/M03 A/B discriminator.
// Production Task 8 must not carry a second copy-heavy simplifier merely so the
// audit can call it; this oracle intentionally owns its own tiny bounded arrays.
function auditPointSegmentDistanceSquared(previous, vertex, next) {
  const dx = next.xM - previous.xM;
  const dy = next.yM - previous.yM;
  const wx = vertex.xM - previous.xM;
  const wy = vertex.yM - previous.yM;
  const len2 = dx * dx + dy * dy;
  if (!(len2 > 0)) return Number.POSITIVE_INFINITY;
  const t = (wx * dx + wy * dy) / len2;
  const tc = Math.min(1, Math.max(0, t));
  const qx = previous.xM + tc * dx;
  const qy = previous.yM + tc * dy;
  const ex = vertex.xM - qx;
  const ey = vertex.yM - qy;
  return ex * ex + ey * ey;
}
function auditM03ReachDomain(input, toleranceMeters) {
  const original = input.map((feature) => ({
    preKey: feature.preKey,
    geometry: feature.geometry.map((p) => point(p.xM, p.yM)),
  })).sort((left, right) => left.preKey < right.preKey ? -1 : left.preKey > right.preKey ? 1 : 0);
  const final = [];
  const toleranceSquared = toleranceMeters * toleranceMeters;
  for (let featureIndex = 0; featureIndex < original.length; featureIndex += 1) {
    const work = original[featureIndex].geometry.map((p, ordinal) => ({ ...p, ordinal }));
    const rejected = new Set();
    while (true) {
      let best = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 1; index + 1 < work.length; index += 1) {
        if (rejected.has(index)) continue;
        const distance = auditPointSegmentDistanceSquared(work[index - 1], work[index], work[index + 1]);
        if (distance > toleranceSquared) continue;
        const bestPoint = best >= 0 ? work[best] : undefined;
        if (best < 0 || distance < bestDistance ||
            (distance === bestDistance && (work[index].xM < bestPoint.xM ||
              (work[index].xM === bestPoint.xM && (work[index].yM < bestPoint.yM ||
                (work[index].yM === bestPoint.yM && work[index].ordinal < bestPoint.ordinal)))))) {
          best = index;
          bestDistance = distance;
        }
      }
      if (best < 0) break;
      const previous = work[best - 1];
      const next = work[best + 1];
      let conflict = false;
      for (let earlier = 0; earlier < final.length && !conflict; earlier += 1) {
        const geometry = final[earlier].geometry;
        for (let segment = 0; segment + 1 < geometry.length; segment += 1) {
          if (properCross(previous, next, geometry[segment], geometry[segment + 1])) { conflict = true; break; }
        }
      }
      for (let later = featureIndex + 1; later < original.length && !conflict; later += 1) {
        const geometry = original[later].geometry;
        for (let segment = 0; segment + 1 < geometry.length; segment += 1) {
          if (properCross(previous, next, geometry[segment], geometry[segment + 1])) { conflict = true; break; }
        }
      }
      if (conflict) { rejected.add(best); continue; }
      work.splice(best, 1);
      rejected.clear();
    }
    final.push({ preKey: original[featureIndex].preKey, geometry: work.map(({ xM, yM }) => point(xM, yM)) });
  }
  return { ok: true, value: final };
}
const m03Forward = auditM03ReachDomain(
  [{ preKey: "A", geometry: A }, { preKey: "B", geometry: B }], 125,
);
const m03Shuffled = auditM03ReachDomain(
  [{ preKey: "B", geometry: B }, { preKey: "A", geometry: A }], 125,
);

function orientation(a, b, c) {
  const value = (b.xM - a.xM) * (c.yM - a.yM) - (b.yM - a.yM) * (c.xM - a.xM);
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}
function properCross(a, b, c, d) {
  return orientation(a, b, c) * orientation(a, b, d) < 0 &&
    orientation(c, d, a) * orientation(c, d, b) < 0;
}
function forcedReverseM03() {
  const bFinal = [B[0], B[2]];
  const aChordCrossesBFinal = properCross(A[0], A[2], bFinal[0], bFinal[1]);
  return { A: aChordCrossesBFinal ? A : [A[0], A[2]], B: bFinal };
}
const m03ForcedReverse = forcedReverseM03();

function ringSignedArea2(ring) {
  let area2 = 0;
  for (let index = 0; index + 1 < ring.length; index += 1) {
    area2 += ring[index].xM * ring[index + 1].yM - ring[index + 1].xM * ring[index].yM;
  }
  return area2;
}

function ringAreaM2(ring) {
  let area2 = 0;
  for (let index = 0; index + 1 < ring.length; index += 1) {
    area2 += ring[index].xM * ring[index + 1].yM - ring[index + 1].xM * ring[index].yM;
  }
  return area2 / 2;
}

// Literal v2 inputs and expectations, independent of production extraction.
// Pairs are [cell, primary receiver]; -1 marks the closed floor.
function closedDefinition(width, height, pairs, eligible) {
  const n = width * height;
  const primary = Array(n).fill(-1), landMask = Array(n).fill(0);
  const kinds = Array(n).fill(0), ordinals = Array(n).fill(-1), splitArea = Array(n).fill(0);
  for (const [cell, receiver] of pairs) { primary[cell] = receiver; landMask[cell] = 1; }
  const floor = pairs.find(([, receiver]) => receiver === -1)[0];
  kinds[floor] = 3; ordinals[floor] = 0;
  for (const cell of eligible) splitArea[cell] = 125_000;
  return { width, height, primary, landMask, kinds, ordinals, splitArea, owners: [floor],
    captureReleasedAliases: true, topologicalOrder: pairs.map(([cell]) => cell), persistenceAreaM2: 125_000, minReachLengthMeters: 1000 };
}
const CLOSED_CHAIN = [[0, 1], [1, 2], [2, 3], [3, -1]];
const CLOSED_CASES = [
  { name: "noEligible", definition: closedDefinition(4, 1, CLOSED_CHAIN, []),
    total: 250_000, terminalLocal: 250_000, nodes: 0, reaches: [], owners: [-2,-2,-2,-2] },
  { name: "floorOnly", definition: closedDefinition(4, 1, CLOSED_CHAIN, [3]),
    total: 250_000, terminalLocal: 250_000, nodes: 1, reaches: [], owners: [-2,-2,-2,-2] },
  { name: "indegreeOne", definition: closedDefinition(4, 1, CLOSED_CHAIN, [0]),
    total: 250_000, terminalLocal: 62_500, nodes: 2, reaches: [[0,3,187_500,187_500]], owners: [0,0,0,-2] },
  { name: "twoBranch", definition: closedDefinition(3, 1, [[0,1],[2,1],[1,-1]], [0,2]),
    total: 187_500, terminalLocal: 62_500, nodes: 3, reaches: [[0,1,62_500,62_500],[2,1,62_500,62_500]], owners: [0,-2,2] },
  { name: "unequalUpstreamConfluence", definition: closedDefinition(5, 3,
      [[0,1],[1,6],[2,6],[6,7],[7,8],[4,9],[9,8],[8,-1]], [0,2,4]),
    total: 500_000, terminalLocal: 62_500, nodes: 5,
    reaches: [[0,6,125_000,125_000],[2,6,62_500,62_500],[6,8,312_500,125_000],[4,8,125_000,125_000]],
    ownerPairs: [[0,0],[1,0],[2,2],[6,6],[7,6],[4,4],[9,4],[8,-2]] },
  { name: "directFeeder", definition: closedDefinition(3, 3,
      [[0,1],[1,4],[2,5],[5,4],[7,4],[4,-1]], [0,2]),
    total: 375_000, terminalLocal: 125_000, nodes: 3,
    reaches: [[0,4,125_000,125_000],[2,4,125_000,125_000]],
    ownerPairs: [[0,0],[1,0],[2,2],[5,2],[7,-2],[4,-2]] },
  { name: "multibranchSimplification", definition: closedDefinition(5, 3,
      [[0,5],[5,10],[10,11],[11,12],[2,7],[7,12],[4,9],[9,14],[14,13],[13,12],[12,-1]], [0,2,4]),
    total: 687_500, terminalLocal: 62_500, nodes: 4,
    reaches: [[0,12,250_000,250_000],[2,12,125_000,125_000],[4,12,250_000,250_000]],
    ownerPairs: [[0,0],[5,0],[10,0],[11,0],[2,2],[7,2],[4,4],[9,4],[14,4],[13,4],[12,-2]] },
];
function cellPoint(definition, cell) {
  return point((cell % definition.width + 0.5) * 250,
    (definition.height - Math.floor(cell / definition.width) - 0.5) * 250);
}
function closedBehavior(fixture, run) {
  const value = run.value, def = fixture.definition;
  if (!value || value.nodes.length !== fixture.nodes || value.reaches.length !== fixture.reaches.length ||
      value.terminals.length !== 1 || value.catchments.length !== 1 || value.catchments[0].areaM2 !== fixture.total ||
      !samePoint(value.terminals[0].point, cellPoint(def, def.owners[0]))) return false;
  if (value.nodes.filter(n => n.kind === "terminal").length !== (fixture.nodes ? 1 : 0)) return false;
  if (new Set(value.nodes.map(n => JSON.stringify(n.point))).size !== value.nodes.length) return false;
  return fixture.reaches.every(([up, down, total, local]) => {
    const reach = reachByEndpoints(value, cellPoint(def, up), cellPoint(def, down));
    const next = fixture.reaches.find(([source]) => source === down);
    const nextReach = next && reachByEndpoints(value, cellPoint(def, next[0]), cellPoint(def, next[1]));
    return reach?.contributingAreaM2 === total && reach?.localContributingAreaM2 === local &&
      reach.downstreamReachId === (nextReach?.id ?? null) && reach.lengthMeters > 0 && reach.geometry.length >= 2 &&
      new Set(reach.geometry.map(p => JSON.stringify(p))).size === reach.geometry.length &&
      reach.upstreamNodeId !== reach.downstreamNodeId;
  });
}
function conserved(value) {
  if (!value) return false;
  return value.reaches.every(reach => Math.abs(reach.contributingAreaM2 - reach.localContributingAreaM2 -
    value.reaches.filter(up => up.downstreamReachId === reach.id).reduce((sum, up) => sum + up.contributingAreaM2, 0)) <= 0.01) &&
    value.catchments.every(c => {
      const terminal = value.terminals.find(t => t.id === c.terminalId);
      const reaches = value.reaches.filter(r => r.catchmentId === c.id);
      return Math.abs(c.areaM2 - terminal.localContributingAreaM2 - reaches.filter(r => r.downstreamReachId === null)
        .reduce((sum,r) => sum + r.contributingAreaM2, 0)) <= 0.01 &&
        Math.abs(c.areaM2 - terminal.localContributingAreaM2 - reaches.reduce((sum,r) => sum + r.localContributingAreaM2, 0)) <= 0.01;
    });
}
const OCEAN_MERGE = { width: 3, height: 2, landMask: [0,1,0,1,1,0],
  primary: [-1,4,-1,4,-1,-1], kinds: [0,0,0,0,1,0], ordinals: [-1,-1,-1,-1,0,-1], owners: [4],
  topologicalOrder: [1,3,4], splitArea: [0,62_500,0,62_500,187_500,0], persistenceAreaM2: 62_500 };
const oceanMerge = runSynthetic(OCEAN_MERGE);
// A/B/C/D expectations are literal physical fixtures, never graph-derived.
// Node identity is checked by point/kind; canonical ID order is not flow order.
const C_FEEDER = { width: 3, height: 2, landMask: [0,1,0,1,1,0],
  primary: [-1,4,-1,4,-1,-1], kinds: [0,0,0,0,2,0], ordinals: [-1,-1,-1,-1,0,-1], owners: [4],
  topologicalOrder: [1,3,4], splitArea: [0,125_000,0,62_500,187_500,0], persistenceAreaM2: 125_000 };
const D_FEEDER = { width: 3, height: 2, landMask: [0,1,0,1,1,1],
  primary: [-1,4,-1,4,-1,4], kinds: [0,0,0,0,2,0], ordinals: [-1,-1,-1,-1,0,-1], owners: [4],
  topologicalOrder: [1,3,5,4], splitArea: [0,125_000,0,125_000,250_000,62_500], persistenceAreaM2: 125_000 };
const BOUNDARY_CASES = [
  { name: "externalC", state: "C", definition: { ...F1, persistenceAreaM2: 250_000 },
    terminal: point(1125,0), total: 312_500, terminalLocal: 0,
    nodes: [[point(875,125),"source"],[point(1125,0),"terminal"]],
    reaches: [[point(875,125),point(1125,0),312_500,312_500]],
    support: [0,0,0,1,1], owned: [[0,3],[1,3],[2,3],[3,3],[4,3]] },
  { name: "externalB", state: "B", definition: { ...F1, persistenceAreaM2: 312_500 },
    terminal: point(1125,0), total: 312_500, terminalLocal: 0,
    nodes: [[point(1125,125),"source"],[point(1125,0),"terminal"]],
    reaches: [[point(1125,125),point(1125,0),312_500,312_500,125]],
    support: [0,0,0,0,1], owned: [[0,4],[1,4],[2,4],[3,4],[4,4]] },
  { name: "externalA", state: "A", definition: { ...F1, persistenceAreaM2: 312_501 },
    terminal: point(1125,0), total: 312_500, terminalLocal: 312_500, nodes: [], reaches: [],
    support: [0,0,0,0,0], owned: [[0,-2],[1,-2],[2,-2],[3,-2],[4,-2]] },
  { name: "oceanD", state: "D", definition: OCEAN_MERGE,
    terminal: point(500,125), total: 187_500, terminalLocal: 0,
    nodes: [[point(375,375),"source"],[point(125,125),"source"],[point(375,125),"confluence"],[point(500,125),"terminal"]],
    reaches: [[point(375,375),point(375,125),62_500,62_500],
      [point(125,125),point(375,125),62_500,62_500], [point(375,125),point(500,125),187_500,62_500,125]],
    support: [0,1,0,1,1,0], owned: [[1,1],[3,3],[4,4]] },
  { name: "oceanB", state: "B", definition: { ...OCEAN_MERGE, persistenceAreaM2: 187_500 },
    terminal: point(500,125), total: 187_500, terminalLocal: 0,
    nodes: [[point(375,125),"source"],[point(500,125),"terminal"]],
    reaches: [[point(375,125),point(500,125),187_500,187_500,125]],
    support: [0,0,0,0,1,0], owned: [[1,4],[3,4],[4,4]] },
  { name: "oceanA", state: "A", definition: { ...OCEAN_MERGE, persistenceAreaM2: 187_501 },
    terminal: point(500,125), total: 187_500, terminalLocal: 187_500, nodes: [], reaches: [],
    support: [0,0,0,0,0,0], owned: [[1,-2],[3,-2],[4,-2]] },
  { name: "externalCFeeder", state: "C", definition: C_FEEDER,
    terminal: point(375,0), total: 187_500, terminalLocal: 0,
    nodes: [[point(375,375),"source"],[point(375,0),"terminal"]],
    reaches: [[point(375,375),point(375,0),187_500,187_500]],
    support: [0,1,0,0,1,0], owned: [[1,1],[3,1],[4,1]] },
  { name: "externalDFeeder", state: "D", definition: D_FEEDER,
    terminal: point(375,0), total: 250_000, terminalLocal: 0,
    nodes: [[point(375,375),"source"],[point(125,125),"source"],[point(375,125),"confluence"],[point(375,0),"terminal"]],
    reaches: [[point(375,375),point(375,125),62_500,62_500],
      [point(125,125),point(375,125),62_500,62_500],[point(375,125),point(375,0),250_000,125_000,125]],
    support: [0,1,0,1,1,0], owned: [[1,1],[3,3],[4,4],[5,4]] },
];
// Same primary catchment; split-flow inputs discriminate closure/eligibility
// from primary total measurement in both directions.
BOUNDARY_CASES.push(
  { ...BOUNDARY_CASES[6], name: "ineligibleOwnerClosureC", definition: { ...C_FEEDER,
    splitArea: [0,125_000,0,62_500,62_500,0] } },
  { ...BOUNDARY_CASES[7], name: "ineligibleOwnerClosureD", definition: { ...D_FEEDER,
    splitArea: [0,125_000,0,125_000,62_500,62_500] } },
  { ...BOUNDARY_CASES[4], name: "splitEligiblePrimarySmallerB", definition: { ...OCEAN_MERGE,
    splitArea: [0,62_500,0,62_500,250_000,0], persistenceAreaM2: 200_000 } },
  { ...BOUNDARY_CASES[2], name: "primaryLargeSplitIneligibleA", definition: { ...F1,
    splitArea: [62_500,62_500,62_500,62_500,62_500], persistenceAreaM2: 312_500 } },
);
for (const f of BOUNDARY_CASES) f.definition = { ...f.definition, captureReleasedAliases: true, minReachLengthMeters: 1000 };
function boundaryBehavior(f, run) {
  const v = run.value;
  if (!v || v.terminals.length !== 1 || v.catchments.length !== 1 ||
      v.nodes.length !== f.nodes.length || v.reaches.length !== f.reaches.length ||
      !samePoint(v.terminals[0].point,f.terminal) || v.catchments[0].areaM2 !== f.total ||
      v.terminals[0].localContributingAreaM2 !== f.terminalLocal || !conserved(v)) return false;
  if (!f.nodes.every(([p,kind]) => v.nodes.some(n => n.kind === kind && samePoint(n.point,p)))) return false;
  return f.reaches.every(([up,down,total,local,length]) => {
    const r = reachByEndpoints(v,up,down);
    const next = f.reaches.find(([p]) => samePoint(p,down));
    const nextReach = next && reachByEndpoints(v,next[0],next[1]);
    return r?.contributingAreaM2 === total && r?.localContributingAreaM2 === local &&
      r.downstreamReachId === (nextReach?.id ?? null) && r.lengthMeters > 0 &&
      (length === undefined || (r.lengthMeters === length && exactPointArray(r.geometry,[up,down]))) &&
      r.geometry.length >= 2 && samePoint(r.geometry[0],up) && samePoint(r.geometry.at(-1),down) &&
      new Set(r.geometry.map(p => JSON.stringify(p))).size === r.geometry.length;
  });
}
function boundaryOwnership(f, run) {
  return run.result?.ok === true && f.owned.every(([cell,owner]) => {
    const actual = run.accounting?.assignment[cell];
    if (owner === -2) return actual === -2;
    const reach = run.value.reaches[actual];
    const node = run.value.nodes.find(n => n.id === reach?.upstreamNodeId);
    return samePoint(node?.point,cellPoint(f.definition,owner));
  });
}
const boundaryRuns = BOUNDARY_CASES.map(f => runSynthetic(f.definition));
const boundaryChecks = {};
for (const [i,f] of BOUNDARY_CASES.entries()) {
  const run = boundaryRuns[i];
  boundaryChecks[f.name + "Literal"] = boundaryBehavior(f,run);
  boundaryChecks[f.name + "ExactlyOnceOwnership"] = boundaryOwnership(f,run);
  boundaryChecks[f.name + "SupportAndEligibility"] = run.result?.ok === true &&
    exactArray(run.accounting.support,f.support) &&
    f.owned.every(([cell]) => run.accounting.eligible[cell] ===
      ((f.definition.splitArea[cell] >= f.definition.persistenceAreaM2) ? 1 : 0)) &&
    (f.state !== "B" || run.accounting.eligible[f.definition.owners[0]] === 1) &&
    exactArray(run.accounting.primary,f.definition.primary) &&
    exactArray(run.accounting.splitArea,f.definition.splitArea) &&
    f.owned.every(([cell]) => run.accounting.catchment[cell] === 0);
  const terminalNode = run.value?.nodes.find(n => n.kind === "terminal");
  boundaryChecks[f.name + "TerminalDegree"] = run.result?.ok === true &&
    run.value.reaches.filter(r => r.downstreamNodeId === terminalNode?.id).length === (f.state === "A" ? 0 : 1) &&
    run.value.reaches.every(r => r.upstreamNodeId !== terminalNode?.id);
  const reverse = runSynthetic({ ...f.definition, fillOrder: "reverse" });
  const pointOrder = (a,b) => a.xM - b.xM || a.yM - b.yM;
  const literalNodes = [...f.nodes].sort(([a],[b]) => pointOrder(a,b));
  const literalReaches = [...f.reaches].sort(([a],[b]) => pointOrder(a,b));
  boundaryChecks[f.name + "CanonicalFillOrder"] = run.result?.ok === true &&
    JSON.stringify(run.value) === JSON.stringify(reverse.value) &&
    run.value.nodes.every((n,i) => n.id === id("drainage-node",i) &&
      samePoint(n.point,literalNodes[i]?.[0]) && n.kind === literalNodes[i]?.[1]) &&
    run.value.reaches.every((r,i) => r.id === id("drainage-reach",i) &&
      samePoint(run.value.nodes.find(n => n.id === r.upstreamNodeId)?.point,literalReaches[i]?.[0]));
  const n = f.definition.width * f.definition.height;
  boundaryChecks[f.name + "ExactPeakAndRelease"] = run.result?.ok === true &&
    run.after.peakBytes === 88 * n + 4 && run.after.liveBytes === 26 * n &&
    run.releasedAliases.length === 14 && run.releasedAliases.every(a => a.byteLength === 0);
}
const boundarySiblingOrders = [[3,[3,1,4]],[7,[5,3,1,4]],[9,[3,5,1,4]]];
boundaryChecks.boundarySiblingOrderInvariant = boundarySiblingOrders.every(([i,topologicalOrder]) =>
  JSON.stringify(runSynthetic({ ...BOUNDARY_CASES[i].definition,topologicalOrder }).value) === JSON.stringify(boundaryRuns[i].value));
const boundaryBoundRuns = [];
for (const i of [1,3,4,7]) {
  const f = BOUNDARY_CASES[i];
  for (const [property,limit,path] of [["maxNodes",f.nodes.length - 1,"drainage.maxNodes"],
    ["maxReaches",f.reaches.length - 1,"drainage.maxReaches"]]) {
    const rejected = runWithPushGuard({ ...f.definition,[property]: limit },
      v => v && typeof v === "object" && (property === "maxNodes" ?
        Number.isSafeInteger(v.cell) && ["source","confluence","terminal"].includes(v.kind) :
        Number.isSafeInteger(v.measurementCell) && Number.isSafeInteger(v.transientOrdinal)),limit);
    const exact = runSynthetic({ ...f.definition,[property]: limit + 1 });
    boundaryChecks[f.name + property + "Bound"] = rejected.guardTrips === 0 &&
      resultError(rejected.result)?.code === "M02_BOUND_EXCEEDED" && resultError(rejected.result)?.path === path &&
      boundaryBehavior(f,exact);
    boundaryBoundRuns.push({ fixture: f.name,property,error: resultError(rejected.result),guardTrips: rejected.guardTrips });
  }
}

const closedSiblingOrder = runSynthetic({ ...CLOSED_CASES[5].definition, topologicalOrder: [7,2,5,0,1,4] });
const closedRuns = CLOSED_CASES.map(f => runSynthetic(f.definition));
const closedChecks = {};
for (let i = 0; i < CLOSED_CASES.length; i += 1) {
  const fixture = CLOSED_CASES[i], run = closedRuns[i];
  closedChecks[fixture.name + "BehavioralLiteral"] = closedBehavior(fixture, run);
  closedChecks[fixture.name + "TerminalLiteral"] = run.value?.terminals[0]?.localContributingAreaM2 === fixture.terminalLocal;
  closedChecks[fixture.name + "Conservation"] = conserved(run.value);
  const owners = fixture.ownerPairs ?? fixture.owners.map((owner,cell) => [cell,owner]);
  closedChecks[fixture.name + "ExactCellOwnership"] = run.result?.ok === true &&
    owners.length === fixture.definition.landMask.filter(v => v === 1).length &&
    owners.every(([cell, owner]) => {
      const actual = run.accounting?.assignment[cell];
      if (owner === -2) return actual === -2;
      const reach = run.value?.reaches[actual];
      const node = run.value?.nodes.find(n => n.id === reach?.upstreamNodeId);
      return samePoint(node?.point, cellPoint(fixture.definition,owner));
    });
  closedChecks[fixture.name + "RoutingAndMembershipUnchanged"] = run.result?.ok === true &&
    exactArray(run.accounting.primary, fixture.definition.primary) &&
    exactArray(run.accounting.splitArea, fixture.definition.splitArea) &&
    fixture.definition.landMask.every((land,cell) => run.accounting.catchment[cell] === (land ? 0 : -1));
  const reverse = runSynthetic({ ...fixture.definition, fillOrder: "reverse" });
  closedChecks[fixture.name + "FillOrder"] = run.result?.ok === true && JSON.stringify(run.value) === JSON.stringify(reverse.value);
}

// Each source mutant must load, violate a positive literal or a focused
// corruption refusal, and restore the exact original bytes in finally.
const v2MutationResults = {};
const fixtureFailures = () => {
  const results = CLOSED_CASES.map(f => runSynthetic(f.definition));
  const failed = results.map((r,i) => !closedBehavior(CLOSED_CASES[i],r) ||
    r.value?.terminals[0]?.localContributingAreaM2 !== CLOSED_CASES[i].terminalLocal || !conserved(r.value));
  return { detected: failed.some(Boolean), detail: { failed: CLOSED_CASES.filter((_,i) => failed[i]).map(f => f.name) } };
};
const beforeFinal = "  // Final physical identity sort uses the finalized geometry, not the domain-2";
const beforeValidation = "  // Measurement reads are complete. Reuse primaryArea for independent checks,";
const replace = replaceSourceExactlyOnce;
const mutationsV2 = {
  closedFloorAnchor: source => replace(source,
    'downstream.kind === "confluence" || closedTerminal ? previous : current',
    'downstream.kind === "confluence" ? previous : current'),
  floorAssignedIncoming: source => replace(source,
    'firstReachAssignment[owners.terminalOwnerCells[ordinal]] = -2 - ordinal;',
    'firstReachAssignment[owners.terminalOwnerCells[ordinal]] = reaches.find(r => r.downstreamCell === owners.terminalOwnerCells[ordinal])?.transientOrdinal ?? -2 - ordinal;'),
  dropDirectFeeder: source => replace(source,
    'terminals[terminalOrdinal].localContributingAreaM2 += scratch.cellAreaM2;',
    'if (cell === owners.terminalOwnerCells[terminalOrdinal]) terminals[terminalOrdinal].localContributingAreaM2 += scratch.cellAreaM2;'),
  hardCodeOneCell: source => replace(source, beforeFinal,
    '  for (const terminal of terminals) terminal.localContributingAreaM2 = scratch.cellAreaM2;\n' + beforeFinal),
  duplicateTerminalCell: source => replace(source,
    'terminals[terminalOrdinal].localContributingAreaM2 += scratch.cellAreaM2;',
    'terminals[terminalOrdinal].localContributingAreaM2 += 2 * scratch.cellAreaM2;'),
  artificialColocatedTwin: source => replace(source,
    'const terminalMerge = representedIndegree[cell] >= 2 && !samePoint(cellCenter, terminal.point);',
    'const terminalMerge = representedIndegree[cell] >= 2;'),
  singlePointConnector: source => replace(source, '    reach.geometry = geometry;',
    '    reach.geometry = terminals[reach.terminalOrdinal].kind === "retained_closed_basin" ? [geometry[geometry.length - 1]] : geometry;'),
  zeroLengthConnector: source => replace(source, '    reach.geometry = geometry;',
    '    reach.geometry = terminals[reach.terminalOrdinal].kind === "retained_closed_basin" ? [geometry[geometry.length - 1], geometry[geometry.length - 1]] : geometry;'),
  siblingContinuation: source => replace(source, beforeValidation,
    '  if (terminals[0]?.kind === "retained_closed_basin" && persistentReaches.length > 1) {\n' +
    '    (persistentReaches[0] as { downstreamReachId: string | null }).downstreamReachId = persistentReaches[1].id;\n  }\n' + beforeValidation),
  deleteGenuineShortReach: source => replace(source, '  const links: TerrainRetainedDepressionDrainageLink[] = [];',
    '  for (let i = persistentReaches.length - 1; i >= 0; i -= 1) { if (persistentReaches[i].lengthMeters < constants.drainage.minReachLengthMeters) persistentReaches.splice(i, 1); }\n  const links: TerrainRetainedDepressionDrainageLink[] = [];'),
};
for (const [name, mutate] of Object.entries(mutationsV2)) {
  v2MutationResults[name] = await runDrainageSourceMutation(name, mutate, fixtureFailures);
}
// Independent measurement-corruption probes distinguish actual cell witnesses
// from numerically equivalent residual formulas on otherwise consistent data.
const reachFault = '  primaryArea[reaches[0].measurementCell] += 1;\n';
const terminalFault = '  (catchments[0] as { areaM2: number }).areaM2 += 1;\n';
const beforeLocal = '  // Local-area witnesses are complete before the domain-2 ID barrier.';
const reachPath = "drainage.reaches.localContributingAreaM2", terminalPath = "terminals.localContributingAreaM2";
const probe = expectedPath => {
  const result = runSynthetic(CLOSED_CASES[2].definition).result;
  return { detected: resultError(result)?.path === expectedPath, detail: { error: resultError(result) ?? null } };
};
const independentReachProbe = await runDrainageSourceMutation("independent-reach-probe",
  source => replace(source,beforeLocal,reachFault + beforeLocal), () => probe(reachPath));
const independentTerminalProbe = await runDrainageSourceMutation("independent-terminal-probe",
  source => replace(source,beforeLocal,terminalFault + beforeLocal), () => probe(terminalPath));
for (const [name, fault, residual, path] of [
  ["residualReachLocal", reachFault,
    '  for (const reach of reaches) { let upstream = 0; for (const r of reaches) { if (r !== reach && r.downstreamCell === reach.upstreamCell) upstream += primaryArea[r.measurementCell]; } reach.localAreaM2 = primaryArea[reach.measurementCell] - upstream; }\n', reachPath],
  ["residualTerminalLocal", terminalFault,
    '  for (let ordinal = 0; ordinal < terminals.length; ordinal += 1) { let incoming = 0; for (const r of reaches) { if (r.terminalOrdinal === ordinal && nodes[r.downstreamNodeOrdinal].kind === "terminal") incoming += primaryArea[r.measurementCell]; } terminals[ordinal].localContributingAreaM2 = catchments[ordinal].areaM2 - incoming; }\n', terminalPath],
]) {
  v2MutationResults[name] = await runDrainageSourceMutation(name,
    source => replace(replace(source,beforeLocal,fault + beforeLocal),beforeFinal,residual + beforeFinal),
    () => { const outcome = probe(path); return { detected: !outcome.detected, detail: outcome.detail }; });
}
// A +1 m² corruption must be refused at reach conservation, even when closed.
const corruptReach = '  if (persistentReaches[0]) (persistentReaches[0] as { contributingAreaM2: number }).contributingAreaM2 += 1;\n';
const strongReachProbe = await runDrainageSourceMutation("strong-reach-probe",
  source => replace(source,beforeValidation,corruptReach + beforeValidation), () => probe(reachPath));
v2MutationResults.weakenClosedReachConservation = await runDrainageSourceMutation("weakenClosedReachConservation",
  source => replace(replace(source,beforeValidation,corruptReach + beforeValidation),
    'Math.abs(reach.contributingAreaM2 - primaryArea[ordinal]) > constants.validation.areaToleranceM2',
    'terminals[reaches[ordinal].terminalOrdinal].kind !== "retained_closed_basin" && Math.abs(reach.contributingAreaM2 - primaryArea[ordinal]) > constants.validation.areaToleranceM2'),
  () => { const outcome = probe(reachPath); return { detected: !outcome.detected, detail: outcome.detail }; });
const terminalCorruption = delta => `  terminals[0].localContributingAreaM2 += ${delta};\n`;
const strongTerminalProbes = [];
for (const delta of [-1, 1]) {
  strongTerminalProbes.push(await runDrainageSourceMutation(`strong-terminal-${delta}`,
    source => replace(source,beforeValidation,terminalCorruption(delta) + beforeValidation), () => probe(terminalPath)));
}
v2MutationResults.weakenTerminalInequality = await runDrainageSourceMutation("weakenTerminalInequality",
  source => replace(replace(source,beforeValidation,terminalCorruption(1) + beforeValidation),
    'Math.abs(catchments[ordinal].areaM2 - local - primaryArea[ordinal]) > constants.validation.areaToleranceM2',
    'catchments[ordinal].areaM2 - local - primaryArea[ordinal] > constants.validation.areaToleranceM2'),
  () => { const outcome = probe(terminalPath); return { detected: !outcome.detected, detail: outcome.detail }; });
const reverseAccountingProbe = await runDrainageSourceMutation("reverse-accounting-order", source => {
  const start = source.indexOf(beforeLocal), end = source.indexOf(beforeFinal);
  if (start < 0 || end <= start) return undefined;
  const segment = source.slice(start,end).replaceAll('for (let cell = 0; cell < cellCount; cell += 1)',
    'for (let cell = cellCount - 1; cell >= 0; cell -= 1)');
  return source.slice(0,start) + segment + source.slice(end);
}, () => ({ detected: CLOSED_CASES.every((fixture,i) =>
  JSON.stringify(runSynthetic(fixture.definition).value) === JSON.stringify(closedRuns[i].value)) }));
const v2MutationChecks = Object.fromEntries(Object.entries(v2MutationResults)
  .map(([name,r]) => [name + "MutantKilled", r.applied && r.detected && r.restored]));
v2MutationChecks.independentWitnessProbes = [independentReachProbe,independentTerminalProbe,strongReachProbe,...strongTerminalProbes]
  .every(r => r.applied && r.detected && r.restored);

// Runtime refusal probes use valid loaded authority and explicit corruptions.
// These must fail on the old base even though its area equations still balance.
const boundaryEraseFault = `  nodes.length = 0;
  reaches.length = 0;
  firstReachAssignment.fill(-1);
`;
const boundaryCompensatedFault = `  if (persistentReaches[0]) {
  terminals[0].localContributingAreaM2 += 1;
  persistentReaches[0] = { ...persistentReaches[0],
    contributingAreaM2: persistentReaches[0].contributingAreaM2 - 1,
    localContributingAreaM2: persistentReaches[0].localContributingAreaM2 - 1 };
  }
`;
function boundaryRefusal(definition,path) {
  const r = runSynthetic(definition);
  return { detected: r.result?.ok === false && resultError(r.result)?.path === path,
    detail: { ok: r.result?.ok, error: resultError(r.result) ?? null } };
}
const boundarySupportProbe = await runDrainageSourceMutation("boundary-support-erased",
  s => replace(s,beforeLocal,boundaryEraseFault + beforeLocal),
  () => boundaryRefusal(BOUNDARY_CASES[0].definition,"drainage.support"));
const boundaryZeroProbe = await runDrainageSourceMutation("boundary-compensated-local",
  s => replace(s,beforeValidation,boundaryCompensatedFault + beforeValidation),
  () => boundaryRefusal(BOUNDARY_CASES[0].definition,"terminals.localContributingAreaM2"));
const boundaryEligibilityProbe = await runDrainageSourceMutation("boundary-ineligible-entry",
  s => replace(s,'  const nodes: NodeCandidate[] = [];',
    '  persistentEligible[owners.terminalOwnerCells[0]] = 0;\n  const nodes: NodeCandidate[] = [];'),
  () => boundaryRefusal(BOUNDARY_CASES[1].definition,"drainage.sources"));
for (const [name,r] of Object.entries({ boundarySupportProbe,boundaryZeroProbe,boundaryEligibilityProbe })) {
  boundaryChecks[name] = r.applied && r.detected && r.restored;
}

// Worst-case T=N uses at most N reach slots even though B needs 2N nodes.
const manyBoundaryDefinition = { ...F10_MANY_TERMINALS, persistenceAreaM2: 62_500, captureReleasedAliases: true,
  maxNodes: 32, maxReaches: 16, minReachLengthMeters: 1000 };
const manyBoundaryRun = runSynthetic(manyBoundaryDefinition);
const manyBoundaryMirrorGuard = runWithArrayLengthGuard(manyBoundaryDefinition,16);
boundaryChecks.allCellsBoundaryEntriesBounded = manyBoundaryRun.result?.ok === true &&
  manyBoundaryRun.value.nodes.length === 32 && manyBoundaryRun.value.reaches.length === 16 &&
  manyBoundaryRun.value.terminals.length === 16 && manyBoundaryRun.value.catchments.length === 16 &&
  manyBoundaryRun.value.nodes.filter(n => n.kind === "source").length === 16 &&
  manyBoundaryRun.value.reaches.every(r => r.lengthMeters === 125 && r.contributingAreaM2 === 62_500 &&
    r.localContributingAreaM2 === 62_500 && r.downstreamReachId === null) &&
  manyBoundaryRun.value.terminals.every(t => t.localContributingAreaM2 === 0) &&
  conserved(manyBoundaryRun.value) && manyBoundaryRun.after.peakBytes === 1472 &&
  manyBoundaryRun.after.liveBytes === 416 && manyBoundaryRun.releasedAliases.every(a => a.byteLength === 0) &&
  manyBoundaryMirrorGuard.result?.ok === true && manyBoundaryMirrorGuard.guardTrips === 0 &&
  resultError(runSynthetic({ ...manyBoundaryDefinition,maxNodes: 31 }).result)?.path === "drainage.maxNodes" &&
  resultError(runSynthetic({ ...manyBoundaryDefinition,maxReaches: 15 }).result)?.path === "drainage.maxReaches";
const boundaryTinyZeroProbe = await runDrainageSourceMutation("boundary-subtolerance-local",
  s => replace(s,beforeValidation,boundaryCompensatedFault.replaceAll('+= 1','+= 0.001').replaceAll('- 1','- 0.001') + beforeValidation),
  () => boundaryRefusal(BOUNDARY_CASES[0].definition,"terminals.localContributingAreaM2"));
boundaryChecks.boundaryExactZeroBelowAreaTolerance = boundaryTinyZeroProbe.applied && boundaryTinyZeroProbe.loaded &&
  boundaryTinyZeroProbe.executed && boundaryTinyZeroProbe.detected && boundaryTinyZeroProbe.restored;

const boundaryMutationResults = {};
function boundaryFailures() {
  const failed = [];
  for (const f of BOUNDARY_CASES) {
    const r = runSynthetic(f.definition);
    if (!boundaryBehavior(f,r) || !boundaryOwnership(f,r)) {
      failed.push({ fixture: f.name, error: resultError(r.result) ?? null,
        nodes: r.value?.nodes.length, reaches: r.value?.reaches.length });
    }
  }
  return { detected: failed.length > 0, detail: { failed } };
}
const boundarySourceLine = 'const terminalSource = representedIndegree[cell] === 0 && !samePoint(cellCenter, terminal.point);';
const boundaryMergeLine = 'const terminalMerge = representedIndegree[cell] >= 2 && !samePoint(cellCenter, terminal.point);';
const boundaryGeometryMutant = geometry => s => replace(s,'    reach.geometry = geometry;',
  `    reach.geometry = reach.upstreamCell === reach.downstreamCell && terminals[reach.terminalOrdinal].kind !== "retained_closed_basin" ? ${geometry} : geometry;`);
const boundaryMutations = {
  restoreTerminalOnlyB: s => replace(s,boundarySourceLine,'const terminalSource = false;'),
  suppressOwnerSource: s => replace(s,'      if (terminalMerge || terminalSource) {','      if (terminalMerge) {'),
  confluenceOnlyPairing: s => replace(s,
    'node.kind !== "terminal" && scratch.terminalOrdinalByCell[node.cell] >= 0',
    'node.kind === "confluence" && scratch.terminalOrdinalByCell[node.cell] >= 0'),
  eraseSupportedTopology: s => replace(s,beforeLocal,boundaryEraseFault + beforeLocal),
  labelBConfluence: s => replace(s,'kind: terminalSource ? "source" : "confluence"','kind: "confluence"'),
  unnecessaryCOwnerNode: s => replace(s,boundaryMergeLine,
    'const terminalMerge = representedIndegree[cell] >= 1 && !samePoint(cellCenter, terminal.point);'),
  collapseDIntoTerminal: s => replace(s,boundaryMergeLine,'const terminalMerge = false;'),
  singlePointBoundary: boundaryGeometryMutant('[geometry[0]]'),
  zeroLengthBoundary: boundaryGeometryMutant('[geometry[0],geometry[0]]'),
  repeatedPointBoundary: boundaryGeometryMutant('[geometry[0],geometry[0],geometry[geometry.length - 1]]'),
  epsilonBoundary: boundaryGeometryMutant('[geometry[0],{ xM: geometry[0].xM, yM: geometry[0].yM + 0.000001 }]'),
  delete125MeterBoundary: s => replace(s,'  const links: TerrainRetainedDepressionDrainageLink[] = [];',
    '  for (let i = persistentReaches.length - 1; i >= 0; i -= 1) { if (persistentReaches[i].lengthMeters === 125 && persistentReaches[i].lengthMeters < constants.drainage.minReachLengthMeters) persistentReaches.splice(i,1); }\n  const links: TerrainRetainedDepressionDrainageLink[] = [];'),
  wrongBOwnerAnchor: s => replace(s,'        measurementCell: upstream.cell,',
    '        measurementCell: upstream.kind === "source" ? Math.max(0,upstream.cell - 1) : upstream.cell,'),
  wrongIncomingDAnchor: s => replace(s,
    'const measurementCell = downstream.kind === "confluence" || closedTerminal ? previous : current;',
    'const measurementCell = downstream.kind === "confluence" && scratch.terminalOrdinalByCell[current] < 0 || closedTerminal ? previous : current;'),
  dropOwnerLocal: s => replace(s,'      reaches[firstReachAssignment[cell]].localAreaM2 += scratch.cellAreaM2;',
    '      if (scratch.terminalOrdinalByCell[cell] < 0) reaches[firstReachAssignment[cell]].localAreaM2 += scratch.cellAreaM2;'),
  duplicateOwnerLocal: s => replace(s,'      reaches[firstReachAssignment[cell]].localAreaM2 += scratch.cellAreaM2;',
    '      reaches[firstReachAssignment[cell]].localAreaM2 += scratch.cellAreaM2 * (scratch.terminalOrdinalByCell[cell] >= 0 ? 2 : 1);'),
  dropBelowThresholdFeeder: s => replace(s,'      reaches[firstReachAssignment[current]].localAreaM2 += scratch.cellAreaM2;',
    '      reaches[firstReachAssignment[current]].localAreaM2 += 0;'),
  duplicateBelowThresholdFeeder: s => replace(s,'      reaches[firstReachAssignment[current]].localAreaM2 += scratch.cellAreaM2;',
    '      reaches[firstReachAssignment[current]].localAreaM2 += 2 * scratch.cellAreaM2;'),
  primaryAreaEligibility: s => replace(s,
    'if (scratch.landMask[cell] === 1 && flow.contributingAreaM2[cell] >= constants.drainage.persistenceAreaM2)',
    'if (scratch.landMask[cell] === 1 && primaryArea[cell] >= constants.drainage.persistenceAreaM2)'),
  splitAreaMeasurement: s => replace(s,'      contributingAreaM2: primaryArea[reach.measurementCell],',
    '      contributingAreaM2: flow.contributingAreaM2[reach.measurementCell],'),
  compensatedRepresentedTerminalLocal: s => replace(s,beforeValidation,boundaryCompensatedFault + beforeValidation),
};
for (const [name,mutate] of Object.entries(boundaryMutations)) {
  boundaryMutationResults[name] = await runDrainageSourceMutation(name,mutate,boundaryFailures);
}
// Pair each weakened validator with a corruption the strong validator rejects.
// A kill requires the weakened authority to accept, not merely a different error.
const boundaryStrongProbes = { support: boundarySupportProbe, exactZero: boundaryZeroProbe, eligibility: boundaryEligibilityProbe };
const boundaryResidualFault = `  primaryArea[owners.terminalOwnerCells[0]] += 1;
  (catchments[0] as { areaM2: number }).areaM2 += 1;
`;
const boundaryResidualFormula = `  for (const reach of reaches) {
    let incoming = 0;
    for (const up of reaches) {
      if (nodes[up.downstreamNodeOrdinal].kind !== "terminal" && up.downstreamCell === reach.upstreamCell) incoming += primaryArea[up.measurementCell];
    }
    reach.localAreaM2 = primaryArea[reach.measurementCell] - incoming;
  }
`;
boundaryStrongProbes.independentLocal = await runDrainageSourceMutation("boundary-independent-local-probe",
  s => replace(s,beforeLocal,boundaryResidualFault + beforeLocal),
  () => boundaryRefusal(BOUNDARY_CASES[1].definition,reachPath));
boundaryMutationResults.residualDerivedBLocal = await runDrainageSourceMutation("residual-derived-B-local",
  s => replace(replace(s,beforeLocal,boundaryResidualFault + beforeLocal),beforeFinal,boundaryResidualFormula + beforeFinal),
  () => { const r = runSynthetic(BOUNDARY_CASES[1].definition); return { detected: r.result?.ok === true,
    detail: { ok: r.result?.ok, error: resultError(r.result) ?? null, local: r.value?.reaches[0]?.localContributingAreaM2 } }; });
const incomingOnlyFault = `  const corruptOrdinal = persistentReaches.findIndex(r => r.downstreamReachId !== null);
  (persistentReaches[corruptOrdinal] as { contributingAreaM2: number }).contributingAreaM2 += 1;
`;
boundaryStrongProbes.universalConservation = await runDrainageSourceMutation("boundary-universal-probe",
  s => replace(s,beforeValidation,incomingOnlyFault + beforeValidation),
  () => boundaryRefusal(BOUNDARY_CASES[3].definition,reachPath));
boundaryMutationResults.weakenUniversalConservation = await runDrainageSourceMutation("weaken-universal-conservation",
  s => replace(replace(s,beforeValidation,incomingOnlyFault + beforeValidation),
    'Math.abs(reach.contributingAreaM2 - primaryArea[ordinal]) > constants.validation.areaToleranceM2','false'),
  () => { const r = runSynthetic(BOUNDARY_CASES[3].definition); return { detected: r.result?.ok === true,
    detail: { ok: r.result?.ok, error: resultError(r.result) ?? null } }; });
const reconciliationLoop = '  for (const localWitnesses of [false, true]) {';
for (const [name,field,replacementLoop] of [
  ["terminalReachingEquation","contributingAreaM2",'  for (const localWitnesses of [true]) {'],
  ["allReachLocalEquation","localContributingAreaM2",'  for (const localWitnesses of [false]) {'],
]) {
  const fault = `  (persistentReaches[0] as { ${field}: number }).${field} += 1;\n`;
  boundaryStrongProbes[name] = await runDrainageSourceMutation(name + "-strong",
    s => replace(s,reconciliationLoop,fault + reconciliationLoop),
    () => boundaryRefusal(BOUNDARY_CASES[1].definition,terminalPath));
  boundaryMutationResults["weaken" + name] = await runDrainageSourceMutation(name + "-weakened",
    s => replace(s,reconciliationLoop,fault + replacementLoop),
    () => { const r = runSynthetic(BOUNDARY_CASES[1].definition); return { detected: r.result?.ok === true,
      detail: { ok: r.result?.ok, error: resultError(r.result) ?? null } }; });
}
boundaryMutationResults.weakenExactBoundaryZero = await runDrainageSourceMutation("weaken-exact-boundary-zero",
  s => replace(replace(s,beforeValidation,boundaryCompensatedFault + beforeValidation),
    'representedSupport[owners.terminalOwnerCells[ordinal]] === 1 && local !== 0','false'),
  () => { const r = runSynthetic(BOUNDARY_CASES[0].definition); return { detected: r.result?.ok === true,
    detail: { ok: r.result?.ok, error: resultError(r.result) ?? null, terminalLocal: r.value?.terminals[0]?.localContributingAreaM2 } }; });
for (const [name,needle,replacement,property,limit] of [
  ["nodeBoundUnderCount",'(terminalMerge || terminalSource ? 2 : 1)','(terminalMerge ? 2 : 1)',"maxNodes",1],
  ["reachBoundOffByOne",'reaches.length >= constants.drainage.maxReaches','reaches.length > constants.drainage.maxReaches',"maxReaches",0],
]) {
  boundaryMutationResults[name] = await runDrainageSourceMutation(name,s => replace(s,needle,replacement),
    () => {
      const r = runWithPushGuard({ ...BOUNDARY_CASES[1].definition,[property]: limit },
        v => v && typeof v === "object" && (property === "maxNodes" ? Number.isSafeInteger(v.cell) &&
          ["source","confluence","terminal"].includes(v.kind) : Number.isSafeInteger(v.measurementCell)),limit);
      return { detected: r.guardTrips > 0, detail: { guardTrips: r.guardTrips, thrown: r.thrown } };
    });
}
const boundaryReverseAccounting = await runDrainageSourceMutation("boundary-reverse-accounting",s => {
  const start = s.indexOf(beforeLocal), end = s.indexOf(beforeFinal);
  if (start < 0 || end <= start) return undefined;
  return s.slice(0,start) + s.slice(start,end).replaceAll('for (let cell = 0; cell < cellCount; cell += 1)',
    'for (let cell = cellCount - 1; cell >= 0; cell -= 1)') + s.slice(end);
}, () => ({ detected: BOUNDARY_CASES.every((f,i) => {
  const r = runSynthetic(f.definition);
  return JSON.stringify(r.value) === JSON.stringify(boundaryRuns[i].value) && boundaryOwnership(f,r);
}) }));
for (const [name,r] of Object.entries(boundaryMutationResults)) {
  boundaryChecks[name + "BoundaryMutantKilled"] = r.applied && r.loaded && r.executed && r.detected && r.restored;
}
boundaryChecks.boundaryStrongIndependentProbes = Object.values(boundaryStrongProbes)
  .every(r => r.applied && r.loaded && r.executed && r.detected && r.restored);
boundaryChecks.boundaryReverseAccounting = boundaryReverseAccounting.applied && boundaryReverseAccounting.loaded &&
  boundaryReverseAccounting.executed && boundaryReverseAccounting.detected && boundaryReverseAccounting.restored;

const sharedF1Point = modules.depressions?.terminalPointCoordinates?.(
  4, modules.scratch?.TERRAIN_TERMINAL_EXTERNAL_DOMAIN_OUTLET, f1.fixture.grid,
);

const checks = {
  ...boundaryChecks,
  ...closedChecks,
  ...v2MutationChecks,
  terminalLocalReverseAccumulationInvariant: reverseAccountingProbe.applied && reverseAccountingProbe.detected && reverseAccountingProbe.restored,
  unrepresentedMixedTerminalWholeCatchments: f8Donut.value?.reaches.length === 0 &&
    exactArray(f8Donut.value.terminals.map(t => t.localContributingAreaM2), [62_500,562_500]) && conserved(f8Donut.value),
  closedSiblingOrderInvariant: JSON.stringify(closedSiblingOrder.value) === JSON.stringify(closedRuns[5].value),
  closedPredecessorSurvivesSimplification: closedRuns[2].value?.reaches[0]?.geometry.length === 2 &&
    closedRuns[2].value.reaches[0].contributingAreaM2 === 187_500 &&
    reachByEndpoints(closedRuns[6].value,point(625,625),point(625,125))?.geometry.length === 2,
  representedBoundaryTerminalLocalZero: [f1.value,f2.value,f3.value,f3TerminalOwnerMerge.value,oceanMerge.value]
    .every(v => v?.terminals.every(t => t.localContributingAreaM2 === 0) && conserved(v)),
  oceanBoundaryBehavior: oceanMerge.value?.nodes.length === 4 && oceanMerge.value?.reaches.length === 3 &&
    samePoint(oceanMerge.value.terminals[0].point, point(500,125)) &&
    reachByEndpoints(oceanMerge.value, point(375,125), point(500,125))?.contributingAreaM2 === 187_500,

  authorityPersistentDrainageExtractor: hasAuthority && modules.loadError === undefined,
  r004ConsumesFinalCoastlineAuthority:
    resultError(f1BadCoastline.result)?.code === "M02_CANDIDATE_INVALID" &&
    resultError(f1BadCoastline.result)?.path === "coastline",
  r005SharedPureTerminalPoint:
    sharedF1Point?.x === 1125 && sharedF1Point?.y === 0 && samePoint(f1Terminal?.point, point(1125, 0)),

  f1LiteralPlanar:
    f1.result?.ok === true && f1.value?.terminals.length === 1 && f1.value?.catchments.length === 1 &&
    f1.value?.nodes.length === 2 && f1.value?.reaches.length === 1 &&
    f1Terminal?.id === id("terminal", 0) && f1Terminal?.kind === "external_domain_outlet" &&
    samePoint(f1Terminal?.point, point(1125, 0)) &&
    f1.value.catchments[0].id === id("catchment", 0) && f1.value.catchments[0].terminalId === f1Terminal.id &&
    f1Terminal.catchmentId === f1.value.catchments[0].id && f1.value.catchments[0].areaM2 === 312_500 &&
    samePoint(f1Source?.point, point(375, 125)) && f1Source?.kind === "source" &&
    f1Reach?.downstreamReachId === null && f1Reach?.terminalId === f1Terminal.id &&
    f1Reach?.catchmentId === f1.value.catchments[0].id && f1Reach?.contributingAreaM2 === 312_500 &&
    f1Reach?.localContributingAreaM2 === 312_500,

  f2LiteralRidgePartition:
    f2.result?.ok === true && f2.value?.terminals.length === 2 && f2.value?.catchments.length === 2 &&
    f2.value?.nodes.length === 4 && f2.value?.reaches.length === 2 && f2Sources.length === 2 &&
    samePoint(f2.value.terminals[0].point, point(0, 125)) &&
    samePoint(f2.value.terminals[1].point, point(1375, 0)) &&
    samePoint(f2Sources[0]?.point, point(625, 125)) && samePoint(f2Sources[1]?.point, point(875, 125)) &&
    f2.value.catchments.every((catchment) => catchment.areaM2 === 187_500) &&
    f2.value.reaches.every((reach) => reach.contributingAreaM2 === 187_500 &&
      reach.localContributingAreaM2 === 187_500 && reach.downstreamReachId === null) &&
    f2.value.reaches[0].terminalId !== f2.value.reaches[1].terminalId,

  f3LiteralYConfluence:
    f3.result?.ok === true && f3.value?.terminals.length === 1 && f3.value?.catchments.length === 1 &&
    f3.value?.nodes.filter((node) => node.kind === "source").length === 2 &&
    f3.value?.nodes.filter((node) => node.kind === "confluence").length === 1 &&
    f3.value?.nodes.length === 4 && f3.value?.reaches.length === 3 &&
    samePoint(f3.value.terminals[0].point, point(875, 0)) && f3.value.catchments[0].areaM2 === 312_500 &&
    f3TribA?.contributingAreaM2 === 62_500 && f3TribA?.localContributingAreaM2 === 62_500 &&
    f3TribB?.contributingAreaM2 === 62_500 && f3TribB?.localContributingAreaM2 === 62_500 &&
    f3Trunk?.contributingAreaM2 === 312_500 && f3Trunk?.localContributingAreaM2 === 187_500 &&
    f3TribA?.downstreamReachId === f3Trunk?.id && f3TribB?.downstreamReachId === f3Trunk?.id &&
    f3Trunk?.downstreamReachId === null &&
    f3Trunk?.contributingAreaM2 === f3Trunk?.localContributingAreaM2 +
      f3TribA?.contributingAreaM2 + f3TribB?.contributingAreaM2,

  terminalOwnerMergePreservesConfluenceBeforeBoundaryTerminal:
    f3TerminalOwnerMerge.result?.ok === true &&
    f3TerminalOwnerMerge.value?.terminals.length === 1 && f3TerminalOwnerMerge.value?.catchments.length === 1 &&
    f3TerminalOwnerMerge.value?.nodes.filter((node) => node.kind === "source").length === 2 &&
    f3TerminalOwnerMerge.value?.nodes.filter((node) => node.kind === "confluence").length === 1 &&
    f3TerminalOwnerMerge.value?.nodes.filter((node) => node.kind === "terminal").length === 1 &&
    f3TerminalOwnerMerge.value?.nodes.length === 4 && f3TerminalOwnerMerge.value?.reaches.length === 3 &&
    samePoint(f3TerminalOwnerMerge.value.terminals[0].point, point(375, 0)) &&
    f3TerminalOwnerMerge.value.catchments[0].areaM2 === 3 * CELL_AREA &&
    f3TerminalMergeTribA?.contributingAreaM2 === CELL_AREA && f3TerminalMergeTribA?.localContributingAreaM2 === CELL_AREA &&
    f3TerminalMergeTribB?.contributingAreaM2 === CELL_AREA && f3TerminalMergeTribB?.localContributingAreaM2 === CELL_AREA &&
    f3TerminalMergeTrunk?.contributingAreaM2 === 3 * CELL_AREA && f3TerminalMergeTrunk?.localContributingAreaM2 === CELL_AREA &&
    f3TerminalMergeTribA?.downstreamReachId === f3TerminalMergeTrunk?.id &&
    f3TerminalMergeTribB?.downstreamReachId === f3TerminalMergeTrunk?.id &&
    f3TerminalMergeTrunk?.downstreamReachId === null &&
    f3TerminalMergeTrunk?.contributingAreaM2 === f3TerminalMergeTrunk?.localContributingAreaM2 +
      f3TerminalMergeTribA?.contributingAreaM2 + f3TerminalMergeTribB?.contributingAreaM2,

  criticalShortReachSurvivesMinLength:
    f3TribA && f3TribB && f3.value?.reaches.length === 3 &&
    f3TribA.lengthMeters < F3.minReachLengthMeters && f3TribB.lengthMeters < F3.minReachLengthMeters,

  areaOnlyEligibilityIgnoresRawRelief:
    f1.result?.ok === true && f1ReliefChanged.result?.ok === true &&
    JSON.stringify(structuralGraph(f1.value)) === JSON.stringify(structuralGraph(f1ReliefChanged.value)),
  thresholdEntryExact:
    f1ThresholdAt.value?.nodes.some((node) => node.kind === "source" && samePoint(node.point, point(375, 125))) === true &&
    f1ThresholdBelow.value?.nodes.some((node) => node.kind === "source" && samePoint(node.point, point(625, 125))) === true,

  primaryFullAreaAndLocalConservation:
    f1Reach?.contributingAreaM2 === 5 * CELL_AREA && f1Reach?.localContributingAreaM2 === 5 * CELL_AREA &&
    f3Trunk?.contributingAreaM2 === 5 * CELL_AREA && f3Trunk?.localContributingAreaM2 === 3 * CELL_AREA,
  independentLocalWitnessUsesCellAssignment: independentLocalWitnessSourceGuard(DRAINAGE_SOURCE),
  oldTerminalOwnerMergeMutantKilled:
    oldTerminalOwnerMergeMutation.applied && oldTerminalOwnerMergeMutation.detected && oldTerminalOwnerMergeMutation.restored,
  droppedOffSupportCellMutantKilled:
    droppedOffSupportMutation.applied && droppedOffSupportMutation.detected && droppedOffSupportMutation.restored,
  incomingConfluenceAssignmentMutantKilled:
    incomingConfluenceAssignmentMutation.applied && incomingConfluenceAssignmentMutation.detected && incomingConfluenceAssignmentMutation.restored,
  residualLocalAreaMutantKilled:
    residualLocalAreaMutation.applied && residualLocalAreaMutation.detected && residualLocalAreaMutation.restored,
  terminalCatchmentBijectionAndPartition:
    [f1.value, f2.value, f3.value].every((value) => value && value.terminals.length === value.catchments.length &&
      value.terminals.length <= 1_000_000 &&
      value.catchments.reduce((sum, catchment) => sum + catchment.areaM2, 0) ===
        value.catchments.reduce((sum, catchment) => sum +
          catchment.boundaryRings.reduce((ringSum, ring) => ringSum + ringAreaM2(ring), 0), 0) &&
      value.terminals.every((terminal) => value.catchments.filter((catchment) => catchment.id === terminal.catchmentId &&
        catchment.terminalId === terminal.id).length === 1)),
  representedSupportTopology:
    f1.value?.nodes.filter((node) => node.kind === "source").length === 1 &&
    f3.value?.nodes.filter((node) => node.kind === "confluence").length === 1,

  f4OwnerBypassRejected:
    resultError(f4OwnerBypass.result)?.code === "M02_TERMINAL_INVALID",

  f8LiteralCatchmentM03DomainSchedulePresent: f8LiteralDomain1Structure,
  f8GridToleranceSpecializationExact,

  f8CanonicalOuterOuterHoleOrder: (() => {
    const external = f8Donut.value?.terminals.find((terminal) => terminal.kind === "external_domain_outlet");
    const catchment = external && f8Donut.value?.catchments.find((candidate) => candidate.id === external.catchmentId);
    if (!catchment || catchment.boundaryRings.length !== 3) return false;
    const [mainOuter, disconnectedOuter, hole] = catchment.boundaryRings;
    return ringSignedArea2(mainOuter) > 0 && ringSignedArea2(disconnectedOuter) > 0 && ringSignedArea2(hole) < 0 &&
      exactPointArray(mainOuter, [point(0, 250), point(750, 250), point(750, 1000), point(0, 1000), point(0, 250)]) &&
      exactPointArray(disconnectedOuter, [point(750, 0), point(1000, 0), point(1000, 250), point(750, 250), point(750, 0)]) &&
      exactPointArray(hole, [point(250, 500), point(250, 750), point(500, 750), point(500, 500), point(250, 500)]);
  })(),

  g6Positive004B05Persistence:
    g6.decision?.ok === true && g6.decision.value.selectedFacet === null &&
    g6.decision.value.terminalReceiverOrdinal === 5 && g6.decision.value.receivers.length === 0 &&
    (98 - 97) / 250 === 0.004 && g6.flowResult?.ok === true && g6.value?.terminals.length === 9 &&
    g6.value?.catchments.length === 9 &&
    g6.value.terminals.some((terminal) => terminal.kind === "external_domain_outlet" &&
      samePoint(terminal.point, point(375, 750)) &&
      g6.value.catchments.some((catchment) => catchment.id === terminal.catchmentId && catchment.terminalId === terminal.id)),

  f6RetainedClosedLink:
    f6.drainageResult?.ok === true && f6.value?.retainedDepressionLinks.length === 1 &&
    f6.value.retainedDepressionLinks[0].depressionToken === "depression-analysis:0000000000000000" &&
    f6.value.terminals.find((terminal) => terminal.id === f6.value.retainedDepressionLinks[0].terminalId)?.kind === "retained_closed_basin" &&
    f6.value.retainedDepressionLinks[0].catchmentId ===
      f6.value.terminals.find((terminal) => terminal.id === f6.value.retainedDepressionLinks[0].terminalId)?.catchmentId,
  f7RetainedExorheicLink:
    f7.drainageResult?.ok === true && f7.value?.retainedDepressionLinks.length === 1 &&
    f7.value.retainedDepressionLinks[0].depressionToken === "depression-analysis:0000000000000000" &&
    f7.value.terminals.find((terminal) => terminal.id === f7.value.retainedDepressionLinks[0].terminalId)?.kind === "external_domain_outlet",

  traversalFillOrderInvariant:
    f1.result?.ok === true && f1ReverseFill.result?.ok === true &&
    JSON.stringify(f1.value) === JSON.stringify(f1ReverseFill.value) &&
    f3SiblingOrder.result?.ok === true && JSON.stringify(f3.value) === JSON.stringify(f3SiblingOrder.value),
  m03CanonicalDomainSchedule:
    m03Forward?.ok === true && m03Forward.value.length === 2 &&
    m03Forward.value[0].preKey === "A" && exactPointArray(m03Forward.value[0].geometry, A) &&
    m03Forward.value[1].preKey === "B" && exactPointArray(m03Forward.value[1].geometry, [B[0], B[2]]),
  m03ProducerShuffleInvariant:
    m03Forward?.ok === true && m03Shuffled?.ok === true && JSON.stringify(m03Forward.value) === JSON.stringify(m03Shuffled.value),
  m03ForcedReverseDiscriminates:
    exactPointArray(m03ForcedReverse.A, [A[0], A[2]]) && exactPointArray(m03ForcedReverse.B, [B[0], B[2]]) &&
    JSON.stringify(m03ForcedReverse.A) !== JSON.stringify(A),

  idBarriersAndNamespaces:
    f1Terminal?.id === id("terminal", 0) && f1.value?.catchments[0].id === id("catchment", 0) &&
    f1.value?.nodes.every((node, index) => node.id === id("drainage-node", index)) &&
    f1.value?.reaches.every((reach, index) => reach.id === id("drainage-reach", index)),
  dagCycleRejected:
    resultError(f3Cycle.result)?.code === "M02_DRAINAGE_CYCLE",
  invalidReceiverRejected:
    resultError(f3InvalidReceiver.result)?.code === "M02_DRAINAGE_CYCLE",
  task9Firewall:
    exactKeys(f1.value, ["terminals", "catchments", "nodes", "reaches", "retainedDepressionLinks"]),

  f10ReleasedAliasesAreDetached:
    f10ReleaseAliases.result?.ok === true && f10ReleaseAliases.releasedAliases.length === 14 &&
    f10ReleaseAliases.releasedAliases.every((array) => array.byteLength === 0),
  f10CatchmentGeometryBoundedBeforeJsMaterialization:
    f10CatchmentBoundGuard.guardTrips === 0 && f10CatchmentBoundGuard.result?.ok === true &&
    f10CatchmentBoundGuard.value?.catchments[0]?.boundaryRings[0]?.length === 5,
  f10ReachGeometryBoundedBeforeJsMaterialization:
    f10ReachBoundGuard.guardTrips === 0 && f10ReachBoundGuard.result?.ok === true &&
    f10ReachBoundGuard.value?.reaches[0]?.geometry.length === 2,
  f10NoPerTerminalJsMirror:
    f10TerminalMirrorGuard.guardTrips === 0 && f10TerminalMirrorGuard.result?.ok === true &&
    f10TerminalMirrorGuard.value?.terminals.length === 16 && f10TerminalMirrorGuard.value?.catchments.length === 16,
  f10NodeBoundCheckedBeforeJsMaterialization:
    f10NodeBoundGuard.guardTrips === 0 && resultError(f10NodeBoundGuard.result)?.code === "M02_BOUND_EXCEEDED" &&
    resultError(f10NodeBoundGuard.result)?.path === "drainage.maxNodes",
  f10NoGenericArrayCopyPrimitivesAtRuntime:
    f10ArrayCopyGuard.trips.length === 0 && f10ArrayCopyGuard.result?.ok === true,
  f10NoGenericArrayCopyPrimitivesInTask8Source:
    f10ForbiddenCopySourceMatches.length === 0,

  exactTask8PeakAndRelease:
    f1.before?.liveBytes === 66 * 5 + 4 && f1.after?.peakBytes === 88 * 5 + 4 &&
    f1.after?.liveBytes === 26 * 5 && f1ReleaseProbe.ok === true,
  task8AtomicPreflightLeavesAuthorityUntouched:
    f1Preflight.before?.liveBytes === 66 * 5 + 4 && f1Preflight.before?.peakBytes === 66 * 5 + 4 &&
    resultError(f1Preflight.result)?.code === "M02_BOUND_EXCEEDED" &&
    f1Preflight.after?.liveBytes === f1Preflight.before.liveBytes &&
    f1Preflight.after?.peakBytes === f1Preflight.before.peakBytes,
  exactWorstCase92NFormula:
    (88 * 864_000 + 4 * 864_000) === 79_488_000,
};

const report = {
  audit: "world-m0-m02-drainage-graph",
  authorityPresent: hasAuthority,
  loadError: modules.loadError ?? null,
  checks,
  evidence: {
    boundary: BOUNDARY_CASES.map((f,i) => ({ name: f.name, state: f.state, error: resultError(boundaryRuns[i].result), graph: boundaryRuns[i].value, accounting: boundaryRuns[i].accounting })),
    boundaryBoundRuns, boundarySupportProbe, boundaryZeroProbe, boundaryEligibilityProbe,
    boundaryMutationResults, boundaryStrongProbes, boundaryReverseAccounting, boundaryTinyZeroProbe,
    manyBoundaryPeak: manyBoundaryRun.after,
    v2MutationResults, reverseAccountingProbe, independentReachProbe, independentTerminalProbe, strongReachProbe, strongTerminalProbes,
    closed: CLOSED_CASES.map((f,i) => ({ name: f.name, error: resultError(closedRuns[i].result), graph: closedRuns[i].value })),
    f1Error: resultError(f1.result) ?? null,
    f2Error: resultError(f2.result) ?? null,
    f3Error: resultError(f3.result) ?? null,
    f3TerminalOwnerMergeError: resultError(f3TerminalOwnerMerge.result) ?? null,
    oldTerminalOwnerMergeMutation,
    droppedOffSupportMutation,
    incomingConfluenceAssignmentMutation,
    residualLocalAreaMutation,
    f3CycleError: resultError(f3Cycle.result) ?? null,
    f3InvalidReceiverError: resultError(f3InvalidReceiver.result) ?? null,
    f4OwnerBypassError: resultError(f4OwnerBypass.result) ?? null,
    f8DonutError: resultError(f8Donut.result) ?? null,
    f10CatchmentBoundGuard: { trips: f10CatchmentBoundGuard.guardTrips, thrown: f10CatchmentBoundGuard.thrown ?? null },
    f10ReachBoundGuard: { trips: f10ReachBoundGuard.guardTrips, thrown: f10ReachBoundGuard.thrown ?? null, error: resultError(f10ReachBoundGuard.result) ?? null },
    f10TerminalMirrorGuard: { trips: f10TerminalMirrorGuard.guardTrips, thrown: f10TerminalMirrorGuard.thrown ?? null },
    f10NodeBoundGuard: { trips: f10NodeBoundGuard.guardTrips, thrown: f10NodeBoundGuard.thrown ?? null },
    f10ArrayCopyGuard: { trips: f10ArrayCopyGuard.trips, thrown: f10ArrayCopyGuard.thrown ?? null },
    f10ForbiddenCopySourceMatches,
    f8LiteralDomain1Structure,
    f8GridToleranceSpecializationExact,
    f1BadCoastlineError: resultError(f1BadCoastline.result) ?? null,
    f1PreflightError: resultError(f1Preflight.result) ?? null,
    f6Error: resultError(f6.drainageResult) ?? resultError(f6.flowResult) ?? resultError(f6.depressionResult) ?? null,
    f7Error: resultError(f7.drainageResult) ?? resultError(f7.flowResult) ?? resultError(f7.depressionResult) ?? null,
    task8F1Before: f1.before ?? null,
    task8F1After: f1.after ?? null,
    m03Canonical: resultValue(m03Forward) ?? null,
    m03ForcedReverse,
  },
};
report.pass = Object.values(checks).every(Boolean);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;
