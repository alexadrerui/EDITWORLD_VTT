import {
  Box,
  Boxes,
  Circle,
  Cone,
  Cylinder,
  Gem,
  Hexagon,
  Infinity as InfinityIcon,
  Lightbulb,
  Spotlight,
  Square,
  Sun,
  Torus,
  Pyramid,
  Volume2,
  type LucideIcon,
} from 'lucide-react'
import type { ImportedKind, LightKind, PrimitiveKind, SceneObject, ShadowResolution } from '../types'

// Bounding-box size (width, height, depth) of each primitive's base geometry
// at scale [1, 1, 1] — must match the geometry args in SceneObjectMesh.tsx's
// Geometry component. Shared so the Inspector's read-only "Tamanho" line
// (dimensions = base size * object.scale) can't drift out of sync with what's
// actually rendered. Light kinds map to their small gizmo icon size (see
// SceneObjectMesh.tsx) — lights have no real geometry, but SelectionOutline/
// ScaleFaceHandles key off this same table, so giving them an entry here lets
// selection outline work unmodified.
export const PRIMITIVE_BASE_SIZE: Record<PrimitiveKind, [number, number, number]> = {
  box: [1, 1, 1],
  sphere: [1.2, 1.2, 1.2],
  cylinder: [1, 1, 1],
  cone: [1.2, 1, 1.2],
  plane: [2, 0.05, 2],
  // Outer diameter 2*(radius+tube) = 1, height = 2*tube = 0.3 — matches the
  // TorusGeometry args in SceneObjectMesh.tsx's Geometry component.
  torus: [1, 0.3, 1],
  // Same shape as `cone` (ConeGeometry), just 4 radial segments instead of 32.
  pyramid: [1.2, 1, 1.2],
  // Circumscribed-sphere radius 0.65 approximates the bounding box closely
  // enough for these fairly round polyhedra (same tolerance already accepted
  // for `sphere`/`cone` above — SelectionOutline only ever draws a box).
  icosahedron: [1.3, 1.3, 1.3],
  dodecahedron: [1.3, 1.3, 1.3],
  // TorusKnotGeometry's default winding extends further than radius+tube —
  // approximated, same tolerance as the other round shapes above.
  torusKnot: [1.6, 1.2, 1.6],
  pointLight: [0.4, 0.4, 0.4],
  spotLight: [0.4, 0.4, 0.4],
  directionalLight: [0.4, 0.4, 0.4],
  // Placeholder footprint before the real GLTF bounding box is known (see
  // useImportedModel in SceneObjectMesh.tsx) — [1,1,1] is a neutral "about
  // one meter" reference, same spirit as a mesh primitive's own base size.
  importedModel: [1, 1, 1],
  // Same small gizmo-icon size as the light kinds above — soundSource has no
  // real geometry either.
  soundSource: [0.4, 0.4, 0.4],
}

export const PRIMITIVE_LABEL: Record<PrimitiveKind, string> = {
  box: 'Cubo',
  sphere: 'Esfera',
  cylinder: 'Cilindro',
  cone: 'Cone',
  plane: 'Placa',
  torus: 'Torus',
  pyramid: 'Pirâmide',
  icosahedron: 'Icosaedro',
  dodecahedron: 'Dodecaedro',
  torusKnot: 'Nó de torus',
  pointLight: 'Luz de ponto',
  spotLight: 'Luz spot',
  directionalLight: 'Luz direcional',
  importedModel: 'Modelo importado',
  soundSource: 'Fonte de som',
}

// Shared with Hierarchy.tsx and AssetBrowser.tsx so the icon-per-kind mapping
// can't drift between the two places that list primitives.
export const PRIMITIVE_ICON: Record<PrimitiveKind, LucideIcon> = {
  box: Box,
  sphere: Circle,
  cylinder: Cylinder,
  cone: Cone,
  plane: Square,
  torus: Torus,
  pyramid: Pyramid,
  icosahedron: Gem,
  dodecahedron: Hexagon,
  torusKnot: InfinityIcon,
  pointLight: Lightbulb,
  spotLight: Spotlight,
  directionalLight: Sun,
  importedModel: Boxes,
  soundSource: Volume2,
}

export const LIGHT_KINDS: LightKind[] = ['pointLight', 'spotLight', 'directionalLight']

export function isLightKind(kind: PrimitiveKind): kind is LightKind {
  return kind === 'pointLight' || kind === 'spotLight' || kind === 'directionalLight'
}

export function isImportedModelKind(kind: PrimitiveKind): kind is 'importedModel' {
  return kind === 'importedModel'
}

export function isSoundKind(kind: PrimitiveKind): kind is 'soundSource' {
  return kind === 'soundSource'
}

export const IMPORTED_KINDS: ImportedKind[] = ['importedModel', 'soundSource']

// Default light parameters used when a new light object is created (see
// createPrimitive in useEditorStore.ts) and as the migration default for
// older saves that predate lights. Intensity/decay follow three.js's own
// physically-correct defaults (decay 2); distance 0 means no falloff limit.
// lightDistance/lightDecay/lightAngle/lightPenumbra are unused for
// directionalLight (three.js's DirectionalLight has no falloff or cone), same
// convention as mesh-only fields being unused on lights.
export const LIGHT_DEFAULTS = {
  lightIntensity: 8,
  lightDistance: 0,
  lightDecay: 2,
  lightAngle: Math.PI / 6,
  lightPenumbra: 0.3,
  castLightShadow: false,
  shadowResolution: 'normal' as ShadowResolution,
  shadowBlur: 1,
  shadowPenumbra: 0,
  shadowSize: 15,
}

// Default sound parameters, same role as LIGHT_DEFAULTS above — used both by
// createPrimitive (new soundSource objects) and loadSceneData's migration
// (older saves that predate sound/asset fields, including non-sound objects,
// which just carry these around unused, same convention as light-only
// fields being unused on meshes). refDistance/maxDistance mirror three.js's
// PositionalAudio panner defaults (linear rolloff within that range).
export const SOUND_DEFAULTS = {
  soundVolume: 1,
  soundLoop: true,
  soundRefDistance: 5,
  soundMaxDistance: 30,
  autoplayIntent: false,
}

// Directional lights aren't distance-attenuated, so they need a much lower
// intensity than point/spot to look comparable — matches the scene's own
// always-on directional default (SceneSettings.directionalIntensity: 3).
export const DIRECTIONAL_LIGHT_INTENSITY = 3

// Shadow map resolution presets, matching Spline's Light > Shadows >
// Resolution dropdown (Low/Normal/High).
export const SHADOW_MAP_SIZE: Record<ShadowResolution, number> = {
  low: 512,
  normal: 1024,
  high: 2048,
}

const SHADOW_RADIUS_MARGIN = 1.15

// Dynamic shadow-camera framing, shared by the scene's own always-on
// directional light (Editor3D.tsx) and directional light-objects
// (SceneObjectMesh.tsx) — a fixed frustum clips shadows once objects move
// far from the origin. Recomputed from the current scene's objects instead —
// same idea as the folio-2025-study reference (see editworld-vtt skill
// notes), simplified to an origin-centered radius rather than a full
// off-center bounding box. Never shrinks below `minRadius`, so small/empty
// scenes (or a light-object whose own manually-set `shadowSize` is bigger
// than what the scene currently needs) keep that framing instead of
// shrinking to fit. `minRadius` is a fixed constant for the scene light
// (`DEFAULT_SHADOW_RADIUS`) but the user's own `object.shadowSize` for
// light-objects — that field becomes a floor the frustum never shrinks
// below, rather than the sole value, so it still does something useful once
// the scene auto-grows past it.
export function computeShadowRadius(objects: SceneObject[], minRadius: number): number {
  let maxReach = minRadius
  for (const object of objects) {
    const [w, h, d] = PRIMITIVE_BASE_SIZE[object.kind]
    const halfDiagonal =
      0.5 * Math.hypot(w * object.scale[0], h * object.scale[1], d * object.scale[2])
    const reach =
      Math.hypot(object.position[0], object.position[1], object.position[2]) + halfDiagonal
    if (reach > maxReach) maxReach = reach
  }
  return maxReach * SHADOW_RADIUS_MARGIN
}

// How many shadow-map texels of normalBias to apply — enough to push the
// sampled depth past self-shadowing "acne" on a grazing-angle surface,
// without pushing it so far the shadow visibly detaches from the object's
// own base ("peter-panning" — a fixed bias in world units doesn't scale
// with either the frustum size or the map resolution, so an amount tuned
// for one combination is wrong for others; this project's shadow frustums
// are dynamic (computeShadowRadius above), so the old fixed constant was
// only ever correct by accident at the scale it was originally tuned at).
const NORMAL_BIAS_TEXELS = 1
const MIN_NORMAL_BIAS = 0.002

// `frustumSize`: full width/height of the (square, orthographic) shadow
// camera frustum in world units — `2 * shadowRadius` for the scene sun and
// directional light-objects. For point/spot lights (perspective, no single
// frustum width), pass an approximate "reach" instead (e.g. the light's own
// `lightDistance`) — not exact for a perspective projection, but still
// scales the bias in the right direction instead of a constant that's
// wrong at every distance.
export function computeNormalBias(frustumSize: number, mapSize: number): number {
  return Math.max(MIN_NORMAL_BIAS, (frustumSize / mapSize) * NORMAL_BIAS_TEXELS)
}

// Default distance of the scene's own sun from the origin — independent of
// SHADOW_RADIUS's frustum sizing (that only sets the orthographic shadow
// camera's left/right/top/bottom planes, not the light's actual position).
// Just needs to stay comfortably inside the shadow camera's default near/far
// (0.5/500) at any elevation/azimuth.
const SUN_DISTANCE = 30

// Sun position from elevation/azimuth (degrees), matching three.js's own
// webgl_shaders_sky.html / webgpu_sky.html examples
// (`sun.setFromSphericalCoords(1, degToRad(90 - elevation), degToRad(azimuth))`)
// so the same two sliders that would drive a sky shader also drive this
// project's actual shadow-casting directional light — the scene's sun
// (Editor3D.tsx) no longer sits at a fixed position, so its shadow direction
// changes instead of staying static regardless of what SceneInspector's
// "Elevação"/"Azimute" fields are set to.
export function computeSunPosition(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const phi = ((90 - elevationDeg) * Math.PI) / 180
  const theta = (azimuthDeg * Math.PI) / 180
  const sinPhi = Math.sin(phi)
  return [
    SUN_DISTANCE * sinPhi * Math.sin(theta),
    SUN_DISTANCE * Math.cos(phi),
    SUN_DISTANCE * sinPhi * Math.cos(theta),
  ]
}

// How much bigger than the object the selection outline is drawn (see
// SelectionOutline.tsx) — a fixed world-space margin (meters), not a
// percentage. A percentage-based padding made the visual gap balloon on
// large/scaled-up objects while staying barely visible on small ones; this
// stays the same physical size regardless of the object's own scale. Shared
// with ScaleFaceHandles.tsx so the scale handles sit flush on the selection
// box itself, not on the object's own surface — visually they belong to the
// selection box, not the object.
export const SELECTION_OUTLINE_MARGIN = 0.08
