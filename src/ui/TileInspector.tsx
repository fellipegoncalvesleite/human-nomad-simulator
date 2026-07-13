import { useSimulationStore } from "../store";
import { getTile } from "../sim/world/generate";
import {
  getAdjacentRiverCrossings,
  getRiverProfile,
  getSeasonalRiverCrossingState,
} from "../sim/world/hydrography";
import { getSeasonalTileConditions } from "../sim/world/seasonal";
import type { SeasonalTileConditions } from "../sim/world/seasonal";
import type { Tile, WorldState } from "../sim/world/types";
import type { BandId } from "../sim/core/types";
import {
  deriveBandPerceivedEcologicalTile,
  deriveCurrentLivingEcologyTile,
  deriveHabitatPotentialTile,
} from "../sim/world/ecologicalProjection";

export function TileInspector() {
  const world = useSimulationStore((state) => state.world);
  const selectedTileId = useSimulationStore((state) => state.selectedTileId);
  const selectedBandId = useSimulationStore((state) => state.selectedBandId);
  const selectedTile =
    world !== null && selectedTileId !== null ? getTile(world, selectedTileId) : undefined;
  const seasonalConditions =
    world !== null && selectedTile !== undefined
      ? getSeasonalTileConditions(world, selectedTile)
      : undefined;

  return (
    <aside className="tile-panel" aria-label="Selected tile details">
      <h2>Selected Tile</h2>
      {selectedTile === undefined ? (
        <p className="empty-panel">Click a tile to inspect it.</p>
      ) : (
        <TileDetails
          world={world}
          tile={selectedTile}
          selectedBandId={selectedBandId}
          seasonalConditions={seasonalConditions}
        />
      )}
    </aside>
  );
}

function TileDetails({
  world,
  tile,
  selectedBandId,
  seasonalConditions,
}: {
  readonly world: WorldState | null;
  readonly tile: Tile;
  readonly selectedBandId: BandId | null;
  readonly seasonalConditions: SeasonalTileConditions | undefined;
}) {
  const habitat = deriveHabitatPotentialTile(tile);
  const current = world === null ? undefined : deriveCurrentLivingEcologyTile(world, tile.id);
  const selectedBand = world === null || selectedBandId === null ? undefined : world.bands[selectedBandId];
  const perceived = world === null || selectedBand === undefined
    ? undefined
    : deriveBandPerceivedEcologicalTile(selectedBand, tile.id, world.time);
  const booleans = [
    tile.isRiver ? "river" : "not river",
    tile.isCoastal ? "coastal" : "not coastal",
    tile.isAquatic ? "aquatic" : "not aquatic",
  ].join(" / ");

  return (
    <dl className="tile-details">
      <div className="tile-detail-heading">Base geography</div>
      <Detail label="tile id" value={String(tile.id)} />
      <Detail label="coord" value={`${tile.coord.x}, ${tile.coord.y}`} />
      <Detail label="regionId" value={String(tile.regionId)} />
      <Detail label="terrainKind" value={tile.terrainKind} />
      <Detail label="base habitat richness" value={formatNumber(tile.resourceProfile.baseRichness)} />
      <Detail label="waterAccess" value={formatNumber(tile.resourceProfile.waterAccess)} />
      <Detail
        label="aquaticPotential"
        value={formatNumber(tile.resourceProfile.aquaticPotential)}
      />
      <Detail
        label="wildGrainPotential"
        value={formatNumber(tile.resourceProfile.wildGrainPotential)}
      />
      <Detail
        label="plantTendingPotential"
        value={formatNumber(tile.resourceProfile.plantTendingPotential)}
      />
      <Detail
        label="storageSuitability"
        value={formatNumber(tile.resourceProfile.storageSuitability)}
      />
      <Detail
        label="seasonalVariance"
        value={formatNumber(tile.seasonalProfile.seasonalVariance)}
      />
      <Detail label="floodRisk" value={formatNumber(tile.riskProfile.floodRisk)} />
      <Detail label="droughtRisk" value={formatNumber(tile.riskProfile.droughtRisk)} />
      <Detail label="diseaseRisk" value={formatNumber(tile.riskProfile.diseaseRisk)} />
      <Detail label="movementCost" value={formatNumber(tile.movementCost)} />
      <Detail label="elevation" value={formatNumber(tile.elevation)} />
      <Detail label="flags" value={booleans} />
      <Detail
        label="hydro flags"
        value={[
          tile.isFloodplain ? "floodplain" : undefined,
          tile.isRiverbank ? "riverbank" : undefined,
          tile.isConfluence ? "confluence" : undefined,
          tile.isEstuary ? "estuary" : undefined,
          tile.isMarshChannel ? "marsh channel" : undefined,
        ].filter((value): value is string => value !== undefined).join(" / ") || "none"}
      />
      <Detail label="neighbors" value={String(tile.neighbors.length)} />
      <div className="tile-detail-heading">Habitat potential · substrate</div>
      <Detail label="potential support" value={formatNumber(habitat.ecologicalSupportScalar)} />
      <Detail label="plant potential" value={formatNumber(habitat.plant)} />
      <Detail label="terrestrial fauna potential" value={formatNumber(habitat.terrestrialFauna)} />
      <Detail label="aquatic potential" value={formatNumber(habitat.aquatic)} />
      <Detail label="accessibility" value={formatNumber(habitat.accessibility)} />
      <Detail label="meaning" value="what this habitat could support; not food available now" />
      {current === undefined ? null : (
        <>
          <div className="tile-detail-heading">Living ecology · Technical world truth</div>
          <Detail label="current physical support" value={formatNumber(current.ecologicalSupportScalar)} />
          <Detail label="plant / fauna / aquatic" value={`${formatNumber(current.plant)} / ${formatNumber(current.terrestrialFauna)} / ${formatNumber(current.aquatic)}`} />
          <Detail label="physical sources" value={`${current.plantPatchCount} plant · ${current.terrestrialFaunaStockCount} fauna · ${current.aquaticStockCount} aquatic`} />
          <Detail label="depletion / recovery" value={`${formatNumber(current.depletion)} / ${formatNumber(current.recoverySignal)}`} />
          <Detail label="trophic condition / predator pressure" value={`${formatNumber(current.trophicCondition)} / ${formatNumber(current.predatorPressure)}`} />
          <Detail label="authority" value="read-only projection; never feeds nutrition" />
        </>
      )}
      <div className="tile-detail-heading">Known opportunity · selected band</div>
      {selectedBand === undefined ? (
        <Detail label="perception" value="select a band; no omniscient fallback" />
      ) : perceived?.known !== true ? (
        <Detail label="perception" value={`${selectedBand.name} has no evidence for this tile`} />
      ) : (
        <>
          <Detail label="band" value={selectedBand.name} />
          <Detail label="remembered opportunity" value={formatNumber(perceived.ecologicalSupportScalar)} />
          <Detail label="plant / fauna / aquatic" value={`${formatNumber(perceived.plant)} / ${formatNumber(perceived.terrestrialFauna)} / ${formatNumber(perceived.aquatic)}`} />
          <Detail label="confidence / uncertainty" value={`${formatNumber(perceived.confidence)} / ${formatNumber(perceived.uncertainty)}`} />
          <Detail label="staleness" value={`${perceived.staleness}${perceived.ageTicks === null ? "" : ` · ${perceived.ageTicks} seasonal ticks`}`} />
        </>
      )}
      <RiverDetails world={world} tile={tile} />
      {seasonalConditions === undefined ? null : (
        <>
          <div className="tile-detail-heading">Current seasonal conditions</div>
          <Detail
            label="currentWaterStress"
            value={formatNumber(seasonalConditions.currentWaterStress)}
          />
          <Detail
            label="currentFloodStress"
            value={formatNumber(seasonalConditions.currentFloodStress)}
          />
          <Detail
            label="currentDroughtStress"
            value={formatNumber(seasonalConditions.currentDroughtStress)}
          />
          <Detail
            label="aquaticReliability"
            value={formatNumber(seasonalConditions.currentAquaticReliability)}
          />
          <Detail
            label="movementDifficulty"
            value={formatNumber(seasonalConditions.currentMovementDifficulty)}
          />
        </>
      )}
    </dl>
  );
}

function RiverDetails({
  world,
  tile,
}: {
  readonly world: WorldState | null;
  readonly tile: Tile;
}) {
  if (world === null) {
    return null;
  }

  const profile = getRiverProfile(world, tile.riverSegmentId);
  const crossings = getAdjacentRiverCrossings(world, tile.id);

  if (profile === undefined && crossings.length === 0) {
    return null;
  }

  return (
    <>
      <div className="tile-detail-heading">Hydrography</div>
      {profile === undefined ? null : (
        <>
          <Detail label="riverId" value={String(profile.riverId)} />
          <Detail label="river kind" value={profile.kind} />
          <Detail label="width/depth" value={`${profile.widthClass} / ${profile.depthClass}`} />
          <Detail label="flow" value={profile.flowStrength} />
          <Detail label="fordability" value={formatNumber(profile.fordability)} />
          <Detail label="navigability" value={formatNumber(profile.navigability)} />
          <Detail label="flood season" value={profile.floodSeason ?? "none"} />
          <Detail label="crossing risk" value={formatNumber(profile.crossingRisk)} />
          <Detail
            label="floodplain modifier"
            value={formatNumber(profile.floodplainFertilityModifier)}
          />
        </>
      )}
      {crossings.length === 0 ? (
        <Detail label="adjacent crossings" value="none" />
      ) : (
        crossings.map((crossing, index) => {
          const seasonal = getSeasonalRiverCrossingState(world, crossing, {
            canUseFords: true,
            canUseShallowCrossings: true,
            canAttemptBasicRaftCrossing: false,
          });

          return (
            <Detail
              key={`${crossing.fromTileId}:${crossing.toTileId}`}
              label={`crossing ${index + 1}`}
              value={`${crossing.crossingClass} ${crossing.fromTileId} <> ${crossing.toTileId} cost=${formatNumber(
                seasonal.effectiveCrossingCost,
              )} risk=${formatNumber(seasonal.effectiveRisk)} flood=${
                seasonal.isFloodSeason ? "yes" : "no"
              } blocked=${seasonal.isBlockedWithoutCapability ? "yes" : "no"}`}
            />
          );
        })
      )}
    </>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="tile-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}
