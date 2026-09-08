# WORLD-M0 M0.2 Terrain + Hydrographic Physical Foundation Design

## Status and authority

**Checkpoint:** WORLD-M0 M0.2 — Terrain + Hydrographic Physical Foundation  
**Design branch:** `design/world-m0-m02-terrain-hydrography`  
**Exact base:** `checkpoint/world-m0-foundation` at `73cc38b916e236339897c59686638efafd569b6e`  
**Frozen M0.1 authority:** `43c4c45615d375da6d25cf92ef328458ddcad347`  
**Canonical WORLD-M0 architecture:** `335d15eb3dfeb80170f932dceab1b74ee8e0aaa4`  
**Frozen SCALE-1 authority:** `30e1440c237c0f09bb1403687b8da9899fbfd41b`

This document resolves the checkpoint-level scientific and architectural decisions needed to plan M0.2. It does not implement M0.2, move production authority, modify the permanent roadmap, start M0.3, certify the final strategic resolution, create `WorldM0Package`, or reopen M0.1/SCALE-1.

Legacy `createWorld` / Map-1 / Map-2 generation remains the sole production physical authority through M0.6. M0.2 output is shadow candidate physical state only.

The accepted WORLD-M0 architecture says M0.2 owns land/ocean topology, relief, canonical hydrography, basins, lakes, coastline and physical crossing geometry, while M0.3 owns climate normals and climatological hydrology. This design makes that boundary precise:

```text
M0.2 owns geomorphic drainage and water-containing geometry.
M0.3 owns climatological wetted-state and hydraulic realization.
```

That is a clarification of checkpoint ownership, not a roadmap reorder.

---

## 1. Problem statement

The legacy world substrate mixes several kinds of facts inside strategic tiles and hand-authored hydrography:

- relief and terrain labels;
- authored river paths, lakes, creeks and delta branches;
- hydrographic labels such as river, floodplain, riverbank, confluence and estuary;
- hand-authored river classes, width/depth/flow classes and flood seasons;
- crossing cost/risk and human-facing fields such as `knownFord` and `confidence`;
- moisture, resource and carrying-capacity projections derived in the same generator.

This is unsuitable as the canonical WORLD-M0 physical foundation because it does not provide one reproducible causal chain from terrain to drainage, and because physical truth is mixed with later hydrologic state and human epistemic state.

M0.2 must create one deterministic terrain/drainage foundation that M0.3 can hydrate rather than independently repaint.

The checkpoint must solve these foundational questions:

1. how land/ocean and relief are generated deterministically;
2. how a bounded transient analysis raster relates to the strategic grid;
3. how depressions, closed basins and outlets are represented;
4. how surface-flow routing and contributing area are derived;
5. what deserves persistent drainage-reach identity before climate exists;
6. how coastline, basins, valleys and crossing-candidate geometry are represented;
7. how M0.2 state remains resolution-aware without freezing the final 1 km production choice;
8. how identity-bearing constants/content are resolved and verified before physical generation;
9. how the accepted broad provenance/landform scaffold is retained without pre-implementing M0.3 geology;
10. how correctness is tested independently of visual plausibility.

---

## 2. Selected architecture

M0.2 v1 uses a **procedural, constraint-first terrain compiler** with a bounded transient high-resolution terrain-analysis raster, deterministic depression analysis, D-infinity-style contributing-flow analysis and a persistent one-downstream-receiver geomorphic drainage graph.

Selected pipeline:

```text
validated WorldRecipeV1
→ validate supported M0.2 physical-generator version
→ validate M0.1 asset resolution + generator-specific asset policy
→ resolve and digest-verify M0.2 physical constants content
→ derive deterministic broad landform-provenance provinces
→ derive deterministic macro relief/coast scaffold
→ synthesize correlated multiscale relief
→ apply sea level
→ derive land/ocean topology + coastline topology
→ materialize transient 250 m analysis raster
→ identify depressions / spill elevations / terminal basins
→ construct deterministic routing surface without erasing retained basins
→ derive D∞-style surface-flow directions + contributing area
→ derive watersheds / outlets
→ derive persistent geomorphic drainage skeleton
→ reduce drainage skeleton to deterministic reach graph
→ derive depression/lake-basin geometry
→ derive valley/floodplain-candidate geometry
→ derive crossing-candidate geometry
→ aggregate strategic terrain summaries
→ validate M0.2 candidate
→ discard transient fine raster
→ emit immutable pre-seal M0.2 terrain/hydro candidate
```

The implementation must keep each stage independently testable. No monolithic generator function owns the whole pipeline.

### Rejected alternative A — extend the legacy authored generator

Rejected because hand-authored macro river/lake geometry and fixed river classes would remain the real causal authority. That would preserve the defect WORLD-M0 exists to remove.

### Rejected alternative B — ML-first physical authority

Rejected for M0.2 v1 because model/runtime/preprocessing determinism and asset dependencies would become foundational before the procedural physical reconstruction and validation pipeline itself is certified. M0.1 keeps the optional ML identity seam, but M0.2 v1 does not execute ML.

A non-null `mlProposal` under the M0.2 v1 physical-generator version must therefore fail closed with an explicit unsupported-generation-mode failure. It must not be ignored and must not silently fall back to procedural generation under the same recipe identity.

### Rejected alternative C — full tectonic / landscape-evolution simulation

Rejected because it is materially more expensive than needed and would imply physical-history fidelity WORLD-M0 does not require. M0.2 needs causally coherent relief and drainage, not a geological research model.

---

## 3. Scientific interpretation boundary

### 3.1 Drainage is not yet a river-flow regime

M0.2 may infer where surface water would drain across terrain and which valleys accumulate contributing area. It must not claim that every persistent drainage reach is perennial, seasonally flowing, or even wetted under the final climate.

Persistent M0.2 reach identity therefore represents:

```text
geomorphic drainage reach
```

not:

```text
perennial river
seasonal stream
normal discharge
current discharge
flood season
navigability
fordability
```

M0.3 consumes drainage topology together with climate normals, substrate/soil hydraulics and groundwater tendency to derive climatological runoff, recharge/baseflow, active-water regime and hydraulic geometry.

### 3.2 Depression basin is not yet a filled lake

M0.2 owns terrain depressions, basin geometry, spill elevation and outlet/closed-basin topology. It does not decide the final normal lake surface solely from topography.

A M0.2 depression may later become in M0.3:

- normally dry;
- intermittently wet;
- a persistent lake;
- a wetland complex;
- an endorheic water body;
- an exorheic lake with a climatological outlet.

M0.3 owns the water balance that determines those states.

### 3.3 Crossing candidate is not yet a ford

M0.2 may identify places where strategic movement geometry intersects drainage/channel/valley geometry and record physical bank/terrain geometry. It must not write:

- `knownFord`;
- human `confidence`;
- human route memory;
- crossing familiarity;
- final fordability;
- final risk;
- watercraft capability;
- bridge/ferry state.

The accepted canonical architecture permits physical `depth` in hydrographic geometry. In M0.2, that means **terrain/channel incision depth or bank-to-bed geometric depth**, not wetted water depth. Normal water depth, width and velocity derived from discharge belong to M0.3 hydraulic realization.

M0.3 supplies normal hydraulic state. Later human systems decide observation, knowledge and capability.

---

## 4. M0.1 content and asset-resolution extension

M0.1 correctly froze identity-bearing `WorldM0ContentIdentity` values without consuming their payloads. M0.2 is the first checkpoint that needs physical constants content.

M0.2 therefore adds a generic, deterministic content-resolution boundary without changing `WorldRecipeV1` semantics.

Compilation receives an explicit immutable content-resolution input conceptually equivalent to:

```text
WorldM0ResolvedContent
├── id
├── version
└── canonicalBytes
```

The resolver never trusts a caller-supplied digest. It operates as:

```text
WorldM0ContentIdentity from recipe
+ explicit resolved-content collection
→ find exactly one id/version candidate
→ compute SHA-256 over supplied canonical bytes
→ require equality with recipe digest
→ strict schema decode
→ supported content object
```

For M0.2, the resolved payload is conceptually `WorldM0PhysicalConstantsV1`.

The content collection is not an implicit global registry and not a filesystem lookup hidden inside the deterministic compiler. The caller/environment may load immutable bytes, but the pure M0.2 compile boundary receives the resolved bytes explicitly and validates them before use.

Failure is mandatory for:

- content not found;
- duplicate id/version candidates;
- content version unsupported;
- content digest mismatch;
- invalid canonical bytes/schema;
- required field missing;
- unknown field when strict schema rejects it;
- value outside declared physical/numeric bounds.

No compiled fallback constant may replace an identity-bearing missing value.

The same generic resolver is an extension seam for M0.3 `climateConditioning`; M0.2 must not consume climate-conditioning payload semantics early.

### M0.2 v1 asset policy

Before physical compilation, M0.2 calls the accepted M0.1 required-asset resolution validator.

The procedural M0.2 v1 generator consumes **no external `physical_input` assets**. Therefore under this generator version:

- `assets.required` must be empty;
- `mlProposal` must be `null`;
- a non-empty required manifest fails as unsupported for the selected generator version even if its bytes/digests resolve correctly;
- an asset may not remain “required” merely to change recipe identity while being ignored by generation.

A future physical-generator version may explicitly consume immutable physical-input or ML assets, but each supported asset must have a named semantic role and fail closed when absent/mismatched.

---

## 5. M0.2 physical constants profile

Every parameter capable of changing canonical M0.2 output must be identity-bearing through the verified physical-constants content and/or physical-generator version.

The v1 profile includes at least:

- transient analysis-cell size;
- terrain synthesis frequency/amplitude bands;
- broad landform-provenance province placement/blending parameters;
- macro relief / coast scaffold parameters;
- absolute elevation bounds;
- sea-level treatment contract;
- boundary-condition model;
- deterministic flat/tie handling policy;
- depression preservation/conditioning criteria;
- drainage-skeleton representation thresholds;
- minimum persistent reach length/area where required for bounded representation;
- valley/floodplain-candidate geometric parameters;
- geometry simplification tolerances;
- repair iteration/budget bounds;
- maximum node/reach/basin/geometry counts or physically normalized equivalents;
- numeric tolerances used by M0.2 validators.

### Frozen v1 scratch resolution

M0.2 physical-generator v1 uses a **250 metre transient analysis raster**.

For the existing controlled 300 km × 180 km M0.1 fixture this is 1200 × 720 = 864,000 analysis cells.

Reasons:

1. it divides both 1000 m and 1500 m strategic certification cells exactly;
2. it provides 4 analysis cells across a 1 km strategic cell and 6 across a 1.5 km cell;
3. it gives materially better room for valleys, coastlines and drainage than a 500 m raster;
4. it remains small enough to target bounded typed-array processing rather than a permanent dense fine world.

This is a generator-v1 decision, not the final strategic-resolution decision. If implementation evidence shows 250 m is operationally untenable at the required physical extents, that is an architecture review blocker. The worker must not silently substitute another resolution under the same generator identity.

The transient analysis raster is scratch state only. It is never serialized as a hidden persistent fine world.

---

## 6. Terrain synthesis and broad landform provenance

M0.2 does not simulate plate tectonics and does not create detailed lithology. It synthesizes correlated multiscale relief constrained by explicit physical extent, sea level, deterministic macrostructure and a **minimal broad landform-provenance scaffold** required by the accepted architecture.

### Frozen v1 provenance families

M0.2 v1 has exactly four broad terrain-forming provenance families:

```text
stable_denudational
orogenic_uplift
volcanic_constructive
sedimentary_basin
```

These are generator-scale physical provenance classes, not claims that Society Engine simulated the tectonic/geological history that produced them.

The candidate stores a bounded `LandformProvenanceProvince` registry. Each province has deterministic identity, bounded geometry/influence, and exactly one v1 family. Province edges may blend deterministically during scratch terrain synthesis, but no dense permanent 250 m provenance raster is retained. Strategic summaries may expose dominant/intersecting province identities or area fractions derived from the province registry.

Intended semantics:

- `stable_denudational` — broad old/stable terrain with comparatively subdued organized relief under v1 parameters;
- `orogenic_uplift` — elongated/organized high-relief ridge and mountain tendency;
- `volcanic_constructive` — localized constructive high-relief/massif tendency;
- `sedimentary_basin` — broad low-relief basin/depositional accommodation tendency.

The exact numeric influence of each family is physical-constants data and therefore identity-bearing.

The scaffold MUST NOT claim:

- detailed lithology;
- formations/facies;
- mineral deposits;
- exact erodibility/permeability values that M0.3 has not yet resolved;
- human-recognized material opportunity.

M0.3 consumes this province scaffold and may refine it into canonical broad substrate/parent-material/hydraulic classes. It may not independently generate a contradictory provenance field.

Required terrain properties:

- same recipe + same resolved identities → deterministic candidate output;
- different strategic representation of the same controlled physical fixture must not change the intended large-scale physical semantics;
- relief is spatially correlated across several scales rather than independent cell noise;
- macro ridges/basins/coastal structure arise from deterministic continuous fields rather than strategic-cell labels;
- provenance provinces condition relief in a bounded declared way rather than acting as decorative labels;
- no biome or ecology label may cause terrain;
- no human state may be read;
- no hidden randomness outside the recipe/compiler identity is permitted.

The exact correlated-field primitive is an implementation detail inside the frozen v1 generator so long as it satisfies deterministic golden fixtures and the scientific/geometry oracles below. The implementation plan must not expose a public generic noise API as physical authority.

### Terrain outputs retained by M0.2

Strategic persistent terrain state should preserve physically interpretable summaries sufficient for later systems, including at least:

- elevation summary;
- local relief;
- slope summary;
- aspect or directional slope summary where needed;
- land/ocean status;
- coastline relation;
- provenance province intersections/area fractions or equivalent bounded summary;
- drainage/basin membership identities.

The exact numeric quantization/serialization for later final package fields remains an M0.5 certification concern. M0.2 must nevertheless define deterministic in-memory values and a schema-local canonical audit encoding for its own evidence.

---

## 7. World-edge / boundary contract

M0.2 v1 uses a finite-domain `finite_open_outflow` boundary model. Array edges are not implicit untyped hydrologic outlets.

Every drainage terminal must be explicitly classified as one of:

```text
ocean outlet
retained closed / endorheic basin
external domain outlet
```

Rules:

- a terrestrial drainage path that leaves the finite domain is materialized as an explicit `external_domain_outlet` feature at the boundary intersection;
- off-map outflow is valid only through such an explicit feature;
- external inflow is not fabricated;
- periodic/wraparound hydrology is unsupported in v1;
- closed domain walls are not silently assumed;
- every non-closed terrestrial drainage component must resolve to an explicit valid terminal;
- outlet identity must remain deterministic under iteration-order changes.

This avoids accidental physical semantics from array bounds while still allowing regional worlds whose watersheds continue beyond the modeled domain.

---

## 8. Depression analysis and conditioning

M0.2 uses a Priority-Flood-class deterministic depression analysis to identify pits/depressions, spill elevations and watershed structure efficiently.

The implementation must distinguish:

```text
raw/physical terrain
routing surface used for flow analysis
retained depression-basin geometry
```

The routing surface may be conditioned to establish deterministic drainage through artifacts/non-retained depressions, but physical terrain may not simply be replaced wholesale by a filled DEM.

Retained intentional basins remain explicit geometry with:

- deterministic basin identity;
- contributing catchment identity/area;
- basin floor/minimum elevation;
- spill elevation where exorheic;
- outlet identity where exorheic;
- closed/endorheic terminal classification where applicable;
- bounded polygon/geometry representation or equivalent deterministic area representation.

A protected retained basin must survive the routing-conditioning process. A negative-control mutation that fills/deletes such a basin must fail M0.2 certification.

### Protected Closed-Basin Internal Routing

A protected retained closed component has exactly one terminal: its existing canonical floor. Raw `elevationMeters`, protection, retention, closed/endorheic classification, canonical-floor identity, and the physical outer spill pair/elevation remain unchanged; persistent spill remains null, and no component-exterior cell may participate in or receive the closed basin's route.

Task 6 derives a component-local routing surface with a minimax Priority-Flood seeded only at the canonical floor. Set `internalRouting[floor] = rawElevation[floor]`; when a reached member `u` considers a terrain-8 neighbor `v` carrying the same depression label, the candidate is `max(rawElevation[v], internalRouting[u])`, and the final value is the minimum candidate over all component-internal floor-to-member paths. The queue uses the existing finite physical order `(routingElevation, point.xM, point.yM, scratchIndex)`, with scratch index only as the final unreachable physical-point tie; insertion order and epsilon comparisons are forbidden.

For every member, `rawElevation[cell] <= routingElevation[cell] <= physicalSpillElevation`; the canonical floor equals its raw elevation exactly. The operation is raise-only relative to physical terrain, although it may lower the provisional outer-spill upper bound. Existing flat-rank authority then provides every non-floor member a strictly lower-routing neighbor or an equal-routing neighbor with lower rank, eventually reaching the canonical-floor terminal. Repair-v1 does not run on protected components.

No actual normal water level is assigned in M0.2.

---

## 9. Flow routing and contributing area

SCALE-1 `cardinal_4` connectivity remains the strategic human traversal contract. It is **not** the hydrology algorithm.

M0.2 transient terrain analysis uses an 8-neighbor local terrain neighborhood and a D∞-style flow-direction/contributing-area method to reduce D8 directional grid bias.

Required deterministic policy:

- local downslope direction derives from physical elevation geometry;
- split contributing flow used for area analysis is deterministic;
- flats and exact ties have a versioned deterministic resolution rule;
- no cyclic contributing-flow graph is permitted;
- accumulated contributing area is expressed in physical area, not raw cell count;
- changing scratch/strategic representation must not reinterpret area units.

The D∞ analysis is not itself the persistent river graph.

---

## 10. Persistent geomorphic drainage skeleton

M0.2 converts contributing-flow analysis into a bounded persistent drainage skeleton.

A universal scientific claim such as `channel begins at X km²` is forbidden. Channel initiation depends on terrain and hydrologic/subsurface conditions that M0.2 does not fully own. Therefore the v1 persistence threshold is explicitly a **representation parameter**, not a universal natural law.

The threshold must be:

- expressed in physical area/relief terms rather than scratch-cell count;
- identity-bearing;
- stress-tested across controlled relief regimes;
- reported in certification;
- revisitable only through generator/version change or explicit architecture correction.

Persistent reach extraction must preserve deterministic downstream connectivity and may use local valley/slope evidence in addition to contributing area, but it must not use future climate/hydrology truth.

### Retained-closed terminal accounting — active candidate v2 ruling

Retained-closed terminals are absorbing junctions: one terminal record and, when represented support reaches the floor, exactly one terminal drainage node at the canonical floor-cell center. Zero, one, or many incoming reaches are permitted; incoming reaches are siblings with no outgoing reach. A represented floor-only component has one isolated terminal node and zero reaches. Without represented support the catchment and terminal records remain, with no drainage node required. Never manufacture co-located graph twins, self-loops, or zero-length, single-point, epsilon-offset, or repeated-point connectors.

Every reach ending at a retained-closed terminal measures `primaryContributingAreaM2` at the immediate primary-path predecessor of the floor, for both indegree one and multiple incoming branches. Retain that measurement anchor from the original primary raster path before simplification; geometry still ends at the actual floor center. Distinct-coordinate ocean/external terminals retain their existing terrestrial confluence → real positive-length boundary reach → physical boundary terminal topology.

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

Use the existing area tolerance for each equality, never a one-sided inequality. Represented ocean/external terminals have zero terminal-local area under their existing reach topology. Any catchment with no represented reaches has terminal-local equal to its independently accumulated whole catchment area.

The active schema is `world-m0-terrain-hydro-candidate/v2`, with the explicit `WorldM0TerrainHydroCandidateV2` contract. Canonical terminal field order is `id`, `kind`, `point`, `catchmentId`, `localContributingAreaM2`; the new field is required, included in canonical bytes and digest-sensitive. Missing/extra/nonfinite/negative fields fail closed. No dual-shape `/v1` acceptance or migration layer is introduced; historical v1 evidence stays in Git history. `physicalGeneratorVersion` remains unchanged because it participates in physical seed derivation.

Task-7 routing, catchment membership, terminal physical points, constants, generation seeds, persistence threshold, ordinary confluences, and Task-10/ocean/external behavior remain unchanged. Reuse existing budgeted ledger/scratch storage; no additional dense raster, per-cell/per-terminal Map, or duplicate owner registry is authorized. M0.2 remains shadow-only. This upstream correction does not resume Task 12 or modify its historical continuation.

### Persistent graph contract

A drainage reach has conceptually:

- deterministic reach identity;
- geometry in physical coordinates;
- upstream/downstream node identities;
- contributing area at appropriate points/end;
- terrain-gradient/relief metadata;
- channel-incision / bank-to-bed geometric depth where terrain-derived;
- terminal relation;
- basin identity.

Persistent topology uses one downstream receiver per non-terminal reach so ordinary drainage remains a directed acyclic graph/forest toward typed terminals.

D∞ split-flow is used for contributing-area analysis; it does not force a permanently bifurcating river graph.

M0.2 v1 does not fabricate detailed delta distributary hydraulics. Coastal distributary morphology may be represented only where deterministically justified by terrain geometry and the bounded v1 topology contract. Richer distributary hydraulics are a named later seam, not an excuse for arbitrary authored branches.

---

## 11. Lakes, valleys, floodplains and coastlines

### Coastline

M0.2 owns canonical coastline geometry derived from relief + sea level, not from a terrain label painted afterward.

Required invariants:

- strategic land/ocean projection agrees with canonical coastline topology;
- coastline geometry remains inside the physical domain;
- no land strategic cell is classified ocean solely by a legacy terrain enum;
- sea-level offset from the recipe materially affects the candidate identity/output where geometry changes.

### Lake/depression-basin geometry

M0.2 owns potential/geomorphic basin geometry only, per §8.

### Valley and floodplain-candidate geometry

M0.2 may derive valley bottoms and floodplain-candidate geometry from terrain shape, drainage alignment and local relief. The word `candidate` is load-bearing: final climatological floodplain/wetland state requires M0.3 water behavior.

M0.2 must not emit a climate-conditioned flood frequency or flood season.

---

## 12. Physical crossing-candidate geometry

M0.2 creates a physical interface that later SCALE-1-compatible movement/crossing providers can consume after M0.3 hydraulic realization.

Conceptual M0.2 crossing candidate:

```text
PhysicalCrossingCandidate
├── candidate identity
├── drainage reach identity
├── strategic edge / physical intersection identity
├── bank-side geometry
├── terrain gradient / local relief
├── channel-incision / bank-to-bed geometric depth
└── provenance to terrain/drainage geometry
```

Forbidden M0.2 fields include:

```text
knownFord
confidence
human-known crossing class
human risk belief
watercraft knowledge
bridge/ferry availability
normal wetted water depth
normal discharge-derived width
normal flow velocity
final crossing cost
final crossing risk
```

M0.3 may add normal hydraulic facts. M0.7 migration later derives legacy-compatible `RiverCrossingProfile` projections without making the old profile the new physical authority.

---

## 13. Candidate state boundary

M0.2 output is a deterministic pre-seal candidate component, not `WorldM0Package`.

Conceptually:

```text
WorldM0TerrainHydroCandidateV2
├── source identities / generator identity
├── landform-provenance province registry
├── strategic terrain summaries
├── land/ocean topology
├── coastline geometry
├── drainage basin registry
├── drainage node/reach graph
├── depression-basin registry
├── valley/floodplain-candidate geometry
├── physical crossing-candidate geometry
└── generation/validation provenance needed before final package assembly
```

It must not contain:

- climate normals;
- climatological discharge;
- groundwater state;
- soil hydraulics;
- detailed lithology/geology beyond the four-family landform-provenance scaffold;
- sub-cell ecological mosaic;
- plants/fauna/aquatic source realization;
- human knowledge;
- runtime weather history;
- final package digest.

There is no second hidden throwaway geology/provenance field. If a terrain primitive needs temporary latent noise to construct relief, that latent value must be deterministically derived from recipe-bound generator/constants inputs and discarded. It may not be interpreted as lithology or become an independent M0.3 writer.

---

## 14. Determinism, audit encoding and identity rules

M0.2 determinism means more than “same seed looks similar.”

Required:

- same canonical recipe bytes + same resolved content + same compiler versions → byte-identical **M0.2 canonical audit encoding** and digest under the supported M0.2 reference runtime/numeric kernel;
- iteration order over maps/sets/object keys must not change province/reach/basin/candidate identity;
- geometry IDs derive from canonical deterministic ordering/provenance, not allocation order;
- priority-queue tie behavior is deterministic;
- floating-point comparisons that affect topology use explicit numeric-kernel/tolerance rules;
- no `Math.random`;
- no locale-dependent ordering/formatting;
- no unrecorded machine-specific acceleration path that can alter canonical output.

M0.2 must define a schema-local canonical audit encoding and `terrainHydroCandidateDigest` for evidence/reproducibility. This digest is **not** `packageDigest`, does not seal `WorldM0Package`, and does not freeze the final M0.5 package quantization scheme. It records exact M0.2 candidate semantics under the M0.2 schema/version so later evidence can identify the reviewed candidate unambiguously.

The audit encoding must have explicit field/record order and exact numeric encoding defined by the M0.2 candidate schema/numeric-kernel contract. The implementation plan must prescribe that encoding before candidate digest code is written. M0.5 may adopt a different final package quantization/schema only through explicit versioned certification; it must not rewrite historical M0.2 evidence as though the old digest never existed.

Cross-runtime and dual-resolution compiler certification remains formally owned by M0.5. M0.2 must still prove exact repeatability in its declared reference runtime and preserve all information M0.5 needs to test supported runtime/resolution equivalence later.

M0.2 may use floating point internally where justified, but topology/identity-affecting comparisons must be controlled by the frozen numeric-kernel identity. Final physical package-field quantization remains M0.5-owned.

---

## 15. Typed failure model

M0.2 should extend the WORLD-M0 typed failure namespace with checkpoint-specific failures rather than throwing unstructured errors through the compiler boundary.

The exact code names are implementation-plan details, but distinct failures must exist for at least:

- unsupported M0.2 generator version/mode;
- unsupported required asset for procedural v1;
- unsupported non-null ML selection under procedural v1;
- physical constants missing/mismatched/invalid;
- duplicate resolved content identity;
- invalid terrain bounds;
- unresolvable routing topology;
- drainage cycle;
- invalid/missing terminal outlet;
- corrupted basin geometry;
- protected closed-basin destruction;
- geometry/count bound exceeded;
- deterministic repair budget exhausted;
- candidate validation failure.

A repair-budget failure fails generation. It must not relax thresholds silently until the world passes.

---

## 16. RED-first controlled scientific fixtures

The implementation plan must start with independent oracles, not screenshots.

At minimum create deterministic fixtures for:

### F1 — planar slope

Analytical monotonic plane with one known outlet.

Proves:

- no uphill flow;
- no cycles;
- contributing area increases downslope;
- one expected terminal.

### F2 — two basins divided by a ridge

Known ridge with two explicit outlets.

Proves:

- correct watershed separation;
- conservation of physical domain area across basin assignment;
- no cross-ridge drainage.

### F3 — Y confluence

Analytical relief with two tributary valleys joining one trunk.

Proves:

- reach connectivity;
- upstream contributing area conservation at confluence;
- deterministic reach IDs.

### F4 — flat / tied terrain

Controlled flat with one intended drainage outlet.

Proves deterministic tie/flat handling and rejects iteration-order dependence.

### F5 — ordinary depression with spill

Depression that must be conditioned for routing but whose raw terrain remains distinguishable from the routing surface.

### F6 — intentional endorheic basin

Protected closed basin.

Proves no forced ocean outlet and no blanket depression fill.

### F7 — exorheic lake basin geometry

Depression with a deterministic spill/outlet.

Proves basin floor/spill/outlet topology without claiming actual lake fill.

### F8 — island / coastline

Known relief relative to sea level.

Proves coastline/land-ocean agreement and sea-level sensitivity.

### F9 — explicit external-domain outlet

Proves finite-domain boundary classification rather than accidental array-edge drainage.

### F10 — strategic aggregation witness

Same controlled physical terrain interpreted through 1.0 km and 1.5 km strategic grids, both derived from the same 250 m analysis basis.

Proves physical units remain stable while strategic cell cardinality changes.

### F11 — provenance-family causality

Controlled fixtures change only the selected provenance province family while holding spatial extent, seed and other macro controls fixed.

Proves each of the four v1 families has a bounded declared effect on relief/candidate identity while never materializing detailed geology/material occurrence.

### F12 — resolved-content failure matrix

Missing, duplicate, wrong-digest and malformed physical-constants content all fail before terrain generation.

### F13 — procedural-v1 asset rejection

A validly resolved but non-empty required physical-input manifest and a validly resolved selected ML proposal both fail as unsupported under procedural v1 rather than being silently ignored.

---

## 17. Mandatory adversarial corruptions

Each load-bearing validator must be shown to reject at least one targeted corruption.

Required corruptions include:

- reverse one reach to make it uphill;
- create a directed drainage cycle;
- duplicate or omit basin area membership;
- remove a required outlet;
- change an ocean terminal to an invalid terrestrial dead end;
- fill/delete a protected endorheic basin;
- mutate coastline geometry to disagree with land/ocean topology;
- insert NaN/Infinity into terrain geometry;
- exceed geometry/count/repair bounds;
- mutate candidate IDs/order while preserving approximate visual shape;
- inject `knownFord`/human `confidence` into the physical crossing authority;
- substitute different physical-constants bytes under the same recipe identity;
- import M0.2 candidate truth into ordinary production behavior before M0.7.

A test that only compares the implementation with another path through the same implementation is insufficient.

---

## 18. Natural-world evidence

Controlled fixtures prove correctness properties; natural seeded worlds prove the generator actually exercises meaningful structure.

M0.2 natural evidence must report at least:

- land/ocean fraction;
- elevation range and relief distribution;
- provenance-family province count and physical area distribution;
- basin count and physical area distribution;
- closed-basin count/area;
- drainage reach/node count;
- reach-length distribution;
- contributing-area distribution;
- confluence count/order summary;
- coastline length/topology summary;
- valley/floodplain-candidate area;
- crossing-candidate count/density;
- repair/conditioning counts;
- transient peak memory/time;
- retained candidate size;
- deterministic `terrainHydroCandidateDigest` witness.

These statistics are diagnostics, not universal Earth targets. Acceptance must distinguish:

- analytical invariants;
- empirically plausible ranges where well supported;
- implementation abstractions;
- deliberate boundedness choices.

A visually attractive map cannot substitute for these proofs.

---

## 19. Boundedness and performance contract

M0.2 may take noticeable compile time, but it must remain bounded and browser/project-operational.

Required design constraints:

- transient raster storage uses bounded numeric arrays, not one object per 250 m cell;
- scratch arrays are released after candidate extraction;
- no permanent dense sub-grid is retained;
- persistent province/drainage/basin/crossing geometry is bounded by physical/identity-bearing rules;
- no O(N²) all-cell pair search;
- geometry simplification is deterministic;
- repair loops have hard identity-bearing budgets;
- maximum candidate state size is measured;
- compile-time and peak-memory evidence is reported at representative physical extents.

M0.5 remains the formal operational/resolution certification gate. M0.2 must still fail its own review if its implementation obviously cannot scale to the intended M0.5 fixtures.

---

## 20. Legacy and migration boundary

M0.2 does **not** replace production legacy fields yet.

During M0.2–M0.6:

```text
legacy createWorld / Map-1 / Map-2
→ sole ordinary production physical authority

M0.2 candidate
→ shadow-only compilation + audit input
```

M0.2 source must not be imported by ordinary production decision paths, movement, spawning, ecology, human observation or UI as a second live world.

The eventual M0.7 migration must classify legacy surfaces such as:

- `Tile.elevation`;
- `terrainKind`;
- `isRiver` / `riverSegmentId`;
- `isFloodplain` / `isRiverbank` / `isConfluence` / `isEstuary` / `isMarshChannel`;
- `world.rivers`;
- `world.riverCrossings`;
- `hasCreek`;
- legacy river classes and crossing profiles.

Each later becomes either:

```text
canonical WORLD-M0 fact
OR deterministic compatibility projection
OR human-knowledge state owned elsewhere
OR retired legacy vocabulary
```

M0.2 must not perform that cutover early.

---

## 21. Scope and explicit non-goals

M0.2 MUST NOT implement:

- quantitative precipitation/temperature climate normals;
- runoff/baseflow/discharge normals;
- actual river perennial/seasonal/ephemeral classification;
- normal river width/depth/velocity from discharge;
- final lake water balance/fill state;
- groundwater tendency;
- soil hydraulics;
- detailed lithology/geology beyond the four-family landform-provenance scaffold;
- detailed mineral/material occurrence;
- wetlands as hydrologically realized state;
- weather, floods, drought events or wildfire;
- living ecology;
- plant/fauna/aquatic source materialization;
- human observations or beliefs;
- route/crossing knowledge;
- watercraft/navigation;
- final strategic-resolution freeze;
- final package seal;
- production cutover;
- world-creator UI.

---

## 22. Future Evolution Contract

### Owned facts after M0.2 freeze

M0.2 will be canonical shadow authority for:

- deterministic four-family landform-provenance province scaffold;
- deterministic terrain/relief candidate;
- land/ocean topology;
- coastline geometry;
- drainage basin/outlet topology;
- geomorphic drainage reach graph;
- depression/lake-basin geometry;
- valley/floodplain-candidate geometry;
- physical crossing-candidate geometry;
- M0.2 generation provenance/identity needed to reproduce those facts.

### Permanent invariants

Future work must preserve:

- drainage topology follows physical terrain, not authored river paint;
- no invalid uphill/cyclic drainage;
- explicit terminal/outlet identity;
- closed basins are deliberate, not accidental or silently destroyed;
- physical units are authoritative over cell count;
- SCALE-1 strategic connectivity is not confused with hydrologic routing;
- human knowledge remains separate from physical crossing geometry;
- M0.3 hydrates M0.2 rather than generating a second drainage world;
- M0.3 refines/consumes the M0.2 provenance provinces rather than repainting a contradictory substrate;
- no production authority moves before M0.7.

### Current simplifications

- no tectonic evolution simulation;
- procedural multiscale terrain rather than learned Earth prior;
- four broad provenance families rather than detailed geology;
- no external generator assets in procedural v1;
- fixed 250 m transient analysis raster for generator v1;
- representation threshold for persistent drainage skeleton rather than universal channel-head law;
- one-receiver persistent drainage topology;
- no full distributary/delta hydraulics;
- no climatological water state yet.

### Extension seams

M0.3 may add:

- climatological runoff/recharge/baseflow;
- active-water regime;
- hydraulic geometry;
- normal lake/wetland/floodplain hydrology;
- broad substrate/parent material/soil hydraulics/groundwater controls by refining the M0.2 provenance provinces;
- sub-cell physical mosaic.

M0.5 may certify/freeze:

- strategic resolution;
- final package quantization/geometry tolerances;
- cross-resolution equivalence and operational feasibility.

WORLD-1 may later deepen:

- geological units and materials;
- long-term geomorphic/material evolution;
- richer deposit/outcrop/sediment processes.

### Deferred authorities

- weather/event hydrology: Item 12;
- human crossing knowledge/navigation: Item 13;
- detailed geology/material occurrence: WORLD-1;
- human landscape modification: later persistent-landscape/agriculture/production systems.

### Forbidden shortcuts

Future work must not:

- treat contributing-area skeleton as guaranteed perennial river;
- infer lake occupancy from depression geometry alone;
- call a crossing candidate a known ford;
- derive river hydraulics from a legacy enum after M0.3 exists;
- make `cardinal_4` the drainage algorithm;
- overwrite retained basins to simplify routing;
- use biome/ecology labels to create relief/drainage;
- generate an independent M0.3 provenance/substrate history contradicting M0.2;
- leak M0 physical truth into human knowledge;
- retain the 250 m scratch raster as a permanent hidden world.

### Reopening triggers

M0.2 requires explicit correction if later evidence proves:

- drainage/topology can be structurally wrong under valid inputs;
- basin/outlet conservation fails;
- M0.3 cannot hydrate/refine the candidate without inventing contradictory drainage/provenance;
- the scratch/geometry representation is operationally untenable at required extents;
- deterministic identity fails across supported runtimes after M0.5 certification;
- the chosen routing method creates material grid artifacts that fail M0.5 cross-resolution evidence;
- a frozen physical fact requires information M0.2 permanently destroyed;
- scientific evidence shows a load-bearing M0.2 mechanism materially wrong.

A preference for a prettier terrain algorithm, a newer noise library, or more detailed geology is not by itself a reopening trigger.

---

## 23. Implementation-plan entry conditions

No M0.2 implementation plan should be written until this design is reviewed and accepted.

After acceptance, the implementation plan must:

1. remain based on `73cc38b916e236339897c59686638efafd569b6e` or an explicitly integrated successor containing only accepted docs;
2. preserve legacy production authority;
3. use strict TDD / RED-first analytical fixtures;
4. split work into independently reviewable commits;
5. implement explicit content resolution before generation consumes physical constants;
6. enforce procedural-v1 empty-asset/null-ML policy before terrain compilation;
7. implement provenance provinces, terrain, depression analysis, routing and persistent graph as separate bounded modules;
8. prescribe the M0.2 canonical audit encoding before candidate-digest implementation;
9. create adversarial corruptions before claiming closure;
10. run existing M0.1 and SCALE-1 regressions;
11. prove no ordinary production caller imports M0.2 candidate truth;
12. stop after M0.2 candidate/certification work and not start M0.3.

---

## 24. Research basis

These sources constrain the architecture; they do not imply Society Engine reproduces their research models in full.

- Tarboton, D. G. (1997). “A new method for the determination of flow directions and upslope areas in grid digital elevation models.” *Water Resources Research* 33(2), 309–319. DOI: `10.1029/96WR03137`. Supports D∞ flow-direction/contributing-area analysis and the concern about D8 grid bias.
- Barnes, R., Lehman, C., & Mulla, D. J. (2014). “Priority-Flood: An optimal depression-filling and watershed-labeling algorithm for digital elevation models.” *Computers & Geosciences* 62, 117–127. DOI: `10.1016/j.cageo.2013.04.024`. Supports efficient deterministic depression/watershed analysis; Society Engine deliberately preserves selected physical basins rather than treating all depressions as errors.
- Montgomery, D. R., & Dietrich, W. E. (1988). “Where do channels begin?” *Nature* 336, 232–234. Supports the fact that channel initiation is process/terrain dependent rather than one universal drainage-area threshold.
- Montgomery, D. R., & Dietrich, W. E. (1989). “Source areas, drainage density, and channel initiation.” *Water Resources Research* 25(8), 1907–1918. DOI: `10.1029/WR025i008p01907`. Supports the separation between geomorphic source-area structure and a simplistic universal channel threshold.
- Leopold, L. B., & Maddock, T. (1953). *The Hydraulic Geometry of Stream Channels and Some Physiographic Implications*. USGS Professional Paper 252. DOI: `10.3133/pp252`. Supports deferring final width/depth/velocity hydraulic realization until discharge/hydrology exists in M0.3.

The implementation plan may add newer or domain-specific sources where a concrete algorithmic choice requires them, but it must distinguish scientific support from Society Engine implementation abstractions.
