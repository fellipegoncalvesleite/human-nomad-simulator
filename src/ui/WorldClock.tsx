import { useSimulationStore } from "../store";
import { SEASON_LENGTH_DAYS } from "../sim/core/types";

export function WorldClock() {
  const world = useSimulationStore((state) => state.world);
  const liveOverlay = useSimulationStore((state) => state.liveOverlay);
  // The live overlay ticks every season; full world snapshots arrive rarely.
  const time =
    liveOverlay !== null && (world === null || Number(liveOverlay.time.tick) >= Number(world.time.tick))
      ? liveOverlay.time
      : world?.time;

  if (time === undefined) {
    return (
      <div className="world-clock" aria-label="World clock">
        <span>Year 0</span>
        <span>Spring</span>
        <span>Day 0</span>
      </div>
    );
  }

  const calendarDay = Number(time.day ?? Number(time.tick) * SEASON_LENGTH_DAYS);
  const dayOfSeason = time.dayOfSeason ?? 0;
  const seasonLengthDays = time.seasonLengthDays ?? SEASON_LENGTH_DAYS;

  return (
    <div className="world-clock" aria-label="World clock">
      <span>Year {time.year}</span>
      <span>
        {formatSeason(time.season)} day {dayOfSeason + 1}/{seasonLengthDays}
      </span>
      <span>Day {calendarDay}</span>
    </div>
  );
}

function formatSeason(season: string): string {
  return season.charAt(0).toUpperCase() + season.slice(1);
}
