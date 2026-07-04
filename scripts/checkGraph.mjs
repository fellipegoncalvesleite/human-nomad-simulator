// Architecture-graph integrity check (REALISM-2B).
//
// The living architecture graph (src/architecture/graphData.ts) is hand-maintained.
// Checkpoint reports quote "graph N/L, 0 dup, 0 dangling" but it was previously
// eyeballed. This makes it reproducible: it loads the real NODES/LINKS through Vite SSR
// (same mechanism as scripts/simBenchmark.mjs) and asserts:
//   - every node id is unique (0 duplicates);
//   - every link source/target references an existing node id (0 dangling).
// Prints "graph <nodes>/<links>, <dup> dup, <dangling> dangling" and exits non-zero on
// any violation.

import { createServer } from "vite";

async function main() {
  const server = await createServer({
    configFile: false,
    appType: "custom",
    root: new URL("../src", import.meta.url).pathname,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
  });

  try {
    const graph = await server.ssrLoadModule("/architecture/graphData.ts");
    const nodes = graph.NODES ?? [];
    const links = graph.LINKS ?? [];

    const idCounts = new Map();
    for (const node of nodes) {
      idCounts.set(node.id, (idCounts.get(node.id) ?? 0) + 1);
    }
    const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);

    const knownIds = new Set(idCounts.keys());
    const danglingLinks = links
      .filter((link) => !knownIds.has(link.source) || !knownIds.has(link.target))
      .map((link) => `${link.source}->${link.target}`);

    const ok = duplicateIds.length === 0 && danglingLinks.length === 0;
    const result = {
      check: "architecture graph integrity",
      verdict: ok ? "pass" : "fail",
      nodes: nodes.length,
      links: links.length,
      duplicateIds,
      danglingLinks,
      summary: `graph ${nodes.length}/${links.length}, ${duplicateIds.length} dup, ${danglingLinks.length} dangling`,
    };

    console.log(JSON.stringify(result, null, 2));
    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
