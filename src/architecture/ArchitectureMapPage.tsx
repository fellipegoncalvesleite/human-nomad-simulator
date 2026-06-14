import { useEffect, useMemo, useRef, useState } from "react";
import { drag as d3Drag, type D3DragEvent } from "d3-drag";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import { select } from "d3-selection";
import { zoom as d3Zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";

import "./architecture.css";
import {
  CLUSTER_LABELS,
  CODING_AI_REMINDER,
  COLORS,
  LINK_STYLES,
  LINKS,
  NODES,
  PROJECT_MEMORY_REMINDER,
  VIEWS,
  clusterPosition,
  visibleGraph,
  wrapLabel,
} from "./graphData";
import type {
  ClusterKey,
  GraphLink,
  GraphNode,
  LinkType,
  SimLink,
  SimNode,
  VisibleGraph,
  ViewKey,
} from "./graphData";
import { downloadGraphJson, exportSvgToPng } from "./exportGraph";

const CLUSTER_KEYS = Object.keys(CLUSTER_LABELS) as ClusterKey[];
const LINK_KEYS = Object.keys(LINK_STYLES) as LinkType[];
const VIEW_KEYS = Object.keys(VIEWS) as ViewKey[];

export function ArchitectureMapPage() {
  const [viewKey, setViewKey] = useState<ViewKey>("current");
  const [query, setQuery] = useState("");
  const [showLinkLabels, setShowLinkLabels] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("terrain");
  const [renderNodes, setRenderNodes] = useState<SimNode[]>([]);
  const [renderLinks, setRenderLinks] = useState<SimLink[]>([]);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const nodeLayerRef = useRef<SVGGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);

  const graph = useMemo<VisibleGraph>(() => visibleGraph(viewKey, query), [viewKey, query]);
  const selectedNode = useMemo<GraphNode | undefined>(
    () => NODES.find((n) => n.id === selectedId) ?? graph.nodes[0],
    [selectedId, graph.nodes],
  );

  // Zoom / pan behavior on the svg.
  useEffect(() => {
    const svgEl = svgRef.current;
    const gEl = gRef.current;

    if (svgEl === null || gEl === null) {
      return undefined;
    }

    const svg = select<SVGSVGElement, unknown>(svgEl);
    const zoom = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.22, 3.2])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        select(gEl).attr("transform", event.transform.toString());
      });

    svg.call(zoom);
    svg.call(zoom.transform, zoomIdentity);

    return () => {
      svg.on(".zoom", null);
    };
  }, [viewKey]);

  // Force simulation — this is what makes nodes repel and settle when moved.
  useEffect(() => {
    const width = svgRef.current?.clientWidth ?? 1200;
    const height = svgRef.current?.clientHeight ?? 760;

    const simNodes: SimNode[] = graph.nodes.map((node, i) => {
      const [cx, cy] = clusterPosition(node.cluster, width, height);
      const angle = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2;

      return {
        ...node,
        radius: node.size,
        x: cx + Math.cos(angle) * 80,
        y: cy + Math.sin(angle) * 80,
      };
    });

    const simLinks: SimLink[] = graph.links.map((link) => ({ ...link }));

    simRef.current?.stop();

    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => {
            if (d.type === "risk") return 160;
            if (d.type === "bridge") return 110;
            if (d.type === "feedback") return 130;
            return 95;
          })
          .strength((d) => (d.type === "bridge" ? 0.72 : d.type === "risk" ? 0.42 : 0.55)),
      )
      .force("charge", forceManyBody<SimNode>().strength((d) => (d.central === true ? -620 : -390)))
      .force("collision", forceCollide<SimNode>().radius((d) => d.radius + 34).iterations(2))
      .force("x", forceX<SimNode>((d) => clusterPosition(d.cluster, width, height)[0]).strength(0.055))
      .force("y", forceY<SimNode>((d) => clusterPosition(d.cluster, width, height)[1]).strength(0.055))
      .force("center", forceCenter<SimNode>(width / 2, height / 2).strength(0.035));

    let frame = 0;

    simulation.on("tick", () => {
      frame += 1;

      if (frame % 2 === 0) {
        setRenderNodes([...simNodes]);
        setRenderLinks([...simLinks]);
      }
    });

    simulation.alpha(1).restart();
    simRef.current = simulation;
    setRenderNodes([...simNodes]);
    setRenderLinks([...simLinks]);

    return () => {
      simulation.stop();
    };
  }, [graph.nodes, graph.links]);

  // Drag behavior on rendered node groups.
  useEffect(() => {
    const layer = nodeLayerRef.current;
    const simulation = simRef.current;

    if (layer === null || simulation === null) {
      return undefined;
    }

    const drag = d3Drag<SVGGElement, unknown, SimNode>()
      .subject(function (this: SVGGElement) {
        const id = this.getAttribute("data-node-id");

        return simulation.nodes().find((d) => d.id === id) as SimNode;
      })
      .on("start", (event: D3DragEvent<SVGGElement, unknown, SimNode>) => {
        if (!event.active) simulation.alphaTarget(0.25).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on("drag", (event: D3DragEvent<SVGGElement, unknown, SimNode>) => {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      })
      .on("end", (event: D3DragEvent<SVGGElement, unknown, SimNode>) => {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      });

    select(layer).selectAll<SVGGElement, unknown>("g.ag-node").call(drag);

    return () => {
      select(layer).selectAll<SVGGElement, unknown>("g.ag-node").on(".drag", null);
    };
  }, [renderNodes]);

  const clusterCounts = useMemo<Partial<Record<ClusterKey, number>>>(() => {
    const counts: Partial<Record<ClusterKey, number>> = {};

    graph.nodes.forEach((n) => {
      counts[n.cluster] = (counts[n.cluster] ?? 0) + 1;
    });

    return counts;
  }, [graph.nodes]);

  const linkCounts = useMemo<Partial<Record<LinkType, number>>>(() => {
    const counts: Partial<Record<LinkType, number>> = {};

    graph.links.forEach((l) => {
      counts[l.type] = (counts[l.type] ?? 0) + 1;
    });

    return counts;
  }, [graph.links]);

  function handleExportPng() {
    const svg = svgRef.current;

    if (svg === null) {
      return;
    }

    setExportNote("Rendering PNG…");
    exportSvgToPng(svg, "architecture-map.png")
      .then(() => setExportNote("PNG exported."))
      .catch((error: unknown) =>
        setExportNote(error instanceof Error ? `PNG failed: ${error.message}` : "PNG export failed."),
      );
  }

  function handleExportJson() {
    downloadGraphJson({ nodes: NODES, links: LINKS }, "architecture-graph.json");
    setExportNote("Graph data exported as JSON.");
  }

  return (
    <div className="ag-root">
      <div className="ag-topbar">
        <div className="ag-topbar-main">
          <div className="ag-kicker">Obsidian-style architecture graph · Project memory</div>
          <h1 className="ag-title">Emergent Civilization Simulator — Ecology Architecture</h1>
          <p className="ag-sub">
            Force-directed node map with current systems, missing bridge systems, future ecology systems, risk nodes,
            and typed dependency links.
          </p>
        </div>

        <div className="ag-topbar-side">
          <div className="ag-views">
            {VIEW_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={viewKey === key ? "ag-view-btn active" : "ag-view-btn"}
                aria-pressed={viewKey === key}
                onClick={() => setViewKey(key)}
              >
                {VIEWS[key].label}
              </button>
            ))}
          </div>
          <div className="ag-export">
            <button type="button" onClick={handleExportPng}>
              Export PNG
            </button>
            <button type="button" onClick={handleExportJson}>
              Export JSON
            </button>
            <button type="button" onClick={() => window.print()}>
              Print / PDF
            </button>
            {exportNote === null ? null : <span className="ag-export-note">{exportNote}</span>}
          </div>
        </div>
      </div>

      <div className="ag-reminders" role="note">
        <p>
          <strong>Keep this current.</strong> {PROJECT_MEMORY_REMINDER}
        </p>
        <p>
          <strong>For Codex / Claude.</strong> {CODING_AI_REMINDER}
        </p>
      </div>

      <div className="ag-grid">
        <aside className="ag-aside">
          <div className="ag-aside-title">Current View</div>
          <div className="ag-aside-desc">{VIEWS[viewKey].description}</div>

          <div className="ag-field">
            <label className="ag-label" htmlFor="ag-search">
              Search nodes / links
            </label>
            <input
              id="ag-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="poison, catchment, religion…"
              className="ag-input"
            />
          </div>

          <div className="ag-toggle-row">
            <span>Show link labels</span>
            <button
              type="button"
              className={showLinkLabels ? "ag-toggle on" : "ag-toggle"}
              aria-pressed={showLinkLabels}
              onClick={() => setShowLinkLabels((v) => !v)}
            >
              {showLinkLabels ? "On" : "Off"}
            </button>
          </div>

          <div className="ag-legend-section">
            <div className="ag-legend-title">Color Legend</div>
            <div className="ag-legend-list">
              {CLUSTER_KEYS.map((key) => (
                <div key={key} className="ag-legend-row">
                  <span className="ag-legend-left">
                    <span className="ag-dot" style={{ background: COLORS[key] }} />
                    <span>{CLUSTER_LABELS[key]}</span>
                  </span>
                  <span className="ag-count">{clusterCounts[key] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ag-legend-section">
            <div className="ag-legend-title">Link Types</div>
            <div className="ag-legend-list">
              {LINK_KEYS.map((key) => {
                const style = LINK_STYLES[key];

                return (
                  <div key={key} className="ag-linktype-row">
                    <svg width="58" height="10" aria-hidden>
                      <line x1="2" y1="5" x2="55" y2="5" stroke={style.color} strokeWidth={style.width} strokeDasharray={style.dash} />
                    </svg>
                    <span>{style.label}</span>
                    <span className="ag-count">{linkCounts[key] ?? 0}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="ag-main">
          <div className="ag-hint">Drag nodes · Scroll/pinch to zoom · Drag empty space to pan</div>
          <svg ref={svgRef} className="ag-svg">
            <defs>
              {LINK_KEYS.map((key) => {
                const style = LINK_STYLES[key];

                return (
                  <marker
                    key={key}
                    id={`ag-arrow-${key}`}
                    viewBox="0 -5 10 10"
                    refX="26"
                    refY="0"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M0,-5L10,0L0,5" fill={style.color} opacity="0.95" />
                  </marker>
                );
              })}
              <filter id="ag-label-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#020617" floodOpacity="0.85" />
              </filter>
            </defs>
            <g ref={gRef}>
              <g>
                {renderLinks.map((l, i) => {
                  const s = l.source as SimNode;
                  const t = l.target as SimNode;

                  if (s == null || t == null || s.x == null || t.x == null) {
                    return null;
                  }

                  const style = LINK_STYLES[l.type];
                  const midX = ((s.x ?? 0) + (t.x ?? 0)) / 2;
                  const midY = ((s.y ?? 0) + (t.y ?? 0)) / 2;

                  return (
                    <g key={`${s.id}-${t.id}-${i}`}>
                      <line
                        x1={s.x}
                        y1={s.y}
                        x2={t.x}
                        y2={t.y}
                        stroke={style.color}
                        strokeWidth={style.width}
                        strokeDasharray={style.dash}
                        strokeOpacity={l.type === "risk" ? 0.8 : 0.62}
                        markerEnd={`url(#ag-arrow-${l.type})`}
                      />
                      {showLinkLabels ? (
                        <text x={midX} y={midY} textAnchor="middle" className="ag-link-label" filter="url(#ag-label-shadow)">
                          {style.label}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>

              <g ref={nodeLayerRef}>
                {renderNodes.map((n) => {
                  const isSelected = selectedNode?.id === n.id;
                  const labelLines = wrapLabel(n.label, n.radius > 22 ? 16 : 13);

                  return (
                    <g
                      key={n.id}
                      data-node-id={n.id}
                      className="ag-node"
                      transform={`translate(${n.x ?? 0}, ${n.y ?? 0})`}
                      onClick={() => setSelectedId(n.id)}
                    >
                      <title>{`${n.label} — ${n.status}`}</title>
                      <circle
                        r={n.radius}
                        fill={COLORS[n.cluster]}
                        fillOpacity={n.scope === "risk" ? 0.2 : 0.24}
                        stroke={COLORS[n.cluster]}
                        strokeWidth={isSelected ? 4 : n.central === true ? 2.8 : 1.7}
                      />
                      <circle r={Math.max(4, n.radius * 0.22)} fill={COLORS[n.cluster]} opacity="0.9" />
                      <text y={n.radius + 15} textAnchor="middle" className="ag-node-label" filter="url(#ag-label-shadow)">
                        {labelLines.map((line, idx) => (
                          <tspan key={line + idx} x="0" dy={idx === 0 ? 0 : 11}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
        </main>

        <aside className="ag-aside">
          <div className="ag-aside-eyebrow">Selected Node</div>
          {selectedNode === undefined ? (
            <div className="ag-aside-desc">Select a node.</div>
          ) : (
            <div className="ag-detail">
              <div className="ag-detail-head">
                <span className="ag-detail-dot" style={{ background: COLORS[selectedNode.cluster] }} />
                <div>
                  <h2 className="ag-detail-title">{selectedNode.label}</h2>
                  <div className="ag-detail-status">{selectedNode.status}</div>
                </div>
              </div>
              <p className="ag-detail-summary">{selectedNode.summary}</p>

              <NodeConnections nodeId={selectedNode.id} links={graph.links} direction="out" title="Outgoing Links" />
              <NodeConnections nodeId={selectedNode.id} links={graph.links} direction="in" title="Incoming Links" />
            </div>
          )}

          <div className="ag-spine">
            <div className="ag-spine-title">Final architecture spine</div>
            <div className="ag-spine-body">
              Resource / Animal / Water Ecology → Knowledge → Risk / Labor / Return → Memory → Movement / Demography →
              Culture / Settlement / History
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const ID_TO_NODE = new Map<string, GraphNode>(NODES.map((n) => [n.id, n]));

function NodeConnections({
  nodeId,
  links,
  direction,
  title,
}: {
  readonly nodeId: string;
  readonly links: readonly GraphLink[];
  readonly direction: "in" | "out";
  readonly title: string;
}) {
  const related = useMemo(
    () =>
      links
        .filter((l) => (direction === "out" ? l.source === nodeId : l.target === nodeId))
        .slice(0, 9)
        .map((l) => ({ link: l, other: ID_TO_NODE.get(direction === "out" ? l.target : l.source) })),
    [nodeId, links, direction],
  );

  return (
    <div className="ag-conn">
      <div className="ag-conn-title">{title}</div>
      {related.length === 0 ? (
        <div className="ag-conn-empty">No visible links in this view.</div>
      ) : (
        <div className="ag-conn-list">
          {related.map(({ link, other }, idx) => {
            const style = LINK_STYLES[link.type];

            return (
              <div key={`${link.type}-${other?.id ?? "x"}-${idx}`} className="ag-conn-item">
                <div className="ag-conn-item-head">
                  <span className="ag-dot-sm" style={{ background: other ? COLORS[other.cluster] : style.color }} />
                  <span>{other?.label ?? "Unknown"}</span>
                </div>
                <div className="ag-conn-note">
                  <span style={{ color: style.color }}>{style.label}</span>
                  {link.note ? ` — ${link.note}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
