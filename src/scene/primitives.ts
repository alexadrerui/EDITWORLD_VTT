import type { PrimitiveKind } from '../types'

// Bounding-box size (width, height, depth) of each primitive's base geometry
// at scale [1, 1, 1] — must match the geometry args in SceneObjectMesh.tsx's
// Geometry component. Shared so the Inspector's read-only "Tamanho" line
// (dimensions = base size * object.scale) can't drift out of sync with what's
// actually rendered.
export const PRIMITIVE_BASE_SIZE: Record<PrimitiveKind, [number, number, number]> = {
  box: [1, 1, 1],
  sphere: [1.2, 1.2, 1.2],
  cylinder: [1, 1, 1],
  cone: [1.2, 1, 1.2],
  plane: [2, 0.05, 2],
}

export const PRIMITIVE_LABEL: Record<PrimitiveKind, string> = {
  box: 'Cubo',
  sphere: 'Esfera',
  cylinder: 'Cilindro',
  cone: 'Cone',
  plane: 'Placa',
}
