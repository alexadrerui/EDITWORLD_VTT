import type { LightKind, PrimitiveKind, ShadowResolution } from '../types'

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
  pointLight: 'Luz de ponto',
  spotLight: 'Luz spot',
  directionalLight: 'Luz direcional',
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

// How much bigger than the object the selection outline is drawn (see
// SelectionOutline.tsx). Shared with ScaleFaceHandles.tsx so the scale
// handles sit flush on the selection box itself, not on the object's own
// surface — visually they belong to the selection box, not the object.
export const SELECTION_OUTLINE_PADDING = 1.08
