import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, EdgesGeometry, type Group, type Mesh } from 'three'
import type { SceneObject } from '../types'
import { PRIMITIVE_BASE_SIZE, SELECTION_OUTLINE_PADDING } from './primitives'

// Slightly bigger than the object so the outline visibly floats off the
// surface instead of hugging it flush (BoxHelper's tight-fitting box used
// to sit right on the geometry). Built from the primitive's own base size
// and parented to a group that mirrors the mesh's position/quaternion/scale
// each frame, so — unlike BoxHelper, which always measures a world-axis-
// aligned box — this stays a properly oriented box when the object rotates.
export function SelectionOutline({ mesh, object }: { mesh: Mesh; object: SceneObject }) {
  const groupRef = useRef<Group>(null)

  const geometry = useMemo(() => {
    const [w, h, d] = PRIMITIVE_BASE_SIZE[object.kind]
    const box = new BoxGeometry(
      w * SELECTION_OUTLINE_PADDING,
      h * SELECTION_OUTLINE_PADDING,
      d * SELECTION_OUTLINE_PADDING,
    )
    const edges = new EdgesGeometry(box)
    box.dispose()
    return edges
  }, [object.kind])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    group.position.copy(mesh.position)
    group.quaternion.copy(mesh.quaternion)
    group.scale.copy(mesh.scale)
  })

  return (
    <group ref={groupRef}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#3a6df0" />
      </lineSegments>
    </group>
  )
}
