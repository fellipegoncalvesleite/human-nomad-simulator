import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const ROOT = process.cwd();
const modulePath = `${ROOT}/src/sim/world/physical/canonicalTerrainHydro.ts`;
const server = await createServer({ root: `${ROOT}/src`, configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error" });
let canonical;
try { if (existsSync(modulePath)) canonical = await server.ssrLoadModule("/sim/world/physical/canonicalTerrainHydro.ts"); } catch {} finally { await server.close(); }

const id = (namespace, ordinal) => `${namespace}:${ordinal.toString(16).padStart(16, "0")}`;
const p = (xM, yM) => ({ xM, yM });
const ring = (x, y) => [p(x, y), p(x + 8, y), p(x + 8, y + 8), p(x, y + 8), p(x, y)];
const rings = (x, y) => [ring(x + 10, y), ring(x, y)];
const squareRing = (x, y, size) => [p(x, y), p(x + size, y), p(x + size, y + size), p(x, y + size), p(x, y)];
const cellRing = (x, y) => squareRing(x, y, 250);
const cellRings = (x, y) => [cellRing(x + 500, y), cellRing(x, y)];
const ids = {
  province: [id("province", 0), id("province", 1)], terminal: [id("terminal", 0), id("terminal", 1)], catchment: [id("catchment", 0), id("catchment", 1)],
  node: [id("drainage-node", 0), id("drainage-node", 1)], reach: [id("drainage-reach", 0), id("drainage-reach", 1)], basin: [id("depression-basin", 0), id("depression-basin", 1)],
  valley: [id("valley", 0), id("valley", 1)], floodplain: [id("floodplain", 0), id("floodplain", 1)], crossing: [id("crossing", 0), id("crossing", 1)],
};
const candidate = {
  schema: "world-m0-terrain-hydro-candidate/v3", recipeDigest: `sha256:${"11".repeat(32)}`,
  physicalConstants: { id: "physical:constants", version: "v1", digest: `sha256:${"22".repeat(32)}` },
  physicalGeneratorVersion: "physical:v1", repairPolicyVersion: "repair:v1", numericKernelVersion: "numeric:v1",
  analysis: { cellSizeMeters: 250, width: 1200, height: 720, boundaryModel: "finite_open_outflow", flowAlgorithm: "d_infinity_v1" },
  provenanceProvinces: [
    { id: ids.province[1], family: "orogenic_uplift", center: p(20, 20), radiusXM: 11.5, radiusYM: 12.5, axisAngleRadians: 0.25, influenceRadiusM: 21.5, elevationOffsetMeters: 2.5, reliefMultiplier: 1.25 },
    { id: ids.province[0], family: "stable_denudational", center: p(10, 10), radiusXM: 10.5, radiusYM: 11.5, axisAngleRadians: 0.125, influenceRadiusM: 20.5, elevationOffsetMeters: -1.5, reliefMultiplier: 0.75 },
  ],
  strategicTerrain: [1, 0].map((n) => ({
    cell: { row: n, column: 0 }, landOceanClass: n ? "mixed" : "land", landAreaM2: 50000 + n, oceanAreaM2: 12500 - n,
    elevationMinMeters: -1.5 + n, elevationMaxMeters: 20.5 + n, elevationMeanMeters: 7.25 + n, localReliefMeters: 22.5 + n,
    slopeMean: 0.125 + n / 100, coastlineLengthMeters: 250.5 + n,
    provenanceFractions: [{ provinceId: ids.province[1], areaFraction: 0.25 }, { provinceId: ids.province[0], areaFraction: 0.75 }],
    catchmentIds: [...ids.catchment].reverse(), reachIds: [...ids.reach].reverse(), depressionBasinIds: [...ids.basin].reverse(), valleyCandidateIds: [...ids.valley].reverse(), floodplainCandidateIds: [...ids.floodplain].reverse(), crossingCandidateIds: [...ids.crossing].reverse(),
  })),
  coastline: [[p(0, 250), p(125, 0)], [p(0, 0), p(250, 0)]],
  terminals: [{ id: ids.terminal[1], kind: "retained_closed_basin", point: p(375, 125), catchmentId: ids.catchment[1], localContributingAreaM2: 125_000 }, { id: ids.terminal[0], kind: "ocean_outlet", point: p(20, 10), catchmentId: ids.catchment[0], localContributingAreaM2: 0 }],
  catchments: [{ id: ids.catchment[1], terminalId: ids.terminal[1], areaM2: 125000.5, boundaryRings: cellRings(250, 0) }, { id: ids.catchment[0], terminalId: ids.terminal[0], areaM2: 62500.5, boundaryRings: cellRings(0, 0) }],
  drainageNodes: [{ id: ids.node[1], point: p(40, 10), kind: "terminal", terminalId: ids.terminal[1] }, { id: ids.node[0], point: p(10, 10), kind: "source", terminalId: null }],
  drainageReaches: [
    { id: ids.reach[1], upstreamNodeId: ids.node[1], downstreamNodeId: ids.node[0], downstreamReachId: ids.reach[0], catchmentId: ids.catchment[1], terminalId: ids.terminal[1], geometry: [p(30, 10), p(35, 11), p(40, 10)], lengthMeters: 10.5, contributingAreaM2: 125000.5, localContributingAreaM2: 62500.25, meanTerrainGradient: 0.02, localReliefMeters: 3.5, channelIncisionMeters: 1.5 },
    { id: ids.reach[0], upstreamNodeId: ids.node[0], downstreamNodeId: ids.node[1], downstreamReachId: null, catchmentId: ids.catchment[0], terminalId: ids.terminal[0], geometry: [p(10, 10), p(15, 11), p(20, 10)], lengthMeters: 10.25, contributingAreaM2: 62500.5, localContributingAreaM2: 31250.25, meanTerrainGradient: 0.01, localReliefMeters: 2.5, channelIncisionMeters: 1.25 },
  ],
  depressionBasins: [{ id: ids.basin[1], catchmentId: ids.catchment[1], floorPoint: p(375, 125), floorElevationMeters: -2.5, spillElevationMeters: null, outletTerminalId: null, closedEndorheic: true, areaM2: 3000.5, boundaryRings: [cellRing(250, 0)] }, { id: ids.basin[0], catchmentId: ids.catchment[0], floorPoint: p(125, 125), floorElevationMeters: -1.5, spillElevationMeters: 0.5, outletTerminalId: ids.terminal[0], closedEndorheic: false, areaM2: 2000.5, boundaryRings: [cellRing(0, 0)] }],
  valleys: [{ id: ids.valley[1], reachId: ids.reach[1], boundaryRings: rings(20, 60), areaM2: 4000.5, localReliefMeters: 5.5 }, { id: ids.valley[0], reachId: ids.reach[0], boundaryRings: rings(0, 60), areaM2: 3500.5, localReliefMeters: 4.5 }],
  floodplainCandidates: [{ id: ids.floodplain[1], reachId: ids.reach[1], boundaryRings: rings(20, 80), areaM2: 2500.5, terrainSlope: 0.02 }, { id: ids.floodplain[0], reachId: ids.reach[0], boundaryRings: rings(0, 80), areaM2: 1500.5, terrainSlope: 0.01 }],
  crossingCandidates: [
    { id: ids.crossing[1], reachId: ids.reach[1], strategicEdge: { first: { row: 1, column: 0 }, second: { row: 1, column: 1 } }, intersection: p(35, 10), leftBank: p(35, 11), rightBank: p(35, 9), channelIncisionMeters: 1.5, firstApproachSlope: 0.03, secondApproachSlope: 0.04 },
    { id: ids.crossing[0], reachId: ids.reach[0], strategicEdge: { first: { row: 0, column: 0 }, second: { row: 0, column: 1 } }, intersection: p(15, 10), leftBank: p(15, 11), rightBank: p(15, 9), channelIncisionMeters: 1.25, firstApproachSlope: 0.01, secondApproachSlope: 0.02 },
  ],
  deterministicProvenance: { repairOperationCount: 2, conditionedDepressionCount: 1, retainedDepressionCount: 1 },
};

const goldenCandidate = {
  ...structuredClone(candidate),
  provenanceProvinces: [], strategicTerrain: [], coastline: [], terminals: [], catchments: [], drainageNodes: [],
  drainageReaches: [], depressionBasins: [], valleys: [], floodplainCandidates: [], crossingCandidates: [],
  deterministicProvenance: { repairOperationCount: 0, conditionedDepressionCount: 0, retainedDepressionCount: 0 },
};
const EXPECTED_CANONICAL_TEXT =
  `{"schema":"world-m0-terrain-hydro-candidate/v3","recipeDigest":"sha256:1111111111111111111111111111111111111111111111111111111111111111",` +
  `"physicalConstants":{"id":"physical:constants","version":"v1","digest":"sha256:2222222222222222222222222222222222222222222222222222222222222222"},` +
  `"physicalGeneratorVersion":"physical:v1","repairPolicyVersion":"repair:v1","numericKernelVersion":"numeric:v1",` +
  `"analysis":{"cellSizeMeters":250,"width":1200,"height":720,"boundaryModel":"finite_open_outflow","flowAlgorithm":"d_infinity_v1"},` +
  `"provenanceProvinces":[],"strategicTerrain":[],"coastline":[],"terminals":[],"catchments":[],"drainageNodes":[],` +
  `"drainageReaches":[],"depressionBasins":[],"valleys":[],"floodplainCandidates":[],"crossingCandidates":[],` +
  `"deterministicProvenance":{"repairOperationCount":0,"conditionedDepressionCount":0,"retainedDepressionCount":0}}`;

const nestedGoldenCandidate = {
  ...structuredClone(goldenCandidate),
  provenanceProvinces: [
    { id: ids.province[1], family: "orogenic_uplift", center: p(2, 2), radiusXM: 2, radiusYM: 3, axisAngleRadians: 0, influenceRadiusM: 4, elevationOffsetMeters: 1, reliefMultiplier: 1 },
    { id: ids.province[0], family: "stable_denudational", center: p(1, 1), radiusXM: 1, radiusYM: 2, axisAngleRadians: 0, influenceRadiusM: 3, elevationOffsetMeters: -1, reliefMultiplier: 0.5 },
  ],
  strategicTerrain: [{
    cell: { row: 0, column: 0 }, landOceanClass: "land", landAreaM2: 50000, oceanAreaM2: 0,
    elevationMinMeters: -1, elevationMaxMeters: 2, elevationMeanMeters: 0, localReliefMeters: 3, slopeMean: 0, coastlineLengthMeters: 250,
    provenanceFractions: [], catchmentIds: [ids.catchment[1], ids.catchment[0]], reachIds: [ids.reach[1], ids.reach[0]],
    depressionBasinIds: [], valleyCandidateIds: [], floodplainCandidateIds: [], crossingCandidateIds: [],
  }],
  coastline: [[p(0, 0), p(250, 0)]],
  catchments: [{ id: ids.catchment[0], terminalId: ids.terminal[0], areaM2: 50000, boundaryRings: [ring(0, 20)] }],
};
const EXPECTED_NESTED_CANONICAL_TEXT =
  `{"schema":"world-m0-terrain-hydro-candidate/v3","recipeDigest":"sha256:1111111111111111111111111111111111111111111111111111111111111111",` +
  `"physicalConstants":{"id":"physical:constants","version":"v1","digest":"sha256:2222222222222222222222222222222222222222222222222222222222222222"},` +
  `"physicalGeneratorVersion":"physical:v1","repairPolicyVersion":"repair:v1","numericKernelVersion":"numeric:v1",` +
  `"analysis":{"cellSizeMeters":250,"width":1200,"height":720,"boundaryModel":"finite_open_outflow","flowAlgorithm":"d_infinity_v1"},` +
  `"provenanceProvinces":[{"id":"province:0000000000000000","family":"stable_denudational","center":{"xM":1,"yM":1},"radiusXM":1,"radiusYM":2,"axisAngleRadians":0,"influenceRadiusM":3,"elevationOffsetMeters":-1,"reliefMultiplier":"f64:3fe0000000000000"},` +
  `{"id":"province:0000000000000001","family":"orogenic_uplift","center":{"xM":2,"yM":2},"radiusXM":2,"radiusYM":3,"axisAngleRadians":0,"influenceRadiusM":4,"elevationOffsetMeters":1,"reliefMultiplier":1}],` +
  `"strategicTerrain":[{"cell":{"row":0,"column":0},"landOceanClass":"land","landAreaM2":50000,"oceanAreaM2":0,"elevationMinMeters":-1,"elevationMaxMeters":2,"elevationMeanMeters":0,"localReliefMeters":3,"slopeMean":0,"coastlineLengthMeters":250,"provenanceFractions":[],` +
  `"catchmentIds":["catchment:0000000000000000","catchment:0000000000000001"],"reachIds":["drainage-reach:0000000000000000","drainage-reach:0000000000000001"],"depressionBasinIds":[],"valleyCandidateIds":[],"floodplainCandidateIds":[],"crossingCandidateIds":[]}],` +
  `"coastline":[[{"xM":0,"yM":0},{"xM":250,"yM":0}]],"terminals":[],` +
  `"catchments":[{"id":"catchment:0000000000000000","terminalId":"terminal:0000000000000000","areaM2":50000,"boundaryRings":[[{"xM":0,"yM":20},{"xM":8,"yM":20},{"xM":8,"yM":28},{"xM":0,"yM":28},{"xM":0,"yM":20}]]}],` +
  `"drainageNodes":[],"drainageReaches":[],"depressionBasins":[],"valleys":[],"floodplainCandidates":[],"crossingCandidates":[],` +
  `"deterministicProvenance":{"repairOperationCount":0,"conditionedDepressionCount":0,"retainedDepressionCount":0}}`;
const encode = (value) => canonical?.encodeCanonicalTerrainHydroCandidate?.(value);
const digestCandidate = async (value) => canonical?.computeTerrainHydroCandidateDigest?.(value);
const text = (result) => result?.ok ? new TextDecoder().decode(result.value) : undefined;
const bytes = (result) => result?.ok ? Buffer.from(result.value).toString("hex") : undefined;
const failure = (result) => result?.ok === false ? result.error : undefined;
const clone = () => structuredClone(candidate);
const baseEncoded = encode(candidate);
const baseDigest = await digestCandidate(candidate);
const goldenEncoded = encode(goldenCandidate);
const goldenDigest = await digestCandidate(goldenCandidate);
const actualText = text(goldenEncoded);
const nestedGoldenEncoded = encode(nestedGoldenCandidate);
const nestedGoldenDigest = await digestCandidate(nestedGoldenCandidate);
const nestedActualText = text(nestedGoldenEncoded);
const expectedDigest = `sha256:${createHash("sha256").update(EXPECTED_CANONICAL_TEXT).digest("hex")}`;
const expectedNestedDigest = `sha256:${createHash("sha256").update(EXPECTED_NESTED_CANONICAL_TEXT).digest("hex")}`;

const reversed = clone();
const registries = ["provenanceProvinces", "strategicTerrain", "coastline", "terminals", "catchments", "drainageNodes", "drainageReaches", "depressionBasins", "valleys", "floodplainCandidates", "crossingCandidates"];
for (const key of registries) reversed[key].reverse();
for (const key of ["catchments", "depressionBasins", "valleys", "floodplainCandidates"]) {
  for (const entity of reversed[key]) entity.boundaryRings.reverse();
}
for (const summary of reversed.strategicTerrain) {
  summary.provenanceFractions.reverse();
  for (const key of ["catchmentIds", "reachIds", "depressionBasinIds", "valleyCandidateIds", "floodplainCandidateIds", "crossingCandidateIds"]) summary[key].reverse();
}
const watchedArrays = registries.map((key) => reversed[key])
  .concat(["catchments", "depressionBasins", "valleys", "floodplainCandidates"].flatMap((key) => reversed[key].map((entity) => entity.boundaryRings)))
  .concat(reversed.strategicTerrain.flatMap((summary) => [summary.provenanceFractions, summary.catchmentIds, summary.reachIds, summary.depressionBasinIds, summary.valleyCandidateIds, summary.floodplainCandidateIds, summary.crossingCandidateIds]));
const watchedElements = watchedArrays.map((value) => [...value]);
const reversedEncoded = encode(reversed);
const reversedDigest = await digestCandidate(reversed);
const callerUnmutated = watchedArrays.every((value, index) => value.length === watchedElements[index].length && value.every((entry, itemIndex) => entry === watchedElements[index][itemIndex]));

const duplicateCases = {
  entityRegistry: ["provenanceProvinces", (value) => { value.provenanceProvinces[1].id = value.provenanceProvinces[0].id; }],
  coastline: ["coastline", (value) => { value.coastline[1] = structuredClone(value.coastline[0]); }],
  strategicTerrain: ["strategicTerrain", (value) => { value.strategicTerrain[1].cell = structuredClone(value.strategicTerrain[0].cell); }],
  provenanceFractions: ["provenanceFractions", (value) => { value.strategicTerrain[0].provenanceFractions[1].provinceId = value.strategicTerrain[0].provenanceFractions[0].provinceId; }],
  referencedIds: ["reachIds", (value) => { value.strategicTerrain[0].reachIds[1] = value.strategicTerrain[0].reachIds[0]; }],
  boundaryRings: ["boundaryRings", (value) => { value.catchments[0].boundaryRings[1] = structuredClone(value.catchments[0].boundaryRings[0]); }],
};
const duplicateChecks = {};
for (const [name, [pathPart, mutate]] of Object.entries(duplicateCases)) {
  const changed = clone(); mutate(changed); const error = failure(encode(changed));
  duplicateChecks[`${name}DuplicateTypedPath`] = error?.code === "M02_CANDIDATE_INVALID" && error.path.includes(pathPart);
}
const reversedReach = clone(); reversedReach.drainageReaches[1].geometry.reverse();
const reversedReachEncoded = encode(reversedReach);
const adjacentBacktracking = clone();
adjacentBacktracking.drainageReaches[0].geometry = [p(10, 10), p(20, 10), p(15, 10)];
const adjacentBacktrackingError = failure(encode(adjacentBacktracking));
const mutations = {
  terminalLocalArea: (value) => { value.terminals[0].localContributingAreaM2 = 125_001; },
  recipeDigest: (value) => { value.recipeDigest = `sha256:${"33".repeat(32)}`; }, physicalConstantsDigest: (value) => { value.physicalConstants.digest = `sha256:${"44".repeat(32)}`; },
  provinceAxis: (value) => { value.provenanceProvinces[0].axisAngleRadians = 0.375; }, provinceFamilyEffect: (value) => { value.provenanceProvinces[0].elevationOffsetMeters = 3.5; },
  terrainValue: (value) => { value.strategicTerrain[0].elevationMeanMeters = 9.5; }, coastlinePoint: (value) => { value.coastline[0][1].xM = 126; },
  terminalKind: (value) => { value.terminals[1].kind = "external_domain_outlet"; }, basinArea: (value) => { value.depressionBasins[0].areaM2 = 3001.5; },
  reachLocalArea: (value) => { value.drainageReaches[0].localContributingAreaM2 = 62501.25; }, crossingGeometry: (value) => { value.crossingCandidates[0].intersection.xM = 36; },
};
const mutationChecks = {};
for (const [name, mutate] of Object.entries(mutations)) {
  const changed = clone(); mutate(changed); const encoded = encode(changed); const changedDigest = await digestCandidate(changed);
  mutationChecks[`${name}ChangesBytesAndDigest`] = encoded?.ok === true && changedDigest?.ok === true && bytes(encoded) !== bytes(baseEncoded) && changedDigest.value !== baseDigest?.value;
}
const forbidden = clone(); forbidden.crossingCandidates[0].knownFord = true;
const forbiddenError = failure(encode(forbidden));
const terminalFieldChecks = {};
for (const [name, mutate] of Object.entries({
  missing: t => { delete t.localContributingAreaM2; }, extra: t => { t.extraAreaM2 = 0; },
  nan: t => { t.localContributingAreaM2 = NaN; }, infinite: t => { t.localContributingAreaM2 = Infinity; },
  negative: t => { t.localContributingAreaM2 = -1; },
})) {
  const changed = clone(); mutate(changed.terminals[0]);
  const error = failure(encode(changed));
  terminalFieldChecks[name + "TerminalFieldRejected"] = error?.code === "M02_CANDIDATE_INVALID" && error.path.includes("terminals");
}
const oldShape = clone(); oldShape.schema = "world-m0-terrain-hydro-candidate/v2";
const terminalGoldenCandidate = { ...structuredClone(goldenCandidate), terminals: [{
  id: "terminal:0000000000000000", kind: "retained_closed_basin", point: { xM: 375, yM: 375 },
  catchmentId: "catchment:0000000000000000", localContributingAreaM2: 125_000,
}] };
const EXPECTED_TERMINAL_TEXT = EXPECTED_CANONICAL_TEXT.replace('"terminals":[]',
  '"terminals":[{"id":"terminal:0000000000000000","kind":"retained_closed_basin","point":{"xM":375,"yM":375},"catchmentId":"catchment:0000000000000000","localContributingAreaM2":125000}]');
const terminalGoldenEncoded = encode(terminalGoldenCandidate);
const terminalGoldenDigest = await digestCandidate(terminalGoldenCandidate);
const expectedTerminalDigest = `sha256:${createHash("sha256").update(EXPECTED_TERMINAL_TEXT).digest("hex")}`;

const basinGoldenRing = cellRing(0, 0);
const basinGoldenCandidate = {
  ...structuredClone(goldenCandidate),
  terminals: [{ id: ids.terminal[0], kind: "retained_closed_basin", point: p(125, 125), catchmentId: ids.catchment[0], localContributingAreaM2: 62_500 }],
  catchments: [{ id: ids.catchment[0], terminalId: ids.terminal[0], areaM2: 62_500, boundaryRings: [basinGoldenRing] }],
  depressionBasins: [{ id: ids.basin[0], catchmentId: ids.catchment[0], floorPoint: p(125, 125), floorElevationMeters: 7,
    spillElevationMeters: null, outletTerminalId: null, closedEndorheic: true, areaM2: 62_500, boundaryRings: [basinGoldenRing] }],
  deterministicProvenance: { repairOperationCount: 0, conditionedDepressionCount: 0, retainedDepressionCount: 1 },
};
const BASIN_RING_TEXT = '[{"xM":0,"yM":0},{"xM":250,"yM":0},{"xM":250,"yM":250},{"xM":0,"yM":250},{"xM":0,"yM":0}]';
const EXPECTED_BASIN_TEXT = EXPECTED_CANONICAL_TEXT
  .replace('"terminals":[]', '"terminals":[{"id":"terminal:0000000000000000","kind":"retained_closed_basin","point":{"xM":125,"yM":125},"catchmentId":"catchment:0000000000000000","localContributingAreaM2":62500}]')
  .replace('"catchments":[]', `"catchments":[{"id":"catchment:0000000000000000","terminalId":"terminal:0000000000000000","areaM2":62500,"boundaryRings":[${BASIN_RING_TEXT}]}]`)
  .replace('"depressionBasins":[]', `"depressionBasins":[{"id":"depression-basin:0000000000000000","catchmentId":"catchment:0000000000000000","floorPoint":{"xM":125,"yM":125},"floorElevationMeters":7,"spillElevationMeters":null,"outletTerminalId":null,"closedEndorheic":true,"areaM2":62500,"boundaryRings":[${BASIN_RING_TEXT}]}]`)
  .replace('"retainedDepressionCount":0', '"retainedDepressionCount":1');
const basinGoldenEncoded = encode(basinGoldenCandidate);
const basinGoldenDigest = await digestCandidate(basinGoldenCandidate);
const expectedBasinDigest = `sha256:${createHash("sha256").update(EXPECTED_BASIN_TEXT).digest("hex")}`;

const floorPointFieldChecks = {};
const floorPointCases = {
  missing: b => { delete b.floorPoint; },
  null: b => { b.floorPoint = null; },
  missingX: b => { delete b.floorPoint.xM; },
  missingY: b => { delete b.floorPoint.yM; },
  extraNested: b => { b.floorPoint.zM = 0; },
  nan: b => { b.floorPoint.xM = NaN; },
  infinite: b => { b.floorPoint.yM = Infinity; },
  negativeZero: b => { b.floorPoint.xM = -0; },
  outOfDomain: b => { b.floorPoint.xM = 300_125; },
  nonCellCenter: b => { b.floorPoint.xM = 126; },
  outsideBasin: b => { b.boundaryRings = [cellRing(250, 0)]; },
};
for (const [name, mutate] of Object.entries(floorPointCases)) {
  const changed = structuredClone(basinGoldenCandidate);
  mutate(changed.depressionBasins[0]);
  const error = failure(encode(changed));
  floorPointFieldChecks[`${name}FloorPointRejected`] = error?.code === "M02_CANDIDATE_INVALID" && error.path.includes("depressionBasins");
}
const floorInsideHole = structuredClone(basinGoldenCandidate);
floorInsideHole.depressionBasins[0].boundaryRings = [squareRing(0, 0, 500), [...squareRing(50, 50, 150)].reverse()];
const floorInsideHoleError = failure(encode(floorInsideHole));
const floorOutsideCatchment = structuredClone(basinGoldenCandidate);
floorOutsideCatchment.catchments[0].boundaryRings = [cellRing(250, 0)];
const floorOutsideCatchmentError = failure(encode(floorOutsideCatchment));
const closedFloorTerminalMismatch = structuredClone(basinGoldenCandidate);
closedFloorTerminalMismatch.terminals[0].point = p(375, 125);
const closedFloorTerminalMismatchError = failure(encode(closedFloorTerminalMismatch));

const floorXChanged = structuredClone(basinGoldenCandidate);
floorXChanged.depressionBasins[0].boundaryRings = [squareRing(0, 0, 500)];
floorXChanged.catchments[0].boundaryRings = [squareRing(0, 0, 500)];
floorXChanged.depressionBasins[0].floorPoint = p(375, 125);
floorXChanged.terminals[0].point = p(375, 125);
const floorYChanged = structuredClone(basinGoldenCandidate);
floorYChanged.depressionBasins[0].boundaryRings = [squareRing(0, 0, 500)];
floorYChanged.catchments[0].boundaryRings = [squareRing(0, 0, 500)];
floorYChanged.depressionBasins[0].floorPoint = p(125, 375);
floorYChanged.terminals[0].point = p(125, 375);
const floorXEncoded = encode(floorXChanged), floorYEncoded = encode(floorYChanged);
const floorXDigest = await digestCandidate(floorXChanged), floorYDigest = await digestCandidate(floorYChanged);

const floorMutationRing = squareRing(0, 0, 500);
const floorMutationBase = {
  ...structuredClone(goldenCandidate),
  terminals: [{ id: ids.terminal[0], kind: "external_domain_outlet", point: p(0, 125), catchmentId: ids.catchment[0], localContributingAreaM2: 250_000 }],
  catchments: [{ id: ids.catchment[0], terminalId: ids.terminal[0], areaM2: 250_000, boundaryRings: [floorMutationRing] }],
  depressionBasins: [{ id: ids.basin[0], catchmentId: ids.catchment[0], floorPoint: p(125, 375), floorElevationMeters: 7,
    spillElevationMeters: 9, outletTerminalId: ids.terminal[0], closedEndorheic: false, areaM2: 250_000, boundaryRings: [floorMutationRing] }],
  deterministicProvenance: { repairOperationCount: 0, conditionedDepressionCount: 0, retainedDepressionCount: 1 },
};
const floorMutationChanged = structuredClone(floorMutationBase);
floorMutationChanged.depressionBasins[0].floorPoint = p(375, 375);
const floorMutationBaseEncoded = encode(floorMutationBase);
const floorMutationChangedEncoded = encode(floorMutationChanged);
const floorMutationBaseDigest = await digestCandidate(floorMutationBase);
const floorMutationChangedDigest = await digestCandidate(floorMutationChanged);
const canonicalSourceMutations = {};
const terminalRecordLine = '    const value = record(item, ["id", "kind", "point", "catchmentId", "localContributingAreaM2"], path);';
const replaceOnce = (source, needle, replacement) => {
  if (source.indexOf(needle) < 0 || source.indexOf(needle) !== source.lastIndexOf(needle)) return undefined;
  return source.replace(needle, replacement);
};
const badTerminal = mutation => { const c = clone(); mutation(c.terminals[0]); return c; };
const sourceCases = {
  missingFieldAccepted: [source => replaceOnce(source,terminalRecordLine,
    '    if (!("localContributingAreaM2" in (item as object))) (item as Record<string, unknown>).localContributingAreaM2 = 0;\n' + terminalRecordLine),
    badTerminal(t => { delete t.localContributingAreaM2; })],
  extraFieldAccepted: [source => replaceOnce(source,terminalRecordLine,
    '    delete (item as Record<string, unknown>).extraAreaM2;\n' + terminalRecordLine), badTerminal(t => { t.extraAreaM2 = 0; })],
  nonfiniteFieldAccepted: [source => replaceOnce(source,
    'const localArea = numberValue(value.localContributingAreaM2, `${path}.localContributingAreaM2`);',
    'const localArea = Number.isFinite(value.localContributingAreaM2) ? numberValue(value.localContributingAreaM2, `${path}.localContributingAreaM2`) : "0";'),
    badTerminal(t => { t.localContributingAreaM2 = NaN; })],
  negativeFieldAccepted: [source => replaceOnce(source,
    '    if ((value.localContributingAreaM2 as number) < 0) reject(`${path}.localContributingAreaM2`, "expected nonnegative terminal local area");', ''),
    badTerminal(t => { t.localContributingAreaM2 = -1; })],
  digestFieldOmitted: [source => replaceOnce(source, ',"localContributingAreaM2":${localArea}', ''), undefined],
};
for (const [name,[mutate,invalid]] of Object.entries(sourceCases)) {
  const original = readFileSync(modulePath), mutated = mutate(original.toString('utf8'));
  const saved = canonical;
  let applied = false, detected = false, loadError;
  try {
    if (typeof mutated === 'string' && mutated !== original.toString('utf8')) {
      applied = true; writeFileSync(modulePath,mutated);
      const loader = await createServer({ root: `${ROOT}/src`, configFile: false, appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'error' });
      try { canonical = await loader.ssrLoadModule(`/sim/world/physical/canonicalTerrainHydro.ts?mutant=${name}`); }
      catch (error) { loadError = String(error); }
      finally { await loader.close(); }
      if (!loadError) {
        if (invalid) detected = encode(invalid)?.ok === true;
        else {
          const changed = clone(); changed.terminals[0].localContributingAreaM2 += 1;
          const before = encode(candidate), after = encode(changed);
          const beforeDigest = await digestCandidate(candidate), afterDigest = await digestCandidate(changed);
          detected = before?.ok === true && after?.ok === true && bytes(before) === bytes(after) &&
            beforeDigest?.ok === true && afterDigest?.ok === true && beforeDigest.value === afterDigest.value;
        }
      }
    }
  } finally { canonical = saved; writeFileSync(modulePath,original); }
  canonicalSourceMutations[name] = { applied, detected, restored: readFileSync(modulePath).equals(original), loadError };
}

const basinSourceMutations = {};
const basinFloorTextNeedle = ',"floorPoint":${floor.text}';
const basinFloorLineNeedle = '    const floor = basinFloorPoint(value.floorPoint, `${path}.floorPoint`, width, height);';
const v3SchemaNeedle = '  const schema = literal(root.schema, ["world-m0-terrain-hydro-candidate/v3"], "$.schema");';
const runBasinSourceMutation = async (name, mutate, detect) => {
  const original = readFileSync(modulePath);
  const mutated = mutate(original.toString("utf8"));
  const saved = canonical;
  let applied = false, detected = false, loadError;
  try {
    if (typeof mutated === "string" && mutated !== original.toString("utf8")) {
      applied = true;
      writeFileSync(modulePath, mutated);
      const loader = await createServer({ root: `${ROOT}/src`, configFile: false, appType: "custom",
        server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error" });
      try { canonical = await loader.ssrLoadModule(`/sim/world/physical/canonicalTerrainHydro.ts?basin-mutant=${name}`); }
      catch (error) { loadError = String(error); }
      finally { await loader.close(); }
      if (!loadError) detected = await detect();
    }
  } finally {
    canonical = saved;
    writeFileSync(modulePath, original);
  }
  basinSourceMutations[name] = { applied, detected, restored: readFileSync(modulePath).equals(original), loadError };
};
await runBasinSourceMutation("floorPointEncoderOmitted", source => replaceOnce(source, basinFloorTextNeedle, ""), async () => {
  const before = encode(floorMutationBase), after = encode(floorMutationChanged);
  const beforeDigest = await digestCandidate(floorMutationBase), afterDigest = await digestCandidate(floorMutationChanged);
  return before?.ok === true && after?.ok === true && bytes(before) === bytes(after) &&
    beforeDigest?.ok === true && afterDigest?.ok === true && beforeDigest.value === afterDigest.value;
});
await runBasinSourceMutation("floorPointAxesSwapped", source => replaceOnce(source, basinFloorLineNeedle,
  '    const floorSource = basinFloorPoint(value.floorPoint, `${path}.floorPoint`, width, height);\n' +
  '    const floor = { value: floorSource.value, text: `{"xM":${floorSource.value.yM},"yM":${floorSource.value.xM}}` };'), async () => {
  const mutant = encode(floorMutationBase);
  return floorMutationBaseEncoded?.ok === true && mutant?.ok === true && bytes(mutant) !== bytes(floorMutationBaseEncoded);
});
await runBasinSourceMutation("v2AcceptedOnV3Path", source => replaceOnce(source, v3SchemaNeedle,
  '  const schema = literal(root.schema, ["world-m0-terrain-hydro-candidate/v3", "world-m0-terrain-hydro-candidate/v2"], "$.schema");'), async () => encode(oldShape)?.ok === true);
const checks = {
  ...terminalFieldChecks,
  ...floorPointFieldChecks,
  floorInsideExcludedHoleRejected: floorInsideHoleError?.code === "M02_CANDIDATE_INVALID" && floorInsideHoleError.path.includes("depressionBasins"),
  floorOutsideLinkedCatchmentRejected: floorOutsideCatchmentError?.code === "M02_CANDIDATE_INVALID" && floorOutsideCatchmentError.path.includes("depressionBasins"),
  closedFloorTerminalMismatchRejected: closedFloorTerminalMismatchError?.code === "M02_CANDIDATE_INVALID" && closedFloorTerminalMismatchError.path.includes("depressionBasins"),
  literalTerminalCanonicalBytes: text(terminalGoldenEncoded) === EXPECTED_TERMINAL_TEXT,
  literalTerminalDigest: terminalGoldenDigest?.ok === true && terminalGoldenDigest.value === expectedTerminalDigest,
  literalNonemptyBasinCanonicalBytes: text(basinGoldenEncoded) === EXPECTED_BASIN_TEXT,
  literalNonemptyBasinDigest: basinGoldenDigest?.ok === true && basinGoldenDigest.value === expectedBasinDigest,
  floorXChangesCanonicalBytesAndDigest: floorXEncoded?.ok === true && floorXDigest?.ok === true &&
    bytes(floorXEncoded) !== bytes(basinGoldenEncoded) && floorXDigest.value !== basinGoldenDigest?.value,
  floorYChangesCanonicalBytesAndDigest: floorYEncoded?.ok === true && floorYDigest?.ok === true &&
    bytes(floorYEncoded) !== bytes(basinGoldenEncoded) && floorYDigest.value !== basinGoldenDigest?.value,
  isolatedFloorIdentityChangesBytesAndDigest: floorMutationBaseEncoded?.ok === true && floorMutationChangedEncoded?.ok === true &&
    bytes(floorMutationBaseEncoded) !== bytes(floorMutationChangedEncoded) && floorMutationBaseDigest?.ok === true && floorMutationChangedDigest?.ok === true &&
    floorMutationBaseDigest.value !== floorMutationChangedDigest.value,
  canonicalSourceMutationsKilled: Object.values(canonicalSourceMutations).every(r => r.applied && r.detected && r.restored && !r.loadError),
  basinEncoderSourceMutationsKilledBehaviorally: Object.values(basinSourceMutations).length === 3 &&
    Object.values(basinSourceMutations).every(r => r.applied && r.detected && r.restored && !r.loadError),
  v2SchemaRejectedOnV3Path: failure(encode(oldShape))?.path === "$.schema",
  terminalCanonicalFieldOrder: text(baseEncoded)?.includes('"catchmentId":"catchment:0000000000000001","localContributingAreaM2":125000}'),
  basinCanonicalFieldOrder: text(basinGoldenEncoded)?.includes('"id":"depression-basin:0000000000000000","catchmentId":"catchment:0000000000000000","floorPoint":{"xM":125,"yM":125},"floorElevationMeters":7'),
  candidateBytesWithinBound: baseEncoded?.ok === true && baseEncoded.value.length < 67_108_864,
  canonicalEncoderExists: typeof canonical?.encodeCanonicalTerrainHydroCandidate === "function", candidateDigestExists: typeof canonical?.computeTerrainHydroCandidateDigest === "function",
  exactCanonicalUtf8Text: actualText === EXPECTED_CANONICAL_TEXT, independentNodeSha256Oracle: goldenDigest?.ok === true && goldenDigest.value === expectedDigest,
  independentNestedCanonicalUtf8Text: nestedActualText === EXPECTED_NESTED_CANONICAL_TEXT,
  independentNestedNodeSha256Oracle: nestedGoldenDigest?.ok === true && nestedGoldenDigest.value === expectedNestedDigest,
  nestedGoldenFreezesBinary64Literal: EXPECTED_NESTED_CANONICAL_TEXT.includes('"f64:3fe0000000000000"'),
  nestedGoldenFreezesRegistryAndReferencedIdSorting: nestedActualText?.indexOf('province:0000000000000000') < nestedActualText?.indexOf('province:0000000000000001') && nestedActualText?.includes('"catchmentIds":["catchment:0000000000000000","catchment:0000000000000001"]'),
  allUnorderedReversalsByteIdentical: bytes(baseEncoded) !== undefined && bytes(baseEncoded) === bytes(reversedEncoded),
  allUnorderedReversalsDigestIdentical: baseDigest?.ok === true && reversedDigest?.ok === true && baseDigest.value === reversedDigest.value,
  callerArraysRemainElementIdentical: callerUnmutated, ...duplicateChecks,
  orderedReachReversalNonEquivalent: reversedReachEncoded?.ok === false || bytes(reversedReachEncoded) !== bytes(baseEncoded),
  adjacentBacktrackingRejected: adjacentBacktrackingError?.code === "M02_CANDIDATE_INVALID" && adjacentBacktrackingError.path.includes("drainageReaches"),
  ...mutationChecks,
  forbiddenKeyRejectedNotOmitted: forbiddenError?.code === "M02_CANDIDATE_INVALID" && forbiddenError.path.includes("crossingCandidates"),
};
const out = { check: "WORLD-M0-M0.2-CANDIDATE-IDENTITY", verdict: Object.values(checks).every(Boolean) ? "PASS" : "FAIL", checks, witnesses: { canonicalSourceMutations, basinSourceMutations, canonicalBytes: baseEncoded?.value?.length, expectedTerminalDigest, actualTerminalDigest: terminalGoldenDigest?.value, expectedBasinDigest, actualBasinDigest: basinGoldenDigest?.value, expectedDigest, actualDigest: goldenDigest?.value, expectedNestedDigest, actualNestedDigest: nestedGoldenDigest?.value } };
console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
