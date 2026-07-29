import { create } from 'zustand'
import type {
  GridStyle,
  PositionSnapMode,
  PrimitiveKind,
  SceneGroup,
  SceneMeta,
  SceneObject,
  SceneSettings,
  TransformMode,
} from '../types'

const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  backgroundColor: '#14161a',
  ambientIntensity: 1.2,
  directionalIntensity: 3,
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

function createPrimitive(kind: PrimitiveKind): SceneObject {
  const n = nextObjectId++
  return {
    id: genId('obj'),
    name: `${kind[0].toUpperCase()}${kind.slice(1)} ${n}`,
    kind,
    position: [0, kind === 'plane' ? 0 : 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#8a8f98',
    snapToObjects: false,
    locked: false,
    hidden: false,
    groupId: null,
    wireframe: false,
    flatShading: false,
    side: 'front',
    shadowMode: 'both',
    materialType: 'standard',
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
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
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
  undoStack: [],
  redoStack: [],

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
  setGridStyle: (style) => set({ gridStyle: style }),

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
