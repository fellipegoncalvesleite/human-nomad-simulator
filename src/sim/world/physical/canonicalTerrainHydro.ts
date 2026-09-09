import type { Brand } from "../../core/types";
import type { WorldM0Result, WorldM0Failure } from "./failures";
import { worldM0Failure } from "./failures";
import { sha256DigestBytes } from "./identity";
import {
  canonicalStrategicEdge,
  compareAscii,
  comparePointM,
  compareStrategicCell,
  encodeTerrainHydroAuditNumber,
  isNormalizedClosedRing,
} from "./terrainHydroNumeric";
import type {
  WorldM0PointM,
  WorldM0StrategicCellRef,
  WorldM0TerrainHydroCandidateV3,
} from "./terrainHydroTypes";

export type WorldM0TerrainHydroCandidateDigest =
  Brand<string, "WorldM0TerrainHydroCandidateDigest">;

class CandidateEncodingError extends Error {
  constructor(readonly failure: WorldM0Failure) {
    super(failure.detail);
  }
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;
const IDENTITY_TOKEN = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const ID_PATTERNS = {
  province: /^province:[0-9a-f]{16}$/,
  terminal: /^terminal:[0-9a-f]{16}$/,
  catchment: /^catchment:[0-9a-f]{16}$/,
  "drainage-node": /^drainage-node:[0-9a-f]{16}$/,
  "drainage-reach": /^drainage-reach:[0-9a-f]{16}$/,
  "depression-basin": /^depression-basin:[0-9a-f]{16}$/,
  valley: /^valley:[0-9a-f]{16}$/,
  floodplain: /^floodplain:[0-9a-f]{16}$/,
  crossing: /^crossing:[0-9a-f]{16}$/,
} as const;
type IdNamespace = keyof typeof ID_PATTERNS;

function reject(path: string, detail: string): never {
  const result = worldM0Failure("M02_CANDIDATE_INVALID", path, detail);
  if (result.ok) throw new Error("unreachable");
  throw new CandidateEncodingError(result.error);
}

function record(input: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    reject(path, "expected an object");
  }
  const value = input as Record<string, unknown>;
  const actual = Object.keys(value);
  if (actual.length !== keys.length || !keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
    reject(path, `expected exactly keys ${keys.join(",")}`);
  }
  return value;
}

function array(input: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(input)) reject(path, "expected an array");
  return input;
}

function stringValue(input: unknown, path: string): string {
  if (typeof input !== "string" || !PRINTABLE_ASCII.test(input)) {
    reject(path, "expected printable 7-bit ASCII string");
  }
  return input;
}

function token(input: unknown, path: string): string {
  const value = stringValue(input, path);
  if (!IDENTITY_TOKEN.test(value) || value === "." || value === "..") {
    reject(path, "invalid identity token");
  }
  return value;
}

function literal<T extends string>(input: unknown, values: readonly T[], path: string): T {
  const value = stringValue(input, path);
  if (!values.includes(value as T)) reject(path, `expected one of ${values.join(",")}`);
  return value as T;
}

function id(input: unknown, namespace: IdNamespace, path: string): string {
  const value = stringValue(input, path);
  if (!ID_PATTERNS[namespace].test(value)) reject(path, `invalid ${namespace} ID`);
  return value;
}

function digest(input: unknown, path: string): string {
  const value = stringValue(input, path);
  if (!SHA256.test(value)) reject(path, "invalid SHA-256 digest");
  return value;
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function integer(input: unknown, path: string, nonnegative = false): string {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || Object.is(input, -0) || (nonnegative && input < 0)) {
    reject(path, `expected ${nonnegative ? "non-negative " : ""}safe integer`);
  }
  return String(input);
}

function numberValue(input: unknown, path: string): string {
  if (typeof input !== "number" || !Number.isFinite(input) || Object.is(input, -0)) {
    reject(path, "expected finite canonical number");
  }
  if (Number.isInteger(input)) return integer(input, path);
  const encoded = encodeTerrainHydroAuditNumber(input);
  if (!encoded.ok) reject(path, encoded.error.detail);
  return jsonString(encoded.value);
}

function booleanValue(input: unknown, path: string): string {
  if (typeof input !== "boolean") reject(path, "expected boolean");
  return input ? "true" : "false";
}

function nullable<T>(input: unknown, write: (value: unknown) => T): T | "null" {
  return input === null ? "null" : write(input);
}

function point(input: unknown, path: string): { value: WorldM0PointM; text: string } {
  const value = record(input, ["xM", "yM"], path);
  const x = numberValue(value.xM, `${path}.xM`);
  const y = numberValue(value.yM, `${path}.yM`);
  return {
    value: { xM: value.xM as number, yM: value.yM as number },
    text: `{"xM":${x},"yM":${y}}`,
  };
}

function samePoint(left: WorldM0PointM, right: WorldM0PointM): boolean {
  return left.xM === right.xM && left.yM === right.yM;
}

function pointSequence(input: unknown, path: string, minimum: number): { points: readonly WorldM0PointM[]; text: string } {
  const values = array(input, path);
  if (values.length < minimum) reject(path, `expected at least ${minimum} points`);
  const written = values.map((value, index) => point(value, `${path}[${index}]`));
  for (let index = 1; index < written.length; index += 1) {
    if (samePoint(written[index - 1].value, written[index].value)) {
      reject(`${path}[${index}]`, "consecutive duplicate point");
    }
  }
  return { points: written.map((item) => item.value), text: `[${written.map((item) => item.text).join(",")}]` };
}

function f64Key(value: number, path: string): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) reject(path, "invalid coastline coordinate");
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, false);
  let result = "";
  for (let index = 0; index < 8; index += 1) result += view.getUint8(index).toString(16).padStart(2, "0");
  return result;
}

function coastlineItem(input: unknown, path: string, domainWidth: number, domainHeight: number) {
  const written = pointSequence(input, path, 2);
  const closed = samePoint(written.points[0], written.points[written.points.length - 1]);
  if (closed) {
    if (!isNormalizedClosedRing(written.points, "outer") && !isNormalizedClosedRing(written.points, "hole")) {
      reject(path, "closed coastline must be an already-normalized ring");
    }
  } else {
    const onBoundary = (value: WorldM0PointM) => value.xM === 0 || value.yM === 0 ||
      value.xM === domainWidth || value.yM === domainHeight;
    if (samePoint(written.points[0], written.points[written.points.length - 1]) ||
        !onBoundary(written.points[0]) || !onBoundary(written.points[written.points.length - 1])) {
      reject(path, "open coastline endpoints must be distinct domain-boundary points");
    }
    requireSimpleOpenSequence(written.points, path);
  }
  const key = `${closed ? "c" : "o"}|${written.points.map((value, index) =>
    `${f64Key(value.xM, `${path}[${index}].xM`)},${f64Key(value.yM, `${path}[${index}].yM`)}`).join(";")}`;
  return { key, text: written.text };
}

function pointOnSegment(pointValue: WorldM0PointM, first: WorldM0PointM, second: WorldM0PointM): boolean {
  const cross = (pointValue.yM - first.yM) * (second.xM - first.xM) -
    (pointValue.xM - first.xM) * (second.yM - first.yM);
  return cross === 0 && pointValue.xM >= Math.min(first.xM, second.xM) &&
    pointValue.xM <= Math.max(first.xM, second.xM) && pointValue.yM >= Math.min(first.yM, second.yM) &&
    pointValue.yM <= Math.max(first.yM, second.yM);
}

function orientation(first: WorldM0PointM, second: WorldM0PointM, third: WorldM0PointM): number {
  const cross = (second.xM - first.xM) * (third.yM - first.yM) -
    (second.yM - first.yM) * (third.xM - first.xM);
  return cross < 0 ? -1 : cross > 0 ? 1 : 0;
}

function segmentsIntersect(first: WorldM0PointM, second: WorldM0PointM, third: WorldM0PointM, fourth: WorldM0PointM): boolean {
  const firstThird = orientation(first, second, third);
  const firstFourth = orientation(first, second, fourth);
  const thirdFirst = orientation(third, fourth, first);
  const thirdSecond = orientation(third, fourth, second);
  if (firstThird !== firstFourth && thirdFirst !== thirdSecond) return true;
  return (firstThird === 0 && pointOnSegment(third, first, second)) ||
    (firstFourth === 0 && pointOnSegment(fourth, first, second)) ||
    (thirdFirst === 0 && pointOnSegment(first, third, fourth)) ||
    (thirdSecond === 0 && pointOnSegment(second, third, fourth));
}

function requireSimpleOpenSequence(points: readonly WorldM0PointM[], path: string): void {
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (samePoint(points[first], points[second])) reject(`${path}[${second}]`, "duplicate point in open geometry");
    }
  }
  for (let first = 0; first < points.length - 2; first += 1) {
    const previous = points[first];
    const shared = points[first + 1];
    const next = points[first + 2];
    if (orientation(previous, shared, next) === 0 &&
        (pointOnSegment(next, previous, shared) || pointOnSegment(previous, shared, next))) {
      reject(path, "adjacent open-geometry segments overlap beyond their shared endpoint");
    }
  }
  for (let first = 0; first < points.length - 1; first += 1) {
    for (let second = first + 2; second < points.length - 1; second += 1) {
      if (segmentsIntersect(points[first], points[first + 1], points[second], points[second + 1])) {
        reject(path, "open geometry is not simple");
      }
    }
  }
}

function ringInteriorContainsPoint(ring: readonly WorldM0PointM[], tested: WorldM0PointM): boolean {
  let inside = false;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const first = ring[index];
    const second = ring[index + 1];
    if ((first.yM > tested.yM) !== (second.yM > tested.yM)) {
      const crossingX = first.xM + ((tested.yM - first.yM) * (second.xM - first.xM)) /
        (second.yM - first.yM);
      if (crossingX > tested.xM) inside = !inside;
    }
  }
  return inside;
}

function containsPoint(ring: readonly WorldM0PointM[], tested: WorldM0PointM, path: string): boolean {
  for (let index = 0; index < ring.length - 1; index += 1) {
    if (pointOnSegment(tested, ring[index], ring[index + 1])) reject(path, "rings may not touch or overlap");
  }
  return ringInteriorContainsPoint(ring, tested);
}

function boundaryRingRegistry(
  input: unknown,
  path: string,
): { rings: readonly (readonly WorldM0PointM[])[]; text: string } {
  const values = array(input, path);
  const rings = values.map((value, index) => {
    const written = pointSequence(value, `${path}[${index}]`, 4);
    const outer = isNormalizedClosedRing(written.points, "outer");
    const hole = isNormalizedClosedRing(written.points, "hole");
    if (!outer && !hole) reject(`${path}[${index}]`, "ring is not normalized");
    return { points: written.points, text: written.text, outer, depth: 0 };
  });
  const ringKeys = new Set<string>();
  for (let index = 0; index < rings.length; index += 1) {
    if (ringKeys.has(rings[index].text)) reject(`${path}[${index}]`, "duplicate boundary ring key");
    ringKeys.add(rings[index].text);
  }
  for (let index = 0; index < rings.length; index += 1) {
    rings[index].depth = rings.reduce((depth, other, otherIndex) => otherIndex !== index &&
      containsPoint(other.points, rings[index].points[0], `${path}[${index}]`) ? depth + 1 : depth, 0);
    if (rings[index].outer !== (rings[index].depth % 2 === 0)) {
      reject(`${path}[${index}]`, "ring orientation does not match containment depth");
    }
  }
  const sorted = [...rings].sort((left, right) => {
    if (left.outer !== right.outer) return left.outer ? -1 : 1;
    if (left.depth !== right.depth) return left.depth < right.depth ? -1 : 1;
    const first = comparePointM(left.points[0], right.points[0]);
    return first !== 0 ? first : compareAscii(left.text, right.text);
  });
  return {
    rings: sorted.map((item) => item.points),
    text: `[${sorted.map((item) => item.text).join(",")}]`,
  };
}

function boundaryRings(input: unknown, path: string): string {
  return boundaryRingRegistry(input, path).text;
}

function boundaryRegistryContainsPoint(
  rings: readonly (readonly WorldM0PointM[])[],
  tested: WorldM0PointM,
): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      if (pointOnSegment(tested, ring[index], ring[index + 1])) return true;
    }
    if (ringInteriorContainsPoint(ring, tested)) inside = !inside;
  }
  return inside;
}

function basinFloorPoint(
  input: unknown,
  path: string,
  width: number,
  height: number,
): { value: WorldM0PointM; text: string } {
  const written = point(input, path);
  const { xM, yM } = written.value;
  const halfCell = 125;
  const cellSize = 250;
  if (xM < halfCell || yM < halfCell || xM >= width * cellSize || yM >= height * cellSize ||
      (xM - halfCell) % cellSize !== 0 || (yM - halfCell) % cellSize !== 0) {
    reject(path, "floor point must be an in-domain 250 m cell center");
  }
  return written;
}

function registry(
  input: unknown,
  path: string,
  namespace: IdNamespace,
  write: (value: unknown, itemPath: string) => { id: string; text: string },
): string {
  const values = array(input, path);
  const written = values.map((value, index) => write(value, `${path}[${index}]`));
  const seen = new Set<string>();
  for (let index = 0; index < written.length; index += 1) {
    id(written[index].id, namespace, `${path}[${index}].id`);
    if (seen.has(written[index].id)) reject(`${path}[${index}].id`, `duplicate ID ${written[index].id}`);
    seen.add(written[index].id);
  }
  const sorted = [...written].sort((left, right) => compareAscii(left.id, right.id));
  return `[${sorted.map((item) => item.text).join(",")}]`;
}

function idList(input: unknown, path: string, namespace: IdNamespace): string {
  const values = array(input, path).map((value, index) => id(value, namespace, `${path}[${index}]`));
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    if (seen.has(values[index])) reject(`${path}[${index}]`, `duplicate ID ${values[index]}`);
    seen.add(values[index]);
  }
  return `[${[...values].sort(compareAscii).map(jsonString).join(",")}]`;
}

function strategicCell(input: unknown, path: string): { value: WorldM0StrategicCellRef; text: string } {
  const value = record(input, ["row", "column"], path);
  const row = integer(value.row, `${path}.row`, true);
  const column = integer(value.column, `${path}.column`, true);
  return { value: { row: value.row as number, column: value.column as number }, text: `{"row":${row},"column":${column}}` };
}

function canonicalText(input: unknown): string {
  const root = record(input, [
    "schema", "recipeDigest", "physicalConstants", "physicalGeneratorVersion", "repairPolicyVersion",
    "numericKernelVersion", "analysis", "provenanceProvinces", "strategicTerrain", "coastline", "terminals",
    "catchments", "drainageNodes", "drainageReaches", "depressionBasins", "valleys", "floodplainCandidates",
    "crossingCandidates", "deterministicProvenance",
  ], "$");
  const schema = literal(root.schema, ["world-m0-terrain-hydro-candidate/v3"], "$.schema");
  const recipeDigest = digest(root.recipeDigest, "$.recipeDigest");
  const constants = record(root.physicalConstants, ["id", "version", "digest"], "$.physicalConstants");
  const constantsText = `{"id":${jsonString(token(constants.id, "$.physicalConstants.id"))},"version":${jsonString(token(constants.version, "$.physicalConstants.version"))},"digest":${jsonString(digest(constants.digest, "$.physicalConstants.digest"))}}`;
  const analysis = record(root.analysis, ["cellSizeMeters", "width", "height", "boundaryModel", "flowAlgorithm"], "$.analysis");
  if (analysis.cellSizeMeters !== 250) reject("$.analysis.cellSizeMeters", "expected 250");
  const width = Number(integer(analysis.width, "$.analysis.width", true));
  const height = Number(integer(analysis.height, "$.analysis.height", true));
  if (width === 0 || height === 0) reject("$.analysis", "analysis dimensions must be positive");
  const analysisText = `{"cellSizeMeters":250,"width":${width},"height":${height},"boundaryModel":${jsonString(literal(analysis.boundaryModel, ["finite_open_outflow"], "$.analysis.boundaryModel"))},"flowAlgorithm":${jsonString(literal(analysis.flowAlgorithm, ["d_infinity_v1"], "$.analysis.flowAlgorithm"))}}`;

  const provinces = registry(root.provenanceProvinces, "$.provenanceProvinces", "province", (item, path) => {
    const value = record(item, ["id", "family", "center", "radiusXM", "radiusYM", "axisAngleRadians", "influenceRadiusM", "elevationOffsetMeters", "reliefMultiplier"], path);
    const itemId = id(value.id, "province", `${path}.id`);
    return { id: itemId, text: `{"id":${jsonString(itemId)},"family":${jsonString(literal(value.family, ["stable_denudational", "orogenic_uplift", "volcanic_constructive", "sedimentary_basin"], `${path}.family`))},"center":${point(value.center, `${path}.center`).text},"radiusXM":${numberValue(value.radiusXM, `${path}.radiusXM`)},"radiusYM":${numberValue(value.radiusYM, `${path}.radiusYM`)},"axisAngleRadians":${numberValue(value.axisAngleRadians, `${path}.axisAngleRadians`)},"influenceRadiusM":${numberValue(value.influenceRadiusM, `${path}.influenceRadiusM`)},"elevationOffsetMeters":${numberValue(value.elevationOffsetMeters, `${path}.elevationOffsetMeters`)},"reliefMultiplier":${numberValue(value.reliefMultiplier, `${path}.reliefMultiplier`)}}` };
  });

  const strategicValues = array(root.strategicTerrain, "$.strategicTerrain").map((item, index) => {
    const path = `$.strategicTerrain[${index}]`;
    const value = record(item, ["cell", "landOceanClass", "landAreaM2", "oceanAreaM2", "elevationMinMeters", "elevationMaxMeters", "elevationMeanMeters", "localReliefMeters", "slopeMean", "coastlineLengthMeters", "provenanceFractions", "catchmentIds", "reachIds", "depressionBasinIds", "valleyCandidateIds", "floodplainCandidateIds", "crossingCandidateIds"], path);
    const cell = strategicCell(value.cell, `${path}.cell`);
    const fractions = array(value.provenanceFractions, `${path}.provenanceFractions`).map((fraction, fractionIndex) => {
      const fractionPath = `${path}.provenanceFractions[${fractionIndex}]`;
      const entry = record(fraction, ["provinceId", "areaFraction"], fractionPath);
      const provinceId = id(entry.provinceId, "province", `${fractionPath}.provinceId`);
      return { provinceId, text: `{"provinceId":${jsonString(provinceId)},"areaFraction":${numberValue(entry.areaFraction, `${fractionPath}.areaFraction`)}}` };
    });
    const fractionSeen = new Set<string>();
    for (let fractionIndex = 0; fractionIndex < fractions.length; fractionIndex += 1) {
      if (fractionSeen.has(fractions[fractionIndex].provinceId)) reject(`${path}.provenanceFractions[${fractionIndex}].provinceId`, `duplicate provinceId ${fractions[fractionIndex].provinceId}`);
      fractionSeen.add(fractions[fractionIndex].provinceId);
    }
    const fractionText = `[${[...fractions].sort((a, b) => compareAscii(a.provinceId, b.provinceId)).map((entry) => entry.text).join(",")}]`;
    const text = `{"cell":${cell.text},"landOceanClass":${jsonString(literal(value.landOceanClass, ["land", "ocean", "mixed"], `${path}.landOceanClass`))},"landAreaM2":${numberValue(value.landAreaM2, `${path}.landAreaM2`)},"oceanAreaM2":${numberValue(value.oceanAreaM2, `${path}.oceanAreaM2`)},"elevationMinMeters":${numberValue(value.elevationMinMeters, `${path}.elevationMinMeters`)},"elevationMaxMeters":${numberValue(value.elevationMaxMeters, `${path}.elevationMaxMeters`)},"elevationMeanMeters":${numberValue(value.elevationMeanMeters, `${path}.elevationMeanMeters`)},"localReliefMeters":${numberValue(value.localReliefMeters, `${path}.localReliefMeters`)},"slopeMean":${numberValue(value.slopeMean, `${path}.slopeMean`)},"coastlineLengthMeters":${numberValue(value.coastlineLengthMeters, `${path}.coastlineLengthMeters`)},"provenanceFractions":${fractionText},"catchmentIds":${idList(value.catchmentIds, `${path}.catchmentIds`, "catchment")},"reachIds":${idList(value.reachIds, `${path}.reachIds`, "drainage-reach")},"depressionBasinIds":${idList(value.depressionBasinIds, `${path}.depressionBasinIds`, "depression-basin")},"valleyCandidateIds":${idList(value.valleyCandidateIds, `${path}.valleyCandidateIds`, "valley")},"floodplainCandidateIds":${idList(value.floodplainCandidateIds, `${path}.floodplainCandidateIds`, "floodplain")},"crossingCandidateIds":${idList(value.crossingCandidateIds, `${path}.crossingCandidateIds`, "crossing")}}`;
    return { cell: cell.value, text };
  });
  const strategicSeen = new Set<string>();
  for (let index = 0; index < strategicValues.length; index += 1) {
    const key = `${strategicValues[index].cell.row},${strategicValues[index].cell.column}`;
    if (strategicSeen.has(key)) reject(`$.strategicTerrain[${index}].cell`, `duplicate strategic cell ${key}`);
    strategicSeen.add(key);
  }
  const strategic = `[${[...strategicValues].sort((a, b) => compareStrategicCell(a.cell, b.cell)).map((item) => item.text).join(",")}]`;

  const coastlineValues = array(root.coastline, "$.coastline").map((item, index) => coastlineItem(item, `$.coastline[${index}]`, width * 250, height * 250));
  const coastSeen = new Set<string>();
  for (let index = 0; index < coastlineValues.length; index += 1) {
    if (coastSeen.has(coastlineValues[index].key)) reject(`$.coastline[${index}]`, `duplicate coastline key ${coastlineValues[index].key}`);
    coastSeen.add(coastlineValues[index].key);
  }
  const coastline = `[${[...coastlineValues].sort((a, b) => compareAscii(a.key, b.key)).map((item) => item.text).join(",")}]`;

  const terminalRefs: {
    readonly id: string;
    readonly kind: "ocean_outlet" | "retained_closed_basin" | "external_domain_outlet";
    readonly point: WorldM0PointM;
    readonly catchmentId: string;
  }[] = [];
  const terminals = registry(root.terminals, "$.terminals", "terminal", (item, path) => {
    const value = record(item, ["id", "kind", "point", "catchmentId", "localContributingAreaM2"], path);
    const itemId = id(value.id, "terminal", `${path}.id`);
    const localArea = numberValue(value.localContributingAreaM2, `${path}.localContributingAreaM2`);
    if ((value.localContributingAreaM2 as number) < 0) reject(`${path}.localContributingAreaM2`, "expected nonnegative terminal local area");
    const kind = literal(value.kind, ["ocean_outlet", "retained_closed_basin", "external_domain_outlet"], `${path}.kind`);
    const terminalPoint = point(value.point, `${path}.point`);
    const catchmentId = id(value.catchmentId, "catchment", `${path}.catchmentId`);
    terminalRefs.push({ id: itemId, kind, point: terminalPoint.value, catchmentId });
    return { id: itemId, text: `{"id":${jsonString(itemId)},"kind":${jsonString(kind)},"point":${terminalPoint.text},"catchmentId":${jsonString(catchmentId)},"localContributingAreaM2":${localArea}}` };
  });
  const catchmentRefs: {
    readonly id: string;
    readonly terminalId: string;
    readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
  }[] = [];
  const catchments = registry(root.catchments, "$.catchments", "catchment", (item, path) => {
    const value = record(item, ["id", "terminalId", "areaM2", "boundaryRings"], path);
    const itemId = id(value.id, "catchment", `${path}.id`);
    const terminalId = id(value.terminalId, "terminal", `${path}.terminalId`);
    const rings = boundaryRingRegistry(value.boundaryRings, `${path}.boundaryRings`);
    catchmentRefs.push({ id: itemId, terminalId, boundaryRings: rings.rings });
    return { id: itemId, text: `{"id":${jsonString(itemId)},"terminalId":${jsonString(terminalId)},"areaM2":${numberValue(value.areaM2, `${path}.areaM2`)},"boundaryRings":${rings.text}}` };
  });
  const nodes = registry(root.drainageNodes, "$.drainageNodes", "drainage-node", (item, path) => {
    const value = record(item, ["id", "point", "kind", "terminalId"], path);
    const itemId = id(value.id, "drainage-node", `${path}.id`);
    return { id: itemId, text: `{"id":${jsonString(itemId)},"point":${point(value.point, `${path}.point`).text},"kind":${jsonString(literal(value.kind, ["source", "confluence", "terminal"], `${path}.kind`))},"terminalId":${nullable(value.terminalId, (entry) => jsonString(id(entry, "terminal", `${path}.terminalId`)))}}` };
  });
  const reaches = registry(root.drainageReaches, "$.drainageReaches", "drainage-reach", (item, path) => {
    const value = record(item, ["id", "upstreamNodeId", "downstreamNodeId", "downstreamReachId", "catchmentId", "terminalId", "geometry", "lengthMeters", "contributingAreaM2", "localContributingAreaM2", "meanTerrainGradient", "localReliefMeters", "channelIncisionMeters"], path);
    const itemId = id(value.id, "drainage-reach", `${path}.id`);
    const geometry = pointSequence(value.geometry, `${path}.geometry`, 2);
    requireSimpleOpenSequence(geometry.points, `${path}.geometry`);
    return { id: itemId, text: `{"id":${jsonString(itemId)},"upstreamNodeId":${jsonString(id(value.upstreamNodeId, "drainage-node", `${path}.upstreamNodeId`))},"downstreamNodeId":${jsonString(id(value.downstreamNodeId, "drainage-node", `${path}.downstreamNodeId`))},"downstreamReachId":${nullable(value.downstreamReachId, (entry) => jsonString(id(entry, "drainage-reach", `${path}.downstreamReachId`)))},"catchmentId":${jsonString(id(value.catchmentId, "catchment", `${path}.catchmentId`))},"terminalId":${jsonString(id(value.terminalId, "terminal", `${path}.terminalId`))},"geometry":${geometry.text},"lengthMeters":${numberValue(value.lengthMeters, `${path}.lengthMeters`)},"contributingAreaM2":${numberValue(value.contributingAreaM2, `${path}.contributingAreaM2`)},"localContributingAreaM2":${numberValue(value.localContributingAreaM2, `${path}.localContributingAreaM2`)},"meanTerrainGradient":${numberValue(value.meanTerrainGradient, `${path}.meanTerrainGradient`)},"localReliefMeters":${numberValue(value.localReliefMeters, `${path}.localReliefMeters`)},"channelIncisionMeters":${numberValue(value.channelIncisionMeters, `${path}.channelIncisionMeters`)}}` };
  });
  const basins = registry(root.depressionBasins, "$.depressionBasins", "depression-basin", (item, path) => {
    const value = record(item, ["id", "catchmentId", "floorPoint", "floorElevationMeters", "spillElevationMeters", "outletTerminalId", "closedEndorheic", "areaM2", "boundaryRings"], path);
    const itemId = id(value.id, "depression-basin", `${path}.id`);
    const catchmentId = id(value.catchmentId, "catchment", `${path}.catchmentId`);
    const floor = basinFloorPoint(value.floorPoint, `${path}.floorPoint`, width, height);
    const floorElevationText = numberValue(value.floorElevationMeters, `${path}.floorElevationMeters`);
    const spillText = nullable(value.spillElevationMeters, (entry) => numberValue(entry, `${path}.spillElevationMeters`));
    const outletText = nullable(value.outletTerminalId, (entry) => jsonString(id(entry, "terminal", `${path}.outletTerminalId`)));
    const closedText = booleanValue(value.closedEndorheic, `${path}.closedEndorheic`);
    const areaText = numberValue(value.areaM2, `${path}.areaM2`);
    const rings = boundaryRingRegistry(value.boundaryRings, `${path}.boundaryRings`);
    const linkedCatchment = catchmentRefs.find((candidate) => candidate.id === catchmentId);
    if (!linkedCatchment) reject(`${path}.catchmentId`, "basin requires its linked catchment");
    const linkedTerminal = terminalRefs.find((candidate) => candidate.id === linkedCatchment.terminalId);
    if (!linkedTerminal || linkedTerminal.catchmentId !== catchmentId) {
      reject(`${path}.catchmentId`, "basin linked catchment/terminal must be reciprocal");
    }
    if (!boundaryRegistryContainsPoint(rings.rings, floor.value)) {
      reject(`${path}.floorPoint`, "floor point must belong to basin filled geometry");
    }
    if (!boundaryRegistryContainsPoint(linkedCatchment.boundaryRings, floor.value)) {
      reject(`${path}.floorPoint`, "floor point must belong to linked catchment");
    }
    const closed = value.closedEndorheic as boolean;
    const spill = value.spillElevationMeters as number | null;
    const outlet = value.outletTerminalId === null ? null : id(value.outletTerminalId, "terminal", `${path}.outletTerminalId`);
    const floorElevation = value.floorElevationMeters as number;
    if (closed) {
      if (spill !== null || outlet !== null || linkedTerminal.kind !== "retained_closed_basin" ||
          !samePoint(linkedTerminal.point, floor.value)) {
        reject(path, "closed basin requires null spill/outlet and reciprocal retained-closed terminal at floor point");
      }
    } else if (spill === null || spill <= floorElevation || outlet === null || outlet !== linkedTerminal.id ||
               samePoint(linkedTerminal.point, floor.value)) {
      reject(path, "exorheic basin requires finite spill above raw floor and a distinct onward terminal");
    }
    return { id: itemId, text: `{"id":${jsonString(itemId)},"catchmentId":${jsonString(catchmentId)},"floorPoint":${floor.text},"floorElevationMeters":${floorElevationText},"spillElevationMeters":${spillText},"outletTerminalId":${outletText},"closedEndorheic":${closedText},"areaM2":${areaText},"boundaryRings":${rings.text}}` };
  });
  const valleys = registry(root.valleys, "$.valleys", "valley", (item, path) => {
    const value = record(item, ["id", "reachId", "boundaryRings", "areaM2", "localReliefMeters"], path);
    const itemId = id(value.id, "valley", `${path}.id`);
    return { id: itemId, text: `{"id":${jsonString(itemId)},"reachId":${jsonString(id(value.reachId, "drainage-reach", `${path}.reachId`))},"boundaryRings":${boundaryRings(value.boundaryRings, `${path}.boundaryRings`)},"areaM2":${numberValue(value.areaM2, `${path}.areaM2`)},"localReliefMeters":${numberValue(value.localReliefMeters, `${path}.localReliefMeters`)}}` };
  });
  const floodplains = registry(root.floodplainCandidates, "$.floodplainCandidates", "floodplain", (item, path) => {
    const value = record(item, ["id", "reachId", "boundaryRings", "areaM2", "terrainSlope"], path);
    const itemId = id(value.id, "floodplain", `${path}.id`);
    return { id: itemId, text: `{"id":${jsonString(itemId)},"reachId":${jsonString(id(value.reachId, "drainage-reach", `${path}.reachId`))},"boundaryRings":${boundaryRings(value.boundaryRings, `${path}.boundaryRings`)},"areaM2":${numberValue(value.areaM2, `${path}.areaM2`)},"terrainSlope":${numberValue(value.terrainSlope, `${path}.terrainSlope`)}}` };
  });
  const crossings = registry(root.crossingCandidates, "$.crossingCandidates", "crossing", (item, path) => {
    const value = record(item, ["id", "reachId", "strategicEdge", "intersection", "leftBank", "rightBank", "channelIncisionMeters", "firstApproachSlope", "secondApproachSlope"], path);
    const itemId = id(value.id, "crossing", `${path}.id`);
    const edgeValue = record(value.strategicEdge, ["first", "second"], `${path}.strategicEdge`);
    const first = strategicCell(edgeValue.first, `${path}.strategicEdge.first`);
    const second = strategicCell(edgeValue.second, `${path}.strategicEdge.second`);
    const normalized = canonicalStrategicEdge(first.value, second.value);
    if (!normalized.ok || compareStrategicCell(normalized.value.first, first.value) !== 0) reject(`${path}.strategicEdge`, "strategic edge orientation is not canonical");
    return { id: itemId, text: `{"id":${jsonString(itemId)},"reachId":${jsonString(id(value.reachId, "drainage-reach", `${path}.reachId`))},"strategicEdge":{"first":${first.text},"second":${second.text}},"intersection":${point(value.intersection, `${path}.intersection`).text},"leftBank":${point(value.leftBank, `${path}.leftBank`).text},"rightBank":${point(value.rightBank, `${path}.rightBank`).text},"channelIncisionMeters":${numberValue(value.channelIncisionMeters, `${path}.channelIncisionMeters`)},"firstApproachSlope":${numberValue(value.firstApproachSlope, `${path}.firstApproachSlope`)},"secondApproachSlope":${numberValue(value.secondApproachSlope, `${path}.secondApproachSlope`)}}` };
  });
  const provenance = record(root.deterministicProvenance, ["repairOperationCount", "conditionedDepressionCount", "retainedDepressionCount"], "$.deterministicProvenance");
  const provenanceText = `{"repairOperationCount":${integer(provenance.repairOperationCount, "$.deterministicProvenance.repairOperationCount", true)},"conditionedDepressionCount":${integer(provenance.conditionedDepressionCount, "$.deterministicProvenance.conditionedDepressionCount", true)},"retainedDepressionCount":${integer(provenance.retainedDepressionCount, "$.deterministicProvenance.retainedDepressionCount", true)}}`;
  return `{"schema":${jsonString(schema)},"recipeDigest":${jsonString(recipeDigest)},"physicalConstants":${constantsText},"physicalGeneratorVersion":${jsonString(token(root.physicalGeneratorVersion, "$.physicalGeneratorVersion"))},"repairPolicyVersion":${jsonString(token(root.repairPolicyVersion, "$.repairPolicyVersion"))},"numericKernelVersion":${jsonString(token(root.numericKernelVersion, "$.numericKernelVersion"))},"analysis":${analysisText},"provenanceProvinces":${provinces},"strategicTerrain":${strategic},"coastline":${coastline},"terminals":${terminals},"catchments":${catchments},"drainageNodes":${nodes},"drainageReaches":${reaches},"depressionBasins":${basins},"valleys":${valleys},"floodplainCandidates":${floodplains},"crossingCandidates":${crossings},"deterministicProvenance":${provenanceText}}`;
}

export function encodeCanonicalTerrainHydroCandidate(
  input: WorldM0TerrainHydroCandidateV3,
): WorldM0Result<Uint8Array> {
  try {
    return { ok: true, value: new TextEncoder().encode(canonicalText(input)) };
  } catch (error) {
    if (error instanceof CandidateEncodingError) return { ok: false, error: error.failure };
    throw error;
  }
}

export async function computeTerrainHydroCandidateDigest(
  input: WorldM0TerrainHydroCandidateV3,
): Promise<WorldM0Result<WorldM0TerrainHydroCandidateDigest>> {
  const encoded = encodeCanonicalTerrainHydroCandidate(input);
  if (!encoded.ok) return encoded;
  const digestValue = await sha256DigestBytes(encoded.value);
  return { ok: true, value: `${digestValue}` as WorldM0TerrainHydroCandidateDigest };
}
