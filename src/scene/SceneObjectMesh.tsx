import { forwardRef, useEffect, useRef, type RefObject } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import {
  BackSide,
  DoubleSide,
  FrontSide,
  type Mesh,
  type MeshLambertMaterial,
  type MeshPhongMaterial,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type MeshToonMaterial,
  type Side,
} from 'three'
import type { MaterialSide, SceneObject, ShadowMode } from '../types'
import { useEditorStore } from '../state/useEditorStore'
import { usePointerClick } from './usePointerClick'
import { PRIMITIVE_BASE_SIZE } from './primitives'

const MATERIAL_SIDE: Record<MaterialSide, Side> = {
  front: FrontSide,
  back: BackSide,
  double: DoubleSide,
}

type AnyMeshMaterial =
  | MeshStandardMaterial
  | MeshLambertMaterial
  | MeshPhongMaterial
  | MeshPhysicalMaterial
  | MeshToonMaterial

// Each shading model is a distinct three.js class, so R3F needs a distinct
// JSX tag per type (unlike a prop, the element name can't be swapped
// dynamically) — but they share this common prop set, which every listed
// material class accepts (unused props on a given class are simply ignored,
// not an error).
function Material({
  object,
  isSelected,
  materialRef,
}: {
  object: SceneObject
  isSelected: boolean
  materialRef: RefObject<AnyMeshMaterial | null>
}) {
  const commonProps = {
    ref: materialRef as never,
    color: object.color,
    emissive: isSelected ? '#3a6df0' : '#000000',
    emissiveIntensity: isSelected ? 0.35 : 0,
    wireframe: object.wireframe,
    flatShading: object.flatShading,
    side: MATERIAL_SIDE[object.side],
  }
  switch (object.materialType) {
    case 'lambert':
      return <meshLambertMaterial {...commonProps} />
    case 'phong':
      return <meshPhongMaterial {...commonProps} />
    case 'physical':
      return <meshPhysicalMaterial {...commonProps} />
    case 'toon':
      return <meshToonMaterial {...commonProps} />
    default:
      return <meshStandardMaterial {...commonProps} />
  }
}

function shadowProps(mode: ShadowMode) {
  return {
    castShadow: mode === 'cast' || mode === 'both',
    receiveShadow: mode === 'receive' || mode === 'both',
  }
}

function Geometry({ kind }: { kind: SceneObject['kind'] }) {
  const [w, h, d] = PRIMITIVE_BASE_SIZE[kind]
  switch (kind) {
    case 'box':
      return <boxGeometry args={[w, h, d]} />
    case 'sphere':
      return <sphereGeometry args={[w / 2, 32, 32]} />
    case 'cylinder':
      return <cylinderGeometry args={[w / 2, w / 2, h, 32]} />
    case 'cone':
      return <coneGeometry args={[w / 2, h, 32]} />
    case 'plane':
      return <boxGeometry args={[w, h, d]} />
  }
}

export const SceneObjectMesh = forwardRef<Mesh, { object: SceneObject }>(
  function SceneObjectMesh({ object }, ref) {
    const selectedId = useEditorStore((s) => s.selectedId)
    const select = useEditorStore((s) => s.select)
    const group = useEditorStore((s) =>
      object.groupId ? s.groups.find((g) => g.id === object.groupId) : undefined,
    )
    const isSelected = selectedId === object.id

    const { onPointerDown, onPointerUp } = usePointerClick((e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      select(object.id)
    })

    // `wireframe`/`flatShading` change which shader variant the material
    // compiles to — R3F's generic prop-setting updates the flags but doesn't
    // know to force a recompile, so the old compiled pipeline keeps
    // rendering until `needsUpdate` is set explicitly.
    const materialRef = useRef<AnyMeshMaterial>(null)
    useEffect(() => {
      if (materialRef.current) materialRef.current.needsUpdate = true
    }, [object.wireframe, object.flatShading, object.materialType])

    // Three.js raycasting ignores `visible` (only rendering respects it), so
    // a hidden object would still be clickable/draggable if just toggled via
    // a `visible` prop. Skipping the mesh entirely instead removes it from
    // both rendering and hit-testing, and un-registers its ref (no gizmo/
    // outline can target it while hidden, which is the point). Hiding the
    // owning group cascades the same way, even without real 3D parenting.
    if (object.hidden || group?.hidden) return null

    return (
      <mesh
        ref={ref}
        name={object.id}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        {...shadowProps(object.shadowMode)}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <Geometry kind={object.kind} />
        <Material object={object} isSelected={isSelected} materialRef={materialRef} />
      </mesh>
    )
  },
)
