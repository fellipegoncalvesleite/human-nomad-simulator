// Quick sanity probe: run 60y on Map1, inspect band.deepHistory.
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
  logLevel: "error",
});

try {
  const generate = await server.ssrLoadModule("/src/sim/world/generate.ts");
  const advance = await server.ssrLoadModule("/src/sim/tick/advance.ts");
  const spawn = await server.ssrLoadModule("/src/sim/agents/spawn.ts");
  let world = spawn.spawnInitialBands(generate.createRegionalDebugWorld());

  for (let i = 0; i < 60 * 4; i += 1) {
    world = advance.advanceWorldOneSeason(world);
  }

  const bands = Object.values(world.bands).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  console.log("year", world.time.year, "bands", bands.length);

  for (const band of bands) {
    const dh = band.deepHistory;
    if (dh === undefined) { console.log(band.id, "NO deepHistory"); continue; }
    console.log(
      String(band.id).slice(0, 44).padEnd(44),
      "kind=" + dh.founding.kind,
      "eras=" + dh.eras.length,
      "open=" + (dh.openEra ? dh.openEra.startYear + "+" + dh.openEra.yearsAccumulated : "-"),
      "epis=" + dh.episodes.length,
      "inh=" + dh.inheritedEpisodes.length + "/" + dh.inheritedEraSummaries.length + "/" + dh.ancestryLine.length,
      "term=" + (dh.terminalRecord ? dh.terminalRecord.cause : "-"),
      "bytes=" + dh.payloadBytesEstimate,
      "capsHeld=" + dh.caps.capsHeld,
    );
  }

  const sample = bands.find((b) => b.deepHistory !== undefined && b.deepHistory.episodes.length > 0);
  if (sample) {
    console.log("\nSample episodes for", sample.id);
    for (const ep of sample.deepHistory.episodes.slice(0, 8)) {
      console.log(" ", ep.id, "|", ep.startYear + "-" + (ep.endYear ?? "…"), "| sev", ep.severity, "|", ep.summary);
    }
    const era = sample.deepHistory.eras[0];
    if (era) console.log("First era:", JSON.stringify(era, null, 1).slice(0, 600));
  }
} finally {
  await server.close();
}
