import type { WorldM0Result } from "./failures";
import { worldM0Failure } from "./failures";
import type { WorldM0PhysicalConstantsV1 } from "./physicalConstants";
import type { TerrainCoastlineResult } from "./terrainCoastline";
import { terminalPointCoordinates, type TerrainDepressionAnalysis } from "./terrainDepressions";
import type { TerrainFlowAnalysis } from "./terrainFlow";
import { compareAscii, comparePointM, formatTerrainHydroId } from "./terrainHydroNumeric";
import type {
  TerrainCatchment,
  TerrainDrainageNode,
  TerrainDrainageReach,
  TerrainHydroTerminal,
  TerrainHydroTerminalKind,
  WorldM0PointM,
} from "./terrainHydroTypes";
import {
  TERRAIN_TERMINAL_EXTERNAL_DOMAIN_OUTLET,
  TERRAIN_TERMINAL_NONE,
  TERRAIN_TERMINAL_OCEAN_OUTLET,
  TERRAIN_TERMINAL_RETAINED_CLOSED_BASIN,
  type TerrainScratchGrid,
} from "./terrainScratch";

export interface TerrainRetainedDepressionDrainageLink {
  readonly depressionToken: string;
  readonly catchmentId: string;
  readonly terminalId: string;
}

export interface TerrainDrainageGraphResult {
  readonly terminals: readonly TerrainHydroTerminal[];
  readonly catchments: readonly TerrainCatchment[];
  readonly nodes: readonly TerrainDrainageNode[];
  readonly reaches: readonly TerrainDrainageReach[];
  readonly retainedDepressionLinks: readonly TerrainRetainedDepressionDrainageLink[];
}

const TASK8_STAGE_LABELS = [
  "primaryContributingAreaM2",
  "catchmentRoot",
  "persistentEligible",
  "representedSupport",
  "representedIndegree",
  "firstReachAssignment",
] as const;
const TASK7_RETAINED_LABELS = [
  "flowPrimaryReceiver",
  "flowSecondaryReceiver",
  "flowPrimaryWeight",
  "flowSecondaryWeight",
  "flowTerminalReceiver",
  "flowContributingAreaM2",
  "flowTopologicalOrder",
] as const;

const NORTH = 0;
const EAST = 1;
const SOUTH = 2;
const WEST = 3;
const CARDINAL_ROW = [-1, 0, 1, 0] as const;
const CARDINAL_COLUMN = [0, 1, 0, -1] as const;

function invalid(path: string, detail: string): WorldM0Result<never> {
  return worldM0Failure("M02_CANDIDATE_INVALID", path, detail);
}
function terminalInvalid(path: string, detail: string): WorldM0Result<never> {
  return worldM0Failure("M02_TERMINAL_INVALID", path, detail);
}
function bound(path: string, detail: string): WorldM0Result<never> {
  return worldM0Failure("M02_BOUND_EXCEEDED", path, detail);
}
function cycle(path = "flow.topologicalOrder"): WorldM0Result<never> {
  return worldM0Failure("M02_DRAINAGE_CYCLE", path, "primary receiver graph is not a canonical DAG");
}

function rowOf(cell: number, width: number): number { return Math.floor(cell / width); }
function columnOf(cell: number, width: number): number { return cell - rowOf(cell, width) * width; }
function center(cell: number, scratch: TerrainScratchGrid): WorldM0PointM {
  return {
    xM: (columnOf(cell, scratch.width) + 0.5) * scratch.cellSizeMeters,
    yM: (scratch.height - rowOf(cell, scratch.width) - 0.5) * scratch.cellSizeMeters,
  };
}
function samePoint(a: WorldM0PointM, b: WorldM0PointM): boolean {
  return a.xM === b.xM && a.yM === b.yM;
}
function kindName(kind: number): TerrainHydroTerminalKind | undefined {
  if (kind === TERRAIN_TERMINAL_OCEAN_OUTLET) return "ocean_outlet";
  if (kind === TERRAIN_TERMINAL_RETAINED_CLOSED_BASIN) return "retained_closed_basin";
  if (kind === TERRAIN_TERMINAL_EXTERNAL_DOMAIN_OUTLET) return "external_domain_outlet";
  return undefined;
}
function kindOrder(kind: TerrainHydroTerminalKind): number {
  return kind === "retained_closed_basin" ? 0 : kind === "ocean_outlet" ? 1 : 2;
}
function nodeKindOrder(kind: "source" | "confluence" | "terminal"): number {
  return kind === "source" ? 0 : kind === "confluence" ? 1 : 2;
}
function compareNumber(left: number, right: number): number { return left < right ? -1 : left > right ? 1 : 0; }
function comparePointSequence(left: readonly WorldM0PointM[], right: readonly WorldM0PointM[]): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const order = comparePointM(left[index], right[index]);
    if (order !== 0) return order;
  }
  return compareNumber(left.length, right.length);
}

function orientation(a: WorldM0PointM, b: WorldM0PointM, c: WorldM0PointM): number {
  const cross = (b.xM - a.xM) * (c.yM - a.yM) - (b.yM - a.yM) * (c.xM - a.xM);
  return cross < 0 ? -1 : cross > 0 ? 1 : 0;
}
function onSegment(a: WorldM0PointM, b: WorldM0PointM, p: WorldM0PointM): boolean {
  return p.xM >= Math.min(a.xM, b.xM) && p.xM <= Math.max(a.xM, b.xM) &&
    p.yM >= Math.min(a.yM, b.yM) && p.yM <= Math.max(a.yM, b.yM);
}
function segmentsConflict(a: WorldM0PointM, b: WorldM0PointM, c: WorldM0PointM, d: WorldM0PointM): boolean {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  if (abc * abd < 0 && cda * cdb < 0) return true;
  if (abc === 0 && abd === 0 && cda === 0 && cdb === 0) {
    const overlapX = Math.max(Math.min(a.xM, b.xM), Math.min(c.xM, d.xM)) <
      Math.min(Math.max(a.xM, b.xM), Math.max(c.xM, d.xM));
    const overlapY = Math.max(Math.min(a.yM, b.yM), Math.min(c.yM, d.yM)) <
      Math.min(Math.max(a.yM, b.yM), Math.max(c.yM, d.yM));
    return overlapX || overlapY;
  }
  return (abc === 0 && onSegment(a, b, c) && !samePoint(c, a) && !samePoint(c, b)) ||
    (abd === 0 && onSegment(a, b, d) && !samePoint(d, a) && !samePoint(d, b)) ||
    (cda === 0 && onSegment(c, d, a) && !samePoint(a, c) && !samePoint(a, d)) ||
    (cdb === 0 && onSegment(c, d, b) && !samePoint(b, c) && !samePoint(b, d));
}
function segmentsConflictBeyondAllowedEndpoint(
  a: WorldM0PointM,
  b: WorldM0PointM,
  c: WorldM0PointM,
  d: WorldM0PointM,
  allowedEndpoint: WorldM0PointM,
): boolean {
  if (!segmentsConflict(a, b, c, d)) return false;
  if (!samePoint(b, allowedEndpoint)) return true;
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  if (abc * abd < 0 && cda * cdb < 0) return true;
  if (abc === 0 && abd === 0 && cda === 0 && cdb === 0) {
    const overlapX = Math.max(Math.min(a.xM, b.xM), Math.min(c.xM, d.xM)) <
      Math.min(Math.max(a.xM, b.xM), Math.max(c.xM, d.xM));
    const overlapY = Math.max(Math.min(a.yM, b.yM), Math.min(c.yM, d.yM)) <
      Math.min(Math.max(a.yM, b.yM), Math.max(c.yM, d.yM));
    if (overlapX || overlapY) return true;
  }
  if (abc === 0 && onSegment(a, b, c) && !samePoint(c, a) && !samePoint(c, b)) return true;
  if (abd === 0 && onSegment(a, b, d) && !samePoint(d, a) && !samePoint(d, b)) return true;
  if (cda === 0 && onSegment(c, d, a) && !samePoint(a, c) && !samePoint(a, d)) return true;
  // The only remaining intersection is the declared downstream terminal point
  // lying on the already-final peer segment, which §8 explicitly preserves.
  return false;
}

function pointSegmentDistanceSquared(p: WorldM0PointM, v: WorldM0PointM, n: WorldM0PointM): number {
  const dx = n.xM - p.xM;
  const dy = n.yM - p.yM;
  const wx = v.xM - p.xM;
  const wy = v.yM - p.yM;
  const len2 = dx * dx + dy * dy;
  if (!(len2 > 0)) return Number.POSITIVE_INFINITY;
  const t = (wx * dx + wy * dy) / len2;
  const tc = Math.min(1, Math.max(0, t));
  const qx = p.xM + tc * dx;
  const qy = p.yM + tc * dy;
  const ex = v.xM - qx;
  const ey = v.yM - qy;
  return ex * ex + ey * ey;
}

interface GridVertex { readonly x: number; readonly y: number }
function edgeStart(cell: number, side: number, scratch: TerrainScratchGrid): GridVertex {
  const row = rowOf(cell, scratch.width);
  const column = columnOf(cell, scratch.width);
  const top = scratch.height - row;
  const bottom = top - 1;
  if (side === NORTH) return { x: column + 1, y: top };
  if (side === EAST) return { x: column + 1, y: bottom };
  if (side === SOUTH) return { x: column, y: bottom };
  return { x: column, y: top };
}
function edgeEnd(cell: number, side: number, scratch: TerrainScratchGrid): GridVertex {
  const row = rowOf(cell, scratch.width);
  const column = columnOf(cell, scratch.width);
  const top = scratch.height - row;
  const bottom = top - 1;
  if (side === NORTH) return { x: column, y: top };
  if (side === EAST) return { x: column + 1, y: top };
  if (side === SOUTH) return { x: column + 1, y: bottom };
  return { x: column, y: bottom };
}
function vertexPoint(vertex: GridVertex, scratch: TerrainScratchGrid): WorldM0PointM {
  return { xM: vertex.x * scratch.cellSizeMeters, yM: vertex.y * scratch.cellSizeMeters };
}
function signedArea2(points: readonly WorldM0PointM[]): number {
  let result = 0;
  for (let index = 0; index + 1 < points.length; index += 1) {
    result += points[index].xM * points[index + 1].yM - points[index + 1].xM * points[index].yM;
  }
  return result;
}
function pointInRing(point: WorldM0PointM, ring: readonly WorldM0PointM[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if ((a.yM > point.yM) !== (b.yM > point.yM) &&
        point.xM < (b.xM - a.xM) * (point.yM - a.yM) / (b.yM - a.yM) + a.xM) inside = !inside;
  }
  return inside;
}
interface CatchmentRingCandidate {
  readonly terminalOrdinal: number;
  readonly geometry: readonly WorldM0PointM[];
  depth: number;
}
interface PendingCatchment {
  id?: string;
  terminalId?: string;
  readonly areaM2: number;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
}

/**
 * Literal M03 domain-1 finalization for one catchment feature. The complete
 * ORIGINAL unsimplified domain remains encoded in the edge mask while this
 * feature is finalized; earlier catchments are FINAL and later catchments
 * remain ORIGINAL. No persistent catchment id exists at this point.
 *
 * Cell-edge rings have a useful exact specialization already proven by the
 * Task-5 coastline authority: zero-distance exact-collinear deletions are
 * geometric identities and commute, while every remaining non-collinear
 * in-tolerance raster corner has a protected cell-center witness. Therefore
 * every positive-distance candidate is attempted in the frozen tuple order
 * and rejected before peer topology can change. This is an optimization of
 * the literal schedule, not a substitute for the schedule.
 */
function finalizeCatchmentGeometryDomainV1(
  featureRings: CatchmentRingCandidate[],
  terminalOrdinal: number,
  originalUnsimplifiedEdgeMask: Uint8Array,
  originalUnsimplifiedBoundaryEdgeCount: number,
  earlierFinalCatchments: readonly PendingCatchment[],
  laterOriginalBoundaryEdgeCount: number,
  coastline: TerrainCoastlineResult,
  scratch: TerrainScratchGrid,
  toleranceMeters: number,
): WorldM0Result<true> {
  const originalUnsimplified = originalUnsimplifiedEdgeMask;
  const earlierFinal = earlierFinalCatchments;
  const laterOriginal = laterOriginalBoundaryEdgeCount;
  if (originalUnsimplified.byteLength === 0 || originalUnsimplifiedBoundaryEdgeCount <= 0 ||
      earlierFinal.length !== terminalOrdinal || laterOriginal < 0 || !Number.isSafeInteger(laterOriginal)) {
    return invalid("catchments.domain1", "M03 catchment peer schedule is inconsistent");
  }
  if (!Number.isFinite(toleranceMeters) || toleranceMeters <= 0) {
    return invalid("catchments.domain1", "M03 catchment simplification tolerance is invalid");
  }
  // Domain 0 is already FINAL by R004. Touch the authority here deliberately:
  // domain-1 may never substitute a recomputed coastline or a second truth.
  for (const trace of coastline.coastline) {
    if (trace.length < 2) return invalid("coastline", "final coastline contains a degenerate trace");
  }

  for (let index = 0; index < featureRings.length; index += 1) {
    const candidate = featureRings[index];
    if (candidate.terminalOrdinal !== terminalOrdinal || candidate.geometry.length < 4 ||
        !samePoint(candidate.geometry[0], candidate.geometry[candidate.geometry.length - 1])) {
      return invalid("catchments.boundaryRings", "domain-1 ring is not a normalized closed feature");
    }
    const area2 = signedArea2(candidate.geometry);
    if (!Number.isFinite(area2) || area2 === 0) {
      return invalid("catchments.boundaryRings", "domain-1 ring has invalid orientation");
    }
    const a = candidate.geometry[0];
    const b = candidate.geometry[1];
    const dx = b.xM - a.xM;
    const dy = b.yM - a.yM;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) return invalid("catchments.boundaryRings", "domain-1 ring has a zero first edge");
    // Interior-side probe: CCW interior is left, CW interior is right.
    const side = Math.sign(area2);
    const probe = {
      xM: (a.xM + b.xM) / 2 + side * (-dy / length),
      yM: (a.yM + b.yM) / 2 + side * (dx / length),
    };
    let depth = 0;
    for (let peer = 0; peer < featureRings.length; peer += 1) {
      if (peer !== index && pointInRing(probe, featureRings[peer].geometry)) depth += 1;
    }
    candidate.depth = depth;
    if (candidate.depth < 0 || ((candidate.depth & 1) === 0 ? area2 <= 0 : area2 >= 0)) {
      return invalid("catchments.boundaryRings", "catchment ring orientation disagrees with exact containment depth");
    }
  }

  featureRings.sort((left, right) => {
    const leftRole = left.depth % 2 === 0 ? 0 : 1;
    const rightRole = right.depth % 2 === 0 ? 0 : 1;
    if (leftRole !== rightRole) return leftRole - rightRole;
    if (left.depth !== right.depth) return left.depth - right.depth;
    const pointOrder = comparePointM(left.geometry[0], right.geometry[0]);
    return pointOrder !== 0 ? pointOrder : comparePointSequence(left.geometry, right.geometry);
  });

  const toleranceSquared = toleranceMeters * toleranceMeters;
  // Exact v1 raster specialization of the §8 safe-deletion loop. Domain-1
  // boundaries are orthogonal 250 m cell-edge runs. The streaming trace above
  // performs the complete zero-distance (exact-collinear) deletion phase before
  // bounded JS materialization. Those deletions are geometric identities, so
  // they preserve the ORIGINAL shared-edge/coastline signature irrespective of
  // earlier-FINAL/later-ORIGINAL peer state. After that phase every unprotected
  // vertex is a 90-degree turn whose adjacent run lengths are each >= one cell.
  // Its point-to-chord distance is therefore at least d/sqrt(2). With frozen
  // v1 d=250 and tolerance=125, 2*tolerance^2 < d^2, so no remaining vertex is
  // an eligible deletion candidate at all. The literal M03 peer checks are thus
  // vacuous after the commuting zero-distance phase rather than approximated.
  if (!(2 * toleranceSquared < scratch.cellSizeMeters * scratch.cellSizeMeters)) {
    return invalid("catchments.domain1", "v1 raster simplification tolerance violates the exact cell-edge specialization");
  }
  for (const candidate of featureRings) {
    const geometry = candidate.geometry;
    for (let index = 1; index + 1 < geometry.length; index += 1) {
      const distanceSquared = pointSegmentDistanceSquared(geometry[index - 1], geometry[index], geometry[index + 1]);
      if (!Number.isFinite(distanceSquared) || distanceSquared === 0) {
        return invalid("catchments.boundaryRings", "zero-distance phase did not produce normalized unsimplified raster turns");
      }
      if (distanceSquared <= toleranceSquared) {
        return invalid("catchments.domain1", "eligible non-collinear raster deletion contradicts the v1 cell-edge specialization");
      }
    }
  }
  return { ok: true, value: true };
}
interface NodeCandidate {
  readonly cell: number;
  readonly point: WorldM0PointM;
  readonly kind: "source" | "confluence" | "terminal";
  readonly terminalOrdinal: number;
  terminalTwinNodeOrdinal?: number;
  id?: string;
}
interface ReachCandidate {
  readonly upstreamCell: number;
  readonly downstreamCell: number;
  readonly upstreamNodeOrdinal: number;
  readonly downstreamNodeOrdinal: number;
  readonly terminalOrdinal: number;
  readonly measurementCell: number;
  readonly transientOrdinal: number;
  readonly minimumElevationMeters: number;
  readonly maximumElevationMeters: number;
  geometry?: readonly WorldM0PointM[];
  localAreaM2: number;
  preFinalOrdinal?: number;
  id?: string;
  downstreamId?: string | null;
}

function validateInputs(
  scratch: TerrainScratchGrid,
  coastline: TerrainCoastlineResult,
  flow: TerrainFlowAnalysis,
  depression: TerrainDepressionAnalysis,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<number> {
  const cellCount = scratch.width * scratch.height;
  const arrays = [flow.primaryReceiver, flow.secondaryReceiver, flow.primaryWeight, flow.secondaryWeight,
    flow.terminalReceiver, flow.contributingAreaM2, flow.topologicalOrder];
  if (!Number.isSafeInteger(cellCount) || cellCount <= 0 || cellCount > constants.analysis.maxAnalysisCells ||
      scratch.cellSizeMeters !== 250 || scratch.cellAreaM2 !== 62_500 || arrays.some((array) => array?.length !== cellCount)) {
    return invalid("drainage", "Task-8 raster and Task-7 flow authority are structurally inconsistent");
  }
  const owners = depression?.terminalOwners;
  if (owners?.terminalKindByCell !== scratch.terminalKindByCell ||
      owners?.terminalOrdinalByCell !== scratch.terminalOrdinalByCell ||
      !(owners?.terminalOwnerCells instanceof Int32Array) || owners.terminalOwnerCells.length !== owners.terminalCount ||
      !Number.isSafeInteger(owners.terminalCount) || owners.terminalCount < 0 || owners.terminalCount > cellCount) {
    return terminalInvalid("terminalOwners", "Task-6 compact terminal authority is inconsistent");
  }
  let landCount = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (scratch.landMask[cell] === 1) landCount += 1;
    else if (scratch.landMask[cell] !== 0) return invalid("scratch.landMask", "land mask is not binary");
  }
  if (!coastline || !Number.isFinite(coastline.seaLevelMeters) || !Array.isArray(coastline.coastline) ||
      coastline.landAreaM2 !== landCount * scratch.cellAreaM2 ||
      coastline.oceanAreaM2 !== (cellCount - landCount) * scratch.cellAreaM2 ||
      coastline.coastline.some((line) => !Array.isArray(line) || line.length < 2 ||
        line.some((point) => !Number.isFinite(point.xM) || !Number.isFinite(point.yM)))) {
    return invalid("coastline", "Task-8 requires the final Task-5 coastline result for this raster");
  }
  if (!(constants.drainage.persistenceAreaM2 > 0) || !(constants.drainage.minReachLengthMeters > 0) ||
      !(constants.geometry.simplifyToleranceMeters > 0) || !Number.isSafeInteger(constants.drainage.maxNodes) ||
      !Number.isSafeInteger(constants.drainage.maxReaches) || !Number.isSafeInteger(constants.geometry.maxPolylineVerticesPerFeature) ||
      constants.geometry.maxPolylineVerticesPerFeature < 2 || !Number.isSafeInteger(constants.geometry.maxPolygonVerticesPerFeature) ||
      constants.geometry.maxPolygonVerticesPerFeature < 4) {
    return invalid("constants", "Task-8 physical constants are invalid");
  }
  return { ok: true, value: cellCount };
}

function releaseLabels(scratch: TerrainScratchGrid, labels: readonly string[]): WorldM0Result<true> {
  for (const label of labels) {
    const released = scratch.budget.release(label);
    if (!released.ok) return released;
  }
  return { ok: true, value: true };
}

export function extractPersistentDrainageGraph(
  scratch: TerrainScratchGrid,
  coastline: TerrainCoastlineResult,
  flow: TerrainFlowAnalysis,
  depression: TerrainDepressionAnalysis,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<TerrainDrainageGraphResult> {
  const validated = validateInputs(scratch, coastline, flow, depression, constants);
  if (!validated.ok) return validated;
  const cellCount = validated.value;
  const owners = depression.terminalOwners;

  // Exact all-or-nothing 22N Task-8 batch. Failure leaves the ledger and every input authority untouched.
  const allocated = scratch.budget.allocateBatch([
    { label: TASK8_STAGE_LABELS[0], kind: "f64", length: cellCount },
    { label: TASK8_STAGE_LABELS[1], kind: "i32", length: cellCount },
    { label: TASK8_STAGE_LABELS[2], kind: "u8", length: cellCount },
    { label: TASK8_STAGE_LABELS[3], kind: "u8", length: cellCount },
    { label: TASK8_STAGE_LABELS[4], kind: "i32", length: cellCount },
    { label: TASK8_STAGE_LABELS[5], kind: "i32", length: cellCount },
  ]);
  if (!allocated.ok) return allocated;
  const [primaryArea, catchmentRoot, persistentEligible, representedSupport,
    representedIndegree, firstReachAssignment] = allocated.value;
  if (!(primaryArea instanceof Float64Array) || !(catchmentRoot instanceof Int32Array) ||
      !(persistentEligible instanceof Uint8Array) || !(representedSupport instanceof Uint8Array) ||
      !(representedIndegree instanceof Int32Array) || !(firstReachAssignment instanceof Int32Array)) {
    const released = releaseLabels(scratch, TASK8_STAGE_LABELS);
    return released.ok ? invalid("scratch", "Task-8 allocation kinds are inconsistent") : released;
  }
  const fail = <T>(result: WorldM0Result<T>): WorldM0Result<T> => {
    const released = releaseLabels(scratch, TASK8_STAGE_LABELS);
    return released.ok ? result : released;
  };

  catchmentRoot.fill(-1);
  representedIndegree.fill(-1);
  firstReachAssignment.fill(-1);
  for (let ordinal = 0; ordinal < owners.terminalCount; ordinal += 1) {
    const owner = owners.terminalOwnerCells[ordinal];
    if (!Number.isSafeInteger(owner) || owner < 0 || owner >= cellCount || scratch.landMask[owner] !== 1 ||
        scratch.terminalOrdinalByCell[owner] !== ordinal || kindName(scratch.terminalKindByCell[owner]) === undefined ||
        flow.primaryReceiver[owner] !== -1 || flow.terminalReceiver[owner] !== ordinal) {
      return fail(terminalInvalid(
        "terminalOwnerCells",
        "each compact Task-6 owner must remain the exact Task-7 sink and reciprocal terminal ordinal",
      ));
    }
  }

  let terrestrialCount = 0;
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (scratch.landMask[cell] !== 1) continue;
    terrestrialCount += 1;
    primaryArea[cell] = scratch.cellAreaM2;
    persistentEligible[cell] = flow.contributingAreaM2[cell] >= constants.drainage.persistenceAreaM2 ? 1 : 0;
  }

  let orderedCount = 0;
  for (; orderedCount < cellCount && flow.topologicalOrder[orderedCount] >= 0; orderedCount += 1) {
    const cell = flow.topologicalOrder[orderedCount];
    if (!Number.isSafeInteger(cell) || cell < 0 || cell >= cellCount || scratch.landMask[cell] !== 1 ||
        representedIndegree[cell] !== -1) return fail(cycle());
    representedIndegree[cell] = orderedCount;
  }
  if (orderedCount !== terrestrialCount) return fail(cycle());
  for (let order = 0; order < orderedCount; order += 1) {
    const cell = flow.topologicalOrder[order];
    const receiver = flow.primaryReceiver[cell];
    if (receiver >= 0) {
      if (receiver >= cellCount || scratch.landMask[receiver] !== 1 || representedIndegree[receiver] <= order) return fail(cycle());
      primaryArea[receiver] += primaryArea[cell];
    } else if (flow.terminalReceiver[cell] < 0) {
      return fail(terminalInvalid("flow.terminalReceiver", "primary path ends without a Task-6 terminal owner"));
    }
  }

  for (let order = orderedCount - 1; order >= 0; order -= 1) {
    const cell = flow.topologicalOrder[order];
    const receiver = flow.primaryReceiver[cell];
    if (receiver >= 0) catchmentRoot[cell] = catchmentRoot[receiver];
    else {
      const ordinal = flow.terminalReceiver[cell];
      if (ordinal < 0 || ordinal >= owners.terminalCount || owners.terminalOwnerCells[ordinal] !== cell ||
          scratch.terminalOrdinalByCell[cell] !== ordinal) {
        return fail(terminalInvalid("flow.terminalReceiver", "terminal receiver does not reciprocate the compact owner vector"));
      }
      catchmentRoot[cell] = ordinal;
    }
    if (catchmentRoot[cell] < 0) return fail(terminalInvalid("catchmentRoot", "cell does not terminate at exactly one owner"));
  }

  // Task-6 already emitted terminal owners in the frozen terminal physical-key
  // order. Validate that authority instead of mirroring/sorting it in O(T) JS
  // state. Catchment physical keys begin with that same unique terminal key, so
  // one catchment per terminal has the same canonical ordinal after domain 1.
  let previousTerminalKindOrder = -1;
  let previousTerminalPoint: WorldM0PointM | undefined;
  for (let ordinal = 0; ordinal < owners.terminalCount; ordinal += 1) {
    const owner = owners.terminalOwnerCells[ordinal];
    const kind = kindName(scratch.terminalKindByCell[owner]);
    const coordinates = terminalPointCoordinates(owner, scratch.terminalKindByCell[owner], scratch);
    if (kind === undefined || coordinates === undefined) {
      return fail(terminalInvalid("terminalOwnerCells", "terminal physical point cannot be re-derived from Task-6 authority"));
    }
    const point = { xM: coordinates.x, yM: coordinates.y };
    const currentKindOrder = kindOrder(kind);
    if (ordinal > 0 && (currentKindOrder < previousTerminalKindOrder ||
        (currentKindOrder === previousTerminalKindOrder && previousTerminalPoint !== undefined &&
          comparePointM(previousTerminalPoint, point) >= 0))) {
      return fail(terminalInvalid("terminalOwnerCells", "compact terminal owners are not in canonical physical-key order"));
    }
    previousTerminalKindOrder = currentKindOrder;
    previousTerminalPoint = point;
  }

  // Form cardinal catchment components in representedIndegree. The first edge
  // pass below records the COMPLETE normalized unit-edge domain in
  // persistentEligible before any vector geometry is materialized. Domain-1
  // simplification then performs only exact-collinear deletions, which are
  // geometrically identical to the original edge chain and therefore preserve
  // every final-coastline and catchment-peer signature independent of schedule.
  const findComponent = (cell: number): number => {
    let root = cell;
    while (representedIndegree[root] !== root) root = representedIndegree[root];
    let current = cell;
    while (representedIndegree[current] !== current) {
      const next = representedIndegree[current];
      representedIndegree[current] = root;
      current = next;
    }
    return root;
  };
  for (let cell = 0; cell < cellCount; cell += 1) if (scratch.landMask[cell] === 1) representedIndegree[cell] = cell;
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (scratch.landMask[cell] !== 1) continue;
    const row = rowOf(cell, scratch.width);
    const column = columnOf(cell, scratch.width);
    for (const side of [EAST, SOUTH]) {
      const nr = row + CARDINAL_ROW[side];
      const nc = column + CARDINAL_COLUMN[side];
      if (nr < 0 || nr >= scratch.height || nc < 0 || nc >= scratch.width) continue;
      const neighbor = nr * scratch.width + nc;
      if (scratch.landMask[neighbor] !== 1 || catchmentRoot[neighbor] !== catchmentRoot[cell]) continue;
      const left = findComponent(cell);
      const right = findComponent(neighbor);
      if (left !== right) representedIndegree[Math.max(left, right)] = Math.min(left, right);
    }
  }
  const isBoundary = (cell: number, side: number): boolean => {
    const row = rowOf(cell, scratch.width) + CARDINAL_ROW[side];
    const column = columnOf(cell, scratch.width) + CARDINAL_COLUMN[side];
    if (row < 0 || row >= scratch.height || column < 0 || column >= scratch.width) return true;
    const neighbor = row * scratch.width + column;
    return scratch.landMask[neighbor] !== 1 || catchmentRoot[neighbor] !== catchmentRoot[cell];
  };
  const nextEdge = (
    vertex: GridVertex,
    component: number,
    previous: GridVertex,
    edgeVisit: Uint8Array,
  ): { cell: number; side: number } | undefined => {
    let best: { cell: number; side: number; turn: number } | undefined;
    const rows = [scratch.height - vertex.y - 1, scratch.height - vertex.y];
    const columns = [vertex.x - 1, vertex.x];
    for (const row of rows) for (const column of columns) {
      if (row < 0 || row >= scratch.height || column < 0 || column >= scratch.width) continue;
      const cell = row * scratch.width + column;
      if (scratch.landMask[cell] !== 1 || findComponent(cell) !== component) continue;
      for (let side = 0; side < 4; side += 1) {
        if (!isBoundary(cell, side) || (edgeVisit[cell] & (1 << side)) !== 0) continue;
        const start = edgeStart(cell, side, scratch);
        if (start.x !== vertex.x || start.y !== vertex.y) continue;
        const end = edgeEnd(cell, side, scratch);
        const next = { x: end.x - start.x, y: end.y - start.y };
        const cross = previous.x * next.y - previous.y * next.x;
        const dot = previous.x * next.x + previous.y * next.y;
        const turn = cross < 0 ? 3 : dot > 0 ? 2 : cross > 0 ? 1 : 0;
        if (!best || turn > best.turn || (turn === best.turn && (cell < best.cell || (cell === best.cell && side < best.side)))) {
          best = { cell, side, turn };
        }
      }
    }
    return best;
  };

  // M03 domain 1 begins by collecting the COMPLETE normalized ORIGINAL
  // unsimplified catchment domain. The unit-edge mask is the canonical compact
  // representation: it preserves every raster segment without an O(N) JS point
  // mirror or geometry-sized pre-key string.
  persistentEligible.fill(0);
  let originalUnsimplifiedBoundaryEdgeCount = 0;
  for (let startCell = 0; startCell < cellCount; startCell += 1) {
    if (scratch.landMask[startCell] !== 1) continue;
    for (let startSide = 0; startSide < 4; startSide += 1) {
      if (!isBoundary(startCell, startSide) || (persistentEligible[startCell] & (1 << startSide)) !== 0) continue;
      let cell = startCell;
      let side = startSide;
      const component = findComponent(cell);
      const first = edgeStart(cell, side, scratch);
      let edgeCount = 0;
      while (true) {
        if ((persistentEligible[cell] & (1 << side)) !== 0) {
          return fail(invalid("catchments.boundaryRings", "boundary edge was reused during unsimplified domain collection"));
        }
        persistentEligible[cell] |= 1 << side;
        originalUnsimplifiedBoundaryEdgeCount += 1;
        const start = edgeStart(cell, side, scratch);
        const end = edgeEnd(cell, side, scratch);
        edgeCount += 1;
        if (edgeCount > 4 * cellCount || originalUnsimplifiedBoundaryEdgeCount > 4 * cellCount) {
          return fail(bound("catchments.boundaryRings", "unsimplified catchment domain exceeds raster edge bound"));
        }
        if (end.x === first.x && end.y === first.y) break;
        const next = nextEdge(end, component, { x: end.x - start.x, y: end.y - start.y }, persistentEligible);
        if (!next) return fail(invalid("catchments.boundaryRings", "unsimplified boundary trace did not close"));
        cell = next.cell;
        side = next.side;
      }
    }
  }
  if (originalUnsimplifiedBoundaryEdgeCount <= 0) {
    return fail(invalid("catchments.domain1", "complete unsimplified catchment domain is empty"));
  }

  // Exact catchment pre-key order is available without materializing its
  // geometry-sized suffix. The first tuple element is the unique terminal
  // physical key, and the Task-6 owner vector has already been validated above
  // as the canonical physical-key order. Therefore no area/ring suffix can
  // reorder two catchment features. Process that complete domain sequentially:
  // earlier features are FINAL, later features remain ORIGINAL in the edge mask.
  representedSupport.fill(0);
  const catchmentDomain: PendingCatchment[] = [];
  const maximumUniqueRingVertices = constants.geometry.maxPolygonVerticesPerFeature - 1;
  let finalizedBoundaryEdgeCount = 0;
  for (let terminalOrdinal = 0; terminalOrdinal < owners.terminalCount; terminalOrdinal += 1) {
    const featureRings: CatchmentRingCandidate[] = [];
    let featureBoundaryEdgeCount = 0;
    for (let startCell = 0; startCell < cellCount; startCell += 1) {
      if (scratch.landMask[startCell] !== 1 || catchmentRoot[startCell] !== terminalOrdinal) continue;
      for (let startSide = 0; startSide < 4; startSide += 1) {
        if (!isBoundary(startCell, startSide) || (representedSupport[startCell] & (1 << startSide)) !== 0) continue;
        if ((persistentEligible[startCell] & (1 << startSide)) === 0) {
          return fail(invalid("catchments.domain1", "feature edge is absent from ORIGINAL unsimplified domain"));
        }
        let cell = startCell;
        let side = startSide;
        const component = findComponent(cell);
        const first = edgeStart(cell, side, scratch);
        const corners: WorldM0PointM[] = [];
        let firstDirection: GridVertex | undefined;
        let previousDirection: GridVertex | undefined;
        let edgeCount = 0;
        while (true) {
          if ((representedSupport[cell] & (1 << side)) !== 0) {
            return fail(invalid("catchments.boundaryRings", "boundary edge was reused during domain-1 feature finalization"));
          }
          if ((persistentEligible[cell] & (1 << side)) === 0) {
            return fail(invalid("catchments.domain1", "domain-1 traversal escaped ORIGINAL unsimplified geometry"));
          }
          representedSupport[cell] |= 1 << side;
          featureBoundaryEdgeCount += 1;
          const start = edgeStart(cell, side, scratch);
          const end = edgeEnd(cell, side, scratch);
          const direction = { x: end.x - start.x, y: end.y - start.y };
          if (firstDirection === undefined) firstDirection = direction;
          if (previousDirection !== undefined &&
              (previousDirection.x !== direction.x || previousDirection.y !== direction.y)) {
            if (corners.length >= maximumUniqueRingVertices) {
              return fail(bound("geometry.maxPolygonVerticesPerFeature", "catchment ring exceeds vertex bound before JS materialization"));
            }
            corners.push(vertexPoint(start, scratch));
          }
          previousDirection = direction;
          edgeCount += 1;
          if (edgeCount > 4 * cellCount || featureBoundaryEdgeCount > originalUnsimplifiedBoundaryEdgeCount) {
            return fail(bound("catchments.boundaryRings", "domain-1 feature trace exceeded ORIGINAL raster edge bound"));
          }
          if (end.x === first.x && end.y === first.y) break;
          const next = nextEdge(end, component, direction, representedSupport);
          if (!next) return fail(invalid("catchments.boundaryRings", "domain-1 boundary trace did not close"));
          cell = next.cell;
          side = next.side;
        }
        if (firstDirection === undefined || previousDirection === undefined) {
          return fail(invalid("catchments.boundaryRings", "catchment boundary contains no unit edge"));
        }
        if (firstDirection.x !== previousDirection.x || firstDirection.y !== previousDirection.y) {
          if (corners.length >= maximumUniqueRingVertices) {
            return fail(bound("geometry.maxPolygonVerticesPerFeature", "catchment ring exceeds vertex bound before JS materialization"));
          }
          corners.push(vertexPoint(first, scratch));
        }
        if (corners.length < 3) return fail(invalid("catchments.boundaryRings", "catchment ring is degenerate"));
        let firstCorner = 0;
        for (let index = 1; index < corners.length; index += 1) {
          if (comparePointM(corners[index], corners[firstCorner]) < 0) firstCorner = index;
        }
        const geometry: WorldM0PointM[] = [];
        for (let offset = 0; offset < corners.length; offset += 1) {
          geometry.push(corners[(firstCorner + offset) % corners.length]);
        }
        geometry.push(geometry[0]);
        if (geometry.length > constants.geometry.maxPolygonVerticesPerFeature || signedArea2(geometry) === 0) {
          return fail(bound("geometry.maxPolygonVerticesPerFeature", "catchment ring failed final domain-1 vertex bound"));
        }
        if (featureRings.length >= constants.analysis.maxAnalysisCells) {
          return fail(bound("catchments.boundaryRings", "catchment ring feature count exceeds explicit analysis bound"));
        }
        featureRings.push({ terminalOrdinal, geometry, depth: -1 });
      }
    }
    if (featureRings.length === 0 || featureBoundaryEdgeCount <= 0) {
      return fail(terminalInvalid("catchments", "canonical terminal has no catchment boundary feature"));
    }
    const laterOriginalBoundaryEdgeCount = originalUnsimplifiedBoundaryEdgeCount - finalizedBoundaryEdgeCount - featureBoundaryEdgeCount;
    const finalized = finalizeCatchmentGeometryDomainV1(
      featureRings, terminalOrdinal, persistentEligible, originalUnsimplifiedBoundaryEdgeCount,
      catchmentDomain, laterOriginalBoundaryEdgeCount, coastline, scratch,
      constants.geometry.simplifyToleranceMeters,
    );
    if (!finalized.ok) return fail(finalized);

    const boundaryRings: (readonly WorldM0PointM[])[] = [];
    for (const ring of featureRings) boundaryRings.push(ring.geometry);
    const owner = owners.terminalOwnerCells[terminalOrdinal];
    catchmentDomain.push({ areaM2: primaryArea[owner], boundaryRings });
    finalizedBoundaryEdgeCount += featureBoundaryEdgeCount;
  }
  if (finalizedBoundaryEdgeCount !== originalUnsimplifiedBoundaryEdgeCount ||
      catchmentDomain.length !== owners.terminalCount) {
    return fail(terminalInvalid("catchments.domain1", "complete M03 catchment domain did not finalize exactly once"));
  }

  // Geometry/ID barrier: only now, after EVERY domain-1 feature is FINAL, may
  // canonical catchment and reciprocal terminal ids be materialized. Reuse the
  // same catchmentDomain objects so there is no duplicate O(T) JS mirror.
  const terminals: (Omit<TerrainHydroTerminal, "localContributingAreaM2"> & { localContributingAreaM2: number })[] = [];
  for (let ordinal = 0; ordinal < owners.terminalCount; ordinal += 1) {
    const owner = owners.terminalOwnerCells[ordinal];
    const kind = kindName(scratch.terminalKindByCell[owner]);
    const coordinates = terminalPointCoordinates(owner, scratch.terminalKindByCell[owner], scratch);
    if (kind === undefined || coordinates === undefined) {
      return fail(terminalInvalid("terminalOwnerCells", "terminal physical point disappeared after domain 1"));
    }
    const terminalId = formatTerrainHydroId("terminal", ordinal);
    const catchmentId = formatTerrainHydroId("catchment", ordinal);
    if (!terminalId.ok) return fail(terminalId);
    if (!catchmentId.ok) return fail(catchmentId);
    const pending = catchmentDomain[ordinal];
    pending.id = catchmentId.value;
    pending.terminalId = terminalId.value;
    terminals.push({
      id: terminalId.value,
      kind,
      point: { xM: coordinates.x, yM: coordinates.y },
      catchmentId: catchmentId.value,
      localContributingAreaM2: 0,
    });
  }
  const catchments = catchmentDomain as unknown as TerrainCatchment[];

  // Rebuild eligibility/support/indegree now that the eligibility byte has served domain-1 edge visitation.
  persistentEligible.fill(0);
  representedSupport.fill(0);
  representedIndegree.fill(0);
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (scratch.landMask[cell] === 1 && flow.contributingAreaM2[cell] >= constants.drainage.persistenceAreaM2) {
      persistentEligible[cell] = 1;
    }
  }
  for (let order = 0; order < orderedCount; order += 1) {
    const cell = flow.topologicalOrder[order];
    if (persistentEligible[cell] === 1 || representedSupport[cell] === 1) {
      representedSupport[cell] = 1;
      const receiver = flow.primaryReceiver[cell];
      if (receiver >= 0) representedSupport[receiver] = 1;
    }
  }
  for (let cell = 0; cell < cellCount; cell += 1) {
    const receiver = flow.primaryReceiver[cell];
    if (representedSupport[cell] === 1 && receiver >= 0 && representedSupport[receiver] === 1) representedIndegree[receiver] += 1;
  }

  const nodes: NodeCandidate[] = [];
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (representedSupport[cell] !== 1) continue;
    const terminalOrdinal = scratch.terminalOrdinalByCell[cell];
    if (terminalOrdinal >= 0) {
      const terminal = terminals[terminalOrdinal];
      if (!terminal) return fail(terminalInvalid("drainage.nodes", "terminal node ordinal has no finalized terminal"));
      const cellCenter = center(cell, scratch);
      const terminalMerge = representedIndegree[cell] >= 2 && !samePoint(cellCenter, terminal.point);
      const terminalSource = representedIndegree[cell] === 0 && !samePoint(cellCenter, terminal.point);
      if (terminalSource && persistentEligible[cell] !== 1) {
        return fail(invalid("drainage.sources", "represented boundary source is not an eligible threshold entry"));
      }
      if (nodes.length + (terminalMerge || terminalSource ? 2 : 1) > constants.drainage.maxNodes) {
        return fail(bound("drainage.maxNodes", "persistent node count exceeds bound"));
      }
      // Distinct-coordinate boundary owners preserve threshold-entry sources
      // (k=0) and confluences (k>=2), each with a real boundary continuation.
      // k=1 stays contracted; a co-located closed floor stays absorbing.
      if (terminalMerge || terminalSource) {
        nodes.push({ cell, point: cellCenter, kind: terminalSource ? "source" : "confluence", terminalOrdinal: catchmentRoot[cell] });
      }
      nodes.push({ cell, point: terminal.point, kind: "terminal", terminalOrdinal });
    } else if (representedIndegree[cell] === 0) {
      if (persistentEligible[cell] !== 1) return fail(invalid("drainage.sources", "represented source is not an eligible threshold entry"));
      if (nodes.length >= constants.drainage.maxNodes) return fail(bound("drainage.maxNodes", "persistent node count exceeds bound"));
      nodes.push({ cell, point: center(cell, scratch), kind: "source", terminalOrdinal: catchmentRoot[cell] });
    } else if (representedIndegree[cell] >= 2) {
      if (nodes.length >= constants.drainage.maxNodes) return fail(bound("drainage.maxNodes", "persistent node count exceeds bound"));
      nodes.push({ cell, point: center(cell, scratch), kind: "confluence", terminalOrdinal: catchmentRoot[cell] });
    }
  }
  const compareNodePhysical = (left: NodeCandidate, right: NodeCandidate): number =>
    comparePointM(left.point, right.point) || nodeKindOrder(left.kind) - nodeKindOrder(right.kind) ||
    compareNumber(kindOrder(terminals[left.terminalOrdinal].kind), kindOrder(terminals[right.terminalOrdinal].kind)) ||
    comparePointM(terminals[left.terminalOrdinal].point, terminals[right.terminalOrdinal].point);
  nodes.sort(compareNodePhysical);
  for (let index = 1; index < nodes.length; index += 1) {
    if (compareNodePhysical(nodes[index - 1], nodes[index]) === 0) {
      return fail(invalid("drainage.nodes", "duplicate complete node physical key"));
    }
  }
  representedIndegree.fill(-1);
  firstReachAssignment.fill(-1);
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.kind === "terminal") firstReachAssignment[node.cell] = index;
    else representedIndegree[node.cell] = index;
  }
  for (const node of nodes) {
    if (node.kind !== "terminal" && scratch.terminalOrdinalByCell[node.cell] >= 0) {
      const terminalTwinNodeOrdinal = firstReachAssignment[node.cell];
      if (terminalTwinNodeOrdinal < 0 || nodes[terminalTwinNodeOrdinal]?.kind !== "terminal") {
        return fail(terminalInvalid("drainage.nodes", "boundary owner lacks its terminal node"));
      }
      node.terminalTwinNodeOrdinal = terminalTwinNodeOrdinal;
    }
  }
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (representedIndegree[cell] < 0 && firstReachAssignment[cell] >= 0) {
      representedIndegree[cell] = firstReachAssignment[cell];
    }
  }
  firstReachAssignment.fill(-1);
  const nodeForCell = (cell: number): NodeCandidate | undefined => {
    const index = representedIndegree[cell];
    return index >= 0 ? nodes[index] : undefined;
  };

  const reaches: ReachCandidate[] = [];
  for (let upstreamNodeOrdinal = 0; upstreamNodeOrdinal < nodes.length; upstreamNodeOrdinal += 1) {
    const upstream = nodes[upstreamNodeOrdinal];
    if (upstream.kind === "terminal") continue;
    if (reaches.length >= constants.drainage.maxReaches) {
      return fail(bound("drainage.maxReaches", "persistent reach count exceeds bound"));
    }
    const transientOrdinal = reaches.length;
    let minimumElevationMeters = scratch.elevationMeters[upstream.cell];
    let maximumElevationMeters = scratch.elevationMeters[upstream.cell];
    firstReachAssignment[upstream.cell] = transientOrdinal;
    if (upstream.terminalTwinNodeOrdinal !== undefined) {
      const downstream = nodes[upstream.terminalTwinNodeOrdinal];
      if (!downstream || downstream.kind !== "terminal" || downstream.cell !== upstream.cell) {
        return fail(terminalInvalid("drainage.reaches", "boundary owner has an invalid terminal continuation"));
      }
      reaches.push({
        upstreamCell: upstream.cell,
        downstreamCell: downstream.cell,
        upstreamNodeOrdinal,
        downstreamNodeOrdinal: upstream.terminalTwinNodeOrdinal,
        terminalOrdinal: catchmentRoot[upstream.cell],
        measurementCell: upstream.cell,
        transientOrdinal,
        minimumElevationMeters,
        maximumElevationMeters,
        localAreaM2: 0,
      });
      continue;
    }
    let current = upstream.cell;
    let next = flow.primaryReceiver[current];
    let steps = 0;
    if (next < 0) return fail(terminalInvalid("drainage.reaches", "nonterminal node has no primary receiver"));
    while (true) {
      const previous = current;
      current = next;
      minimumElevationMeters = Math.min(minimumElevationMeters, scratch.elevationMeters[current]);
      maximumElevationMeters = Math.max(maximumElevationMeters, scratch.elevationMeters[current]);
      firstReachAssignment[current] = transientOrdinal;
      const downstreamNodeOrdinal = representedIndegree[current];
      if (downstreamNodeOrdinal >= 0) {
        const downstream = nodes[downstreamNodeOrdinal];
        const closedTerminal = downstream.kind === "terminal" &&
          terminals[downstream.terminalOrdinal].kind === "retained_closed_basin";
        const measurementCell = downstream.kind === "confluence" || closedTerminal ? previous : current;
        if (downstream.kind === "confluence") firstReachAssignment[current] = -1;
        reaches.push({
          upstreamCell: upstream.cell,
          downstreamCell: downstream.cell,
          upstreamNodeOrdinal,
          downstreamNodeOrdinal,
          terminalOrdinal: catchmentRoot[upstream.cell],
          measurementCell,
          transientOrdinal,
          minimumElevationMeters,
          maximumElevationMeters,
          localAreaM2: 0,
        });
        break;
      }
      next = flow.primaryReceiver[current];
      if (next < 0 || steps++ > cellCount) return fail(cycle("drainage.reaches"));
    }
  }
  for (const node of nodes) {
    if (node.kind !== "confluence") continue;
    const outgoing = reaches.find((reach) => reach.upstreamCell === node.cell);
    if (!outgoing) return fail(invalid("drainage.reaches", "confluence lacks an outgoing reach"));
    firstReachAssignment[node.cell] = outgoing.transientOrdinal;
  }

  // Closed floors are absorbing accounting destinations, never incoming reach
  // cells. Negative ordinals reuse the existing assignment ledger: -1 means
  // unresolved; -2-ordinal means terminal-local. No extra dense/owner storage.
  for (let ordinal = 0; ordinal < terminals.length; ordinal += 1) {
    if (terminals[ordinal].kind === "retained_closed_basin") {
      firstReachAssignment[owners.terminalOwnerCells[ordinal]] = -2 - ordinal;
    }
  }

  const compareReachBase = (left: ReachCandidate, right: ReachCandidate): number => {
    // In the one-primary-receiver graph each nonterminal upstream node owns one
    // outgoing reach, so the full frozen pre-key order is already determined by
    // its unique upstream-node physical key. Keep the remaining fields in the
    // comparator for exact validation without constructing a geometry string.
    const upstreamOrder = compareNodePhysical(nodes[left.upstreamNodeOrdinal], nodes[right.upstreamNodeOrdinal]);
    if (upstreamOrder !== 0) return upstreamOrder;
    const downstreamOrder = compareNodePhysical(nodes[left.downstreamNodeOrdinal], nodes[right.downstreamNodeOrdinal]);
    if (downstreamOrder !== 0) return downstreamOrder;
    return kindOrder(terminals[left.terminalOrdinal].kind) - kindOrder(terminals[right.terminalOrdinal].kind) ||
      comparePointM(terminals[left.terminalOrdinal].point, terminals[right.terminalOrdinal].point);
  };
  reaches.sort(compareReachBase);
  for (let index = 1; index < reaches.length; index += 1) {
    if (compareReachBase(reaches[index - 1], reaches[index]) === 0) {
      return fail(invalid("drainage.reaches", "duplicate complete pre-simplification reach physical key"));
    }
  }
  // Reuse representedIndegree as transient->canonical reach ordinal mapping;
  // no O(R) JS mirror is created.
  representedIndegree.fill(-1);
  for (let index = 0; index < reaches.length; index += 1) representedIndegree[reaches[index].transientOrdinal] = index;
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (firstReachAssignment[cell] >= 0) firstReachAssignment[cell] = representedIndegree[firstReachAssignment[cell]];
  }

  const pathPoint = (
    pathCells: Int32Array,
    pathCellCount: number,
    hasExtraTerminalPoint: boolean,
    extraTerminalPoint: WorldM0PointM,
    index: number,
  ): WorldM0PointM => index < pathCellCount ? center(pathCells[index], scratch) :
    hasExtraTerminalPoint && index === pathCellCount ? extraTerminalPoint : extraTerminalPoint;
  const replacementConflictsStoredGeometry = (
    previous: WorldM0PointM,
    next: WorldM0PointM,
    geometry: readonly WorldM0PointM[],
  ): boolean => {
    for (let segment = 0; segment + 1 < geometry.length; segment += 1) {
      if (segmentsConflict(previous, next, geometry[segment], geometry[segment + 1])) return true;
    }
    return false;
  };
  const replacementConflictsUnsimplifiedReach = (
    previous: WorldM0PointM,
    next: WorldM0PointM,
    peer: ReachCandidate,
  ): boolean => {
    let current = peer.upstreamCell;
    let currentPoint = nodes[peer.upstreamNodeOrdinal].point;
    let guard = 0;
    while (current !== peer.downstreamCell) {
      const receiver = flow.primaryReceiver[current];
      if (receiver < 0 || guard++ > cellCount) return true;
      const receiverPoint = center(receiver, scratch);
      if (segmentsConflict(previous, next, currentPoint, receiverPoint)) return true;
      current = receiver;
      currentPoint = receiverPoint;
    }
    const finalPoint = nodes[peer.downstreamNodeOrdinal].point;
    return !samePoint(currentPoint, finalPoint) && segmentsConflict(previous, next, currentPoint, finalPoint);
  };

  // Domain 2: the complete reach registry is now known and canonically ordered.
  // For each reach, reuse representedIndegree as an O(N) ledger-owned path-cell
  // buffer. Simplification mutates that typed buffer, then and only then
  // materializes bounded JS point geometry. Later peers are checked through the
  // implicit Task-7 primary path, so no raw geometry/pre-key JS payload exists.
  for (let reachOrdinal = 0; reachOrdinal < reaches.length; reachOrdinal += 1) {
    const reach = reaches[reachOrdinal];
    let pathCellCount = 0;
    let current = reach.upstreamCell;
    let guard = 0;
    while (true) {
      if (pathCellCount >= cellCount) return fail(cycle("drainage.reaches"));
      representedIndegree[pathCellCount] = current;
      pathCellCount += 1;
      if (current === reach.downstreamCell) break;
      const receiver = flow.primaryReceiver[current];
      if (receiver < 0 || guard++ > cellCount) return fail(cycle("drainage.reaches"));
      current = receiver;
    }
    const downstreamPoint = nodes[reach.downstreamNodeOrdinal].point;
    const lastCellPoint = center(representedIndegree[pathCellCount - 1], scratch);
    const hasExtraTerminalPoint = !samePoint(lastCellPoint, downstreamPoint);
    let pointCount = pathCellCount + (hasExtraTerminalPoint ? 1 : 0);
    const toleranceSquared = constants.geometry.simplifyToleranceMeters * constants.geometry.simplifyToleranceMeters;
    while (pointCount > 2) {
      let best = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestPoint: WorldM0PointM | undefined;
      for (let pointIndex = 1; pointIndex + 1 < pointCount; pointIndex += 1) {
        const previous = pathPoint(representedIndegree, pathCellCount, hasExtraTerminalPoint, downstreamPoint, pointIndex - 1);
        const vertex = pathPoint(representedIndegree, pathCellCount, hasExtraTerminalPoint, downstreamPoint, pointIndex);
        const next = pathPoint(representedIndegree, pathCellCount, hasExtraTerminalPoint, downstreamPoint, pointIndex + 1);
        const distance = pointSegmentDistanceSquared(previous, vertex, next);
        if (distance > toleranceSquared) continue;
        if (best < 0 || distance < bestDistance ||
            (distance === bestDistance && bestPoint !== undefined && comparePointM(vertex, bestPoint) < 0)) {
          best = pointIndex;
          bestDistance = distance;
          bestPoint = vertex;
        }
      }
      if (best < 0) break;
      const previous = pathPoint(representedIndegree, pathCellCount, hasExtraTerminalPoint, downstreamPoint, best - 1);
      const next = pathPoint(representedIndegree, pathCellCount, hasExtraTerminalPoint, downstreamPoint, best + 1);
      let conflicts = false;
      const downstreamIsTerminal = nodes[reach.downstreamNodeOrdinal].kind === "terminal";
      const conflictWithProtectedGeometry = (geometry: readonly WorldM0PointM[], allowTerminalContact: boolean): boolean => {
        for (let segment = 0; segment + 1 < geometry.length; segment += 1) {
          const conflict = allowTerminalContact
            ? segmentsConflictBeyondAllowedEndpoint(previous, next, geometry[segment], geometry[segment + 1], downstreamPoint)
            : segmentsConflict(previous, next, geometry[segment], geometry[segment + 1]);
          if (conflict) return true;
        }
        return false;
      };
      for (const line of coastline.coastline) {
        if (conflictWithProtectedGeometry(line, downstreamIsTerminal && samePoint(next, downstreamPoint))) { conflicts = true; break; }
      }
      if (!conflicts) {
        for (let catchmentOrdinal = 0; catchmentOrdinal < catchments.length; catchmentOrdinal += 1) {
          for (const ring of catchments[catchmentOrdinal].boundaryRings) {
            const allowTerminalContact = catchmentOrdinal === reach.terminalOrdinal && downstreamIsTerminal && samePoint(next, downstreamPoint);
            if (conflictWithProtectedGeometry(ring, allowTerminalContact)) { conflicts = true; break; }
          }
          if (conflicts) break;
        }
      }
      if (!conflicts) {
        for (let prior = 0; prior < reachOrdinal; prior += 1) {
          const priorGeometry = reaches[prior].geometry;
          if (priorGeometry && replacementConflictsStoredGeometry(previous, next, priorGeometry)) { conflicts = true; break; }
        }
      }
      if (!conflicts) {
        for (let later = reachOrdinal + 1; later < reaches.length; later += 1) {
          if (replacementConflictsUnsimplifiedReach(previous, next, reaches[later])) { conflicts = true; break; }
        }
      }
      if (!conflicts) {
        for (let segment = 0; segment + 1 < pointCount; segment += 1) {
          if (segment === best - 1 || segment === best) continue;
          const segmentStart = pathPoint(representedIndegree, pathCellCount, hasExtraTerminalPoint, downstreamPoint, segment);
          const segmentEnd = pathPoint(representedIndegree, pathCellCount, hasExtraTerminalPoint, downstreamPoint, segment + 1);
          if (segmentsConflict(previous, next, segmentStart, segmentEnd)) { conflicts = true; break; }
        }
      }
      if (conflicts) break;
      if (best >= pathCellCount) return fail(invalid("drainage.reaches", "simplifier attempted to delete a protected terminal endpoint"));
      for (let index = best; index + 1 < pathCellCount; index += 1) representedIndegree[index] = representedIndegree[index + 1];
      pathCellCount -= 1;
      pointCount -= 1;
    }
    if (pointCount > constants.geometry.maxPolylineVerticesPerFeature) {
      return fail(bound("geometry.maxPolylineVerticesPerFeature", "persistent reach exceeds vertex bound before JS materialization"));
    }
    const geometry: WorldM0PointM[] = [];
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      geometry.push(pathPoint(representedIndegree, pathCellCount, hasExtraTerminalPoint, downstreamPoint, pointIndex));
    }
    reach.geometry = geometry;
  }

  // Local-area witnesses are complete before the domain-2 ID barrier.
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (scratch.landMask[cell] !== 1 || firstReachAssignment[cell] >= 0) continue;
    let current = cell;
    let steps = 0;
    while (firstReachAssignment[current] < 0) {
      const receiver = flow.primaryReceiver[current];
      if (receiver < 0 || steps++ > cellCount) break;
      current = receiver;
    }
    if (firstReachAssignment[current] >= 0) {
      firstReachAssignment[cell] = firstReachAssignment[current];
      reaches[firstReachAssignment[current]].localAreaM2 += scratch.cellAreaM2;
    } else {
      const terminalOrdinal = catchmentRoot[cell];
      firstReachAssignment[cell] = -2 - terminalOrdinal;
      terminals[terminalOrdinal].localContributingAreaM2 += scratch.cellAreaM2;
    }
  }
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (scratch.landMask[cell] === 1 && representedSupport[cell] === 1 && firstReachAssignment[cell] >= 0) {
      reaches[firstReachAssignment[cell]].localAreaM2 += scratch.cellAreaM2;
    }
  }

  // Final physical identity sort uses the finalized geometry, not the domain-2
  // pre-simplification schedule. Reuse representedIndegree once more to remap
  // reach assignments across that final order.
  for (let index = 0; index < reaches.length; index += 1) reaches[index].preFinalOrdinal = index;
  reaches.sort((left, right) => compareReachBase(left, right) ||
    comparePointSequence(left.geometry as readonly WorldM0PointM[], right.geometry as readonly WorldM0PointM[]));
  for (let index = 1; index < reaches.length; index += 1) {
    if (compareReachBase(reaches[index - 1], reaches[index]) === 0 &&
        comparePointSequence(reaches[index - 1].geometry as readonly WorldM0PointM[], reaches[index].geometry as readonly WorldM0PointM[]) === 0) {
      return fail(invalid("drainage.reaches", "duplicate complete final reach physical key"));
    }
  }
  representedIndegree.fill(-1);
  for (let index = 0; index < reaches.length; index += 1) {
    representedIndegree[reaches[index].preFinalOrdinal as number] = index;
  }
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (firstReachAssignment[cell] >= 0) firstReachAssignment[cell] = representedIndegree[firstReachAssignment[cell]];
  }

  // Domain 2 and all physical witnesses are finalized: IDs may now be assigned.
  for (let index = 0; index < nodes.length; index += 1) {
    const nodeId = formatTerrainHydroId("drainage-node", index);
    if (!nodeId.ok) return fail(nodeId);
    nodes[index].id = nodeId.value;
  }
  for (let index = 0; index < reaches.length; index += 1) {
    const reachId = formatTerrainHydroId("drainage-reach", index);
    if (!reachId.ok) return fail(reachId);
    reaches[index].id = reachId.value;
  }
  for (const reach of reaches) {
    const downstreamNode = nodes[reach.downstreamNodeOrdinal];
    reach.downstreamId = downstreamNode.kind === "terminal" ? null : reaches[firstReachAssignment[reach.downstreamCell]]?.id;
    if (downstreamNode.kind !== "terminal" && reach.downstreamId === undefined) {
      return fail(invalid("drainage.reaches", "confluence lacks a unique outgoing reach"));
    }
  }

  const persistentNodes: TerrainDrainageNode[] = [];
  for (const node of nodes) {
    persistentNodes.push({
      id: node.id as string,
      point: node.point,
      kind: node.kind,
      terminalId: node.kind === "terminal" ? terminals[node.terminalOrdinal].id : null,
    });
  }
  const persistentReaches: TerrainDrainageReach[] = [];
  for (const reach of reaches) {
    const upstream = nodes[reach.upstreamNodeOrdinal];
    const downstream = nodes[reach.downstreamNodeOrdinal];
    const geometry = reach.geometry as readonly WorldM0PointM[];
    let lengthMeters = 0;
    for (let index = 0; index + 1 < geometry.length; index += 1) {
      lengthMeters += Math.hypot(geometry[index + 1].xM - geometry[index].xM,
        geometry[index + 1].yM - geometry[index].yM);
    }
    const elevationDrop = scratch.elevationMeters[reach.upstreamCell] - scratch.elevationMeters[reach.downstreamCell];
    const gradient = lengthMeters > 0 ? Math.max(0, elevationDrop / lengthMeters) : 0;
    persistentReaches.push({
      id: reach.id as string,
      upstreamNodeId: upstream.id as string,
      downstreamNodeId: downstream.id as string,
      downstreamReachId: reach.downstreamId as string | null,
      catchmentId: catchments[reach.terminalOrdinal].id,
      terminalId: terminals[reach.terminalOrdinal].id,
      geometry,
      lengthMeters,
      contributingAreaM2: primaryArea[reach.measurementCell],
      localContributingAreaM2: reach.localAreaM2,
      meanTerrainGradient: gradient,
      localReliefMeters: reach.maximumElevationMeters - reach.minimumElevationMeters,
      channelIncisionMeters: reach.maximumElevationMeters - reach.minimumElevationMeters,
    });
  }

  // Measurement reads are complete. Reuse primaryArea for independent checks,
  // first by reach ordinal and then by terminal ordinal. Peak stays 88N + 4T.
  primaryArea.fill(0);
  for (let ordinal = 0; ordinal < persistentReaches.length; ordinal += 1) {
    primaryArea[ordinal] = persistentReaches[ordinal].localContributingAreaM2;
  }
  for (let ordinal = 0; ordinal < reaches.length; ordinal += 1) {
    const reach = reaches[ordinal];
    if (nodes[reach.downstreamNodeOrdinal].kind !== "terminal") {
      primaryArea[firstReachAssignment[reach.downstreamCell]] += persistentReaches[ordinal].contributingAreaM2;
    }
  }
  for (let ordinal = 0; ordinal < persistentReaches.length; ordinal += 1) {
    const reach = persistentReaches[ordinal];
    if (!Number.isFinite(reach.contributingAreaM2) || !Number.isFinite(reach.localContributingAreaM2) ||
        reach.localContributingAreaM2 < 0 ||
        Math.abs(reach.contributingAreaM2 - primaryArea[ordinal]) > constants.validation.areaToleranceM2) {
      return fail(invalid("drainage.reaches.localContributingAreaM2", "independent local contributing-area conservation failed"));
    }
  }
  for (let cell = 0; cell < cellCount; cell += 1) {
    // Support must survive reduction, independently of the area equations.
    // Only an absorbing closed floor can be represented without a reach owner.
    if (representedSupport[cell] === 1 && firstReachAssignment[cell] < 0 &&
        !(terminals[catchmentRoot[cell]].kind === "retained_closed_basin" &&
          owners.terminalOwnerCells[catchmentRoot[cell]] === cell)) {
      return fail(invalid("drainage.support", "represented cell has no persistent reach accounting destination"));
    }
    if (scratch.landMask[cell] === 1 && (firstReachAssignment[cell] === -1 ||
        (firstReachAssignment[cell] < -1 && firstReachAssignment[cell] !== -2 - catchmentRoot[cell]))) {
      return fail(invalid("drainage.accounting", "terrestrial cell has no unique accounting destination"));
    }
  }
  for (const localWitnesses of [false, true]) {
    primaryArea.fill(0);
    for (let ordinal = 0; ordinal < reaches.length; ordinal += 1) {
      const reach = persistentReaches[ordinal];
      if (localWitnesses || reach.downstreamReachId === null) {
        primaryArea[reaches[ordinal].terminalOrdinal] += localWitnesses
          ? reach.localContributingAreaM2 : reach.contributingAreaM2;
      }
    }
    for (let ordinal = 0; ordinal < terminals.length; ordinal += 1) {
      const local = terminals[ordinal].localContributingAreaM2;
      if (!Number.isFinite(local) || local < 0 ||
          (terminals[ordinal].kind !== "retained_closed_basin" &&
            representedSupport[owners.terminalOwnerCells[ordinal]] === 1 && local !== 0) ||
          Math.abs(catchments[ordinal].areaM2 - local - primaryArea[ordinal]) > constants.validation.areaToleranceM2) {
        return fail(terminalInvalid("terminals.localContributingAreaM2", "independent terminal area reconciliation failed"));
      }
    }
  }

  const links: TerrainRetainedDepressionDrainageLink[] = [];
  if (depression.retainedDepressions.length > constants.depression.maxRetainedBasins) {
    return fail(bound("depression.maxRetainedBasins", "retained depression feature count exceeds explicit bound"));
  }
  const retained: typeof depression.retainedDepressions[number][] = [];
  for (const item of depression.retainedDepressions) retained.push(item);
  retained.sort((left, right) => compareAscii(left.token, right.token));
  for (let index = 0; index < retained.length; index += 1) {
    const item = retained[index];
    if (!/^depression-analysis:[0-9a-f]{16}$/.test(item.token) ||
        (index > 0 && item.token === retained[index - 1].token) ||
        item.canonicalFloorCell < 0 || item.canonicalFloorCell >= cellCount ||
        scratch.landMask[item.canonicalFloorCell] !== 1) {
      return fail(terminalInvalid("retainedDepressionLinks", "retained depression token/floor is invalid or duplicated"));
    }
    const terminalOrdinal = catchmentRoot[item.canonicalFloorCell];
    const terminal = terminals[terminalOrdinal];
    const catchment = catchments[terminalOrdinal];
    if (!terminal || !catchment || (item.closedEndorheic && terminal.kind !== "retained_closed_basin")) {
      return fail(terminalInvalid("retainedDepressionLinks", "retained depression does not resolve to its required terminal"));
    }
    links.push({ depressionToken: item.token, catchmentId: catchment.id, terminalId: terminal.id });
  }

  const task8Released = releaseLabels(scratch, TASK8_STAGE_LABELS);
  if (!task8Released.ok) return task8Released;
  const flowReleased = releaseLabels(scratch, TASK7_RETAINED_LABELS);
  if (!flowReleased.ok) return flowReleased;
  const ownersReleased = scratch.budget.release("terminalOwnerCells");
  if (!ownersReleased.ok) return ownersReleased;
  return { ok: true, value: { terminals, catchments, nodes: persistentNodes, reaches: persistentReaches,
    retainedDepressionLinks: links } };
}
