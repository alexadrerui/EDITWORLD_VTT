import { forwardRef, useEffect, useMemo, useRef, type RefObject } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import {
  BackSide,
  BufferGeometry,
  Color,
  type DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  type Mesh,
  type MeshLambertMaterial,
  type MeshPhongMaterial,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type MeshToonMaterial,
  type Object3D,
  type PointLight,
  type Side,
  type SpotLight,
} from 'three'
import type { MaterialSide, SceneObject, ShadowMode } from '../types'
import { useEditorStore } from '../state/useEditorStore'
import { usePointerClick } from './usePointerClick'
import { isLightKind, PRIMITIVE_BASE_SIZE, SHADOW_MAP_SIZE } from './primitives'

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
  // The selection highlight used to tint the *emissive* channel — but that's
  // the exact channel BloomPipeline (Editor3D.tsx) reads for selective bloom,
  // so every selected object visibly bloomed regardless of its own glow
  // settings. Fixed by tinting the diffuse `color` instead: emissive always
  // reflects the object's own emissiveColor/emissiveIntensity, selected or
  // not, so bloom only ever comes from deliberate glow, never from selection.
  const displayColor = useMemo(() => {
    if (!isSelected) return object.color
    return new Color(object.color).lerp(new Color('#3a6df0'), 0.5).getStyle()
  }, [object.color, isSelected])

  const commonProps = {
    ref: materialRef as never,
    color: displayColor,
    emissive: object.emissiveColor,
    emissiveIntensity: object.emissiveIntensity,
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
    case 'torus':
      return <torusGeometry args={[0.35, 0.15, 16, 48]} />
    case 'pyramid':
      // Same as `cone` above, just 4 radial segments instead of 32.
      return <coneGeometry args={[0.6, 1, 4]} />
    case 'icosahedron':
      return <icosahedronGeometry args={[0.65, 0]} />
    case 'dodecahedron':
      return <dodecahedronGeometry args={[0.65, 0]} />
    case 'torusKnot':
      return <torusKnotGeometry args={[0.4, 0.12, 64, 8]} />
  }
}

// Bigger-than-the-icon invisible hit target for light objects, so a small
// icon stays easy to click from a distance/zoomed out — same idea as
// kokraf's separate 'picker' mesh (ObjectFactory.js's createHelper), which
// decouples the clickable area from the visual gizmo size instead of relying
// on the (often thin) helper geometry itself. `visible={false}` hides it
// from rendering but — per our own documented finding that three.js
// raycasting ignores `visible` — doesn't stop it from being hit-tested, so
// it works as a pure invisible pick proxy without any extra plumbing.
const LIGHT_PICK_RADIUS_SCALE = 3

// Unit cone "cross + circle" wireframe, same construction three.js's own
// SpotLightHelper uses (see node_modules/three/src/helpers/SpotLightHelper.js)
// but built pointing down the local -Y axis instead of +Z, to match this
// project's light-target convention (see the `target` object3D below, at
// local (0,-1,0)). Apex at the origin; base circle/cross sit at y=-1, x/z
// radius 1 — actual size comes from the `scale` prop applied per-instance
// (scale.y = preview length, scale.x/z = length * tan(angle)), so unlike
// three.js's own helper this never needs an imperative `.update()` call:
// it's plain reactive props, recomputed on every render from the object's
// current angle/distance.
function buildSpotConeGeometry(): BufferGeometry {
  const positions = [
    0, 0, 0, 0, -1, 0,
    0, 0, 0, 1, -1, 0,
    0, 0, 0, -1, -1, 0,
    0, 0, 0, 0, -1, 1,
    0, 0, 0, 0, -1, -1,
  ]
  const segments = 32
  for (let i = 0; i < segments; i++) {
    const p1 = (i / segments) * Math.PI * 2
    const p2 = ((i + 1) / segments) * Math.PI * 2
    positions.push(Math.cos(p1), -1, Math.sin(p1), Math.cos(p2), -1, Math.sin(p2))
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

// Shared across every spot light instance — same unit shape for all, sized
// per-instance via `scale`, so one geometry can be reused rather than
// rebuilt per object (never mutated after creation).
const SPOT_CONE_GEOMETRY = buildSpotConeGeometry()

// Square outline in the local XZ plane (perpendicular to -Y, "facing down"
// like the light's own default direction) plus a line from the origin to
// (0,-1,0) — same two-piece construction as three.js's own
// DirectionalLightHelper (a plane + a target line), but built directly in
// this object's local space instead of reoriented via `lookAt`, since it's
// already a child of the same rotated mesh as the light and target. Emitted
// as disconnected segment pairs (one per edge) rather than a connected loop
// so it can render as `<lineSegments>` — R3F v9 renames the singular `<line>`
// tag to avoid colliding with the DOM's SVG `<line>`, and the renamed
// `threeLine` alias only exists in the type declarations, not the runtime
// catalog (throws "not part of the THREE namespace" unless manually
// `extend`-ed) — `lineSegments` sidesteps that entirely.
function buildDirectionalPlaneGeometry(): BufferGeometry {
  const s = 0.4
  const corners: [number, number, number][] = [
    [-s, 0, -s],
    [s, 0, -s],
    [s, 0, s],
    [-s, 0, s],
  ]
  const positions: number[] = []
  for (let i = 0; i < corners.length; i++) {
    positions.push(...corners[i], ...corners[(i + 1) % corners.length])
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}
const DIRECTIONAL_PLANE_GEOMETRY = buildDirectionalPlaneGeometry()

function buildDirectionalLineGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, -1, 0], 3))
  return geometry
}
const DIRECTIONAL_LINE_GEOMETRY = buildDirectionalLineGeometry()

// Preview lengths for the spot cone / directional arrow — purely visual, not
// a claim about actual light falloff. A spot's real `distance` (when set)
// drives the cone length directly; 0 means "no falloff limit" in three.js,
// which would make an infinitely long cone, so it falls back to a fixed
// preview length instead. Directional lights have no distance at all.
const SPOT_PREVIEW_LENGTH_FALLBACK = 6
const SPOT_PREVIEW_LENGTH_MAX = 30
const DIRECTIONAL_PREVIEW_LENGTH = 3

// Light objects have no real geometry, so they're represented by a small
// unlit icon mesh — that's what gets the forwarded ref, which is what makes
// them "just work" with the existing selection/TransformControls/
// SelectionOutline pipeline built for meshes (see SceneObjects.tsx): as long
// as *something* Mesh-shaped is at object.position/rotation, dragging it
// works the same way for a light as for a box. The actual three.js light
// (and, for spot lights, its required `target` object) are children of that
// same mesh, so they move/rotate together with it for free — no separate
// transform bookkeeping needed. Scale is intentionally never applied here
// (the icon always renders at its fixed base size) since lights have no
// meaningful "scale" in our data model.
function LightIcon({
  object,
  isSelected,
  gizmosVisible,
  onPointerDown,
  onPointerUp,
}: {
  object: SceneObject
  isSelected: boolean
  gizmosVisible: boolean
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
  onPointerUp: (e: ThreeEvent<PointerEvent>) => void
}) {
  const pointRef = useRef<PointLight>(null)
  const spotRef = useRef<SpotLight>(null)
  const dirRef = useRef<DirectionalLight>(null)
  // Shared by spot/directional — only one of the two branches below ever
  // renders for a given object, so reusing the same target ref is safe.
  const targetRef = useRef<Object3D>(null)
  const radius = PRIMITIVE_BASE_SIZE[object.kind][0] / 2
  const gizmoColor = isSelected ? '#3a6df0' : object.color

  // Re-runs after the light element below remounts too (see the `key` prop
  // on each light, keyed by shadowResolution) — otherwise a fresh light
  // instance would default to a same-scene target at the origin instead of
  // this object's own target.
  useEffect(() => {
    if (!targetRef.current) return
    if (object.kind === 'spotLight' && spotRef.current) {
      spotRef.current.target = targetRef.current
    }
    if (object.kind === 'directionalLight' && dirRef.current) {
      dirRef.current.target = targetRef.current
    }
  }, [object.kind, object.shadowResolution])

  const coneLength =
    object.lightDistance > 0
      ? Math.min(object.lightDistance, SPOT_PREVIEW_LENGTH_MAX)
      : SPOT_PREVIEW_LENGTH_FALLBACK
  const coneWidth = coneLength * Math.tan(object.lightAngle)

  const shadowMapSize = SHADOW_MAP_SIZE[object.shadowResolution]
  // three.js only exposes a single shadow.radius (blur) knob per light, but
  // Spline's inspector shows two ("Blur" + "Penumbra") for spot/directional —
  // there's no native 1:1 mapping, so both combine into one radius here.
  // Point lights skip this entirely: Spline's Point Light inspector only has
  // "Radius" (no separate Penumbra), matching three.js's PointLightShadow,
  // which likewise has no penumbra concept.
  const shadowRadius =
    object.kind === 'pointLight'
      ? object.shadowBlur
      : object.shadowBlur * (1 + object.shadowPenumbra)

  return (
    <>
      {/* Gated by the "Esconder ícones de luz" toggle in SnapBar.tsx — the
          light itself (below) always keeps rendering/casting regardless;
          only the always-on visual affordances (icon, click target, cone/
          plane previews) hide, same split as kokraf's per-type helper
          visibility toggle (see SceneManager.js's showHelpersChanged). */}
      {gizmosVisible && (
        <>
          <octahedronGeometry args={[radius, 0]} />
          <meshBasicMaterial color={gizmoColor} wireframe />
          <mesh visible={false} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
            <sphereGeometry args={[radius * LIGHT_PICK_RADIUS_SCALE, 8, 6]} />
          </mesh>
        </>
      )}
      {object.kind === 'pointLight' && (
        <pointLight
          // Changing shadow.mapSize after a shadow map has already been
          // allocated doesn't resize the underlying depth texture on its
          // own (three.js only sizes it from mapSize on first use) — on the
          // WebGPU backend, leaving the stale texture in place actually
          // throws a continuous flood of "Destroyed texture ... used in a
          // submit" GPUValidationErrors (confirmed by reproducing it; disposing
          // shadow.map manually wasn't enough to stop it either). Keying by
          // shadowResolution forces a full remount — a fresh light instance
          // that allocates its shadow map at the new size from scratch,
          // never touching the old texture at all.
          key={object.shadowResolution}
          ref={pointRef}
          color={object.color}
          intensity={object.lightIntensity}
          distance={object.lightDistance}
          decay={object.lightDecay}
          castShadow={object.castLightShadow}
          shadow-mapSize={[shadowMapSize, shadowMapSize]}
          shadow-radius={shadowRadius}
        />
      )}
      {object.kind === 'spotLight' && (
        <>
          <spotLight
            key={object.shadowResolution}
            ref={spotRef}
            color={object.color}
            intensity={object.lightIntensity}
            distance={object.lightDistance}
            decay={object.lightDecay}
            angle={object.lightAngle}
            penumbra={object.lightPenumbra}
            castShadow={object.castLightShadow}
            shadow-mapSize={[shadowMapSize, shadowMapSize]}
            shadow-radius={shadowRadius}
          />
          {/* Spot points from the light toward this target; parented here so
              it inherits the mesh's rotation — rotation 0 points straight
              down, like a hanging lamp. */}
          <object3D ref={targetRef} position={[0, -1, 0]} />
          {/* Cone preview matching the spot's actual angle/distance, like
              kokraf's SpotLightHelper-based visualization — disabled from
              raycasting so it's purely visual, same as their helper (only
              the picker sphere above is a click target). */}
          {gizmosVisible && (
            <lineSegments
              geometry={SPOT_CONE_GEOMETRY}
              scale={[coneWidth, coneLength, coneWidth]}
              raycast={() => null}
            >
              <lineBasicMaterial color={gizmoColor} toneMapped={false} />
            </lineSegments>
          )}
        </>
      )}
      {object.kind === 'directionalLight' && (
        <>
          <directionalLight
            // Also remount on shadowSize changes — like mapSize above, the
            // shadow camera's frustum is set up once from these values, so
            // resizing it live is unreliable (see the pointLight key comment
            // for the full story on why this fixes a real WebGPU error).
            key={`${object.shadowResolution}-${object.shadowSize}`}
            ref={dirRef}
            color={object.color}
            intensity={object.lightIntensity}
            castShadow={object.castLightShadow}
            shadow-mapSize={[shadowMapSize, shadowMapSize]}
            shadow-radius={shadowRadius}
            shadow-camera-left={-object.shadowSize}
            shadow-camera-right={object.shadowSize}
            shadow-camera-top={object.shadowSize}
            shadow-camera-bottom={-object.shadowSize}
          />
          {/* Same target-follows-rotation trick as the spot light above —
              rotation 0 points straight down. */}
          <object3D ref={targetRef} position={[0, -1, 0]} />
          {/* Plane + direction line, like kokraf's DirectionalLightHelper —
              built directly in local space (already a child of the rotated
              icon mesh) instead of reoriented via `lookAt`. */}
          {gizmosVisible && (
            <>
              <lineSegments geometry={DIRECTIONAL_PLANE_GEOMETRY} raycast={() => null}>
                <lineBasicMaterial color={gizmoColor} toneMapped={false} />
              </lineSegments>
              <lineSegments
                geometry={DIRECTIONAL_LINE_GEOMETRY}
                scale={[1, DIRECTIONAL_PREVIEW_LENGTH, 1]}
                raycast={() => null}
              >
                <lineBasicMaterial color={gizmoColor} toneMapped={false} />
              </lineSegments>
            </>
          )}
        </>
      )}
    </>
  )
}

export const SceneObjectMesh = forwardRef<Mesh, { object: SceneObject }>(
  function SceneObjectMesh({ object }, ref) {
    const selectedId = useEditorStore((s) => s.selectedId)
    const select = useEditorStore((s) => s.select)
    const group = useEditorStore((s) =>
      object.groupId ? s.groups.find((g) => g.id === object.groupId) : undefined,
    )
    const lightGizmosVisible = useEditorStore((s) => s.lightGizmosVisible)
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

    if (isLightKind(object.kind)) {
      return (
        <mesh
          ref={ref}
          name={object.id}
          position={object.position}
          rotation={object.rotation}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <LightIcon
            object={object}
            isSelected={isSelected}
            gizmosVisible={lightGizmosVisible}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          />
        </mesh>
      )
    }

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
