import { create } from 'zustand'
import type {
  AssetBrowserTab,
  AxisView,
  CustomAsset,
  CustomAssetPart,
  GizmoSpace,
  GraphicsQuality,
  GridStyle,
  LengthUnit,
  LightKind,
  PositionSnapMode,
  PrimitiveKind,
  SceneGroup,
  SceneMeta,
  SceneObject,
  SceneSettings,
  TransformMode,
} from '../types'
import { DIRECTIONAL_LIGHT_INTENSITY, LIGHT_DEFAULTS, isLightKind } from '../scene/primitives'

const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  backgroundColor: '#14161a',
  ambientIntensity: 1.2,
  directionalIntensity: 3,
  toneMappingExposure: 1,
  csmEnabled: false,
  sunShadowBlur: 1,
  // Matches the old fixed directionalLight position ([10, 15, 5]) so
  // existing saved scenes keep the same shadow direction after migration.
  sunElevation: 53.3,
  sunAzimuth: 63.4,
}

const INDEX_KEY = 'editworld-vtt:scenes'
const CURRENT_KEY = 'editworld-vtt:current-scene'
const sceneDataKey = (id: string) => `editworld-vtt:scene:${id}`

function genId(prefix: string): string {
  const unique =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}-${unique}`
}

function loadScenesIndex(): SceneMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const parsed = raw ? (JSON.parse(raw) as SceneMeta[]) : []
    if (parsed.length > 0) return parsed
  } catch {
    // ignore corrupted storage
  }
  const fallback = [{ id: genId('scene'), name: 'Cena 1' }]
  saveScenesIndex(fallback)
  return fallback
}

function saveScenesIndex(index: SceneMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

// Custom (photo-imported placeholder) assets, see ImportStudio.tsx — a
// global library like scenesIndex, not per-scene content, so it persists
// immediately on every mutation instead of waiting for the scene's own
// "Salvar".
const CUSTOM_ASSETS_KEY = 'editworld-vtt:custom-assets'

function loadCustomAssets(): CustomAsset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ASSETS_KEY)
    return raw ? (JSON.parse(raw) as CustomAsset[]) : []
  } catch {
    return []
  }
}

function saveCustomAssets(assets: CustomAsset[]) {
  localStorage.setItem(CUSTOM_ASSETS_KEY, JSON.stringify(assets))
}

interface SceneData {
  objects: SceneObject[]
  groups: SceneGroup[]
  settings: SceneSettings
}

function loadSceneData(id: string): SceneData {
  const empty = { objects: [], groups: [], settings: DEFAULT_SCENE_SETTINGS }
  try {
    const raw = localStorage.getItem(sceneDataKey(id))
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    // Older saves stored just the objects array directly (no groups/settings yet).
    const rawObjects = Array.isArray(parsed) ? parsed : ((parsed as SceneData).objects ?? [])
    const rawGroups = Array.isArray(parsed) ? [] : ((parsed as SceneData).groups ?? [])
    const rawSettings = Array.isArray(parsed) ? {} : ((parsed as SceneData).settings ?? {})
    const objects = (rawObjects as Array<Partial<SceneObject>>).map(
      (o) =>
        ({
          snapToObjects: false,
          locked: false,
          hidden: false,
          groupId: null,
          wireframe: false,
          flatShading: false,
          side: 'front',
          shadowMode: 'both',
          materialType: 'standard',
          emissiveColor: '#000000',
          emissiveIntensity: 0,
          opacity: 1,
          roughness: 1,
          metalness: 0,
          dirtAmount: 0,
          wearAmount: 0,
          weatheringColor: '#2b2118',
          ...LIGHT_DEFAULTS,
          ...o,
        }) as SceneObject,
    )
    const groups = (rawGroups as Array<Partial<SceneGroup>>).map(
      (g) => ({ locked: false, hidden: false, ...g }) as SceneGroup,
    )
    const settings = { ...DEFAULT_SCENE_SETTINGS, ...rawSettings }
    return { objects, groups, settings }
  } catch {
    return empty
  }
}

function saveSceneData(id: string, data: SceneData) {
  localStorage.setItem(sceneDataKey(id), JSON.stringify(data))
}

// Undo/redo, kept as a stack of minimal diffs rather than full command
// classes (no scene-graph/uuid-lookup layer to route through like a
// three.js-editor-style Command — objects here are plain data already
// addressed by id in the `objects` array). Scoped to the current scene:
// cleared on scene switch/create, not persisted, since undoing an edit made
// in a different scene/session isn't meaningful.
//
// Group create/remove/rename/assign and lock/hide (both objects and groups)
// are deliberately left out of history for now, same reasoning as the
// existing lock/hide exclusion — view/organization state, not content edits.
type HistoryEntry =
  | { type: 'add'; object: SceneObject; index: number }
  | { type: 'remove'; object: SceneObject; index: number }
  | { type: 'update'; id: string; before: Partial<SceneObject>; after: Partial<SceneObject> }

const MAX_HISTORY = 50

function pushHistory(stack: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...stack, entry]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

let nextObjectId = 1
let nextGroupId = 1

const LIGHT_NAME: Record<LightKind, string> = {
  pointLight: 'Luz de ponto',
  spotLight: 'Luz spot',
  directionalLight: 'Luz direcional',
}

function createPrimitive(kind: PrimitiveKind): SceneObject {
  const n = nextObjectId++
  const light = isLightKind(kind)
  return {
    id: genId('obj'),
    name: light ? `${LIGHT_NAME[kind]} ${n}` : `${kind[0].toUpperCase()}${kind.slice(1)} ${n}`,
    kind,
    // Lights spawn floating at head height like a hanging lamp; meshes sit
    // on the ground (planes flush at y=0, everything else resting at 0.5).
    position: [0, light ? 3 : kind === 'plane' ? 0 : 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: light ? '#fff2cc' : '#8a8f98',
    snapToObjects: false,
    locked: false,
    hidden: false,
    groupId: null,
    wireframe: false,
    flatShading: false,
    side: 'front',
    shadowMode: 'both',
    materialType: 'standard',
    emissiveColor: '#000000',
    emissiveIntensity: 0,
    opacity: 1,
    roughness: 1,
    metalness: 0,
    dirtAmount: 0,
    wearAmount: 0,
    weatheringColor: '#2b2118',
    ...LIGHT_DEFAULTS,
    // Directional lights have no distance falloff, so the shared light
    // intensity default (tuned for point/spot) would be blindingly bright.
    lightIntensity: kind === 'directionalLight' ? DIRECTIONAL_LIGHT_INTENSITY : LIGHT_DEFAULTS.lightIntensity,
  }
}

const initialScenesIndex = loadScenesIndex()
const initialSceneId = (() => {
  const stored = localStorage.getItem(CURRENT_KEY)
  if (stored && initialScenesIndex.some((s) => s.id === stored)) return stored
  const fallback = initialScenesIndex[0].id
  localStorage.setItem(CURRENT_KEY, fallback)
  return fallback
})()
const initialSceneData = loadSceneData(initialSceneId)
const initialCustomAssets = loadCustomAssets()

interface EditorState {
  scenesIndex: SceneMeta[]
  currentSceneId: string
  objects: SceneObject[]
  groups: SceneGroup[]
  sceneSettings: SceneSettings
  selectedId: string | null
  transformMode: TransformMode
  isDirty: boolean
  positionSnap: PositionSnapMode
  rotationSnap: number | null
  gridVisible: boolean
  gridStyle: GridStyle
  lightGizmosVisible: boolean
  unit: LengthUnit
  quality: GraphicsQuality
  cameraProjection: 'perspective' | 'orthographic'
  focusTargetId: string | null
  focusNonce: number
  gizmoSpace: GizmoSpace
  axisView: AxisView | null
  axisViewNonce: number
  assetBrowserOpen: boolean
  assetBrowserTab: AssetBrowserTab
  hierarchyVisible: boolean
  inspectorVisible: boolean
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  customAssets: CustomAsset[]
  addCustomAsset: (asset: { name: string; parts: CustomAssetPart[] }) => void
  removeCustomAsset: (id: string) => void
  instantiateCustomAsset: (id: string) => void
  addObject: (kind: PrimitiveKind) => void
  removeObject: (id: string) => void
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  toggleLocked: (id: string) => void
  toggleHidden: (id: string) => void
  setObjectGroup: (objectId: string, groupId: string | null) => void
  createGroup: () => void
  removeGroup: (id: string) => void
  renameGroup: (id: string, name: string) => void
  toggleGroupLocked: (id: string) => void
  toggleGroupHidden: (id: string) => void
  updateSceneSettings: (patch: Partial<SceneSettings>) => void
  select: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
  setPositionSnap: (value: PositionSnapMode) => void
  setRotationSnap: (value: number | null) => void
  toggleGridVisible: () => void
  setGridStyle: (style: GridStyle) => void
  toggleLightGizmosVisible: () => void
  setUnit: (unit: LengthUnit) => void
  setQuality: (quality: GraphicsQuality) => void
  toggleCameraProjection: () => void
  requestCameraFocus: (id: string) => void
  setGizmoSpace: (space: GizmoSpace) => void
  requestAxisView: (axis: AxisView) => void
  toggleAssetBrowser: () => void
  setAssetBrowserTab: (tab: AssetBrowserTab) => void
  toggleHierarchyVisible: () => void
  toggleInspectorVisible: () => void
  undo: () => void
  redo: () => void
  saveScene: () => void
  createScene: () => void
  switchScene: (id: string) => void
  renameScene: (id: string, name: string) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  scenesIndex: initialScenesIndex,
  currentSceneId: initialSceneId,
  objects: initialSceneData.objects,
  groups: initialSceneData.groups,
  sceneSettings: initialSceneData.settings,
  selectedId: null,
  transformMode: 'translate',
  isDirty: false,
  positionSnap: null,
  rotationSnap: null,
  gridVisible: true,
  gridStyle: 'lines',
  lightGizmosVisible: true,
  unit: 'm',
  quality: 'medium',
  cameraProjection: 'perspective',
  focusTargetId: null,
  focusNonce: 0,
  gizmoSpace: 'world',
  axisView: null,
  axisViewNonce: 0,
  assetBrowserOpen: false,
  assetBrowserTab: 'objects',
  hierarchyVisible: true,
  inspectorVisible: true,
  undoStack: [],
  redoStack: [],
  customAssets: initialCustomAssets,

  addCustomAsset: (asset) => {
    const customAsset: CustomAsset = { id: genId('asset'), createdAt: Date.now(), ...asset }
    const customAssets = [...get().customAssets, customAsset]
    saveCustomAssets(customAssets)
    set({ customAssets })
  },

  removeCustomAsset: (id) => {
    const customAssets = get().customAssets.filter((a) => a.id !== id)
    saveCustomAssets(customAssets)
    set({ customAssets })
  },

  // Expands a stored template into real SceneObjects (one box per part,
  // sharing a new SceneGroup) — scene content like any other add, so it goes
  // through isDirty/undo like addObject/createGroup instead of the immediate
  // localStorage writes above.
  instantiateCustomAsset: (id) =>
    set((state) => {
      const asset = state.customAssets.find((a) => a.id === id)
      if (!asset || asset.parts.length === 0) return {}
      const group: SceneGroup = { id: genId('group'), name: asset.name, locked: false, hidden: false }
      let undoStack = state.undoStack
      const newObjects = asset.parts.map((part, i) => {
        const obj: SceneObject = {
          ...createPrimitive('box'),
          name: part.name,
          color: part.color,
          position: part.position,
          scale: part.scale,
          groupId: group.id,
        }
        undoStack = pushHistory(undoStack, { type: 'add', object: obj, index: state.objects.length + i })
        return obj
      })
      return {
        groups: [...state.groups, group],
        objects: [...state.objects, ...newObjects],
        selectedId: newObjects[0].id,
        isDirty: true,
        undoStack,
        redoStack: [],
      }
    }),

  addObject: (kind) =>
    set((state) => {
      const obj = createPrimitive(kind)
      const index = state.objects.length
      return {
        objects: [...state.objects, obj],
        selectedId: obj.id,
        isDirty: true,
        undoStack: pushHistory(state.undoStack, { type: 'add', object: obj, index }),
        redoStack: [],
      }
    }),

  removeObject: (id) =>
    set((state) => {
      const index = state.objects.findIndex((o) => o.id === id)
      if (index === -1) return {}
      const object = state.objects[index]
      return {
        objects: state.objects.filter((o) => o.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        isDirty: true,
        undoStack: pushHistory(state.undoStack, { type: 'remove', object, index }),
        redoStack: [],
      }
    }),

  updateObject: (id, patch) =>
    set((state) => {
      const current = state.objects.find((o) => o.id === id)
      if (!current) return {}
      const before: Record<string, unknown> = {}
      for (const key of Object.keys(patch) as (keyof SceneObject)[]) {
        before[key] = current[key]
      }
      return {
        objects: state.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        isDirty: true,
        undoStack: pushHistory(state.undoStack, { type: 'update', id, before, after: patch }),
        redoStack: [],
      }
    }),

  // Lock/hide are view-state toggles, not content edits — like Blender's
  // outliner, they're deliberately excluded from undo/redo history so
  // freely toggling them while inspecting a scene doesn't bury real edits
  // under a pile of undo steps.
  toggleLocked: (id) =>
    set((state) => ({
      objects: state.objects.map((o) => (o.id === id ? { ...o, locked: !o.locked } : o)),
      isDirty: true,
    })),

  toggleHidden: (id) =>
    set((state) => ({
      objects: state.objects.map((o) => (o.id === id ? { ...o, hidden: !o.hidden } : o)),
      isDirty: true,
    })),

  setObjectGroup: (objectId, groupId) =>
    set((state) => ({
      objects: state.objects.map((o) => (o.id === objectId ? { ...o, groupId } : o)),
      isDirty: true,
    })),

  createGroup: () =>
    set((state) => {
      const group: SceneGroup = {
        id: genId('group'),
        name: `Grupo ${nextGroupId++}`,
        locked: false,
        hidden: false,
      }
      return { groups: [...state.groups, group], isDirty: true }
    }),

  removeGroup: (id) =>
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id),
      // Ungroup its children instead of deleting them — losing objects as a
      // side effect of deleting their group would be a nasty surprise.
      objects: state.objects.map((o) => (o.groupId === id ? { ...o, groupId: null } : o)),
      isDirty: true,
    })),

  renameGroup: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, name: trimmed } : g)),
      isDirty: true,
    }))
  },

  toggleGroupLocked: (id) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, locked: !g.locked } : g)),
      isDirty: true,
    })),

  toggleGroupHidden: (id) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, hidden: !g.hidden } : g)),
      isDirty: true,
    })),

  // Not undoable, same reasoning as position/rotation snap settings — an
  // environment setting, not per-object content.
  updateSceneSettings: (patch) =>
    set((state) => ({
      sceneSettings: { ...state.sceneSettings, ...patch },
      isDirty: true,
    })),

  select: (id) => set({ selectedId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setPositionSnap: (value) => set({ positionSnap: value }),
  setRotationSnap: (value) => set({ rotationSnap: value }),
  toggleGridVisible: () => set((state) => ({ gridVisible: !state.gridVisible })),
  toggleLightGizmosVisible: () =>
    set((state) => ({ lightGizmosVisible: !state.lightGizmosVisible })),
  setGridStyle: (style) => set({ gridStyle: style }),
  setUnit: (unit) => set({ unit }),
  setQuality: (quality) => set({ quality }),
  toggleCameraProjection: () =>
    set((state) => ({
      cameraProjection: state.cameraProjection === 'perspective' ? 'orthographic' : 'perspective',
    })),
  // `focusNonce` always increments, even when re-focusing the same object,
  // so CameraRig's effect fires again after the user has manually panned away.
  requestCameraFocus: (id) =>
    set((state) => ({ focusTargetId: id, focusNonce: state.focusNonce + 1 })),
  setGizmoSpace: (space) => set({ gizmoSpace: space }),
  // `axisViewNonce` always increments, even for the same axis, so re-pressing
  // "top" after manually orbiting away snaps back — same reasoning as
  // `focusNonce` above.
  requestAxisView: (axis) =>
    set((state) => ({ axisView: axis, axisViewNonce: state.axisViewNonce + 1 })),
  toggleAssetBrowser: () =>
    set((state) => ({ assetBrowserOpen: !state.assetBrowserOpen })),
  setAssetBrowserTab: (tab) => set({ assetBrowserTab: tab }),
  toggleHierarchyVisible: () =>
    set((state) => ({ hierarchyVisible: !state.hierarchyVisible })),
  toggleInspectorVisible: () =>
    set((state) => ({ inspectorVisible: !state.inspectorVisible })),

  undo: () =>
    set((state) => {
      const entry = state.undoStack[state.undoStack.length - 1]
      if (!entry) return {}
      const undoStack = state.undoStack.slice(0, -1)
      const redoStack = [...state.redoStack, entry]

      if (entry.type === 'add') {
        return {
          objects: state.objects.filter((o) => o.id !== entry.object.id),
          selectedId: state.selectedId === entry.object.id ? null : state.selectedId,
          isDirty: true,
          undoStack,
          redoStack,
        }
      }
      if (entry.type === 'remove') {
        const objects = [...state.objects]
        objects.splice(entry.index, 0, entry.object)
        return { objects, selectedId: entry.object.id, isDirty: true, undoStack, redoStack }
      }
      return {
        objects: state.objects.map((o) => (o.id === entry.id ? { ...o, ...entry.before } : o)),
        isDirty: true,
        undoStack,
        redoStack,
      }
    }),

  redo: () =>
    set((state) => {
      const entry = state.redoStack[state.redoStack.length - 1]
      if (!entry) return {}
      const redoStack = state.redoStack.slice(0, -1)
      const undoStack = [...state.undoStack, entry]

      if (entry.type === 'add') {
        const objects = [...state.objects]
        objects.splice(entry.index, 0, entry.object)
        return { objects, selectedId: entry.object.id, isDirty: true, undoStack, redoStack }
      }
      if (entry.type === 'remove') {
        return {
          objects: state.objects.filter((o) => o.id !== entry.object.id),
          selectedId: state.selectedId === entry.object.id ? null : state.selectedId,
          isDirty: true,
          undoStack,
          redoStack,
        }
      }
      return {
        objects: state.objects.map((o) => (o.id === entry.id ? { ...o, ...entry.after } : o)),
        isDirty: true,
        undoStack,
        redoStack,
      }
    }),

  saveScene: () => {
    const { currentSceneId, objects, groups, sceneSettings } = get()
    saveSceneData(currentSceneId, { objects, groups, settings: sceneSettings })
    set({ isDirty: false })
  },

  createScene: () => {
    const state = get()
    const meta: SceneMeta = { id: genId('scene'), name: `Cena ${state.scenesIndex.length + 1}` }
    const scenesIndex = [...state.scenesIndex, meta]
    saveScenesIndex(scenesIndex)
    saveSceneData(meta.id, { objects: [], groups: [], settings: DEFAULT_SCENE_SETTINGS })
    localStorage.setItem(CURRENT_KEY, meta.id)
    set({
      scenesIndex,
      currentSceneId: meta.id,
      objects: [],
      groups: [],
      sceneSettings: DEFAULT_SCENE_SETTINGS,
      selectedId: null,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    })
  },

  switchScene: (id) => {
    const state = get()
    if (id === state.currentSceneId) return
    localStorage.setItem(CURRENT_KEY, id)
    const data = loadSceneData(id)
    set({
      currentSceneId: id,
      objects: data.objects,
      groups: data.groups,
      sceneSettings: data.settings,
      selectedId: null,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    })
  },

  renameScene: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const scenesIndex = get().scenesIndex.map((s) => (s.id === id ? { ...s, name: trimmed } : s))
    saveScenesIndex(scenesIndex)
    set({ scenesIndex })
  },
}))
