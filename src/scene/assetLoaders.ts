// Module-level loaders/caches for asset-backed content: imported GLB models,
// image/video textures, and decoded audio buffers. Shared across every
// SceneObjectMesh instance so the same assetId is only fetched from
// IndexedDB and parsed/decoded once, no matter how many scene objects
// reference it — each React hook below just asks the cache for its
// per-assetId promise and (for models) clones the shared template.
import { useEffect, useState } from 'react'
import { Group, type Material, type Mesh, type Object3D, SRGBColorSpace, Texture, VideoTexture } from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { getAssetBlob } from '../state/assetStore'
import { globalAudioListener } from './audioListener'

// Draco-compressed geometry is a common Blender/glTF-exporter option — without
// this, GLTFLoader.parse throws on any model exported with it. The decoder is
// fetched lazily from Google's CDN the first time it's actually needed (only
// draco-compressed models trigger the WASM download), same tradeoff every
// other three.js app makes rather than vendoring the decoder locally.
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

// One thumbnail-friendly label per standard PBR texture slot we scan for —
// used both to describe a texture found in a single slot and, joined with
// " + ", a texture reused across several slots (e.g. a packed ORM map).
const TEXTURE_SLOT_LABELS: Record<string, string> = {
  map: 'Cor base',
  emissiveMap: 'Emissiva',
  normalMap: 'Normal',
  roughnessMap: 'Rugosidade',
  metalnessMap: 'Metalicidade',
  aoMap: 'Oclusão de ambiente',
  alphaMap: 'Alfa',
  bumpMap: 'Relevo (bump)',
  displacementMap: 'Deslocamento',
}

export interface ModelTextureInfo {
  id: string
  label: string
  thumbnail: string
}

// Walks every mesh's material(s) in a just-parsed model looking for the
// texture slots above, dedupes by texture instance (a packed ORM texture
// referenced from three different slots should show up once, not three
// times), and rasterizes a small thumbnail via canvas — GLTFLoader's
// decoded texture.image (ImageBitmap or HTMLImageElement, depending on
// browser/format) is directly drawable regardless of which one it is.
function extractModelTextures(root: Object3D): ModelTextureInfo[] {
  const bySlotTexture = new Map<string, { texture: Texture; labels: Set<string> }>()
  root.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh || !mesh.material) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials as Material[]) {
      for (const slot of Object.keys(TEXTURE_SLOT_LABELS)) {
        const tex = (material as unknown as Record<string, Texture | null | undefined>)[slot]
        if (!tex || !tex.image) continue
        let entry = bySlotTexture.get(tex.uuid)
        if (!entry) {
          entry = { texture: tex, labels: new Set() }
          bySlotTexture.set(tex.uuid, entry)
        }
        entry.labels.add(TEXTURE_SLOT_LABELS[slot])
      }
    }
  })

  if (bySlotTexture.size === 0) return []

  const THUMB = 64
  const canvas = document.createElement('canvas')
  canvas.width = THUMB
  canvas.height = THUMB
  const ctx = canvas.getContext('2d')

  const result: ModelTextureInfo[] = []
  for (const { texture, labels } of bySlotTexture.values()) {
    let thumbnail = ''
    try {
      if (ctx) {
        ctx.clearRect(0, 0, THUMB, THUMB)
        ctx.drawImage(texture.image as CanvasImageSource, 0, 0, THUMB, THUMB)
        thumbnail = canvas.toDataURL('image/jpeg', 0.7)
      }
    } catch {
      // Some image sources (e.g. compressed-texture data textures) can't be
      // canvas-drawn — the texture still shows up in the list, just without
      // a preview image.
    }
    result.push({ id: texture.uuid, label: texture.name || [...labels].join(' + '), thumbnail })
  }
  return result
}

interface ModelTemplate {
  scene: Group
  textures: ModelTextureInfo[]
}

const modelCache = new Map<string, Promise<ModelTemplate>>()

function loadModelTemplate(assetId: string): Promise<ModelTemplate> {
  let promise = modelCache.get(assetId)
  if (promise) return promise
  promise = (async () => {
    const blob = await getAssetBlob(assetId)
    if (!blob) throw new Error(`Asset de modelo ausente: ${assetId}`)
    const arrayBuffer = await blob.arrayBuffer()
    const gltf = await new Promise<{ scene: Group }>((resolve, reject) => {
      gltfLoader.parse(arrayBuffer, '', resolve, reject)
    })
    return { scene: gltf.scene, textures: extractModelTextures(gltf.scene) }
  })()
  modelCache.set(assetId, promise)
  return promise
}

// Only self-contained binary glTF is supported — GLTFLoader.parse above needs
// a single ArrayBuffer with no external .bin/texture references to resolve
// (there's no filesystem/server here to resolve them against, and the
// storage model is "one blob per asset"). A `.gltf` (JSON) dropped in is
// rejected with a clear message instead of importing broken. Shared by every
// model-import entry point (AssetBrowser's "Modelos" tab, Inspector's
// "Substituir arquivo").
export function rejectIfNotGlb(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith('.glb')) return true
  if (name.endsWith('.gltf')) {
    window.alert(
      'Arquivos .gltf não são suportados — apenas .glb (glTF binário autocontido). Exporte como .glb e tente novamente.',
    )
    return false
  }
  window.alert('Selecione um arquivo .glb.')
  return false
}

export type AssetLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface ImportedModelState {
  status: AssetLoadStatus
  model: Group | null
  textures: ModelTextureInfo[]
}

const IDLE_STATE: ImportedModelState = { status: 'idle', model: null, textures: [] }

// Returns a fresh clone of the cached GLTF template per assetId — three.js's
// default Object3D.clone() copies the node hierarchy but shares geometries/
// materials by reference, which is exactly what we want (one set of GPU
// resources, many placed instances). castShadow/receiveShadow are set on
// every mesh in the clone since three.js doesn't cascade those flags from a
// parent Group down to children on its own. `textures` (the model's own
// embedded PBR maps, extracted once per assetId — see extractModelTextures)
// is read-only info for the Inspector to display, not something a clone
// needs its own copy of.
export function useImportedModel(assetId: string | undefined): ImportedModelState {
  const [state, setState] = useState<ImportedModelState>(IDLE_STATE)

  useEffect(() => {
    if (!assetId) {
      setState(IDLE_STATE)
      return
    }
    let cancelled = false
    setState({ status: 'loading', model: null, textures: [] })
    loadModelTemplate(assetId)
      .then(({ scene, textures }) => {
        if (cancelled) return
        const instance = scene.clone(true)
        instance.traverse((node) => {
          if ('isMesh' in node && node.isMesh) {
            node.castShadow = true
            node.receiveShadow = true
          }
        })
        setState({ status: 'ready', model: instance, textures })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: 'error', model: null, textures: [] })
      })
    return () => {
      cancelled = true
    }
  }, [assetId])

  return state
}

const textureCache = new Map<string, Promise<Texture>>()

function loadImageTexture(assetId: string): Promise<Texture> {
  let promise = textureCache.get(assetId)
  if (promise) return promise
  promise = (async () => {
    const blob = await getAssetBlob(assetId)
    if (!blob) throw new Error(`Asset de textura ausente: ${assetId}`)
    const bitmap = await createImageBitmap(blob)
    const texture = new Texture(bitmap)
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    return texture
  })()
  textureCache.set(assetId, promise)
  return promise
}

// Shared directly (not cloned) across every object using the same texture
// asset — unlike models, a THREE.Texture has no per-instance placement state
// to keep separate, so one GPU upload can back every material that
// references it.
export function useImageTexture(assetId: string | null | undefined): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null)

  useEffect(() => {
    if (!assetId) {
      setTexture(null)
      return
    }
    let cancelled = false
    loadImageTexture(assetId)
      .then((tex) => {
        if (!cancelled) setTexture(tex)
      })
      .catch(() => {
        if (!cancelled) setTexture(null)
      })
    return () => {
      cancelled = true
    }
  }, [assetId])

  return texture
}

// Ref-counted object URL, the one place in this file that needs one (see
// Editor3D-plan notes: image textures go through createImageBitmap, audio
// through decodeAudioData, model through GLTFLoader.parse's ArrayBuffer
// overload — none of those need a URL at all). A <video> element only
// decodes from a src URL, so this exists purely to back useVideoTexture
// below. Revoked once the last consumer releases it, not on every
// unmount/remount, so two objects sharing the same video asset don't thrash
// the same URL.
const objectUrlRefCount = new Map<string, number>()
const objectUrlPromise = new Map<string, Promise<string>>()

function acquireObjectUrl(assetId: string): Promise<string> {
  objectUrlRefCount.set(assetId, (objectUrlRefCount.get(assetId) ?? 0) + 1)
  let promise = objectUrlPromise.get(assetId)
  if (!promise) {
    promise = (async () => {
      const blob = await getAssetBlob(assetId)
      if (!blob) throw new Error(`Asset de vídeo ausente: ${assetId}`)
      return URL.createObjectURL(blob)
    })()
    objectUrlPromise.set(assetId, promise)
  }
  return promise
}

function releaseObjectUrl(assetId: string) {
  const count = (objectUrlRefCount.get(assetId) ?? 1) - 1
  if (count > 0) {
    objectUrlRefCount.set(assetId, count)
    return
  }
  objectUrlRefCount.delete(assetId)
  const promise = objectUrlPromise.get(assetId)
  objectUrlPromise.delete(assetId)
  promise?.then((url) => URL.revokeObjectURL(url)).catch(() => {})
}

function useAssetObjectURL(assetId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!assetId) {
      setUrl(null)
      return
    }
    let cancelled = false
    acquireObjectUrl(assetId)
      .then((u) => {
        if (!cancelled) setUrl(u)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
      releaseObjectUrl(assetId)
    }
  }, [assetId])

  return url
}

// Hidden <video> element driving a THREE.VideoTexture — muted/looping/
// playsInline so it autoplays silently as soon as applied (this is a video
// *texture*, not a sound; the "sem autoplay" rule in Fase 5 is about actual
// audio, which this never produces). Created imperatively rather than as
// JSX since it's DOM, not a three.js scene object — R3F's <Canvas> tree only
// ever holds three.js objects.
export function useVideoTexture(assetId: string | null | undefined): VideoTexture | null {
  const objectUrl = useAssetObjectURL(assetId)
  const [texture, setTexture] = useState<VideoTexture | null>(null)

  useEffect(() => {
    if (!objectUrl) {
      setTexture(null)
      return
    }
    const video = document.createElement('video')
    video.src = objectUrl
    video.loop = true
    video.muted = true
    video.playsInline = true
    video.style.display = 'none'
    document.body.appendChild(video)
    const tex = new VideoTexture(video)
    tex.colorSpace = SRGBColorSpace
    void video.play().catch(() => {})
    setTexture(tex)
    return () => {
      video.pause()
      video.remove()
      tex.dispose()
    }
  }, [objectUrl])

  return texture
}

const audioBufferCache = new Map<string, Promise<AudioBuffer>>()

function loadAudioBuffer(assetId: string): Promise<AudioBuffer> {
  let promise = audioBufferCache.get(assetId)
  if (promise) return promise
  promise = (async () => {
    const blob = await getAssetBlob(assetId)
    if (!blob) throw new Error(`Asset de áudio ausente: ${assetId}`)
    const arrayBuffer = await blob.arrayBuffer()
    // Decoded through the same AudioContext every THREE.Audio/
    // PositionalAudio in the app plays through (see audioListener.ts) — a
    // decoded AudioBuffer isn't tied to a particular context instance the
    // way a MediaElementSource would be, but reusing the one context avoids
    // ever needing a second one.
    return globalAudioListener.context.decodeAudioData(arrayBuffer)
  })()
  audioBufferCache.set(assetId, promise)
  return promise
}

// Shared directly across every soundSource/background-music consumer of the
// same audio asset, same reasoning as useImageTexture above — an AudioBuffer
// is immutable decoded PCM data with no per-instance playback state (that
// state lives on the THREE.Audio/PositionalAudio node itself, created
// per-instance by the caller).
export function useAudioBuffer(assetId: string | null | undefined): AudioBuffer | null {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)

  useEffect(() => {
    if (!assetId) {
      setBuffer(null)
      return
    }
    let cancelled = false
    loadAudioBuffer(assetId)
      .then((buf) => {
        if (!cancelled) setBuffer(buf)
      })
      .catch(() => {
        if (!cancelled) setBuffer(null)
      })
    return () => {
      cancelled = true
    }
  }, [assetId])

  return buffer
}
