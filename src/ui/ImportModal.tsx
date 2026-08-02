import { useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus, Image, Package, Video, Volume2, X } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import { rejectIfNotGlb } from '../scene/assetLoaders'
import { ImportStudio } from './ImportStudio'

// Tile grid launcher for every import kind this project actually supports,
// modeled on Spline's "Import or Drag & Drop" window — but each tile calls
// the real store action (importModel/importTexture/importVideo/importAudio)
// instead of being decorative, since those flows already exist (see
// AssetBrowser.tsx's per-tab file inputs). Kinds Spline has that we don't
// (Vector, Gaussian Splat, AI generation) are left out rather than faked.
export function ImportModal({ onClose }: { onClose: () => void }) {
  const importModel = useEditorStore((s) => s.importModel)
  const importTexture = useEditorStore((s) => s.importTexture)
  const importVideo = useEditorStore((s) => s.importVideo)
  const importAudio = useEditorStore((s) => s.importAudio)

  const modelInputRef = useRef<HTMLInputElement>(null)
  const textureInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)

  const handleModelChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !rejectIfNotGlb(file)) return
    await importModel(file, null)
    onClose()
  }

  const handleTextureChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await importTexture(file, null)
    onClose()
  }

  const handleVideoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await importVideo(file, null)
    onClose()
  }

  const handleAudioChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await importAudio(file, null)
    onClose()
  }

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setPendingPhoto(file)
  }

  // ImportStudio is its own full-screen overlay (see its file header) — when
  // a photo is pending, render it alone instead of nesting it inside this
  // modal's overlay, so clicks inside it don't bubble up to our
  // onClick={onClose} and close the whole flow mid-edit.
  if (pendingPhoto) {
    return (
      <ImportStudio
        file={pendingPhoto}
        folderId={null}
        onClose={() => {
          setPendingPhoto(null)
          onClose()
        }}
      />
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-modal-header">
          <h3>Importar</h3>
          <button className="modal-close" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="asset-grid">
          <button className="asset-tile" onClick={() => modelInputRef.current?.click()}>
            <span className="asset-tile-icon">
              <Package size={22} />
            </span>
            <span className="asset-tile-label">Modelo 3D (.glb)</span>
          </button>
          <button className="asset-tile" onClick={() => textureInputRef.current?.click()}>
            <span className="asset-tile-icon">
              <Image size={22} />
            </span>
            <span className="asset-tile-label">Textura (JPG, PNG)</span>
          </button>
          <button className="asset-tile" onClick={() => videoInputRef.current?.click()}>
            <span className="asset-tile-icon">
              <Video size={22} />
            </span>
            <span className="asset-tile-label">Vídeo (MP4)</span>
          </button>
          <button className="asset-tile" onClick={() => audioInputRef.current?.click()}>
            <span className="asset-tile-icon">
              <Volume2 size={22} />
            </span>
            <span className="asset-tile-label">Áudio (MP3, WAV)</span>
          </button>
          <button className="asset-tile asset-tile-import" onClick={() => photoInputRef.current?.click()}>
            <span className="asset-tile-icon">
              <ImagePlus size={22} />
            </span>
            <span className="asset-tile-label">Foto → Objeto</span>
          </button>
        </div>

        <input
          ref={modelInputRef}
          type="file"
          accept=".glb"
          className="asset-file-input"
          onChange={handleModelChange}
        />
        <input
          ref={textureInputRef}
          type="file"
          accept="image/*"
          className="asset-file-input"
          onChange={handleTextureChange}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="asset-file-input"
          onChange={handleVideoChange}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="asset-file-input"
          onChange={handleAudioChange}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="asset-file-input"
          onChange={handlePhotoChange}
        />
      </div>
    </div>
  )
}
