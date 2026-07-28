export type PrimitiveKind = 'box' | 'sphere' | 'cylinder' | 'plane' | 'cone'

export interface SceneObject {
  id: string
  name: string
  kind: PrimitiveKind
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  snapToObjects: boolean
}

export type TransformMode = 'translate' | 'rotate' | 'scale' | 'scaleFree'

export type PositionSnapMode = number | null

export interface SceneMeta {
  id: string
  name: string
}
