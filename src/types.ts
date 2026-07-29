export type PrimitiveKind = 'box' | 'sphere' | 'cylinder' | 'plane' | 'cone'

// Which faces render — mirrors THREE.FrontSide/BackSide/DoubleSide.
export type MaterialSide = 'front' | 'back' | 'double'

// Cast/receive shadow combination, matching Spline's Visibility > Shadows
// dropdown (Cast & Receive / Cast only / Receive only / None).
export type ShadowMode = 'none' | 'cast' | 'receive' | 'both'

// Shading model, matching Spline's Material > Lighting > Type dropdown.
// 'standard' is our pre-existing default (MeshStandardMaterial, PBR
// roughness/metalness) and isn't one of Spline's four options — kept as the
// default here so existing objects keep rendering exactly as before.
export type MaterialType = 'standard' | 'lambert' | 'phong' | 'physical' | 'toon'

export interface SceneObject {
  id: string
  name: string
  kind: PrimitiveKind
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  snapToObjects: boolean
  locked: boolean
  hidden: boolean
  groupId: string | null
  wireframe: boolean
  flatShading: boolean
  side: MaterialSide
  shadowMode: ShadowMode
  materialType: MaterialType
}

// Visual/organizational grouping only for now — no real 3D parenting yet
// (a group has no transform of its own, and objects keep their own
// world-space position/rotation/scale regardless of group membership).
// This is the data-model bridge for when we do add real parenting later:
// SceneObject.groupId already points at the owning group, so adding actual
// transform composition later is additive, not a redesign.
export interface SceneGroup {
  id: string
  name: string
  locked: boolean
  hidden: boolean
}

// Per-scene environment settings — background color and lighting for now,
// saved alongside objects/groups so each scene can look different.
export interface SceneSettings {
  backgroundColor: string
  ambientIntensity: number
  directionalIntensity: number
}

export type TransformMode = 'translate' | 'rotate' | 'scale' | 'scaleFree'

export type PositionSnapMode = number | null

// Ground grid rendering style — 'dots' restricts the grid lines down to
// just their intersections (see GridMaterial.ts / GridLine.cross).
export type GridStyle = 'lines' | 'dots'

// Display unit for the SnapBar's pés/m toggle — visual only for now, not
// yet wired to convert any displayed numbers (position/scale/dimensions
// stay in meters everywhere regardless of this value).
export type LengthUnit = 'm' | 'ft'

// Rendering quality preset (Loftcraft-style). 'low' disables shadows.
// 'medium'/'high' both keep shadows on — we have no ambient-occlusion or
// texture pipeline yet to differentiate them further.
export type GraphicsQuality = 'low' | 'medium' | 'high'

export interface SceneMeta {
  id: string
  name: string
}
