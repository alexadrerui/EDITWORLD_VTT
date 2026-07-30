import { Boxes, Check, ChevronDown, ChevronUp, Image, Layers, Store } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import { PRIMITIVE_ICON, PRIMITIVE_LABEL, isLightKind } from '../scene/primitives'
import type { AssetBrowserTab, PrimitiveKind } from '../types'

// Mesh primitives only — lights already have their own "Adicionar luz" menu
// in Toolbar.tsx, same split kept here.
const MESH_KINDS = (Object.keys(PRIMITIVE_LABEL) as PrimitiveKind[]).filter(
  (kind) => !isLightKind(kind),
)

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
  const addObject = useEditorStore((s) => s.addObject)

  return (
    <div className="asset-grid">
      {MESH_KINDS.map((kind) => {
        const Icon = PRIMITIVE_ICON[kind]
        return (
          <button key={kind} className="asset-tile" onClick={() => addObject(kind)}>
            <span className="asset-tile-icon">
              <Icon size={22} />
            </span>
            <span className="asset-tile-label">{PRIMITIVE_LABEL[kind]}</span>
          </button>
        )
      })}
    </div>
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
