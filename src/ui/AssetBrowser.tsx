import { useRef, useState, type ChangeEvent } from 'react'
import { Boxes, Check, ChevronDown, ChevronUp, ImagePlus, Image, Layers, Store, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import { ImportStudio } from './ImportStudio'
import type { AssetBrowserTab } from '../types'

const TABS: { value: AssetBrowserTab; label: string; icon: LucideIcon }[] = [
  { value: 'scenes', label: 'Cenas', icon: Layers },
  { value: 'objects', label: 'Objetos', icon: Boxes },
  { value: 'textures', label: 'Texturas', icon: Image },
  { value: 'store', label: 'Asset Store', icon: Store },
]

// Purely decorative — this project has no asset store backend. Placeholder
// cards only, matching the visual weight of a real catalog (see
// editworld-vtt skill notes on the Interverse Engine comparison).
const MOCK_STORE_ITEMS = [
  'Kit de masmorra',
  'Pacote de vegetação',
  'Rochas e penhascos',
  'Mobília medieval',
  'Ruínas antigas',
  'Pacote de cristais',
]

function ScenesTab() {
  const scenesIndex = useEditorStore((s) => s.scenesIndex)
  const currentSceneId = useEditorStore((s) => s.currentSceneId)
  const switchScene = useEditorStore((s) => s.switchScene)

  return (
    <div className="asset-grid">
      {scenesIndex.map((scene) => (
        <button
          key={scene.id}
          className={`asset-tile ${scene.id === currentSceneId ? 'active' : ''}`}
          onClick={() => switchScene(scene.id)}
        >
          <span className="asset-tile-icon">
            <Layers size={22} />
          </span>
          <span className="asset-tile-label">{scene.name}</span>
          {scene.id === currentSceneId && <Check className="asset-tile-check" size={13} />}
        </button>
      ))}
    </div>
  )
}

function ObjectsTab() {
  const customAssets = useEditorStore((s) => s.customAssets)
  const instantiateCustomAsset = useEditorStore((s) => s.instantiateCustomAsset)
  const removeCustomAsset = useEditorStore((s) => s.removeCustomAsset)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const handleFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the exact same file again later
    if (file) setPendingFile(file)
  }

  // Built-in primitives (Cubo/Esfera/etc.) live only in the toolbar's
  // "Adicionar objeto" dropdown (Toolbar.tsx) — this tab is reserved for
  // actual assets (photo-imported placeholders), not the base shapes.
  return (
    <>
      <div className="asset-grid">
        {customAssets.map((asset) => (
          // A <button> can't contain another <button> (invalid HTML — the
          // browser silently closes the outer one early, breaking both
          // click handling and the :hover-reveal CSS below). Wrapper stays a
          // plain <div>; the two buttons (instantiate / remove) are siblings.
          <div key={asset.id} className="asset-tile asset-tile-custom">
            <button className="asset-tile-hit" onClick={() => instantiateCustomAsset(asset.id)}>
              <span className="asset-tile-icon">
                <Boxes size={22} />
              </span>
              <span className="asset-tile-label">{asset.name}</span>
            </button>
            <button
              className="asset-tile-remove"
              title="Remover do Asset Store"
              onClick={() => removeCustomAsset(asset.id)}
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button className="asset-tile asset-tile-import" onClick={() => fileInputRef.current?.click()}>
          <span className="asset-tile-icon">
            <ImagePlus size={22} />
          </span>
          <span className="asset-tile-label">Importar por foto</span>
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="asset-file-input"
        onChange={handleFileChosen}
      />
      {pendingFile && <ImportStudio file={pendingFile} onClose={() => setPendingFile(null)} />}
    </>
  )
}

function TexturesTab() {
  return <div className="asset-browser-empty">Nenhuma textura ainda.</div>
}

function StoreTab() {
  return (
    <div className="asset-grid">
      {MOCK_STORE_ITEMS.map((name) => (
        <div key={name} className="asset-tile asset-tile-mock">
          <span className="asset-tile-icon">
            <Store size={22} />
          </span>
          <span className="asset-tile-label">{name}</span>
        </div>
      ))}
    </div>
  )
}

export function AssetBrowser() {
  const open = useEditorStore((s) => s.assetBrowserOpen)
  const toggleOpen = useEditorStore((s) => s.toggleAssetBrowser)
  const activeTab = useEditorStore((s) => s.assetBrowserTab)
  const setActiveTab = useEditorStore((s) => s.setAssetBrowserTab)

  return (
    <>
      {open && (
        <div className="asset-browser">
          <div className="asset-browser-sidebar">
            {TABS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                className={activeTab === value ? 'active' : ''}
                onClick={() => setActiveTab(value)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <div className="asset-browser-content">
            {activeTab === 'scenes' && <ScenesTab />}
            {activeTab === 'objects' && <ObjectsTab />}
            {activeTab === 'textures' && <TexturesTab />}
            {activeTab === 'store' && <StoreTab />}
          </div>
        </div>
      )}
      <button className="asset-browser-toggle" onClick={() => toggleOpen()}>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </>
  )
}
