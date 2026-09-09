# WORLD-M0 M0.2 Terrain + Hydrographic Physical Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the deterministic, procedural WORLD-M0 M0.2 terrain + hydrographic physical foundation as a shadow-only pre-seal candidate: verified physical-constants content, four-family landform provenance, correlated relief, canonical land/ocean + coastline topology, deterministic depression and finite-open-outflow routing, Tarboton D∞ contributing-area analysis, one-receiver persistent geomorphic drainage, retained depression/basin geometry, terrain-derived valley/floodplain/crossing candidates, strategic aggregation, candidate validation, canonical audit identity, controlled scientific fixtures, adversarial discrimination, natural seeded evidence, and boundedness evidence—without moving production authority or starting M0.3.

**Architecture:** Extend the existing `src/sim/world/physical/` M0.1 namespace with focused M0.2 modules. The pure compiler receives a validated `WorldRecipeV1`, explicit resolved immutable content bytes, and the already-frozen M0.1 asset-resolution inputs. Procedural physical-generator v1 accepts only an empty required-asset manifest and `mlProposal: null`. It resolves and digest-verifies physical constants, builds a deterministic 250 m scratch terrain analysis, vectorizes/aggregates all persistent state, validates the candidate, discards scratch state, and returns an immutable `WorldM0TerrainHydroCandidateV3` plus a schema-local `terrainHydroCandidateDigest`. Legacy `createWorld` and all legacy terrain/hydrography readers remain the sole ordinary production physical authority through M0.6.

**Tech Stack:** TypeScript 6.0.3, Vite 8 SSR audit scripts, Node.js 24+ audit runtime, browser-compatible Web Crypto/TextEncoder/TextDecoder already used by M0.1, typed arrays for transient 250 m scratch state, native project tooling only. No new package dependency is planned.

**Spec:** Reviewed authority `docs/superpowers/specs/2026-08-28-world-m0-m02-terrain-hydrography-design.md` at `design/world-m0-m02-terrain-hydrography` SHA `7e3ee5f90f699734d913166b5b77a33d0be65dab`, docs-only relative to canonical WORLD-M0 integration `73cc38b916e236339897c59686638efafd569b6e`. Frozen parents remain M0.1 `43c4c45615d375da6d25cf92ef328458ddcad347`, WORLD-M0 architecture `335d15eb3dfeb80170f932dceab1b74ee8e0aaa4`, and SCALE-1 `30e1440c237c0f09bb1403687b8da9899fbfd41b`.

**Global Constraints:**

- Work only from the reviewed design lineage above. Do not branch from `main` or stale WORLD-M0 work.
- M0.2 is procedural, constraint-first, deterministic, `finite_open_outflow`, transient 250 m analysis, Priority-Flood-class depression analysis plus the project-specific retained-basin state machine frozen below, Tarboton D∞ contributing-flow analysis, and one-downstream-receiver persistent drainage.
- The 250 m analysis raster is generation-only. For the 300 km × 180 km controlled fixture it is exactly 1200 × 720 = 864,000 cells. No alternative resolution may be substituted under physical-generator v1.
- SCALE-1 `cardinal_4` remains human strategic connectivity. M0.2 hydrology uses its own 8-neighbor terrain neighborhood and never redefines SCALE-1 distance, area, travel, edge, or traversal semantics.
- Every physical length, area, threshold, density, count normalization, and geometry measurement is expressed in physical units. Scratch-cell count is never a physical-law input.
- M0.2 owns terrain/provenance/topology/geomorphic drainage/depression/valley/floodplain-candidate/crossing-candidate geometry only. It does not own precipitation, runoff, recharge, baseflow, normal discharge, hydrologic regime, actual normal lake occupancy, wetted width/depth/velocity, climate-conditioned floodplain activation, or crossing hydraulics.
- Exactly four provenance families exist in v1: `stable_denudational`, `orogenic_uplift`, `volcanic_constructive`, `sedimentary_basin`. They are broad terrain-forming provenance, not detailed geology or material occurrence.
- Procedural v1 requires `assets.required.length === 0` and `mlProposal === null`. A valid but non-empty manifest or selected ML identity fails before terrain compilation. No model executes.
- The compiler never performs hidden filesystem/global-registry content resolution and never substitutes compiled constants for missing identity-bearing content.
- Candidate audit identity is `terrainHydroCandidateDigest`, never `packageDigest`. M0.2 does not create or seal `WorldM0Package`, `genesisEnvironmentState`, or final M0.5 numeric/package representation.
- No ordinary production module may import M0.2 candidate/compiler modules. Legacy `createWorld`, Map-1, Map-2, legacy tile fields, movement, spawn, ecology, human observation, decisions, and UI remain untouched.
- M0.2 hidden physical truth never writes `HumanMaterialBelief`, `band.practicalAdaptation`, route/corridor knowledge, crossing knowledge, `knownFord`, human confidence, competence, recognized-resource state, or human observation/memory.
- Persistent M0.2 crossing state is physical geometry only. It never contains fordability, crossing class, final cost/risk, watercraft/bridge/ferry state, normal water width/depth/velocity, `knownFord`, or confidence.
- No biome/ecology label causes relief, drainage, or provenance. No M0.3/WORLD-1/Item-12 state is invented to make M0.2 richer.
- Bounds that can change accepted physical content are stored in verified physical-constants content or are implied by physical extent/resolution. Bounds fail closed; they never truncate silently.
- Every task is RED-first, independently reviewable, and ends in a dedicated commit. Do not combine implementation commits.

## Repository findings that constrain this plan

1. `src/sim/world/physical/` already contains the frozen M0.1 recipe, canonical identity, asset resolution, failure/result, and spatial-grid contracts. M0.2 extends these instead of creating a parallel recipe identity.
2. `WorldRecipeV1` already carries `physicalConstants: WorldM0ContentIdentity`, `compiler.physicalGeneratorVersion`, `compiler.repairPolicyVersion`, `compiler.numericKernelVersion`, explicit physical extent/strategic cell dimensions, asset manifest, and nullable ML identity.
3. `src/sim/world/physical/spatialGrid.ts` already derives physical extent and 1.0/1.5 km strategic metadata while reusing frozen SCALE-1 `cartesian_cell_centers` + `cardinal_4`. It allocates no world cells and remains unchanged except where an M0.2 audit imports it.
4. The repository uses executable `scripts/*.mjs` Vite-SSR audits instead of a conventional test framework. M0.2 follows that project convention.
5. Current ordinary production source has no import of `src/sim/world/physical`. This zero-import state is the production-authority firewall baseline.
6. Legacy `src/sim/world/generate.ts` still writes elevation, `terrainKind`, hydro flags, authored river profiles, crossings, `knownFord`, confidence, movement/resource/risk/seasonal/carrying-capacity projections. `src/sim/world/mapEdits.ts` can also rewrite legacy terrain-derived fields.
7. Legacy readers are broad: `terrainKind` appears across 32 simulation files, `isRiver` across 32, `movementCost` across 27, `resourceProfile` across 24, `riskProfile` across 22, and `knownFord` across 13. M0.2 cannot safely migrate those surfaces early.
8. `src/sim/world/hydrography.ts` reads `world.rivers`/`world.riverCrossings`, synthesizes movement crossings, and mixes seasonal/human capability semantics. It stays legacy production authority until later migration.
9. The reviewed design lineage already contains the frozen M0.1 authority and SCALE-1 authority. Baseline `npm run build` succeeds from `7e3ee5f90f699734d913166b5b77a33d0be65dab`.
10. The prompt-named portable `SOCIETY_ENGINE_CANONICAL_BUNDLE.md` and `SOCIETY_ENGINE_CHECKPOINT_SYSTEM_RECORD.md` are absent from the reviewed checkout and the accessible local Society Engine worktrees. This plan therefore does not invent their contents; accepted Git, exact source, canonical architecture, and the reviewed M0.2 spec remain higher authority under the assignment's own hierarchy.
11. `docs/HANDOFF_ITEM6_WORLD_GENERATION.md` is explicitly a historical deferred discussion artifact; it does not override the accepted WORLD-M0 architecture or reviewed M0.2 design. `docs/HANDOFF.md` contains no current M0.2/WORLD-M0 authority markers found by targeted inspection.
12. Root `AGENTS.md` still contains an older Item-5-era status line saying not to begin WORLD-M0. Accepted Git has since integrated M0.1 and the reviewed M0.2 design on top of that history; the direct assignment also explicitly classifies stale status prose below accepted Git/source/spec evidence. Treat that line as status drift, not as authority to abandon this plan branch.

## Frozen implementation boundaries and representations

### 1. Content resolution and procedural-v1 policy

M0.2 adds this explicit content boundary:

```ts
export interface WorldM0ResolvedContent {
  readonly id: string;
  readonly version: string;
  readonly canonicalBytes: Uint8Array;
}

export type WorldM0ContentDecoder<T> = (
  canonicalBytes: Uint8Array,
) => WorldM0Result<T>;

export async function resolveWorldM0Content<T>(
  identity: WorldM0ContentIdentity,
  resolved: readonly WorldM0ResolvedContent[],
  decode: WorldM0ContentDecoder<T>,
): Promise<WorldM0Result<T>>;
```

Resolution scans for exactly one `(id, version)`, copies the provided bytes, computes SHA-256 with the existing M0.1 `sha256DigestBytes`, compares the actual digest with the recipe identity, then invokes a strict schema decoder. The resolver never accepts a caller-supplied digest and never reads disk/network/global state. `content.ts` freezes `WORLD_M0_MAX_RESOLVED_CONTENT_ITEMS = 64` and `WORLD_M0_MAX_RESOLVED_CONTENT_BYTES_PER_ITEM = 1_048_576`; `physicalConstants.ts` further freezes `WORLD_M0_MAX_PHYSICAL_CONSTANTS_BYTES = 262_144`. These are fail-closed input bounds and do not truncate accepted content.

`physicalConstants.ts` owns these exact functions:

```ts
export function parseWorldM0PhysicalConstants(
  input: unknown,
): WorldM0Result<WorldM0PhysicalConstantsV1>;

export function encodeCanonicalWorldM0PhysicalConstants(
  input: unknown,
): WorldM0Result<Uint8Array>;

export function decodeCanonicalWorldM0PhysicalConstants(
  bytes: Uint8Array,
): WorldM0Result<WorldM0PhysicalConstantsV1>;
```

The constants byte format follows the existing M0.1 canonical-recipe pattern: fixed schema field order, UTF-8/no BOM/no trailing newline, JSON strings encoded with `JSON.stringify`, safe integers encoded in decimal, finite non-integer JSON numbers encoded by the ECMAScript `JSON.stringify(number)` representation, and `-0`/NaN/Infinity rejected. `decodeCanonicalWorldM0PhysicalConstants` uses fatal UTF-8 decode, `JSON.parse`, strict exact-key schema parsing, re-encodes, and requires byte identity so whitespace, duplicate-key forms, alternate field order, or non-canonical number spellings do not pass as canonical content.

M0.2 supports one physical constants schema:

```ts
export interface WorldM0PhysicalConstantsV1 {
  readonly schema: "world-m0-physical-constants/v1";
  readonly analysis: {
    readonly cellSizeMeters: 250;
    readonly boundaryModel: "finite_open_outflow";
    readonly maxAnalysisCells: number;
    readonly maxScratchBytes: number;
  };
  readonly terrain: {
    readonly provenanceProvinceCount: number;
    readonly provinceMinRadiusMeters: number;
    readonly provinceMaxRadiusMeters: number;
    readonly provinceBlendMeters: number;
    readonly macroWavelengthMeters: number;
    readonly mesoWavelengthMeters: number;
    readonly fineWavelengthMeters: number;
    readonly macroAmplitudeMeters: number;
    readonly mesoAmplitudeMeters: number;
    readonly fineAmplitudeMeters: number;
    readonly stableElevationOffsetMeters: number;
    readonly stableReliefMultiplier: number;
    readonly stableAspectRatio: number;
    readonly orogenicElevationOffsetMeters: number;
    readonly orogenicReliefMultiplier: number;
    readonly orogenicAspectRatio: number;
    readonly orogenicRidgeAmplitudeMeters: number;
    readonly orogenicRidgeCrossWidthFraction: number;
    readonly volcanicElevationOffsetMeters: number;
    readonly volcanicReliefMultiplier: number;
    readonly volcanicAspectRatio: number;
    readonly volcanicMassifAmplitudeMeters: number;
    readonly volcanicRadialFalloffExponent: number;
    readonly sedimentaryElevationOffsetMeters: number;
    readonly sedimentaryReliefMultiplier: number;
    readonly sedimentaryAspectRatio: number;
    readonly sedimentaryBowlDepthMeters: number;
    readonly sedimentaryBowlFalloffExponent: number;
    readonly continentalMarginMeters: number;
    readonly seaLevelTreatment: "base_plus_recipe_offset_mm_v1";
    readonly baseSeaLevelMeters: number;
    readonly minElevationMeters: number;
    readonly maxElevationMeters: number;
  };
  readonly depression: {
    readonly retainedMinAreaM2: number;
    readonly retainedMinDepthMeters: number;
    readonly protectedClosedBasinRatePer65536: number;
    readonly maxProtectedClosedBasins: number;
    readonly maxRetainedBasins: number;
    readonly maxRepairOperations: number;
  };
  readonly flow: {
    readonly algorithm: "d_infinity_v1";
    readonly neighborhood: "terrain_8";
    readonly flatPolicy: "priority_flood_rank_v1";
    readonly exactTiePolicy: "canonical_facet_order_v1";
  };
  readonly drainage: {
    readonly persistenceAreaM2: number;
    readonly minReachLengthMeters: number;
    readonly maxNodes: number;
    readonly maxReaches: number;
  };
  readonly geometry: {
    readonly valleySearchRadiusMeters: number;
    readonly valleyRelativeReliefMeters: number;
    readonly floodplainCandidateMaxSlope: number;
    readonly bankSearchRadiusMeters: number;
    readonly simplifyToleranceMeters: number;
    readonly maxPolylineVerticesPerFeature: number;
    readonly maxPolygonVerticesPerFeature: number;
    readonly maxCrossingCandidates: number;
  };
  readonly validation: {
    readonly maxCandidateCanonicalBytes: number;
    readonly finiteTolerance: number;
    readonly areaToleranceM2: number;
  };
}
```

All values above are supplied by verified content; production code has no hidden fallback object. The shared controlled fixture supplies explicit values and labels them test/generator evidence values, not universal Earth constants. `persistenceAreaM2` is documented as a representation parameter. Count limits fail rather than drop physical features.

### 2. Candidate geometry and identity

Persistent M0.2 geometry uses physical metres from the world origin and strategic row/column references, never legacy `TileId`/`RiverId` authority:

```ts
export interface WorldM0PointM {
  readonly xM: number;
  readonly yM: number;
}

export interface WorldM0StrategicCellRef {
  readonly row: number;
  readonly column: number;
}

export interface WorldM0StrategicEdgeRef {
  readonly first: WorldM0StrategicCellRef;
  readonly second: WorldM0StrategicCellRef;
}
```

`WorldM0StrategicEdgeRef` is canonicalized with the lexicographically smaller `(row,column)` first and must connect cardinally adjacent strategic cells. This is an indexing relation compatible with SCALE-1, not a new movement-cost authority.

The M0.2 candidate schema is:

```ts
export type LandformProvenanceFamily =
  | "stable_denudational"
  | "orogenic_uplift"
  | "volcanic_constructive"
  | "sedimentary_basin";

export interface LandformProvenanceProvince {
  readonly id: string;
  readonly family: LandformProvenanceFamily;
  readonly center: WorldM0PointM;
  readonly radiusXM: number;
  readonly radiusYM: number;
  readonly axisAngleRadians: number;
  readonly influenceRadiusM: number;
  readonly elevationOffsetMeters: number;
  readonly reliefMultiplier: number;
}

export type TerrainHydroTerminalKind =
  | "ocean_outlet"
  | "retained_closed_basin"
  | "external_domain_outlet";

export interface TerrainHydroTerminal {
  readonly id: string;
  readonly kind: TerrainHydroTerminalKind;
  readonly point: WorldM0PointM;
  readonly catchmentId: string;
  readonly localContributingAreaM2: number;
}

export interface TerrainCatchment {
  readonly id: string;
  readonly terminalId: string;
  readonly areaM2: number;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
}

export interface TerrainDepressionBasin {
  readonly id: string;
  readonly catchmentId: string;
  readonly floorPoint: WorldM0PointM;
  readonly floorElevationMeters: number;
  readonly spillElevationMeters: number | null;
  readonly outletTerminalId: string | null;
  readonly closedEndorheic: boolean;
  readonly areaM2: number;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
}

export interface TerrainDrainageNode {
  readonly id: string;
  readonly point: WorldM0PointM;
  readonly kind: "source" | "confluence" | "terminal";
  readonly terminalId: string | null;
}

export interface TerrainDrainageReach {
  readonly id: string;
  readonly upstreamNodeId: string;
  readonly downstreamNodeId: string;
  readonly downstreamReachId: string | null;
  readonly catchmentId: string;
  readonly terminalId: string;
  readonly geometry: readonly WorldM0PointM[];
  readonly lengthMeters: number;
  readonly contributingAreaM2: number;
  readonly localContributingAreaM2: number;
  readonly meanTerrainGradient: number;
  readonly localReliefMeters: number;
  readonly channelIncisionMeters: number;
}

export interface TerrainValleyCandidate {
  readonly id: string;
  readonly reachId: string;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
  readonly areaM2: number;
  readonly localReliefMeters: number;
}

export interface TerrainFloodplainCandidate {
  readonly id: string;
  readonly reachId: string;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
  readonly areaM2: number;
  readonly terrainSlope: number;
}

export interface PhysicalCrossingCandidate {
  readonly id: string;
  readonly reachId: string;
  readonly strategicEdge: WorldM0StrategicEdgeRef;
  readonly intersection: WorldM0PointM;
  readonly leftBank: WorldM0PointM;
  readonly rightBank: WorldM0PointM;
  readonly channelIncisionMeters: number;
  readonly firstApproachSlope: number;
  readonly secondApproachSlope: number;
}

export interface StrategicTerrainSummary {
  readonly cell: WorldM0StrategicCellRef;
  readonly landOceanClass: "land" | "ocean" | "mixed";
  readonly landAreaM2: number;
  readonly oceanAreaM2: number;
  readonly elevationMinMeters: number;
  readonly elevationMaxMeters: number;
  readonly elevationMeanMeters: number;
  readonly localReliefMeters: number;
  readonly slopeMean: number;
  readonly coastlineLengthMeters: number;
  readonly provenanceFractions: readonly {
    readonly provinceId: string;
    readonly areaFraction: number;
  }[];
  readonly catchmentIds: readonly string[];
  readonly reachIds: readonly string[];
  readonly depressionBasinIds: readonly string[];
  readonly valleyCandidateIds: readonly string[];
  readonly floodplainCandidateIds: readonly string[];
  readonly crossingCandidateIds: readonly string[];
}

export interface WorldM0TerrainHydroCandidateV3 {
  readonly schema: "world-m0-terrain-hydro-candidate/v3";
  readonly recipeDigest: WorldM0RecipeDigest;
  readonly physicalConstants: WorldM0ContentIdentity;
  readonly physicalGeneratorVersion: string;
  readonly repairPolicyVersion: string;
  readonly numericKernelVersion: string;
  readonly analysis: {
    readonly cellSizeMeters: 250;
    readonly width: number;
    readonly height: number;
    readonly boundaryModel: "finite_open_outflow";
    readonly flowAlgorithm: "d_infinity_v1";
  };
  readonly provenanceProvinces: readonly LandformProvenanceProvince[];
  readonly strategicTerrain: readonly StrategicTerrainSummary[];
  readonly coastline: readonly (readonly WorldM0PointM[])[];
  readonly terminals: readonly TerrainHydroTerminal[];
  readonly catchments: readonly TerrainCatchment[];
  readonly drainageNodes: readonly TerrainDrainageNode[];
  readonly drainageReaches: readonly TerrainDrainageReach[];
  readonly depressionBasins: readonly TerrainDepressionBasin[];
  readonly valleys: readonly TerrainValleyCandidate[];
  readonly floodplainCandidates: readonly TerrainFloodplainCandidate[];
  readonly crossingCandidates: readonly PhysicalCrossingCandidate[];
  readonly deterministicProvenance: {
    readonly repairOperationCount: number;
    readonly conditionedDepressionCount: number;
    readonly retainedDepressionCount: number;
  };
}
```

No scratch arrays, wall-clock timings, process memory, human state, climate/hydrologic-normal state, final package identity, or legacy tile/river profiles are candidate fields.

### 3. Canonical M0.2 audit encoding before digest implementation

The encoder for `world-m0-terrain-hydro-candidate/v3` is schema-specific; it never iterates arbitrary object keys. This plan freezes the following audit encoding before Task 3 implements a digest:

- UTF-8, no BOM, no trailing newline.
- Top-level fields exactly in the interface order above.
- Object fields exactly in interface order.
- IDs are validated ASCII identity tokens and serialized with `JSON.stringify` only as a string-escape primitive.
- Safe integers use base-10 `String(value)` and reject `-0`.
- Every finite non-integer binary64 is encoded as a JSON string `"f64:<16 lowercase hex>"`, where the 16 hex digits are the big-endian IEEE-754 binary64 bytes written by `DataView.setFloat64(0, value, false)`. NaN, ±Infinity, and `-0` are invalid.
- This binary64 audit encoding records exact M0.2 reference-runtime candidate semantics. It is not M0.5 final package quantization.
- Every **semantically unordered entity registry** is canonicalized exactly as B01 requires: validate every ASCII `id`, reject duplicate IDs, copy the caller array, sort the copy by `compareAscii(left.id,right.id)`, encode that copy, and never mutate caller state. Caller insertion/order is not an error. This applies to provenance provinces, terminals, catchments, drainage nodes, drainage reaches as a registry, depression basins, valleys, floodplain candidates, and crossing candidates. Unordered non-entity keyed collections use the equally explicit keys below; they are never allowed to fall back to insertion order.
- `strategicTerrain` is semantically keyed by cell and is canonicalized by copying and sorting `(row,column)` ascending; duplicate cell keys fail.
- `provenanceFractions` and every unordered referenced-ID list are copied, duplicate-checked by their semantic key, and ASCII-sorted before encoding.
- **Semantically ordered** sequences are never reordered for canonicalization. Reach geometry remains upstream → downstream. Ring point traversal remains its producer-normalized traversal. Reversing either changes semantics or fails normalization; the encoder must not make it equivalent by sorting points.
- Point order is exact lexicographic `(xM,yM)`, x first then y, using finite canonical binary64 comparison; `-0`, NaN, and infinities are invalid.
- Coastline consumes the exact closed-ring/open-polyline orientation and start conventions frozen in §§8–9. The encoder copies the coastline registry, rejects duplicate §8 `coastKey` values, and sorts only by `compareAscii(coastKey)`; it never reverses/rotates traversal to manufacture equivalence. Closed physical-region polygon rings use the separate frozen ring-role key from §8.
- `WorldM0StrategicEdgeRef.first` is always the lexicographically smaller endpoint under `(row,column)`; producer helpers canonicalize the relation before persistence and the encoder rejects a malformed persistent edge.
- Canonicalization never mutates caller arrays or objects.
- `terrainHydroCandidateDigest` is SHA-256 over exactly these canonical bytes, encoded as `sha256:<64 lowercase hex>` and branded separately from recipe/package digests.

### 4. Transient 250 m analysis representation

`TerrainScratchGrid` is generation-only:

```ts
export interface TerrainScratchGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSizeMeters: 250;
  readonly cellAreaM2: 62_500;
  readonly budget: TerrainScratchBudget;
  readonly elevationMeters: Float64Array;
  readonly landMask: Uint8Array;
  readonly routingElevationMeters: Float64Array;
  readonly flatRank: Int32Array;
  readonly terminalKindByCell: Uint8Array;
  readonly terminalOrdinalByCell: Int32Array;
}

export interface TerrainTerminalOwnerAnalysis {
  readonly terminalKindByCell: Uint8Array;
  readonly terminalOrdinalByCell: Int32Array;
  readonly terminalOwnerCells: Int32Array;
  readonly terminalCount: number;
}
```

Terminal transient representation is numeric and single-authority. `terminalKindByCell` uses exactly `0 = no terminal`, `1 = ocean_outlet`, `2 = external_domain_outlet`, `3 = retained_closed_basin`; every other byte value is `M02_TERMINAL_INVALID`. `terminalOrdinalByCell` uses exactly `-1 = no terminal` and otherwise an ordinal in `[0, terminalCount)`. `terminalOwnerCells` is a ledger-owned `Int32Array` of exact length `terminalCount`, ordered canonically as frozen in §10.1. There is no second owner list, no object-per-terminal transient registry, and no transient terminal string/token. These sentinels are named constants in `terrainScratch.ts`/`terrainDepressions.ts`; arbitrary negative values are invalid.

`TerrainScratchBudget` is the single allocation ledger frozen in §14 below. Every deterministic transient typed-array analysis buffer—base scratch, coastline/depression buffers, compact terminal-owner state, heap backing storage, D∞ arrays, persistent-reduction buffers, and any future M0.2 full-raster buffer—must be allocated through that ledger. The protected-basin intent mechanism frozen in §10 is a bounded per-component token registry and deliberately introduces **no separate dense protection raster**; its dense component label is already one of the Task-6 budgeted buffers. Row-major scratch indexing is an internal array-addressing detail only; no row-major cell ID appears in persistent candidate state. Allocation derives dimensions from physical extent / 250 m, checks exact divisibility, `maxAnalysisCells`, and an all-or-nothing byte preflight before any typed array in a requested batch is constructed. The 300 km × 180 km fixture must report 1200 × 720, 864,000 cells, and 62,500 m² per cell.

The persistent terminal/catchment count bound is already identity-bearing and needs no new constants: each valid terminal owns one distinct terrestrial analysis cell, so `terminalCount <= terrestrialCellCount <= analysisCellCount <= analysis.maxAnalysisCells`; §12 freezes one catchment per terminal, so `catchmentCount === terminalCount <= maxAnalysisCells`. Task 6 fails `M02_BOUND_EXCEEDED` before allocating `terminalOwnerCells` if its scalar discovery count exceeds `maxAnalysisCells`; Task 8 and Task 12 independently re-check both inequalities and the one-to-one equality. No terminal or catchment is silently truncated.

### 5. Deterministic terrain primitive and numeric-kernel policy

- Seed derivation uses the existing browser-compatible SHA-256 helper once on canonical seed/generator stage text, then a fixed `Math.imul` integer mixer for stateless coordinate values. No `Math.random`, clock, locale, object insertion order, or legacy generator PRNG is imported.
- Correlated terrain uses fixed-operation-order bilinear value fields at the identity-bearing macro/meso/fine wavelengths from verified constants. Family labels are not decorative amplitude aliases: the exact v1 family-dependent spatial operators frozen in §13 below modify the same controlled base field using identity-bearing aspect/falloff/shape constants.
- Province geometry is a bounded rotated ellipse in physical metres with persisted `axisAngleRadians`; no temporary province raster persists.
- Topology-affecting binary64 comparisons use exact finite binary64 values under the declared `numericKernelVersion` and fixed operation/order rules. Exact ties use explicit canonical neighbor/facet order. M0.2 claims exact repeatability only in its declared reference runtime; M0.5 owns cross-runtime certification.
- The fixed 8-neighbor order is `E, NE, N, NW, W, SW, S, SE`. D∞ facets are adjacent pairs in that cyclic order. Queue order is stage-specific and frozen below: Priority-Flood uses §10.2 `(provisionalRoutingElevation, point.xM, point.yM, scratchIndex)`; flat-rank seed/level ties use §10.7 point/neighbor order; D∞ topological ready-cell ties use §11 physical point order. `scratchIndex` can only be the final unreachable tie after a unique physical point in Priority-Flood and is never a physical routing choice. No runtime sort stability is relied upon.

### 6. World edge, depression, D∞, and persistent-drainage semantics

- Raw physical elevation never gets overwritten by routing conditioning. The complete pre-conditioning component discovery, spill ordering, retained/protected-basin state machine, finite-edge policy, routing-surface update, and flat-rank policy are frozen in §10 and are normative for Tasks 4, 6, 7, and 9.
- Priority-Flood is the DEM depression-processing mechanism, not the project-specific endorheic policy. Society Engine's protected closed-basin decision is the deterministic identity-bearing layer in §10.
- Ocean outlets, external-domain outlets, and retained closed-basin terminals are explicit and mechanically distinct. Array-edge adjacency alone never assigns terminal kind.
- `d_infinity_v1` means the Tarboton triangular-facet mathematics in §11. No D8, MFD, or heuristic substitute is conforming. An explicit Task-6 terminal owner short-circuits before facet evaluation; only non-terminal cells execute D∞, and their flats use the separate deterministic rank rule only when no positive D∞ facet exists.
- D∞ split contributing area is transient analysis truth. The deterministic primary receiver is reduced according to §12 for catchments and the one-receiver persistent graph.
- **V1 persistent eligibility is area-threshold-only:** a terrestrial analysis cell is eligible iff `flow.contributingAreaM2[cell] >= constants.drainage.persistenceAreaM2`. There is no hidden slope, local-relief, valley, or climate gate in v1. `persistenceAreaM2` is an identity-bearing implementation representation parameter, not a universal channel-head law.
- Persistent reach `contributingAreaM2` is the primary-receiver physical area at the exact downstream measurement anchor frozen in §12; `localContributingAreaM2` is its independent retained conservation witness. This is intentionally distinct from transient split D∞ area used for eligibility.
- Reach IDs/nodes/catchments/basins/geometry IDs derive only after canonical physical ordering under §8; allocation order never becomes identity.

### 7. Terrain-only valleys, floodplain candidates, crossings, and strategic projection

- Valley/floodplain candidate derivation consumes raw terrain shape, local relief/slope, and persistent drainage alignment only. It does not consume rainfall, discharge, seasons, wetlands, or dynamic flood state.
- `channelIncisionMeters` is bank-to-bed terrain geometry. It is never water depth.
- A crossing candidate exists only when persistent drainage geometry intersects a cardinal strategic edge. Its state is exactly the physical fields frozen above; exact-key structural audits reject any epistemic/hydraulic additions.
- Strategic aggregation groups exact 250 m analysis cells into the explicit M0.1 strategic grid. Physical totals use m²/m, not cell counts. 1000 m and 1500 m both divide the 250 m basis exactly.
- Provenance fraction, land/ocean area, elevation, relief, slope, coast length, and feature references derive from canonical physical state. Strategic `terrainKind`, biome, movement cost, resource/risk/seasonal/carrying-capacity projections are not produced.

### 8. Canonical collection, point/ring, persistent-ID, and simplification contract

These conventions are implementation authority for Tasks 2–3 and every producer of persistent geometry. They are not choices left to a future module.

**ASCII comparator and collection semantics.** Every string passed to canonical `compareAscii` must already be validated as printable 7-bit ASCII (`0x20..0x7e` for each code unit); a non-ASCII canonical key/ID is invalid rather than locale-normalized. Compare left-to-right by `charCodeAt(i)`: at the first differing code unit return `-1` when left is smaller and `1` when right is smaller; if every shared position is equal, the shorter string sorts first; equal strings return `0`. Do not use `localeCompare`, host collation, case folding, normalization, or insertion order.

A collection is either schema-declared unordered or schema-declared ordered. For every unordered **entity registry**, validate every ID, reject duplicate IDs, copy the caller collection, and sort the copy with `compareAscii(left.id,right.id)`; never mutate caller state. For unordered non-entity collections: `coastline` validates every `coastKey`, rejects duplicate `coastKey`, copies, and sorts by `compareAscii(coastKey)`; every strategic feature-ID list validates every referenced ASCII ID, rejects duplicate IDs, copies, and sorts by `compareAscii(id)`; `provenanceFractions` validates every `provinceId`, rejects duplicate `provinceId`, copies, and sorts by `compareAscii(provinceId)`; `strategicTerrain` validates each numeric `(row,column)` key, rejects duplicate cell keys, copies, and sorts numerically by row then column. Reversing caller insertion order is a positive determinism control, not an error. Ordered sequences include upstream→downstream reach points, each normalized coastline-polyline traversal, and the point traversal of each already-normalized polygon ring. They are never sorted/reversed merely to canonicalize bytes.

**Physical point coordinates.** Scratch coordinates use x-right/y-up. Row 0 is the north/top row. For cell size `d = 250`, cell `(row,column)` has center

```text
x = (column + 0.5) * d
y = (height - row - 0.5) * d
```

and cell-boundary vertices are integer multiples of `d`. Point comparison is exact finite binary64 lexicographic `(xM,yM)`, x first then y; `-0`, NaN, and infinities fail before comparison. No epsilon participates in canonical ordering.

**Ring representation.** Every ring is simple, closed, and stores its canonical first point exactly twice total: once at index 0 and once as the final point; no other consecutive duplicate is allowed. Signed area is

```text
A2 = Σ_i (x_i * y_{i+1} - x_{i+1} * y_i)
```

for all non-repeated edges. In x-right/y-up coordinates, `A2 > 0` is counter-clockwise and `A2 < 0` is clockwise; zero fails. Outer physical-region rings are counter-clockwise. Hole rings are clockwise. The lexicographically smallest ring point is rotated to index 0 without changing traversal direction; if that coordinate appears more than once before closure, the ring is invalid rather than tie-resolved by implementation choice. Catchment, depression, valley, and floodplain `boundaryRings` may contain multiple disconnected outer rings and nested holes because diagonal terrain connectivity can create cell unions that touch only at vertices. Ring role is determined independently by exact containment depth against the unsimplified cell-edge geometry: even depth is outer, odd depth is hole. Canonical ring-registry order is `(outer-before-hole, containmentDepth, firstPoint, encodedPointSequence)`.

**Coastline polyline representation.** Coastline is not forced closed at a finite regional boundary. Every coastline item is an oriented, simple cell-edge polyline with land on its left and canonical ocean on its right for every segment. A closed item follows the ring representation above: island/outer land boundaries are CCW and ocean-hole boundaries are CW, with lexicographically smallest point as the repeated start/end. An open item stores each endpoint once, has at least two distinct points, and both endpoints must lie on the physical domain boundary; its orientation is fixed by land-left/ocean-right and therefore may **not** be reversed merely to put the lexicographically smaller endpoint first. Domain-exterior edges themselves are never coastline.

The coastline registry has an exact ASCII semantic key, independent of insertion order. For each finite canonical coordinate `v`, define `f64key(v)` as exactly 16 lowercase hexadecimal digits from `DataView.setFloat64(0, v, false)`; `-0`, NaN, and infinities fail before keying. Define `pt(p) = f64key(p.xM) + "," + f64key(p.yM)`. For a normalized coastline polyline define `coastKey = (closed ? "c|" : "o|") + points.map(pt).join(";")`. Duplicate `coastKey` fails `M02_CANDIDATE_INVALID`. Producer order is component smallest-member point, then `compareAscii(coastKey)`. Canonical audit encoding treats the coastline registry as unordered: copy the caller array and sort the copy by `compareAscii(coastKey(left), coastKey(right))`; caller order is not an error and point traversal is never reversed/rotated to change this key.

**Persistent ID namespaces.** IDs are assigned only after canonical physical records have been sorted, never from insertion/allocation order. Every registry uses a fixed ASCII namespace and a zero-based 16-lowercase-hex-digit ordinal:

```text
province:0000000000000000
terminal:0000000000000000
catchment:0000000000000000
drainage-node:0000000000000000
drainage-reach:0000000000000000
depression-basin:0000000000000000
valley:0000000000000000
floodplain:0000000000000000
crossing:0000000000000000
```

Persistent collections that are not entity registries receive **no invented synthetic ID**: coastline polylines are keyed by their frozen closed/open geometry key; `strategicTerrain` records are keyed by `(row,column)`; `provenanceFractions` entries are keyed by `provinceId`; ordered geometry points are positions inside their owning entity. This exhausts the persistent candidate collections: every entity registry uses one namespace above, and every non-entity persistent collection has its exact semantic key named here.

The ordinal formatter accepts only safe non-negative integers and left-pads to exactly 16 hex digits; overflow is `M02_BOUND_EXCEEDED`. Every physical tuple comparison below compares fields left-to-right with exact numeric/ASCII/point comparators; if two candidate records have an identical complete physical sort key, fail `M02_CANDIDATE_INVALID` before ID assignment rather than relying on sort stability or allocation order. Canonical physical sort keys are: province `(family,center,radiusXM,radiusYM,axisAngleRadians,influenceRadiusM,offset,multiplier)`; terminal `(kind-order retained_closed_basin,ocean_outlet,external_domain_outlet, point)`; catchment `(terminal physical key, boundary-ring key, areaM2)`; node `(point, kind-order source,confluence,terminal, transient terminal physical key)`; reach `(upstream node physical key, downstream node physical key, ordered geometry, terminal/catchment physical key)`; basin `(closed flag, floor, spill-null-last, boundary-ring key, catchment physical key)`; valley/floodplain `(reach physical key,boundary-ring key)`; crossing `(reach physical key,strategic edge,intersection,leftBank,rightBank)`. Transient physical keys—not eventual IDs—resolve cross-registry dependencies while sorting. After IDs are assigned, unordered registries may be presented in any insertion order to the canonical encoder; bytes are still produced from a sorted copy.

**Exact v1 simplifier.** `simplifyToleranceMeters` is the maximum Euclidean perpendicular displacement permitted for deletion of an interior vertex. V1 uses deterministic iterative safe-vertex deletion, not an implementation-selected RDP variant:

1. Work on the producer-normalized ordered polyline; for a ring, temporarily omit only the repeated final point and protect the canonical start vertex. For an open reach, protect both endpoints and every topology-critical node/confluence/terminal intersection. For an open finite-border coastline, protect both physical-domain endpoints.
2. For each unprotected vertex `v` with current neighbors `(p,n)`, compute squared Euclidean point-to-segment distance with this exact binary64 operation order; `p` and `n` must be distinct or the geometry is invalid before simplification:

```text
dx = n.xM - p.xM
dy = n.yM - p.yM
wx = v.xM - p.xM
wy = v.yM - p.yM
len2 = dx*dx + dy*dy
t = (wx*dx + wy*dy) / len2
tc = min(1, max(0, t))
qx = p.xM + tc*dx
qy = p.yM + tc*dy
ex = v.xM - qx
ey = v.yM - qy
distanceSquared = ex*ex + ey*ey
toleranceSquared = simplifyToleranceMeters * simplifyToleranceMeters
```

No fused/reassociated alternate formula is the audit oracle. It is a deletion candidate only when `distanceSquared <= toleranceSquared`.
3. Order candidate deletions by `(distanceSquared, v.xM, v.yM, originalVertexOrdinal)` and attempt the smallest tuple first. Recompute neighboring candidate distances after every accepted deletion; do not depend on sort stability.
4. A deletion is accepted only if replacement segment `p→n` creates no proper intersection or overlap with any non-adjacent segment of the same geometry or any sibling ring and preserves all protected endpoints. For persistent reaches, it also must not create an intersection/overlap with any other persistent reach except at an already-shared protected source/confluence/terminal endpoint; a simplification chord may never manufacture a crossing, confluence, or shared segment. If the geometry is a ring, it must also keep nonzero signed area with the required orientation and containment depth; for raster-derived closed coastline/catchment/depression boundaries, additionally scan the finite analysis-cell-center set in the changed triangle/bounding box and require identical before/after inside/outside classification. For an **open finite-border coastline**, no diagonal shortcut is permitted: deletion is allowed only when `p,v,n` are exactly collinear, `v` lies on segment `p→n`, and `p→n` equals the same oriented land↔ocean boundary segment geometrically; both domain-boundary endpoints remain protected. Thus open coastline simplification removes only redundant collinear vertices and can never move the finite land/ocean partition.
5. Repeat until no eligible safe deletion remains. Restore the final repeated ring start exactly once and re-check normalization. No insertion is performed.
6. If a feature still exceeds its verified vertex bound, return `M02_BOUND_EXCEEDED`; never exceed tolerance, reverse a ring, remove a topology-critical endpoint, or accept a topology-changing chord to hit the bound.

**Global simplification schedule and peer-reference state (M03).** The local deletion rule above is not allowed to run against whichever peer geometry happens to have been simplified first by producer order. M0.2 v1 uses the following fixed topology-domain sequence, matching producer dependencies: `0 coastline`, `1 catchment boundary rings`, `2 drainage reaches`, `3 retained-depression boundary rings`, `4 valley boundary rings`, `5 floodplain boundary rings`. Crossing candidates are **not** a simplification domain: Task 10 derives them only from already-final reach geometry and strategic edges.

Before simplifying any feature in one domain, collect every normalized **unsimplified** geometry in that domain and compute a pre-simplification physical key with no persistent ID: coastline uses its unsimplified `coastKey`; catchment rings use `(terminal physical key, areaM2, unsimplified boundary-ring registry key)`; reaches use `(upstream node physical key, downstream node physical key, terminal physical key, unsimplified ordered point sequence)`; retained depressions use `(closed flag, canonical floor point/elevation, physical spill, areaM2, unsimplified boundary-ring registry key)`; valley/floodplain rings use `(associated reach physical key, unsimplified boundary-ring registry key)`. Sort the complete domain by those exact keys before the first deletion. Equal complete pre-keys are invalid rather than relying on sort stability. Reversing or shuffling producer output therefore cannot alter the simplification schedule.

Within a domain, simplify features sequentially in that canonical order. While simplifying feature `i`, references to earlier peers `[0,i)` use their **final already-simplified** geometry; references to later peers `(i,end)` use their **original normalized unsimplified** geometry. Once feature `i` is finalized it is never reopened. A later feature must compare against every earlier final peer required by the matrix below, so it cannot manufacture a conflict against a finalized feature. Across domains, the earlier domain is final authority and a later domain may compare against it but may never cause the earlier geometry to be re-simplified. This directed domain rule is deliberate: later basin/valley/floodplain overlays may intersect foundational drainage in their already-derived physical relation, but may not retroactively change coastline/catchment/reach identity.

The topology-protection scope is exact:

| simplifying domain | peer/reference geometry that must be checked | required relation |
| --- | --- | --- |
| coastline | all coastline peers in domain 0 + raster cell-center partition | no new proper intersection/overlap; preserve land/ocean classification and open-boundary rules |
| catchment rings | all catchment-ring peers in domain 1 + final coastline | preserve the original unsimplified shared-edge/intersection signature; no new proper crossing/overlap and no loss of required coastal boundary contact |
| drainage reaches | all reach peers in domain 2 + final coastline + final catchment boundaries | preserve only the original declared source/confluence/terminal contacts; no new reach crossing/shared segment, no new coastline crossing, and no crossing out of the owning catchment except its already-declared terminal contact |
| retained-depression rings | sibling/all retained-depression peers in domain 3 + final coastline/catchments/reaches | preserve the original unsimplified intersection/containment signature, including any already-declared exorheic spill/reach contact; no new crossing/overlap |
| valley rings | sibling rings of the same valley + its associated final reach | preserve ring orientation/containment/raster classification and the existing reach association; overlap with a different valley/catchment overlay is semantically allowed and is not a pointless cross-feature rejection |
| floodplain rings | sibling rings of the same floodplain + its associated final reach | preserve ring orientation/containment/raster classification and the existing reach association; overlap with other floodplain/valley overlays is semantically allowed |

For each protected pair, "preserve original signature" means compare the exact unsimplified pair first and record whether they are disjoint, touch at named protected points, share a raster-derived boundary segment, or have a required containment relation. A proposed deletion is accepted only if that relation is unchanged; the simplifier never legalizes a pre-existing invalid crossing. Semantically unrelated overlays are intentionally omitted from the peer matrix rather than subjected to arbitrary no-intersection rules.

**ID barrier.** A persistent ID may be assigned only after every simplification domain capable of changing that entity's physical sort key is complete. Thus coastline has no entity ID; catchment IDs wait for domain 1; drainage-node/reach IDs wait for domain 2; basin IDs wait for domain 3; valley/floodplain IDs wait for domains 4/5 respectively. Terminal point/kind has no simplifiable geometry, but final `TerrainHydroTerminal.catchmentId` is materialized only after domain 1 catchment IDs exist. Later domains are prohibited from changing earlier final geometry, so no later simplification can retroactively alter an already-assigned physical key. This is the zero-context M0.2 v1 meaning of "IDs after simplification" and removes producer-order dependency without forcing semantically unrelated overlays into one intersection policy.

**Literal processing-order discriminator.** With `simplifyToleranceMeters=125`, use two non-crossing open peer polylines in the reach-domain audit: `A=[(0,0),(100,100),(200,0)]` and `B=[(50,20),(100,-10),(150,20)]`, all coordinates metres and endpoints protected. Their pre-key order is A then B because A's upstream point is lexicographically first. A's candidate chord `(0,0)→(200,0)` is within tolerance but intersects B's original two segments, so canonical A-first processing must retain `(100,100)`. B's middle point is 30 m from its endpoint chord and its replacement `[(50,20),(150,20)]` does not cross final A, so B deletes its middle vertex. The required canonical result is therefore exactly `A=[(0,0),(100,100),(200,0)]`, `B=[(50,20),(150,20)]`. If B were incorrectly processed first, B would simplify and then A's chord would become admissible, producing the different A endpoints-only geometry. The audit must demonstrate that reversing/shuffling producer input still restores A→B pre-key order, exact canonical final geometry bytes, and identical `terrainHydroCandidateDigest`; it must also run the deliberately opposite B→A reference schedule audit-side and prove that it produces the different non-canonical result, so the test discriminates global schedule rather than merely local simplifier determinism.

The audit independently supplies crossing/intersection/inside-outside checks and includes both the existing low-error non-adjacent-segment witness and the literal A/B processing-order discriminator above. Task 5 invokes domain 0; Task 8 invokes domain 1 then domain 2; Task 9 invokes domains 3, 4, then 5 before assigning the corresponding geometry-bearing IDs; Task 10 consumes final reach geometry and performs no simplification.

### 9. Exact v1 cell-edge coastline topology

M0.2 v1 uses **cell-edge boundary topology**, not marching-squares interpolation. Land components for coastline construction use cardinal edge adjacency only. Diagonal corner contact alone never merges land components. For each cardinally connected land component, enumerate **only** cell edges whose opposite in-domain cell is canonical ocean; a physical-domain exterior is not ocean and contributes no coastline edge. Orient every retained edge so land interior lies on the left and ocean lies on the right.

Trace oriented edges component-by-component. At an ordinary vertex, continue with the unique unused outgoing edge belonging to that same component. At a geometric degree-4 vertex caused by two diagonally touching land components, continue around the **same cardinally connected land component**; never pair edges diagonally into the other component. A closed trace normalizes as the corresponding §8 ring. An open trace is valid only when both endpoints lie on the physical domain boundary and follows the §8 land-left open-polyline rule. Component producer order is by lexicographically smallest member-cell center; within a component, traces use the frozen closed/open geometry key. This resolves the saddle without endpoint-sort ambiguity and does not reinterpret finite-domain outflow as ocean.

The mandatory checkerboard fixture embeds a 2×2 checkerboard inside a one-cell ocean halo on a 4×4 domain, `d=250`, row 0 north. The central 2×2 has land at `(row=1,col=1)` and `(row=2,col=2)` and ocean on the other two diagonal cells; every halo cell is ocean. Its exact normalized coastline output is two separate CCW outer rings, in canonical component order:

```text
[(250,500),(500,500),(500,750),(250,750),(250,500)]
[(500,250),(750,250),(750,500),(500,500),(500,250)]
```

They share only vertex `(500,500)` and must not be spliced into a diagonal figure. Reversing cell iteration must reproduce these exact rings. A second audit swaps the central land/ocean diagonals so land is at `(row=1,col=2)` and `(row=2,col=1)`. Its exact component-ordered output is:

```text
[(250,250),(500,250),(500,500),(250,500),(250,250)]
[(500,500),(750,500),(750,750),(500,750),(500,500)]
```

Again the shared vertex is contact only, not a diagonal pairing. No determinism-only assertion substitutes for these expected coordinates.

A separate finite-border fixture is a 3×3 domain with the entire left column land and the other six cells ocean. The only canonical coastline is the **open** two-point polyline `[(250,0),(250,750)]`, directed south→north so land is on the left. The west/north/south domain-exterior edges are not coastline. This literal fixture distinguishes canonical ocean boundary from `external_domain_outlet`/finite-domain exterior semantics.

### 10. Complete deterministic v1 depression / retained-basin / terminal state machine

Priority-Flood terminology follows Barnes, Lehman & Mulla (2014): it provides deterministic DEM depression processing/filling and watershed support. It does **not** decide Society Engine's intentional closed-basin semantics. The project-specific state machine below does.

**10.1 Valid outlet owners before conditioning.** Land components for finite-boundary classification are cardinally connected. A canonical ocean outlet owner is a terrestrial cell sharing a cardinal cell edge with canonical ocean; if one cell has several ocean edges, its terminal point is the smallest land↔ocean boundary-edge midpoint under point order. There is at most one ocean-terminal owner per terrestrial cell.

External-domain candidacy is component-level, not generic cell-edge adjacency. For each cardinal land component intersecting the raster boundary, enumerate outward cardinal boundary crossings whose inside cell is **not already an ocean-terminal owner**, then select at most one by `(rawElevationMeters of inside cell, boundary intersection point, outward order E,N,W,S)`. If that filtered set is non-empty, its first tuple's inside cell becomes the component's `external_domain_outlet` owner. If it is empty and the component already has one or more ocean-terminal owners, no external owner is added; the known ocean outlets are its valid finite-domain terminals. If it is empty and the component has no ocean-terminal owner, fail `M02_TERMINAL_INVALID` because a boundary-touching non-ocean component cannot be left terminal-free. Other boundary cells are not terminals merely because they are array-edge cells. A basin/path is classified external only if its canonical routing reaches the selected external-owner cell; merely containing/touching a raster-edge cell is insufficient. No external inflow is fabricated.

Terminal ownership is transient but exact and compact. Task 6 writes only `scratch.terminalKindByCell` plus scalar `terminalCount` during discovery; it does not create a JS object/string record for an outlet. A terrestrial scratch cell may own at most one terminal. Protected floor cells cannot overlap an existing outlet owner because valid Priority-Flood outlet cells are never raw depression members. Duplicate `(kind,point)` or duplicate owner cell is `M02_TERMINAL_INVALID`.

The terminal point is a pure function of `(kind, ownerCell, scratch land/domain geometry)`: ocean uses the smallest cardinal land↔ocean boundary-edge midpoint owned by that cell under §10.1 point order; external uses the selected outward boundary crossing for that owner, re-derived by the same `(boundary intersection point, outward order E,N,W,S)` tie after owner selection; retained-closed uses the owner-cell center. Task 6 and Task 8 call the same pure point derivation; neither stores an O(N) point/string registry.

Discovery order is not terminal identity. After every terminal owner is finalized, Task 6 first counts owners with a scalar physical-point scan, requires the count `<= analysis.maxAnalysisCells`, preflights one exact-length ledger allocation `terminalOwnerCells: i32[terminalCount]`, fills it from the dense kind array, and sorts that typed array by the numeric physical key `(kind-order retained_closed_basin,ocean_outlet,external_domain_outlet, derived terminal point)`. It then fills `terminalOrdinalByCell`: `-1` for non-owners and the sorted ordinal for each owner. `TerrainTerminalOwnerAnalysis` exposes the two scratch arrays plus that exact-length owner vector and count; reverse ocean/component discovery must reproduce all three arrays byte-for-byte. Persistent physical terminal keys/IDs do not exist in Task 6. Task 8 derives them only from the canonical numeric owner order and §8 physical-ID rules.

**10.2 Pre-conditioning raw depression discovery.** Before `scratch.routingElevationMeters` is changed, run deterministic Priority-Flood from the valid ocean/external outlet-owner cells into a budgeted stage-local `provisionalRoutingElevation` buffer. Heap entries are scratch indices only and compare `(provisionalRoutingElevation, cell point x,y, scratchIndex)`; neighbor expansion is `E,NE,N,NW,W,SW,S,SE`. The raw elevation array is never written. Candidate depression cells are exactly terrestrial cells with `provisionalRoutingElevation > elevationMeters` under exact finite binary64 comparison. Candidate depression components are maximal terrain-8-connected sets of candidate cells sharing the same exact provisional spill elevation. This definition is based on raw cells plus the separately computed provisional routing surface and occurs before final routing conditioning is committed.

Component discovery itself is canonically ordered without retaining an object-per-component table: scan candidate cells by physical point `(xM,yM)` ascending (column ascending; within a column, row descending because y increases north). The first unlabelled candidate begins the next component, so its point is that component's unique `smallestMemberPoint` and its zero-based discovery ordinal is canonical. Flood that component using the fixed terrain-8 neighbor order while requiring the same exact provisional spill elevation; `depressionLabel` records membership and the reusable `heapIndex` buffer is the component queue. Thus component order is exactly `(smallestMemberPoint)` and cannot depend on heap/insertion order.

Within the current component, equal-height cells are grouped by terrain-8 exact-elevation connectivity. `floorElevationMeters` is the minimum raw elevation. If multiple disjoint minimum-elevation plateaus tie, select the plateau whose smallest physical point is lexicographically first; `canonicalFloorCell` is that plateau's smallest point. The transient component identity is `(canonicalComponentOrdinal, smallestMemberPoint, spillElevationMeters, floorElevationMeters, canonicalFloorPoint)`. No sorted member-cell sequence or per-component JS object is retained: the current component's bounding box/count/floor/spill statistics are scalar state, persistent retained geometry is vectorized immediately, and `depressionLabel` remains the membership oracle until Task-6 release.

**10.3 Spill candidates and tie rule.** A spill candidate is every terrain-8 neighbor pair `(inside,outside)` with `inside` in the depression component, `outside` not in it, and `outside` terrestrial/ocean, plus an explicit external boundary crossing when the inside cell owns the component's selected external outlet. For a terrestrial outside cell, `candidateElevation = max(rawInside, rawOutside)`; for canonical ocean, use `max(rawInside, seaLevelMeters)`; for an external crossing use `rawInside`. Order candidates by:

```text
(candidateElevation,
 outsideKind: terrestrial < ocean < external,
 insidePoint.x, insidePoint.y,
 outsideOrBoundaryPoint.x, outsideOrBoundaryPoint.y,
 neighborOrOutwardOrdinal)
```

and use the first. No heap/insertion-order tie is observable. For an unprotected depression produced by the provisional fill, the resulting elevation must equal its provisional spill elevation or compilation fails `M02_ROUTING_UNRESOLVABLE`.

**10.4 Deterministic intentional closed-basin protection.** Task 4 derives the transient `TerrainProtectedBasinIntentKey {a,b,c,d}` with the exact length-prefixed UTF-8/SHA-256/big-endian-u32 primitive frozen in Task 4, using stage tag `world-m0:m02:protected-basin-intent:v1`. No human/climate state participates and no dense protection raster exists. As each raw component is processed in the canonical smallest-member-point order from §10.2, Task 6 computes:

```text
h0 = mix32(intent.a ^ floorRow ^ rotl32(floorColumn, 11))
h1 = mix32(intent.b ^ spillF64High ^ rotl32(spillF64Low, 7))
h2 = mix32(h0 ^ rotl32(h1, 13) ^ intent.c ^ intent.d)
score16 = h2 >>> 16
protected = score16 < protectedClosedBasinRatePer65536
```

where `mix32(x)` is exactly `x ^= x>>>16; x=Math.imul(x,0x7feb352d); x^=x>>>15; x=Math.imul(x,0x846ca68b); x^=x>>>16; return x>>>0`, `rotl32` is unsigned 32-bit rotate-left, and `spillF64High/Low` are the big-endian IEEE-754 words of the exact spill elevation. `protectedClosedBasinRatePer65536` is an integer in `[0,65536]`. A protected component receives transient token `protected-basin:<16-lowercase-hex component ordinal>`. If protected count exceeds `maxProtectedClosedBasins`, fail `M02_BOUND_EXCEEDED`; never drop/select the first N. This token is generator truth controlled by seed/constants/generator identity, bounded, transient, non-epistemic, and not a 250 m persistent authority.

**10.5 Retention and closed/exorheic classification.** `areaM2 = memberCellCount * 62_500`. `depthMeters = spillElevationMeters - floorElevationMeters`. A component is retained iff `(areaM2 >= retainedMinAreaM2 && depthMeters >= retainedMinDepthMeters) || protected`. It is `closedEndorheic === true` **iff protected is true**. Protected retained basins terminate at a `retained_closed_basin` terminal owned by the canonical floor cell: Task 6 writes terminal kind `3` there and the canonical terminal ordinal is assigned only after the compact owner-vector sort. They expose `spillElevationMeters: null`, `outletTerminalId: null` persistently; the transient physical rim/spill remains in Task-6 analysis for validation. No transient terminal token/string is created. An unprotected retained component is exorheic: it preserves raw floor/area/boundary/spill geometry while routing continues through the canonical spill to ocean/external/another downstream basin. Every retained component receives transient analysis token `depression-analysis:<16-lowercase-hex canonicalComponentOrdinal>`; this token is independent of future persistent IDs. A protected closed terminal owner is the retained depression's canonical floor cell; ocean/external owners have no retained-depression association. An unretained component is an ordinary routing depression and produces no persistent basin. Task 6 does **not** predict an exorheic basin's eventual terminal ID: Task 8 resolves that after primary routing while catchment membership is live.

**10.6 Final routing surface and Protected Closed-Basin Internal Routing.** Start `routingElevationMeters` as a copy of raw elevation. For every ordinary or retained-exorheic component, copy the provisional conditioned values for its member cells; raw elevation remains unchanged and retained raw geometry stays in the Task-6 analysis record for Task 9. For every protected closed component, preserve raw terrain and install exactly one terminal at the canonical floor, then derive a deterministic component-local minimax surface seeded only there. Set `internalRouting[floor] = rawElevation[floor]`; for a reached member `u` and terrain-8 neighbor `v` with the exact same `depressionLabel`, relax `candidate = max(rawElevation[v], internalRouting[u])` and retain the minimum candidate over all component-internal paths. Initialize members from their provisional outer-spill values as finite upper bounds and write improvements directly to final `routingElevationMeters`. Queue order is exactly `(routingElevation, point.xM, point.yM, scratchIndex)`, using scratch index only as the final unreachable physical-point tie; runtime insertion order and epsilon ordering are forbidden. Every member must satisfy `rawElevation[cell] <= routingElevation[cell] <= physicalSpillElevation`, and the canonical floor must equal its raw elevation exactly. No exterior cell may enter the search or become a routing exit; the physical outer spill remains geometry only, persistent spill remains null, and repair-v1 remains inapplicable to protected components. Protection, retention, closed state, floor identity, and physical spill identity/elevation do not change. A protected component whose final surface violates these invariants fails `M02_PROTECTED_BASIN_DESTROYED`.

**10.7 Flat ranks.** Flat ranks are integer routing order, not synthetic elevation. First set `flatRank=-1`. For each maximal terrain-8 connected equal-`routingElevationMeters` flat, identify exit seeds: cells having a valid lower-routing neighbor or an explicit ocean/external terminal. For a protected closed floor plateau, the sole exit seed is `canonicalFloorCell`. Sort seeds by `(point, terminal-kind/neighbor order)` and assign rank 0. Perform deterministic breadth-first expansion over equal-elevation flat neighbors in fixed terrain-8 order; a first visit gets `parentRank+1`, with same-level queue ties by point order. Every flat cell must receive a finite non-negative rank. D∞ may route across an equal-elevation edge only from larger rank to smaller rank; it may never use scratch-index order alone as a physical descent. Failing to rank a nonterminal flat is `M02_ROUTING_UNRESOLVABLE`.

**10.8 Exact F5/F6/F7 depression goldens.** The independent audit uses the same 5×5 raw grid (row 0 north), with all cells terrestrial and `d=250`:

```text
9 9 9 9 9
9 6 5 6 9
9 5 1 1 5
9 6 5 6 4
9 9 9 9 3
```

The depression component is exactly `{(2,2),(2,3)}`; equal-height floor plateau is both cells; canonical floor is `(2,2)`; physical area is `125000 m²`; canonical spill is the `(2,3)→(3,4)` SE neighbor pair at elevation `4`; depth is `3`. In each isolated F5/F6/F7 run this is canonical component ordinal 0, so a retained analysis token is exactly `depression-analysis:0000000000000000`.

For F5, set thresholds above this area/depth and `protectedClosedBasinRatePer65536=0`: it is not retained, both component routing elevations become `4`, spill-side flat rank `(2,3)=1`, `(2,2)=2` with outside spill cell `(3,4)=0`, and routing ultimately reaches the fixture's explicit `external_domain_outlet` terminal.

For F6, pass audit-controlled `protectedIntentKey={a:0,b:0,c:0,d:0}` and `protectedClosedBasinRatePer65536=42612` while keeping area/depth below ordinary retention. With floor row/column `(2,2)` and spill binary64 words `0x40100000,0x00000000`, §10.4 must produce `h0=1710706095`, `h1=3575335380`, `h2=2792555385`, `score16=42611`, so protection is exactly true. The component is retained/protected/closed with `protectedIntentToken="protected-basin:0000000000000000"`; raw elevations remain `1,1` and routing elevations remain `1,1`; floor ranks are `(2,2)=0`, `(2,3)=1`; terminal kind is exactly `retained_closed_basin` at canonical floor center `(625,625)` with `terminalKindByCell=3`, its canonical compact terminal ordinal/owner relation, and no transient terminal token; this basin has no ocean/external outlet.

For F7, set `protectedClosedBasinRatePer65536=0` and thresholds `retainedMinAreaM2 <= 125000`, `retainedMinDepthMeters <= 3`: component is retained but exorheic, token `depression-analysis:0000000000000000`, routing elevations/ranks match F5, persistent spill is `4`, and onward primary routing reaches the fixture's canonical `external_domain_outlet` terminal. Audits hard-code these cells/values and derive none of them by calling production depression helpers.

**10.9 Exact `repair:v1` routing repair.** Repair is not a second basin policy and never changes raw elevation, retention, protection, terminal class, spill selection, thresholds, or IDs. It exists only for an ordinary/retained-exorheic component whose copied routing surface is internally inconsistent with its already-frozen canonical spill. Immediately after §10.6 copies provisional conditioning into `scratch.routingElevationMeters` and before final flat ranking, scan that component's `depressionLabel` membership and require every member's routing elevation to equal its `spillElevationMeters`. If all match, use zero repair operations. If any member differs, the component is repair-eligible only when it is unprotected and has the canonical spill pair from §10.3; otherwise fail `M02_ROUTING_UNRESOLVABLE`. Before any write, require `repairOperationCount < maxRepairOperations`; if false, return `M02_REPAIR_BUDGET_EXHAUSTED` with no routing changes. One repair operation then sets `routingElevationMeters[cell] = spillElevationMeters` for **every** cell with that component label, in physical-point scan order, increments the count once, and seeds the later flat-rank BFS from the canonical spill-side inside cell. Recheck that every repaired member can reach that seed through equal routing elevation; failure is `M02_ROUTING_UNRESOLVABLE`. No iterative threshold relaxation or alternate spill search exists.

The repair golden reuses F5 after component/spill discovery and the normal §10.6 copy, then audit-injects a synthetic routing mismatch `routingElevation(2,2)=5` while `(2,3)=4` and canonical spill remains `4`. With `maxRepairOperations=1`, expected post-repair routing is exactly `(2,2)=4,(2,3)=4`, `repairOperationCount=1`, raw elevations remain `1,1`, and final ranks remain `(2,3)=1,(2,2)=2`; with `maxRepairOperations=0`, the same fixture must fail `M02_REPAIR_BUDGET_EXHAUSTED` **before either routing cell is written**. The audit injects this mismatch through an audit-only input seam around the repair primitive; production terrain generation never fabricates a mismatch to exercise the budget.

### 11. Exact `d_infinity_v1` mathematical contract

This section is the implementation contract for Task 7. It follows Tarboton (1997), *Water Resources Research* 33(2), 309–319, DOI `10.1029/96WR03137`, and the authoritative TauDEM D-Infinity documentation. The paper defines steepest descent over eight block-centred triangular facets, clamps an out-of-facet slope to the steepest facet edge, measures direction counter-clockwise from east, and proportions flow between the two adjacent neighbors by angular proximity. Society Engine changes only the already-declared boundary/flat handling and uses iterative topological accumulation instead of recursive depth-dependent evaluation.

Let cell size `d=250`. Scratch x increases east; y increases north; row index increases south. The center cell has elevation `e0`. Neighbor order/angles are:

```text
E  0: 0
NE 1: π/4
N  2: π/2
NW 3: 3π/4
W  4: π
SW 5: 5π/4
S  6: 3π/2
SE 7: 7π/4
```

The eight facets, in exact tie order, are. Each row also freezes the local orthonormal basis: `a` points from the center to side neighbor `e1`; `b` points from `e1` toward diagonal neighbor `e2`. Therefore the two facet coordinate vectors from the center are exactly `p1=d*a` and `p2=d*(a+b)`.

| facet | angular sector | side `e1` | diagonal `e2` | `a` | `b` | global angle from local `r` |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | E→NE | E | NE | `(1,0)` | `(0,1)` | `α = r` |
| 1 | NE→N | N | NE | `(0,1)` | `(1,0)` | `α = π/2 - r` |
| 2 | N→NW | N | NW | `(0,1)` | `(-1,0)` | `α = π/2 + r` |
| 3 | NW→W | W | NW | `(-1,0)` | `(0,1)` | `α = π - r` |
| 4 | W→SW | W | SW | `(-1,0)` | `(0,-1)` | `α = π + r` |
| 5 | SW→S | S | SW | `(0,-1)` | `(-1,0)` | `α = 3π/2 - r` |
| 6 | S→SE | S | SE | `(0,-1)` | `(1,0)` | `α = 3π/2 + r` |
| 7 | SE→E | E | SE | `(1,0)` | `(0,-1)` | `α = 2π - r`, normalize exact `2π` to `0` |

A facet is geometrically evaluable only when both listed neighbor cells exist in bounds and are terrestrial. Ocean/external exits are represented by Task-6 terminal cells; an incomplete/no-data facet is skipped rather than inventing an elevation beyond the domain.

For each evaluable facet calculate the exact elevation differences, planar downslope-gradient components, vector, direction and magnitude in this operation order:

```text
dz1 = e0 - e1
dz2 = e1 - e2
s1  = dz1 / d
s2  = dz2 / d
g   = s1*a + s2*b
r   = atan2(s2, s1)

if r < 0:
    r = 0
    g = s1*a
    s = s1
else if r > π/4:
    r = π/4
    g = ((e0 - e2) / (2*d)) * (a+b)
    s = (e0 - e2) / (sqrt(2) * d)
else:
    s = hypot(s1, s2)
```

For the interior case `0 <= r <= π/4`, `g=s1*a+s2*b` is the planar **downslope** vector and `s=|g|`; for either outside-facet case the vector is clamped to the named boundary direction before comparison. `atan2` is the unambiguous reference-runtime evaluation of Tarboton's `atan(s2/s1)` expression. A facet candidate is downslope only when final `s > 0` exactly. Select the candidate with greatest `s`; exact binary64 slope ties use the lower facet number above. No tolerance changes facet selection. Convert its local `r` to `α` with the table and normalize to `[0,2π)`.

Let the selected facet's angular bounding neighbors in counter-clockwise order have direct angles `θ0` and `θ1`, with unwrapped `θ1 = θ0 + π/4` (for facet 7 use E as `2π`). Let `αu` be the selected angle unwrapped into that interval. Define

```text
q = (αu - θ0) / (π/4)
w0 = 1 - q
w1 = q
```

with `q` required in `[0,1]`. A mathematically exact zero weight is omitted: if `q===0`, only lower-angle neighbor receives weight 1; if `q===1`, only upper-angle neighbor receives weight 1. Otherwise both receivers must be downstream under `(routingElevation,flatRank)`, are stored in facet angular order, and `abs((w0+w1)-1) <= validation.finiteTolerance` is mandatory. Do not renormalize an invalid negative/out-of-range weight into validity.

**Terminal-owner precedence.** Before evaluating any D∞ facet, read the compact Task-6 terminal ownership for the center cell. If `terminalKindByCell[center] != 0`, the cell is an analysis-graph sink regardless of surrounding elevations: set `primaryReceiver[center] = -1`, `secondaryReceiver[center] = -1`, `primaryWeight[center] = 0`, `secondaryWeight[center] = 0`, and `terminalReceiver[center] = terminalOrdinalByCell[center]`; require that ordinal to be in `[0, terminalCount)`, require `terminalOwnerCells[ordinal] === center`, and return `selectedFacet=null`, `directionRadians=null`, `usedFlatRankFallback=false`, `receivers=[]`. No facet slope, neighboring lower cell, or flat fallback is evaluated as an alternative. This applies identically to explicit ocean, external-domain, and retained-closed owners. The terminal was already selected by Task 6's physical boundary/depression policy, so this precedence is not arbitrary uphill blocking.

Only a non-terminal terrestrial cell executes ordinary facet evaluation. If no positive facet exists for such a cell, it is a flat/pit case: use exactly one terrain-8 equal-routing-elevation neighbor with lower `flatRank`, taking minimum `(flatRank, neighborOrdinal, point)` and assigning it weight 1 with the direct-neighbor angle. If neither positive D∞ descent nor a lower-rank flat neighbor exists, fail `M02_ROUTING_UNRESOLVABLE`. This flat fallback is not D8 terrain routing: it is used only after D∞ has no positive facet and follows the independently frozen flat rank. For non-terminal cells `terminalReceiver` is exactly `-1`; arbitrary other negative values are invalid.

**Primary receiver.** If there is one positive-weight receiver, it is primary. If there are two, the larger D∞ weight is primary; an exact weight tie uses the lower terrain-neighbor ordinal `E,NE,N,NW,W,SW,S,SE`. Secondary is the other. This primary rule is the sole raster reduction consumed by Task 8.

**Acyclic ordering and contributing area.** A valid receiver must strictly decrease `(routingElevationMeters, flatRank)` lexicographically; scratch index alone never makes an equal flat edge downhill. Build incoming-edge counts iteratively. Kahn processing starts with all terrestrial cells having zero contributing-flow incoming edges, ordered by physical point, and emits `topologicalOrder` upstream→downstream. On pop, add `contributingAreaM2[cell] * weight` to each receiver and decrement that receiver's incoming count. Each terrestrial cell starts with exactly `62_500 m²`; ocean cells start zero and never enter the order. Processing count must equal terrestrial cell count or fail `M02_DRAINAGE_CYCLE`. No recursion depends on world depth.

**Hard-coded D∞ goldens.** Task 7 and F1/F2/F4 evidence include a 3×3 block-centred harness where the center is index 4 and all eight perimeter cells are explicit terminal sinks, so central facet math and accumulation have independent closed-form expectations:

1. Plane `z = 100 - 2*xCell - 1*yCell`: center selects facet 0 `(E index 5, NE index 2)`, `α = 0.4636476090008061`, `wE = 0.40966552939826695`, `wNE = 0.590334470601733`, center area `62500`, E area after receipt `88104.09558739168`, NE area `99395.90441260832`.
2. Plane `z = 100 - 2*xCell`: exact cardinal descent; facet 0 wins the facet-0/facet-7 edge tie, `α=0`, E is sole receiver with weight 1, E area `125000`.
3. Plane `z = 100 - xCell - yCell`: exact NE facet boundary; facets 0 and 1 have equal steepest slope and facet 0 wins, `α=π/4`, NE is sole receiver with weight 1, NE area `125000`.
4. Finite-border fixture uses the north-east corner index 2 of a 3×3 plane `z = 100 + xCell`; all out-of-bounds facets are skipped, facet 4 `(W,SW)` is the first complete steepest facet, `α=π`, W index 1 is sole receiver with weight 1, W area `125000`.
5. Deterministic-flat fixture uses a 3×3 all-terrestrial routing surface with every `routingElevationMeters=100`, center index 4 `flatRank=1`, every perimeter cell `flatRank=0`, and every perimeter cell an explicit terminal sink. No facet has positive slope, so `selectedFacet=null` and `usedFlatRankFallback=true`; the fixed lower-rank-neighbor tie resolves to E index 5 by canonical neighbor ordinal, `α=0`, E is the sole receiver with weight 1, and E area becomes `125000`.
6. **Terminal-precedence counterexample golden.** Use a 3×3 all-terrestrial harness whose north perimeter cell index 1 is an explicit `external_domain_outlet` owner with routing elevation `98`, whose southward center neighbor index 4 has elevation `97`, and whose remaining values make the southward terrestrial facet mathematically positive by exactly `1 / 250 = 0.004`. Despite that positive descent, index 1 must short-circuit before facet evaluation: `selectedFacet=null`, `directionRadians=null`, `usedFlatRankFallback=false`, `receivers=[]`, `primaryReceiver=-1`, `secondaryReceiver=-1`, both cell-receiver weights `0`, and `terminalReceiver` equals index 1's exact canonical terminal ordinal. Its contributing area remains at that terminal rather than flowing to index 4. The Task-8 reduction reuses this witness and requires the same external terminal to remain present with exactly one reciprocal catchment and no dangling or filtered owner.

The audit hard-codes the elevation/rank arrays, receiver indices, selected facet (including exact `null` for flat fallback/terminal precedence), angles, weights, terminal ordinals, and area values above; expected values must not be generated by `evaluateDInfinityCellDecision`, `analyzeDInfinityFlow`, or any shared production helper.

### 12. Exact v1 primary-receiver catchment and persistent-graph reduction

Task 8 consumes Task-7 split flow but creates a one-receiver physical representation as follows.

1. **Primary raster and catchments.** Use exactly the primary receiver rule in §11. Independently accumulate `primaryContributingAreaM2`: initialize every terrestrial cell with `62_500`, then in Task-7 upstream→downstream topological order add the full value to the primary receiver only. A Task-6 terminal-owner cell has no primary cell receiver and terminates at its own exact Task-7 `terminalReceiver`; every other terrestrial cell follows primary receivers until exactly one such owner is reached. All cells ending at the same owner form one and only one primary catchment. `catchment.areaM2` is exact member count × `62_500`, and `boundaryRings` are extracted from member-cell edges with §9 degree-4 component handling and §8 ring rules. Catchments partition terrestrial cells: no fractional membership and no overlap. Therefore M0.2 v1 freezes `terminal ↔ catchment` as one-to-one, including terminals whose catchments contain no persistent eligible reach.
2. **Eligibility.** `eligible[cell]` is exactly `landMask[cell] && flow.contributingAreaM2[cell] >= persistenceAreaM2`. There is no second relief/slope/valley predicate. D∞ split area remains the eligibility analysis quantity.
3. **Downstream closure support.** Let `R` be the union of every primary-receiver cell path beginning at an eligible cell and continuing through zero or more ineligible cells to its terminal. This makes threshold entry explicit without allowing a below-threshold gap to create a terrestrial dead end. A cell not in `R` is not persistent geometry.
4. **Sources/confluences/terminals.** On the directed primary subgraph induced by `R`, represented indegree is the number of distinct `R` cells whose primary receiver is the cell. A source is an upstream-most `R` cell with indegree 0; it must itself be eligible and is the first threshold entry on that represented path. A confluence is an ordinary `R` cell or distinct-coordinate boundary owner with represented indegree ≥2, whether that merge cell itself is above or below the area threshold. A boundary owner with represented indegree 0 retains its eligible source role; see the A/B/C/D clarification below. Every typed terminal reached by `R` becomes one terminal node. This preserves a merger that happens in a short below-threshold gap rather than deleting topology.
5. **Chain contraction and direction.** Any `R` cell with represented indegree 1, outdegree 1, and no source/confluence/terminal role is an interior chain point. Maximal such chains contract into one reach between topology-critical nodes. Source/confluence node points are their terrestrial cell centers. An ocean/external terminal node point is the exact Task-6 boundary midpoint; a retained-closed terminal node point is its canonical floor-cell center. Pre-simplification reach geometry is always upstream→downstream: start with the upstream node point, include each distinct terrestrial primary-path cell center in path order, and end with the downstream node point. For an ocean/external terminal this appends the boundary midpoint after the last terrestrial center; for source/confluence/closed-floor nodes do not duplicate an already-identical center. There is no branch-order dependence.
6. **`minReachLengthMeters`.** First form maximal primary-path chains whose endpoints are topology-critical source/confluence/terminal nodes; this critical-to-critical chain is the persistent reach authority. `minReachLengthMeters` may never merge across, delete, or relocate one of those critical endpoints. Therefore a critical-to-critical reach whose measured length is below the threshold is retained unchanged as one reach. If implementation creates transient degree-2 chunk breakpoints solely to keep working geometry bounded, all `minReachLengthMeters` comparisons use the **unsimplified** fixed-order Euclidean length of the physical subsegment, before §8 simplification. Process subsegments upstream→downstream: whenever a subsegment is shorter than `minReachLengthMeters`, remove that noncritical breakpoint and merge the subsegment with the immediately downstream subsegment if one exists, otherwise with the immediately upstream subsegment; restart the scan after each merge. Such breakpoints never become persistent nodes. After this deterministic coalescing, simplify the resulting critical-to-critical geometry with §8; if it still cannot satisfy the vertex bound without topology change, fail `M02_BOUND_EXCEEDED` rather than introducing a synthetic persistent node or deleting a short critical reach. A dedicated fixture sets the constant longer than a source→confluence reach and requires that exact source, confluence, reach, geometry orientation, and downstream linkage to remain.
7. **Reach measurement anchor.** Reach `lengthMeters` is the fixed-order Euclidean sum over its final §8-simplified upstream→downstream geometry, including the last-center→boundary-terminal segment where applicable. `contributingAreaM2` is the `primaryContributingAreaM2` at the reach's last terrestrial path cell **before** its downstream topology-critical node/terminal. For an incoming reach to a confluence, use its predecessor cell, not the shared confluence cell; for the outgoing reach, the confluence cell is part of that downstream reach. For a terminal reach, use the last terrestrial cell before the terminal boundary point, or the immediate primary-path predecessor of the terminal floor for a retained-closed basin, anchored before simplification regardless of indegree.
8. **Independent local-area witness.** Assign each terrestrial catchment cell's own `62_500 m²` exactly once to the first persistent reach encountered when following its primary path; if it first arrives exactly at a confluence, assign it to the outgoing downstream reach. Cells upstream of a source that are not themselves in `R` still enter that source reach and are assigned there. `localContributingAreaM2` is the sum of these independently assigned cell areas, never computed as a subtraction of reach totals. For every reach, validator requires `contributingAreaM2 ≈ localContributingAreaM2 + Σ contributingAreaM2(immediately upstream reaches)` within `areaToleranceM2`. Retained-closed floor cells and feeders encountering no reach belong to the independent terminal-local witness. Require catchment area to equal terminal-local plus terminal-reaching totals, and independently terminal-local plus all reach-local witnesses. With no represented support, terminal-local is the independently accumulated whole catchment; a represented retained-closed floor-only component is the separate zero-reach case. The historical candidate-v2 retained-closed ruling below specifies absorbing topology and exact ownership inherited unchanged by active v3.
9. **Terminal/downstream links.** Each reach names exactly one catchment and terminal. A reach ending at a terminal has `downstreamReachId=null`. Otherwise, all reaches entering a confluence point to the unique outgoing reach. The graph is a DAG and no reach crosses catchment terminal identity.
10. **Retained-depression linkage.** After the §12.11 terminal/catchment IDs and reciprocal links are complete, but while `catchmentRoot` still exists, iterate Task-6 retained depressions by ASCII `depression-analysis:*` token. The catchment root at `canonicalFloorCell` must resolve to exactly one catchment and terminal. Emit `(depressionToken,catchmentId,terminalId)` exactly once. For a protected closed basin the terminal kind must be `retained_closed_basin`; for an exorheic retained depression it may be `ocean_outlet`, `external_domain_outlet`, or a downstream `retained_closed_basin` reached by the primary route. Missing/duplicate/mismatched links are `M02_TERMINAL_INVALID`. This bounded link registry is the sole Task-9 source of eventual basin terminal identity.
11. **Task-6 → Task-7 → Task-8 terminal authority and reciprocal-link assembly.** There is one chain and no later terminal-validity decision: every canonical Task-6 terminal owner appears at the same ordinal in Task-7 `terminalReceiver` when its owner cell is evaluated, and Task 8 iterates every `terminalOwnerCells[0..terminalCount)` entry exactly once to materialize one terminal physical record. No valid owner can be filtered for being "unused" or bypassed by a routing preference; if Task 6 emitted an owner, Task 7 terminates there and Task 8 persists it. Task 8 derives only `(kind,point)` from the compact owner state, rejects duplicate `(kind,point)`, and sorts/materializes terminals by §8 `(kind-order,point)`. It then builds exactly one complete catchment physical record per terminal using the referenced terminal physical key plus boundary/area, sorts, and assigns catchment IDs. Only after the complete simplification domain affecting a physical key has finalized under §8 are its IDs assigned; then materialize final `TerrainHydroTerminal {id,kind,point,catchmentId,localContributingAreaM2}` and `TerrainCatchment {id,terminalId,...}` reciprocal references and require `terminalCount === catchmentCount` plus a bijection. Node/reach IDs follow after node roles, reach chains, areas, local-area witnesses, and their §8 simplification domain are complete. Validators re-derive all physical keys by dereferencing candidate records; no transient terminal token exists and no persistent ID participates in a physical sort key that creates an earlier dependency.

**Exact Task-8/F1–F3 graph goldens** are audit-side synthetic primary-receiver witnesses with `d=250`; they do not call production graph builders to derive expectations:

- **F1 planar 1×5 chain west→east**, threshold `125000`: indices `0→1→2→3→4→external terminal` at `(1250,125)`; D∞ eligibility is indices `1..4`. Expected one source at cell 1 center `(375,125)`, no confluence, 2 nodes (source + `external_domain_outlet` terminal), 1 reach with `downstreamReachId=null` and that external terminal, catchment members `{0,1,2,3,4}`, catchment area `312500`, reach `contributingAreaM2=312500`, `localContributingAreaM2=312500`.
- **F2 two-sided ridge cross-section 1×6**, primary paths `2→1→0→west external terminal (0,125)` and `3→4→5→east external terminal (1500,125)`, with all six cells eligible for this graph fixture. Expected sources at cell 2 `(625,125)` and cell 3 `(875,125)`, zero confluences, 4 nodes (2 source + west/east `external_domain_outlet` terminals), 2 reaches; each reach has `downstreamReachId=null` and names only its own west/east terminal. The two catchments are exactly `{0,1,2}` and `{3,4,5}`, each `187500 m²`; each reach contribution/local witness is `187500`; no link crosses the ridge.
- **F3 five-cell Y on a 2×4 fixture:** A=`(row1,col0)` center `(125,125)`, B=`(row0,col1)` center `(375,375)`, C=`(row1,col1)` center `(375,125)`, D=`(row1,col2)` center `(625,125)`, E=`(row1,col3)` center `(875,125)`, east external terminal point `(1000,125)`, with primary paths `A→C`, `B→C`, `C→D→E→terminal`. Expected source count 2 at A/B, confluence count 1 at C, node count 4 (2 source + confluence + east `external_domain_outlet` terminal), reach count 3, both tributary `downstreamReachId` values equal the trunk reach, trunk `downstreamReachId=null` and names the east external terminal, all three reaches name that same terminal/catchment, one catchment of these 5 cells = `312500 m²`; each tributary reach has `contributingAreaM2=62500` and `localContributingAreaM2=62500`; trunk has `contributingAreaM2=312500` and `localContributingAreaM2=187500`, so `312500 = 187500 + 62500 + 62500` exactly.

For terminal/catchment persistence these same goldens additionally freeze the exact registries: F1 has exactly one `external_domain_outlet` at `(1250,125)` paired with the sole `{0,1,2,3,4}` catchment; F2 has exactly two external terminals in canonical physical order, west `(0,125)` then east `(1500,125)`, each paired only with its three-cell catchment; F3 has exactly one external terminal `(1000,125)` paired with the sole five-cell catchment. The §11 terminal-precedence counterexample is also reduced through Task 8: its explicit external owner remains exactly one terminal with exactly one catchment even though a positive terrestrial facet exists. No golden permits a dangling terminal, an unpaired catchment, or a valid owner absent from the persistent registry.

Task 13 stores the exact row/column/receiver/terminal-owner arrays for these fixtures so source/confluence/terminal locations and reciprocal catchment linkage are literal values, not inferred from a production helper.

### 13. Minimum deterministic v1 provenance-family morphology

The four families share correlated base relief but must have independently measurable spatial tendencies. Let rotated coordinates around province center be

```text
u =  cos(axisAngle)*dx + sin(axisAngle)*dy
v = -sin(axisAngle)*dx + cos(axisAngle)*dy
rho2 = (u/radiusXM)^2 + (v/radiusYM)^2
I = rho2 < 1 ? (1-rho2)^2 : 0
```

with fixed operation order. `axisAngleRadians` is derived deterministically from the province seed word as `2π * uint32 / 2^32` and persisted. Let `baseRadiusM` be the existing deterministic draw in inclusive `[provinceMinRadiusMeters, provinceMaxRadiusMeters]` and let `aspect` be the selected family's identity-bearing aspect ratio (`aspect >= 1`). V1 radius derivation is exact: `majorRadiusM = baseRadiusM`, `minorRadiusM = baseRadiusM / aspect`, `radiusXM = majorRadiusM`, `radiusYM = minorRadiusM`, and `influenceRadiusM = majorRadiusM`. The persisted `axisAngleRadians` rotates those local x/y radii through `u,v`; no second random radius, axis swap, area-preserving rescale, or implementation-selected aspect transform exists.

- `stable_denudational`: `radiusXM/radiusYM = stableAspectRatio` with the controlled profile near 1; no added directional ridge/massif/bowl term; correlated local bands are multiplied by `stableReliefMultiplier < 1`. This yields broad, comparatively isotropic, subdued local relief.
- `orogenic_uplift`: `radiusXM/radiusYM = orogenicAspectRatio > 1`; add `orogenicRidgeAmplitudeMeters * I * max(0, 1 - abs(v)/(orogenicRidgeCrossWidthFraction*radiusYM))^2` before the bounded family relief multiplier. The deterministic persisted axis therefore organizes positive high relief along an elongated ridge zone.
- `volcanic_constructive`: `radiusXM/radiusYM = volcanicAspectRatio` constrained near 1; add `volcanicMassifAmplitudeMeters * max(0,1-sqrt(rho2))^volcanicRadialFalloffExponent`. This is a localized approximately radial positive massif and is materially less elongated than the controlled orogenic case.
- `sedimentary_basin`: `radiusXM/radiusYM = sedimentaryAspectRatio` constrained broad/near-isotropic; add `-sedimentaryBowlDepthMeters * max(0,1-rho2)^sedimentaryBowlFalloffExponent` and use `sedimentaryReliefMultiplier < 1`. This is a broad negative/low-elevation accommodation bowl with subdued internal relief.

The existing family elevation offsets still apply, but the spatial terms above—not enum labels or offset-only differences—are the causal morphology distinction. Every aspect/amplitude/falloff/width constant is strict verified physical-constants content and canonical encoded in Task 1; no morphology-affecting literal may hide in source.

F11 freezes one exact morphology audit rather than leaving metric selection to the worker. Use the normal 300 km × 180 km / 250 m controlled domain, seed text `world-m0-m02-f11-morphology-v1`, center `(150000,90000)`, `baseRadiusM=40000`, and `axisAngleRadians=0`. First synthesize `zBase` with one audit-only neutral `stable_denudational` province having `radiusXM=radiusYM=influenceRadiusM=40000`, `elevationOffsetMeters=0`, and `reliefMultiplier=1`; because stable has no additive ridge/massif/bowl term, this is the common correlated terrain baseline. Then synthesize four separate grids from the same seed/common constants, each with exactly one province at that center/axis, the §13 radius formula for its family aspect, and that family's persisted offset/multiplier. For each family cell `i` inside its own `rho2 < 1` support, define `delta_i = zFamily_i - zBase_i`; no production morphology helper computes the oracle metrics.

The audit metrics are exact:

```text
weight_i = abs(delta_i)
Muu = sum(weight_i * u_i^2) / sum(weight_i)
Mvv = sum(weight_i * v_i^2) / sum(weight_i)
anisotropy = max(Muu,Mvv) / min(Muu,Mvv)

inner = cells with sqrt(rho2) <= 0.25
midAnnulus = cells with 0.50 <= sqrt(rho2) <= 0.75
outerAnnulus = cells with 0.65 <= sqrt(rho2) <= 0.90
radialConcentration = mean(delta over inner) - mean(delta over midAnnulus)
centerEdgeTendency = mean(delta over inner) - mean(delta over outerAnnulus)

localRelief_i = max(delta over i plus in-support terrain-8 neighbors)
              - min(delta over i plus in-support terrain-8 neighbors)
q90LocalRelief = sorted(localRelief)[ceil(0.90*n)-1]
```

All denominators/sample sets must be non-empty and finite or the fixture fails. Required literal comparisons are: `orogenic.anisotropy > stable.anisotropy`; `orogenic.anisotropy > volcanic.anisotropy`; `volcanic.radialConcentration > 0`; `sedimentary.centerEdgeTendency < 0`; `stable.q90LocalRelief < orogenic.q90LocalRelief`; `sedimentary.q90LocalRelief < orogenic.q90LocalRelief`; and support-cell counts for stable, volcanic, and sedimentary are each greater than orogenic under the shared 40 km major radius. These strict comparisons—not an enum check, output digest difference, or post-hoc tolerance—are the F11 morphology acceptance oracle. A source-level mutation that removes the orogenic directional ridge term or volcanic radial term must make at least its corresponding metric comparison fail and must restore bytes identically afterward.

### 14. `maxScratchBytes` peak-live transient allocation contract

`analysis.maxScratchBytes` means **maximum total deterministic peak-live transient M0.2 dense raster/analysis payload storage**, not the size of `TerrainScratchGrid` alone. Every O(N), O(component-count), or otherwise analysis-cardinality numeric buffer must be a ledger-owned typed array; implementing the same state as a JS `Array`, `Map`, `Set`, or object-per-cell/component structure to evade accounting is forbidden. JS engine object/header/GC overhead for bounded post-vectorization feature records is not deterministically byte-addressable and is reported separately as observed process memory, but such records are limited by the explicit feature/count bounds and may not carry dense per-cell membership. Thus `maxScratchBytes` accounts every scalable dense analysis payload while a strong M0.2 owner reference is live.

`terrainScratch.ts` owns the only full-raster allocation path:

```ts
export interface TerrainScratchBudgetSnapshot {
  readonly maxBytes: number;
  readonly liveBytes: number;
  readonly peakBytes: number;
}

export interface TerrainScratchArrayRequest {
  readonly label: string;
  readonly kind: "u8" | "i32" | "f64";
  readonly length: number;
}

export interface TerrainScratchBudget {
  readonly snapshot: () => TerrainScratchBudgetSnapshot;
  readonly allocateBatch: (
    requests: readonly TerrainScratchArrayRequest[],
  ) => WorldM0Result<readonly (Uint8Array | Int32Array | Float64Array)[]>;
  readonly release: (label: string) => WorldM0Result<true>;
}
```

`allocateBatch` validates unique labels and safe non-negative integer lengths, computes each `length * BYTES_PER_ELEMENT` with checked multiplication, checked-adds the full batch to current live bytes, and compares the prospective total with `maxBytes` **before constructing any array in the batch**. Only after the entire preflight succeeds are arrays constructed and registered. On any construction failure, already-created members of that batch are deregistered and references dropped before returning failure. `release` is exact-once, removes the owner reference/ledger entry, and checked-subtracts bytes; aliases after release are forbidden. The compiler diagnostics report the ledger's deterministic `peakBytes`. No M0.2 stage may construct an O(N) typed array directly outside this owner; static audits search M0.2 source for bypasses.

For `N = width*height`, planned full-cell storage is explicitly:

Let `T = terminalCount`, with the proven bound `0 <= T <= N <= maxAnalysisCells`. The exact terminal-owner vector is fixed-count rather than raster-sized: `terminalOwnerCells` contributes exactly `4T` bytes while live. It is allocated only after scalar terminal counting and remains live through Task 8 so Task 6/7/8 share one authority. No JS terminal record/string/Map/Set mirrors it. Planned peak-live storage is therefore:

| Lifetime/stage | Buffers | bytes/cell added | exact peak with still-live prerequisites |
| --- | --- | ---: | ---: |
| base scratch | elevation f64 (8), land u8 (1), routing f64 (8), flatRank i32 (4), terminalKindByCell u8 (1), terminalOrdinalByCell i32 (4) | 26 | `26N` |
| Task 5 stage-local | landComponentLabel i32 (4), coastVisit u8 (1) | 5 | `31N`; `coastVisit` is a four-edge visited bitmask, so no edge `Set`/object table exists; release after coastline |
| Task 6 stage-local | provisionalRouting f64 (8), depressionLabel i32 (4), floodState u8 (1), minimumPlateauLabel i32 (4), heapIndex i32 (4) | 21 | `47N + 4T`; before depression labeling, `depressionLabel` + `heapIndex` are reused to label/queue cardinal land components for §10.1 external-owner selection, then cleared; `heapIndex` is subsequently reused as Priority-Flood heap, depression-component queue, plateau queue, and flat-rank BFS queue; after flood state is no longer needed, `floodState` is cleared/reused as the four-edge visited bitmask for one retained-component boundary at a time; no second dense land/component/queue/edge table exists; release Task-6 stage-local arrays after retained analysis/ranks are vectorized, but retain the compact terminal-owner arrays/vector |
| Task 7 retained flow | primaryReceiver i32 (4), secondaryReceiver i32 (4), primaryWeight f64 (8), secondaryWeight f64 (8), terminalReceiver i32 (4), contributingArea f64 (8), topologicalOrder i32 (4) | 40 | `66N + 4T` |
| Task 7 temporary | incomingCount i32 (4) | 4 | **`70N + 4T`**; release after order/accumulation |
| Task 8 stage-local while flow + terminal owners live | primaryContributingArea f64 (8), catchmentRoot i32 (4), persistentEligible u8 (1), representedSupport u8 (1), representedIndegree i32 (4), firstReachAssignment i32 (4) | 22 | **`88N + 4T`**; after eligibility/topology extraction is materialized, clear/reuse `persistentEligible` as the four-edge catchment-boundary visited bitmask while `catchmentRoot` remains the membership oracle; no extra dense edge table exists; release these six arrays, Task-7 flow arrays, and `terminalOwnerCells` after graph/vector geometry is materialized |

Worst-case `T=N` gives deterministic ceilings `51N` at Task 6, `74N` at Task 7, and `92N` at Task 8. Every O(N) or O(T) transient analysis payload is therefore typed-array-backed and byte-accounted before allocation. Any later implementation need for another full-cell/component/terminal-cardinality buffer must first add it to this table/ledger-backed batch and still fit the verified identity-bearing bound; it may not bypass accounting by switching container type. Task 6 processes one depression component at a time from `depressionLabel` and vectorizes only retained records bounded by `maxRetainedBasins`; those bounded post-vectorization JS records may contain their retained-depression token/geometry but never terminal-owner membership. Task 8 uses the six listed dense arrays plus Task-7 flow/terminal arrays and may not create a per-cell/per-terminal adjacency `Map`, `Set`, object registry, or duplicate owner vector.

The mandatory budget negative fixture uses `N=864000`, exactly one valid external terminal owner (`T=1`), and `maxScratchBytes=50_000_000`. Base is exactly `26N = 22,464,000` bytes. The Task-6 peak is exactly `47N + 4T = 40,608,004` bytes and fits. Task 7's complete retained+temporary batch would raise peak live storage to exactly `70N + 4T = 60,480,004` bytes, so its all-or-nothing preflight must fail `M02_BOUND_EXCEEDED` before constructing **any** Task-7 flow array; ledger live bytes remain exactly the pre-Task-7 value and no partial allocation is observable. Separately, with the normal shared bound `134_217_728`, even the worst permitted `T=N` Task-8 ceiling is `92N = 79,488,000` bytes for `N=864000`, so the declared bound dominates every planned transient analysis array. Audits verify exact live/peak/release counts and fail if any scalable typed array or JS collection bypasses the budget.

---

### Task 1: Extend typed failures, explicit content resolution, physical constants, and procedural-v1 policy

**Files:**
- Modify: `src/sim/world/physical/failures.ts`
- Create: `src/sim/world/physical/content.ts`
- Create: `src/sim/world/physical/physicalConstants.ts`
- Create: `src/sim/world/physical/terrainHydroPolicy.ts`
- Create: `scripts/lib/worldM0M02Fixture.mjs`
- Create: `scripts/worldM0M02ContentPolicyAudit.mjs`

**Consumes:** `WorldRecipeV1`, `WorldM0RecipeSupport`, `WorldM0SpatialGridIdentity`, `WorldM0ContentIdentity`, `WorldM0ResolvedAsset`, `parseWorldRecipe`, `validateWorldRecipeSupport`, `validateWorldRecipeAssetResolution`, `deriveWorldM0SpatialGridIdentity`, `sha256DigestBytes`.

**Produces:** generic resolved-content boundary, strict M0.2 constants decoder, procedural-v1 policy validator, expanded typed failure namespace.

**Freeze the policy seam explicitly:**

```ts
export const WORLD_M0_M02_RECIPE_SUPPORT: WorldM0RecipeSupport = {
  generatorFamily: "society-engine:world-m0",
  physicalGeneratorVersions: ["physical:v1"],
  ecologyRealizerVersions: ["ecology:v1"],
  repairPolicyVersions: ["repair:v1"],
  numericKernelVersions: ["numeric:v1"],
};

export function validateWorldM0TerrainHydroGeneratorMode(
  recipe: WorldRecipeV1,
): WorldM0Result<true>;

export function validateWorldM0TerrainHydroPolicy(
  recipe: WorldRecipeV1,
  spatial: WorldM0SpatialGridIdentity,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<true>;
```

The support constant deliberately preserves the already-frozen M0.1 compiler-axis values; M0.2 adds no new recipe axis/version. `validateWorldM0TerrainHydroGeneratorMode(...)` specifically requires `physicalGeneratorVersion === "physical:v1"` for this M0.2 compiler and returns `M02_UNSUPPORTED_GENERATOR_MODE` before the shared M0.1 support validator can collapse that case into a generic version-axis failure. The policy function, not the constants parser, owns cross-object constraints: procedural v1 requires empty `assets.required`, null `mlProposal`, exact 250 m analysis cells, `finite_open_outflow`, the prescribed flow literals, exact divisibility of the physical extent by 250 m, and `analysisCellCount <= maxAnalysisCells`. Task 4 introduces the shared `TerrainScratchBudget`, but `maxScratchBytes` has the cross-stage peak-live meaning frozen in §14. Every later stage must preflight its complete typed-array batch through the same ledger before allocating; no stage-local allocation may reinterpret the bound as base-scratch-only.

**Failure codes added:**

```ts
export type WorldM0M02FailureCode =
  | "M02_UNSUPPORTED_GENERATOR_MODE"
  | "M02_REQUIRED_ASSET_UNSUPPORTED"
  | "M02_ML_UNSUPPORTED"
  | "M02_CONTENT_MISSING"
  | "M02_CONTENT_DUPLICATE"
  | "M02_CONTENT_DIGEST_MISMATCH"
  | "M02_CONTENT_VERSION_UNSUPPORTED"
  | "M02_CONTENT_INVALID"
  | "M02_ANALYSIS_GRID_UNSUPPORTED"
  | "M02_TERRAIN_BOUNDS_INVALID"
  | "M02_ROUTING_UNRESOLVABLE"
  | "M02_DRAINAGE_CYCLE"
  | "M02_TERMINAL_INVALID"
  | "M02_BASIN_GEOMETRY_INVALID"
  | "M02_PROTECTED_BASIN_DESTROYED"
  | "M02_BOUND_EXCEEDED"
  | "M02_REPAIR_BUDGET_EXHAUSTED"
  | "M02_CANDIDATE_INVALID";
```

Generalize `WorldM0Result<T>` so its error can carry M0.1 or M0.2 codes while preserving exported M0.1 code/type names as aliases used by existing code. Existing M0.1 audit behavior and exact returned M0.1 code strings must remain unchanged.

**Shared controlled fixture:** clone the frozen M0.1 recipe, then set `assets.required = []`, `mlProposal = null`, `compiler.physicalGeneratorVersion = "physical:v1"`, `compiler.repairPolicyVersion = "repair:v1"`, `compiler.numericKernelVersion = "numeric:v1"`. Keep 300,000 m × 180,000 m physical extent. The fixture physical-constants object is exact and contains:

```js
{
  schema: "world-m0-physical-constants/v1",
  analysis: {
    cellSizeMeters: 250,
    boundaryModel: "finite_open_outflow",
    maxAnalysisCells: 1_000_000,
    maxScratchBytes: 134_217_728,
  },
  terrain: {
    provenanceProvinceCount: 8,
    provinceMinRadiusMeters: 15_000,
    provinceMaxRadiusMeters: 60_000,
    provinceBlendMeters: 10_000,
    macroWavelengthMeters: 80_000,
    mesoWavelengthMeters: 20_000,
    fineWavelengthMeters: 5_000,
    macroAmplitudeMeters: 650,
    mesoAmplitudeMeters: 220,
    fineAmplitudeMeters: 70,
    stableElevationOffsetMeters: 80,
    stableReliefMultiplier: 0.65,
    stableAspectRatio: 1.1,
    orogenicElevationOffsetMeters: 700,
    orogenicReliefMultiplier: 1.6,
    orogenicAspectRatio: 3.0,
    orogenicRidgeAmplitudeMeters: 500,
    orogenicRidgeCrossWidthFraction: 0.4,
    volcanicElevationOffsetMeters: 850,
    volcanicReliefMultiplier: 1.8,
    volcanicAspectRatio: 1.1,
    volcanicMassifAmplitudeMeters: 650,
    volcanicRadialFalloffExponent: 2.0,
    sedimentaryElevationOffsetMeters: -250,
    sedimentaryReliefMultiplier: 0.55,
    sedimentaryAspectRatio: 1.25,
    sedimentaryBowlDepthMeters: 350,
    sedimentaryBowlFalloffExponent: 1.5,
    continentalMarginMeters: 30_000,
    seaLevelTreatment: "base_plus_recipe_offset_mm_v1",
    baseSeaLevelMeters: 0,
    minElevationMeters: -4_000,
    maxElevationMeters: 6_000,
  },
  depression: {
    retainedMinAreaM2: 1_000_000,
    retainedMinDepthMeters: 5,
    protectedClosedBasinRatePer65536: 4_096,
    maxProtectedClosedBasins: 1_024,
    maxRetainedBasins: 4_096,
    maxRepairOperations: 4_096,
  },
  flow: {
    algorithm: "d_infinity_v1",
    neighborhood: "terrain_8",
    flatPolicy: "priority_flood_rank_v1",
    exactTiePolicy: "canonical_facet_order_v1",
  },
  drainage: {
    persistenceAreaM2: 5_000_000,
    minReachLengthMeters: 500,
    maxNodes: 200_000,
    maxReaches: 200_000,
  },
  geometry: {
    valleySearchRadiusMeters: 1_500,
    valleyRelativeReliefMeters: 30,
    floodplainCandidateMaxSlope: 0.03,
    bankSearchRadiusMeters: 1_000,
    simplifyToleranceMeters: 125,
    maxPolylineVerticesPerFeature: 4_096,
    maxPolygonVerticesPerFeature: 4_096,
    maxCrossingCandidates: 200_000,
  },
  validation: {
    maxCandidateCanonicalBytes: 67_108_864,
    finiteTolerance: 1e-9,
    areaToleranceM2: 0.01,
  },
}
```

These are controlled generator-fixture values used to make tasks executable and stress-test identity-bearing representation parameters; they are not universal Earth thresholds. Natural-world evidence reports diagnostics without promoting these numbers into scientific pass bands. The fixture uses an independent audit-side canonical writer matching the frozen byte-format contract, computes SHA-256 with Node `createHash("sha256")`, and writes that digest into the cloned recipe before the production resolver is invoked.

- [ ] **Step 1: Create the RED content/policy audit.** The audit must guard absent modules and emit JSON `verdict: "FAIL"`, not crash. It independently asserts: valid empty-asset/null-ML recipe accepted; 250 m constants accepted; exact 1200×720 dimensions derivable; missing content → `M02_CONTENT_MISSING`; duplicate id/version → `M02_CONTENT_DUPLICATE`; wrong bytes → `M02_CONTENT_DIGEST_MISMATCH`; unsupported schema/version → `M02_CONTENT_VERSION_UNSUPPORTED`; malformed/unknown/missing/non-finite/out-of-bound constants—including invalid family aspect/falloff/amplitude, protected-basin rate/count, and peak-live byte bound—→ `M02_CONTENT_INVALID`; unsupported M0.2 physical-generator version → `M02_UNSUPPORTED_GENERATOR_MODE`; non-empty required physical-input manifest, despite valid asset resolution, → `M02_REQUIRED_ASSET_UNSUPPORTED`; valid selected ML identity → `M02_ML_UNSUPPORTED`; M0.1 digest validation still executes before the M0.2 policy branch.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02ContentPolicyAudit.mjs
```

Expected: exit 1 with named missing-module/content-policy checks false.

- [ ] **Step 3: Implement the smallest content/failure/policy surface.** Strict constants parsing rejects unknown keys at every level, unsafe integers for count/byte bounds, non-finite physical values, invalid intrinsic min/max relationships, non-250 cell size, unsupported boundary/flow literals, aspect ratios `< 1`, non-positive morphology falloff/amplitude/width values, `protectedClosedBasinRatePer65536` outside `[0,65536]`, and protected/retained count inconsistencies. `validateWorldM0TerrainHydroPolicy(...)` separately rejects world-size-dependent violations by combining the parsed constants with the existing `WorldM0SpatialGridIdentity` before any allocation. Copy resolved bytes before hashing/decoding. No filesystem APIs in `src/sim/world/physical/`.

- [ ] **Step 4: Run GREEN + inherited M0.1 contract checks.**

```bash
node scripts/worldM0M02ContentPolicyAudit.mjs
node scripts/worldM0M01RecipeContractAudit.mjs
node scripts/worldM0M01AssetIdentityAudit.mjs
node scripts/worldM0M01CanonicalIdentityAudit.mjs
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: every command exits 0; the M0.2 audit reports `verdict: "PASS"` for content/policy ordering and exact typed failures, all three inherited M0.1 audits remain PASS, and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 1.**

```bash
git add src/sim/world/physical/failures.ts src/sim/world/physical/content.ts src/sim/world/physical/physicalConstants.ts src/sim/world/physical/terrainHydroPolicy.ts scripts/lib/worldM0M02Fixture.mjs scripts/worldM0M02ContentPolicyAudit.mjs
git commit -m "feat(world-m0): define m0.2 content and policy contracts"
```

---

### Task 2: Freeze M0.2 candidate schemas, geometry invariants, and binary64 audit numeric encoding

**Files:**
- Create: `src/sim/world/physical/terrainHydroTypes.ts`
- Create: `src/sim/world/physical/terrainHydroNumeric.ts`
- Create: `scripts/worldM0M02CandidateSchemaAudit.mjs`

**Consumes:** M0.1 branded digest/content types, SCALE-1-derived strategic row/column dimensions.

**Produces:** exact persistent M0.2 candidate types listed in this plan and numeric encoding helpers; no candidate digest yet.

**Interfaces:**

```ts
export function encodeTerrainHydroAuditNumber(value: number): WorldM0Result<string>;
export function compareAscii(left: string, right: string): number;
export function compareStrategicCell(
  left: WorldM0StrategicCellRef,
  right: WorldM0StrategicCellRef,
): number;
export function canonicalStrategicEdge(
  first: WorldM0StrategicCellRef,
  second: WorldM0StrategicCellRef,
): WorldM0Result<WorldM0StrategicEdgeRef>;
export function comparePointM(left: WorldM0PointM, right: WorldM0PointM): number;
export function signedRingArea2(points: readonly WorldM0PointM[]): WorldM0Result<number>;
export function isNormalizedClosedRing(
  points: readonly WorldM0PointM[],
  role: "outer" | "hole",
): boolean;
export function formatTerrainHydroId(
  namespace: "province" | "terminal" | "catchment" | "drainage-node" | "drainage-reach" | "depression-basin" | "valley" | "floodplain" | "crossing",
  ordinal: number,
): WorldM0Result<string>;
```

`encodeTerrainHydroAuditNumber(1.5)` must produce the exact big-endian IEEE-754 representation for `1.5`; integer inputs remain decimal numbers at the higher-level writer, while this helper is only for non-integer binary64 string tokens. The audit hard-codes known bit patterns for `1.5`, `-2.25`, and `0.1` and checks that NaN, infinities, and `-0` fail.

- [ ] **Step 1: Write RED schema/numeric audit.** Assert exact candidate key sets including `axisAngleRadians`, `boundaryRings`, and reach `localContributingAreaM2`; exact crossing candidate key set; no forbidden crossing/human/hydraulic names; strategic edge canonicality and cardinal adjacency; §8 x-then-y point order; exact signed-area orientation (`outer=CCW`, `hole=CW`), canonical smallest start, single repeated closure; fixed ID namespace/16-hex formatter goldens; fixed ASCII comparator behavior independent of locale; binary64 golden tokens; all candidate registries are readonly persistent arrays/objects and expose no typed-array/scratch field. Reverse an upstream→downstream reach geometry in the complete schema fixture and require that it is not accepted/normalized as semantically equivalent.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02CandidateSchemaAudit.mjs
```

Expected: exit 1 because the schema/numeric modules are absent.

- [ ] **Step 3: Implement only the schema + numeric helpers.** Do not add terrain generation, canonical candidate serialization, or hashing in this task. Reject non-cardinal strategic edges. Ring normalization implements §8 exactly: at least four stored points, exact closure, x-then-y canonical start, explicit outer-CCW/hole-CW signed area, one repeated start, and no implementation-selected orientation. `formatTerrainHydroId` implements the frozen namespaces/16-hex ordinal format. No geometry simplification occurs in this task.

- [ ] **Step 4: Run GREEN.**

```bash
node scripts/worldM0M02CandidateSchemaAudit.mjs
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: both commands exit 0; the schema audit reports all exact-key/numeric/ring/ID invariants PASS, including ordered-geometry non-reordering, and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 2.**

```bash
git add src/sim/world/physical/terrainHydroTypes.ts src/sim/world/physical/terrainHydroNumeric.ts scripts/worldM0M02CandidateSchemaAudit.mjs
git commit -m "feat(world-m0): freeze m0.2 candidate schema"
```

---

### Task 3: Implement the already-prescribed M0.2 canonical audit encoding and candidate digest

**Files:**
- Create: `src/sim/world/physical/canonicalTerrainHydro.ts`
- Create: `scripts/worldM0M02CandidateIdentityAudit.mjs`

**Consumes:** Task-2 candidate schema and numeric encoding, existing `sha256DigestBytes`, and existing `Brand` from `src/sim/core/types.ts`.

**Produces:**

```ts
export type WorldM0TerrainHydroCandidateDigest =
  Brand<string, "WorldM0TerrainHydroCandidateDigest">;

export function encodeCanonicalTerrainHydroCandidate(
  input: WorldM0TerrainHydroCandidateV3,
): WorldM0Result<Uint8Array>;

export async function computeTerrainHydroCandidateDigest(
  input: WorldM0TerrainHydroCandidateV3,
): Promise<WorldM0Result<WorldM0TerrainHydroCandidateDigest>>;
```

The encoder implements exactly the field/record/numeric ordering frozen above. Its Task-3 checks are limited to runtime shape, exact keys, finite/canonical numeric form, ID validity/uniqueness, edge orientation, and closed/open geometry normalization needed to make the audit bytes unambiguous; whole-candidate graph/topology semantics remain owned by Task 12. For every schema-declared unordered entity registry it validates IDs, rejects duplicates, copies, and `compareAscii`-sorts the copy by ID exactly as §8 freezes; non-entity unordered collections use only their named §8 keys. Caller insertion order is not an error and caller arrays are never mutated. For semantically ordered reach/ring point sequences it never reverses, rotates, or point-sorts to manufacture equivalence. It does not repair malformed edge or ring orientation.

- [ ] **Step 1: Create one small complete synthetic candidate and a RED identity audit.** Hard-code its expected canonical UTF-8 text. Independently compute the expected SHA-256 with Node `createHash` in the audit. Required B01 controls are literal: **A)** reverse every semantically unordered registry plus unordered referenced-ID/provenance-fraction lists and prove bytes/digest unchanged while input arrays remain element-identical; **B)** duplicate one ID/key in each representative unordered collection and require `M02_CANDIDATE_INVALID` with the collection/duplicate path; **C)** reverse an upstream→downstream reach geometry and require different/invalid semantics—not byte identity. Mutate one valid identity-bearing value in turn—recipe digest, physical-constants digest, province axis/family effect, one terrain value, coastline point, terminal kind, basin area, reach `localContributingAreaM2`, crossing geometry—and prove bytes/digest change. Change only a forbidden input key and require schema failure, not silent omission.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02CandidateIdentityAudit.mjs
```

Expected RED: exit 1 because canonical M0.2 candidate encoding/digest is not yet implemented; the audit must identify the missing encoder/digest or failed B01 canonical-identity control rather than crash.

- [ ] **Step 3: Implement fixed-schema canonical writers and digest.** No generic recursive JSON canonicalizer. No locale comparison. Use Task-2 binary64 tokens for all non-integer candidate numbers. Enforce `validation.maxCandidateCanonicalBytes` later in compiler validation; this standalone encoder remains schema-validity focused.

- [ ] **Step 4: Run GREEN + M0.1 canonical identity regression.**

```bash
node scripts/worldM0M02CandidateIdentityAudit.mjs
node scripts/worldM0M01CanonicalIdentityAudit.mjs
node scripts/worldM0M01RoundTripNegativeControlsAudit.mjs
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: every command exits 0; B01 unordered reversal is byte/digest-identical without caller mutation, duplicate keys fail `M02_CANDIDATE_INVALID`, ordered reach reversal is non-equivalent, M0.1 identity/round-trip regressions remain PASS, and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 3.**

```bash
git add src/sim/world/physical/canonicalTerrainHydro.ts scripts/worldM0M02CandidateIdentityAudit.mjs
git commit -m "feat(world-m0): add m0.2 candidate audit identity"
```

---

### Task 4: Build deterministic provenance provinces, 250 m scratch allocation, and correlated terrain synthesis

**Files:**
- Create: `src/sim/world/physical/terrainHydroRandom.ts`
- Create: `src/sim/world/physical/terrainScratch.ts`
- Create: `src/sim/world/physical/terrainProvenance.ts`
- Create: `src/sim/world/physical/terrainSynthesis.ts`
- Create: `scripts/worldM0M02TerrainProvenanceAudit.mjs`

**Consumes:** validated recipe/physical constants, the existing M0.1 `WorldM0SpatialGridIdentity` derived by `deriveWorldM0SpatialGridIdentity(recipe.spatial)`, and Task-2 province types.

**Produces:** transient raw elevation grid + persistent bounded province registry.

**Interfaces:**

```ts
export interface TerrainHydroSeedKey {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

export type TerrainProtectedBasinIntentKey = TerrainHydroSeedKey;

export async function deriveTerrainHydroSeedKey(
  seed: string,
  physicalGeneratorVersion: string,
): Promise<TerrainHydroSeedKey>;

export async function deriveProtectedBasinIntentKey(
  seed: string,
  physicalGeneratorVersion: string,
): Promise<TerrainProtectedBasinIntentKey>;

export function createTerrainScratchBudget(
  maxScratchBytes: number,
): WorldM0Result<TerrainScratchBudget>;

export function allocateTerrainScratchGrid(
  extentWidthMeters: number,
  extentHeightMeters: number,
  constants: WorldM0PhysicalConstantsV1,
  budget: TerrainScratchBudget,
): WorldM0Result<TerrainScratchGrid>;

export function generateLandformProvenanceProvinces(
  seed: TerrainHydroSeedKey,
  extentWidthMeters: number,
  extentHeightMeters: number,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<readonly LandformProvenanceProvince[]>;

export function synthesizeRawTerrain(
  scratch: TerrainScratchGrid,
  seed: TerrainHydroSeedKey,
  provinces: readonly LandformProvenanceProvince[],
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<true>;
```

`deriveTerrainHydroSeedKey` and `deriveProtectedBasinIntentKey` share one exact stage-key primitive. UTF-8 encode the fixed ASCII stage tag, append one `0x00`, append a 4-byte unsigned big-endian byte length then UTF-8 bytes for `physicalGeneratorVersion`, then the same 4-byte unsigned big-endian length + UTF-8 bytes for `seed`. Reject either encoded length above `0xffffffff`. SHA-256 those exact bytes. `a,b,c,d` are the first 16 digest bytes read as four unsigned **big-endian** u32 words in order; the remaining digest bytes do not enter the key. Tags are exactly `world-m0:m02:terrain-seed:v1` and `world-m0:m02:protected-basin-intent:v1` respectively. No locale, JSON object ordering, UTF-16 code-unit length, platform newline, or host endianness participates.

The Task-4 audit hard-codes this derivation golden for `physicalGeneratorVersion="physical:v1"`, `seed="world-m0-m02-seed-golden"`: terrain digest `660b66c65f541076512c05fddce4f6c450a7acc69f2765094f0b1c9263ebfb9c` and key `{a:1712023238,b:1599344758,c:1361839613,d:3705992900}`; protected-intent digest `02127519dd0c6836c40cbeae86af2b5c1f083618d1c0d328957189ef48ca9631` and key `{a:34764057,b:3708577846,c:3289169582,d:2259626844}`. These literal values discriminate byte order and stage-tag separation.

Province assignment cycles through a canonical family order so any valid fixture with at least four provinces contains every family. Persistent province IDs derive only after §8 canonical physical sorting using `province:<16hex>`, not generation loop order. Every province stores deterministic `axisAngleRadians`; radius/aspect and the exact family spatial operator are §13 identity-bearing behavior. Task 4 also derives the bounded protected-basin intent seed key for Task 6; this key does not classify a basin until §10 raw-component discovery. Province/count bounds fail rather than drop records.

- [ ] **Step 1: RED audit.** Assert 300×180 km → 1200×720/864,000 exactly; base scratch allocation is exactly `26N` bytes through the shared ledger; pre-allocation failure when cell/byte limits are exceeded; no direct full-raster typed-array allocation bypass; no object-per-cell structure; same recipe yields byte-identical raw elevation/province/axis bytes and protected-intent key; the two literal SHA/key goldens above match exactly; different seed changes terrain; all four provenance families occur; every province is bounded inside/influencing the physical domain. F11-style controlled family substitutions independently measure §13 anisotropy, radial concentration, signed center-edge tendency, and local relief—not enum/amplitude labels alone. Audit strict encoding changes when any new morphology constant changes, rejects a hidden source literal that would alter morphology, and confirms no detailed-geology/material field, `Math.random`, or legacy `generate.ts` import.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02TerrainProvenanceAudit.mjs
```

Expected RED: exit 1 because the Task-4 scratch/provenance/synthesis surface is absent; at least the named allocation, deterministic terrain, protected-intent, or F11 morphology contract is reported missing/false rather than inferred from another module.

- [ ] **Step 3: Implement minimum deterministic synthesis.** Macro/meso/fine value fields use physical metre wavelengths and the fixed stateless coordinate mixer. Apply deterministic broad coast/continental scaffold, correlated bands, then the exact §13 rotated family morphology terms; no family may collapse to offset/multiplier-only behavior. Enforce min/max raw elevation bounds and finite values. Create the §14 budget first and batch-preflight all five base arrays before allocating any of them. Derive—not materialize densely—the §10 protected-basin intent key. Do not set land/ocean or routing state here.

- [ ] **Step 4: Run GREEN + build.**

```bash
node scripts/worldM0M02TerrainProvenanceAudit.mjs
npx tsc -p tsconfig.json --noEmit
npm run build
```

Expected GREEN: every command exits 0; exact 1200×720/26N allocation, deterministic seed/protected-intent behavior, bounded rotated province geometry, and morphology-based F11 controls report PASS; TypeScript and the production build succeed.

- [ ] **Step 5: Commit Task 4.**

```bash
git add src/sim/world/physical/terrainHydroRandom.ts src/sim/world/physical/terrainScratch.ts src/sim/world/physical/terrainProvenance.ts src/sim/world/physical/terrainSynthesis.ts scripts/worldM0M02TerrainProvenanceAudit.mjs
git commit -m "feat(world-m0): synthesize m0.2 terrain provenance"
```

---

### Task 5: Apply sea level and derive canonical land/ocean + coastline geometry

**Files:**
- Create: `src/sim/world/physical/terrainCoastline.ts`
- Create: `scripts/worldM0M02CoastlineAudit.mjs`

**Consumes:** raw elevation scratch, recipe `seaLevelOffsetMm`, constants `baseSeaLevelMeters`.

**Produces:** scratch `landMask` and deterministic persistent coastline polylines.

**Interfaces:**

```ts
export interface TerrainCoastlineResult {
  readonly seaLevelMeters: number;
  readonly coastline: readonly (readonly WorldM0PointM[])[];
  readonly landAreaM2: number;
  readonly oceanAreaM2: number;
}

export function deriveLandOceanAndCoastline(
  scratch: TerrainScratchGrid,
  seaLevelOffsetMm: number,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<TerrainCoastlineResult>;
```

Land is `rawElevation > baseSeaLevelMeters + seaLevelOffsetMm / 1000`; equality is ocean under v1. Coastline uses the exact §9 cardinal-component/cell-edge topology, including degree-4 diagonal-contact handling and finite-border open polylines, then §8 domain-0 canonical pre-key sorting, mixed earlier-final/later-unsimplified peer references, topology-preserving simplification, and closed/open normalization. Endpoint sorting or producer-order simplification is forbidden.

- [ ] **Step 1: RED analytical coastline audit.** Build an independent island height fixture with known sea-level contour on the 250 m grid. Assert exact land/ocean physical area; closed normalized island/hole rings; no out-of-domain points; no dependence on `terrainKind`; sea-level offset changes expected cells/coastline and candidate-relevant bytes; reversed cell traversal yields identical normalized coastline. Add the mandatory §9 ocean-haloed 2×2 diagonal checkerboard and hard-code the two exact five-point rings; assert the shared degree-4 vertex does not merge components. Add the §9 finite-border left-column fixture and require exactly open `[(250,0),(250,750)]` with no domain-exterior coastline edges. Add one ocean-hole ring and assert outer CCW/hole CW ordering. Add a simplification witness where deleting a within-tolerance point would alter cell-center classification and require that point to remain. Reverse/shuffle the producer order of at least three coastline items and require §8 domain-0 pre-key sorting to restore the same simplification order and exact final coastline bytes.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02CoastlineAudit.mjs
```

Expected RED: exit 1 because the coastline authority is absent; the audit must report missing land/ocean/coast behavior, including the literal checkerboard degree-4 topology oracle, rather than crash.

- [ ] **Step 3: Implement land/ocean classification and §9 deterministic component-aware edge tracing.** No marching-squares interpolation is permitted for v1 authority: canonical coastline uses exact 250 m land↔ocean cell edges only. At degree-4 diagonal contacts, follow the same cardinal land component; at finite-domain endpoints emit the exact oriented open polyline and never add a domain-exterior edge. Allocate/release Task-5 dense labels through §14. Collect every normalized unsimplified coastline item, compute its domain-0 pre-key, sort before any deletion, and apply the exact §8 mixed-reference schedule. Preserve closed-ring role/open endpoints/orientation, raster partition, and topology; fail bounds instead of taking an unsafe shortcut.

- [ ] **Step 4: Run GREEN.**

```bash
node scripts/worldM0M02CoastlineAudit.mjs
node scripts/worldM0M02TerrainProvenanceAudit.mjs
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: every command exits 0; coastline area/topology/simplification controls PASS, the ocean-haloed 2×2 checkerboard produces exactly two same-component normalized rings, the finite-border fixture produces exactly the one open land↔ocean polyline and no exterior-edge coastline, the upstream terrain/provenance audit remains PASS, and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 5.**

```bash
git add src/sim/world/physical/terrainCoastline.ts scripts/worldM0M02CoastlineAudit.mjs
git commit -m "feat(world-m0): derive land ocean and coastline"
```

---

### Task 6: Implement Priority-Flood depression analysis, retained basins, and explicit finite-open-outflow terminals

**Files:**
- Create: `src/sim/world/physical/terrainDepressions.ts`
- Create: `scripts/worldM0M02DepressionBoundaryAudit.mjs`

**Consumes:** raw elevation + land/ocean mask, physical constants.

**Produces:** routing surface, flat ranks, compact explicit terminal ownership, retained depression analysis; raw terrain remains unchanged.

**Interfaces:**

```ts
export interface TerrainRetainedDepressionAnalysis {
  readonly token: string;
  readonly canonicalFloorCell: number;
  readonly floorElevationMeters: number;
  readonly physicalSpillElevationMeters: number;
  readonly persistentSpillElevationMeters: number | null;
  readonly protectedIntentToken: string | null;
  readonly closedEndorheic: boolean;
  readonly areaM2: number;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
}

export interface TerrainDepressionAnalysis {
  readonly retainedDepressions: readonly TerrainRetainedDepressionAnalysis[];
  readonly terminalOwners: TerrainTerminalOwnerAnalysis;
  readonly conditionedDepressionCount: number;
  readonly repairOperationCount: number;
}

export function repairDepressionRoutingV1(
  scratch: TerrainScratchGrid,
  depressionLabel: Int32Array,
  componentLabel: number,
  spillElevationMeters: number,
  canonicalSpillInsideCell: number,
  repairOperationCount: number,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<number>;

export function analyzeTerrainDepressionsAndBoundaries(
  scratch: TerrainScratchGrid,
  seaLevelMeters: number,
  protectedIntentKey: TerrainProtectedBasinIntentKey,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<TerrainDepressionAnalysis>;
```

The function writes only scratch `routingElevationMeters`, `flatRank`, `terminalKindByCell`, and `terminalOrdinalByCell`, plus the exact-length ledger-owned `terminalOwnerCells`; it never mutates `elevationMeters` or `landMask`.

- [ ] **Step 1: RED F4/F5/F6/F7/F9-style audit.** Independently encode the complete §10 state machine: raw candidate-component membership, equal-height floor plateau, canonical floor, all spill candidates and canonical tuple winner, protection score/token, retention, closed/exorheic status, compact terminal kind/owner/ordinal state, routing surface, and flat ranks. F5/F6/F7 use the exact 5×5 grid/values in §10.8. Snapshot raw elevation bytes before/after and require identity. F9 proves a high non-selected raster-edge cell is not an external terminal and the one component-level canonical boundary crossing is. Reverse ocean/heap/component discovery and require byte-identical `terminalKindByCell`, `terminalOrdinalByCell`, canonical `terminalOwnerCells`, retained tokens, and derived terminal physical keys. Add a boundary cell that is both ocean-adjacent and on the finite edge; prove the external-owner filter never assigns a second terminal to that cell. Assert no scalable terminal string/object/Map/Set registry exists and `terminalCount <= maxAnalysisCells`; force a synthetic over-count and require `M02_BOUND_EXCEEDED` before the owner-vector allocation. Run the §10.9 synthetic F5 routing-mismatch golden directly against `repairDepressionRoutingV1`: one permitted operation must restore exact spill routing/ranks without raw mutation, while zero budget must fail before writes. Force protected count/retained count/repair budget overflow and require their typed failures. The audit verifies exact Task-6 `47N + 4T` peak accounting and releases every stage-local ledger entry while retaining the compact owner vector for Task 7.

  The protected multi-sink regression is the 5×3 all-terrestrial raster `9 9 9 9 9 / 9 1 3 2 4 / 9 9 9 9 9`, with audit-controlled zero intent and a guaranteed-protection threshold. Its component is retained/protected/closed with cell 6 as the sole retained-closed terminal; exact protected routing is cell 6 = 1, cell 7 = 3, cell 8 = 3, while raw values remain 1, 3, 2. Exact relevant flat ranks are cell 6 = 0, cell 7 = 0, cell 8 = 1. Task 7 must route cell 8 through component-internal authority to cell 6, never to explicit external outlet owner cell 9. The audit must discriminate restoration of raw routing for all protected members, flattening all protected members to the floor, copying the outer-spill fill wholesale, manufacturing a second closed terminal, exiting through the outer spill, changing the floor, lowering below raw terrain, and changing F6's `1,1` result.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02DepressionBoundaryAudit.mjs
```

Expected RED: exit 1 because the complete Task-6 depression/boundary authority is absent; at least one named F5/F6/F7/F9 component, spill, protection, terminal, routing-surface, or flat-rank oracle is false/missing.

- [ ] **Step 3: Implement §10 exactly with a dependency-free budget-backed binary min-heap Priority-Flood.** Perform component-level ocean/external owner discovery, provisional fill without touching raw/final routing, canonical component/floor/spill discovery, deterministic protection-score selection, area/depth-or-protection retention, explicit protected-closed versus retained-exorheic classification, final routing-surface construction including §10.6 component-local protected minimax routing, and flat-rank BFS. `or closed-component topology` is not a policy: the only intentional closed rule is §10.4 protection. Reuse the existing stage-local provisional/final routing storage, component label, flood state, and heap so the correction adds no permanent dense raster and leaves the exact §14 peak formula unchanged. Terminal ownership is numeric only: write the dense kind byte, scalar-count owners, preflight/fill/sort the exact-length `terminalOwnerCells`, then fill ordinals; do not build terminal strings or JS records. Persistent terminal keys/IDs wait for Task 8. Use §10.9 `repair:v1` only for the exact provisional-spill inconsistency trigger; it performs the one frozen whole-component spill reset, never changes policy/thresholds/spill, and preflights the repair budget before writes; it never repairs protected components. All Task-6 arrays use §14; release only the stage-local depression arrays after vectorized analysis, retaining the compact owner state through Task 8.

- [ ] **Step 4: Run GREEN.**

```bash
node scripts/worldM0M02DepressionBoundaryAudit.mjs
node scripts/worldM0M02CoastlineAudit.mjs
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: every command exits 0; F5/F6/F7/F9 exact component/floor/spill/protection/terminal/routing/rank outputs and Task-6 ledger accounting PASS, coastline remains PASS, and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 6.**

```bash
git add src/sim/world/physical/terrainDepressions.ts scripts/worldM0M02DepressionBoundaryAudit.mjs
git commit -m "feat(world-m0): condition m0.2 depression routing"
```

---

### Task 7: Implement exact Tarboton D∞ flow direction and physical contributing area

**Files:**
- Create: `src/sim/world/physical/terrainFlow.ts`
- Create: `scripts/worldM0M02FlowAudit.mjs`

**Consumes:** routing elevation, flat rank, compact Task-6 terminal ownership, 250 m geometry.

**Produces:** transient split-flow receivers/weights/topological order/contributing area.

**Interfaces:**

```ts
export type TerrainNeighborOrdinal = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type TerrainFacetOrdinal = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TerrainFlowReceiverDecision {
  readonly receiverIndex: number;
  readonly neighborOrdinal: TerrainNeighborOrdinal;
  readonly weight: number;
}

export interface TerrainDInfinityCellDecision {
  readonly selectedFacet: TerrainFacetOrdinal | null;
  readonly directionRadians: number | null;
  readonly usedFlatRankFallback: boolean;
  readonly receivers: readonly TerrainFlowReceiverDecision[];
  readonly terminalReceiverOrdinal: number | null;
}

export interface TerrainFlowAnalysis {
  readonly primaryReceiver: Int32Array;
  readonly secondaryReceiver: Int32Array;
  readonly primaryWeight: Float64Array;
  readonly secondaryWeight: Float64Array;
  readonly terminalReceiver: Int32Array;
  readonly contributingAreaM2: Float64Array;
  readonly topologicalOrder: Int32Array;
}

export function evaluateDInfinityCellDecision(
  scratch: TerrainScratchGrid,
  terminalOwners: TerrainTerminalOwnerAnalysis,
  centerIndex: number,
): WorldM0Result<TerrainDInfinityCellDecision>;

export function analyzeDInfinityFlow(
  scratch: TerrainScratchGrid,
  terminalOwners: TerrainTerminalOwnerAnalysis,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<TerrainFlowAnalysis>;
```

- [ ] **Step 1: RED analytical flow audit.** Hard-code independent expectations for all six §11 numerical goldens and call the production-used pure `evaluateDInfinityCellDecision(...)` only as the observed side: assert exact selected facet/null-flat/terminal-precedence marker, receiver indices/neighbor ordinals, flow angle, weights, terminal ordinal, and contributing areas. Add F1 planar and F2 ridge whole-grid accumulation arrays, F4 flat ranks, and prove no cross-ridge leakage/cycle/order dependence. The sixth golden must reproduce the review counterexample: a valid terminal owner has a mathematically positive `0.004` terrestrial descent yet returns no cell receiver, no facet evaluation, and the exact terminal ordinal. Assert two-receiver weights conserve one within `finiteTolerance`, exact zero-weight receiver is omitted, primary rule is larger weight then canonical-neighbor tie, incomplete border facets are skipped, and terminal owners never invent/bypass through a cell receiver. Mutate one non-terminal receiver into a cycle and require `M02_DRAINAGE_CYCLE`. Add the §14 `N=864000,T=1,maxScratchBytes=50_000_000` fixture: Task-7 all-or-nothing preflight must fail before **any** flow array exists at exact prospective peak `60,480,004` even though the exact Task-6 peak `40,608,004` fits. The audit expected values must be literal/oracle-side numbers and arrays; it may not call production helpers to generate them.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02FlowAudit.mjs
```

Expected RED: exit 1 because exact `d_infinity_v1` is absent; the audit must report at least one of the six literal facet/flat/terminal goldens, receiver/weight/angle expectations, cycle rejection, or peak-live preflight as missing/false.

- [ ] **Step 3: Implement the §11 equations/table/policies literally.** `evaluateDInfinityCellDecision(...)` is the single pure per-cell decision authority used by `analyzeDInfinityFlow(...)`, so the audit-visible facet/angle result and the accumulated receivers cannot drift into two algorithms. Its first branch is terminal-owner precedence: validate kind/ordinal/owner consistency and return the exact terminal sink decision before reading any facet neighbor. Only non-terminal cells may execute Tarboton facets or the later flat fallback. Do not substitute D8/MFD or a D∞-inspired heuristic; do not use SCALE-1 neighbors. Use square-cell `d=250`, the exact facet basis/coordinate vectors, `dz1/dz2`, planar downslope vector, clamp rules, positive-slope and facet-tie tests, angular split equation, incomplete-facet policy, deterministic flat-rank fallback, and primary rule. Batch-preflight the seven retained flow arrays plus temporary incoming-count array through §14 while the compact owner state remains live. Accumulate `62_500 m²` per terrestrial cell with iterative Kahn upstream→downstream order; no recursion whose depth scales with the world.

- [ ] **Step 4: Run GREEN.**

```bash
node scripts/worldM0M02FlowAudit.mjs
node scripts/scale1SpatialAuthorityAudit.mjs
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: every command exits 0; all six hard-coded D∞/flat/terminal-precedence goldens, primary receiver, conservation, cycle rejection, border behavior, and Task-7 budget-negative control PASS; SCALE-1 spatial authority remains PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 7.**

```bash
git add src/sim/world/physical/terrainFlow.ts scripts/worldM0M02FlowAudit.mjs
git commit -m "feat(world-m0): add deterministic dinfinity flow"
```

---

### Retained-closed terminal accounting — historical candidate v2 ruling, semantics preserved by v3

Retained-closed terminals are absorbing junctions: one terminal record and, when represented support reaches the floor, exactly one terminal drainage node at the canonical floor-cell center. Zero, one, or many incoming reaches are permitted; incoming reaches are siblings with no outgoing reach. A represented floor-only component has one isolated terminal node and zero reaches. Without represented support the catchment and terminal records remain, with no drainage node required. Never manufacture co-located graph twins, self-loops, or zero-length, single-point, epsilon-offset, or repeated-point connectors.

Every reach ending at a retained-closed terminal measures `primaryContributingAreaM2` at the immediate primary-path predecessor of the floor, for both indegree one and multiple incoming branches. Retain that measurement anchor from the original primary raster path before simplification; geometry still ends at the actual floor center. Distinct-coordinate ocean/external terminals follow the A/B/C/D boundary threshold-entry clarification below.

Independently assign every terrestrial catchment cell exactly once to a persistent reach local witness or its terminal local witness. An ordinary downstream confluence cell belongs to its outgoing reach; a retained-closed floor belongs to its terminal. Other cells follow their primary path to the first reach-accounting cell, or to their terminal if no reach is encountered first. Below-threshold feeders reaching the floor directly therefore also belong to the terminal. Never derive either local witness by subtraction.

For **every** persistent reach, without a closed-terminal exemption:

```text
reach.contributingAreaM2 ≈ reach.localContributingAreaM2
  + Σ immediate-upstream reach.contributingAreaM2
```

Persist required `TerrainHydroTerminal.localContributingAreaM2`, independently accumulated and finite/nonnegative. Require both independent terminal reconciliations:

```text
catchment.areaM2 ≈ terminal.localContributingAreaM2
  + Σ contributingAreaM2 of terminal-reaching reaches
catchment.areaM2 ≈ terminal.localContributingAreaM2
  + Σ localContributingAreaM2 of ALL reaches in the catchment
```

Use the existing area tolerance for each equality, never a one-sided inequality. Represented ocean/external terminals have exactly zero terminal-local area. A boundary catchment can have zero reaches and whole terminal-local only when represented support is absent; retained-closed floor-only semantics remain separate.

Candidate v2 introduced the explicit `WorldM0TerrainHydroCandidateV2` contract and canonical terminal field order `id`, `kind`, `point`, `catchmentId`, `localContributingAreaM2`. That terminal field remains required, canonical-byte/digest-sensitive, and fail-closed for missing/extra/nonfinite/negative values. The v2 shape is historical evidence; the active v3 basin-floor identity correction below inherits these terminal semantics without a compatibility/default migration layer. `physicalGeneratorVersion` remains unchanged because it participates in physical seed derivation.

Task-7 routing, catchment membership, terminal physical points, constants, generation seeds, persistence threshold, ordinary confluences, and Task-10/ocean/external behavior remain unchanged. Reuse existing budgeted ledger/scratch storage; no additional dense raster, per-cell/per-terminal Map, or duplicate owner registry is authorized. M0.2 remains shadow-only. This upstream correction does not resume Task 12 or modify its historical continuation.

Correction execution (before resuming any later task):

1. Commit this authority ruling before production edits.
2. Add literal RED fixtures for no eligible support, floor-only support, indegree-one chain, two-branch closed merge, unequal branches with an ordinary upstream confluence, direct below-threshold feeder, multibranch simplification, and ocean/external preservation. Behavioral RED must expose floor-anchor/accounting failure, not only an absent schema field. For 62,500 m² cells, two represented two-cell tributaries plus a single-cell direct feeder and floor give reach totals/locals 125,000 each, terminal-local 125,000, catchment 375,000.
3. Implement predecessor measurement and independent reach/terminal cell assignment with unchanged scratch peak `88N + 4T`; propagate the explicit active v2 schema only where required before Task 12.
4. Kill restored floor anchor, both residual-derived locals, floor assigned to tributary, dropped feeder, one-cell hard-code, duplicate terminal cell, co-located twin, degenerate connector, sibling continuation, deleted genuine short reach, weakened universal reach conservation, weakened terminal equality, invalid new terminal field shapes/values, and canonical digest omission. Preserve existing Task-8 mutation controls and restore mutation source byte-identically.
5. Run candidate schema/identity, drainage, flow, basin/valley, crossing, strategic aggregation audits, both TypeScript projects, build, and diff checks. Prove iteration-order invariance, original predecessor under simplification, unchanged upstream authority, candidate byte bounds and terminal-only digest sensitivity.
6. Commit/push the correction separately from docs, verify exact remote SHA and clean worktree, then hand off to a fresh independent read-only reviewer. Do not merge, freeze, or edit `compileTerrainHydro.ts`, `terrainHydroValidate.ts`, or `worldM0M02CompilerAudit.mjs`.

#### Upstream v2 correction execution evidence (2026-09-08)

Base: `9fa2ac2d11b861b5b9314cc7af3453f7164a2213`; authority committed first as `9a1f6a0aa68d0c2ddd53a97f88614ced49b472d4`. Correction branch: `fix/world-m0-m02-task8-closed-terminal-accounting-v2`. These results certify implementation gates only; independent read-only review is still the next actor, and Task 12 remains deferred.

Behavioral RED was run before production edits with literal primary-path/eligibility fixtures. The indegree-one chain returned total/local `250000/250000` instead of `187500/187500`. The minimal two-branch merge returned totals `187500,187500` instead of `62500,62500`. The six-cell direct-feeder fixture returned totals `375000,375000` and locals `125000,250000`; the literal ruling requires totals/locals `125000/125000` on each branch and terminal-local `125000`. Thus RED did not rely only on the absent new field. Existing drainage controls and the new ocean-boundary fixture passed on the base.

GREEN implementation retains absorbing closed topology, records the original predecessor before simplification, and independently accumulates terminal-local cells. Terminal destinations use negative ordinals in `firstReachAssignment`. Conservation checks reuse `primaryArea` after its last measurement read. There are no additional dense allocations or owner registries; exact scratch peak remains `88N + 4T` (worst case `92N`). The sole new retained payload is the required terminal-local numeric field.

Verification completed:

- `node scripts/worldM0M02DrainageGraphAudit.mjs`: 106/106 checks. Seven closed fixture families plus ocean/external preservation; every literal cell destination and catchment membership checked before scratch release; primary routing unchanged; sibling ordering, reversed local accumulation, and removed geometric predecessor are discriminating controls.
- Drainage source mutations: 14/14 v2 mutants and all four existing Task-8 mutants killed. Independent measurement/catchment corruption probes distinguish both residual-derived locals behaviorally. Both signs of terminal-local corruption are refused; the one-sided inequality mutant accepts the overcount and is killed. Sources restore byte-identically.
- `node scripts/worldM0M02CandidateSchemaAudit.mjs`: 31/31 checks. Explicit required `WorldM0TerrainHydroCandidateV2` contract.
- `node scripts/worldM0M02CandidateIdentityAudit.mjs`: 42/42 checks. Five canonical source mutants killed (missing/extra/nonfinite/negative field acceptance and digest omission), with byte-identical restoration. Literal terminal bytes and independent Node SHA-256 match; changing only terminal-local changes bytes and digest. Fixture encoding is 9,097 bytes, below the unchanged 67,108,864-byte bound. Old schema is rejected.
- `node scripts/worldM0M02FlowAudit.mjs`, `node scripts/worldM0M02BasinValleyAudit.mjs`, `node scripts/worldM0M02CrossingAudit.mjs`, and `node scripts/worldM0M02StrategicAggregationAudit.mjs`: PASS.
- `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, `npm run build`, and `git diff --check`: PASS. Vite emits its chunk-size advisory.

Only `terrainHydroTypes.ts`, `canonicalTerrainHydro.ts`, `terrainDrainage.ts`, their schema/identity/drainage audits, and the two authority documents change. No compatibility layer or additional pre-Task-12 production propagation was needed. Flow, catchment construction, terminal physical point derivation, constants/seeds, and crossing production remain unchanged. The historical Task-12 worktree remains clean at `50e5e9d61887a77c9494ba88b077eddb8845e176`.

### Boundary threshold entry — historical candidate v2 clarification, semantics preserved by v3

For an `ocean_outlet` or `external_domain_outlet` whose owner-cell center differs from its physical terminal point, let `k` be represented indegree in Task-8 downstream-closure support `R`:

| State | Persistent topology | Terminal-local area |
| --- | --- | --- |
| A: owner absent from `R` | Terminal and catchment records only; no drainage node or reach | Independently accumulated whole catchment |
| B: owner in `R`, `k = 0` | Eligible `source` at owner-cell center → genuine positive-length boundary reach → physical terminal | Exactly zero |
| C: owner in `R`, `k = 1` | Existing contracted upstream reach → physical terminal; no extra owner-center node | Exactly zero |
| D: owner in `R`, `k >= 2` | Incoming branches → owner-center `confluence` → genuine positive-length boundary reach → physical terminal | Exactly zero |

Terminal ownership does not suppress the distinct B source role. The B owner must itself be eligible; closure through an ineligible owner is C or D. B/D owner-center nodes are topology-critical, and their real boundary continuation survives `minReachLengthMeters`, including a 125 m segment. Every represented ocean/external terminal has exactly one incoming persistent reach and zero outgoing reaches. Zero reaches plus whole terminal-local is valid for a boundary terminal only when represented support is genuinely absent; conservation alone cannot authorize erasing supported topology.

B's continuation measures `primaryContributingAreaM2` at the owner. Its local area is independently accumulated from cells assigned to that reach, which can be the entire catchment when the owner is its first represented support. C's contracted terminal-reaching reach also measures at the owner. D's incoming branches retain immediate primary-path predecessor anchors, while its outgoing continuation measures at the owner and locally owns the owner and any direct feeders reaching it first. Every terrestrial cell is assigned exactly once. D∞ contributing area remains the sole eligibility quantity; primary area remains the stored reach-total quantity. Neither local area is derived by subtraction. Universal reach conservation and both v2-origin catchment reconciliation equations above remain unchanged under v3.

Retained-closed absorbing/floor-only semantics remain separate: a represented isolated floor can have one terminal node, zero reaches, and whole terminal-local. No new node kind, dense raster, per-cell/per-terminal Map, or owner registry is introduced. Reuse existing continuation and budgeted scratch; peak remains `88N + 4T`. Task-7 routing, catchments, terminal points, constants, seeds, `physicalGeneratorVersion`, and canonical physical ordering remain unchanged. This paragraph records the historical v2 boundary correction; the active candidate shape is superseded by the v3 basin-floor identity ruling below. M0.2 stays shadow-only; no merge, freeze, production cutover, M0.3, or Task-12 resumption is authorized.

### Basin floor-point identity — active candidate v3 ruling

The active candidate is `world-m0-terrain-hydro-candidate/v3` with explicit `WorldM0TerrainHydroCandidateV3`. Historical v2 remains evidence only; v3 has no dual-shape compatibility/default path and rejects v2 on the v3 encoder path.

`TerrainDepressionBasin` requires `floorPoint: WorldM0PointM` immediately after `catchmentId`. It is the exact physical center of Task-6's already-authoritative canonical raw minimum-elevation cell. Task 9 already carries that point during its physical sort and must persist it directly before any information is discarded. It must not reselect a floor, derive a point from conditioned routing elevation, or substitute an onward terminal. `floorElevationMeters` remains the raw elevation at that same canonical floor.

The exact v3 canonical basin record order is `id`, `catchmentId`, `floorPoint`, `floorElevationMeters`, `spillElevationMeters`, `outletTerminalId`, `closedEndorheic`, `areaM2`, `boundaryRings`. `floorPoint` is required, strict `{xM,yM}` only, finite/canonical, rejects negative zero and extra nested fields, uses the existing point encoder, and participates in canonical bytes/digest. With 250 m analysis cells it must be an in-extent center `125 + 250*k` on each axis, lie in the retained basin region respecting holes/multipart topology, and lie in the linked catchment region.

Do not change basin physical ordering. The existing final producer key remains exactly `closedEndorheic → floorPoint.xM → floorPoint.yM → floorElevationMeters → spillElevationMeters (null last) → finalized canonical boundary-ring registry → physical catchment key`. Persisted `floorPoint` makes this key reconstructible from retained candidate state. Equivalent physical stage inputs must retain the same basin IDs. After final physical sorting, compare adjacent complete final keys and fail `M02_CANDIDATE_INVALID` on duplicates before assigning any basin ID; insertion order, sort stability, or numeric IDs are not tie-breakers.

Closed basins preserve `spillElevationMeters=null`, `outletTerminalId=null`, and require the reciprocal catchment terminal kind `retained_closed_basin` with `terminal.point === basin.floorPoint`. Exorheic basins preserve a finite spill strictly above raw floor elevation; their onward terminal may be ocean, external, or downstream retained-closed and must not be substituted for `floorPoint`.

RED for this correction must prove coordinate-before-elevation order with A `(125,125), elevation 7` before B `(625,125), elevation 1`, y-coordinate priority, the hidden-floor distinction absent from v2 retained state, unchanged Task-6/Task-9 floor-selection fixtures, and a raw-vs-conditioned elevation witness. Negative controls cover malformed/missing floor points, invalid centers/extents/containment/linkage, closed/exorheic substitution, comparator/order/tie defects, duplicate complete final keys, canonical omission/axis swap/digest omission, and v2 acceptance. Mutants must load and execute; a load failure is not a behavioral kill.

Preserve Task-6 floor selection, Task-7 routing, Task-8 topology/accounting including retained-closed and boundary A/B/C/D controls, physical constants, recipe digest, seeds, `physicalGeneratorVersion`, scratch/boundedness, geometry, and production firewall. Only candidate v2→v3 shape plus canonical bytes/digest are expected to change; basin floors and physical IDs are not.

#### Boundary correction execution sequence

1. Start a dedicated branch/worktree exactly at `818b283561152ffc98c1b8bd8b3cce18d7b4bcfe`; record Task-12-v2 and historical Task-12 tracked bytes, index, HEAD, and dirty diff without changing either worktree. Commit this clarification separately before production edits.
2. Add literal behavioral RED in `scripts/worldM0M02DrainageGraphAudit.mjs`. External five-cell chain `0→1→2→3→4`, 62,500 m²/cell: thresholds 250,000 / 312,500 / 312,501 require C (2 nodes, 1 reach, total/local 312,500), B (source `(1125,125)` → terminal `(1125,0)`, 125 m, same areas), A (0 nodes/reaches, terminal-local 312,500). Ocean Y: owner `(375,125)`, terminal `(500,125)`, catchment 187,500; thresholds 62,500 / 187,500 / 187,501 require D (4 nodes, 3 reaches, boundary total/local 187,500/62,500), B (2 nodes, 1 reach, 125 m, total/local 187,500), A (0 nodes/reaches, terminal-local 187,500). B must fail behaviorally on the base.
3. In `src/sim/world/physical/terrainDrainage.ts`, preserve the B owner source and generalize existing owner-to-terminal continuation pairing to sources as well as confluences. Keep C contracted and closed-floor semantics intact. Check support completeness while scratch exists and exact represented-boundary terminal-local zero.
4. Add controls for C with a below-threshold direct feeder, ineligible owner reached by closure, D predecessor anchors/direct feeders, retained-closed floor-only, short critical reaches, independent ownership, D∞/primary discriminator, canonical order, and node/reach bounds. Run executable source mutants for topology suppression/erasure, incorrect B kind/C node/D collapse, degenerate or deleted short connectors, wrong anchors, dropped/duplicated ownership, residual locals, weakened conservation/reconciliations, compensated nonzero boundary terminal-local, and count bounds. Load failures do not count as kills; restore exact source bytes after every mutant.
5. Run drainage, candidate schema/identity, flow, basin/valley, crossing, strategic aggregation, coastline, and depression/boundary audits; both TypeScript checks, build, and `git diff --check`. Verify unchanged scratch peak and both Task-12 snapshots. Commit and push the correction only on GREEN, verify remote SHA equality and clean status, then hand off to a fresh independent read-only reviewer without reviewing this correction independently here.

### Task 8: Extract catchments and the one-receiver persistent geomorphic drainage graph

**Files:**
- Create: `src/sim/world/physical/terrainDrainage.ts`
- Create: `scripts/worldM0M02DrainageGraphAudit.mjs`

**Consumes:** raw/routing terrain, split-flow analysis, Task-6 depression analysis/compact terminal owners, persistence representation constants.

**Produces:** canonical typed terminals, catchments, nodes, and reaches with deterministic IDs and one downstream receiver.

**Interfaces:**

```ts
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

export function extractPersistentDrainageGraph(
  scratch: TerrainScratchGrid,
  flow: TerrainFlowAnalysis,
  depression: TerrainDepressionAnalysis,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<TerrainDrainageGraphResult>;
```

Task 8 implements §12 exactly. Eligibility is area-threshold-only on transient D∞ `flow.contributingAreaM2`; downstream closure support follows the deterministic §11 primary receiver through below-threshold cells; catchments and stored persistent reach areas use full primary-receiver physical area. `localContributingAreaM2` is independently assigned from cell membership. While `catchmentRoot` is still live, each retained depression's `canonicalFloorCell` is mapped once to the canonical catchment/terminal and emitted as a bounded `TerrainRetainedDepressionDrainageLink`; links sort by ASCII `depressionToken` and duplicate/missing tokens fail. The threshold remains an implementation representation parameter, not a perennial-river assertion.

- [ ] **Step 1: RED F1/F2/F3/highland audit.** Hard-code the §12 F1/F2/F3 primary-receiver and terminal-owner arrays plus exact expected source locations/count, confluence location/count, node/reach counts, downstream links, terminal registry, reciprocal catchment links/memberships/areas, `contributingAreaM2`, and `localContributingAreaM2`; do not derive expected topology with production extraction. Assert F1 exactly one external terminal/catchment, F2 exactly west+east external terminals/catchments in physical order, and F3 exactly one external terminal/catchment. Reuse §11 golden 6 through persistent reduction and require its positive-facet terminal owner to remain present with one catchment, no bypass, and no dangling/unpaired record. Assert area-only eligibility: hold D∞ area fixed while varying slope/relief and require identical eligible mask/graph; move an area just below/at threshold and require the exact threshold-entry change. Verify a short topology-critical F3 reach survives even when `minReachLengthMeters` is longer. Reverse traversal/terminal discovery and require identical terminal/catchment physical registries and IDs; catchments partition terrestrial area; every terrestrial cell terminates exactly once. Add exact retained-depression link witnesses: F6's analysis token maps to the catchment ending at its `retained_closed_basin` terminal; F7's token maps to the catchment ending at the fixture's exact `external_domain_outlet` terminal reached by its primary spill route. Assert `terminalCount === catchmentCount <= maxAnalysisCells` and that every Task-6 owner is materialized exactly once. Add Task-8 §14 peak accounting `88N + 4T`, worst-case `92N`, and exact release of its six dense buffers plus the terminal-owner vector after persistent materialization. For M03, run the literal §8 A/B reach pair with tolerance 125: canonical pre-key order must be A→B, final A must retain `(100,100)`, final B must be exactly `[(50,20),(150,20)]`; reverse/shuffle producer input and require identical final geometry bytes, while an audit-only forced B→A schedule must produce the different non-canonical A endpoints-only result.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02DrainageGraphAudit.mjs
```

Expected RED: exit 1 because the persistent primary-receiver reduction is absent; the audit must identify a named F1/F2/F3 source/confluence/reach/catchment/area/local-area expectation as missing/false.

- [ ] **Step 3: Implement §12 graph extraction with exactly the budgeted primary-area/catchment/eligible/support/indegree/assignment arrays; do not add a per-cell JS adjacency map/set/object layer.** Form represented support as downstream closure of eligible cells; source/confluence roles use represented indegree; contract only degree-2 noncritical chains; materialize object records only after chains become bounded persistent-feature candidates; never prune a critical short reach. Compute unsimplified catchment cell-edge `boundaryRings` with §§8–9, primary physical areas, exact reach measurement anchors, and independently assigned local-area witnesses. Finalize all catchment rings under §8 domain 1 before catchment IDs; then finalize all reach geometries under domain 2 using final coastline/catchment references and the canonical mixed peer-reference schedule before node/reach IDs. Before releasing `catchmentRoot`, resolve every bounded `depression.retainedDepressions` token through its `canonicalFloorCell` to exactly one catchment and that catchment's terminal, then sort the resulting links by ASCII token. Iterate every compact terminal owner exactly once and materialize terminal/catchment reciprocal records only after catchment domain finalization. Derive terrain gradient/relief/incision from raw terrain only. Assign each persistent ID only after the §8 ID barrier for its physical key. Reject bounds instead of truncating.

- [ ] **Step 4: Run GREEN.**

```bash
node scripts/worldM0M02DrainageGraphAudit.mjs
node scripts/worldM0M02FlowAudit.mjs
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: every command exits 0; exact F1/F2/F3 graph topology, area-only eligibility, critical-short-reach retention, catchment partition, local-area conservation, exact F6/F7 retained-depression links, and Task-8 peak/release checks PASS; flow remains PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 8.**

```bash
git add src/sim/world/physical/terrainDrainage.ts scripts/worldM0M02DrainageGraphAudit.mjs
git commit -m "feat(world-m0): extract persistent drainage graph"
```

---

### Task 9: Finalize retained basin, valley, and floodplain-candidate physical geometry

**Files:**
- Create: `src/sim/world/physical/terrainBasins.ts`
- Create: `src/sim/world/physical/terrainValleys.ts`
- Create: `scripts/worldM0M02BasinValleyAudit.mjs`

**Consumes:** raw terrain, depression analysis, finalized terminal/catchment/reach graph, verified geometry constants.

**Produces:** persistent basin geometry linked to canonical catchments/terminals, valley and floodplain-candidate polygons.

**Interfaces:**

```ts
export function finalizeDepressionBasins(
  scratch: TerrainScratchGrid,
  depression: TerrainDepressionAnalysis,
  drainage: TerrainDrainageGraphResult,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<readonly TerrainDepressionBasin[]>;

export interface TerrainValleyGeometryResult {
  readonly valleys: readonly TerrainValleyCandidate[];
  readonly floodplainCandidates: readonly TerrainFloodplainCandidate[];
}

export function deriveTerrainValleyGeometry(
  scratch: TerrainScratchGrid,
  reaches: readonly TerrainDrainageReach[],
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<TerrainValleyGeometryResult>;
```

- [ ] **Step 1: RED geometry audit.** Reuse the exact §10.8 independent F5/F6/F7 values: F5 absent from retained registry; F6 retains exact area/boundary/floor/catchment/closed terminal with persistent null spill/outlet but transient physical spill preserved for validation; F7 has spill 4, canonical onward outlet, and no water level. Assert basin `boundaryRings` role/orientation/area independently. As a discriminating input mutation, clone valid F6 analysis but set `persistentSpillElevationMeters=4` while `closedEndorheic=true`; basin finalization must reject it with `M02_CANDIDATE_INVALID` on the closed-basin spill invariant rather than silently reclassify it. Mountain-to-lowland reach yields terrain-aligned valley geometry; low-slope near-reach terrain can become floodplain candidate while isolated flat terrain cannot; no season/frequency/wetland/waterDepth/discharge field occurs. For M03, reverse/shuffle producer order independently for retained-depression, valley, and floodplain ring registries and require domains 3/4/5 to restore their canonical pre-key schedules and final geometry bytes.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02BasinValleyAudit.mjs
```

Expected RED: exit 1 because retained-basin/valley/floodplain finalization is absent; the audit must identify a named F5/F6/F7 persistent geometry or terrain-derived candidate invariant as missing/false.

- [ ] **Step 3: Finalize basins directly from Task-6 boundary/floor/spill/protection truth without rediscovering or reclassifying closed/exorheic state.** Task 6 has already vectorized retained unsimplified `boundaryRings`, area, floor, physical/persistent spill, and protection token before releasing its dense labels; Task 8 has emitted exactly one `retainedDepressionLinks` entry per retained token while catchment membership was live. Task 9 consumes those bounded records and never requests a retained member-cell array. Validate the frozen tuple before geometry: `closedEndorheic` requires protected intent + null persistent spill and a linked `retained_closed_basin` terminal; exorheic requires non-null persistent spill and the exact Task-8 linked terminal. Contradictory/missing linkage is `M02_CANDIDATE_INVALID`, not a reclassification opportunity. Finalize retained-depression rings under §8 domain 3 against final coastline/catchment/reach references, then assign basin IDs. Derive unsimplified valley/floodplain `boundaryRings` with §§8–9 cell-union topology and finalize domains 4 then 5 under their exact peer/reference scope before assigning valley/floodplain IDs. Geometry may inspect a bounded physical-radius window per represented reach cell; no all-cell/all-reach scan. Count/vertex overflow is `M02_BOUND_EXCEEDED`, never unsafe simplification.

- [ ] **Step 4: Run GREEN.**

```bash
node scripts/worldM0M02BasinValleyAudit.mjs
node scripts/worldM0M02DrainageGraphAudit.mjs
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: every command exits 0; F5/F6/F7 persistent basin semantics/rings and terrain-only valley/floodplain candidate controls PASS, drainage graph remains PASS, and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 9.**

```bash
git add src/sim/world/physical/terrainBasins.ts src/sim/world/physical/terrainValleys.ts scripts/worldM0M02BasinValleyAudit.mjs
git commit -m "feat(world-m0): derive basin and valley geometry"
```

---

### Task 10: Derive structural physical crossing candidates without epistemic/hydraulic leakage

**Files:**
- Create: `src/sim/world/physical/terrainCrossings.ts`
- Create: `scripts/worldM0M02CrossingAudit.mjs`

**Consumes:** persistent reach geometry, raw terrain, M0.1 strategic grid identity.

**Produces:** `PhysicalCrossingCandidate[]` only.

**Interfaces:**

```ts
export function derivePhysicalCrossingCandidates(
  scratch: TerrainScratchGrid,
  reaches: readonly TerrainDrainageReach[],
  spatial: WorldM0SpatialGridIdentity,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<readonly PhysicalCrossingCandidate[]>;
```

- [ ] **Step 1: RED crossing fixture.** One synthetic reach crosses one known cardinal strategic edge at a known physical point. Assert exact strategic edge, reach ID, intersection, bank points, terrain incision, approach slopes, deterministic ID, and iteration-order invariance. Exact-key check must reject injected `knownFord`, `confidence`, `fordability`, `risk`, `crossingClass`, `baseCrossingCost`, `waterDepth`, `width`, `velocity`, `watercraft`, `bridge`, or `ferry` keys. A reach that does not intersect an edge produces no candidate.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02CrossingAudit.mjs
```

Expected RED: exit 1 because the physical crossing-candidate derivation is absent; the X1 exact intersection/geometry/forbidden-key oracle must be named as missing/false.

- [ ] **Step 3: Implement bounded spatial edge intersection.** Derive only candidate edges whose physical bounding boxes overlap each reach segment; no all-edge × all-reach search. Canonicalize edge orientation through Task-2 helper. Transient crossing physical records sort by §8 `(reach physical key, strategicEdge,intersection,leftBank,rightBank)` before `crossing:<16hex>` IDs are assigned. Ordered reach geometry is never reversed. Crossing candidates are not simplified and may not reopen any earlier §8 geometry domain.

- [ ] **Step 4: Run GREEN + legacy crossing source remains untouched.**

```bash
node scripts/worldM0M02CrossingAudit.mjs
git diff --exit-code 73cc38b916e236339897c59686638efafd569b6e -- src/sim/world/hydrography.ts src/sim/world/types.ts
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: every command exits 0; X1 exact physical crossing and forbidden epistemic/hydraulic-key checks PASS, both legacy production files have zero diff from the canonical predecessor, and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 10.**

```bash
git add src/sim/world/physical/terrainCrossings.ts scripts/worldM0M02CrossingAudit.mjs
git commit -m "feat(world-m0): derive physical crossing candidates"
```

---

### Task 11: Aggregate the 250 m physical basis into strategic terrain summaries

**Files:**
- Create: `src/sim/world/physical/terrainStrategic.ts`
- Create: `scripts/worldM0M02StrategicAggregationAudit.mjs`

**Consumes:** scratch physical terrain, provinces, coastline, catchments/reaches/basins/valleys/floodplain/crossings, `WorldM0SpatialGridIdentity`.

**Produces:** `StrategicTerrainSummary[]` only; no legacy `Tile` projection.

**Interfaces:**

```ts
export function aggregateStrategicTerrain(
  scratch: TerrainScratchGrid,
  spatial: WorldM0SpatialGridIdentity,
  provinces: readonly LandformProvenanceProvince[],
  coastline: readonly (readonly WorldM0PointM[])[],
  drainage: TerrainDrainageGraphResult,
  depressionBasins: readonly TerrainDepressionBasin[],
  valleyGeometry: TerrainValleyGeometryResult,
  crossingCandidates: readonly PhysicalCrossingCandidate[],
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<readonly StrategicTerrainSummary[]>;
```

- [ ] **Step 1: RED F10 strategic witness.** Use one deterministic 300×180 km 250 m physical fixture, aggregate independently to 1000 m and 1500 m strategic grids. Assert exact total represented physical area in both; land+ocean area per strategic cell equals its physical area; whole-domain land/ocean totals identical; coastline total identical; provenance integrated area fractions preserve domain area; persistent physical feature IDs/geometries are unchanged; only strategic summary cardinality/references differ. Assert no raw scratch-cell count appears in candidate physical fields.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02StrategicAggregationAudit.mjs
```

Expected RED: exit 1 because strategic aggregation from the 250 m physical basis is absent; the F10 physical-total/cross-resolution/reference-order oracle must be named as missing/false.

- [ ] **Step 3: Implement exact integer grouping.** Require strategic cell dimensions divisible by 250. Use physical cell area/line intersection lengths for totals. Treat all strategic feature-reference lists as semantically unordered: duplicate-check, copy, and ASCII-sort the copy per §8; caller order is not an error. Do not emit terrain enum, biome, resource/risk/seasonal/carrying-capacity, movement cost, or legacy river flags.

- [ ] **Step 4: Run GREEN + SCALE-1 cross-resolution regression.**

```bash
node scripts/worldM0M02StrategicAggregationAudit.mjs
node scripts/scale1SpatialAuthorityAudit.mjs
node scripts/scale1Task7CrossResolutionAudit.mjs
npx tsc -p tsconfig.json --noEmit
```

Expected GREEN: every command exits 0; F10 physical-total and unordered-reference canonicalization checks PASS at both strategic resolutions, SCALE-1 authority/cross-resolution regressions remain PASS, and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 11.**

```bash
git add src/sim/world/physical/terrainStrategic.ts scripts/worldM0M02StrategicAggregationAudit.mjs
git commit -m "feat(world-m0): aggregate m0.2 strategic terrain"
```

---

### Task 12: Add whole-candidate validation and the explicit M0.2 compiler coordinator

**Files:**
- Create: `src/sim/world/physical/terrainHydroValidate.ts`
- Create: `src/sim/world/physical/compileTerrainHydro.ts`
- Create: `scripts/worldM0M02CompilerAudit.mjs`

**Consumes:** all Tasks 1–11 modules.

**Produces:** one pure explicit candidate compilation entry point.

**Interfaces:**

```ts
export interface CompileTerrainHydroInput {
  readonly recipe: unknown;
  readonly resolvedAssets: readonly WorldM0ResolvedAsset[];
  readonly resolvedContent: readonly WorldM0ResolvedContent[];
}

export interface TerrainHydroCompileDiagnostics {
  readonly analysisWidth: number;
  readonly analysisHeight: number;
  readonly analysisCells: number;
  readonly deterministicScratchPeakBytes: number;
  readonly repairOperationCount: number;
  readonly conditionedDepressionCount: number;
  readonly retainedDepressionCount: number;
  readonly provinceCount: number;
  readonly terminalCount: number;
  readonly catchmentCount: number;
  readonly nodeCount: number;
  readonly reachCount: number;
  readonly crossingCandidateCount: number;
  readonly canonicalCandidateBytes: number;
}

export interface CompiledTerrainHydroCandidate {
  readonly candidate: WorldM0TerrainHydroCandidateV3;
  readonly terrainHydroCandidateDigest: WorldM0TerrainHydroCandidateDigest;
  readonly diagnostics: TerrainHydroCompileDiagnostics;
}

export function validateTerrainHydroCandidate(
  candidate: WorldM0TerrainHydroCandidateV2,
  constants: WorldM0PhysicalConstantsV1,
): WorldM0Result<true>;

export async function compileWorldM0TerrainHydro(
  input: CompileTerrainHydroInput,
): Promise<WorldM0Result<CompiledTerrainHydroCandidate>>;
```

Compiler sequence is fixed:

```text
parse recipe
→ validate selected M0.2 physical-generator mode/version with `validateWorldM0TerrainHydroGeneratorMode(recipe)`
→ validate the accepted remaining generator/version axes with `validateWorldRecipeSupport(recipe, WORLD_M0_M02_RECIPE_SUPPORT)`
→ accepted M0.1 asset-resolution validation
→ derive the existing M0.1 `WorldM0SpatialGridIdentity` from `recipe.spatial`
→ resolve+digest+strict-decode physical constants
→ run `validateWorldM0TerrainHydroPolicy(recipe, spatialIdentity, constants)` for procedural-v1 empty-required/null-ML and exact 250 m analysis divisibility/cell-count bounds
→ derive recipe identity
→ derive terrain seed key + protected-basin intent key
→ create shared peak-live scratch budget
→ provenance provinces
→ allocate/synthesize raw terrain
→ land/ocean + coastline
→ depression/boundary/routing surface
→ D∞ contributing flow
→ persistent terminals/catchments/nodes/reaches + retained-depression drainage links
→ retained basin geometry
→ valley/floodplain-candidate geometry
→ crossing candidates
→ strategic summaries
→ assemble persistent candidate
→ validate candidate
→ canonical audit encode + digest
→ drop all scratch/stage-local arrays
→ deep-freeze persistent candidate
→ return candidate + digest + deterministic diagnostics
```

`TerrainHydroCompileDiagnostics` contains no wall-clock or process-memory values; those are external evidence only and never affect candidate digest.

- [ ] **Step 1: RED validator/compiler audit.** Compile the valid shared fixture and assert complete candidate identity, exact analysis dimensions, deterministic scratch `peakBytes` equals the ledger, deep immutability, no typed arrays reachable recursively from candidate, no scratch-shaped keys, candidate bytes under verified cap, graph/terminal/coast/ring/ID/area/geometry invariants. Independently recompute every persistent reach conservation equation from retained fields and catchment closure. Exercise the contributing-area conservation helper directly with the literal F3 witness before whole-candidate validation: change only tributary A `contributingAreaM2` from `62_500` to `62_501`; keep tributary B `62_500`, trunk `localContributingAreaM2=187_500`, trunk stored `contributingAreaM2=312_500`, catchment area, topology, and every local-area witness unchanged. The expected upstream+local sum is `187_500 + 62_501 + 62_500 = 312_501`, so residual `stored - expected = -1 m²` and absolute residual `1 m²`, which decisively exceeds the shared fixture `areaToleranceM2=0.01`. Positivity remains true, tributary A remains below downstream `312_500`, and downstream monotonicity remains true. Require the focused helper to fail specifically on local contributing-area conservation, then require whole-candidate validation to surface that same invariant before generic monotonicity/terminal/geometry checks. Assert policy/content failures occur before terrain functions. Run same compile twice and require canonical bytes + digest identical.

- [ ] **Step 2: Run RED.**

```bash
node scripts/worldM0M02CompilerAudit.mjs
```

Expected RED: exit 1 because the whole-candidate validator/compiler coordinator is absent; the audit must name the missing compile/validation boundary, including retained contributing-area conservation, rather than crash.

- [ ] **Step 3: Implement validator + coordinator.** Coordinator owns one §14 budget from base allocation through Task-8 release and refuses any bypass. Validator independently traverses the assembled candidate and checks finite values, exact §8 ID derivation from physical sorting (while allowing unordered registry insertion order), normalized outer/hole rings, candidate bounds, coastline/land-ocean consistency, catchment partition/area, terminal completeness, reach DAG/uphill constraints, exact local contributing-area conservation and terminal/catchment closure, §10 basin semantics, crossing exact keys, and forbidden-state absence. Put conservation validation before generic monotonicity so the targeted preserving-monotonic mutation fails for the intended reason. Validation does not call generator helpers or discarded scratch to rediscover expected answers.

- [ ] **Step 4: Run GREEN + candidate identity + build.**

```bash
node scripts/worldM0M02CompilerAudit.mjs
node scripts/worldM0M02CandidateIdentityAudit.mjs
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run build
```

Expected GREEN: every command exits 0; whole-candidate validation/compiler and canonical identity report PASS, the positive/monotonic-but-wrong contributing-area mutation is rejected specifically by conservation, both TypeScript projects report no errors, and the production build succeeds.

- [ ] **Step 5: Commit Task 12.**

```bash
git add src/sim/world/physical/terrainHydroValidate.ts src/sim/world/physical/compileTerrainHydro.ts scripts/worldM0M02CompilerAudit.mjs
git commit -m "feat(world-m0): compile and validate m0.2 candidate"
```

---

### Task 13: Consolidate the independent scientific fixture matrix F1–F13 plus physical crossing witness X1

**Files:**
- Create: `scripts/lib/worldM0M02AnalyticalFixtures.mjs`
- Create: `scripts/worldM0M02ScientificFixturesAudit.mjs`

**Consumes:** public narrow M0.2 analysis/compile interfaces. Fixture oracle math remains separate from production generator helper code.

**Produces:** one reviewable controlled evidence matrix, not production state.

- [ ] **Step 0: RED — prove the consolidated scientific-evidence boundary is absent before this task creates it.**

```bash
node scripts/worldM0M02ScientificFixturesAudit.mjs
```

Expected: exit 1 because the consolidated audit does not exist yet. This RED proves the required matrix evidence is missing, not that a production defect must be manufactured. If resuming an interrupted Task 13 where the audit already exists, preserve it and require the incomplete matrix to exit 1 with the first named missing fixture/oracle before completing the remaining fixture coverage.

- [ ] **Step 1: Encode independent fixtures and analytical expectations:**
  - **F1 planar slope:** §11 D∞ plane golden plus §12 exact graph source/node/reach/catchment/link/area/local-area outputs; no uphill/cycle; one terminal.
  - **F2 two-basin ridge:** §11/§12 exact split, receiver/catchment/source/node/reach/terminal outputs, no cross-ridge leakage, domain terrestrial area conserved.
  - **F3 Y confluence:** §12 hard-coded A/B/C/D/E/terminal locations, 2 sources + 1 confluence + 3 reaches, exact downstream links and `312500 = 187500 + 62500 + 62500` local-area conservation.
  - **F4 flat/tied terrain:** §10 flat-rank expectations, no cycle, receiver identity unchanged by reversed iteration, plus §11 exact facet-boundary tie fixture.
  - **F5 ordinary depression with spill:** exact §10.8 member/floor/spill/routing/rank/non-retention/terminal outputs.
  - **F6 intentional/protected endorheic basin:** exact §10.8 protection token/retention/floor/ranks/closed terminal and no ocean/external outlet.
  - **F7 exorheic depression/lake-basin geometry:** exact §10.8 component/floor/spill/outlet/ranks/exorheic classification; no normal water level.
  - **F8 island/coast:** closed island/hole coastline plus finite-border open coastline, exact land/ocean agreement, sea-level sensitivity, §9 checkerboard degree-4 exact rings, and no domain-exterior coastline edges.
  - **F9 explicit external-domain outlet:** explicit typed boundary feature; edge cells are not automatically outlets.
  - **F10 strategic aggregation:** same 250 m physical basis through 1.0/1.5 km projections; identical physical totals/core features.
  - **F11 provenance-family causality:** independently measured §13 anisotropy, radial concentration, signed center-edge tendency, and local-relief effects for all four family-only substitutions; no enum-label/amplitude-only oracle and no detailed geology fields.
  - **F12 resolved-content matrix:** missing/duplicate/wrong digest/malformed/unsupported/out-of-bound content fails before generation.
  - **F13 procedural-v1 asset rejection:** non-empty required physical asset and selected ML fail closed despite valid resolution.
  - **X1 physical crossing:** known strategic-edge/reach intersection yields physical-only candidate with zero epistemic/hydraulic keys.

- [ ] **Step 2: Run the completed matrix once and classify any real fixture failure.**

```bash
node scripts/worldM0M02ScientificFixturesAudit.mjs
```

If a fixture fails, the command must exit 1 with the named oracle/invariant. If all previously implemented modules already satisfy the independent matrix, exit 0 is valid because Step 0 supplied the task's genuine RED evidence boundary; do not invent a production change solely to force a failure.

- [ ] **Step 3: Correct only the M0.2 module responsible for any genuine fixture failure, then rerun each affected narrow audit plus the matrix.** No tolerance may be widened after seeing a failing witness unless the reviewed design and independent oracle demonstrate that the prior test itself was wrong.

- [ ] **Step 4: Run complete controlled GREEN matrix.**

```bash
node scripts/worldM0M02ScientificFixturesAudit.mjs
node scripts/worldM0M02ContentPolicyAudit.mjs
node scripts/worldM0M02TerrainProvenanceAudit.mjs
node scripts/worldM0M02CoastlineAudit.mjs
node scripts/worldM0M02DepressionBoundaryAudit.mjs
node scripts/worldM0M02FlowAudit.mjs
node scripts/worldM0M02DrainageGraphAudit.mjs
node scripts/worldM0M02BasinValleyAudit.mjs
node scripts/worldM0M02CrossingAudit.mjs
node scripts/worldM0M02StrategicAggregationAudit.mjs
node scripts/worldM0M02CompilerAudit.mjs
```

Expected GREEN: every command exits 0; F1–F13 and X1 are all present with independent literal/oracle-side expectations, and every narrow audit plus whole compiler audit reports PASS without deriving expected answers from production helpers.

- [ ] **Step 5: Commit Task 13.**

```bash
git add scripts/lib/worldM0M02AnalyticalFixtures.mjs scripts/worldM0M02ScientificFixturesAudit.mjs src/sim/world/physical
git commit -m "test(world-m0): certify m0.2 analytical fixtures"
```

The `src/sim/world/physical` add is permitted only if Step 3 corrected a fixture-proven M0.2 defect. Inspect `git diff --cached --name-only` before committing; no legacy source may enter this commit.

---

### Task 14: Prove validator discrimination, determinism, restoration, and boundedness with adversarial mutations

**Files:**
- Create: `scripts/lib/reversibleSourceMutation.mjs`
- Create: `scripts/worldM0M02AdversarialAudit.mjs`
- Modify only if a mutation exposes a real M0.2 defect: M0.2-owned modules and M0.2 audit scripts.

**Consumes:** completed candidate/compiler/validator and independent fixture library.

**Produces:** explicit corruption-rejection evidence.

**Reversible source mutation helper:** read original bytes, compute SHA-256, apply one exact mutation, run a child audit command, restore original bytes in `finally`, compute restored SHA-256, and fail unless restoration is byte-identical. Source mutation is used only where an in-memory candidate mutation cannot prove the boundary.

- [ ] **Step 0: RED — prove adversarial-discrimination evidence is absent before this task creates it.**

```bash
node scripts/worldM0M02AdversarialAudit.mjs
```

Expected: exit 1 because the adversarial audit does not exist yet. If resuming an interrupted Task 14 where the script already exists, preserve it and require at least the first not-yet-implemented corruption case to exit 1 as `missing_adversarial_case` before completing the matrix; never weaken an existing production validator merely to manufacture RED.

- [ ] **Step 1: Add in-memory candidate corruptions with expected failure reason:**
  1. add a drainage cycle → `M02_DRAINAGE_CYCLE`;
  2. reverse one reach uphill → `M02_CANDIDATE_INVALID` with uphill-reach path;
  3. use literal F3 and mutate **only** tributary A `contributingAreaM2: 62_500→62_501`; keep tributary B `62_500`, trunk `localContributingAreaM2=187_500`, trunk stored `contributingAreaM2=312_500`, catchment area, topology, and all local witnesses unchanged. The required sum becomes `312_501` while stored remains `312_500`, residual `-1 m²` / absolute residual `1 m² > areaToleranceM2=0.01`; positivity and downstream monotonicity still hold. Call the focused conservation helper first and require `M02_CANDIDATE_INVALID` specifically at the local contributing-area conservation path, then run whole-candidate validation and require the same first relevant failure. Separately test non-positive/downstream-decreasing area only after this discriminating control;
  4. duplicate, omit, or misassign catchment/basin membership or linkage—including a depression basin whose `catchmentId` points at the wrong catchment → basin/catchment conservation or geometry failure;
  5. remove required terminal → `M02_TERMINAL_INVALID`;
  6. replace an ocean/external terminal with a terrestrial dead end, and separately inject an out-of-contract terminal `kind` literal → `M02_TERMINAL_INVALID` / candidate schema failure for the intended terminal-class reason;
  7. mutate coastline to contradict strategic land/ocean → candidate topology failure;
  8. erase protected closed basin → `M02_PROTECTED_BASIN_DESTROYED` or linked basin invariant failure;
  9. inject NaN and Infinity into elevation/geometry → candidate numeric failure;
  10. exceed geometry/node/reach/crossing bound → `M02_BOUND_EXCEEDED`;
  11. mutate a persistent ID ordinal/namespace while keeping physical geometry → §8 ID-derivation failure. Separately reverse only unordered registry/list insertion order and require **PASS with identical canonical bytes/digest**, proving B01 rather than treating order as corruption;
  12. inject `knownFord`/human confidence into a crossing object → exact-key candidate failure.

- [ ] **Step 2: Add pre-compile corruptions:**
  13. §10.9 synthetic F5 routing mismatch with repair budget zero → `M02_REPAIR_BUDGET_EXHAUSTED` before either component routing cell changes;
  14. non-empty required manifest under procedural v1 → `M02_REQUIRED_ASSET_UNSUPPORTED`;
  15. selected ML under procedural v1 → `M02_ML_UNSUPPORTED`;
  16. alter physical-constants bytes without updating recipe digest → `M02_CONTENT_DIGEST_MISMATCH`;
  17. duplicate resolved physical constants identity → `M02_CONTENT_DUPLICATE`;
  18. exceed analysis-cell bound; then use the §14 `50_000_000` byte fixture where base/Task-6 fit but Task-7 peak does not → `M02_BOUND_EXCEEDED` before any Task-7 flow array allocation.

- [ ] **Step 3: Add source-level discrimination mutations with byte-identical restoration:**
  19. bypass the M0.2 resolved-content digest comparison in `content.ts`; the content-policy/adversarial audit must fail;
  20. change one §11 facet equation/order, angular split, primary tie, or flat-rank comparator in `terrainFlow.ts`; the hard-coded D∞/F4 fixture must fail;
  21. inject a production import of `compileTerrainHydro.ts` into a temporary copy/mutation of a legacy production module; the production-firewall audit introduced in Task 16 must reject it. If Task 16 does not yet exist when Task 14 is executed sequentially, stage this mutation case in the adversarial script as disabled-by-missing-audit and activate/require it in Task 16 before closure.

- [ ] **Step 4: Run the completed adversarial matrix before any mutation-driven fix.**

```bash
node scripts/worldM0M02AdversarialAudit.mjs
```

Expected when all earlier validators are already discriminating: exit 0, with each corruption reporting the intended internal rejection. If any corruption is accidentally accepted, the audit exits 1 and that accepted mutation is a genuine RED defect; fix the owning M0.2 validator/module, then rerun the narrow positive fixture to prove the fix did not simply reject all inputs.

- [ ] **Step 5: Add deterministic order/process checks.** Compile equivalent inputs with reversed province/candidate/map insertion order and require byte-identical canonical candidate. Independently reverse/shuffle producer feature order before every §8 simplification domain and require canonical pre-simplification sorting to restore the same domain schedule, final geometry bytes, persistent IDs, and `terrainHydroCandidateDigest`. Include the literal A/B reach pair: shuffled input must still yield canonical A-retained/B-simplified geometry, while an audit-only forced opposite B→A schedule must yield the different non-canonical A endpoints-only geometry and therefore prove the check is discriminating. Compile the same complete fixture twice in-process and in a fresh child Node process and require the same `terrainHydroCandidateDigest`.

- [ ] **Step 6: Run GREEN + restoration checks.**

```bash
node scripts/worldM0M02AdversarialAudit.mjs
node scripts/worldM0M02ScientificFixturesAudit.mjs
git diff --check
```

Expected GREEN: all commands exit 0; every corruption is rejected for its declared reason, all reversible source mutations report `restoredByteIdentical: true`, unordered-order positive controls remain byte/digest-identical, the scientific matrix remains PASS, and diff whitespace hygiene is clean.

The adversarial output must state every mutated source file's original/restored SHA-256 and `restoredByteIdentical: true`.

- [ ] **Step 7: Commit Task 14.**

```bash
git add scripts/lib/reversibleSourceMutation.mjs scripts/worldM0M02AdversarialAudit.mjs src/sim/world/physical
git commit -m "test(world-m0): add m0.2 adversarial discrimination"
```

Again, M0.2 source enters only for a mutation-proven correction; inspect staged scope before committing.

---

### Task 15: Produce deterministic natural seeded evidence and operational measurements without turning diagnostics into scientific pass thresholds

**Files:**
- Create: `scripts/worldM0M02NaturalEvidenceAudit.mjs`
- Modify only if measured evidence exposes a real correctness/boundedness defect: M0.2-owned modules/audits.

**Consumes:** completed explicit compiler.

**Produces:** `/tmp/world-m0-m02-natural-evidence.json` by default; no committed production evidence file in this task.

**Required witness set:** three fixed recipe seeds over the controlled 300 km × 180 km domain with 1 km strategic summaries, plus a same-seed repeat/fresh-child witness. The resolved physical constants are the controlled verified fixture profile; output labels them as controlled generator evidence, not Earth calibration.

**Measurements per seed:**

Each emitted metric record also carries the interpretation class frozen in Step 3. Measured values never become new acceptance thresholds merely because the three witnesses happened to produce them.

- land/ocean fraction and physical areas;
- elevation min/max/quantiles and local-relief distribution;
- slope distribution;
- provenance province count and family physical-area intersections;
- catchment count/area distribution;
- retained basin count/area and closed-basin count/area;
- coastline total length and closed/open topology counts;
- node/reach counts, reach-length distribution, contributing-area distribution, drainage density, confluence count/order summary;
- ocean/external/closed terminal counts;
- valley/floodplain-candidate physical area;
- crossing-candidate count/density;
- deterministic repair/conditioning counts;
- deterministic **peak-live total** scratch/analysis bytes from the shared §14 compiler ledger;
- observed `process.memoryUsage()` peak delta around compilation;
- monotonic wall-clock compile duration from `process.hrtime.bigint()`;
- canonical candidate byte length;
- `terrainHydroCandidateDigest`.

Wall-clock and observed memory are evidence only; they are never serialized into candidate or used to change physical output.

- [ ] **Step 0: RED — prove the natural-evidence boundary is absent before this task creates it.**

```bash
node scripts/worldM0M02NaturalEvidenceAudit.mjs --out /tmp/world-m0-m02-natural-evidence.json
```

Expected: exit 1 because `scripts/worldM0M02NaturalEvidenceAudit.mjs` does not exist yet. This RED is specifically the missing required evidence generator, not a manufactured production defect. If resuming an interrupted Task 15 where the script already exists, delete no work; instead require its first incomplete run to exit 1 with an explicit `missing_required_evidence`/incomplete-witness verdict before filling the missing evidence.

- [ ] **Step 1: Create the evidence generator.** Implement all required witness seeds, metric collection, classification fields, boundedness checks, and same-process/fresh-child determinism checks. The script may emit `verdict: "PASS"` only when every required witness and classification is present and all architecture/correctness/bound invariants hold.

- [ ] **Step 2: GREEN — run the same evidence command after the generator is complete.**

```bash
node scripts/worldM0M02NaturalEvidenceAudit.mjs --out /tmp/world-m0-m02-natural-evidence.json
```

Expected: exit 0 with three complete seed records, finite declared diagnostics, explicit metric classifications, same-seed same-process and fresh-child digest/canonical-byte identity, no reachable scratch state in the candidate, and no verified bound violation. Wall-clock and observed memory may differ across repetitions and remain evidence-only.

The script fails on architecture/correctness/bound violations: invalid candidate, non-finite diagnostics, declared bound violation, missing physical structure needed by the fixture, digest nondeterminism, scratch persistence, or compile behavior obviously incompatible with the 300×180 required fixture. It does not invent Earth-like acceptance bands after observing results.

- [ ] **Step 3: Inspect distributions and classify each metric with one explicit interpretation class: `analytical_invariant`, `empirically_supported_range`, `implementation_abstraction`, `deliberate_boundedness_choice`, or `diagnostic_only`.** `empirically_supported_range` is permitted only when the audit cites an accepted/design research basis or an additional reviewed source that actually supports the stated range; otherwise the metric remains `diagnostic_only`. No screenshot evidence. The audit itself must reject any missing classification so this review cannot silently leave an unclassified metric.

- [ ] **Step 4: Repeat determinism evidence.** Same seed twice in current process and once in child process must produce exact same digest/canonical byte count while wall-clock/memory measurements may differ. This repetition must still exit GREEN under the same audit command.

- [ ] **Step 5: If operational evidence violates explicit verified bounds or reveals O(N²)-style behavior at the controlled fixture, fix the representation/algorithm without changing 250 m identity, then rerun Tasks 13–15. If the fixed 250 m architecture itself is untenable, stop implementation and escalate rather than substituting another analysis resolution.**

- [ ] **Step 6: Commit Task 15.**

```bash
git add scripts/worldM0M02NaturalEvidenceAudit.mjs src/sim/world/physical
git commit -m "test(world-m0): measure m0.2 natural evidence"
```

No `/tmp` evidence is committed. M0.2 source is staged only for a measured defect correction.

---

### Task 16: Close the production-authority firewall, legacy inventory, inherited regressions, and final branch hygiene

**Files:**
- Create: `scripts/worldM0M02CompatibilityClosureAudit.mjs`
- Modify: `scripts/worldM0M02AdversarialAudit.mjs` only to activate/require the already-authored Task-14 source mutation #21 once the closure checker exists.
- Modify only if a prior M0.2-owned defect is proven: other M0.2 modules/audits.
- Must remain unchanged: all ordinary legacy production source, application/UI source, package dependencies, canonical architecture/spec/roadmap.

**Consumes:** complete M0.2 candidate implementation and existing repository regressions.

**Produces:** final M0.2 implementation closure evidence only; no cutover.

**Static production-firewall assertions:**

- Search every `src/**/*.ts` outside `src/sim/world/physical/`: no import/reference of `compileTerrainHydro`, `WorldM0TerrainHydroCandidateV3`, or M0.2 candidate modules.
- M0.2 modules do not import `../generate`, `../types`, `../hydrography`, `../mapEdits`, agents, rules, runner, store, React/UI, or application state.
- No M0.2 production source contains `HumanMaterialBelief`, `practicalAdaptation`, `knownFord`, route/corridor knowledge, human confidence, competence, recognized-resource state.
- No candidate type contains normal discharge, runoff, recharge, baseflow, groundwater, actual lake water level/occupancy, wetted width/depth/velocity, climate normals, wetland activation, flood frequency/season, weather, plants/fauna, detailed mineral/material occurrence.
- No `WorldM0Package`, `packageDigest`, `genesisEnvironmentState`, final package seal, ML runtime/model import, production cutover, or world-creator UI is introduced.
- No persistent candidate contains typed arrays, 250 m scratch cells, scratch receiver arrays, hidden dense provenance raster, or legacy `Tile` objects.
- `package.json` has zero diff. `src/sim/world/generate.ts`, `types.ts`, `hydrography.ts`, `mapEdits.ts`, `spatialTypes.ts`, `spatialGeometry.ts`, `seasonal.ts`, and ordinary production agents/rules have zero implementation diff from `73cc38b916e236339897c59686638efafd569b6e`.
- Activate Task-14 source mutation #21 and require this closure audit to reject a temporary production import; restore bytes identically.

**Legacy writer/reader classification frozen for M0.2:**

| Surface / files | Current classification | M0.2 action | Future seam |
| --- | --- | --- | --- |
| `src/sim/world/generate.ts` elevation/terrain/hydro/crossing writers | legacy production authority retained | untouched | M0.7 provider cutover |
| `src/sim/world/mapEdits.ts` terrain/resource/risk rewrites | legacy production authority retained | untouched | M0.7 audit/retire or compatibility |
| `Tile.elevation`, `terrainKind`, hydro flags, `riverSegmentId` in `types.ts` | legacy production authority retained | untouched | M0.7 deterministic projection/retirement |
| `world.rivers`, `RiverSegmentProfile` | legacy production authority retained | untouched | M0.3 hydraulic facts + M0.7 projection |
| `world.riverCrossings`, `RiverCrossingProfile` | mixed legacy physical/epistemic production surface | untouched | M0.3 hydraulics + M0.7 adapter; human knowledge stays elsewhere |
| `knownFord`, crossing confidence, route/corridor memory | human epistemic state | forbidden from M0.2 | later human crossing/navigation authority |
| `movementCost` and traversal readers | frozen SCALE-1/legacy production reader | untouched | M0.7 physical-provider migration without SCALE-1 redesign |
| `resourceProfile`, `riskProfile`, `seasonalProfile`, `carryingCapacity` | legacy production/read-model authority | untouched | M0.3/M0.4/M0.7 domain-specific migration |
| spawn/demography/decision/ecology/observation/reporting readers of legacy terrain | ordinary production consumers | untouched | M0.7 migration certification |
| `src/sim/world/physical/*` M0.2 modules | canonical M0.2 shadow candidate authority | implement here | consumed/refined by M0.3; production at M0.7 only |
| M0.2 `scripts/*.mjs` | fixture/debug/certification only | allowed explicit candidate compiler imports | never production authority |

- [ ] **Step 0: RED — prove the final compatibility/firewall closure evidence does not yet exist.**

```bash
node scripts/worldM0M02CompatibilityClosureAudit.mjs
```

Expected: exit 1 because the Task-16 closure audit does not exist yet. This is an evidence-boundary RED, not a request to introduce a production violation. If resuming an interrupted Task 16 where the checker already exists, preserve it and instead use Task-14 source mutation #21 as the RED witness: the checker must exit nonzero for the temporary early-production import and identify the production-authority violation before the helper restores bytes identically.

- [ ] **Step 1: Independently create reviewed-base and current legacy fingerprints in this Task-16 process.** No Task-1 temporary artifact is an input. The immutable reviewed base is exactly `7e3ee5f90f699734d913166b5b77a33d0be65dab`. Use a disposable detached worktree and Task-16-owned temporary directory; verify package manifests are unchanged before reusing the current install.

```bash
set -euo pipefail
CURRENT_ROOT="$(pwd)"
BASE_PARENT="$(mktemp -d /tmp/world-m0-m02-base.XXXXXX)"
BASE_WT="$BASE_PARENT/worktree"
FP_DIR="$(mktemp -d /tmp/world-m0-m02-fp.XXXXXX)"
git status --porcelain=v1 --untracked-files=all > "$FP_DIR/current-status.before"
cleanup_m02_base() {
  git worktree remove --force "$BASE_WT" >/dev/null 2>&1 || true
  rm -rf "$BASE_PARENT" "$FP_DIR"
}
trap cleanup_m02_base EXIT INT TERM

git worktree add --detach "$BASE_WT" 7e3ee5f90f699734d913166b5b77a33d0be65dab
cmp "$CURRENT_ROOT/package.json" "$BASE_WT/package.json"
cmp "$CURRENT_ROOT/package-lock.json" "$BASE_WT/package-lock.json"
# M0.2 is forbidden to change dependencies; reuse the already-installed dependency tree read-only.
ln -s "$CURRENT_ROOT/node_modules" "$BASE_WT/node_modules"

( cd "$BASE_WT" && node scripts/canonicalStateFingerprint.mjs --map map1 --years 40 ) > "$FP_DIR/map1.base.json"
( cd "$BASE_WT" && node scripts/canonicalStateFingerprint.mjs --map map2 --years 40 ) > "$FP_DIR/map2.base.json"
node scripts/canonicalStateFingerprint.mjs --map map1 --years 40 > "$FP_DIR/map1.head.json"
node scripts/canonicalStateFingerprint.mjs --map map2 --years 40 > "$FP_DIR/map2.head.json"
cmp "$FP_DIR/map1.base.json" "$FP_DIR/map1.head.json"
cmp "$FP_DIR/map2.base.json" "$FP_DIR/map2.head.json"
git -C "$BASE_WT" diff --exit-code
git -C "$BASE_WT" status --short --untracked-files=no
git status --porcelain=v1 --untracked-files=all > "$FP_DIR/current-status.after"
cmp "$FP_DIR/current-status.before" "$FP_DIR/current-status.after"
```

Expected: both fingerprint `cmp` commands succeed. The detached checkout has no tracked changes, and the current checkout's status after the helper is byte-identical to its captured pre-helper status: Task-16's deliberate uncommitted edits may exist, but this helper creates, deletes, or mutates nothing in the current checkout. The symlinked ignored dependency directory is temporary and never source authority. The Task-16 audit/helper owns equivalent `try/finally` cleanup so a failing comparison still removes the detached worktree and temporary artifacts. Any fingerprint change is a STOP/investigate signal; do not retune legacy coefficients.

- [ ] **Step 2: Create the compatibility closure audit, activate Task-14 source mutation #21, then run GREEN on restored source.** The Task-14 mutation must demonstrate that the checker rejects a temporary ordinary-production import and that restoration is byte-identical; the unmodified tree must then satisfy the same checker.

```bash
node scripts/worldM0M02AdversarialAudit.mjs
node scripts/worldM0M02CompatibilityClosureAudit.mjs
```

Expected GREEN: the adversarial audit exits 0 only after source mutation #21 has observed the compatibility checker reject the temporary ordinary-production import and has restored the mutated file byte-identically; the direct compatibility audit then exits 0 with the static firewall, forbidden-state, unchanged-legacy-source, and scope assertions all explicitly true. If the restored-tree run fails, fix only the M0.2-owned violation; do not change legacy consumers to make the audit green.

- [ ] **Step 3: Run all M0.1 regressions.**

```bash
node scripts/worldM0M01RecipeContractAudit.mjs
node scripts/worldM0M01CanonicalIdentityAudit.mjs
node scripts/worldM0M01AssetIdentityAudit.mjs
node scripts/worldM0M01RoundTripNegativeControlsAudit.mjs
node scripts/worldM0M01CompatibilityClosureAudit.mjs
```

- [ ] **Step 4: Run frozen SCALE-1/import regressions.**

```bash
node scripts/scale1SpatialAuthorityAudit.mjs
node scripts/scale1Task7CrossResolutionAudit.mjs
node scripts/scale1Task8CrossResolutionCertificationAudit.mjs
node scripts/scale1Task8CertificationDiscriminationAudit.mjs
node scripts/importBoundaryAudit.mjs
```

- [ ] **Step 5: Run legacy deterministic production evidence without repository writes.**

```bash
node scripts/itemThreeDeterminismAudit.mjs \
  --out /tmp/world-m0-m02-item3-four-way.json \
  --out-fresh /tmp/world-m0-m02-item3-fresh.json
```

Expected: four-way equivalence, daily repeat identity, fresh-process identity, and non-vacuous Item-3 behavior remain true.

- [ ] **Step 6: Re-run Task 16's self-owned fresh-base comparison after all reversible source mutations.** Invoke the same Task-16 helper/procedure from Step 1, creating a **new** detached `7e3ee5f...` worktree and new temporary fingerprint directory; do not reuse prior process-local files. Expected: byte-identical Map-1/Map-2 fingerprints, every reversible mutation reports restored byte identity, disposable worktree/temp files are removed, and current-worktree status is byte-identical to the status captured immediately before the helper. Task-16's own deliberate edits are still uncommitted at this point, so **do not** claim the worktree is clean here; the final clean-tree requirement is Step 11 after the Task-16 commit.

- [ ] **Step 7: Run full M0.2 evidence set.**

```bash
node scripts/worldM0M02ContentPolicyAudit.mjs
node scripts/worldM0M02CandidateSchemaAudit.mjs
node scripts/worldM0M02CandidateIdentityAudit.mjs
node scripts/worldM0M02TerrainProvenanceAudit.mjs
node scripts/worldM0M02CoastlineAudit.mjs
node scripts/worldM0M02DepressionBoundaryAudit.mjs
node scripts/worldM0M02FlowAudit.mjs
node scripts/worldM0M02DrainageGraphAudit.mjs
node scripts/worldM0M02BasinValleyAudit.mjs
node scripts/worldM0M02CrossingAudit.mjs
node scripts/worldM0M02StrategicAggregationAudit.mjs
node scripts/worldM0M02CompilerAudit.mjs
node scripts/worldM0M02ScientificFixturesAudit.mjs
node scripts/worldM0M02AdversarialAudit.mjs
node scripts/worldM0M02NaturalEvidenceAudit.mjs --out /tmp/world-m0-m02-natural-evidence.json
node scripts/worldM0M02CompatibilityClosureAudit.mjs
```

- [ ] **Step 8: Run both TypeScript projects, production build, and diff hygiene.**

```bash
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run build
git diff --check
```

- [ ] **Step 9: Verify exact implementation source scope.**

```bash
git diff --name-only 7e3ee5f90f699734d913166b5b77a33d0be65dab...HEAD
git diff 7e3ee5f90f699734d913166b5b77a33d0be65dab...HEAD -- \
  src/sim/world/generate.ts \
  src/sim/world/types.ts \
  src/sim/world/hydrography.ts \
  src/sim/world/mapEdits.ts \
  src/sim/world/spatialTypes.ts \
  src/sim/world/spatialGeometry.ts \
  package.json
```

The second command must print no diff.

- [ ] **Step 10: Commit Task 16.**

```bash
git add scripts/worldM0M02CompatibilityClosureAudit.mjs scripts/worldM0M02AdversarialAudit.mjs src/sim/world/physical
git commit -m "test(world-m0): close m0.2 production firewall"
```

M0.2 source is staged only for a closure-proven correction.

- [ ] **Step 11: Final implementation-branch state check.**

```bash
git status --short
git log --oneline --decorate -20
git diff --check
git rev-list --left-right --count 7e3ee5f90f699734d913166b5b77a33d0be65dab...HEAD
```

Status must be clean. Stop after M0.2 review/certification handoff. Do not start M0.3, M0.5, M0.7, a package seal, production cutover, or a world-creator UI.

## Boundedness contract by representation

| State | Bound / scaling rule | Failure behavior |
| --- | --- | --- |
| resolved-content collection | explicit finite record count; each constants payload byte length checked before decode | typed content failure |
| analysis dimensions | exact extent/250 m; controlled fixture 1200×720; must satisfy verified max cells | fail before allocation |
| transient raster/analysis arrays | one shared §14 peak-live ledger across base + compact terminal-owner + all stage-local/D∞/drainage typed arrays; exact formulas through `88N + 4T`, worst-case `92N`; batch preflight before construction | fail before the requested batch, never exceed peak |
| persistent terminals | one unique terrestrial owner each; `terminalCount <= terrestrialCellCount <= maxAnalysisCells` | fail on duplicate/invalid/over-bound owner; never filter or truncate a valid owner |
| persistent catchments | exactly one per terminal, so `catchmentCount === terminalCount <= maxAnalysisCells` | fail on missing/duplicate/unpaired linkage; never merge/filter to satisfy a bound |
| province registry | verified identity-bearing count, finite physical radii/influence | fail, never truncate |
| retained basins | §10 area+depth or deterministic protected-intent criterion + verified retained/protected max counts | fail, never erase/protection-prune basin |
| routing repairs | exact `maxRepairOperations` | typed budget exhaustion |
| drainage nodes/reaches | §12 D∞ area-only eligibility, downstream closure support, topology-critical short-reach retention + verified count bounds | fail, never drop arbitrary source/confluence/terminal connection |
| crossing candidates | geometry-derived + verified max count | fail, never select first N |
| feature vertices | deterministic physical simplification tolerance + per-feature vertex bounds | fail if simplification cannot satisfy topology-preserving bound |
| strategic summaries | exactly strategic row×column count from M0.1 grid identity | no hidden extra grid |
| canonical candidate bytes | verified `maxCandidateCanonicalBytes` | typed bound failure |
| audit/evidence history | scripts emit bounded current-run JSON; no unbounded in-candidate history | candidate remains independent of evidence accumulation |

No O(N²) all-cell pair operation is permitted. Priority-Flood is O(N log N), D∞ local routing/accumulation is O(N) after ordering, strategic aggregation is O(N + F) for scratch cells plus indexed feature intersections, and persistent geometry scales with represented physical feature complexity subject to fail-closed bounds.

## Legacy writer/reader inventory conclusions

- **Canonical M0.2 state:** only new `src/sim/world/physical/` candidate types/compiler and their persistent output.
- **Candidate-only readers:** M0.2 audits and later M0.3 implementation. No ordinary runtime consumer exists in M0.2.
- **Legacy production authority retained:** `generate.ts`, `mapEdits.ts`, `types.ts`, `hydrography.ts`, `seasonal.ts`, `ecologicalProjection.ts`, and all agent/rule consumers of legacy terrain/hydrography/resource/risk/movement state.
- **Future M0.3 consumer:** provenance provinces, terrain/relief, catchments, terminals, drainage reaches, depression-basin geometry, valleys/floodplain candidates, crossing candidates. M0.3 adds water/climate/substrate realization without repainting topology/provenance.
- **Future M0.7 adapter/migration:** legacy `Tile.elevation`, terrain/hydro flags, `riverSegmentId`, `world.rivers`, `world.riverCrossings`, movement-facing physical projections, legacy terrain/resource/risk read models.
- **Projection/read model:** eventual legacy terrain enum/hydro flags/coast/movement/resource/risk summaries after M0.7; none are produced by M0.2 now.
- **Human epistemic state:** `knownFord`, crossing confidence, route/corridor memory, material belief, observations, recognized resources; explicitly excluded from M0.2.
- **Fixture/debug only:** M0.2 analytical/natural/adversarial scripts and current legacy Map-1/Map-2 certification fixtures.
- **Out of scope:** M0.3 climate/water/substrate, WORLD-1 detailed geology/materials, Item-12 weather/hazards, later human crossing/navigation and landscape modification.

## Controlled scientific fixture coverage

| Fixture | Primary tasks | Independent property |
| --- | --- | --- |
| F1 planar slope | 7, 8, 13 | hard-coded D∞ facet/weights/area plus exact source/node/reach/catchment/local-area outputs |
| F2 two-basin ridge | 7, 8, 13 | exact receiver/catchment/source/reach split, no leakage, area conservation |
| F3 Y confluence | 8, 13 | exact 2-source/1-confluence/3-reach links and independent local-area equation |
| F4 flat/tied | 6, 7, 13 | deterministic finite flat resolution, no cycle/order dependence |
| F5 ordinary depression | 6, 9, 13 | exact component/floor/spill/routing/ranks/non-retention/terminal golden |
| F6 endorheic basin | 6, 9, 13 | exact deterministic protection token + closed floor/ranks/terminal/no outlet |
| F7 exorheic basin | 6, 9, 13 | exact retained-exorheic component/floor/spill/ranks/onward outlet |
| F8 island/coast | 5, 13 | closed island/hole + finite-border open coastline, land/ocean agreement, sea-level sensitivity, checkerboard exact rings, no domain-exterior coastline |
| F9 external outlet | 6, 13 | explicit finite-domain outlet, no array-edge semantics |
| F10 strategic aggregation | 11, 13 | physical-unit invariance across 1.0/1.5 km summaries |
| F11 provenance causality | 4, 13 | independent anisotropy/radial/center-edge/local-relief morphology measurements |
| F12 content failure matrix | 1, 13 | missing/duplicate/digest/schema failure before terrain |
| F13 procedural asset rejection | 1, 13 | unsupported asset/ML fail closed |
| X1 crossing candidate | 10, 13 | physical strategic-edge intersection, zero epistemic fields |

## Mandatory corruption / negative-control coverage

| Corruption | Detecting boundary |
| --- | --- |
| directed reach cycle | flow/whole-candidate graph validator |
| uphill reversed reach | whole-candidate terrain-gradient validator |
| F3 tributary A `62_500→62_501` only, while trunk remains `312_500` | focused reach conservation helper first: expected `312_501`, residual `-1 m²`, absolute residual `1 > 0.01`; positivity/monotonicity remain valid |
| duplicate/missing basin membership | catchment conservation validator |
| missing/invalid outlet | terminal completeness validator |
| ocean terminal changed to dead end | terminal type/topology validator |
| coastline contradicts land/ocean | coastline/strategic topology validator |
| protected endorheic basin erased | protected basin invariant |
| NaN/Infinity | numeric/schema/candidate validator |
| count/geometry bound exceeded | fail-closed bound validator |
| `N=864000,T=1`: Task-6 `40,608,004` fits but Task-7 `60,480,004` exceeds 50 MB | §14 all-or-nothing shared budget preflight before any flow-array allocation |
| repair budget exceeded | typed repair-budget failure |
| invalid persistent ID namespace/ordinal | §8 physical-sort ID validator; unordered registry reversal is a positive canonicalization control |
| `knownFord`/confidence injected in crossing | exact-key crossing structural validator |
| unsupported ML accepted | procedural policy validator |
| non-empty required manifest accepted | procedural policy validator |
| constants bytes changed under same digest | resolved-content SHA-256 validator |
| content digest check bypassed in source | reversible source mutation + F12 |
| D∞ facet/split/primary/flat comparator corrupted | reversible source mutation + hard-coded §11/F4 goldens |
| 250 m scratch retained in candidate | recursive candidate-shape/scratch audit |
| M0.2 imported into production early | production-firewall static audit + reversible import mutation |

## Regression / closure battery

The final implementation controller must run, at minimum:

```bash
# M0.1
node scripts/worldM0M01RecipeContractAudit.mjs
node scripts/worldM0M01CanonicalIdentityAudit.mjs
node scripts/worldM0M01AssetIdentityAudit.mjs
node scripts/worldM0M01RoundTripNegativeControlsAudit.mjs
node scripts/worldM0M01CompatibilityClosureAudit.mjs

# M0.2
node scripts/worldM0M02ContentPolicyAudit.mjs
node scripts/worldM0M02CandidateSchemaAudit.mjs
node scripts/worldM0M02CandidateIdentityAudit.mjs
node scripts/worldM0M02TerrainProvenanceAudit.mjs
node scripts/worldM0M02CoastlineAudit.mjs
node scripts/worldM0M02DepressionBoundaryAudit.mjs
node scripts/worldM0M02FlowAudit.mjs
node scripts/worldM0M02DrainageGraphAudit.mjs
node scripts/worldM0M02BasinValleyAudit.mjs
node scripts/worldM0M02CrossingAudit.mjs
node scripts/worldM0M02StrategicAggregationAudit.mjs
node scripts/worldM0M02CompilerAudit.mjs
node scripts/worldM0M02ScientificFixturesAudit.mjs
node scripts/worldM0M02AdversarialAudit.mjs
node scripts/worldM0M02NaturalEvidenceAudit.mjs --out /tmp/world-m0-m02-natural-evidence.json
node scripts/worldM0M02CompatibilityClosureAudit.mjs

# SCALE-1 / import boundaries
node scripts/scale1SpatialAuthorityAudit.mjs
node scripts/scale1Task7CrossResolutionAudit.mjs
node scripts/scale1Task8CrossResolutionCertificationAudit.mjs
node scripts/scale1Task8CertificationDiscriminationAudit.mjs
node scripts/importBoundaryAudit.mjs

# Legacy determinism
node scripts/itemThreeDeterminismAudit.mjs \
  --out /tmp/world-m0-m02-item3-four-way.json \
  --out-fresh /tmp/world-m0-m02-item3-fresh.json

# Type/build/diff
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run build
git diff --check
```

Any deterministic production fingerprint change is a blocker because M0.2 is shadow-only. Investigate the import/source-scope defect; do not tune existing world coefficients to restore parity.

## Spec coverage self-review map

| Reviewed spec section | Plan coverage |
| --- | --- |
| Status/authority + §1 problem | authority header, repository findings, production firewall |
| §2 selected architecture + rejected alternatives | Goal/Architecture/Global Constraints; Tasks 4–12; no legacy extension/ML/full tectonics |
| §3.1 drainage ≠ river regime | Global Constraints; Tasks 8–12; candidate types omit regime/discharge |
| §3.2 depression basin ≠ filled lake | Tasks 6/9/13; no water level/occupancy |
| §3.3 crossing candidate ≠ ford | Task 10/13/14; exact-key physical-only crossing schema |
| §4 content-resolution extension | Task 1 + F12 |
| §4 M0.2 v1 asset policy | Task 1 + F13 + Task 14 |
| §5 physical constants profile | Tasks 1/4 + §§13–14 identity-bearing morphology/protection/peak-live constants + boundedness table |
| §5 frozen 250 m scratch | §14 + Tasks 4/6/7/8/11/12/15; exact 1200×720 fixture, exact `88N + 4T` Task-8 formula, and `92N` worst-case ceiling |
| §6 provenance/terrain | §13 + Tasks 1/4/F11; rotated identity-bearing provinces with distinct stable/orogenic/volcanic/sedimentary spatial morphology |
| §7 finite-open world edge | §10 component-level ocean/external terminal-owner policy + Task 6/F9/terminal validator |
| §8 depression conditioning | §10 complete state machine + Tasks 4/6/9 + exact F5/F6/F7 goldens |
| §9 D∞ flow | §11 Tarboton equations/facet table/splits/primary/topological accumulation + Task 7 exact numerical goldens |
| §10 persistent drainage | §12 area-only eligibility/full primary reduction/minReach semantics/local-area conservation + Task 8 exact F1/F2/F3 |
| §11 coastline/basin/valley/floodplain | §§8–10 exact ring/open-coast/simplifier/checkerboard + Tasks 5/9 + F5–F8 |
| §12 physical crossings | Task 10 + X1 + epistemic structural mutation |
| §13 candidate boundary | Task-2 candidate schema; Task 12 scratch-release/forbidden-state validation |
| §14 determinism/audit identity | §8 unordered-copy sorting/point/ring/ID rules + numeric encoding before Task 3; Tasks 2/3/14/15 |
| §15 typed failures | Task 1 exact M0.2 failure code set; validators throughout |
| §16 F1–F13 | Task 13 coverage table |
| §17 adversarial corruptions | Task 14 + corruption table |
| §18 natural evidence | Task 15 exact diagnostics |
| §19 boundedness/performance | §14 peak-live shared ledger + boundedness table; Tasks 4/6/7/8/9/10/12/15 |
| §20 legacy/migration | Task 16 inventory + zero production import |
| §21 non-goals | Global Constraints + Task-16 forbidden-symbol/source audits |
| §22 owned facts/invariants/simplifications | candidate schema + Tasks 4–12 + future seams below |
| §22 extension seams/deferred authorities | M0.3/WORLD-1/Item-12 seams retained; no early state |
| §22 forbidden shortcuts | Global Constraints + Tasks 13/14/16 |
| §22 reopening triggers | 250 m blocker rule, validator/science escalation, no silent redesign |
| §23 plan entry conditions | exact reviewed base, strict TDD, separate modules, encoding-before-digest, regressions/firewall |
| §24 research basis | accepted reviewed design plus implementation-level verification of Tarboton 1997 D∞/TauDEM and Barnes–Lehman–Mulla 2014 Priority-Flood terminology; no competing scientific premise |

**Spec coverage result expected before plan commit:** every substantive reviewed section maps to at least one concrete task/audit above; no uncovered normative requirement remains.

## Type/interface dependency review

Implementation order is intentionally acyclic:

1. Task 1 owns generic failures/content/constants/policy.
2. Task 2 owns persistent types and numeric-order helpers.
3. Task 3 owns canonical candidate audit encoding/digest, consuming Task 2 only.
4. Task 4 owns terrain/protected-intent seed keys, the shared peak-live scratch budget, rotated provenance, and raw terrain.
5. Task 5 adds land/ocean/coast using §§8–9 closed-ring/open-coast topology, simplifier, and budgeted labels.
6. Task 6 adds §10 depression components/protection/routing/flat ranks plus compact numeric terminal kind/ordinal/owner state; no scalable terminal token/object registry.
7. Task 7 adds exact §11 D∞ split-flow analysis and primary receiver.
8. Task 8 adds §12 primary terminals/catchments/nodes/reaches, independent local-area witnesses, and bounded retained-depression→catchment/terminal links while dense membership is still live.
9. Task 9 consumes those links for retained-basin finalization and adds valley/floodplain geometry.
10. Task 10 adds crossing candidates.
11. Task 11 aggregates strategic summaries.
12. Task 12 is the first whole compiler/validator and consumes every prior production interface.
13. Tasks 13–16 add independent evidence, mutation discrimination, natural measurements, and firewall/regression closure.

Later tasks do not reference an exported production symbol that lacks an earlier owning task. Scratch-only typed arrays and protected-intent tokens do not leak into persistent types. `boundaryRings`, province `axisAngleRadians`, and reach `localContributingAreaM2` are persistent Task-2 fields consumed consistently by Tasks 3/5/8/9/11/12–14; `TerrainRetainedDepressionDrainageLink` is a Task-8 bounded transient-to-persistent bridge consumed only by Task 9/compiler assembly and never serialized as a new candidate authority. `TerrainHydroCompileDiagnostics` is introduced only with the compiler and is not used by earlier physical modules.

## Authority self-review

The implementation described here does not:

- start M0.3 climate/water/substrate realization;
- move ordinary production authority;
- redefine SCALE-1 or make `cardinal_4` hydrology;
- create human knowledge or crossing epistemics;
- create `WorldM0Package`, `packageDigest`, final package seal, or `genesisEnvironmentState`;
- freeze final 1 km production strategic resolution;
- implement or execute ML;
- create detailed geology/lithology/material occurrence;
- create weather/flood/drought/fire event history;
- create living ecology;
- modify the permanent roadmap;
- create a world-creator UI.

## Explicit implementation risks and deferred seams

1. **250 m operational risk:** 864,000 cells is accepted architecture, but peak memory/runtime must be measured. If bounded typed-array implementation still proves operationally untenable at required fixtures, implementation stops for architecture review instead of changing resolution.
2. **Binary64 cross-runtime scope:** M0.2 freezes exact reference-runtime audit bytes. M0.5, not M0.2, certifies supported cross-runtime identity and final package quantization.
3. **Persistent drainage threshold:** `persistenceAreaM2` is the sole v1 eligibility gate and an identity-bearing representation abstraction, not a natural universal channel-head law. Terrain gradient/relief remain reach properties, not hidden eligibility predicates. M0.3 hydration may add runoff/discharge while preserving M0.2 topology unless later evidence triggers formal correction.
4. **Retained depression occupancy:** M0.2 stores geomorphic basin/spill/closed topology only. M0.3 decides climatological water occupancy/level.
5. **Crossing semantics:** M0.2 stops at terrain geometry. M0.3 supplies normal hydraulics; M0.7 later migrates physical crossing providers; human crossing/navigation knowledge remains separate.
6. **Provenance depth:** four families are intentionally broad. M0.3 refines them into broad substrate/hydraulic classes; WORLD-1 owns detailed geology/material occurrence.
7. **Finite-domain external outlets:** v1 materializes explicit off-map terminals and no external inflow. A future regional coupling model would require a new versioned boundary contract.
8. **No delta hydraulics:** one-receiver persistent topology avoids fabricated distributary hydraulics. Rich delta/distributary behavior is a named future seam.
9. **Portable authority docs absent:** the two prompt-named portable authority files were not present in inspected Git/worktrees. This plan relies on higher-ranked accepted Git/source/spec evidence and records the absence rather than fabricating status content.

## Implementation-plan review-finding closure matrix

### Second-review closure: remaining findings

| Finding | Prior defect | Corrected section | Corrected task(s) | New/updated fixture | Discriminating negative/control |
| --- | --- | --- | --- | --- | --- |
| B04 | explicit terminal ownership could be bypassed whenever a positive D∞ facet existed | §§6, 10.1, 11 terminal-owner precedence | Tasks 6–8, 12–14 | §11 golden 6: terminal owner elevation 98 with lower terrestrial neighbor 97 gives positive `0.004` slope but exact terminal sink | force the review counterexample; any facet/cell receiver on the owner is failure; persistent reduction must retain the same terminal/catchment |
| B05 | Task 8 could not know whether a finalized Task-6 terminal that routing bypassed should persist | §12 one-authority Task-6 → Task-7 → Task-8 chain and one-to-one terminal↔catchment | Tasks 6–8, 12–14 | F1/F2/F3 exact terminal registries/catchment links plus §11 golden-6 persistent reduction | reverse terminal discovery/traversal and require every owner exactly once; missing/filtered/dangling/unpaired terminal or catchment fails |
| M02 | O(N) JS terminal objects/strings escaped exact `maxScratchBytes` accounting | §4 compact terminal arrays + §10.1 numeric owner ordering + §14 recalculated ledger | Tasks 4, 6–8, 12, 15 | `N=864000,T=1`: base `22,464,000`, Task-6 `40,608,004`, prospective Task-7 `60,480,004`; worst Task-8 `92N` | 50 MB permits Task 6 but Task-7 batch fails before any flow allocation; scans forbid scalable terminal JS Array/Map/Set/object/string state |
| M03 | local simplification depended on mutable peer state / producer feature order | §8 fixed domains 0–5, canonical pre-keys, mixed earlier-final/later-unsimplified references, exact peer matrix and ID barrier | Tasks 5, 8–10, 14 | literal A/B reaches: canonical A→B leaves A bent and simplifies B; shuffled input gives identical geometry/digest | audit-only forced B→A yields different A endpoints-only result, proving schedule discrimination; producer reversal must not change final bytes/IDs/digest |
| M04 | paired `10→11`, `20→21` mutation preserved conservation and was ineffective | §12 conservation + Tasks 12/14 focused validator ordering | Tasks 8, 12, 14 | F3: mutate only tributary A `62_500→62_501`; expected trunk sum `312_501`, stored `312_500`, residual `-1 m²` | focused conservation helper must reject `1 m² > 0.01 m²` while positivity, downstream monotonicity, topology, catchment area, and local witnesses remain valid |

### Previously closed finding preservation re-check

| Finding | Preservation result | Evidence retained |
| --- | --- | --- |
| B01 | **still closed** | unordered entity registries remain copy/duplicate-check/ASCII-sort; ordered reach/ring traversal remains semantic and unreordered |
| B02 | **still closed** | cardinal land components, land-left cell-edge tracing, degree-4 same-component checkerboard pairing, finite-border no-exterior-edge rule unchanged |
| B03 | **still closed** | full §10 component/floor/spill/protection/retention/closed-vs-exorheic/routing/rank/repair state machine unchanged; compact terminal representation changes storage only, not Task-6 authority |
| M01 | **still closed** | family-specific stable/orogenic/volcanic/sedimentary morphology and F11 discrimination unchanged |
| M05 | **still closed** | Task 16 still reconstructs fresh immutable `7e3ee5f...` base evidence in its own temp worktree/process and does not depend on Task-1 `/tmp` continuity |

**Second-review closure result required before this correction is implementation-ready:** B04, B05, M02, M03, and M04 each have one exact authority, an executable fixture, and a discriminating control; B01/B02/B03/M01/M05 remain closed; no row requires implementation-worker invention.

**Required review dependency traces:**

| Trace | Frozen path |
| --- | --- |
| B03 | §10 → Task 4 protected intent → Task 6 depression/repair → Task 7 terminal-aware flow → Task 8 terminal/catchment graph → Task 9 retained geometry → Task 12 validator → Tasks 13/14 fixtures/adversarial controls |
| B04 → B05 → M04 | Task-6 compact owner → §11 pre-facet terminal precedence in Task 7 → §12 mandatory Task-8 terminal/catchment materialization → F3 `localContributingAreaM2` → Tasks 12/14 focused single-sided conservation corruption |
| M01 | physical constants → Task 1 strict decoder/identity → §13/Task 4 morphology → F11 exact morphology oracle |
| M02 | `maxAnalysisCells` owner/catchment bound → compact `terminalKindByCell`/`terminalOrdinalByCell`/`terminalOwnerCells` → §14 exact `26N`, `47N+4T`, `70N+4T`, `88N+4T` ledger → compiler Task 12 → Task 15 peak-live evidence |
| M03 | §8 domain 0–5 pre-simplification sort + mixed earlier-final/later-unsimplified references + peer matrix + ID barrier → Tasks 5/8/9 producers → Task 10 final-reach crossing consumer → Task 14 producer-order/A-B discriminator → canonical encoder/digest |

## Zero-context executability questions

Before handoff, answer from this document alone:

- **Can D∞ be implemented without inventing equations? YES.** §11 freezes coordinates, row/column direction, physical centers, terrain-8 order, all eight facet vectors, elevation differences, planar downslope vector/equations, clamping, angles, weights, receiver/primary ties, border/terminal/flat behavior, topological order, physical-area accumulation, and six hard-coded numerical goldens including positive-facet terminal precedence.
- **Can F5/F6/F7 be classified without inventing basin policy? YES.** §§10.1–10.9 freeze component discovery/order, equal-height floors, spill candidates/ties, protection derivation, retention, closed/exorheic classification, finite-boundary interaction, raw/routing separation, flat ranks, and exact repair behavior with literal goldens.
- **Can checkerboard coastline be generated without choosing topology? YES.** §§8–9 freeze cardinal components, land-left cell-edge tracing, same-component degree-4 continuation, no diagonal pairing, closed/open representation, and literal ocean-haloed checkerboard coordinates.
- **Can F1/F2/F3 persistent graph be constructed without choosing topology? YES.** §12 freezes primary receiver, area-only eligibility, threshold entry, source/confluence/terminal roles, deterministic chain contraction, exact `minReachLengthMeters` coalescing, catchments, reach orientation/areas, downstream links, and IDs after physical ordering, with literal F1/F2/F3 outputs.

- **B04: Can a terminal-owner cell with a positive terrestrial facet have exactly one prescribed outcome? YES.** Task 7 short-circuits before facet evaluation and writes no cell receiver, zero cell-receiver weights, and the exact canonical terminal ordinal.
- **B05: Can a Task-8 worker know exactly which Task-6 terminals become persistent? YES.** Every Task-6 owner is mandatory, appears through the Task-7 ordinal chain, and Task 8 materializes it exactly once with one catchment; there is no later filtering decision.
- **M02: Can every O(N) transient analysis payload be accounted in deterministic bytes before allocation? YES.** Every scalable payload is typed-array-backed under §14; terminal ownership is `1N + 4N + 4T` within the declared live formulas and `T <= N`.
- **M03: Can feature producer order change final simplification geometry? NO.** Each domain pre-sorts normalized unsimplified physical keys; earlier/later peer reference state is fixed, and the A/B control proves shuffled producer order restores the same result.
- **M04: Does the negative mutation mathematically violate conservation while preserving positivity and monotonicity? YES.** F3 becomes expected `312_501` versus stored `312_500`, residual `-1 m²`, while all areas stay positive and tributary `62_501 < 312_500`.

- Can Task 3 canonicalize an unordered registry without deciding whether caller order is invalid? **Yes: §8/B01 says copy-sort unordered collections and preserve ordered geometry.**
- Can Task 5 trace the checkerboard saddle without selecting a diagonal pairing? **Yes: §9 says cardinal land components and same-component continuation, with exact expected rings.**
- Can Tasks 6/9 classify F5/F6/F7 without inventing closed-basin/spill/flat policy? **Yes: §10 freezes component, floor, spill, protection, retention, terminal, routing, and rank rules.**
- Can Task 7 implement `d_infinity_v1` without reopening Tarboton to determine missing equations? **Yes: §11 freezes coordinates, eight facets, equations, clamping, angles, weights, ties, borders, flats, primary receiver, and iterative accumulation.**
- Can Task 8 determine eligibility/source/confluence/threshold entry/chain contraction/short reach/catchment/area semantics without inventing a channel law? **Yes: §12 freezes them and makes eligibility area-only.**
- Can a worker determine ring orientation, point order, ID format, or simplifier? **No discretion remains: §8 is exact.**
- Can any stage interpret `maxScratchBytes` as its private array budget? **No: §14 is one peak-live ledger.**
- Can Task 12 reject a positive/monotonic but numerically wrong reach area using retained state only? **Yes: `localContributingAreaM2` is independently retained and catchment closure is checked.**
- Can Task 16 run alone in a fresh process after Tasks 1–15 are committed? **Yes: it creates and cleans its own immutable-base worktree and fingerprints.**

## Writing-plans self-review procedure before committing this document

Run all of the following against this exact plan file:

```bash
PLAN=docs/superpowers/plans/2026-08-28-world-m0-m02-terrain-hydrography.md

# 1. Exact required header/path
head -n 3 "$PLAN"

# 2. Placeholder / implementation-discretion scan. Print every occurrence and review it.
# A match is allowed only when it is a concrete normative instruction (for example,
# an algorithm saying which candidate to select); ambiguous future-worker discretion is a defect.
grep -nEi 'TB''D|TO''DO|FIX''ME|implement la''ter|appro''priate|sim''ilar to|as ne''eded|handle edge ca''ses|cho''ose|chosen during implement''ation|decide during implement''ation|implementation-def''ined|write te''sts|et''c\.|future wo''rk' "$PLAN" || true

# 3. Required fixture names / core contracts
for term in \
  'F1 planar slope' \
  'F13 procedural' \
  'finite_open_outflow' \
  'd_infinity_v1' \
  'terrainHydroCandidateDigest' \
  'WorldM0ResolvedContent' \
  'knownFord' \
  '250 m' \
  '1200 × 720' \
  '864,000' \
  'localContributingAreaM2' \
  'protectedClosedBasinRatePer65536' \
  'checkerboard' \
  'Tarboton' \
  'TerrainScratchBudget' \
  'terminalOwnerCells' \
  '60,480,004' \
  'A=[(0,0),(100,100),(200,0)]' \
  '62_500→62_501'; do
  grep -nF "$term" "$PLAN" >/dev/null || exit 1
done

# 4. Every independently reviewable task owns literal, meaningful RED and GREEN text
python3 - <<'PY_TASK_CYCLES'
from pathlib import Path
import re
text = Path("docs/superpowers/plans/2026-08-28-world-m0-m02-terrain-hydrography.md").read_text()
starts = list(re.finditer(r"^### Task (\d+):", text, flags=re.M))
for i, match in enumerate(starts):
    end = starts[i + 1].start() if i + 1 < len(starts) else text.find("\n## Boundedness contract", match.start())
    chunk = text[match.start(): end if end != -1 else len(text)]
    if not re.search(r"\bRED\b", chunk) or not re.search(r"\bGREEN\b", chunk):
        raise SystemExit(f"Task {match.group(1)} lacks a literal RED/GREEN cycle")
print(f"task-red-green-check: PASS ({len(starts)} tasks)")
PY_TASK_CYCLES

# 5. Second-review stale-term / contradiction scan. Every printed occurrence is reviewed contextually;
# stale pre-correction interfaces/formulas are defects, while normative "no unused terminal" prose is allowed.
grep -nEi 'TB''D|TO''DO|FIX''ME|choose|as needed|implementation-defined|depending on implementation|terminal candidate|unused terminal|if no positive facet|terminal seed|TerrainTerminalSeed|maxScratchBytes|simplification order|conservation|46N|69N|87N|10→11|20→21' "$PLAN" || true

# 6. Forbidden authority ownership statements must remain absent from production plan intent
grep -nE 'M0\.2 (owns|implements) (precipitation|runoff|baseflow|normal discharge|weather)' "$PLAN" && exit 1 || true

# 7. Exact file scope/diff hygiene
git diff --check
```

Then manually perform:

1. **Spec coverage:** compare every reviewed spec section in the coverage map with at least one task, audit, and failure/stop rule where normative.
2. **Placeholder scan:** require zero ambiguous plan placeholders.
3. **Type consistency:** trace every interface used by Task N to an existing source or an earlier owning task; verify exact property names agree throughout this document.
4. **Authority check:** require no M0.3, production cutover, SCALE-1 redesign, human knowledge, final package, ML, final strategic-resolution freeze, or detailed geology implementation.
5. **Task dependency check:** each task is executable in order without relying on an undefined future production interface.
6. **Command check:** every task has an exact RED command, implementation boundary, GREEN/regression command, and commit command.
7. **Legacy check:** ordinary production files remain untouched and the final firewall has an adversarial import mutation proving discrimination.
8. **Algorithm completeness:** answer YES from the plan itself to every zero-context question above—especially exact D∞ equations, F5/F6/F7 basin policy, checkerboard pairing, and F1/F2/F3 persistent reduction.
9. **Review closure:** verify B01–B05 and M01–M05 each map to a corrected section, a RED expectation, a GREEN command, and a targeted positive/negative control.
10. **Task-16 independence:** search for stale Task-1 fingerprint dependency language and require zero matches; Task 16 must create/clean its own immutable-base comparison evidence.

Only after all ten checks pass should this plan document be committed and pushed. The plan itself is the only intended file change on `chatgpt/plan/world-m0-m02`.
