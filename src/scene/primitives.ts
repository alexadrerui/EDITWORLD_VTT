import {
  Box,
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
  type LucideIcon,
} from 'lucide-react'
import type { LightKind, PrimitiveKind, SceneObject, ShadowResolution } from '../types'

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
}

export const LIGHT_KINDS: LightKind[] = ['pointLight', 'spotLight', 'directionalLight']

export function isLightKind(kind: PrimitiveKind): kind is LightKind {
  return kind === 'pointLight' || kind === 'spotLight' || kind === 'directionalLight'
}

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

// How much bigger than the object the selection outline is drawn (see
// SelectionOutline.tsx) — a fixed world-space margin (meters), not a
// percentage. A percentage-based padding made the visual gap balloon on
// large/scaled-up objects while staying barely visible on small ones; this
// stays the same physical size regardless of the object's own scale. Shared
// with ScaleFaceHandles.tsx so the scale handles sit flush on the selection
// box itself, not on the object's own surface — visually they belong to the
// selection box, not the object.
export const SELECTION_OUTLINE_MARGIN = 0.08
