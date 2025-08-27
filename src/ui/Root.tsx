import { lazy, Suspense, useEffect, useState } from "react";

import { App } from "./App";

// The Architecture Map pulls in d3 (force/zoom/drag/selection) plus a large
// graph dataset that simulation-only users never touch. Code-split it so its
// chunk loads on demand when the user opens #/architecture, keeping it out of
// the initial bundle.
const ArchitectureMapPage = lazy(() =>
  import("../architecture/ArchitectureMapPage").then((module) => ({
    default: module.ArchitectureMapPage,
  })),
);

type RootView = "simulation" | "architecture";

function viewFromHash(hash: string): RootView {
  return hash.replace(/^#\/?/, "") === "architecture" ? "architecture" : "simulation";
}

/**
 * Top-level shell that switches between the simulation and the Architecture Map.
 * Uses hash routing so `#/architecture` is a real, shareable location without
 * pulling in a router dependency.
 */
export function Root() {
  const [view, setView] = useState<RootView>(() => viewFromHash(window.location.hash));

  useEffect(() => {
    function handleHashChange() {
      setView(viewFromHash(window.location.hash));
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function navigate(next: RootView) {
    window.location.hash = next === "architecture" ? "/architecture" : "/";
    setView(next);
  }

  return (
    <div className="root-shell">
      <nav className="root-nav" aria-label="Primary">
        <span className="root-brand">
          Emergent Civilization
          <span className="root-tagline">A living prehistory</span>
        </span>
        <div className="root-tabs">
          <button
            type="button"
            className={view === "simulation" ? "root-tab active" : "root-tab"}
            aria-pressed={view === "simulation"}
            onClick={() => navigate("simulation")}
          >
            Simulation
          </button>
          <button
            type="button"
            className={view === "architecture" ? "root-tab active" : "root-tab"}
            aria-pressed={view === "architecture"}
            onClick={() => navigate("architecture")}
          >
            Architecture Map
          </button>
        </div>
      </nav>

      <div className="root-view">
        {view === "architecture" ? (
          <Suspense
            fallback={
              <div className="root-loading" role="status">
                Loading architecture map…
              </div>
            }
          >
            <ArchitectureMapPage />
          </Suspense>
        ) : (
          <App />
        )}
      </div>
    </div>
  );
}
