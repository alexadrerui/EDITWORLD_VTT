import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { SphereGeometry, NeutralToneMapping } from 'three'
import { MeshLambertNodeMaterial, MeshPhongNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, MeshToonNodeMaterial, WebGPURenderer, type NodeMaterial } from 'three/webgpu'
import type { Edge, Node } from '@xyflow/react'
import type { MaterialType } from '../../types'
import { compileTslGraph } from './compileTslGraph'
import { fromFlowEdges, fromFlowNodes, graphStructureKey, type TslFlowNodeData } from './reactFlowAdapters'

const MATERIAL_CLASS: Record<MaterialType, new () => NodeMaterial> = {
  standard: MeshStandardNodeMaterial,
  lambert: MeshLambertNodeMaterial,
  phong: MeshPhongNodeMaterial,
  physical: MeshPhysicalNodeMaterial,
  toon: MeshToonNodeMaterial,
}

const PREVIEW_GEOMETRY = new SphereGeometry(1, 48, 32)

// Small self-contained R3F canvas (own renderer, own scene) — zero-latency
// live preview of the graph currently being edited, reading TslNodeEditor's
// local @xyflow/react node/edge state directly (not the store), so it
// updates on every keystroke/drag without waiting for a checkpoint commit.
// A generic sphere, not the actual selected object's geometry — this repo's
// primitive geometry construction (see Geometry in SceneObjectMesh.tsx)
// isn't factored out for reuse outside that file, and a plain sphere is the
// standard shader-preview convention (Blender's shader editor does the
// same), so reproducing the real object's shape wasn't worth the extra
// coupling for v1.
export function NodePreviewPane({
  nodes,
  edges,
  materialType,
}: {
  nodes: Node<TslFlowNodeData>[]
  edges: Edge[]
  materialType: MaterialType
}) {
  // Converted exactly once per actual nodes/edges reference change (not
  // twice — graphStructureKey below reads these same converted arrays
  // rather than re-deriving them from `nodes`/`edges` a second time).
  const convertedNodes = useMemo(() => fromFlowNodes(nodes), [nodes])
  const convertedEdges = useMemo(() => fromFlowEdges(edges), [edges])
  // Structural signature (types/params/edges, NOT canvas x/y) — stable
  // across a pure node-drag, so the actual compile below only reruns when
  // something that could change the compiled shader changes.
  const structureKey = graphStructureKey({ nodes: convertedNodes, edges: convertedEdges })
  const compiled = useMemo(
    () => compileTslGraph({ id: 'preview', name: 'preview', nodes: convertedNodes, edges: convertedEdges }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey],
  )

  return (
    <div className="tsl-preview-pane">
      <Canvas
        camera={{ position: [0, 0, 3], fov: 45 }}
        gl={async ({ canvas }) => {
          const renderer = new WebGPURenderer({
            canvas: canvas as HTMLCanvasElement,
            antialias: true,
            forceWebGL: false,
          })
          renderer.toneMapping = NeutralToneMapping
          await renderer.init()
          return renderer
        }}
      >
        <PreviewSphere materialType={materialType} colorNode={compiled.colorNode} positionNode={compiled.positionNode} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 4, 5]} intensity={2.5} />
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  )
}

function PreviewSphere({
  materialType,
  colorNode,
  positionNode,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}: {
  materialType: MaterialType
  colorNode: any
  positionNode: any
}) {
  const material = useMemo(() => new MATERIAL_CLASS[materialType](), [materialType])
  const meshRef = useRef<import('three').Mesh>(null)

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    material.colorNode = colorNode ?? null
    material.positionNode = positionNode ?? null
    material.needsUpdate = true
  }, [material, colorNode, positionNode])

  // Slow auto-rotate so an animated (time-driven) graph like the wobble
  // example is visibly alive even before the user drags to orbit.
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.3
  })

  return <mesh ref={meshRef} geometry={PREVIEW_GEOMETRY} material={material} />
}
