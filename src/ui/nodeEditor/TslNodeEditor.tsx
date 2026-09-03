import { useCallback, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, X } from 'lucide-react'
import { useEditorStore } from '../../state/useEditorStore'
import type { SceneObject, TslNodeGraph, TslNodeType } from '../../types'
import { TSL_NODE_REGISTRY } from './compileTslGraph'
import { TslFlowNode } from './TslFlowNode'
import { NodeEditorActionsContext } from './nodeEditorContext'
import { NodePreviewPane } from './NodePreviewPane'
import {
  fromFlowEdges,
  fromFlowNodes,
  genFlowNodeId,
  toFlowEdges,
  toFlowNodes,
  type TslFlowNodeData,
} from './reactFlowAdapters'

const NODE_TYPES = { tsl: TslFlowNode }

const CATEGORY_ORDER = ['Entrada', 'Constante', 'Matemática', 'Saída']

// Full-screen overlay opened from Inspector.tsx's "Editar nós" button (see
// App.tsx's editingNodeGraphObjectId-driven swap, same idiom as
// CutsceneStudio's editingCutsceneId). Unlike CutsceneStudio, this doesn't
// need the live Editor3D canvas underneath — NodePreviewPane.tsx gives its
// own live preview — so it's a genuine opaque takeover (see .tsl-node-editor
// in App.css), rendered straight from App.tsx's top level rather than a
// createPortal (no ancestor backdrop-filter containing-block to escape,
// unlike ImportStudio.tsx).
export function TslNodeEditor() {
  const objectId = useEditorStore((s) => s.editingNodeGraphObjectId)
  const object = useEditorStore((s) => s.objects.find((o) => o.id === objectId))
  const graph = useEditorStore((s) => s.nodeGraphs.find((g) => g.id === object?.nodeGraphId))
  const closeNodeEditor = useEditorStore((s) => s.closeNodeEditor)

  if (!object || !graph) {
    // Shouldn't normally happen (Inspector only opens this after creating a
    // graph) — bail out to a dismissible blank state rather than crashing if
    // it ever does (e.g. the object/graph got deleted from another tab).
    return (
      <div className="tsl-node-editor">
        <div className="tsl-node-editor-topbar">
          <span>Nenhum objeto selecionado para editar</span>
          <button onClick={closeNodeEditor}>
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="tsl-node-editor">
      <ReactFlowProvider>
        <TslNodeEditorCanvas object={object} graph={graph} closeNodeEditor={closeNodeEditor} />
      </ReactFlowProvider>
    </div>
  )
}

function TslNodeEditorCanvas({
  object,
  graph,
  closeNodeEditor,
}: {
  object: SceneObject
  graph: TslNodeGraph
  closeNodeEditor: () => void
}) {
  const updateNodeGraph = useEditorStore((s) => s.updateNodeGraph)
  const { screenToFlowPosition } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TslFlowNodeData>>(toFlowNodes(graph.nodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(graph.edges))
  const [menu, setMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)

  const commitGraph = useCallback(() => {
    updateNodeGraph(graph.id, { nodes: fromFlowNodes(nodes), edges: fromFlowEdges(edges) })
  }, [updateNodeGraph, graph.id, nodes, edges])

  const updateParam = useCallback(
    (nodeId: string, key: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, [key]: value } } } : n)),
      )
    },
    [setNodes],
  )

  const actions = useMemo(() => ({ updateParam, commitGraph }), [updateParam, commitGraph])

  const onConnect = useCallback(
    (connection: Connection) => {
      // Every input socket in this v1 palette takes at most one wire — drop
      // any existing edge into the same target+targetHandle first, so
      // dragging a second wire onto an already-wired input visibly replaces
      // it instead of silently coexisting as a second, ignored connection
      // (resolveOutput in compileTslGraph.ts only ever reads the first
      // matching edge for a given input).
      const withoutExisting = edges.filter(
        (e) => !(e.target === connection.target && e.targetHandle === connection.targetHandle),
      )
      const nextEdges = addEdge(connection, withoutExisting)
      setEdges(nextEdges)
      updateNodeGraph(graph.id, { edges: fromFlowEdges(nextEdges) })
    },
    [edges, setEdges, updateNodeGraph, graph.id],
  )

  const onNodeDragStop = useCallback(() => {
    updateNodeGraph(graph.id, { nodes: fromFlowNodes(nodes) })
  }, [nodes, updateNodeGraph, graph.id])

  // Single handler for both node and edge deletion (Delete key or the
  // minimap/selection toolbar), via ReactFlow's combined `onDelete` rather
  // than separate onNodesDelete/onEdgesDelete: @xyflow/system's
  // deleteElements() fires onEdgesDelete with only the pre-removal `edges`
  // snapshot BEFORE applying any change, and onNodesDelete never touches
  // edges at all — using either alone either commits stale edges or leaves
  // dangling edges pointing at a deleted node, corrupting the persisted
  // graph (resolveOutput then throws "missing node" on every future
  // compile). `onDelete`'s `edges` argument already includes every edge
  // attached to a deleted node (computed by the library), so filtering both
  // lists from this one callback keeps nodes/edges atomically consistent.
  const onDelete = useCallback(
    ({ nodes: deletedNodes, edges: deletedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      const remainingNodes = nodes.filter((n) => !deletedNodes.some((d) => d.id === n.id))
      const remainingEdges = edges.filter((e) => !deletedEdges.some((d) => d.id === e.id))
      updateNodeGraph(graph.id, { nodes: fromFlowNodes(remainingNodes), edges: fromFlowEdges(remainingEdges) })
    },
    [nodes, edges, updateNodeGraph, graph.id],
  )

  const hasOutputNode = nodes.some((n) => n.data.nodeType === 'output')
  const paletteEntries = (Object.keys(TSL_NODE_REGISTRY) as TslNodeType[]).filter(
    (type) => type !== 'output' || !hasOutputNode,
  )

  const addNode = useCallback(
    (type: TslNodeType, flowPos: { x: number; y: number }) => {
      const def = TSL_NODE_REGISTRY[type]
      const params: Record<string, number | string> = {}
      for (const p of def.params) params[p.key] = p.defaultValue
      for (const i of def.inputs) params[i.name] = i.defaultValue
      const newNode: Node<TslFlowNodeData> = {
        id: genFlowNodeId(),
        type: 'tsl',
        position: flowPos,
        data: { nodeType: type, params },
      }
      const nextNodes = [...nodes, newNode]
      setNodes(nextNodes)
      updateNodeGraph(graph.id, { nodes: fromFlowNodes(nextNodes) })
      setMenu(null)
    },
    [nodes, setNodes, updateNodeGraph, graph.id],
  )

  return (
    <NodeEditorActionsContext.Provider value={actions}>
      <div className="tsl-node-editor-topbar">
        <span>Editando nós — {object.name}</span>
        <div className="tsl-node-editor-topbar-actions">
          <button
            onClick={(e) => {
              const rect = wrapperRef.current?.getBoundingClientRect()
              const x = rect ? rect.left + 24 : e.clientX
              const y = rect ? rect.top + 60 : e.clientY
              const flow = screenToFlowPosition({ x, y })
              setMenu({ x, y, flowX: flow.x, flowY: flow.y })
            }}
          >
            <span className="action-label">
              <Plus size={14} />
              Adicionar nó
            </span>
          </button>
          <button onClick={closeNodeEditor}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="tsl-node-editor-body" ref={wrapperRef}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onDelete={onDelete}
          nodeTypes={NODE_TYPES}
          onPaneContextMenu={(e) => {
            e.preventDefault()
            const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
            setMenu({ x: e.clientX, y: e.clientY, flowX: flow.x, flowY: flow.y })
          }}
          onPaneClick={() => setMenu(null)}
          colorMode="dark"
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>

        <NodePreviewPane nodes={nodes} edges={edges} materialType={object.materialType} />

        {menu && (
          <div className="context-menu tsl-node-add-menu" style={{ left: menu.x, top: menu.y }}>
            {CATEGORY_ORDER.map((category) => {
              const entries = paletteEntries.filter((type) => TSL_NODE_REGISTRY[type].category === category)
              if (entries.length === 0) return null
              return (
                <div key={category}>
                  <div className="tsl-node-add-menu-category">{category}</div>
                  {entries.map((type) => (
                    <button key={type} onClick={() => addNode(type, { x: menu.flowX, y: menu.flowY })}>
                      {TSL_NODE_REGISTRY[type].label}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </NodeEditorActionsContext.Provider>
  )
}
