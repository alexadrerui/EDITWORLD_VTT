import { useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Matrix4, Mesh, Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three'
import type { SceneObject } from '../types'
import { snapPositionToNeighbors } from './snapToNeighbors'

// Spline-style combined move+rotate gizmo (see editworld-vtt skill notes,
// "Referência de UX — Spline"): short per-axis arrows for translate and
// quarter-circle arcs for rotate, both always visible on the same widget —
// unlike three.js's own TransformControls (used for scale/scaleFree, see
// SceneObjects.tsx), which only ever shows one mode's full-size handles at a
// time (long arrows spanning past the object, or full 360° rings). Rendered
// for BOTH 'translate' and 'rotate' transformMode — the mode toggle still
// exists (S/F/R shortcuts, scale stays separate), but this widget itself
// doesn't care which of the two is nominally active: dragging an arrow
// always translates, dragging an arc always rotates, exactly like Spline's
// single Select tool.
const AXES = [
  { key: 'x' as const, index: 0, color: '#e5484d' },
  { key: 'y' as const, index: 1, color: '#30c48d' },
  { key: 'z' as const, index: 2, color: '#5b8cff' },
]

// Hover/drag highlight — confirmed against the Spline reference (hovering
// or dragging any arrow/arc there swaps its color to this same orange,
// regardless of the axis's own base color) rather than guessed.
const HIGHLIGHT_COLOR = '#ffaa00'

const ARROW_SHAFT_LENGTH = 0.55
const ARROW_SHAFT_RADIUS = 0.025
const ARROW_HEAD_LENGTH = 0.16
const ARROW_HEAD_RADIUS = 0.06
const ARC_RADIUS = 0.42
const ARC_TUBE = 0.018

// Bigger-than-the-visible-line invisible hit targets — same idea as
// LightIcon's pick sphere in SceneObjectMesh.tsx (three.js raycasting
// ignores `visible`, so a fatter `visible={false}` mesh works as a pure
// pick proxy). The visible arrow shaft/arc tube are thin by design (reads
// as a clean line, not a fat blob), but that makes them a hard target to
// actually grab without this.
const ARROW_PICK_RADIUS = 0.06
const ARC_PICK_TUBE = ARC_TUBE * 5

// Keeps the whole gizmo a constant size on screen regardless of camera
// distance or the object's own scale — same reasoning as three.js's own
// TransformControls gizmo (which does the same internally), and exactly
// what makes Spline's version never balloon to cover a large object or
// shrink to nothing on a small one.
const SCREEN_SCALE_FACTOR = 0.2

// Arrow shapes (cylinder+cone) point along +Y by default — one quaternion
// per axis to reorient that into the actual axis direction, computed once
// (constant, not per-frame): the gizmo GROUP itself is what switches
// between world/local space each frame (see useFrame below), so everything
// defined inside it only ever needs to know its own fixed axis, never the
// object's live rotation.
const ARROW_QUATERNIONS: Record<'x' | 'y' | 'z', Quaternion> = {
  x: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(1, 0, 0)),
  y: new Quaternion(),
  z: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(0, 0, 1)),
}

// Default TorusGeometry lies flat in the local XY plane (hole axis = local
// Z), start point at local +X, sweeping toward local +Y. Building a full
// orthonormal basis (not just one setFromUnitVectors call) lets each axis's
// arc both (a) visually sweep between the other two positive arrow tips —
// matching Spline's "quarter dome" look instead of an arbitrary quarter —
// and (b) share that exact same reference frame with the drag-angle math
// below, so grabbing a point on the ring rotates intuitively from there.
function arcBasis(startDir: Vector3, axisDir: Vector3) {
  const sweepDir = new Vector3().crossVectors(axisDir, startDir).normalize()
  const quaternion = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(startDir, sweepDir, axisDir),
  )
  return { startDir, sweepDir, axisDir, quaternion }
}

const ARC_BASES: Record<'x' | 'y' | 'z', ReturnType<typeof arcBasis>> = {
  x: arcBasis(new Vector3(0, 1, 0), new Vector3(1, 0, 0)),
  y: arcBasis(new Vector3(0, 0, 1), new Vector3(0, 1, 0)),
  z: arcBasis(new Vector3(1, 0, 0), new Vector3(0, 0, 1)),
}

const IDENTITY_QUATERNION = new Quaternion()

export function CompactGizmo({
  mesh,
  object,
  objects,
  meshRefs,
  updateObject,
  orbitControlsRef,
  gizmoSpace,
  positionSnap,
  rotationSnap,
}: {
  mesh: Mesh
  object: SceneObject
  objects: SceneObject[]
  meshRefs: React.RefObject<Map<string, Mesh>>
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  orbitControlsRef: React.RefObject<any>
  gizmoSpace: 'world' | 'local'
  positionSnap: number | null
  rotationSnap: number | null
}) {
  const { camera, gl } = useThree()
  const groupRef = useRef<import('three').Group>(null)
  // Scratch vector reused every frame for the pivotOffset correction below —
  // same technique/reasoning as ScaleFaceHandles.tsx/SelectionOutline.tsx.
  const pivotCorrectionRef = useRef(new Vector3())
  const worldPosRef = useRef(new Vector3())

  // Highlight state: hover follows the pointer normally; active locks the
  // highlight on for the whole drag (window-level pointermove/up below
  // don't otherwise touch React state, and R3F's own onPointerOut can fire
  // mid-drag once the cursor leaves the handle's bounds). Keyed by axis
  // *and* handle kind (not just axis) — the arrow and the arc of the same
  // axis are separate handles that happen to share a color, so hovering one
  // must not light up the other (bug report: hovering the move arrow also
  // highlighted the rotate arc for that axis, and vice versa).
  type HandleKey = `${'x' | 'y' | 'z'}-${'translate' | 'rotate'}`
  const [hoveredHandle, setHoveredHandle] = useState<HandleKey | null>(null)
  const [activeHandle, setActiveHandle] = useState<HandleKey | null>(null)
  const colorFor = (handle: HandleKey, base: string) =>
    hoveredHandle === handle || activeHandle === handle ? HIGHLIGHT_COLOR : base

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    const [ox, oy, oz] = object.pivotOffset
    const correction = pivotCorrectionRef.current
      .set(-ox * mesh.scale.x, -oy * mesh.scale.y, -oz * mesh.scale.z)
      .applyQuaternion(mesh.quaternion)
    const worldPos = worldPosRef.current.copy(mesh.position).add(correction)
    group.position.copy(worldPos)
    group.quaternion.copy(gizmoSpace === 'local' ? mesh.quaternion : IDENTITY_QUATERNION)
    const distance = camera.position.distanceTo(worldPos)
    group.scale.setScalar(distance * SCREEN_SCALE_FACTOR)
  })

  const beginTranslate = (axis: (typeof AXES)[number]) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const group = groupRef.current
    if (!group) return
    if (orbitControlsRef.current) orbitControlsRef.current.enabled = false
    setActiveHandle(`${axis.key}-translate`)

    const axisLocal = new Vector3().setComponent(axis.index, 1)
    const axisWorldDir = axisLocal.clone().applyQuaternion(group.quaternion).normalize()
    const startPosition = mesh.position.clone()

    // Drag plane contains the axis line and faces the camera as much as
    // possible — same "project camera direction, strip the axis-parallel
    // component" technique as a standard single-axis gizmo drag.
    const camDir = new Vector3()
    camera.getWorldDirection(camDir)
    let planeNormal = camDir.clone().sub(axisWorldDir.clone().multiplyScalar(camDir.dot(axisWorldDir)))
    if (planeNormal.lengthSq() < 1e-6) {
      // Looking almost straight down the axis — fall back to any normal
      // perpendicular to it so the plane stays well-defined.
      planeNormal = new Vector3(0, 1, 0)
      if (Math.abs(axisWorldDir.dot(planeNormal)) > 0.99) planeNormal = new Vector3(1, 0, 0)
      planeNormal.sub(axisWorldDir.clone().multiplyScalar(planeNormal.dot(axisWorldDir)))
    }
    planeNormal.normalize()
    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(planeNormal, startPosition)

    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const hitPoint = new Vector3()
    const rect = gl.domElement.getBoundingClientRect()

    const projectAt = (ev: PointerEvent) => {
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(dragPlane, hitPoint)
    }

    // Offset (along the axis) between the object's pivot and wherever on the
    // handle the user actually grabbed it — e.g. clicking near the arrow tip
    // vs. right at the pivot. Without subtracting this, the object snapped
    // its pivot to the cursor's projected position on the very first
    // pointermove, popping by that offset before any real drag motion (bug
    // report: "puxa pra o centro do gizmo, perdendo precisão"). beginRotate
    // already did this correctly (its `startAngle`) — this just brings
    // translate in line with the same "delta since drag start" pattern.
    const startOffset = projectAt(e.nativeEvent) ? hitPoint.clone().sub(startPosition).dot(axisWorldDir) : 0

    const otherMeshes = objects
      .filter((o) => o.id !== object.id)
      .map((o) => meshRefs.current?.get(o.id))
      .filter((m): m is Mesh => m !== undefined)

    const onPointerMove = (ev: PointerEvent) => {
      if (!projectAt(ev)) return

      let delta = hitPoint.clone().sub(startPosition).dot(axisWorldDir) - startOffset
      if (!object.snapToObjects && positionSnap) {
        delta = Math.round(delta / positionSnap) * positionSnap
      }
      mesh.position.copy(startPosition).addScaledVector(axisWorldDir, delta)
      if (object.snapToObjects) snapPositionToNeighbors(mesh, otherMeshes)
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (orbitControlsRef.current) orbitControlsRef.current.enabled = true
      setActiveHandle(null)
      updateObject(object.id, { position: mesh.position.toArray() as [number, number, number] })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const beginRotate = (axis: (typeof AXES)[number]) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const group = groupRef.current
    if (!group) return
    if (orbitControlsRef.current) orbitControlsRef.current.enabled = false
    setActiveHandle(`${axis.key}-rotate`)

    const basis = ARC_BASES[axis.key]
    const axisWorldDir = basis.axisDir.clone().applyQuaternion(group.quaternion).normalize()
    const refA = basis.startDir.clone().applyQuaternion(group.quaternion).normalize()
    const refB = new Vector3().crossVectors(axisWorldDir, refA).normalize()
    const pivot = group.position.clone()
    const startQuaternion = mesh.quaternion.clone()
    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(axisWorldDir, pivot)

    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const hitPoint = new Vector3()
    const rect = gl.domElement.getBoundingClientRect()

    const angleAt = (ev: PointerEvent) => {
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return null
      const v = hitPoint.clone().sub(pivot)
      return Math.atan2(v.dot(refB), v.dot(refA))
    }

    const startAngle = angleAt(e.nativeEvent) ?? 0
    const deltaQuat = new Quaternion()

    const onPointerMove = (ev: PointerEvent) => {
      const angle = angleAt(ev)
      if (angle === null) return
      let delta = angle - startAngle
      if (rotationSnap) delta = Math.round(delta / rotationSnap) * rotationSnap
      deltaQuat.setFromAxisAngle(axisWorldDir, delta)
      mesh.quaternion.copy(deltaQuat).multiply(startQuaternion)
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (orbitControlsRef.current) orbitControlsRef.current.enabled = true
      setActiveHandle(null)
      updateObject(object.id, {
        rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // depthTest={false} + a high renderOrder is what every real gizmo relies
  // on (three.js's own TransformControlsGizmo does the same internally) —
  // without it, this whole widget renders at the object's actual depth and
  // gets hidden completely inside any opaque mesh bigger than itself
  // (confirmed: invisible inside a solid cylinder during testing). Always
  // drawing on top, regardless of what's in front, is what makes a gizmo
  // usable on objects of any size.
  return (
    <group ref={groupRef} renderOrder={999}>
      {AXES.map((axis) => (
        <group key={axis.key} quaternion={ARROW_QUATERNIONS[axis.key]}>
          <mesh position={[0, ARROW_SHAFT_LENGTH / 2, 0]} renderOrder={999}>
            <cylinderGeometry args={[ARROW_SHAFT_RADIUS, ARROW_SHAFT_RADIUS, ARROW_SHAFT_LENGTH, 8]} />
            <meshBasicMaterial color={colorFor(`${axis.key}-translate`, axis.color)} depthTest={false} />
          </mesh>
          <mesh position={[0, ARROW_SHAFT_LENGTH + ARROW_HEAD_LENGTH / 2, 0]} renderOrder={999}>
            <coneGeometry args={[ARROW_HEAD_RADIUS, ARROW_HEAD_LENGTH, 12]} />
            <meshBasicMaterial color={colorFor(`${axis.key}-translate`, axis.color)} depthTest={false} />
          </mesh>
          <mesh
            visible={false}
            position={[0, (ARROW_SHAFT_LENGTH + ARROW_HEAD_LENGTH) / 2, 0]}
            onPointerDown={beginTranslate(axis)}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHoveredHandle(`${axis.key}-translate`)
            }}
            onPointerOut={() =>
              setHoveredHandle((h) => (h === `${axis.key}-translate` ? null : h))
            }
          >
            <cylinderGeometry args={[ARROW_PICK_RADIUS, ARROW_PICK_RADIUS, ARROW_SHAFT_LENGTH + ARROW_HEAD_LENGTH, 8]} />
          </mesh>
        </group>
      ))}

      {AXES.map((axis) => (
        <group key={`arc-${axis.key}`} quaternion={ARC_BASES[axis.key].quaternion}>
          <mesh renderOrder={999}>
            <torusGeometry args={[ARC_RADIUS, ARC_TUBE, 8, 24, Math.PI / 2]} />
            <meshBasicMaterial
              color={colorFor(`${axis.key}-rotate`, axis.color)}
              transparent
              opacity={0.85}
              depthTest={false}
            />
          </mesh>
          <mesh
            visible={false}
            onPointerDown={beginRotate(axis)}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHoveredHandle(`${axis.key}-rotate`)
            }}
            onPointerOut={() => setHoveredHandle((h) => (h === `${axis.key}-rotate` ? null : h))}
          >
            <torusGeometry args={[ARC_RADIUS, ARC_PICK_TUBE, 8, 24, Math.PI / 2]} />
          </mesh>
        </group>
      ))}

      <mesh renderOrder={999}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshBasicMaterial color="#c9cdd4" depthTest={false} />
      </mesh>
    </group>
  )
}
