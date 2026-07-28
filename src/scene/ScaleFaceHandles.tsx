import { useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Group, Mesh, Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three'
import type { SceneObject } from '../types'
import { PRIMITIVE_BASE_SIZE } from './primitives'

// Loftcraft-style face handles: unlike the built-in axis gizmo (which grows
// an object symmetrically around its center pivot), dragging one of these
// keeps the OPPOSITE face fixed in place and only moves the dragged face —
// so scaling one side never shifts geometry that's already snapped/aligned
// on the other side. No bottom (-Y) handle: objects are assumed to rest on
// the ground, so only the 5 faces that could face away from the floor are
// exposed, same as Loftcraft's furniture handles.
const FACES: { name: string; normal: [number, number, number]; axisIndex: number }[] = [
  { name: '+x', normal: [1, 0, 0], axisIndex: 0 },
  { name: '-x', normal: [-1, 0, 0], axisIndex: 0 },
  { name: '+z', normal: [0, 0, 1], axisIndex: 2 },
  { name: '-z', normal: [0, 0, -1], axisIndex: 2 },
  { name: '+y', normal: [0, 1, 0], axisIndex: 1 },
]

const PLANE_NORMAL = new Vector3(0, 0, 1)
const MIN_SCALE = 0.05
const HANDLE_SIZE_FRACTION = 0.35
const HANDLE_THICKNESS_FRACTION = 0.25
const HANDLE_MIN_SIZE = 0.08
const HANDLE_MAX_SIZE = 1.2

export function ScaleFaceHandles({
  mesh,
  object,
  updateObject,
  orbitControlsRef,
}: {
  mesh: Mesh
  object: SceneObject
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  orbitControlsRef: React.RefObject<any>
}) {
  const { camera, gl } = useThree()
  const groupRef = useRef<Group>(null)
  const handleRefs = useRef<Record<string, Mesh | null>>({})

  const baseHalf = useMemo(() => {
    const [w, h, d] = PRIMITIVE_BASE_SIZE[object.kind]
    return [w / 2, h / 2, d / 2] as [number, number, number]
  }, [object.kind])

  const faceQuaternions = useMemo(() => {
    const map: Record<string, Quaternion> = {}
    for (const face of FACES) {
      map[face.name] = new Quaternion().setFromUnitVectors(
        PLANE_NORMAL,
        new Vector3(...face.normal),
      )
    }
    return map
  }, [])

  // Handles use a shared unit box geometry and get resized every frame via
  // mesh.scale instead of per-instance geometry args, so each face's handle
  // can independently track that face's own current size (which changes
  // live while dragging) without rebuilding geometry every frame. Sizing a
  // handle to the SMALLER of its face's two in-plane dimensions — rather
  // than a single size shared across all 5 — keeps it proportionate on
  // elongated objects and means it visibly grows/shrinks as that specific
  // face grows/shrinks, instead of a fixed size regardless of surface size.
  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    group.position.copy(mesh.position)
    group.quaternion.copy(mesh.quaternion)

    const fullExtent = [
      baseHalf[0] * 2 * mesh.scale.x,
      baseHalf[1] * 2 * mesh.scale.y,
      baseHalf[2] * 2 * mesh.scale.z,
    ]
    const halfExtent = [
      baseHalf[0] * mesh.scale.x,
      baseHalf[1] * mesh.scale.y,
      baseHalf[2] * mesh.scale.z,
    ]

    for (const face of FACES) {
      const handle = handleRefs.current[face.name]
      if (!handle) continue

      const [otherA, otherB] = [0, 1, 2].filter((i) => i !== face.axisIndex)
      const faceDim = Math.min(fullExtent[otherA], fullExtent[otherB])
      const size = Math.min(HANDLE_MAX_SIZE, Math.max(HANDLE_MIN_SIZE, faceDim * HANDLE_SIZE_FRACTION))
      const thickness = size * HANDLE_THICKNESS_FRACTION
      handle.scale.set(size, size, thickness)

      const offset = halfExtent[face.axisIndex] + thickness / 2
      handle.position.set(face.normal[0] * offset, face.normal[1] * offset, face.normal[2] * offset)
    }
  })

  const beginDrag = (face: (typeof FACES)[number]) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (orbitControlsRef.current) orbitControlsRef.current.enabled = false

    const axisIndex = face.axisIndex
    const halfBaseOnAxis = baseHalf[axisIndex]
    const axisWorldDir = new Vector3(...face.normal).applyQuaternion(mesh.quaternion).normalize()
    const startScale = mesh.scale.clone()
    const startPosition = mesh.position.clone()
    const startExtent = halfBaseOnAxis * startScale.getComponent(axisIndex)
    const pivot = mesh.position.clone()

    const planeNormal = new Vector3()
    camera.getWorldDirection(planeNormal)
    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(planeNormal, pivot)
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const hitPoint = new Vector3()
    const rect = gl.domElement.getBoundingClientRect()

    const onPointerMove = (ev: PointerEvent) => {
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return

      const currentExtent = hitPoint.clone().sub(pivot).dot(axisWorldDir)
      const dSigned = currentExtent - startExtent
      const rawScaleOnAxis = startScale.getComponent(axisIndex) + dSigned / (2 * halfBaseOnAxis)
      const newScaleOnAxis = Math.max(MIN_SCALE, rawScaleOnAxis)
      // Recompute the applied delta from the (possibly clamped) scale so the
      // fixed face truly stays put even once MIN_SCALE kicks in.
      const appliedDSigned = (newScaleOnAxis - startScale.getComponent(axisIndex)) * 2 * halfBaseOnAxis

      const newScale = startScale.clone()
      newScale.setComponent(axisIndex, newScaleOnAxis)
      mesh.scale.copy(newScale)
      mesh.position.copy(
        startPosition.clone().add(axisWorldDir.clone().multiplyScalar(appliedDSigned / 2)),
      )
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (orbitControlsRef.current) orbitControlsRef.current.enabled = true
      updateObject(object.id, {
        position: mesh.position.toArray() as [number, number, number],
        scale: mesh.scale.toArray() as [number, number, number],
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <group ref={groupRef}>
      {FACES.map((face) => (
        <mesh
          key={face.name}
          ref={(instance) => {
            handleRefs.current[face.name] = instance
          }}
          quaternion={faceQuaternions[face.name]}
          onPointerDown={beginDrag(face)}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#3a6df0" transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  )
}
