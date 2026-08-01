import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react'
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
  type Object3D,
  PositionalAudio,
  type PointLight,
  type Side,
  type SpotLight,
} from 'three'
import {
  MeshLambertNodeMaterial,
  MeshPhongNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  MeshToonNodeMaterial,
  type NodeMaterial,
} from 'three/webgpu'
import {
  clamp,
  Fn,
  mix,
  mx_fractal_noise_float,
  normalWorld,
  positionWorld,
  reference,
  smoothstep,
  vec3,
  vec4,
} from 'three/tsl'
import type { MaterialSide, MaterialType, SceneObject, ShadowMode } from '../types'
import { useEditorStore } from '../state/useEditorStore'
import { usePointerClick } from './usePointerClick'
import {
  computeNormalBias,
  computeShadowRadius,
  isImportedModelKind,
  isLightKind,
  isSoundKind,
  PRIMITIVE_BASE_SIZE,
  SHADOW_MAP_SIZE,
} from './primitives'
import { useAudioBuffer, useImageTexture, useImportedModel, useVideoTexture } from './assetLoaders'
import { globalAudioListener } from './audioListener'
import { useAnimationPreview } from '../animation/animationEngine'
import { registerMesh, unregisterMesh } from '../animation/meshRegistry'

const MATERIAL_SIDE: Record<MaterialSide, Side> = {
  front: FrontSide,
  back: BackSide,
  double: DoubleSide,
}

// Classic JSX material tags (`<meshStandardMaterial>` etc.) don't expose
// `castShadowNode` — that field only exists on `NodeMaterial` (confirmed in
// node_modules/three/src/materials/nodes/NodeMaterial.js; the base classic
// `Material` class has no such property), and the WebGPURenderer's automatic
// classic-material-to-node conversion happens internally without ever
// handing the resulting node material back to userland code. So every
// object's material is now a real `three/webgpu` NodeMaterial instance built
// here directly (one per shading model, matching MaterialType) instead of a
// JSX tag — see the OPACITY_SHADOW_NODE comment below for why.
const MATERIAL_CLASS = {
  standard: MeshStandardNodeMaterial,
  lambert: MeshLambertNodeMaterial,
  phong: MeshPhongNodeMaterial,
  physical: MeshPhysicalNodeMaterial,
  toon: MeshToonNodeMaterial,
} satisfies Record<MaterialType, new () => NodeMaterial>

// Colored/opacity-aware shadow casting, ported from three.js's own
// webgpu_shadowmap_opacity.html example: without this, the shadow map only
// ever stores binary occlusion, so a translucent object (SceneObject.opacity
// < 1) still casts a fully solid black shadow no matter how see-through it
// actually is. Requires `renderer.shadowMap.transmitted = true` (see
// Editor3D.tsx) — three.js logs a one-time warning if that's left off.
//
// Three real, non-obvious bugs found by directly sampling rendered shadow
// pixels (canvas.toDataURL) rather than trusting a glance:
//
// 1. MUST be a vec4 with an explicit alpha, not a bare vec3 `mix(...)` (the
//    shape the upstream example itself uses, via `castShadowNode.a`).
//    Renderer.js's `_getShadowNodes` reads `castShadowNode.a` directly
//    (`shadowAlpha = castShadowNode.a`) — swizzling a non-existent 4th
//    component off a vec3 doesn't error, it just doesn't carry the value
//    forward, which zeroes out the colored-shadow contribution downstream.
//    Without this fix, a fully opaque object's shadow and a fully invisible
//    (opacity 0) one's were pixel-identical — the whole feature was silently
//    doing nothing despite looking plausible in an earlier casual check.
//
// 2. `materialColor`/`materialOpacity` (the generic "whichever material is
//    live" accessors from 'three/tsl') do NOT resolve to the casting
//    object's own material here — confirmed by swapping in
//    `vec4(materialColor, 1)` and seeing every object's shadow stay neutral
//    gray regardless of its actual color. Shadow casting compiles this node
//    against a separate internal depth-material context, not the original
//    mesh material, so the generic "current material" accessors read that
//    context instead. Fixed with `reference(prop, type, object)` — the same
//    idiom three.js's own ShadowNode.js uses internally (e.g. `reference(
//    'intensity', 'float', shadow)`) — which captures a direct pointer to
//    THIS specific material instance at node-creation time, sidestepping
//    "current compile context" entirely. This is also why the node can no
//    longer be a single module-level shared constant — it has to be built
//    per material instance, closing over that instance's own
//    `material.color`/`material.opacity`.
//
// 3. `mix(1, color, opacity)` — the upstream example's own formula — tints
//    the shadow at opacity 1 (fully opaque, the default for every object)
//    with the object's own diffuse color instead of a neutral shadow. That
//    formula makes sense for the example's actual subject (a glass dragon
//    with real light transmission, where "opacity 1" means "fully
//    transmissive"), but for our plain alpha-blend `opacity` — where 1 means
//    "an ordinary solid object" — it silently recolors literally every
//    existing opaque object's shadow, confirmed by pixel-sampling a red
//    sphere's shadow at opacity 1 as `(79,61,61)` (reddish) vs. `(60,60,60)`
//    (neutral) before this feature ever existed. Fixed with a formula the
//    user explicitly asked for: neutral at opacity 1 (grayscale envelope
//    `vec3(1 - opacity)` — black/full shadow at opacity 1, white/no shadow
//    at opacity 0, same convention the plain PCF shadow already used) with a
//    "hat" weight (`1 - |2·opacity - 1|`, zero at both opacity endpoints,
//    peaking at opacity 0.5) blending in the object's own color only while
//    it's actually translucent. A solid opaque object's shadow is now
//    pixel-identical to before this feature existed; only partway-
//    transparent objects tint their own shadow.
//
// Verified with a step-by-step elimination: (a) a hardcoded `vec4(1,0,0,1)`
// made every shadow visibly solid red — proved the transmitted-shadow
// pipeline itself works; (b) `vec4(materialColor, 1)` stayed neutral gray —
// isolated bug 2 to material-context resolution, not the vec3/vec4 shape;
// (c) `reference()` + the original `mix(1, color, opacity)` formula
// correctly faded/tinted translucent objects but revealed bug 3 (tinted
// opaque objects too); (d) this grayscale-envelope + hat-weight version —
// confirmed pixel-sampled neutral at opacity 1, fading white at opacity 0,
// and tinted only in between.
function buildOpacityShadowNode(material: NodeMaterial) {
  const color = reference('color', 'color', material)
  const opacity = reference('opacity', 'float', material)
  return Fn(() => {
    const base = vec3(opacity.oneMinus())
    const tintWeight = opacity.mul(2).sub(1).abs().oneMinus()
    return vec4(mix(base, color, tintWeight), 1)
  })()
}

// World-space noise frequency for dirt patches — tuned by eye against the
// primitives' default size (~1 unit): high enough that a 1-unit face shows
// several scattered specks/patches rather than one smooth blob, not tied to
// any per-object scale, so patch size stays consistent as an object scales.
const DIRT_NOISE_SCALE = 5
// Coarser than dirt (bigger, softer patches) and offset so the two patterns
// don't perfectly overlap — reads as two separate weathering effects
// instead of one mask reused twice.
const FADE_NOISE_SCALE = 2.5
const FADE_NOISE_OFFSET = vec3(37.1, 91.7, 12.3)

// Procedural weathering (img2threejs skill's "localOverrides": dirt/wear as
// local material overrides rather than a separate texture) — triplanar
// world-space noise instead of UV-based, so it works on any primitive
// (including ones with no meaningful UV layout, like a torus knot) without
// extra setup. Two independent effects, matching the skill's guidance that
// dirt and fading read as different phenomena, not one slider:
//   - dirtAmount: darkens/tints upward-facing surfaces where noise peaks
//     (dust accumulates on top-facing areas, not on vertical/underside
//     faces — cheap stand-in for the skill's "cavityBias").
//   - wearAmount: lightens/desaturates surfaces in scattered patches (the
//     skill's "fadedMask" — sun-bleaching, not edge-only wear), same noise
//     technique as dirt but its own frequency/offset and no up-facing bias.
//     A first version tried highlighting geometric edges/corners instead
//     (screen-space normal derivatives, then an object-space
//     abs(normalWorld) triplanar-blend proxy) — both failed for this
//     project's actual geometry: BoxGeometry (and the other primitives)
//     give every face its own unshared vertex normals, so there is no
//     fragment where the normal is ever "between" two faces to detect an
//     edge from — the derivative approach was real but only ever 1 screen
//     pixel wide, and the triplanar proxy was mathematically zero
//     everywhere. Real edge/corner wear would need actual mesh curvature
//     analysis (bevel geometry or per-vertex curvature data), which this
//     project has no pipeline for — the noise-based fade below is the
//     honest, working substitute.
// Built once per material instance (paired with the castShadowNode setup
// below) and read live via `reference()`, same pattern as
// buildOpacityShadowNode — updating the expando properties in the Material
// effect below is enough, no node-graph rebuild needed.
type WeatheredMaterial = NodeMaterial & {
  dirtAmount?: number
  wearAmount?: number
  weatheringColor?: Color
}

function buildWeatheringNode(material: NodeMaterial) {
  const baseColor = reference('color', 'color', material)
  const dirtAmount = reference('dirtAmount', 'float', material)
  const wearAmount = reference('wearAmount', 'float', material)
  const weatheringColor = reference('weatheringColor', 'color', material)
  return Fn(() => {
    const dirtNoise = mx_fractal_noise_float(positionWorld.mul(DIRT_NOISE_SCALE), 3, 2.0, 0.5)
      .mul(0.5)
      .add(0.5)
    const upFacing = clamp(normalWorld.y, 0, 1)
    const dirtMask = smoothstep(0.4, 0.7, dirtNoise).mul(upFacing).mul(dirtAmount)

    const fadeNoise = mx_fractal_noise_float(
      positionWorld.mul(FADE_NOISE_SCALE).add(FADE_NOISE_OFFSET),
      2,
      2.0,
      0.5,
    )
      .mul(0.5)
      .add(0.5)
    const fadeMask = smoothstep(0.5, 0.75, fadeNoise).mul(wearAmount)

    const dirtied = mix(baseColor, weatheringColor, dirtMask)
    const faded = mix(dirtied, dirtied.add(vec3(0.35)).clamp(0, 1), fadeMask)
    return faded
  })()
}

function Material({ object }: { object: SceneObject }) {
  // Rebuilt only when the shading model itself changes — everything else is
  // applied onto the same instance below via plain property assignment
  // (there's no declarative JSX prop-diffing for a `<primitive>`-attached
  // material, so this has to be done imperatively).
  const material = useMemo(() => new MATERIAL_CLASS[object.materialType](), [object.materialType])
  const isTransparent = object.opacity < 1

  // videoMapAssetId and colorMapAssetId are mutually exclusive (enforced in
  // the Inspector UI) — video wins if somehow both are set.
  const colorMapTexture = useImageTexture(object.colorMapAssetId)
  const videoMapTexture = useVideoTexture(object.videoMapAssetId)

  // Dispose the GPU-side resources of the outgoing instance, whether it's
  // being replaced by a materialType change or the object itself is removed.
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    material.castShadowNode = buildOpacityShadowNode(material)
    // Own Color instance for the expando `weatheringColor` property
    // buildWeatheringNode's `reference('weatheringColor', 'color', ...)`
    // reads live — same idea as the material's own built-in `color`/
    // `emissive` Color instances, just not a real Material property.
    ;(material as WeatheredMaterial).weatheringColor = new Color()
    material.colorNode = buildWeatheringNode(material)
  }, [material])

  useEffect(() => {
    material.color.set(object.color)
    material.emissive.set(object.emissiveColor)
    material.emissiveIntensity = object.emissiveIntensity
    material.side = MATERIAL_SIDE[object.side]
    material.opacity = object.opacity
    material.map = videoMapTexture ?? colorMapTexture ?? null
    // `transparent` is derived, not a separate stored field — three.js only
    // sorts/blends objects as transparent when this is explicitly true, so
    // opacity < 1 alone would render a see-through object as if opaque
    // (visible artifacts at edges, no blending with what's behind it).
    material.transparent = isTransparent
    material.depthWrite = !isTransparent
    // No-op expando assignment for 'lambert'/'phong'/'toon' (same as
    // `flatShading` below) — those material classes have no roughness/
    // metalness concept, so this only actually does something for
    // 'standard'/'physical'.
    ;(material as NodeMaterial & { roughness?: number; metalness?: number }).roughness =
      object.roughness
    ;(material as NodeMaterial & { roughness?: number; metalness?: number }).metalness =
      object.metalness
    // Weathering — see buildWeatheringNode. Plain property writes; the node
    // graph built above reads them live via reference(), no rebuild needed.
    const weathered = material as WeatheredMaterial
    weathered.dirtAmount = object.dirtAmount
    weathered.wearAmount = object.wearAmount
    weathered.weatheringColor?.set(object.weatheringColor)
  }, [
    material,
    object.color,
    object.emissiveColor,
    object.emissiveIntensity,
    object.side,
    object.opacity,
    object.roughness,
    object.metalness,
    object.dirtAmount,
    object.wearAmount,
    object.weatheringColor,
    isTransparent,
    colorMapTexture,
    videoMapTexture,
  ])

  // `wireframe`/`flatShading` change which shader variant the material
  // compiles to, and so does crossing the transparent/opaque boundary above —
  // plain property assignment updates the flags but doesn't know to force a
  // recompile, so the old compiled pipeline keeps rendering until
  // `needsUpdate` is set explicitly (materialType itself doesn't need this:
  // it gets a brand new instance from the useMemo above, not a flag flip).
  useEffect(() => {
    material.wireframe = object.wireframe
    // MeshToonNodeMaterial (unlike the other 4 shading models) has no
    // `flatShading` — toon shading is always faceted via its gradient map,
    // so this is simply a no-op expando assignment for that one material
    // type, same as the old JSX version silently ignored the prop there too.
    ;(material as NodeMaterial & { flatShading?: boolean }).flatShading = object.flatShading
    material.needsUpdate = true
  }, [material, object.wireframe, object.flatShading, isTransparent])

  return <primitive object={material} attach="material" />
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

// Fixed depth bias — unlike normalBias (see computeNormalBias in
// primitives.ts), this is a small, scale-independent correction for raw
// depth-buffer quantization error, not something that visibly detaches a
// shadow from its object when too large, so it doesn't need texel-scaling.
// Not exposed in the Inspector — same reasoning as the scene light: not
// worth a per-light UI control unless acne actually shows up visibly for
// someone.
const LIGHT_SHADOW_BIAS = -0.0005

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
  gizmosVisible,
  onPointerDown,
  onPointerUp,
}: {
  object: SceneObject
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
  // Selection is indicated by SelectionOutline (the blue box), not by
  // recoloring the icon — tinting this the same blue used to mask the
  // light's own configured color while adjusting it in the Inspector,
  // exactly the same problem the mesh Material component had.
  const gizmoColor = object.color

  // Adaptive shadow-camera framing for directional light-objects, same
  // technique as the scene's own always-on directional light (Editor3D.tsx)
  // — without this, `object.shadowSize` was a fixed frustum that could clip
  // shadows once objects moved far enough from the origin, unlike the scene
  // light. `object.shadowSize` becomes the floor `computeShadowRadius` never
  // shrinks below, rather than the sole value — the user's own "Tamanho"
  // slider still does something once the scene auto-grows past it. Kept out
  // of the light's remount `key` below on purpose: unlike `shadowResolution`/
  // `shadowSize` changing (a deliberate, rare edit that needs a fresh shadow
  // map texture), this recomputes continuously as objects move — the scene
  // light already proves camera-frustum bounds are safe to update live,
  // reactively, without remounting, so there's no need to pay for a full
  // light remount on every object drag elsewhere in the scene.
  const objects = useEditorStore((s) => s.objects)
  const directionalShadowRadius = useMemo(
    () => computeShadowRadius(objects, object.shadowSize),
    [objects, object.shadowSize],
  )

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

  // Texel-proportional normalBias (see computeNormalBias in primitives.ts) —
  // point/spot have no single orthographic frustum width like the
  // directional cases do, so their "frustum size" is approximated from the
  // light's own reach (`lightDistance`, floored so an unbounded-falloff
  // light — distance 0 — doesn't collapse the bias to ~0). Point lights
  // shadow via 90°-FOV cubemap faces (tan(45°) = 1, so reach alone already
  // matches `2 * distance * tan(fov/2)`); spot lights fold in their actual
  // cone angle.
  const lightReach = Math.max(object.lightDistance, 5)
  const pointNormalBias = computeNormalBias(lightReach * 2, shadowMapSize)
  const spotNormalBias = computeNormalBias(
    lightReach * 2 * Math.tan(object.lightAngle),
    shadowMapSize,
  )
  const directionalNormalBias = computeNormalBias(directionalShadowRadius * 2, shadowMapSize)

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
          shadow-normalBias={pointNormalBias}
          shadow-bias={LIGHT_SHADOW_BIAS}
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
            shadow-normalBias={spotNormalBias}
            shadow-bias={LIGHT_SHADOW_BIAS}
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
            // Also remount when the user's own shadowSize (the floor —
            // see directionalShadowRadius above) changes — like mapSize
            // above, resizing that live is unreliable (see the pointLight
            // key comment for the full story on why this fixes a real
            // WebGPU error). NOT keyed on directionalShadowRadius itself —
            // that recomputes continuously as any object in the scene
            // moves, and the scene's own directional light already proves
            // shadow-camera-left/right/top/bottom are safe to update live
            // without a remount.
            key={`${object.shadowResolution}-${object.shadowSize}`}
            ref={dirRef}
            color={object.color}
            intensity={object.lightIntensity}
            castShadow={object.castLightShadow}
            shadow-mapSize={[shadowMapSize, shadowMapSize]}
            shadow-radius={shadowRadius}
            shadow-camera-left={-directionalShadowRadius}
            shadow-camera-right={directionalShadowRadius}
            shadow-camera-top={directionalShadowRadius}
            shadow-camera-bottom={-directionalShadowRadius}
            shadow-normalBias={directionalNormalBias}
            shadow-bias={LIGHT_SHADOW_BIAS}
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

// soundSource has no real geometry either, same "small unlit icon mesh"
// approach as LightIcon above — an octahedron gizmo plus an invisible bigger
// pick sphere, with a THREE.PositionalAudio node parented under it so the
// audio's panning follows this object's position for free. Never autoplays
// on its own (see SOUND_DEFAULTS.autoplayIntent — saved but unused today);
// the only thing that ever calls .play()/.stop() is the "▶ Testar" button in
// Inspector.tsx, bridged through the store's testingSoundId (this component
// lives inside the Canvas tree, the button doesn't).
function SoundIcon({
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
  const radius = PRIMITIVE_BASE_SIZE[object.kind][0] / 2
  const gizmoColor = isSelected ? '#3a6df0' : object.color
  const buffer = useAudioBuffer(object.assetId)
  const isTesting = useEditorStore((s) => s.testingSoundId === object.id)
  const audio = useMemo(() => new PositionalAudio(globalAudioListener), [])

  useEffect(() => {
    if (!buffer) return
    audio.setBuffer(buffer)
    audio.setDistanceModel('linear')
    audio.setLoop(object.soundLoop)
    audio.setVolume(object.soundVolume)
    audio.setRefDistance(object.soundRefDistance)
    audio.setMaxDistance(object.soundMaxDistance)
  }, [audio, buffer, object.soundLoop, object.soundVolume, object.soundRefDistance, object.soundMaxDistance])

  useEffect(() => {
    if (!buffer) return
    if (isTesting && !audio.isPlaying) audio.play()
    else if (!isTesting && audio.isPlaying) audio.stop()
  }, [audio, isTesting, buffer])

  // Stop cleanly if the object is deleted (or the asset changes) mid-test,
  // rather than leaving an orphaned source playing after its node is gone.
  useEffect(() => () => {
    if (audio.isPlaying) audio.stop()
  }, [audio])

  return (
    <>
      {gizmosVisible && (
        <>
          <octahedronGeometry args={[radius, 0]} />
          <meshBasicMaterial color={gizmoColor} wireframe />
          <mesh visible={false} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
            <sphereGeometry args={[radius * LIGHT_PICK_RADIUS_SCALE, 8, 6]} />
          </mesh>
        </>
      )}
      <primitive object={audio} />
    </>
  )
}

// Placeholder shown while a model asset is loading, or in place of it
// permanently if the referenced blob is missing from IndexedDB (deleted, or
// browser data cleared — see assetStore.ts) — a dashed-looking wireframe box
// reads as "something's missing" rather than the object silently vanishing.
// A dimmer neutral gray for the brief 'loading' state keeps it visually
// distinct from the amber 'error' one (missing/corrupt asset), rather than
// both looking identically broken while parsing is still in flight.
const MISSING_ASSET_COLOR = '#e2a83a'
const LOADING_PLACEHOLDER_COLOR = '#565b66'

function ImportedModelContent({ object }: { object: SceneObject }) {
  const { status, model } = useImportedModel(object.assetId)
  if (status === 'ready' && model) {
    return <primitive object={model} />
  }
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color={status === 'loading' ? LOADING_PLACEHOLDER_COLOR : MISSING_ASSET_COLOR}
        wireframe
      />
    </mesh>
  )
}

export const SceneObjectMesh = forwardRef<Mesh, { object: SceneObject }>(
  function SceneObjectMesh({ object }, ref) {
    const select = useEditorStore((s) => s.select)
    const toggleSelect = useEditorStore((s) => s.toggleSelect)
    const isSelected = useEditorStore((s) => s.selectedIds.includes(object.id))
    const group = useEditorStore((s) =>
      object.groupId ? s.groups.find((g) => g.id === object.groupId) : undefined,
    )
    const lightGizmosVisible = useEditorStore((s) => s.lightGizmosVisible)
    // Whether an anime.js timeline currently owns this object's transform
    // (either the single-object engine — animationEngine.ts's
    // useAnimationPreview — or a Cutscene track this object is part of, see
    // cutsceneEngine.ts) — while true, the declarative position/rotation/
    // scale props below are suppressed so the timeline's imperative writes
    // aren't fought/overwritten every render.
    const isPreviewingAnimation = useEditorStore(
      (s) => s.testingAnimationId !== null && s.testingAnimationId === object.animationId,
    )
    const isPreviewingCutscene = useEditorStore((s) => {
      if (!s.testingCutsceneId) return false
      const cutscene = s.cutscenes.find((c) => c.id === s.testingCutsceneId)
      return !!cutscene?.tracks.some((t) => t.objectId === object.id)
    })
    const isPreviewing = isPreviewingAnimation || isPreviewingCutscene
    // Own ref, merged with the forwarded one (ScaleFaceHandles.tsx/
    // SelectionOutline.tsx read the forwarded ref imperatively per frame) —
    // useAnimationPreview needs something to read/write independent of
    // whoever else holds `ref`. Also registered into meshRegistry.ts so
    // cutsceneEngine.ts's shared timeline (built outside this component) can
    // find this specific object's mesh by id.
    const meshRef = useRef<Mesh>(null)
    const setRefs = useCallback(
      (node: Mesh | null) => {
        meshRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref],
    )
    useEffect(() => {
      registerMesh(object.id, meshRef)
      return () => unregisterMesh(object.id)
    }, [object.id])
    useAnimationPreview(meshRef, object)

    // Shift/Ctrl/Cmd-click adds-or-removes this object from the selection
    // instead of replacing it — same modifier convention used by the
    // Hierarchy rows (see Hierarchy.tsx).
    const { onPointerDown, onPointerUp } = usePointerClick((e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      const native = e.nativeEvent
      if (native.shiftKey || native.ctrlKey || native.metaKey) toggleSelect(object.id)
      else select(object.id)
    })

    // Three.js raycasting ignores `visible` (only rendering respects it), so
    // a hidden object would still be clickable/draggable if just toggled via
    // a `visible` prop. Skipping the mesh entirely instead removes it from
    // both rendering and hit-testing, and un-registers its ref (no gizmo/
    // outline can target it while hidden, which is the point). Hiding the
    // owning group cascades the same way, even without real 3D parenting.
    if (object.hidden || group?.hidden) return null

    if (isImportedModelKind(object.kind)) {
      return (
        <mesh
          ref={setRefs}
          name={object.id}
          position={isPreviewing ? undefined : object.position}
          rotation={isPreviewing ? undefined : object.rotation}
          scale={isPreviewing ? undefined : object.scale}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <ImportedModelContent object={object} />
        </mesh>
      )
    }

    if (isLightKind(object.kind)) {
      return (
        <mesh
          ref={setRefs}
          name={object.id}
          position={object.position}
          rotation={object.rotation}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <LightIcon
            object={object}
            gizmosVisible={lightGizmosVisible}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          />
        </mesh>
      )
    }

    if (isSoundKind(object.kind)) {
      return (
        <mesh
          ref={setRefs}
          name={object.id}
          position={object.position}
          rotation={object.rotation}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <SoundIcon
            object={object}
            isSelected={isSelected}
            // Reuses the same "Esconder ícones de luz" toggle as LightIcon —
            // both are small always-on visual affordances for kinds with no
            // real geometry, no separate toggle added just for sound icons.
            gizmosVisible={lightGizmosVisible}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          />
        </mesh>
      )
    }

    return (
      <mesh
        ref={setRefs}
        name={object.id}
        position={isPreviewing ? undefined : object.position}
        rotation={isPreviewing ? undefined : object.rotation}
        scale={isPreviewing ? undefined : object.scale}
        {...shadowProps(object.shadowMode)}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <Geometry kind={object.kind} />
        <Material object={object} />
      </mesh>
    )
  },
)
