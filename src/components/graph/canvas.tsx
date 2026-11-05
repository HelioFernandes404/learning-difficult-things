"use client";

import { useEffect, useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MASTERY_COLOR, type GEdgeDTO, type GNodeDTO, type Mastery } from "./types";

type KData = { title: string; mastery: Mastery; dim: boolean; glow: boolean; selected: boolean; compact: boolean } & Record<string, unknown>;

function nodeStyle(d: KData): React.CSSProperties {
  const c = MASTERY_COLOR[d.mastery];
  const base: React.CSSProperties = {
    color: d.mastery === "unseen" ? "var(--muted-foreground)" : "var(--foreground)",
    background: d.mastery === "unseen" ? "var(--background)" : `color-mix(in srgb, ${c} 16%, var(--background))`,
    border: `${d.selected ? 2.5 : 1.5}px ${d.mastery === "unseen" ? "dashed" : "solid"} ${c}`,
    opacity: d.dim ? 0.3 : 1,
    boxShadow: d.mastery === "misconception" ? `0 0 12px color-mix(in srgb, ${c} 55%, transparent)` : d.glow ? `0 0 14px color-mix(in srgb, var(--primary) 70%, transparent)` : undefined,
  };
  return base;
}

function KNode({ data }: NodeProps<Node<KData>>) {
  return (
    <div
      style={nodeStyle(data)}
      className={`flex items-center justify-center rounded-xl px-2.5 text-center leading-tight transition-opacity ${data.compact ? "h-[40px] w-[130px] text-[11px]" : "h-[52px] w-[180px] text-[13px]"}`}
      title={data.title}
    >
      <Handle type="target" position={Position.Left} className="!size-1 !border-0 !bg-transparent" />
      <span className="line-clamp-2 font-medium">{data.title}</span>
      <Handle type="source" position={Position.Right} className="!size-1 !border-0 !bg-transparent" />
    </div>
  );
}

const nodeTypes = { kn: KNode };

function edgeStyle(type: GEdgeDTO["type"], dim: boolean): Partial<Edge> {
  const op = dim ? 0.2 : 1;
  switch (type) {
    case "prerequisite":
      return { style: { stroke: "var(--foreground)", strokeWidth: 1.6, opacity: op }, markerEnd: { type: MarkerType.ArrowClosed, color: "var(--foreground)" } };
    case "related":
      return { style: { stroke: "var(--muted-foreground)", strokeDasharray: "6 4", strokeWidth: 1.2, opacity: op } };
    case "contrasts":
      return { style: { stroke: "var(--destructive)", strokeDasharray: "2 4", strokeWidth: 1.6, opacity: op } };
    case "part_of":
      return { style: { stroke: "var(--muted-foreground)", strokeWidth: 1.2, opacity: op }, markerEnd: { type: MarkerType.Arrow, color: "var(--muted-foreground)" } };
    case "example_of":
      return { style: { stroke: "var(--muted-foreground)", strokeDasharray: "8 3 2 3", strokeWidth: 1.2, opacity: op }, markerEnd: { type: MarkerType.Arrow, color: "var(--muted-foreground)" } };
  }
}

export function layout(nodes: GNodeDTO[], edges: GEdgeDTO[], compact: boolean) {
  const w = compact ? 130 : 180;
  const h = compact ? 40 : 52;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: compact ? 14 : 24, ranksep: compact ? 40 : 70 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: w, height: h });
  for (const e of edges) g.setEdge(e.fromId, e.toId);
  dagre.layout(g);
  return new Map(nodes.map((n) => {
    const p = g.node(n.id);
    return [n.id, { x: p.x - w / 2, y: p.y - h / 2 }] as const;
  }));
}

type Props = {
  nodes: GNodeDTO[];
  edges: GEdgeDTO[];
  highlight?: Set<string> | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  compact?: boolean;
};

function Inner({ nodes, edges, highlight, selectedId, onSelect, compact = false }: Props) {
  const rf = useReactFlow();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains("dark"));
    read();
    window.addEventListener("themechange", read);
    return () => window.removeEventListener("themechange", read);
  }, []);

  const pos = useMemo(() => layout(nodes, edges, compact), [nodes, edges, compact]);
  const rfNodes: Node<KData>[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "kn",
        position: pos.get(n.id) ?? { x: 0, y: 0 },
        data: { title: n.title, mastery: n.mastery, dim: !!highlight && !highlight.has(n.id), glow: !!highlight && highlight.has(n.id), selected: n.id === selectedId, compact },
      })),
    [nodes, pos, highlight, selectedId, compact],
  );
  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.fromId,
        target: e.toId,
        ...edgeStyle(e.type, !!highlight && !(highlight.has(e.fromId) && highlight.has(e.toId))),
      })),
    [edges, highlight, compact],
  );

  const sig = nodes.map((n) => n.id).join(",");
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.15, duration: 200 }), 50);
    return () => clearTimeout(t);
  }, [sig, rf]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      colorMode={dark ? "dark" : "light"}
      nodesDraggable={false}
      nodesConnectable={false}
      minZoom={0.2}
      fitView
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, n) => onSelect?.(n.id)}
    >
      {!compact && <Background gap={24} />}
      {!compact && <Controls showInteractive={false} />}
    </ReactFlow>
  );
}

export function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
