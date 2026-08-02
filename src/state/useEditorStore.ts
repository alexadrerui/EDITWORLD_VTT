import { create } from 'zustand'
import type {
  AnimationClip,
  AnimationKeyframe,
  AssetBrowserTab,
  AssetFolder,
  AssetFolderTab,
  AssetKind,
  AssetMeta,
  AxisView,
  CustomAsset,
  CustomAssetPart,
  Cutscene,
  CutsceneTrack,
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
import {
  deleteAsset as deleteAssetRecord,
  listAssets,
  moveAsset as moveAssetRecord,
  saveAsset,
} from './assetStore'

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

// Campaign title shown in the Hierarchy panel's header (Spline-style "back +
// title" row) — a single global value, same "plain localStorage string, no
// per-scene versioning" shape as CURRENT_KEY above.
const CAMPAIGN_NAME_KEY = 'editworld-vtt:campaign-name'

function loadCampaignName(): string {
  return localStorage.getItem(CAMPAIGN_NAME_KEY) || 'Minha Campanha'
}

function saveCampaignName(name: string) {
  localStorage.setItem(CAMPAIGN_NAME_KEY, name)
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

// Asset-browser folders (Objetos/Modelos/Texturas/Vídeo/Áudio tabs) — same
// "global library, persist immediately" reasoning as customAssets above.
// The folders themselves are just {id, name, tab}; which assets/customAssets
// sit inside one is tracked on the asset's own folderId field instead of a
// members list here, same shape as SceneGroup/SceneObject.groupId.
const ASSET_FOLDERS_KEY = 'editworld-vtt:asset-folders'

function loadAssetFolders(): AssetFolder[] {
  try {
    const raw = localStorage.getItem(ASSET_FOLDERS_KEY)
    return raw ? (JSON.parse(raw) as AssetFolder[]) : []
  } catch {
    return []
  }
}

function saveAssetFolders(folders: AssetFolder[]) {
  localStorage.setItem(ASSET_FOLDERS_KEY, JSON.stringify(folders))
}

interface SceneData {
  objects: SceneObject[]
  groups: SceneGroup[]
  settings: SceneSettings
  animations: AnimationClip[]
  cutscenes: Cutscene[]
}

function loadSceneData(id: string): SceneData {
  const empty = {
    objects: [],
    groups: [],
    settings: DEFAULT_SCENE_SETTINGS,
    animations: [],
    cutscenes: [],
  }
  try {
    const raw = localStorage.getItem(sceneDataKey(id))
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    // Older saves stored just the objects array directly (no groups/settings yet).
    const rawObjects = Array.isArray(parsed) ? parsed : ((parsed as SceneData).objects ?? [])
    const rawGroups = Array.isArray(parsed) ? [] : ((parsed as SceneData).groups ?? [])
    const rawSettings = Array.isArray(parsed) ? {} : ((parsed as SceneData).settings ?? {})
    // Older saves predate animations/cutscenes entirely — default to none.
    const rawAnimations = Array.isArray(parsed) ? [] : ((parsed as SceneData).animations ?? [])
    const rawCutscenes = Array.isArray(parsed) ? [] : ((parsed as SceneData).cutscenes ?? [])
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
          blending: 'normal',
          roughness: 1,
          metalness: 0,
          dirtAmount: 0,
          wearAmount: 0,
          weatheringColor: '#2b2118',
          colorMapAssetId: null,
          videoMapAssetId: null,
          animationId: null,
          pivotOffset: [0, 0, 0],
          ...LIGHT_DEFAULTS,
          ...SOUND_DEFAULTS,
          ...o,
        }) as SceneObject,
    )
    const groups = (rawGroups as Array<Partial<SceneGroup>>).map(
      (g) => ({ locked: false, hidden: false, ...g }) as SceneGroup,
    )
    const settings = { ...DEFAULT_SCENE_SETTINGS, ...rawSettings }
    const animations = rawAnimations as AnimationClip[]
    const cutscenes = rawCutscenes as Cutscene[]
    return { objects, groups, settings, animations, cutscenes }
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
    blending: 'normal',
    roughness: 1,
    metalness: 0,
    dirtAmount: 0,
    wearAmount: 0,
    weatheringColor: '#2b2118',
    colorMapAssetId: null,
    videoMapAssetId: null,
    animationId: null,
    pivotOffset: [0, 0, 0],
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
const initialAssetFolders = loadAssetFolders()

interface EditorState {
  campaignName: string
  scenesIndex: SceneMeta[]
  currentSceneId: string
  objects: SceneObject[]
  groups: SceneGroup[]
  sceneSettings: SceneSettings
  // Keyframe animation clips — see AnimationClip in types.ts. Same "separate
  // collection + xId reference" shape as groups/groupId, saved/loaded with
  // the rest of SceneData.
  animations: AnimationClip[]
  // Multi-object choreographed sequences — see Cutscene in types.ts. Separate
  // from `animations` above (that system stays "one clip per object"); a
  // cutscene's tracks reference objects by id instead. Saved/loaded with the
  // rest of SceneData, same as animations/groups.
  cutscenes: Cutscene[]
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
  // Animation editing/preview state — same "ephemeral, not persisted or
  // undoable" bucket as testingSoundId above. `editingAnimationClipId` also
  // doubles as "is AnimationPanel.tsx open" (no separate boolean).
  // `editingKeyframeId`, when set, is the keyframe that the selected
  // object's transform gizmo/Vector3Row edits currently mirror into (see
  // Inspector.tsx). `testingAnimationId`/`animationPlaying`/
  // `animationScrubTime` bridge the panel's transport controls to the actual
  // anime.js timeline owned inside the Canvas (see animationEngine.ts).
  editingAnimationClipId: string | null
  editingKeyframeId: string | null
  testingAnimationId: string | null
  animationPlaying: boolean
  animationScrubTime: number
  // Cutscene editing/preview state — same ephemeral/non-undoable shape as
  // the animation fields above, just for CutsceneStudio.tsx instead of
  // AnimationPanel.tsx. `editingCutsceneId` doubles as "is the studio open."
  editingCutsceneId: string | null
  editingCutsceneKeyframeId: string | null
  testingCutsceneId: string | null
  cutscenePlaying: boolean
  cutsceneScrubTime: number
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
  addCustomAsset: (asset: { name: string; parts: CustomAssetPart[] }, folderId?: string | null) => void
  removeCustomAsset: (id: string) => void
  instantiateCustomAsset: (id: string) => void
  // One flat level of folders per AssetBrowser tab (see AssetFolder) — shared
  // by both AssetMeta-backed tabs (Modelos/Texturas/Vídeo/Áudio) and the
  // CustomAsset-backed Objetos tab, distinguished by AssetFolder.tab.
  folders: AssetFolder[]
  createFolder: (tab: AssetFolderTab) => AssetFolder
  renameFolder: (id: string, name: string) => void
  // Deleting a folder only ungroups it — contained assets/customAssets move
  // back to the tab's root (folderId: null) rather than being deleted
  // themselves, same "folder is organizational only" stance as SceneGroup.
  deleteFolder: (id: string) => void
  moveAssetToFolder: (assetId: string, folderId: string | null) => Promise<void>
  moveCustomAssetToFolder: (id: string, folderId: string | null) => void
  // Deletes the binary asset itself (IndexedDB blob + this metadata entry —
  // see assetStore.ts's deleteAsset), unlike deleteFolder which only
  // ungroups. Any SceneObject/sceneSettings field still referencing this id
  // (assetId/colorMapAssetId/videoMapAssetId/backgroundMusicAssetId) isn't
  // cleared here — the loaders (assetLoaders.ts) already render a "missing
  // asset" placeholder / silently drop the texture for an unresolvable id,
  // same as if the IndexedDB record were lost some other way (cleared
  // browser data, etc.), so there's nothing extra to reconcile.
  removeAsset: (id: string) => Promise<void>
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
  importModel: (file: File, folderId?: string | null) => Promise<AssetMeta>
  importTexture: (file: File, folderId?: string | null) => Promise<AssetMeta>
  importAudio: (file: File, folderId?: string | null) => Promise<AssetMeta>
  importVideo: (file: File, folderId?: string | null) => Promise<AssetMeta>
  toggleSoundTest: (id: string) => void
  toggleBackgroundMusicTest: () => void
  // Creates a 2-keyframe clip (both = the object's current transform, at
  // time 0 and 1000ms) and assigns it via the existing updateObject (so that
  // inner assignment stays undo-covered for free — the clip-creation itself
  // is not undoable, same bucket as createGroup).
  createAnimationForObject: (objectId: string) => void
  // Removes the clip and clears animationId on whichever object referenced
  // it, plus any ephemeral state pointing at it.
  deleteAnimation: (clipId: string) => void
  renameAnimation: (clipId: string, name: string) => void
  setAnimationLoop: (clipId: string, loop: boolean) => void
  setAnimationEasing: (clipId: string, easing: string) => void
  // Duplicates the last keyframe (by time) at lastTime+500ms and selects it
  // for editing.
  addKeyframe: (clipId: string) => void
  // No-op if it would leave fewer than 2 keyframes (a clip needs at least a
  // start and end pose).
  removeKeyframe: (clipId: string, keyframeId: string) => void
  updateKeyframe: (clipId: string, keyframeId: string, patch: Partial<AnimationKeyframe>) => void
  // Sets which keyframe the gizmo/Vector3Row transform edits mirror into (see
  // Inspector.tsx), and snaps the object's live transform to that keyframe's
  // pose so it's visible/grabbable in the viewport — via a non-undoable
  // internal setter, same bucket as toggleLocked, so browsing keyframes
  // doesn't spam the undo stack. Pass null to stop editing.
  selectKeyframeForEditing: (clipId: string, keyframeId: string | null) => void
  toggleAnimationTest: (clipId: string) => void
  toggleAnimationPlaying: () => void
  setAnimationScrubTime: (ms: number) => void
  // Closes AnimationPanel.tsx entirely (clears both ids, not just the
  // keyframe selection) and stops any active preview — the panel's own
  // close button, distinct from selectKeyframeForEditing(clipId, null)
  // which keeps the panel open but deselects the active keyframe.
  closeAnimationPanel: () => void
  // Cutscene actions — mirror the shape of the animation actions above
  // exactly, just operating on `cutscenes`/tracks instead of `animations`/
  // a single object. Creates an empty-tracks cutscene and opens the studio
  // (editingCutsceneId) immediately — CutsceneStudio.tsx is where tracks/
  // objects actually get added.
  createCutscene: (folderId?: string | null) => Cutscene
  deleteCutscene: (cutsceneId: string) => void
  renameCutscene: (cutsceneId: string, name: string) => void
  setCutsceneLoop: (cutsceneId: string, loop: boolean) => void
  setCutsceneEasing: (cutsceneId: string, easing: string) => void
  // Adds a track for `objectId` seeded with that object's current transform
  // as a single keyframe at time 0 — no-op if the object already has a track
  // in this cutscene.
  addTrackToCutscene: (cutsceneId: string, objectId: string) => void
  removeTrackFromCutscene: (cutsceneId: string, trackId: string) => void
  // Duplicates a track's last keyframe at lastTime+500ms and selects it for
  // editing — same shape as addKeyframe.
  addCutsceneKeyframe: (cutsceneId: string, trackId: string) => void
  removeCutsceneKeyframe: (cutsceneId: string, trackId: string, keyframeId: string) => void
  updateCutsceneKeyframe: (
    cutsceneId: string,
    trackId: string,
    keyframeId: string,
    patch: Partial<AnimationKeyframe>,
  ) => void
  // Snaps whichever object owns that track to the keyframe's pose (same
  // non-undoable internal setter as selectKeyframeForEditing). Pass null to
  // stop editing without closing the studio.
  selectCutsceneKeyframeForEditing: (cutsceneId: string, keyframeId: string | null) => void
  toggleCutsceneTest: (cutsceneId: string) => void
  toggleCutscenePlaying: () => void
  setCutsceneScrubTime: (ms: number) => void
  closeCutsceneStudio: () => void
  moveCutsceneToFolder: (cutsceneId: string, folderId: string | null) => void
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
  renameCampaign: (name: string) => void
}

async function importAndRegister(
  set: (partial: Partial<EditorState> | ((state: EditorState) => Partial<EditorState>)) => void,
  file: File,
  kind: AssetKind,
  folderId?: string | null,
): Promise<AssetMeta> {
  const meta = await saveAsset(file, kind, folderId)
  set((state) => ({ assets: [...state.assets, meta] }))
  return meta
}

// Folder name shown at creation time, made unique per tab (Pasta 1, Pasta 2,
// ...) the same way createPrimitive numbers new lights/meshes — renamed
// inline afterwards via the same double-click pattern as scenes (Hierarchy.tsx).
function nextFolderName(existing: AssetFolder[], tab: AssetFolderTab): string {
  const n = existing.filter((f) => f.tab === tab).length + 1
  return `Pasta ${n}`
}

export const useEditorStore = create<EditorState>((set, get) => ({
  campaignName: loadCampaignName(),
  scenesIndex: initialScenesIndex,
  currentSceneId: initialSceneId,
  objects: initialSceneData.objects,
  groups: initialSceneData.groups,
  sceneSettings: initialSceneData.settings,
  animations: initialSceneData.animations,
  cutscenes: initialSceneData.cutscenes,
  selectedIds: [],
  assets: [],
  testingSoundId: null,
  testingBackgroundMusic: false,
  editingAnimationClipId: null,
  editingKeyframeId: null,
  testingAnimationId: null,
  animationPlaying: false,
  animationScrubTime: 0,
  editingCutsceneId: null,
  editingCutsceneKeyframeId: null,
  testingCutsceneId: null,
  cutscenePlaying: false,
  cutsceneScrubTime: 0,
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

  addCustomAsset: (asset, folderId) => {
    const customAsset: CustomAsset = {
      id: genId('asset'),
      createdAt: Date.now(),
      folderId: folderId ?? null,
      ...asset,
    }
    const customAssets = [...get().customAssets, customAsset]
    saveCustomAssets(customAssets)
    set({ customAssets })
  },

  removeCustomAsset: (id) => {
    const customAssets = get().customAssets.filter((a) => a.id !== id)
    saveCustomAssets(customAssets)
    set({ customAssets })
  },

  folders: initialAssetFolders,

  createFolder: (tab) => {
    const folder: AssetFolder = { id: genId('folder'), name: nextFolderName(get().folders, tab), tab }
    const folders = [...get().folders, folder]
    saveAssetFolders(folders)
    set({ folders })
    return folder
  },

  renameFolder: (id, name) => {
    const folders = get().folders.map((f) => (f.id === id ? { ...f, name } : f))
    saveAssetFolders(folders)
    set({ folders })
  },

  deleteFolder: (id) => {
    const folders = get().folders.filter((f) => f.id !== id)
    saveAssetFolders(folders)
    const customAssets = get().customAssets.map((a) =>
      a.folderId === id ? { ...a, folderId: null } : a,
    )
    saveCustomAssets(customAssets)
    const movedAssetIds = get()
      .assets.filter((a) => a.folderId === id)
      .map((a) => a.id)
    const assets = get().assets.map((a) => (a.folderId === id ? { ...a, folderId: null } : a))
    const cutscenes = get().cutscenes.map((c) => (c.folderId === id ? { ...c, folderId: null } : c))
    set({ folders, customAssets, assets, cutscenes })
    // Fire-and-forget IndexedDB updates to match — the in-memory `assets`
    // state above is what the UI reads, this just keeps the persisted
    // records from disagreeing with it after a reload.
    for (const assetId of movedAssetIds) void moveAssetRecord(assetId, null)
  },

  moveAssetToFolder: async (assetId, folderId) => {
    await moveAssetRecord(assetId, folderId)
    set((state) => ({
      assets: state.assets.map((a) => (a.id === assetId ? { ...a, folderId } : a)),
    }))
  },

  moveCustomAssetToFolder: (id, folderId) => {
    const customAssets = get().customAssets.map((a) => (a.id === id ? { ...a, folderId } : a))
    saveCustomAssets(customAssets)
    set({ customAssets })
  },

  removeAsset: async (id) => {
    await deleteAssetRecord(id)
    set((state) => ({ assets: state.assets.filter((a) => a.id !== id) }))
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

      // Mirror a transform edit into whichever keyframe is actively being
      // posed (single-object AnimationClip or Cutscene track), so "select a
      // keyframe, then move the object with the viewport gizmo" actually
      // captures the pose. Centralized here rather than at each UI call site
      // — the gizmo/ScaleFaceHandles in SceneObjects.tsx only ever call
      // updateObject, they have no notion of "which keyframe is active" —
      // so this is the one place every transform edit, from any input
      // method, necessarily passes through.
      const transformPatch: Partial<Pick<SceneObject, 'position' | 'rotation' | 'scale'>> = {}
      for (const key of ['position', 'rotation', 'scale'] as const) {
        if (patch[key] !== undefined) transformPatch[key] = patch[key]
      }
      const hasTransformPatch = Object.keys(transformPatch).length > 0

      let animations = state.animations
      if (
        hasTransformPatch &&
        state.editingAnimationClipId &&
        state.editingKeyframeId &&
        state.editingAnimationClipId === current.animationId
      ) {
        const clipId = state.editingAnimationClipId
        const keyframeId = state.editingKeyframeId
        animations = state.animations.map((a) =>
          a.id === clipId
            ? {
                ...a,
                keyframes: a.keyframes.map((k) =>
                  k.id === keyframeId ? { ...k, ...transformPatch } : k,
                ),
              }
            : a,
        )
      }

      let cutscenes = state.cutscenes
      if (hasTransformPatch && state.editingCutsceneId && state.editingCutsceneKeyframeId) {
        const cutsceneId = state.editingCutsceneId
        const keyframeId = state.editingCutsceneKeyframeId
        const track = state.cutscenes
          .find((c) => c.id === cutsceneId)
          ?.tracks.find((t) => t.objectId === id)
        if (track?.keyframes.some((k) => k.id === keyframeId)) {
          const trackId = track.id
          cutscenes = state.cutscenes.map((c) =>
            c.id === cutsceneId
              ? {
                  ...c,
                  tracks: c.tracks.map((t) =>
                    t.id === trackId
                      ? {
                          ...t,
                          keyframes: t.keyframes.map((k) =>
                            k.id === keyframeId ? { ...k, ...transformPatch } : k,
                          ),
                        }
                      : t,
                  ),
                }
              : c,
          )
        }
      }

      return {
        objects: state.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        animations,
        cutscenes,
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

  importModel: (file, folderId) => importAndRegister(set, file, 'model', folderId),
  importTexture: (file, folderId) => importAndRegister(set, file, 'texture', folderId),
  importAudio: (file, folderId) => importAndRegister(set, file, 'audio', folderId),
  importVideo: (file, folderId) => importAndRegister(set, file, 'video', folderId),

  toggleSoundTest: (id) =>
    set((state) => ({ testingSoundId: state.testingSoundId === id ? null : id })),
  toggleBackgroundMusicTest: () =>
    set((state) => ({ testingBackgroundMusic: !state.testingBackgroundMusic })),

  createAnimationForObject: (objectId) => {
    const state = get()
    const object = state.objects.find((o) => o.id === objectId)
    if (!object) return
    const clip: AnimationClip = {
      id: genId('anim'),
      name: 'Animação',
      loop: true,
      easing: 'inOutQuad',
      keyframes: [
        {
          id: genId('kf'),
          time: 0,
          position: object.position,
          rotation: object.rotation,
          scale: object.scale,
        },
        {
          id: genId('kf'),
          time: 1000,
          position: object.position,
          rotation: object.rotation,
          scale: object.scale,
        },
      ],
    }
    set({ animations: [...state.animations, clip] })
    get().updateObject(objectId, { animationId: clip.id })
  },

  deleteAnimation: (clipId) => {
    const state = get()
    const referencing = state.objects.find((o) => o.animationId === clipId)
    set({
      animations: state.animations.filter((a) => a.id !== clipId),
      editingAnimationClipId: state.editingAnimationClipId === clipId ? null : state.editingAnimationClipId,
      editingKeyframeId: state.editingAnimationClipId === clipId ? null : state.editingKeyframeId,
      testingAnimationId: state.testingAnimationId === clipId ? null : state.testingAnimationId,
      animationPlaying: state.testingAnimationId === clipId ? false : state.animationPlaying,
      isDirty: true,
    })
    if (referencing) get().updateObject(referencing.id, { animationId: null })
  },

  renameAnimation: (clipId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    set((state) => ({
      animations: state.animations.map((a) => (a.id === clipId ? { ...a, name: trimmed } : a)),
      isDirty: true,
    }))
  },

  setAnimationLoop: (clipId, loop) =>
    set((state) => ({
      animations: state.animations.map((a) => (a.id === clipId ? { ...a, loop } : a)),
      isDirty: true,
    })),

  setAnimationEasing: (clipId, easing) =>
    set((state) => ({
      animations: state.animations.map((a) => (a.id === clipId ? { ...a, easing } : a)),
      isDirty: true,
    })),

  addKeyframe: (clipId) => {
    const state = get()
    const clip = state.animations.find((a) => a.id === clipId)
    const object = state.objects.find((o) => o.animationId === clipId)
    if (!clip || !object) return
    const lastTime = clip.keyframes.reduce((max, k) => Math.max(max, k.time), 0)
    const keyframe: AnimationKeyframe = {
      id: genId('kf'),
      time: lastTime + 500,
      position: object.position,
      rotation: object.rotation,
      scale: object.scale,
    }
    const keyframes = [...clip.keyframes, keyframe].sort((a, b) => a.time - b.time)
    set({
      animations: state.animations.map((a) => (a.id === clipId ? { ...a, keyframes } : a)),
      isDirty: true,
    })
    get().selectKeyframeForEditing(clipId, keyframe.id)
  },

  removeKeyframe: (clipId, keyframeId) => {
    const state = get()
    const clip = state.animations.find((a) => a.id === clipId)
    // A clip needs at least a start and end pose.
    if (!clip || clip.keyframes.length <= 2) return
    const keyframes = clip.keyframes.filter((k) => k.id !== keyframeId)
    set({
      animations: state.animations.map((a) => (a.id === clipId ? { ...a, keyframes } : a)),
      editingKeyframeId: state.editingKeyframeId === keyframeId ? null : state.editingKeyframeId,
      isDirty: true,
    })
  },

  updateKeyframe: (clipId, keyframeId, patch) =>
    set((state) => ({
      animations: state.animations.map((a) =>
        a.id === clipId
          ? { ...a, keyframes: a.keyframes.map((k) => (k.id === keyframeId ? { ...k, ...patch } : k)) }
          : a,
      ),
      isDirty: true,
    })),

  selectKeyframeForEditing: (clipId, keyframeId) => {
    if (!keyframeId) {
      set({ editingAnimationClipId: clipId, editingKeyframeId: null })
      return
    }
    const state = get()
    const clip = state.animations.find((a) => a.id === clipId)
    const keyframe = clip?.keyframes.find((k) => k.id === keyframeId)
    const object = state.objects.find((o) => o.animationId === clipId)
    if (!clip || !keyframe || !object) return
    // Snaps the object's transform to the keyframe's pose directly (not
    // through updateObject) so browsing keyframes doesn't push undo entries
    // — same non-undoable bucket as toggleLocked/toggleHidden. Still marks
    // isDirty though (unlike toggleLocked): this changes the object's saved
    // position/rotation/scale, which is real content, just not something we
    // want cluttering the undo stack.
    set({
      editingAnimationClipId: clipId,
      editingKeyframeId: keyframeId,
      isDirty: true,
      objects: state.objects.map((o) =>
        o.id === object.id
          ? { ...o, position: keyframe.position, rotation: keyframe.rotation, scale: keyframe.scale }
          : o,
      ),
    })
  },

  toggleAnimationTest: (clipId) =>
    set((state) => {
      const stopping = state.testingAnimationId === clipId
      return {
        testingAnimationId: stopping ? null : clipId,
        animationPlaying: !stopping,
        animationScrubTime: 0,
      }
    }),

  toggleAnimationPlaying: () => set((state) => ({ animationPlaying: !state.animationPlaying })),

  setAnimationScrubTime: (ms) => set({ animationScrubTime: Math.max(0, ms) }),

  closeAnimationPanel: () =>
    set({
      editingAnimationClipId: null,
      editingKeyframeId: null,
      testingAnimationId: null,
      animationPlaying: false,
    }),

  createCutscene: (folderId) => {
    const cutscene: Cutscene = {
      id: genId('cutscene'),
      name: 'Cutscene',
      loop: true,
      easing: 'inOutQuad',
      tracks: [],
      folderId: folderId ?? null,
    }
    set((state) => ({
      cutscenes: [...state.cutscenes, cutscene],
      editingCutsceneId: cutscene.id,
      isDirty: true,
    }))
    return cutscene
  },

  deleteCutscene: (cutsceneId) =>
    set((state) => ({
      cutscenes: state.cutscenes.filter((c) => c.id !== cutsceneId),
      editingCutsceneId: state.editingCutsceneId === cutsceneId ? null : state.editingCutsceneId,
      editingCutsceneKeyframeId:
        state.editingCutsceneId === cutsceneId ? null : state.editingCutsceneKeyframeId,
      testingCutsceneId: state.testingCutsceneId === cutsceneId ? null : state.testingCutsceneId,
      cutscenePlaying: state.testingCutsceneId === cutsceneId ? false : state.cutscenePlaying,
      isDirty: true,
    })),

  renameCutscene: (cutsceneId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    set((state) => ({
      cutscenes: state.cutscenes.map((c) => (c.id === cutsceneId ? { ...c, name: trimmed } : c)),
      isDirty: true,
    }))
  },

  setCutsceneLoop: (cutsceneId, loop) =>
    set((state) => ({
      cutscenes: state.cutscenes.map((c) => (c.id === cutsceneId ? { ...c, loop } : c)),
      isDirty: true,
    })),

  setCutsceneEasing: (cutsceneId, easing) =>
    set((state) => ({
      cutscenes: state.cutscenes.map((c) => (c.id === cutsceneId ? { ...c, easing } : c)),
      isDirty: true,
    })),

  addTrackToCutscene: (cutsceneId, objectId) => {
    const state = get()
    const cutscene = state.cutscenes.find((c) => c.id === cutsceneId)
    const object = state.objects.find((o) => o.id === objectId)
    if (!cutscene || !object) return
    if (cutscene.tracks.some((t) => t.objectId === objectId)) return
    const track: CutsceneTrack = {
      id: genId('track'),
      objectId,
      keyframes: [
        {
          id: genId('kf'),
          time: 0,
          position: object.position,
          rotation: object.rotation,
          scale: object.scale,
        },
      ],
    }
    set({
      cutscenes: state.cutscenes.map((c) =>
        c.id === cutsceneId ? { ...c, tracks: [...c.tracks, track] } : c,
      ),
      isDirty: true,
    })
  },

  removeTrackFromCutscene: (cutsceneId, trackId) => {
    const state = get()
    const cutscene = state.cutscenes.find((c) => c.id === cutsceneId)
    const track = cutscene?.tracks.find((t) => t.id === trackId)
    const wasEditingThisTrack = !!track?.keyframes.some((k) => k.id === state.editingCutsceneKeyframeId)
    set({
      cutscenes: state.cutscenes.map((c) =>
        c.id === cutsceneId ? { ...c, tracks: c.tracks.filter((t) => t.id !== trackId) } : c,
      ),
      editingCutsceneKeyframeId: wasEditingThisTrack ? null : state.editingCutsceneKeyframeId,
      isDirty: true,
    })
  },

  addCutsceneKeyframe: (cutsceneId, trackId) => {
    const state = get()
    const cutscene = state.cutscenes.find((c) => c.id === cutsceneId)
    const track = cutscene?.tracks.find((t) => t.id === trackId)
    const object = state.objects.find((o) => o.id === track?.objectId)
    if (!cutscene || !track || !object) return
    const lastTime = track.keyframes.reduce((max, k) => Math.max(max, k.time), 0)
    const keyframe: AnimationKeyframe = {
      id: genId('kf'),
      time: lastTime + 500,
      position: object.position,
      rotation: object.rotation,
      scale: object.scale,
    }
    const keyframes = [...track.keyframes, keyframe].sort((a, b) => a.time - b.time)
    set({
      cutscenes: state.cutscenes.map((c) =>
        c.id === cutsceneId
          ? { ...c, tracks: c.tracks.map((t) => (t.id === trackId ? { ...t, keyframes } : t)) }
          : c,
      ),
      isDirty: true,
    })
    get().selectCutsceneKeyframeForEditing(cutsceneId, keyframe.id)
  },

  removeCutsceneKeyframe: (cutsceneId, trackId, keyframeId) => {
    const state = get()
    const cutscene = state.cutscenes.find((c) => c.id === cutsceneId)
    const track = cutscene?.tracks.find((t) => t.id === trackId)
    // A track needs at least a start and end pose.
    if (!cutscene || !track || track.keyframes.length <= 2) return
    const keyframes = track.keyframes.filter((k) => k.id !== keyframeId)
    set({
      cutscenes: state.cutscenes.map((c) =>
        c.id === cutsceneId
          ? { ...c, tracks: c.tracks.map((t) => (t.id === trackId ? { ...t, keyframes } : t)) }
          : c,
      ),
      editingCutsceneKeyframeId:
        state.editingCutsceneKeyframeId === keyframeId ? null : state.editingCutsceneKeyframeId,
      isDirty: true,
    })
  },

  updateCutsceneKeyframe: (cutsceneId, trackId, keyframeId, patch) =>
    set((state) => ({
      cutscenes: state.cutscenes.map((c) =>
        c.id === cutsceneId
          ? {
              ...c,
              tracks: c.tracks.map((t) =>
                t.id === trackId
                  ? {
                      ...t,
                      keyframes: t.keyframes.map((k) =>
                        k.id === keyframeId ? { ...k, ...patch } : k,
                      ),
                    }
                  : t,
              ),
            }
          : c,
      ),
      isDirty: true,
    })),

  selectCutsceneKeyframeForEditing: (cutsceneId, keyframeId) => {
    if (!keyframeId) {
      set({ editingCutsceneId: cutsceneId, editingCutsceneKeyframeId: null })
      return
    }
    const state = get()
    const cutscene = state.cutscenes.find((c) => c.id === cutsceneId)
    const track = cutscene?.tracks.find((t) => t.keyframes.some((k) => k.id === keyframeId))
    const keyframe = track?.keyframes.find((k) => k.id === keyframeId)
    const object = state.objects.find((o) => o.id === track?.objectId)
    if (!cutscene || !track || !keyframe || !object) return
    // Same non-undoable snap-to-pose as selectKeyframeForEditing, scoped to
    // whichever object owns this track — still marks isDirty though (same
    // note as that function: this changes real saved content).
    set({
      editingCutsceneId: cutsceneId,
      editingCutsceneKeyframeId: keyframeId,
      isDirty: true,
      objects: state.objects.map((o) =>
        o.id === object.id
          ? { ...o, position: keyframe.position, rotation: keyframe.rotation, scale: keyframe.scale }
          : o,
      ),
    })
  },

  toggleCutsceneTest: (cutsceneId) =>
    set((state) => {
      const stopping = state.testingCutsceneId === cutsceneId
      return {
        testingCutsceneId: stopping ? null : cutsceneId,
        cutscenePlaying: !stopping,
        cutsceneScrubTime: 0,
      }
    }),

  toggleCutscenePlaying: () => set((state) => ({ cutscenePlaying: !state.cutscenePlaying })),

  setCutsceneScrubTime: (ms) => set({ cutsceneScrubTime: Math.max(0, ms) }),

  closeCutsceneStudio: () =>
    set({
      editingCutsceneId: null,
      editingCutsceneKeyframeId: null,
      testingCutsceneId: null,
      cutscenePlaying: false,
    }),

  moveCutsceneToFolder: (cutsceneId, folderId) =>
    set((state) => ({
      cutscenes: state.cutscenes.map((c) => (c.id === cutsceneId ? { ...c, folderId } : c)),
      isDirty: true,
    })),

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
    const { currentSceneId, objects, groups, sceneSettings, animations, cutscenes } = get()
    saveSceneData(currentSceneId, { objects, groups, settings: sceneSettings, animations, cutscenes })
    set({ isDirty: false })
  },

  createScene: () => {
    const state = get()
    const meta: SceneMeta = { id: genId('scene'), name: `Cena ${state.scenesIndex.length + 1}` }
    const scenesIndex = [...state.scenesIndex, meta]
    saveScenesIndex(scenesIndex)
    saveSceneData(meta.id, {
      objects: [],
      groups: [],
      settings: DEFAULT_SCENE_SETTINGS,
      animations: [],
      cutscenes: [],
    })
    localStorage.setItem(CURRENT_KEY, meta.id)
    set({
      scenesIndex,
      currentSceneId: meta.id,
      objects: [],
      groups: [],
      sceneSettings: DEFAULT_SCENE_SETTINGS,
      animations: [],
      cutscenes: [],
      selectedIds: [],
      isDirty: false,
      undoStack: [],
      redoStack: [],
      editingAnimationClipId: null,
      editingKeyframeId: null,
      testingAnimationId: null,
      animationPlaying: false,
      editingCutsceneId: null,
      editingCutsceneKeyframeId: null,
      testingCutsceneId: null,
      cutscenePlaying: false,
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
      animations: data.animations,
      cutscenes: data.cutscenes,
      selectedIds: [],
      isDirty: false,
      undoStack: [],
      redoStack: [],
      editingAnimationClipId: null,
      editingKeyframeId: null,
      testingAnimationId: null,
      animationPlaying: false,
      editingCutsceneId: null,
      editingCutsceneKeyframeId: null,
      testingCutsceneId: null,
      cutscenePlaying: false,
    })
  },

  renameScene: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const scenesIndex = get().scenesIndex.map((s) => (s.id === id ? { ...s, name: trimmed } : s))
    saveScenesIndex(scenesIndex)
    set({ scenesIndex })
  },

  renameCampaign: (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    saveCampaignName(trimmed)
    set({ campaignName: trimmed })
  },
}))

// First async code this store has — everything else above is synchronous
// localStorage reads. Fires once, right after the store is created, so
// `assets` starts as [] for one tick and then hydrates; UI reading `assets`
// (AssetBrowser, Inspector texture pickers, etc.) is expected to just render
// an empty library until this resolves, same as any other loading state.
listAssets().then((assets) => useEditorStore.setState({ assets }))
