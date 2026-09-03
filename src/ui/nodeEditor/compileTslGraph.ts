import {
  add,
  clamp,
  cos,
  div,
  dot,
  float,
  mix,
  mul,
  normalLocal,
  normalView,
  normalWorld,
  oneMinus,
  pow,
  positionLocal,
  positionView,
  positionViewDirection,
  positionWorld,
  sin,
  sub,
  time,
  uv,
  vec3,
} from 'three/tsl'
import type { TslGraphNode, TslNodeGraph, TslNodeType } from '../../types'

// TSL node values are dynamically typed here — a graph's wiring isn't
// statically checked, and a node's real output type (float/vec2/vec3/...)
// only resolves inside the renderer's own shader-build pass, not
// synchronously in this compiler. Matches this repo's existing escape hatch
// for the same problem (see GridMaterial.ts's `type AnyNode = any`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyNode = any

const POSITION_BY_SPACE: Record<string, AnyNode> = {
  local: positionLocal,
  world: positionWorld,
  view: positionView,
  viewDirection: positionViewDirection,
}

const NORMAL_BY_SPACE: Record<string, AnyNode> = {
  local: normalLocal,
  world: normalWorld,
  view: normalView,
}

export interface TslInputSocket {
  name: string
  label: string
  // Literal fallback used when this input has no incoming edge — every
  // socket in v1 is float-typed for literal-editing purposes (vector inputs
  // like dot's a/b just take float(0) as a degenerate default, same "not
  // wired = 0" convention throughout).
  defaultValue: number
}

export interface TslOutputSocket {
  name: string
  label: string
  // Swizzle applied to the node's single compiled base value to produce
  // this socket's value; omitted means "the base value itself."
  swizzle?: 'x' | 'y' | 'z'
}

export interface TslParamSelectOption {
  value: string
  label: string
}

export interface TslParamDef {
  key: string
  label: string
  type: 'select'
  options: TslParamSelectOption[]
  defaultValue: string
}

export interface TslNodeDef {
  label: string
  category: string
  inputs: TslInputSocket[]
  outputs: TslOutputSocket[]
  params: TslParamDef[]
  compile: (inputs: Record<string, AnyNode>, params: Record<string, number | string>) => AnyNode
}

const SPACE_OPTIONS_POSITION: TslParamSelectOption[] = [
  { value: 'local', label: 'Local' },
  { value: 'world', label: 'World' },
  { value: 'view', label: 'View' },
  { value: 'viewDirection', label: 'View Direction' },
]

const SPACE_OPTIONS_NORMAL: TslParamSelectOption[] = [
  { value: 'local', label: 'Local' },
  { value: 'world', label: 'World' },
  { value: 'view', label: 'View' },
]

const binaryMath = (
  label: string,
  category: string,
  compile: (a: AnyNode, b: AnyNode) => AnyNode,
  defaultA = 0,
  defaultB = 0,
): TslNodeDef => ({
  label,
  category,
  inputs: [
    { name: 'a', label: 'A', defaultValue: defaultA },
    { name: 'b', label: 'B', defaultValue: defaultB },
  ],
  outputs: [{ name: 'result', label: 'Result' }],
  params: [],
  compile: (inputs) => compile(inputs.a, inputs.b),
})

const unaryMath = (
  label: string,
  category: string,
  compile: (x: AnyNode) => AnyNode,
  defaultValue = 0,
): TslNodeDef => ({
  label,
  category,
  inputs: [{ name: 'x', label: 'X', defaultValue }],
  outputs: [{ name: 'result', label: 'Result' }],
  params: [],
  compile: (inputs) => compile(inputs.x),
})

// Single source of truth for every placeable node type — label/category for
// the palette+node header, inputs/outputs for socket rendering in
// TslFlowNode.tsx, params for select-style config (currently just the
// position/normal space choice), and compile() to build the real `three/tsl`
// node tree. Mirrors primitives.ts's role for PrimitiveKind.
export const TSL_NODE_REGISTRY: Record<TslNodeType, TslNodeDef> = {
  uv: {
    label: 'UV',
    category: 'Entrada',
    inputs: [],
    outputs: [
      { name: 'x', label: 'X', swizzle: 'x' },
      { name: 'y', label: 'Y', swizzle: 'y' },
      { name: 'xy', label: 'XY' },
    ],
    params: [],
    compile: () => uv(),
  },
  time: {
    label: 'Tempo',
    category: 'Entrada',
    inputs: [],
    outputs: [{ name: 'value', label: 'Valor' }],
    params: [],
    compile: () => time,
  },
  position: {
    label: 'Posição',
    category: 'Entrada',
    inputs: [],
    outputs: [
      { name: 'x', label: 'X', swizzle: 'x' },
      { name: 'y', label: 'Y', swizzle: 'y' },
      { name: 'z', label: 'Z', swizzle: 'z' },
      { name: 'xyz', label: 'XYZ' },
    ],
    params: [{ key: 'space', label: 'Espaço', type: 'select', options: SPACE_OPTIONS_POSITION, defaultValue: 'world' }],
    compile: (_inputs, params) => POSITION_BY_SPACE[String(params.space ?? 'world')] ?? positionWorld,
  },
  normal: {
    label: 'Normal',
    category: 'Entrada',
    inputs: [],
    outputs: [
      { name: 'x', label: 'X', swizzle: 'x' },
      { name: 'y', label: 'Y', swizzle: 'y' },
      { name: 'z', label: 'Z', swizzle: 'z' },
      { name: 'xyz', label: 'XYZ' },
    ],
    params: [{ key: 'space', label: 'Espaço', type: 'select', options: SPACE_OPTIONS_NORMAL, defaultValue: 'world' }],
    compile: (_inputs, params) => NORMAL_BY_SPACE[String(params.space ?? 'world')] ?? normalWorld,
  },
  float: {
    label: 'Float',
    category: 'Constante',
    inputs: [],
    outputs: [{ name: 'value', label: 'Valor' }],
    params: [],
    compile: (_inputs, params) => float(Number(params.value ?? 0)),
  },
  vec3Combine: {
    label: 'Vec3 Combine',
    category: 'Constante',
    inputs: [
      { name: 'x', label: 'X', defaultValue: 0 },
      { name: 'y', label: 'Y', defaultValue: 0 },
      { name: 'z', label: 'Z', defaultValue: 0 },
    ],
    outputs: [{ name: 'xyz', label: 'XYZ' }],
    params: [],
    compile: (inputs) => vec3(inputs.x, inputs.y, inputs.z),
  },
  add: binaryMath('Add', 'Matemática', (a, b) => add(a, b)),
  sub: binaryMath('Sub', 'Matemática', (a, b) => sub(a, b)),
  mul: binaryMath('Mul', 'Matemática', (a, b) => mul(a, b), 1, 1),
  div: binaryMath('Div', 'Matemática', (a, b) => div(a, b), 0, 1),
  dot: binaryMath('Dot', 'Matemática', (a, b) => dot(a, b)),
  pow: binaryMath('Pow', 'Matemática', (base, exponent) => pow(base, exponent), 0, 2),
  oneMinus: unaryMath('One Minus', 'Matemática', (x) => oneMinus(x)),
  sin: unaryMath('Sin', 'Matemática', (x) => sin(x)),
  cos: unaryMath('Cos', 'Matemática', (x) => cos(x)),
  mix: {
    label: 'Mix',
    category: 'Matemática',
    inputs: [
      { name: 'a', label: 'A', defaultValue: 0 },
      { name: 'b', label: 'B', defaultValue: 1 },
      { name: 't', label: 'T', defaultValue: 0.5 },
    ],
    outputs: [{ name: 'result', label: 'Result' }],
    params: [],
    compile: (inputs) => mix(inputs.a, inputs.b, inputs.t),
  },
  clamp: {
    label: 'Clamp',
    category: 'Matemática',
    inputs: [
      { name: 'value', label: 'Valor', defaultValue: 0 },
      { name: 'low', label: 'Mín', defaultValue: 0 },
      { name: 'high', label: 'Máx', defaultValue: 1 },
    ],
    outputs: [{ name: 'result', label: 'Result' }],
    params: [],
    compile: (inputs) => clamp(inputs.value, inputs.low, inputs.high),
  },
  // Singleton — TslNodeEditor.tsx hides "add node" for this type once one
  // already exists in the graph. Never appears as an edge source (no output
  // sockets), so resolveNodeOutput below never calls this compile(); it
  // exists only so the registry stays the one source of truth the palette
  // and TslFlowNode read label/inputs from.
  output: {
    label: 'Material Output',
    category: 'Saída',
    inputs: [
      { name: 'color', label: 'Color', defaultValue: 0 },
      { name: 'position', label: 'Position', defaultValue: 0 },
    ],
    outputs: [],
    params: [],
    compile: () => {
      throw new Error('output node has no compiled value')
    },
  },
}

function findNode(graph: TslNodeGraph, id: string): TslGraphNode | undefined {
  return graph.nodes.find((n) => n.id === id)
}

// Recursively resolves one output socket of one node into a real TSL node
// value, memoizing each node's own compiled base value (so a base feeding
// two different swizzled outputs, or shared by two consumers, is only built
// once) and detecting cycles via `visiting`.
function resolveOutput(
  graph: TslNodeGraph,
  nodeId: string,
  handle: string,
  cache: Map<string, AnyNode>,
  visiting: Set<string>,
): AnyNode {
  const node = findNode(graph, nodeId)
  if (!node) throw new Error(`TSL graph: missing node ${nodeId}`)
  const def = TSL_NODE_REGISTRY[node.type]
  if (!def) throw new Error(`TSL graph: unknown node type ${node.type}`)

  let base = cache.get(nodeId)
  if (base === undefined) {
    if (visiting.has(nodeId)) throw new Error('TSL graph: cycle detected')
    visiting.add(nodeId)
    const resolvedInputs: Record<string, AnyNode> = {}
    for (const input of def.inputs) {
      const edge = graph.edges.find((e) => e.target === nodeId && e.targetHandle === input.name)
      resolvedInputs[input.name] = edge
        ? resolveOutput(graph, edge.source, edge.sourceHandle, cache, visiting)
        : float(Number(node.params[input.name] ?? input.defaultValue))
    }
    base = def.compile(resolvedInputs, node.params)
    visiting.delete(nodeId)
    cache.set(nodeId, base)
  }

  const outputSocket = def.outputs.find((o) => o.name === handle)
  return outputSocket?.swizzle ? base[outputSocket.swizzle] : base
}

// Compiles a graph into whatever material node slots its singleton `output`
// node has wired up. Never throws — an incomplete/invalid graph (mid-edit,
// a cycle, a missing upstream node) just yields {} so SceneObjectMesh.tsx
// falls back to its existing buildWeatheringNode behavior. Does NOT catch
// shader-level type-mismatch errors — those only surface later, inside the
// renderer's own build pass, as a console error rather than a JS exception.
export function compileTslGraph(graph: TslNodeGraph): { colorNode?: AnyNode; positionNode?: AnyNode } {
  try {
    const outputNode = graph.nodes.find((n) => n.type === 'output')
    if (!outputNode) return {}
    const cache = new Map<string, AnyNode>()
    const visiting = new Set<string>()

    const colorEdge = graph.edges.find((e) => e.target === outputNode.id && e.targetHandle === 'color')
    const positionEdge = graph.edges.find((e) => e.target === outputNode.id && e.targetHandle === 'position')

    const result: { colorNode?: AnyNode; positionNode?: AnyNode } = {}
    // Unconditionally wrapped in vec3(...): TSL's vec3(x) broadcasts a float
    // to all 3 channels and passes an existing vec3 through unchanged, so
    // this one rule covers both a scalar result (e.g. a fresnel term) and an
    // already-vec3 result (e.g. a vec3Combine) without needing to inspect
    // the resolved node's type, which isn't reliably possible synchronously
    // (real node types only resolve inside the renderer's build pass).
    if (colorEdge) {
      result.colorNode = vec3(resolveOutput(graph, colorEdge.source, colorEdge.sourceHandle, cache, visiting))
    }
    if (positionEdge) {
      result.positionNode = resolveOutput(graph, positionEdge.source, positionEdge.sourceHandle, cache, visiting)
    }
    return result
  } catch (err) {
    console.warn('[TslNodeEditor] failed to compile node graph', err)
    return {}
  }
}
