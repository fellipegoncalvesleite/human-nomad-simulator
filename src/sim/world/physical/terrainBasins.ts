import type { WorldM0Result } from "./failures";
import { worldM0Failure } from "./failures";
import type { WorldM0PhysicalConstantsV1 } from "./physicalConstants";
import type { TerrainDepressionAnalysis, TerrainRetainedDepressionAnalysis } from "./terrainDepressions";
import type { TerrainCoastlineResult } from "./terrainCoastline";
import type { TerrainDrainageGraphResult } from "./terrainDrainage";
import { comparePointM, formatTerrainHydroId, signedRingArea2 } from "./terrainHydroNumeric";
import type {
  TerrainCatchment,
  TerrainDepressionBasin,
  TerrainHydroTerminal,
  TerrainHydroTerminalKind,
  WorldM0PointM,
} from "./terrainHydroTypes";
import type { TerrainScratchGrid } from "./terrainScratch";

function invalid(path: string, detail: string): WorldM0Result<never> {
  return worldM0Failure("M02_CANDIDATE_INVALID", path, detail);
}
function bound(path: string, detail: string): WorldM0Result<never> {
  return worldM0Failure("M02_BOUND_EXCEEDED", path, detail);
}
function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function samePoint(left: WorldM0PointM, right: WorldM0PointM): boolean {
  return left.xM === right.xM && left.yM === right.yM;
}
function comparePointSequence(left: readonly WorldM0PointM[], right: readonly WorldM0PointM[]): number {
  const common = Math.min(left.length, right.length);
  for (let index = 0; index < common; index += 1) {
    const order = comparePointM(left[index], right[index]);
    if (order !== 0) return order;
  }
  return compareNumber(left.length, right.length);
}
function pointSegmentDistanceSquared(previous: WorldM0PointM, vertex: WorldM0PointM, next: WorldM0PointM): number {
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
function pointInRing(point: WorldM0PointM, ring: readonly WorldM0PointM[]): boolean {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 2; index < ring.length - 1; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if ((current.yM > point.yM) !== (previous.yM > point.yM)) {
      const crossingX = current.xM + ((point.yM - current.yM) * (previous.xM - current.xM)) /
        (previous.yM - current.yM);
      if (crossingX > point.xM) inside = !inside;
    }
  }
  return inside;
}
function ringInteriorProbe(ring: readonly WorldM0PointM[]): WorldM0PointM | undefined {
  const area = signedRingArea2(ring);
  if (!area.ok) return undefined;
  const first = ring[0];
  const second = ring[1];
  const dx = second.xM - first.xM;
  const dy = second.yM - first.yM;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return undefined;
  const side = Math.sign(area.value);
  return {
    xM: (first.xM + second.xM) / 2 + side * (-dy / length),
    yM: (first.yM + second.yM) / 2 + side * (dx / length),
  };
}

interface RingWithDepth {
  readonly geometry: readonly WorldM0PointM[];
  readonly depth: number;
}

function normalizeRingRegistryOrder(rings: readonly (readonly WorldM0PointM[])[], path: string): WorldM0Result<readonly (readonly WorldM0PointM[])[]> {
  const classified: RingWithDepth[] = [];
  for (let index = 0; index < rings.length; index += 1) {
    const probe = ringInteriorProbe(rings[index]);
    if (probe === undefined) return invalid(`${path}[${index}]`, "ring lacks an exact interior probe");
    let depth = 0;
    for (let peer = 0; peer < rings.length; peer += 1) {
      if (peer !== index && pointInRing(probe, rings[peer])) depth += 1;
    }
    const area = signedRingArea2(rings[index]);
    if (!area.ok || ((depth & 1) === 0 ? area.value <= 0 : area.value >= 0)) {
      return invalid(`${path}[${index}]`, "ring orientation disagrees with containment depth");
    }
    classified.push({ geometry: rings[index], depth });
  }
  classified.sort((left, right) => {
    const leftRole = left.depth & 1;
    const rightRole = right.depth & 1;
    if (leftRole !== rightRole) return leftRole - rightRole;
    if (left.depth !== right.depth) return left.depth - right.depth;
    const first = comparePointM(left.geometry[0], right.geometry[0]);
    return first !== 0 ? first : comparePointSequence(left.geometry, right.geometry);
  });
  return { ok: true, value: classified.map((item) => item.geometry) };
}

/** Normalize one unsimplified raster-ring registry for an M03 pre-key. */
export function normalizeTask9RasterRingFeatureV1(
  originalRings: readonly (readonly WorldM0PointM[])[],
  scratch: TerrainScratchGrid,
  path: string,
): WorldM0Result<readonly (readonly WorldM0PointM[])[]> {
  if (!Array.isArray(originalRings) || originalRings.length === 0) {
    return invalid(path, "raster ring feature must contain at least one ring");
  }
  const normalized: WorldM0PointM[][] = [];
  for (let ringIndex = 0; ringIndex < originalRings.length; ringIndex += 1) {
    const input = originalRings[ringIndex];
    if (!Array.isArray(input) || input.length < 4 || !samePoint(input[0], input[input.length - 1])) {
      return invalid(`${path}[${ringIndex}]`, "ring must be exactly closed");
    }
    const open: WorldM0PointM[] = [];
    for (let index = 0; index + 1 < input.length; index += 1) {
      const point = input[index];
      if (!Number.isFinite(point.xM) || !Number.isFinite(point.yM) || Object.is(point.xM, -0) || Object.is(point.yM, -0) ||
          point.xM % scratch.cellSizeMeters !== 0 || point.yM % scratch.cellSizeMeters !== 0) {
        return invalid(`${path}[${ringIndex}]`, "ring point is not a canonical cell-edge coordinate");
      }
      if (index > 0 && samePoint(point, input[index - 1])) {
        return invalid(`${path}[${ringIndex}]`, "ring contains a zero-length edge");
      }
      if (index > 0 && samePoint(point, input[0])) {
        return invalid(`${path}[${ringIndex}]`, "canonical first point repeats before ring closure");
      }
      open.push({ xM: point.xM, yM: point.yM });
    }
    for (let index = 1; index < open.length; index += 1) {
      if (comparePointM(open[0], open[index]) > 0) {
        return invalid(`${path}[${ringIndex}]`, "ring does not start at its canonical smallest point");
      }
    }
    const geometry = [...open, open[0]];
    const area = signedRingArea2(geometry);
    if (!area.ok) return invalid(`${path}[${ringIndex}]`, area.error.detail);
    normalized.push(geometry);
  }
  return normalizeRingRegistryOrder(normalized, path);
}

function orientation(a: WorldM0PointM, b: WorldM0PointM, c: WorldM0PointM): number {
  const cross = (b.xM - a.xM) * (c.yM - a.yM) - (b.yM - a.yM) * (c.xM - a.xM);
  return cross < 0 ? -1 : cross > 0 ? 1 : 0;
}
function onSegment(a: WorldM0PointM, b: WorldM0PointM, point: WorldM0PointM): boolean {
  return orientation(a, b, point) === 0 && point.xM >= Math.min(a.xM, b.xM) && point.xM <= Math.max(a.xM, b.xM) &&
    point.yM >= Math.min(a.yM, b.yM) && point.yM <= Math.max(a.yM, b.yM);
}
function segmentsConflict(a: WorldM0PointM, b: WorldM0PointM, c: WorldM0PointM, d: WorldM0PointM): boolean {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  if (abc * abd < 0 && cda * cdb < 0) return true;
  if (abc === 0 && abd === 0 && cda === 0 && cdb === 0) {
    const overlapX = Math.max(Math.min(a.xM, b.xM), Math.min(c.xM, d.xM)) < Math.min(Math.max(a.xM, b.xM), Math.max(c.xM, d.xM));
    const overlapY = Math.max(Math.min(a.yM, b.yM), Math.min(c.yM, d.yM)) < Math.min(Math.max(a.yM, b.yM), Math.max(c.yM, d.yM));
    return overlapX || overlapY;
  }
  return (abc === 0 && onSegment(a, b, c) && !samePoint(c, a) && !samePoint(c, b)) ||
    (abd === 0 && onSegment(a, b, d) && !samePoint(d, a) && !samePoint(d, b)) ||
    (cda === 0 && onSegment(c, d, a) && !samePoint(a, c) && !samePoint(a, d)) ||
    (cdb === 0 && onSegment(c, d, b) && !samePoint(b, c) && !samePoint(b, d));
}
function pointKey(point: WorldM0PointM): string {
  const x = Object.is(point.xM, -0) ? 0 : point.xM;
  const y = Object.is(point.yM, -0) ? 0 : point.yM;
  return `${x},${y}`;
}
function lineIntersection(a: WorldM0PointM, b: WorldM0PointM, c: WorldM0PointM, d: WorldM0PointM): WorldM0PointM | undefined {
  const bax = b.xM - a.xM;
  const bay = b.yM - a.yM;
  const dcx = d.xM - c.xM;
  const dcy = d.yM - c.yM;
  const denominator = bax * dcy - bay * dcx;
  if (denominator === 0) return undefined;
  const cax = c.xM - a.xM;
  const cay = c.yM - a.yM;
  const t = (cax * dcy - cay * dcx) / denominator;
  return { xM: a.xM + t * bax, yM: a.yM + t * bay };
}
function segmentRelationEvents(a: WorldM0PointM, b: WorldM0PointM, c: WorldM0PointM, d: WorldM0PointM): readonly string[] {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  if (abc * abd < 0 && cda * cdb < 0) {
    const point = lineIntersection(a, b, c, d);
    return point ? [`cross:${pointKey(point)}`] : ["cross"];
  }
  if (abc === 0 && abd === 0 && cda === 0 && cdb === 0) {
    const common = [a, b, c, d].filter((point, index, items) =>
      onSegment(a, b, point) && onSegment(c, d, point) && items.findIndex((other) => samePoint(other, point)) === index);
    common.sort(comparePointM);
    if (common.length >= 2 && !samePoint(common[0], common[common.length - 1])) {
      return [`overlap:${pointKey(common[0])}:${pointKey(common[common.length - 1])}`];
    }
  }
  const touches = [a, b, c, d].filter((point, index, items) =>
    onSegment(a, b, point) && onSegment(c, d, point) && items.findIndex((other) => samePoint(other, point)) === index);
  touches.sort(comparePointM);
  return touches.map((point) => `touch:${pointKey(point)}`);
}
function registryContainsPoint(point: WorldM0PointM, rings: readonly (readonly WorldM0PointM[])[]): boolean {
  let inside = false;
  for (const ring of rings) if (pointInRing(point, ring)) inside = !inside;
  return inside;
}
function geometryRelationSignature(
  featureRings: readonly (readonly WorldM0PointM[])[],
  reference: readonly WorldM0PointM[],
): string {
  const events = new Set<string>();
  for (const ring of featureRings) {
    for (let left = 0; left + 1 < ring.length; left += 1) {
      for (let right = 0; right + 1 < reference.length; right += 1) {
        for (const event of segmentRelationEvents(ring[left], ring[left + 1], reference[right], reference[right + 1])) events.add(event);
      }
    }
  }
  const referenceInside = reference.slice(0, Math.max(0, reference.length - (samePoint(reference[0], reference[reference.length - 1]) ? 1 : 0)))
    .map((point) => registryContainsPoint(point, featureRings) ? "1" : "0").join("");
  let featureInside = "";
  const referenceClosed = reference.length >= 4 && samePoint(reference[0], reference[reference.length - 1]);
  if (referenceClosed) {
    featureInside = featureRings.map((ring) => {
      const probe = ringInteriorProbe(ring);
      return probe && pointInRing(probe, reference) ? "1" : "0";
    }).join("");
  }
  return `${[...events].sort().join("|")}#${referenceInside}#${featureInside}`;
}
function containmentDepth(ring: readonly WorldM0PointM[], registry: readonly (readonly WorldM0PointM[])[], selfIndex: number): number | undefined {
  const probe = ringInteriorProbe(ring);
  if (!probe) return undefined;
  let depth = 0;
  for (let index = 0; index < registry.length; index += 1) if (index !== selfIndex && pointInRing(probe, registry[index])) depth += 1;
  return depth;
}
function rasterClassificationUnchanged(
  before: readonly (readonly WorldM0PointM[])[],
  after: readonly (readonly WorldM0PointM[])[],
  previous: WorldM0PointM,
  vertex: WorldM0PointM,
  next: WorldM0PointM,
  scratch: TerrainScratchGrid,
): boolean {
  const minX = Math.min(previous.xM, vertex.xM, next.xM);
  const maxX = Math.max(previous.xM, vertex.xM, next.xM);
  const minY = Math.min(previous.yM, vertex.yM, next.yM);
  const maxY = Math.max(previous.yM, vertex.yM, next.yM);
  const minColumn = Math.max(0, Math.ceil(minX / scratch.cellSizeMeters - 0.5));
  const maxColumn = Math.min(scratch.width - 1, Math.floor(maxX / scratch.cellSizeMeters - 0.5));
  const minSouthRow = Math.max(0, Math.ceil(minY / scratch.cellSizeMeters - 0.5));
  const maxSouthRow = Math.min(scratch.height - 1, Math.floor(maxY / scratch.cellSizeMeters - 0.5));
  for (let southRow = minSouthRow; southRow <= maxSouthRow; southRow += 1) {
    const yM = (southRow + 0.5) * scratch.cellSizeMeters;
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const point = { xM: (column + 0.5) * scratch.cellSizeMeters, yM };
      if (registryContainsPoint(point, before) !== registryContainsPoint(point, after)) return false;
    }
  }
  return true;
}

export interface Task9GeometryReferenceV1 {
  readonly originalGeometry: readonly WorldM0PointM[];
  readonly currentGeometry: readonly WorldM0PointM[];
}
export interface Task9RingSimplificationOptionsV1 {
  readonly references?: readonly Task9GeometryReferenceV1[];
  readonly preserveRasterClassification?: boolean;
}
interface RingVertexV1 {
  readonly point: WorldM0PointM;
  readonly originalOrdinal: number;
}
interface RingDeletionCandidateV1 {
  readonly index: number;
  readonly distanceSquared: number;
  readonly point: WorldM0PointM;
  readonly originalOrdinal: number;
}
function deletionCandidateOrder(left: RingDeletionCandidateV1, right: RingDeletionCandidateV1): number {
  return compareNumber(left.distanceSquared, right.distanceSquared) || comparePointM(left.point, right.point) ||
    compareNumber(left.originalOrdinal, right.originalOrdinal);
}
function closedGeometry(vertices: readonly RingVertexV1[]): readonly WorldM0PointM[] {
  const geometry = vertices.map((item) => item.point);
  return [...geometry, geometry[0]];
}
function replacementConflictsSelf(vertices: readonly RingVertexV1[], candidateIndex: number): boolean {
  const count = vertices.length;
  const previous = vertices[(candidateIndex - 1 + count) % count].point;
  const next = vertices[(candidateIndex + 1) % count].point;
  for (let segment = 0; segment < count; segment += 1) {
    if (segment === candidateIndex || segment === (candidateIndex - 1 + count) % count) continue;
    const a = vertices[segment].point;
    const b = vertices[(segment + 1) % count].point;
    if (segmentsConflict(previous, next, a, b)) return true;
  }
  return false;
}

/** Literal §8 tolerance-driven safe-deletion loop for one normalized Task-9 ring feature. */
export function simplifyTask9NormalizedRasterRingFeatureV1(
  normalizedRings: readonly (readonly WorldM0PointM[])[],
  scratch: TerrainScratchGrid,
  constants: WorldM0PhysicalConstantsV1,
  path: string,
  options: Task9RingSimplificationOptionsV1 = {},
): WorldM0Result<readonly (readonly WorldM0PointM[])[]> {
  const checked = normalizeTask9RasterRingFeatureV1(normalizedRings, scratch, path);
  if (!checked.ok) return checked;
  const toleranceSquared = constants.geometry.simplifyToleranceMeters * constants.geometry.simplifyToleranceMeters;
  if (!Number.isFinite(toleranceSquared) || toleranceSquared < 0) return invalid(path, "simplification tolerance is invalid");
  const originalRegistry = checked.value;
  const baselineReferenceSignatures = (options.references ?? []).map((reference) =>
    geometryRelationSignature(originalRegistry, reference.originalGeometry));
  const originalDepths = originalRegistry.map((ring, index) => containmentDepth(ring, originalRegistry, index));
  if (originalDepths.some((depth) => depth === undefined)) return invalid(path, "ring registry lacks a stable containment depth");

  const finalized: WorldM0PointM[][] = [];
  for (let ringIndex = 0; ringIndex < originalRegistry.length; ringIndex += 1) {
    const original = originalRegistry[ringIndex];
    const originalArea = signedRingArea2(original);
    if (!originalArea.ok || originalArea.value === 0) return invalid(`${path}[${ringIndex}]`, "ring has invalid signed area");
    const vertices: RingVertexV1[] = original.slice(0, -1).map((point, originalOrdinal) => ({ point: { ...point }, originalOrdinal }));
    while (vertices.length > 3) {
      const candidates: RingDeletionCandidateV1[] = [];
      for (let index = 1; index < vertices.length; index += 1) {
        const previous = vertices[index - 1].point;
        const vertex = vertices[index].point;
        const next = vertices[(index + 1) % vertices.length].point;
        const distanceSquared = pointSegmentDistanceSquared(previous, vertex, next);
        if (!Number.isFinite(distanceSquared)) return invalid(`${path}[${ringIndex}]`, "simplification candidate has invalid point-to-segment distance");
        if (distanceSquared <= toleranceSquared) {
          candidates.push({ index, distanceSquared, point: vertex, originalOrdinal: vertices[index].originalOrdinal });
        }
      }
      candidates.sort(deletionCandidateOrder);
      let accepted = false;
      for (const candidate of candidates) {
        if (vertices.length <= 3 || replacementConflictsSelf(vertices, candidate.index)) continue;
        const beforeRing = closedGeometry(vertices);
        const proposedVertices = vertices.filter((_, index) => index !== candidate.index);
        if (proposedVertices.length < 3) continue;
        const proposedRing = closedGeometry(proposedVertices);
        const proposedArea = signedRingArea2(proposedRing);
        if (!proposedArea.ok || proposedArea.value === 0 || Math.sign(proposedArea.value) !== Math.sign(originalArea.value)) continue;
        const currentRegistry = [...finalized, beforeRing, ...originalRegistry.slice(ringIndex + 1)];
        const proposedRegistry = [...finalized, proposedRing, ...originalRegistry.slice(ringIndex + 1)];
        let topologySafe = true;
        for (let peer = 0; peer < originalRegistry.length; peer += 1) {
          if (peer === ringIndex) continue;
          const currentPeer = peer < ringIndex ? finalized[peer] : originalRegistry[peer];
          const baseline = geometryRelationSignature([original], originalRegistry[peer]);
          const after = geometryRelationSignature([proposedRing], currentPeer);
          if (baseline !== after) { topologySafe = false; break; }
        }
        if (!topologySafe) continue;
        const proposedDepths = proposedRegistry.map((ring, index) => containmentDepth(ring, proposedRegistry, index));
        if (proposedDepths.some((depth, index) => depth !== originalDepths[index])) continue;
        const previous = vertices[(candidate.index - 1 + vertices.length) % vertices.length].point;
        const vertex = vertices[candidate.index].point;
        const next = vertices[(candidate.index + 1) % vertices.length].point;
        if (options.preserveRasterClassification !== false &&
            !rasterClassificationUnchanged(currentRegistry, proposedRegistry, previous, vertex, next, scratch)) continue;
        for (let referenceIndex = 0; referenceIndex < (options.references?.length ?? 0); referenceIndex += 1) {
          const reference = options.references?.[referenceIndex];
          if (!reference || geometryRelationSignature(proposedRegistry, reference.currentGeometry) !== baselineReferenceSignatures[referenceIndex]) {
            topologySafe = false; break;
          }
        }
        if (!topologySafe) continue;
        vertices.splice(candidate.index, 1);
        accepted = true;
        break;
      }
      if (!accepted) break;
    }
    const geometry = closedGeometry(vertices);
    finalized.push(geometry as WorldM0PointM[]);
  }
  const normalized = normalizeRingRegistryOrder(finalized, path);
  if (!normalized.ok) return normalized;
  const totalVertices = normalized.value.reduce((sum, ring) => sum + ring.length, 0);
  if (totalVertices > constants.geometry.maxPolygonVerticesPerFeature) {
    return bound("geometry.maxPolygonVerticesPerFeature", "polygon feature exceeds final vertex bound");
  }
  return normalized;
}

/** Task-9 convenience finalizer for one already-collected feature. */
export function finalizeTask9RasterRingFeatureV1(
  originalRings: readonly (readonly WorldM0PointM[])[],
  scratch: TerrainScratchGrid,
  constants: WorldM0PhysicalConstantsV1,
  path: string,
  options: Task9RingSimplificationOptionsV1 = {},
): WorldM0Result<readonly (readonly WorldM0PointM[])[]> {
  const normalized = normalizeTask9RasterRingFeatureV1(originalRings, scratch, path);
  return normalized.ok ? simplifyTask9NormalizedRasterRingFeatureV1(normalized.value, scratch, constants, path, options) : normalized;
}

export function compareTask9RingRegistryV1(
  left: readonly (readonly WorldM0PointM[])[],
  right: readonly (readonly WorldM0PointM[])[],
): number {
  const common = Math.min(left.length, right.length);
  for (let index = 0; index < common; index += 1) {
    const order = comparePointSequence(left[index], right[index]);
    if (order !== 0) return order;
  }
  return compareNumber(left.length, right.length);
}

function registryAreaM2(rings: readonly (readonly WorldM0PointM[])[]): number | undefined {
  let doubledArea = 0;
  for (const ring of rings) {
    const area = signedRingArea2(ring);
    if (!area.ok) return undefined;
    doubledArea += area.value;
  }
  return doubledArea / 2;
}
function floorPoint(item: TerrainRetainedDepressionAnalysis, scratch: TerrainScratchGrid): WorldM0PointM | undefined {
  if (!Number.isSafeInteger(item.canonicalFloorCell) || item.canonicalFloorCell < 0 ||
      item.canonicalFloorCell >= scratch.width * scratch.height) return undefined;
  const row = Math.floor(item.canonicalFloorCell / scratch.width);
  const column = item.canonicalFloorCell - row * scratch.width;
  return {
    xM: (column + 0.5) * scratch.cellSizeMeters,
    yM: (scratch.height - row - 0.5) * scratch.cellSizeMeters,
  };
}
function terminalKindOrder(kind: TerrainHydroTerminalKind): number {
  return kind === "retained_closed_basin" ? 0 : kind === "ocean_outlet" ? 1 : 2;
}
function compareTerminalPhysical(left: TerrainHydroTerminal, right: TerrainHydroTerminal): number {
  const kind = terminalKindOrder(left.kind) - terminalKindOrder(right.kind);
  return kind !== 0 ? kind : comparePointM(left.point, right.point);
}
function compareCatchmentPhysical(
  left: TerrainCatchment,
  right: TerrainCatchment,
  leftTerminal: TerrainHydroTerminal,
  rightTerminal: TerrainHydroTerminal,
): number {
  const terminal = compareTerminalPhysical(leftTerminal, rightTerminal);
  if (terminal !== 0) return terminal;
  const rings = compareTask9RingRegistryV1(left.boundaryRings, right.boundaryRings);
  return rings !== 0 ? rings : compareNumber(left.areaM2, right.areaM2);
}

function findUniqueById<T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
): T | undefined {
  let match: T | undefined;
  for (const item of items) {
    if (item.id !== id) continue;
    if (match !== undefined) return undefined;
    match = item;
  }
  return match;
}

interface BasinCandidate {
  readonly analysis: TerrainRetainedDepressionAnalysis;
  readonly floorPoint: WorldM0PointM;
  readonly catchment: TerrainCatchment;
  readonly terminal: TerrainHydroTerminal;
  readonly unsimplifiedBoundaryRings: readonly (readonly WorldM0PointM[])[];
  readonly boundaryRings?: readonly (readonly WorldM0PointM[])[];
}

function compareBasinDomain3PreKey(left: BasinCandidate, right: BasinCandidate): number {
  if (left.analysis.closedEndorheic !== right.analysis.closedEndorheic) return left.analysis.closedEndorheic ? 1 : -1;
  const floor = comparePointM(left.floorPoint, right.floorPoint);
  if (floor !== 0) return floor;
  const elevation = compareNumber(left.analysis.floorElevationMeters, right.analysis.floorElevationMeters);
  if (elevation !== 0) return elevation;
  const spill = compareNumber(left.analysis.physicalSpillElevationMeters, right.analysis.physicalSpillElevationMeters);
  if (spill !== 0) return spill;
  const area = compareNumber(left.analysis.areaM2, right.analysis.areaM2);
  return area !== 0 ? area : compareTask9RingRegistryV1(left.unsimplifiedBoundaryRings, right.unsimplifiedBoundaryRings);
}

function compareBasinFinalPhysicalKey(left: BasinCandidate, right: BasinCandidate): number {
  if (left.analysis.closedEndorheic !== right.analysis.closedEndorheic) return left.analysis.closedEndorheic ? 1 : -1;
  const floor = comparePointM(left.floorPoint, right.floorPoint);
  if (floor !== 0) return floor;
  const floorElevation = compareNumber(left.analysis.floorElevationMeters, right.analysis.floorElevationMeters);
  if (floorElevation !== 0) return floorElevation;
  const leftSpill = left.analysis.persistentSpillElevationMeters;
  const rightSpill = right.analysis.persistentSpillElevationMeters;
  if (leftSpill === null || rightSpill === null) {
    if (leftSpill !== rightSpill) return leftSpill === null ? 1 : -1;
  } else {
    const spill = compareNumber(leftSpill, rightSpill);
    if (spill !== 0) return spill;
  }
  const rings = compareTask9RingRegistryV1(left.boundaryRings ?? [], right.boundaryRings ?? []);
  if (rings !== 0) return rings;
  return compareCatchmentPhysical(left.catchment, right.catchment, left.terminal, right.terminal);
}

export function finalizeDepressionBasins(
  scratch: TerrainScratchGrid,
  depression: TerrainDepressionAnalysis,
  coastline: TerrainCoastlineResult,
  drainage: TerrainDrainageGraphResult,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<readonly TerrainDepressionBasin[]> {
  if (!coastline || !Array.isArray(coastline.coastline) || !Number.isFinite(coastline.seaLevelMeters) ||
      !Number.isFinite(coastline.landAreaM2) || !Number.isFinite(coastline.oceanAreaM2) ||
      coastline.coastline.some((trace) => !Array.isArray(trace) || trace.length < 2)) {
    return invalid("coastline", "Task-9 requires the exact finalized Task-5 coastline authority");
  }
  if (depression.retainedDepressions.length > constants.depression.maxRetainedBasins) {
    return bound("depression.maxRetainedBasins", "retained basin count exceeds verified bound");
  }
  if (drainage.retainedDepressionLinks.length !== depression.retainedDepressions.length) {
    return invalid("retainedDepressionLinks", "retained basin/link registry is not one-to-one");
  }

  // M03 domain 3: collect and normalize the COMPLETE unsimplified domain first.
  const originalDomain: BasinCandidate[] = [];
  const tokens = new Set<string>();
  for (const item of depression.retainedDepressions) {
    if (tokens.has(item.token) || !/^depression-analysis:[0-9a-f]{16}$/.test(item.token)) {
      return invalid("retainedDepressions.token", "retained depression token is invalid or duplicated");
    }
    tokens.add(item.token);
    const point = floorPoint(item, scratch);
    let link: TerrainDrainageGraphResult["retainedDepressionLinks"][number] | undefined;
    for (const candidateLink of drainage.retainedDepressionLinks) {
      if (candidateLink.depressionToken !== item.token) continue;
      if (link !== undefined) return invalid("retainedDepressionLinks", "duplicate retained depression link");
      link = candidateLink;
    }
    const catchment = link ? findUniqueById(drainage.catchments, link.catchmentId) : undefined;
    const terminal = link ? findUniqueById(drainage.terminals, link.terminalId) : undefined;
    if (!point || !link || !catchment || !terminal || catchment.terminalId !== terminal.id || terminal.catchmentId !== catchment.id) {
      return invalid("retainedDepressionLinks", "retained depression lacks exact reciprocal catchment/terminal linkage");
    }
    if (!Number.isFinite(item.floorElevationMeters) || !Number.isFinite(item.physicalSpillElevationMeters) ||
        !Number.isFinite(item.areaM2) || item.areaM2 <= 0) {
      return invalid("retainedDepressions", "retained basin physical tuple is invalid");
    }
    if (item.floorElevationMeters !== scratch.elevationMeters[item.canonicalFloorCell]) {
      return invalid("retainedDepressions.floorElevationMeters", "retained basin floor elevation must be the canonical raw floor-cell elevation");
    }
    if (item.closedEndorheic) {
      if (item.protectedIntentToken === null || item.persistentSpillElevationMeters !== null || terminal.kind !== "retained_closed_basin") {
        return invalid("retainedDepressions.spill", "closed basin requires protected intent, null persistent spill, and retained-closed terminal");
      }
      if (!samePoint(point, terminal.point)) {
        return invalid("retainedDepressions.floorPoint", "closed basin floor must equal its retained-closed terminal point");
      }
    } else if (item.protectedIntentToken !== null || item.persistentSpillElevationMeters === null ||
               !Number.isFinite(item.persistentSpillElevationMeters) ||
               item.persistentSpillElevationMeters !== item.physicalSpillElevationMeters ||
               item.persistentSpillElevationMeters <= item.floorElevationMeters || samePoint(point, terminal.point)) {
      return invalid("retainedDepressions.spill", "exorheic basin requires no protected intent, exact finite persistent spill, and an onward terminal");
    }
    const normalized = normalizeTask9RasterRingFeatureV1(item.boundaryRings, scratch, "depressionBasins.boundaryRings");
    if (!normalized.ok) return normalized;
    if (!registryContainsPoint(point, normalized.value)) {
      return invalid("retainedDepressions.floorPoint", "canonical floor point is outside retained basin filled geometry");
    }
    if (!registryContainsPoint(point, catchment.boundaryRings)) {
      return invalid("retainedDepressions.floorPoint", "canonical floor point is outside its linked catchment");
    }
    if (registryAreaM2(normalized.value) !== item.areaM2) {
      return invalid("retainedDepressions.areaM2", "retained basin area disagrees with its unsimplified boundary rings");
    }
    originalDomain.push({ analysis: item, floorPoint: point, catchment, terminal, unsimplifiedBoundaryRings: normalized.value });
  }

  // Exact domain-3 pre-key sort happens before the first deletion.
  originalDomain.sort(compareBasinDomain3PreKey);
  for (let index = 1; index < originalDomain.length; index += 1) {
    if (compareBasinDomain3PreKey(originalDomain[index - 1], originalDomain[index]) === 0) {
      return invalid("depressionBasins", "duplicate complete domain-3 pre-key");
    }
  }

  // Literal M03 domain 3. The complete domain is already canonically sorted.
  // Earlier peers are FINAL, later peers remain ORIGINAL; domains 0-2 are final
  // immutable references and are never recomputed from scratch state.
  const finalDomain: BasinCandidate[] = [];
  for (let index = 0; index < originalDomain.length; index += 1) {
    const candidate = originalDomain[index];
    const references: Task9GeometryReferenceV1[] = [];
    for (let peer = 0; peer < originalDomain.length; peer += 1) {
      if (peer === index) continue;
      const originalPeer = originalDomain[peer].unsimplifiedBoundaryRings;
      const currentPeer = peer < index ? finalDomain[peer].boundaryRings : originalPeer;
      if (!currentPeer) return invalid("depressionBasins", "earlier domain-3 peer is not final");
      for (let ringIndex = 0; ringIndex < originalPeer.length; ringIndex += 1) {
        references.push({
          originalGeometry: originalPeer[ringIndex],
          currentGeometry: currentPeer[ringIndex],
        });
      }
    }
    for (const trace of coastline.coastline) references.push({ originalGeometry: trace, currentGeometry: trace });
    for (const catchment of drainage.catchments) {
      for (const ring of catchment.boundaryRings) references.push({ originalGeometry: ring, currentGeometry: ring });
    }
    for (const reach of drainage.reaches) references.push({ originalGeometry: reach.geometry, currentGeometry: reach.geometry });
    const rings = simplifyTask9NormalizedRasterRingFeatureV1(
      candidate.unsimplifiedBoundaryRings, scratch, constants, `depressionBasins[${index}].boundaryRings`,
      { references, preserveRasterClassification: true });
    if (!rings.ok) return rings;
    finalDomain.push({ ...candidate, boundaryRings: rings.value });
  }

  // Domain 3 is final; only now sort by final basin physical key and assign IDs.
  finalDomain.sort(compareBasinFinalPhysicalKey);
  for (let index = 1; index < finalDomain.length; index += 1) {
    if (compareBasinFinalPhysicalKey(finalDomain[index - 1], finalDomain[index]) === 0) {
      return invalid("depressionBasins", "duplicate complete final basin physical key");
    }
  }
  const result: TerrainDepressionBasin[] = [];
  for (let index = 0; index < finalDomain.length; index += 1) {
    const candidate = finalDomain[index];
    if (!candidate.boundaryRings) return invalid("depressionBasins", "domain-3 geometry did not cross the finalization barrier");
    const basinId = formatTerrainHydroId("depression-basin", index);
    if (!basinId.ok) return basinId;
    result.push({
      id: basinId.value,
      catchmentId: candidate.catchment.id,
      floorPoint: candidate.floorPoint,
      floorElevationMeters: candidate.analysis.floorElevationMeters,
      spillElevationMeters: candidate.analysis.persistentSpillElevationMeters,
      outletTerminalId: candidate.analysis.closedEndorheic ? null : candidate.terminal.id,
      closedEndorheic: candidate.analysis.closedEndorheic,
      areaM2: candidate.analysis.areaM2,
      boundaryRings: candidate.boundaryRings,
    });
  }
  return { ok: true, value: result };
}
