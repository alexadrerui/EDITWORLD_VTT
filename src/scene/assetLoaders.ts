// Module-level loaders/caches for asset-backed content: imported GLB models,
// image/video textures, and decoded audio buffers. Shared across every
// SceneObjectMesh instance so the same assetId is only fetched from
// IndexedDB and parsed/decoded once, no matter how many scene objects
// reference it — each React hook below just asks the cache for its
// per-assetId promise and (for models) clones the shared template.
import { useEffect, useState } from 'react'
import { Group, SRGBColorSpace, Texture, VideoTexture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { getAssetBlob } from '../state/assetStore'
import { globalAudioListener } from './audioListener'

const gltfLoader = new GLTFLoader()

const modelCache = new Map<string, Promise<Group>>()

function loadModelTemplate(assetId: string): Promise<Group> {
  let promise = modelCache.get(assetId)
  if (promise) return promise
  promise = (async () => {
    const blob = await getAssetBlob(assetId)
    if (!blob) throw new Error(`Asset de modelo ausente: ${assetId}`)
    const arrayBuffer = await blob.arrayBuffer()
    return new Promise<Group>((resolve, reject) => {
      gltfLoader.parse(arrayBuffer, '', (gltf) => resolve(gltf.scene), reject)
    })
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

// Returns a fresh clone of the cached GLTF template per assetId — three.js's
// default Object3D.clone() copies the node hierarchy but shares geometries/
// materials by reference, which is exactly what we want (one set of GPU
// resources, many placed instances). castShadow/receiveShadow are set on
// every mesh in the clone since three.js doesn't cascade those flags from a
// parent Group down to children on its own.
export function useImportedModel(assetId: string | undefined): {
  status: AssetLoadStatus
  model: Group | null
} {
  const [state, setState] = useState<{ status: AssetLoadStatus; model: Group | null }>({
    status: 'idle',
    model: null,
  })

  useEffect(() => {
    if (!assetId) {
      setState({ status: 'idle', model: null })
      return
    }
    let cancelled = false
    setState({ status: 'loading', model: null })
    loadModelTemplate(assetId)
      .then((template) => {
        if (cancelled) return
        const instance = template.clone(true)
        instance.traverse((node) => {
          if ('isMesh' in node && node.isMesh) {
            node.castShadow = true
            node.receiveShadow = true
          }
        })
        setState({ status: 'ready', model: instance })
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: 'error', model: null })
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
