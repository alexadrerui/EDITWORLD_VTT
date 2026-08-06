// Whole-campaign backup/restore as a single portable .json file — separate
// from the per-scene "Salvar" button (which only ever writes to this
// browser's localStorage/IndexedDB). Without this, a campaign is stuck in
// one browser profile: no backup, no moving it to another machine, nothing
// to check into git. Binary assets (models/textures/audio/video) are
// embedded as base64 data URLs so the whole campaign really is one file,
// matching what was asked for — the tradeoff is a ~33% size bump over the
// raw blobs, accepted since portability was the point.
import type { AssetFolder, AssetMeta, CustomAsset, SceneMeta } from '../types'
import {
  clearAllSceneData,
  loadAssetFolders,
  loadCampaignName,
  loadCustomAssets,
  loadSceneData,
  loadScenesIndex,
  saveAssetFolders,
  saveCampaignName,
  saveCustomAssets,
  saveSceneData,
  saveScenesIndex,
  type SceneData,
} from './useEditorStore'
import { clearAllAssets, getAssetBlob, listAssets, putAssetRecord } from './assetStore'

// Bump whenever the shape below changes in a way older code can't just
// default its way through (mirrors loadSceneData's own tolerance for old
// saves) — importProjectFile rejects a file from a newer version outright
// rather than guessing at fields it doesn't know about yet.
const PROJECT_FORMAT_VERSION = 1

interface ProjectFile {
  formatVersion: number
  exportedAt: string
  campaignName: string
  scenes: { meta: SceneMeta; data: SceneData }[]
  assetFolders: AssetFolder[]
  customAssets: CustomAsset[]
  assets: { meta: AssetMeta; dataUrl: string }[]
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler asset'))
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, commaIndex)
  const base64 = dataUrl.slice(commaIndex + 1)
  const mimeMatch = /data:(.*?);base64/.exec(header)
  const mime = mimeMatch?.[1] ?? 'application/octet-stream'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^a-z0-9-_ ]/gi, '_').replace(/\s+/g, '_')
  return cleaned || 'projeto'
}

// Downloads the whole campaign — every scene, asset folder, custom asset and
// binary asset blob currently in this browser — as one .json file.
export async function exportProjectFile(): Promise<void> {
  const scenesIndex = loadScenesIndex()
  const scenes = scenesIndex.map((meta) => ({ meta, data: loadSceneData(meta.id) }))
  const campaignName = loadCampaignName()
  const assetFolders = loadAssetFolders()
  const customAssets = loadCustomAssets()

  const assetMetas = await listAssets()
  const assets = await Promise.all(
    assetMetas.map(async (meta) => {
      const blob = await getAssetBlob(meta.id)
      const dataUrl = blob ? await blobToDataUrl(blob) : ''
      return { meta, dataUrl }
    }),
  )

  const project: ProjectFile = {
    formatVersion: PROJECT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    campaignName,
    scenes,
    assetFolders,
    customAssets,
    assets,
  }

  const json = JSON.stringify(project)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFileName(campaignName)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Bump independently of PROJECT_FORMAT_VERSION above — this is a much
// lighter, single-scene sibling of exportProjectFile, not read by
// importProjectFile (different shape entirely, no import counterpart yet).
const SCENE_FORMAT_VERSION = 1

interface SceneFile {
  formatVersion: number
  exportedAt: string
  scene: { meta: SceneMeta; data: SceneData }
}

// Downloads just one scene's own data (objects/groups/settings/animations/
// cutscenes) as a .json — deliberately lighter than exportProjectFile: no
// asset blobs embedded, so it's instant and small, but assetId references
// (imported models/textures/audio) will dangle if opened in a browser that
// doesn't already have those assets. Reached from the scene list's
// right-click menu in Hierarchy.tsx, not the Hierarchy footer's whole-
// campaign export/import buttons above.
export function exportSceneFile(meta: SceneMeta): void {
  const data = loadSceneData(meta.id)
  const file: SceneFile = {
    formatVersion: SCENE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    scene: { meta, data },
  }

  const json = JSON.stringify(file)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFileName(meta.name)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isProjectFile(value: unknown): value is ProjectFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<ProjectFile>
  return (
    typeof v.formatVersion === 'number' &&
    typeof v.campaignName === 'string' &&
    Array.isArray(v.scenes) &&
    Array.isArray(v.assets)
  )
}

export type ImportProjectFileResult = { ok: true } | { ok: false; error: string }

// Replaces the entire campaign currently in this browser (scenes, asset
// folders, custom assets, and every binary asset) with the contents of
// `file` — same "opening a project file" semantics as any desktop editor.
// Deliberately a destructive replace, not a merge (confirmed with the user):
// a merge would need to resolve id collisions and duplicate-name conflicts
// across scenes/assets/custom assets, which isn't worth the complexity for
// what is fundamentally a backup/restore feature. Caller is expected to
// confirm with the user before calling this (see the "Importar projeto"
// button in Hierarchy.tsx) and to reload the page after a success — nothing
// here touches the live Zustand store, only the localStorage/IndexedDB it
// reads its *initial* state from.
export async function importProjectFile(file: File): Promise<ImportProjectFileResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return { ok: false, error: 'Arquivo não é um JSON válido.' }
  }
  if (!isProjectFile(parsed)) {
    return { ok: false, error: 'Arquivo não é um projeto do EDITWORLD_VTT reconhecível.' }
  }
  if (parsed.formatVersion > PROJECT_FORMAT_VERSION) {
    return { ok: false, error: 'Este arquivo foi exportado por uma versão mais nova do editor.' }
  }

  await clearAllAssets()
  for (const { meta, dataUrl } of parsed.assets) {
    if (!dataUrl) continue
    await putAssetRecord(meta, dataUrlToBlob(dataUrl))
  }

  clearAllSceneData()
  for (const { meta, data } of parsed.scenes) {
    saveSceneData(meta.id, data)
  }
  saveScenesIndex(parsed.scenes.map((s) => s.meta))
  saveCampaignName(parsed.campaignName)
  saveAssetFolders(parsed.assetFolders)
  saveCustomAssets(parsed.customAssets)

  return { ok: true }
}
