import { create } from 'zustand'
import type {
  PositionSnapMode,
  PrimitiveKind,
  SceneMeta,
  SceneObject,
  TransformMode,
} from '../types'

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

function loadSceneObjects(id: string): SceneObject[] {
  try {
    const raw = localStorage.getItem(sceneDataKey(id))
    const parsed = raw ? (JSON.parse(raw) as Array<Partial<SceneObject>>) : []
    return parsed.map(
      (o) => ({ snapToObjects: false, locked: false, hidden: false, ...o }) as SceneObject,
    )
  } catch {
    return []
  }
}

function saveSceneObjects(id: string, objects: SceneObject[]) {
  localStorage.setItem(sceneDataKey(id), JSON.stringify(objects))
}

// Undo/redo, kept as a stack of minimal diffs rather than full command
// classes (no scene-graph/uuid-lookup layer to route through like a
// three.js-editor-style Command — objects here are plain data already
// addressed by id in the `objects` array). Scoped to the current scene:
// cleared on scene switch/create, not persisted, since undoing an edit made
// in a different scene/session isn't meaningful.
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

interface EditorState {
  scenesIndex: SceneMeta[]
  currentSceneId: string
  objects: SceneObject[]
  selectedId: string | null
  transformMode: TransformMode
  isDirty: boolean
  positionSnap: PositionSnapMode
  rotationSnap: number | null
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  addObject: (kind: PrimitiveKind) => void
  removeObject: (id: string) => void
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  toggleLocked: (id: string) => void
  toggleHidden: (id: string) => void
  select: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
  setPositionSnap: (value: PositionSnapMode) => void
  setRotationSnap: (value: number | null) => void
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
  objects: loadSceneObjects(initialSceneId),
  selectedId: null,
  transformMode: 'translate',
  isDirty: false,
  positionSnap: 1,
  rotationSnap: 15,
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

  select: (id) => set({ selectedId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setPositionSnap: (value) => set({ positionSnap: value }),
  setRotationSnap: (value) => set({ rotationSnap: value }),

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
    const { currentSceneId, objects } = get()
    saveSceneObjects(currentSceneId, objects)
    set({ isDirty: false })
  },

  createScene: () => {
    const state = get()
    const meta: SceneMeta = { id: genId('scene'), name: `Cena ${state.scenesIndex.length + 1}` }
    const scenesIndex = [...state.scenesIndex, meta]
    saveScenesIndex(scenesIndex)
    saveSceneObjects(meta.id, [])
    localStorage.setItem(CURRENT_KEY, meta.id)
    set({
      scenesIndex,
      currentSceneId: meta.id,
      objects: [],
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
    set({
      currentSceneId: id,
      objects: loadSceneObjects(id),
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
