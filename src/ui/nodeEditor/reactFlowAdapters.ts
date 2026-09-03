import type { Edge, Node } from '@xyflow/react'
import type { TslGraphEdge, TslGraphNode, TslNodeGraph, TslNodeType } from '../../types'

// Our own persisted shape (TslGraphNode/TslGraphEdge, saved via
// updateNodeGraph) is intentionally decoupled from @xyflow/react's Node/Edge
// types — so a future library swap or a change to their internal shape
// can't silently corrupt saved scene data. These two pairs of functions are
// the only place that conversion happens.

export interface TslFlowNodeData {
  nodeType: TslNodeType
  params: Record<string, number | string>
  [key: string]: unknown
}

// Same guarded pattern as useEditorStore.ts's genId/assetStore.ts's
// genAssetId — crypto.randomUUID() throws outright in a non-secure context
// or older browser instead of being merely absent, so every id generator in
// this codebase falls back rather than crashing the action that calls it.
export function genFlowNodeId(): string {
  const unique =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `node-${unique}`
}

export function toFlowNodes(nodes: TslGraphNode[]): Node<TslFlowNodeData>[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'tsl',
    position: { x: n.position[0], y: n.position[1] },
    data: { nodeType: n.type, params: n.params },
  }))
}

export function toFlowEdges(edges: TslGraphEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle,
  }))
}

export function fromFlowNodes(nodes: Node<TslFlowNodeData>[]): TslGraphNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.data.nodeType,
    position: [n.position.x, n.position.y],
    params: n.data.params,
  }))
}

export function fromFlowEdges(edges: Edge[]): TslGraphEdge[] {
  return edges
    .filter((e) => e.sourceHandle && e.targetHandle)
    .map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle as string,
      target: e.target,
      targetHandle: e.targetHandle as string,
    }))
}

// A cheap structural signature (node types/params/positions of param-driving
// fields + edges — NOT node canvas x/y) used to memoize graph compilation so
// dragging a node around doesn't retrigger a recompile on every frame; only
// changes that could actually affect the compiled TSL tree do.
export function graphStructureKey(graph: Pick<TslNodeGraph, 'nodes' | 'edges'>): string {
  const nodesKey = graph.nodes.map((n) => `${n.id}:${n.type}:${JSON.stringify(n.params)}`).join('|')
  const edgesKey = graph.edges
    .map((e) => `${e.source}.${e.sourceHandle}->${e.target}.${e.targetHandle}`)
    .join('|')
  return `${nodesKey}##${edgesKey}`
}
