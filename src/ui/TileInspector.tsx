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

export function TileInspector() {
  const world = useSimulationStore((state) => state.world);
  const selectedTileId = useSimulationStore((state) => state.selectedTileId);
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
        <TileDetails world={world} tile={selectedTile} seasonalConditions={seasonalConditions} />
      )}
    </aside>
  );
}

function TileDetails({
  world,
  tile,
  seasonalConditions,
}: {
  readonly world: WorldState | null;
  readonly tile: Tile;
  readonly seasonalConditions: SeasonalTileConditions | undefined;
}) {
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
      <Detail label="baseRichness" value={formatNumber(tile.resourceProfile.baseRichness)} />
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
      <RiverDetails world={world} tile={tile} />
      {seasonalConditions === undefined ? null : (
        <>
          <div className="tile-detail-heading">Current season</div>
          <Detail
            label="currentFoodEstimate"
            value={formatNumber(seasonalConditions.currentFoodEstimate)}
          />
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
