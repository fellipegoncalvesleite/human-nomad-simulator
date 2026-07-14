import { createServer } from "vite";

const server = await createServer({
  root: `${process.cwd()}/src`, configFile: false, appType: "custom",
  server: { middlewareMode: true }, logLevel: "error",
});

try {
  const { initSimWorld } = await server.ssrLoadModule("/sim/runner/simRunner.ts");
  const { deriveDemographicRenewal } = await server.ssrLoadModule("/sim/agents/demographicRenewal.ts");
  const baseWorld = initSimWorld({ kind: "map1" }, "demographic-renewal-audit");
  const source = Object.values(baseWorld.bands).sort((left, right) =>
    String(left.id).localeCompare(String(right.id)))[0];
  if (source === undefined) throw new Error("source band unavailable");

  const cases = [
    fixture("not-yet-measured", "not_yet_measured", [], {}),
    fixture("renewing", "renewing", [row(1, 2, 0), row(2, 1, 0), row(3, 2, 0)], {}),
    fixture("replacing-losses", "replacing_losses", [row(1, 1, 1), row(2, 1, 1), row(3, 1, 1)], {}),
    fixture("stable-aging", "stable_aging", [row(1, 1, 1), row(2, 1, 1), row(3, 1, 1)], {
      dependents: 4, workingAdults: 22, elders: 8,
    }),
    fixture("stalled", "demographically_stalled", [row(1, 0, 0), row(2, 0, 0), row(3, 0, 0), row(4, 0, 0), row(5, 0, 0)], {}),
    fixture("declining", "declining", [row(1, 0, 1), row(2, 0, 1), row(3, 1, 2)], {}),
    fixture("recovering", "recovering", [row(1, 0, 2), row(2, 0, 1), row(3, 1, 0), row(4, 1, 0)], {}),
    fixture("critical-remnant", "critical_remnant", [row(1, 0, 0)], {
      population: 9, dependents: 3, workingAdults: 5, elders: 1, viabilityStatus: "fragile",
    }),
    fixture("extinct", "extinct", [row(1, 0, 1)], {
      population: 0, dependents: 0, workingAdults: 0, elders: 0, viabilityStatus: "extinct",
    }),
  ];
  const repeated = cases.map((entry) => deriveDemographicRenewal(entry.band));
  const checks = {
    everyClassificationExpected: cases.every((entry) => entry.actual.kind === entry.expected),
    deterministic: cases.every((entry, index) =>
      JSON.stringify(entry.actual) === JSON.stringify(repeated[index])),
    projectionDoesNotMutateBand: cases.every((entry) => entry.before === JSON.stringify(entry.band)),
    causesExplicitlyOverlap: cases.every((entry) => entry.actual.causeCountsOverlap === true),
    reproductiveBasisNotInvented: cases.every((entry) =>
      entry.actual.limitations.some((text) => text.includes("not modeled separately"))),
  };
  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    check: "DEMOGRAPHIC-RENEWAL-PROJECTION",
    verdict: pass ? "PASS" : "FAIL",
    checks,
    cases: cases.map(({ name, expected, actual }) => ({
      name, expected, actual: actual.kind, label: actual.label, summary: actual.summary,
    })),
  }, null, 2));
  if (!pass) process.exitCode = 1;

  function fixture(name, expected, records, overrides) {
    const population = overrides.population ?? source.demography.population;
    const dependents = overrides.dependents ?? source.demography.dependents;
    const workingAdults = overrides.workingAdults ?? source.demography.workingAdults;
    const elders = overrides.elders ?? source.demography.elders;
    const births = records.reduce((total, record) => total + record.births, 0);
    const deaths = records.reduce((total, record) => total + record.deaths, 0);
    const net = records.reduce((total, record) => total + record.netPopulationChange, 0);
    const band = {
      ...source,
      size: population,
      demography: {
        ...source.demography,
        population, dependents, workingAdults, elders,
        demographicChurn: records.length === 0 ? undefined : {
          records,
          yearsSinceLastBirth: yearsSinceLast(records, (record) => record.births > 0),
          birthsLast10Years: births,
          deathsLast10Years: deaths,
          netPopulationChangeLast10Years: net,
        },
      },
      viability: {
        ...source.viability,
        population,
        status: overrides.viabilityStatus ?? "viable",
      },
    };
    const before = JSON.stringify(band);
    const actual = deriveDemographicRenewal(band);
    return { name, expected, band, before, actual };
  }
} finally {
  await server.close();
}

function row(year, births, deaths) {
  return {
    year, births, deaths, netPopulationChange: births - deaths,
    dependentsMatured: 0, adultsAged: 0, elderDeaths: deaths,
    dependentDeaths: 0, adultDeaths: 0, crisisDeaths: 0,
    waterStressDeaths: 0, starvationDeaths: 0, migrationHardshipDeaths: 0,
  };
}

function yearsSinceLast(records, predicate) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (predicate(records[index])) return records.length - index - 1;
  }
  return records.length;
}
