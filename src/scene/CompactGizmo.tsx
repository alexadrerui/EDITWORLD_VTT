import { useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { DoubleSide, Matrix4, Mesh, Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three'
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
const ARROW_SHAFT_RADIUS = 0.018
const ARROW_HEAD_LENGTH = 0.16
const ARROW_HEAD_RADIUS = 0.045
const ARC_RADIUS = 0.42
const ARC_TUBE = 0.012

// Small collar around each arrow's shaft, right where another axis's arc
// tube crosses it (each arc's startDir points at another arrow — see
// ARC_BASES below — so the crossing point is always at local Y=ARC_RADIUS
// inside that arrow's own group). Matches the Spline reference: a joint
// piece at the junction instead of the bare arc tube cutting across the
// shaft with nothing marking the intersection.
const JOINT_RADIUS = ARROW_SHAFT_RADIUS * 2
const JOINT_LENGTH = 0.045

// Bigger-than-the-visible-line invisible hit targets — same idea as
// LightIcon's pick sphere in SceneObjectMesh.tsx (three.js raycasting
// ignores `visible`, so a fatter `visible={false}` mesh works as a pure
// pick proxy). The visible arrow shaft/arc tube are thin by design (reads
// as a clean line, not a fat blob), but that makes them a hard target to
// actually grab without this. Independent of the visual radii above (not
// derived from them) so shrinking the visible lines doesn't also shrink
// how forgiving the hit area is.
const ARROW_PICK_RADIUS = 0.06
const ARC_PICK_TUBE = 0.09

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

// Plane (2-axis) translate handles — the gap identified against Spline's own
// gizmo (arrows + arcs only move one axis at a time; Spline additionally
// lets you grab a small patch near the center to slide freely across a
// whole plane, e.g. the floor, in one drag). `normal` is always axisA×axisB
// (never hardcoded) so the basis stays right-handed and `makeBasis` produces
// a valid rotation quaternion — a hardcoded normal picked independently can
// end up left-handed, which silently mirrors the geometry.
function planeBasis(axisA: Vector3, axisB: Vector3) {
  const normal = new Vector3().crossVectors(axisA, axisB).normalize()
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(axisA, axisB, normal))
  return { axisA, axisB, normal, quaternion }
}

const PLANE_KEYS = ['xz', 'xy', 'yz'] as const
type PlaneKey = (typeof PLANE_KEYS)[number]

const PLANE_BASES: Record<PlaneKey, ReturnType<typeof planeBasis>> = {
  xz: planeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, 1)),
  xy: planeBasis(new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
  yz: planeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, 1)),
}

// Deliberately small — kept tight against the pivot rather than spread out
// toward the arcs (the diagonal midpoint between two arrows), so the plane
// handle's hit area doesn't creep into the zone where the user actually
// grabs a translate arrow to move the object.
const PLANE_OFFSET = 0.12
const PLANE_SIZE = 0.16
const PLANE_PICK_SIZE = 0.26
const PLANE_COLOR = '#c9cdd4'

const PLANE_POSITIONS: Record<PlaneKey, [number, number, number]> = {
  xz: [PLANE_OFFSET, 0, PLANE_OFFSET],
  xy: [PLANE_OFFSET, PLANE_OFFSET, 0],
  yz: [0, PLANE_OFFSET, PLANE_OFFSET],
}

const IDENTITY_QUATERNION = new Quaternion()

// A single object today, several under a multi-select — see the group-orbit
// reasoning in beginRotate below for why this is a list instead of staying
// singular like every other prop here.
type GizmoTarget = { mesh: Mesh; object: SceneObject }

export function CompactGizmo({
  targets,
  objects,
  meshRefs,
  updateObjects,
  orbitControlsRef,
  gizmoSpace,
  positionSnap,
  rotationSnap,
}: {
  targets: GizmoTarget[]
  objects: SceneObject[]
  meshRefs: React.RefObject<Map<string, Mesh>>
  updateObjects: (updates: { id: string; patch: Partial<SceneObject> }[]) => void
  orbitControlsRef: React.RefObject<any>
  gizmoSpace: 'world' | 'local'
  positionSnap: number | null
  rotationSnap: number | null
}) {
  const { camera, gl } = useThree()
  const groupRef = useRef<import('three').Group>(null)
  // Scratch vectors reused every frame for the pivotOffset correction below —
  // same technique/reasoning as ScaleFaceHandles.tsx/SelectionOutline.tsx.
  const pivotCorrectionRef = useRef(new Vector3())
  const targetPointRef = useRef(new Vector3())
  const worldPosRef = useRef(new Vector3())

  // Highlight state: hover follows the pointer normally; active locks the
  // highlight on for the whole drag (window-level pointermove/up below
  // don't otherwise touch React state, and R3F's own onPointerOut can fire
  // mid-drag once the cursor leaves the handle's bounds). Keyed by axis
  // *and* handle kind (not just axis) — the arrow and the arc of the same
  // axis are separate handles that happen to share a color, so hovering one
  // must not light up the other (bug report: hovering the move arrow also
  // highlighted the rotate arc for that axis, and vice versa).
  type HandleKey = `${'x' | 'y' | 'z'}-${'translate' | 'rotate'}` | `${PlaneKey}-plane`
  const [hoveredHandle, setHoveredHandle] = useState<HandleKey | null>(null)
  const [activeHandle, setActiveHandle] = useState<HandleKey | null>(null)
  const colorFor = (handle: HandleKey, base: string) =>
    hoveredHandle === handle || activeHandle === handle ? HIGHLIGHT_COLOR : base

  useFrame(() => {
    const group = groupRef.current
    if (!group || targets.length === 0) return
    // Anchor is the average of each target's own pivot-corrected point —
    // for a single target this is exactly that point (unchanged from
    // before multi-select existed); for several, the widget sits at their
    // shared centroid, same idea as Spline's group gizmo.
    const anchor = worldPosRef.current.set(0, 0, 0)
    for (const { mesh, object } of targets) {
      const [ox, oy, oz] = object.pivotOffset
      const correction = pivotCorrectionRef.current
        .set(-ox * mesh.scale.x, -oy * mesh.scale.y, -oz * mesh.scale.z)
        .applyQuaternion(mesh.quaternion)
      anchor.add(targetPointRef.current.copy(mesh.position).add(correction))
    }
    anchor.divideScalar(targets.length)
    group.position.copy(anchor)
    // gizmoSpace is only ever 'local' when there's exactly one target (the
    // caller forces 'world' for multi-select, since "local space" is
    // ambiguous across objects with different rotations).
    group.quaternion.copy(gizmoSpace === 'local' ? targets[0].mesh.quaternion : IDENTITY_QUATERNION)
    const distance = camera.position.distanceTo(anchor)
    group.scale.setScalar(distance * SCREEN_SCALE_FACTOR)
  })

  const beginTranslate = (axis: (typeof AXES)[number]) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const group = groupRef.current
    if (!group || targets.length === 0) return
    if (orbitControlsRef.current) orbitControlsRef.current.enabled = false
    setActiveHandle(`${axis.key}-translate`)

    const axisLocal = new Vector3().setComponent(axis.index, 1)
    const axisWorldDir = axisLocal.clone().applyQuaternion(group.quaternion).normalize()
    // Exactly targets[0].mesh.position for a single target (byte-for-byte
    // the pre-multi-select behavior); the shared anchor for several — see
    // the comment below on why the exact reference point doesn't matter.
    const pivotStart = targets.length === 1 ? targets[0].mesh.position.clone() : group.position.clone()
    const startPositions = targets.map((t) => t.mesh.position.clone())

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
    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(planeNormal, pivotStart)

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

    // Offset (along the axis) between the pivot and wherever on the handle
    // the user actually grabbed it — e.g. clicking near the arrow tip vs.
    // right at the pivot. Without subtracting this, the object snapped its
    // pivot to the cursor's projected position on the very first
    // pointermove, popping by that offset before any real drag motion (bug
    // report: "puxa pra o centro do gizmo, perdendo precisão"). beginRotate
    // already did this correctly (its `startAngle`) — this just brings
    // translate in line with the same "delta since drag start" pattern.
    const startOffset = projectAt(e.nativeEvent) ? hitPoint.clone().sub(pivotStart).dot(axisWorldDir) : 0

    // Neighbor snap-to-objects only makes sense for a single dragged object
    // relative to the rest of the scene — skip it for a multi-select drag,
    // where it'd be ambiguous which selected object's edge should snap.
    const singleTarget = targets.length === 1 ? targets[0] : null
    const otherMeshes = singleTarget
      ? objects
          .filter((o) => o.id !== singleTarget.object.id)
          .map((o) => meshRefs.current?.get(o.id))
          .filter((m): m is Mesh => m !== undefined)
      : []

    const onPointerMove = (ev: PointerEvent) => {
      if (!projectAt(ev)) return

      let delta = hitPoint.clone().sub(pivotStart).dot(axisWorldDir) - startOffset
      if (!singleTarget?.object.snapToObjects && positionSnap) {
        delta = Math.round(delta / positionSnap) * positionSnap
      }
      targets.forEach((t, i) => {
        t.mesh.position.copy(startPositions[i]).addScaledVector(axisWorldDir, delta)
      })
      if (singleTarget?.object.snapToObjects) snapPositionToNeighbors(singleTarget.mesh, otherMeshes)
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (orbitControlsRef.current) orbitControlsRef.current.enabled = true
      setActiveHandle(null)
      updateObjects(
        targets.map((t) => ({
          id: t.object.id,
          patch: { position: t.mesh.position.toArray() as [number, number, number] },
        })),
      )
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const beginRotate = (axis: (typeof AXES)[number]) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const group = groupRef.current
    if (!group || targets.length === 0) return
    if (orbitControlsRef.current) orbitControlsRef.current.enabled = false
    setActiveHandle(`${axis.key}-rotate`)

    const basis = ARC_BASES[axis.key]
    const axisWorldDir = basis.axisDir.clone().applyQuaternion(group.quaternion).normalize()
    const refA = basis.startDir.clone().applyQuaternion(group.quaternion).normalize()
    const refB = new Vector3().crossVectors(axisWorldDir, refA).normalize()
    const anglePivot = group.position.clone()
    const startStates = targets.map((t) => ({
      position: t.mesh.position.clone(),
      quaternion: t.mesh.quaternion.clone(),
    }))
    // Multi-select orbit pivot: plain average of raw positions (deliberately
    // ignoring each object's own pivotOffset, unlike anglePivot above — this
    // is only the center several objects revolve around as a group, not any
    // one object's own rotation center). A single target still spins exactly
    // in place around its own pivot, untouched by this — see the
    // `targets.length > 1` guard in onPointerMove below.
    const orbitPivot = new Vector3()
    for (const s of startStates) orbitPivot.add(s.position)
    orbitPivot.divideScalar(startStates.length)

    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(axisWorldDir, anglePivot)

    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const hitPoint = new Vector3()
    const rect = gl.domElement.getBoundingClientRect()

    const angleAt = (ev: PointerEvent) => {
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return null
      const v = hitPoint.clone().sub(anglePivot)
      return Math.atan2(v.dot(refB), v.dot(refA))
    }

    const startAngle = angleAt(e.nativeEvent) ?? 0
    const deltaQuat = new Quaternion()
    const relative = new Vector3()

    const onPointerMove = (ev: PointerEvent) => {
      const angle = angleAt(ev)
      if (angle === null) return
      let delta = angle - startAngle
      if (rotationSnap) delta = Math.round(delta / rotationSnap) * rotationSnap
      deltaQuat.setFromAxisAngle(axisWorldDir, delta)

      targets.forEach((t, i) => {
        const start = startStates[i]
        t.mesh.quaternion.copy(deltaQuat).multiply(start.quaternion)
        if (targets.length > 1) {
          relative.copy(start.position).sub(orbitPivot).applyQuaternion(deltaQuat)
          t.mesh.position.copy(orbitPivot).add(relative)
        }
      })
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (orbitControlsRef.current) orbitControlsRef.current.enabled = true
      setActiveHandle(null)
      updateObjects(
        targets.map((t) => ({
          id: t.object.id,
          patch: {
            rotation: [t.mesh.rotation.x, t.mesh.rotation.y, t.mesh.rotation.z],
            ...(targets.length > 1
              ? { position: t.mesh.position.toArray() as [number, number, number] }
              : {}),
          },
        })),
      )
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const beginPlaneTranslate = (planeKey: PlaneKey) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const group = groupRef.current
    if (!group || targets.length === 0) return
    if (orbitControlsRef.current) orbitControlsRef.current.enabled = false
    setActiveHandle(`${planeKey}-plane`)

    const { axisA, axisB, normal } = PLANE_BASES[planeKey]
    const axisWorldA = axisA.clone().applyQuaternion(group.quaternion).normalize()
    const axisWorldB = axisB.clone().applyQuaternion(group.quaternion).normalize()
    const normalWorld = normal.clone().applyQuaternion(group.quaternion).normalize()
    // Exactly targets[0].mesh.position for a single target — see the same
    // note in beginTranslate.
    const pivotStart = targets.length === 1 ? targets[0].mesh.position.clone() : group.position.clone()
    const startPositions = targets.map((t) => t.mesh.position.clone())
    // Unlike beginTranslate (which has to invent a camera-facing plane
    // around a single axis), the plane handle's constraint plane already
    // fully determines the drag — the ray/plane hit *is* the 2D position.
    const dragPlane = new Plane().setFromNormalAndCoplanarPoint(normalWorld, pivotStart)

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

    // Same anti-pop fix as beginTranslate's startOffset: remember where on
    // the plane the user actually grabbed, so the object doesn't jump to
    // the cursor on the very first pointermove.
    const startHit = new Vector3()
    if (projectAt(e.nativeEvent)) startHit.copy(hitPoint)

    const singleTarget = targets.length === 1 ? targets[0] : null
    const otherMeshes = singleTarget
      ? objects
          .filter((o) => o.id !== singleTarget.object.id)
          .map((o) => meshRefs.current?.get(o.id))
          .filter((m): m is Mesh => m !== undefined)
      : []

    const onPointerMove = (ev: PointerEvent) => {
      if (!projectAt(ev)) return
      const diff = hitPoint.clone().sub(startHit)
      let deltaA = diff.dot(axisWorldA)
      let deltaB = diff.dot(axisWorldB)
      if (!singleTarget?.object.snapToObjects && positionSnap) {
        deltaA = Math.round(deltaA / positionSnap) * positionSnap
        deltaB = Math.round(deltaB / positionSnap) * positionSnap
      }
      targets.forEach((t, i) => {
        t.mesh.position
          .copy(startPositions[i])
          .addScaledVector(axisWorldA, deltaA)
          .addScaledVector(axisWorldB, deltaB)
      })
      if (singleTarget?.object.snapToObjects) snapPositionToNeighbors(singleTarget.mesh, otherMeshes)
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      if (orbitControlsRef.current) orbitControlsRef.current.enabled = true
      setActiveHandle(null)
      updateObjects(
        targets.map((t) => ({
          id: t.object.id,
          patch: { position: t.mesh.position.toArray() as [number, number, number] },
        })),
      )
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
          <mesh position={[0, ARC_RADIUS, 0]} renderOrder={999}>
            <cylinderGeometry args={[JOINT_RADIUS, JOINT_RADIUS, JOINT_LENGTH, 12]} />
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

      {PLANE_KEYS.map((planeKey) => (
        <group key={`plane-${planeKey}`} quaternion={PLANE_BASES[planeKey].quaternion} position={PLANE_POSITIONS[planeKey]}>
          <mesh renderOrder={999}>
            <circleGeometry args={[PLANE_SIZE / 2, 24]} />
            <meshBasicMaterial
              color={colorFor(`${planeKey}-plane`, PLANE_COLOR)}
              transparent
              opacity={0.6}
              side={DoubleSide}
              depthTest={false}
            />
          </mesh>
          <mesh
            visible={false}
            onPointerDown={beginPlaneTranslate(planeKey)}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHoveredHandle(`${planeKey}-plane`)
            }}
            onPointerOut={() => setHoveredHandle((h) => (h === `${planeKey}-plane` ? null : h))}
          >
            {/* A flat circle is one-sided by default (material.side defaults
            to FrontSide) — without DoubleSide here, this pick mesh only
            catches the ray from whichever side its normal happens to face,
            e.g. the floor (xz) handle's normal points straight down, so a
            camera looking down at it from above would never register a hit. */}
            <circleGeometry args={[PLANE_PICK_SIZE / 2, 16]} />
            <meshBasicMaterial side={DoubleSide} />
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
