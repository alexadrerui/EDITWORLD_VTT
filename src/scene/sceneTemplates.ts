import type { SceneGroup, SceneObject, SceneSettings } from '../types'

// Ready-made scenes for the Asset Store's "Scenes" tab (see
// AssetStoreModal.tsx) — plain layout data, zero new geometry/materials.
// Every object here uses a kind that already exists (mesh primitives + the
// procedural props from proceduralModels.ts). `id`/`groupId` are just
// short human-readable strings for cross-referencing *within this file* —
// instantiateTemplate (useEditorStore.ts) replaces every one of them with a
// real genId() when a template is placed, so they never need to be globally
// unique. Every other SceneObject/SceneGroup field is optional here and
// gets defaulted the same way an old save missing a field would (see
// normalizeSceneData in useEditorStore.ts) — a template only needs to
// specify what actually matters for its layout.
type TemplateObject = Partial<SceneObject> &
  Pick<SceneObject, 'id' | 'kind' | 'name' | 'position' | 'rotation' | 'scale' | 'color'>
type TemplateGroup = Partial<SceneGroup> & Pick<SceneGroup, 'id' | 'name'>

export interface SceneTemplate {
  objects: TemplateObject[]
  groups: TemplateGroup[]
  settings?: Partial<SceneSettings>
}

const NEUTRAL = '#8a8f98'

const tavern: SceneTemplate = {
  groups: [
    { id: 'walls', name: 'Paredes' },
    { id: 'furniture', name: 'Móveis' },
  ],
  objects: [
    { id: 'floor', kind: 'box', name: 'Chão', position: [0, -0.05, 0], rotation: [0, 0, 0], scale: [8, 0.1, 8], color: '#5a4632' },
    { id: 'wall-n', kind: 'box', name: 'Parede Norte', position: [0, 1.5, -4], rotation: [0, 0, 0], scale: [8, 3, 0.2], color: '#8a7a5c', groupId: 'walls' },
    { id: 'wall-s', kind: 'box', name: 'Parede Sul', position: [0, 1.5, 4], rotation: [0, 0, 0], scale: [8, 3, 0.2], color: '#8a7a5c', groupId: 'walls' },
    { id: 'wall-e', kind: 'box', name: 'Parede Leste', position: [4, 1.5, 0], rotation: [0, 0, 0], scale: [0.2, 3, 8], color: '#8a7a5c', groupId: 'walls' },
    { id: 'wall-w', kind: 'box', name: 'Parede Oeste', position: [-4, 1.5, 0], rotation: [0, 0, 0], scale: [0.2, 3, 8], color: '#8a7a5c', groupId: 'walls' },
    { id: 'torch-1', kind: 'wallTorch', name: 'Tocha', position: [-3.85, 1.8, -2], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1], color: NEUTRAL },
    { id: 'torch-2', kind: 'wallTorch', name: 'Tocha', position: [3.85, 1.8, 2], rotation: [0, -Math.PI / 2, 0], scale: [1, 1, 1], color: NEUTRAL },
    { id: 'table-top', kind: 'box', name: 'Mesa', position: [0, 0.8, 0], rotation: [0, 0, 0], scale: [1.6, 0.08, 0.8], color: '#6b4226', groupId: 'furniture' },
    { id: 'table-leg-1', kind: 'cylinder', name: 'Perna da mesa', position: [-0.7, 0.4, -0.3], rotation: [0, 0, 0], scale: [0.06, 0.8, 0.06], color: '#3f2c1a', groupId: 'furniture' },
    { id: 'table-leg-2', kind: 'cylinder', name: 'Perna da mesa', position: [0.7, 0.4, -0.3], rotation: [0, 0, 0], scale: [0.06, 0.8, 0.06], color: '#3f2c1a', groupId: 'furniture' },
    { id: 'table-leg-3', kind: 'cylinder', name: 'Perna da mesa', position: [-0.7, 0.4, 0.3], rotation: [0, 0, 0], scale: [0.06, 0.8, 0.06], color: '#3f2c1a', groupId: 'furniture' },
    { id: 'table-leg-4', kind: 'cylinder', name: 'Perna da mesa', position: [0.7, 0.4, 0.3], rotation: [0, 0, 0], scale: [0.06, 0.8, 0.06], color: '#3f2c1a', groupId: 'furniture' },
    { id: 'barrel-1', kind: 'barrel', name: 'Barril', position: [-3.3, 0.45, 3.3], rotation: [0, 0, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'furniture' },
    { id: 'barrel-2', kind: 'barrel', name: 'Barril', position: [-3.3, 0.45, 2.5], rotation: [0, 0.4, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'furniture' },
    { id: 'cauldron-1', kind: 'cauldron', name: 'Caldeirão', position: [3, 0.35, -3.3], rotation: [0, 0, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'furniture' },
  ],
  settings: {
    backgroundColor: '#241a10',
    ambientIntensity: 1,
    directionalIntensity: 2.2,
  },
}

const nightCamp: SceneTemplate = {
  groups: [{ id: 'camp', name: 'Acampamento' }],
  objects: [
    { id: 'ground', kind: 'box', name: 'Chão', position: [0, -0.05, 0], rotation: [0, 0, 0], scale: [14, 0.1, 14], color: '#2f3b2a' },
    { id: 'log-1', kind: 'cylinder', name: 'Tronco', position: [0, 0.15, 0], rotation: [0, 0.3, Math.PI / 2], scale: [0.15, 1.2, 0.15], color: '#4a3728', groupId: 'camp' },
    { id: 'log-2', kind: 'cylinder', name: 'Tronco', position: [0, 0.15, 0], rotation: [0, -0.5, Math.PI / 2], scale: [0.15, 1.2, 0.15], color: '#4a3728', groupId: 'camp' },
    { id: 'log-3', kind: 'cylinder', name: 'Tronco', position: [0, 0.15, 0], rotation: [0, 1.2, Math.PI / 2], scale: [0.15, 1.1, 0.15], color: '#4a3728', groupId: 'camp' },
    {
      id: 'fire-light',
      kind: 'pointLight',
      name: 'Fogueira (luz)',
      position: [0, 0.6, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#ff8a3d',
      lightIntensity: 14,
      lightDistance: 9,
    },
    { id: 'torch-1', kind: 'wallTorch', name: 'Tocha', position: [-3, 0, -3], rotation: [0, 0.6, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'camp' },
    { id: 'torch-2', kind: 'wallTorch', name: 'Tocha', position: [3, 0, -3], rotation: [0, -0.6, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'camp' },
    { id: 'torch-3', kind: 'wallTorch', name: 'Tocha', position: [-3, 0, 3], rotation: [0, 2.4, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'camp' },
    { id: 'torch-4', kind: 'wallTorch', name: 'Tocha', position: [3, 0, 3], rotation: [0, -2.4, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'camp' },
    { id: 'chest-1', kind: 'treasureChest', name: 'Baú do tesouro', position: [4.5, 0.35, 1], rotation: [0, -0.3, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'camp' },
    { id: 'barrel-1', kind: 'barrel', name: 'Barril', position: [-4, 0.45, -1], rotation: [0, 0, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'camp' },
    { id: 'barrel-2', kind: 'barrel', name: 'Barril', position: [-4.5, 0.45, 0.2], rotation: [0, 0.8, 0], scale: [1, 1, 1], color: NEUTRAL, groupId: 'camp' },
  ],
  settings: {
    backgroundColor: '#05070c',
    ambientIntensity: 0.25,
    directionalIntensity: 0.4,
  },
}

const ancientRuins: SceneTemplate = {
  groups: [{ id: 'ruins', name: 'Ruínas' }],
  objects: [
    { id: 'ground', kind: 'box', name: 'Chão', position: [0, -0.05, 0], rotation: [0, 0, 0], scale: [12, 0.1, 12], color: '#3a3a3a' },
    { id: 'wall-1', kind: 'box', name: 'Parede em ruínas', position: [-3, 0.9, -2], rotation: [0, 0.1, 0.15], scale: [3, 1.8, 0.2], color: '#5c5c52', groupId: 'ruins' },
    { id: 'wall-2', kind: 'box', name: 'Parede em ruínas', position: [2, 0.6, -3], rotation: [0, -0.2, -0.25], scale: [2, 1.2, 0.2], color: '#54544a', groupId: 'ruins' },
    { id: 'wall-3', kind: 'box', name: 'Parede caída', position: [0, 0.1, 3], rotation: [0.06, 0.3, 0], scale: [3, 0.2, 1], color: '#54544a', groupId: 'ruins' },
    { id: 'column-1', kind: 'cylinder', name: 'Coluna quebrada', position: [-1, 0.75, 1], rotation: [0, 0, 0], scale: [0.4, 1.5, 0.4], color: '#6b6b60', groupId: 'ruins' },
    { id: 'column-2', kind: 'cylinder', name: 'Coluna quebrada', position: [1.5, 0.4, -1], rotation: [0, 0, 0.08], scale: [0.4, 0.8, 0.4], color: '#6b6b60', groupId: 'ruins' },
    { id: 'column-3', kind: 'cylinder', name: 'Coluna', position: [3, 1, 2], rotation: [0, 0, 0], scale: [0.35, 2, 0.35], color: '#6b6b60', groupId: 'ruins' },
    { id: 'barrel-1', kind: 'barrel', name: 'Barril tombado', position: [0.5, 0.35, 0.5], rotation: [0, 0.4, Math.PI / 2], scale: [1, 1, 1], color: NEUTRAL, groupId: 'ruins' },
  ],
  settings: {
    backgroundColor: '#0d1420',
    ambientIntensity: 0.6,
    directionalIntensity: 1,
  },
}

export type SceneTemplateId = 'tavern' | 'nightCamp' | 'ancientRuins'

export const SCENE_TEMPLATES: Record<SceneTemplateId, SceneTemplate> = {
  tavern,
  nightCamp,
  ancientRuins,
}
