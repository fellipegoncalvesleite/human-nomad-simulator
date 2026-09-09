import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";
import { createServer } from "vite";

const ROOT = process.cwd();
const typesPath = `${ROOT}/src/sim/world/physical/terrainHydroTypes.ts`;
const numericPath = `${ROOT}/src/sim/world/physical/terrainHydroNumeric.ts`;

const expectedInterfaces = {
  WorldM0PointM: ["xM", "yM"],
  WorldM0StrategicCellRef: ["row", "column"],
  WorldM0StrategicEdgeRef: ["first", "second"],
  LandformProvenanceProvince: ["id", "family", "center", "radiusXM", "radiusYM", "axisAngleRadians", "influenceRadiusM", "elevationOffsetMeters", "reliefMultiplier"],
  TerrainHydroTerminal: ["id", "kind", "point", "catchmentId", "localContributingAreaM2"],
  TerrainCatchment: ["id", "terminalId", "areaM2", "boundaryRings"],
  TerrainDepressionBasin: ["id", "catchmentId", "floorPoint", "floorElevationMeters", "spillElevationMeters", "outletTerminalId", "closedEndorheic", "areaM2", "boundaryRings"],
  TerrainDrainageNode: ["id", "point", "kind", "terminalId"],
  TerrainDrainageReach: ["id", "upstreamNodeId", "downstreamNodeId", "downstreamReachId", "catchmentId", "terminalId", "geometry", "lengthMeters", "contributingAreaM2", "localContributingAreaM2", "meanTerrainGradient", "localReliefMeters", "channelIncisionMeters"],
  TerrainValleyCandidate: ["id", "reachId", "boundaryRings", "areaM2", "localReliefMeters"],
  TerrainFloodplainCandidate: ["id", "reachId", "boundaryRings", "areaM2", "terrainSlope"],
  PhysicalCrossingCandidate: ["id", "reachId", "strategicEdge", "intersection", "leftBank", "rightBank", "channelIncisionMeters", "firstApproachSlope", "secondApproachSlope"],
  StrategicTerrainSummary: ["cell", "landOceanClass", "landAreaM2", "oceanAreaM2", "elevationMinMeters", "elevationMaxMeters", "elevationMeanMeters", "localReliefMeters", "slopeMean", "coastlineLengthMeters", "provenanceFractions", "catchmentIds", "reachIds", "depressionBasinIds", "valleyCandidateIds", "floodplainCandidateIds", "crossingCandidateIds"],
  WorldM0TerrainHydroCandidateV3: ["schema", "recipeDigest", "physicalConstants", "physicalGeneratorVersion", "repairPolicyVersion", "numericKernelVersion", "analysis", "provenanceProvinces", "strategicTerrain", "coastline", "terminals", "catchments", "drainageNodes", "drainageReaches", "depressionBasins", "valleys", "floodplainCandidates", "crossingCandidates", "deterministicProvenance"],
};

const expectedNestedKeys = {
  analysis: ["cellSizeMeters", "width", "height", "boundaryModel", "flowAlgorithm"],
  provenanceFractions: ["provinceId", "areaFraction"],
  deterministicProvenance: ["repairOperationCount", "conditionedDepressionCount", "retainedDepressionCount"],
};

const source = existsSync(typesPath) ? readFileSync(typesPath, "utf8") : "";
const sourceFile = ts.createSourceFile(typesPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const interfaces = new Map();
for (const statement of sourceFile.statements) {
  if (ts.isInterfaceDeclaration(statement)) interfaces.set(statement.name.text, statement);
}
const memberName = (member) => ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
  ? member.name.text
  : undefined;
const interfaceKeys = (name) => interfaces.get(name)?.members.map(memberName) ?? [];
const hasReadonly = (member) => member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) === true;
const exact = (actual, expected) => actual.length === expected.length && expected.every((key) => actual.includes(key));
const allInterfacePropertiesReadonly = [...interfaces.values()].every((declaration) =>
  declaration.members.every((member) => ts.isPropertySignature(member) && hasReadonly(member))
);

function nestedTypeKeys(interfaceName, propertyName) {
  const property = interfaces.get(interfaceName)?.members.find((member) => memberName(member) === propertyName);
  if (!property?.type) return [];
  let node = property.type;
  if (ts.isTypeOperatorNode(node)) node = node.type;
  if (ts.isArrayTypeNode(node)) node = node.elementType;
  if (ts.isParenthesizedTypeNode(node)) node = node.type;
  if (ts.isTypeOperatorNode(node)) node = node.type;
  if (ts.isArrayTypeNode(node)) node = node.elementType;
  if (!ts.isTypeLiteralNode(node)) return [];
  return node.members.map(memberName);
}

function stringUnionMembers(typeName) {
  const declaration = sourceFile.statements.find((statement) =>
    ts.isTypeAliasDeclaration(statement) && statement.name.text === typeName
  );
  if (!declaration || !ts.isTypeAliasDeclaration(declaration) || !ts.isUnionTypeNode(declaration.type)) return [];
  return declaration.type.types
    .filter((node) => ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal))
    .map((node) => node.literal.text);
}

const server = await createServer({
  root: `${ROOT}/src`,
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  logLevel: "error",
});
let numeric;
try {
  if (existsSync(numericPath)) numeric = await server.ssrLoadModule("/sim/world/physical/terrainHydroNumeric.ts");
} catch {
  // The absent Task-2 production module is the required RED state.
} finally {
  await server.close();
}

const call = (name, ...args) => numeric?.[name]?.(...args);
const okValue = (result) => result?.ok === true ? result.value : undefined;
const failureCode = (result) => result?.ok === false ? result.error.code : undefined;

const ccw = Object.freeze([
  Object.freeze({ xM: 0, yM: 0 }),
  Object.freeze({ xM: 2, yM: 0 }),
  Object.freeze({ xM: 2, yM: 2 }),
  Object.freeze({ xM: 0, yM: 2 }),
  Object.freeze({ xM: 0, yM: 0 }),
]);
const cw = Object.freeze([ccw[0], ccw[3], ccw[2], ccw[1], ccw[0]]);
const nonCanonicalStart = Object.freeze([ccw[1], ccw[2], ccw[3], ccw[0], ccw[1]]);
const duplicateStart = Object.freeze([ccw[0], ccw[1], ccw[0], ccw[3], ccw[0]]);
const doubleClosure = Object.freeze([...ccw, ccw[0]]);
const selfIntersecting = Object.freeze([
  Object.freeze({ xM: 0, yM: 0 }),
  Object.freeze({ xM: 4, yM: 0 }),
  Object.freeze({ xM: 1, yM: 3 }),
  Object.freeze({ xM: 3, yM: 3 }),
  Object.freeze({ xM: 0, yM: 0 }),
]);

const upstreamPoint = Object.freeze({ xM: 10, yM: 20 });
const downstreamPoint = Object.freeze({ xM: 30, yM: 20 });
const reachGeometry = Object.freeze([upstreamPoint, Object.freeze({ xM: 20, yM: 21 }), downstreamPoint]);
const reversedReachGeometry = Object.freeze([...reachGeometry].reverse());
const sameFixturePoint = (left, right) => left?.xM === right?.xM && left?.yM === right?.yM;
const fixtureReachDirectionsMatchDeclaredNodes = (fixture) => fixture.drainageReaches.every((reach) => {
  const upstream = fixture.drainageNodes.find((node) => node.id === reach.upstreamNodeId);
  const downstream = fixture.drainageNodes.find((node) => node.id === reach.downstreamNodeId);
  return upstream !== undefined && downstream !== undefined && Array.isArray(reach.geometry) &&
    reach.geometry.length >= 2 && sameFixturePoint(reach.geometry[0], upstream.point) &&
    sameFixturePoint(reach.geometry.at(-1), downstream.point);
});

const candidate = Object.freeze({
  schema: "world-m0-terrain-hydro-candidate/v3",
  recipeDigest: "sha256:" + "11".repeat(32),
  physicalConstants: Object.freeze({ id: "physical:constants", version: "v1", digest: "sha256:" + "22".repeat(32) }),
  physicalGeneratorVersion: "physical:v1",
  repairPolicyVersion: "repair:v1",
  numericKernelVersion: "numeric:v1",
  analysis: Object.freeze({ cellSizeMeters: 250, width: 1200, height: 720, boundaryModel: "finite_open_outflow", flowAlgorithm: "d_infinity_v1" }),
  provenanceProvinces: Object.freeze([]), strategicTerrain: Object.freeze([]), coastline: Object.freeze([]),
  terminals: Object.freeze([]), catchments: Object.freeze([]),
  drainageNodes: Object.freeze([
    Object.freeze({ id: "drainage-node:0000000000000000", point: upstreamPoint, kind: "source", terminalId: null }),
    Object.freeze({ id: "drainage-node:0000000000000001", point: downstreamPoint, kind: "terminal", terminalId: "terminal:0000000000000000" }),
  ]),
  drainageReaches: Object.freeze([Object.freeze({ id: "drainage-reach:0000000000000000", upstreamNodeId: "drainage-node:0000000000000000", downstreamNodeId: "drainage-node:0000000000000001", downstreamReachId: null, catchmentId: "catchment:0000000000000000", terminalId: "terminal:0000000000000000", geometry: reachGeometry, lengthMeters: 20, contributingAreaM2: 62500, localContributingAreaM2: 62500, meanTerrainGradient: 0.01, localReliefMeters: 4, channelIncisionMeters: 1 })]),
  depressionBasins: Object.freeze([]), valleys: Object.freeze([]), floodplainCandidates: Object.freeze([]), crossingCandidates: Object.freeze([]),
  deterministicProvenance: Object.freeze({ repairOperationCount: 0, conditionedDepressionCount: 0, retainedDepressionCount: 0 }),
});
const reversedReachCandidate = Object.freeze({
  ...candidate,
  drainageReaches: Object.freeze(candidate.drainageReaches.map((reach) => Object.freeze({
    ...reach,
    geometry: reversedReachGeometry,
  }))),
});

const forbiddenNames = ["knownFord", "confidence", "fordability", "risk", "crossingClass", "baseCrossingCost", "waterDepth", "width", "velocity", "watercraft", "bridge", "ferry", "precipitation", "runoff", "recharge", "baseflow", "discharge", "regime", "wetted"];
const scratchNames = ["scratch", "buffer", "typedArray", "elevationGrid", "routingGrid", "flowGrid"];
const persistentArrayProperties = ["provenanceProvinces", "strategicTerrain", "coastline", "terminals", "catchments", "drainageNodes", "drainageReaches", "depressionBasins", "valleys", "floodplainCandidates", "crossingCandidates"];
const candidateDeclaration = interfaces.get("WorldM0TerrainHydroCandidateV3");
const candidateArrayTypesReadonly = persistentArrayProperties.every((name) => {
  const property = candidateDeclaration?.members.find((member) => memberName(member) === name);
  return property?.type?.getText(sourceFile).startsWith("readonly ") === true;
});
const reachGeometryProperty = interfaces.get("TerrainDrainageReach")?.members.find(
  (member) => memberName(member) === "geometry",
);
const reachGeometryIsOrderedReadonlyArray = reachGeometryProperty?.type?.getText(sourceFile) === "readonly WorldM0PointM[]";

const originalLocaleCompare = String.prototype.localeCompare;
let asciiWithoutLocale = false;
try {
  String.prototype.localeCompare = () => { throw new Error("localeCompare is forbidden"); };
  asciiWithoutLocale = call("compareAscii", "Z", "a") === -1;
} finally {
  String.prototype.localeCompare = originalLocaleCompare;
}
const edge = call("canonicalStrategicEdge", { row: 3, column: 2 }, { row: 3, column: 1 });
const diagonal = call("canonicalStrategicEdge", { row: 1, column: 1 }, { row: 2, column: 2 });
const same = call("canonicalStrategicEdge", { row: 1, column: 1 }, { row: 1, column: 1 });
const unsafeCell = call("canonicalStrategicEdge", { row: -1, column: 1 }, { row: 0, column: 1 });
const checks = {
  typesModuleExists: source.length > 0,
  numericModuleExists: numeric !== undefined,
  exactInterfaceKeySets: Object.entries(expectedInterfaces).every(([name, keys]) => exact(interfaceKeys(name), keys)),
  exactAnalysisKeys: exact(nestedTypeKeys("WorldM0TerrainHydroCandidateV3", "analysis"), expectedNestedKeys.analysis),
  exactProvenanceFractionKeys: exact(nestedTypeKeys("StrategicTerrainSummary", "provenanceFractions"), expectedNestedKeys.provenanceFractions),
  exactDeterministicProvenanceKeys: exact(nestedTypeKeys("WorldM0TerrainHydroCandidateV3", "deterministicProvenance"), expectedNestedKeys.deterministicProvenance),
  exactlyFourProvenanceFamilies: exact(stringUnionMembers("LandformProvenanceFamily"), ["stable_denudational", "orogenic_uplift", "volcanic_constructive", "sedimentary_basin"]),
  exactTerminalKinds: exact(stringUnionMembers("TerrainHydroTerminalKind"), ["ocean_outlet", "retained_closed_basin", "external_domain_outlet"]),
  exactCrossingKeys: exact(interfaceKeys("PhysicalCrossingCandidate"), expectedInterfaces.PhysicalCrossingCandidate),
  noForbiddenCrossingOrHydraulicFields: forbiddenNames.every((name) => !interfaceKeys("PhysicalCrossingCandidate").includes(name)) && forbiddenNames.every((name) => !interfaceKeys("WorldM0TerrainHydroCandidateV3").includes(name)),
  allPersistentPropertiesReadonly: allInterfacePropertiesReadonly && candidateArrayTypesReadonly,
  noScratchTypedArraySurface: !/\b(?:Float(?:32|64)Array|Uint(?:8|16|32)Array|Int(?:8|16|32)Array|BigUint64Array|BigInt64Array)\b/.test(source) && scratchNames.every((name) => !interfaceKeys("WorldM0TerrainHydroCandidateV3").includes(name)),
  completeFixtureExactTopLevelKeys: exact(Object.keys(candidate), expectedInterfaces.WorldM0TerrainHydroCandidateV3),
  completeFixtureControlledDimensions: candidate.analysis.width === 1200 && candidate.analysis.height === 720 && candidate.analysis.width * candidate.analysis.height === 864000,
  asciiComparatorFixed: asciiWithoutLocale && call("compareAscii", "A", "a") === -1 && call("compareAscii", "a", "aa") === -1 && call("compareAscii", "aa", "a") === 1 && call("compareAscii", "same", "same") === 0,
  strategicCellRowThenColumn: call("compareStrategicCell", { row: 1, column: 9 }, { row: 2, column: 0 }) === -1 && call("compareStrategicCell", { row: 1, column: 1 }, { row: 1, column: 2 }) === -1,
  cardinalEdgeCanonical: edge?.ok === true && edge.value.first.row === 3 && edge.value.first.column === 1 && edge.value.second.column === 2,
  nonCardinalEdgesRejected: failureCode(diagonal) === "M02_CANDIDATE_INVALID" && failureCode(same) === "M02_CANDIDATE_INVALID" && failureCode(unsafeCell) === "M02_CANDIDATE_INVALID",
  pointOrderXThenY: call("comparePointM", { xM: 1, yM: 99 }, { xM: 2, yM: 0 }) === -1 && call("comparePointM", { xM: 1, yM: 2 }, { xM: 1, yM: 3 }) === -1,
  invalidPointOrderingFailsClosed: call("comparePointM", { xM: -0, yM: 1 }, { xM: 0, yM: 1 }) === 0 && call("comparePointM", { xM: NaN, yM: 1 }, { xM: 0, yM: 1 }) === 0,
  signedAreaOrientationExact: okValue(call("signedRingArea2", ccw)) === 8 && okValue(call("signedRingArea2", cw)) === -8,
  normalizedRingRoles: call("isNormalizedClosedRing", ccw, "outer") === true && call("isNormalizedClosedRing", cw, "hole") === true && call("isNormalizedClosedRing", ccw, "hole") === false && call("isNormalizedClosedRing", cw, "outer") === false,
  ringStartAndClosureStrict: call("isNormalizedClosedRing", nonCanonicalStart, "outer") === false && call("isNormalizedClosedRing", duplicateStart, "outer") === false && call("isNormalizedClosedRing", doubleClosure, "outer") === false && call("isNormalizedClosedRing", ccw.slice(0, 3), "outer") === false,
  selfIntersectingRingRejected: okValue(call("signedRingArea2", selfIntersecting)) === 6 && call("isNormalizedClosedRing", selfIntersecting, "outer") === false,
  binary64Goldens: okValue(call("encodeTerrainHydroAuditNumber", 1.5)) === "f64:3ff8000000000000" && okValue(call("encodeTerrainHydroAuditNumber", -2.25)) === "f64:c002000000000000" && okValue(call("encodeTerrainHydroAuditNumber", 0.1)) === "f64:3fb999999999999a",
  invalidBinary64Rejected: [NaN, Infinity, -Infinity, -0].every((value) => failureCode(call("encodeTerrainHydroAuditNumber", value)) === "M02_CANDIDATE_INVALID"),
  idGoldens: ["province", "terminal", "catchment", "drainage-node", "drainage-reach", "depression-basin", "valley", "floodplain", "crossing"].every((namespace) => okValue(call("formatTerrainHydroId", namespace, 0)) === `${namespace}:0000000000000000`) && okValue(call("formatTerrainHydroId", "crossing", 0xabcdef)) === "crossing:0000000000abcdef",
  idBoundsTyped: failureCode(call("formatTerrainHydroId", "province", -1)) === "M02_BOUND_EXCEEDED" && failureCode(call("formatTerrainHydroId", "province", Number.MAX_SAFE_INTEGER + 1)) === "M02_BOUND_EXCEEDED",
  reachGeometryPersistentOrderedArray: reachGeometryIsOrderedReadonlyArray,
  completeFixtureReachDirectionAccepted: fixtureReachDirectionsMatchDeclaredNodes(candidate),
  reversedCompleteFixtureReachDirectionRejected: !fixtureReachDirectionsMatchDeclaredNodes(reversedReachCandidate),
};

const out = {
  check: "WORLD-M0-M0.2-CANDIDATE-SCHEMA",
  verdict: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  checks,
};
console.log(JSON.stringify(out, null, 2));
if (out.verdict !== "PASS") process.exitCode = 1;
