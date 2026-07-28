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
    return parsed.map((o) => ({ snapToObjects: false, ...o }) as SceneObject)
  } catch {
    return []
  }
}

function saveSceneObjects(id: string, objects: SceneObject[]) {
  localStorage.setItem(sceneDataKey(id), JSON.stringify(objects))
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
  addObject: (kind: PrimitiveKind) => void
  removeObject: (id: string) => void
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  select: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
  setPositionSnap: (value: PositionSnapMode) => void
  setRotationSnap: (value: number | null) => void
  saveScene: () => void
  createScene: () => void
  switchScene: (id: string) => void
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

  addObject: (kind) =>
    set((state) => {
      const obj = createPrimitive(kind)
      return { objects: [...state.objects, obj], selectedId: obj.id, isDirty: true }
    }),

  removeObject: (id) =>
    set((state) => ({
      objects: state.objects.filter((o) => o.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      isDirty: true,
    })),

  updateObject: (id, patch) =>
    set((state) => ({
      objects: state.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      isDirty: true,
    })),

  select: (id) => set({ selectedId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setPositionSnap: (value) => set({ positionSnap: value }),
  setRotationSnap: (value) => set({ rotationSnap: value }),

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
    set({ scenesIndex, currentSceneId: meta.id, objects: [], selectedId: null, isDirty: false })
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
    })
  },
}))
