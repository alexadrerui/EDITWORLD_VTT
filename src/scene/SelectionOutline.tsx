import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, EdgesGeometry, type Group, type Mesh, Vector3 } from 'three'
import type { SceneObject } from '../types'
import { PRIMITIVE_BASE_SIZE, SELECTION_OUTLINE_MARGIN } from './primitives'

// Shared by every instance — a unit cube's edges, resized per-frame below to
// match whichever object is currently selected. Never disposed (module-level
// singleton, same convention as other shared shader/geometry constants in
// this codebase, e.g. SceneObjectMesh.tsx's OPACITY_SHADOW_NODE).
const OUTLINE_GEOMETRY = new EdgesGeometry(new BoxGeometry(1, 1, 1))

// Slightly bigger than the object so the outline visibly floats off the
// surface instead of hugging it flush (BoxHelper's tight-fitting box used
// to sit right on the geometry). Parented to a group that mirrors the mesh's
// position/quaternion each frame, so — unlike BoxHelper, which always
// measures a world-axis-aligned box — this stays a properly oriented box
// when the object rotates. The group's scale is recomputed every frame
// (rather than just copying mesh.scale) to keep the margin a fixed
// world-space size — see SELECTION_OUTLINE_MARGIN.
export function SelectionOutline({ mesh, object }: { mesh: Mesh; object: SceneObject }) {
  const groupRef = useRef<Group>(null)
  const baseSize = PRIMITIVE_BASE_SIZE[object.kind]
  // Scratch vector, reused every frame instead of allocated — see the
  // pivotOffset correction below.
  const correctionRef = useRef(new Vector3())

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    // mesh.position is the object's rotation pivot (see SceneObject.pivotOffset
    // in types.ts), which no longer coincides with the geometric center once
    // a hinge offset is set — the outline needs to be centered on the real
    // geometry, not the pivot, so it stays wrapped around the object instead
    // of floating off toward whichever edge the pivot was moved to.
    const [ox, oy, oz] = object.pivotOffset
    const correction = correctionRef.current
      .set(-ox * mesh.scale.x, -oy * mesh.scale.y, -oz * mesh.scale.z)
      .applyQuaternion(mesh.quaternion)
    group.position.copy(mesh.position).add(correction)
    group.quaternion.copy(mesh.quaternion)
    group.scale.set(
      baseSize[0] * mesh.scale.x + SELECTION_OUTLINE_MARGIN,
      baseSize[1] * mesh.scale.y + SELECTION_OUTLINE_MARGIN,
      baseSize[2] * mesh.scale.z + SELECTION_OUTLINE_MARGIN,
    )
  })

  return (
    <group ref={groupRef}>
      <lineSegments geometry={OUTLINE_GEOMETRY}>
        <lineBasicMaterial color="#3a6df0" />
      </lineSegments>
    </group>
  )
}
