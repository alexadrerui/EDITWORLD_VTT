import { create } from 'zustand'
import type {
  AssetBrowserTab,
  AssetKind,
  AssetMeta,
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
import {
  DIRECTIONAL_LIGHT_INTENSITY,
  LIGHT_DEFAULTS,
  SOUND_DEFAULTS,
  isLightKind,
} from '../scene/primitives'
import { listAssets, saveAsset } from './assetStore'

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
  backgroundMusicAssetId: null,
  backgroundMusicVolume: 1,
  backgroundMusicLoop: true,
  backgroundMusicAutoplayIntent: false,
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
          colorMapAssetId: null,
          videoMapAssetId: null,
          ...LIGHT_DEFAULTS,
          ...SOUND_DEFAULTS,
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
type SingleHistoryEntry =
  | { type: 'add'; object: SceneObject; index: number }
  | { type: 'remove'; object: SceneObject; index: number }
  | { type: 'update'; id: string; before: Partial<SceneObject>; after: Partial<SceneObject> }

// A 'batch' groups several single entries (e.g. bulk-deleting a multi-
// selection) so one Ctrl+Z undoes the whole action, not just one object's
// slice of it — see applyUndoSingle/applyRedoSingle below for how undo/redo
// iterate a batch's sub-entries.
type HistoryEntry = SingleHistoryEntry | { type: 'batch'; entries: SingleHistoryEntry[] }

const MAX_HISTORY = 50

function pushHistory(stack: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...stack, entry]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

function applyUndoSingle(objects: SceneObject[], entry: SingleHistoryEntry): SceneObject[] {
  if (entry.type === 'add') return objects.filter((o) => o.id !== entry.object.id)
  if (entry.type === 'remove') {
    const next = [...objects]
    next.splice(entry.index, 0, entry.object)
    return next
  }
  return objects.map((o) => (o.id === entry.id ? { ...o, ...entry.before } : o))
}

function applyRedoSingle(objects: SceneObject[], entry: SingleHistoryEntry): SceneObject[] {
  if (entry.type === 'add') {
    const next = [...objects]
    next.splice(entry.index, 0, entry.object)
    return next
  }
  if (entry.type === 'remove') return objects.filter((o) => o.id !== entry.object.id)
  return objects.map((o) => (o.id === entry.id ? { ...o, ...entry.after } : o))
}

let nextObjectId = 1
let nextGroupId = 1

const LIGHT_NAME: Record<LightKind, string> = {
  pointLight: 'Luz de ponto',
  spotLight: 'Luz spot',
  directionalLight: 'Luz direcional',
}

function createPrimitive(kind: PrimitiveKind, overrides?: Partial<SceneObject>): SceneObject {
  const n = nextObjectId++
  const light = isLightKind(kind)
  const isSound = kind === 'soundSource'
  return {
    id: genId('obj'),
    name: light ? `${LIGHT_NAME[kind]} ${n}` : `${kind[0].toUpperCase()}${kind.slice(1)} ${n}`,
    kind,
    // Lights and sound sources spawn floating at head height like a hanging
    // lamp; meshes (including imported models) sit on the ground (planes
    // flush at y=0, everything else resting at 0.5).
    position: [0, light || isSound ? 3 : kind === 'plane' ? 0 : 0.5, 0],
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
    colorMapAssetId: null,
    videoMapAssetId: null,
    ...LIGHT_DEFAULTS,
    ...SOUND_DEFAULTS,
    // Directional lights have no distance falloff, so the shared light
    // intensity default (tuned for point/spot) would be blindingly bright.
    lightIntensity: kind === 'directionalLight' ? DIRECTIONAL_LIGHT_INTENSITY : LIGHT_DEFAULTS.lightIntensity,
    ...overrides,
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
  selectedIds: string[]
  // Metadata only (no blob) — hydrated asynchronously from IndexedDB right
  // after this store is created (see the listAssets().then(...) call below
  // the store definition), so it's [] for one tick on load. Blobs are
  // fetched on demand via assetStore.ts's getAssetBlob, keyed by
  // SceneObject.assetId/colorMapAssetId/videoMapAssetId/
  // sceneSettings.backgroundMusicAssetId.
  assets: AssetMeta[]
  // "▶ Testar" preview state for sound objects/background music (Inspector.tsx/
  // SceneInspector.tsx) — ephemeral UI state, not persisted or undoable, same
  // category as selectedIds/focusTargetId above. The actual THREE.Audio/
  // PositionalAudio playback lives inside the Canvas tree (SceneObjectMesh.tsx's
  // SoundIcon, Editor3D.tsx's BackgroundMusic); these fields are just the
  // store-bridge that lets the Inspector (outside the Canvas) start/stop it.
  testingSoundId: string | null
  testingBackgroundMusic: boolean
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
  addObject: (kind: PrimitiveKind, overrides?: Partial<SceneObject>) => void
  removeObject: (id: string) => void
  removeObjects: (ids: string[]) => void
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  toggleLocked: (id: string) => void
  toggleHidden: (id: string) => void
  setObjectsLocked: (ids: string[], locked: boolean) => void
  setObjectsHidden: (ids: string[], hidden: boolean) => void
  setObjectGroup: (objectId: string, groupId: string | null) => void
  createGroup: () => void
  groupSelected: () => void
  removeGroup: (id: string) => void
  renameGroup: (id: string, name: string) => void
  toggleGroupLocked: (id: string) => void
  toggleGroupHidden: (id: string) => void
  updateSceneSettings: (patch: Partial<SceneSettings>) => void
  // Persist a file to IndexedDB (see assetStore.ts) and register it in
  // `assets`; each resolves with the new AssetMeta so the caller (AssetBrowser/
  // Inspector, added in later phases) can then addObject/updateObject/
  // updateSceneSettings with the returned id as needed. Not undoable — like
  // scene switches, importing a file isn't a content edit to undo/redo, it's
  // adding to the asset library itself (removing the resulting SceneObject/
  // reference, if any, is what undo covers).
  importModel: (file: File) => Promise<AssetMeta>
  importTexture: (file: File) => Promise<AssetMeta>
  importAudio: (file: File) => Promise<AssetMeta>
  importVideo: (file: File) => Promise<AssetMeta>
  toggleSoundTest: (id: string) => void
  toggleBackgroundMusicTest: () => void
  select: (id: string | null) => void
  toggleSelect: (id: string) => void
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

async function importAndRegister(
  set: (partial: Partial<EditorState> | ((state: EditorState) => Partial<EditorState>)) => void,
  file: File,
  kind: AssetKind,
): Promise<AssetMeta> {
  const meta = await saveAsset(file, kind)
  set((state) => ({ assets: [...state.assets, meta] }))
  return meta
}

export const useEditorStore = create<EditorState>((set, get) => ({
  scenesIndex: initialScenesIndex,
  currentSceneId: initialSceneId,
  objects: initialSceneData.objects,
  groups: initialSceneData.groups,
  sceneSettings: initialSceneData.settings,
  selectedIds: [],
  assets: [],
  testingSoundId: null,
  testingBackgroundMusic: false,
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
        selectedIds: [newObjects[0].id],
        isDirty: true,
        undoStack,
        redoStack: [],
      }
    }),

  addObject: (kind, overrides) =>
    set((state) => {
      const obj = createPrimitive(kind, overrides)
      const index = state.objects.length
      return {
        objects: [...state.objects, obj],
        selectedIds: [obj.id],
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
        selectedIds: state.selectedIds.filter((existing) => existing !== id),
        isDirty: true,
        undoStack: pushHistory(state.undoStack, { type: 'remove', object, index }),
        redoStack: [],
      }
    }),

  // Bulk delete for a multi-selection — removes sequentially from a working
  // copy so each entry's `index` matches the array state at that point in
  // the batch (needed for undo to reinsert everything at the right spots,
  // see applyUndoSingle/the undo/redo batch loop below). One Ctrl+Z undoes
  // the whole batch.
  removeObjects: (ids) =>
    set((state) => {
      const idSet = new Set(ids)
      let objects = state.objects
      const entries: SingleHistoryEntry[] = []
      for (const id of ids) {
        const index = objects.findIndex((o) => o.id === id)
        if (index === -1) continue
        entries.push({ type: 'remove', object: objects[index], index })
        objects = objects.filter((o) => o.id !== id)
      }
      if (entries.length === 0) return {}
      return {
        objects,
        selectedIds: state.selectedIds.filter((id) => !idSet.has(id)),
        isDirty: true,
        undoStack: pushHistory(
          state.undoStack,
          entries.length === 1 ? entries[0] : { type: 'batch', entries },
        ),
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

  // Explicit value (not toggle) so a multi-selection with mixed lock/hidden
  // states lands on one consistent state after a single click, instead of
  // some objects flipping one way and some the other. Same undo exclusion
  // as toggleLocked/toggleHidden — view state, not content.
  setObjectsLocked: (ids, locked) =>
    set((state) => {
      const idSet = new Set(ids)
      return {
        objects: state.objects.map((o) => (idSet.has(o.id) ? { ...o, locked } : o)),
        isDirty: true,
      }
    }),

  setObjectsHidden: (ids, hidden) =>
    set((state) => {
      const idSet = new Set(ids)
      return {
        objects: state.objects.map((o) => (idSet.has(o.id) ? { ...o, hidden } : o)),
        isDirty: true,
      }
    }),

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

  // Same undo exclusion as createGroup/setObjectGroup — organization state,
  // not content. No-op with an empty selection.
  groupSelected: () =>
    set((state) => {
      if (state.selectedIds.length === 0) return {}
      const group: SceneGroup = {
        id: genId('group'),
        name: `Grupo ${nextGroupId++}`,
        locked: false,
        hidden: false,
      }
      const idSet = new Set(state.selectedIds)
      return {
        groups: [...state.groups, group],
        objects: state.objects.map((o) => (idSet.has(o.id) ? { ...o, groupId: group.id } : o)),
        isDirty: true,
      }
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

  importModel: (file) => importAndRegister(set, file, 'model'),
  importTexture: (file) => importAndRegister(set, file, 'texture'),
  importAudio: (file) => importAndRegister(set, file, 'audio'),
  importVideo: (file) => importAndRegister(set, file, 'video'),

  toggleSoundTest: (id) =>
    set((state) => ({ testingSoundId: state.testingSoundId === id ? null : id })),
  toggleBackgroundMusicTest: () =>
    set((state) => ({ testingBackgroundMusic: !state.testingBackgroundMusic })),

  select: (id) => set({ selectedIds: id ? [id] : [] }),
  // Shift/Ctrl/Cmd-click add-or-remove, used by both the viewport (see
  // usePointerClick callers) and the Hierarchy rows — same modifier
  // convention in both places.
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((existing) => existing !== id)
        : [...state.selectedIds, id],
    })),
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

  // Batch entries are undone in reverse order of how their sub-entries were
  // recorded (each 'remove' entry's `index` was captured against the
  // in-progress working array at that point in the original batch — see
  // removeObjects above — so reinserting must replay that sequence
  // backwards, same LIFO principle as the outer undo/redo stacks). A single
  // entry just runs the loop once, identical to the old behavior.
  undo: () =>
    set((state) => {
      const entry = state.undoStack[state.undoStack.length - 1]
      if (!entry) return {}
      const undoStack = state.undoStack.slice(0, -1)
      const redoStack = [...state.redoStack, entry]
      const singles = entry.type === 'batch' ? [...entry.entries].reverse() : [entry]

      let objects = state.objects
      let selectedIds = state.selectedIds
      for (const single of singles) {
        objects = applyUndoSingle(objects, single)
        if (single.type === 'add') {
          selectedIds = selectedIds.filter((id) => id !== single.object.id)
        } else if (single.type === 'remove') {
          selectedIds = [...selectedIds, single.object.id]
        }
      }
      return { objects, selectedIds, isDirty: true, undoStack, redoStack }
    }),

  redo: () =>
    set((state) => {
      const entry = state.redoStack[state.redoStack.length - 1]
      if (!entry) return {}
      const redoStack = state.redoStack.slice(0, -1)
      const undoStack = [...state.undoStack, entry]
      const singles = entry.type === 'batch' ? entry.entries : [entry]

      let objects = state.objects
      let selectedIds = state.selectedIds
      for (const single of singles) {
        objects = applyRedoSingle(objects, single)
        if (single.type === 'add') {
          selectedIds = [...selectedIds, single.object.id]
        } else if (single.type === 'remove') {
          selectedIds = selectedIds.filter((id) => id !== single.object.id)
        }
      }
      return { objects, selectedIds, isDirty: true, undoStack, redoStack }
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
      selectedIds: [],
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
      selectedIds: [],
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

// First async code this store has — everything else above is synchronous
// localStorage reads. Fires once, right after the store is created, so
// `assets` starts as [] for one tick and then hydrates; UI reading `assets`
// (AssetBrowser, Inspector texture pickers, etc.) is expected to just render
// an empty library until this resolves, same as any other loading state.
listAssets().then((assets) => useEditorStore.setState({ assets }))
