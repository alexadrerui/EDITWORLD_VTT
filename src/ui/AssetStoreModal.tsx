import { useState } from 'react'
import { ChevronLeft, LayoutTemplate, Search, Store, X } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import { PRIMITIVE_ICON } from '../scene/primitives'
import { SCENE_TEMPLATES, type SceneTemplateId } from '../scene/sceneTemplates'
import type { ProceduralKind } from '../types'

// Mostly still decorative — this project has no asset store backend yet, so
// most items are mock (no `kind`/`templateId`, purely a placeholder card). A
// handful of "Diversos"/"Mobília" items are wired to a real procedural
// generator (see proceduralModels.ts) via `kind`: clicking one actually
// places that object in the scene, same as AssetBrowser.tsx's ModelsTab
// tiles do for imported models. A handful of "Scenes" tab items are wired to
// a real starter-scene layout (see sceneTemplates.ts) via `templateId`:
// clicking one creates a whole new scene from it. Every other item is meant
// to land in the bottom AssetBrowser panel (Objetos/Modelos/etc.) once a
// real store backend exists — see AssetBrowser.tsx's TABS comment.
interface StoreItem {
  name: string
  kind?: ProceduralKind
  templateId?: SceneTemplateId
}

interface StoreCategory {
  name: string
  items: StoreItem[]
}

const OBJECT_CATEGORIES: StoreCategory[] = [
  {
    name: 'Masmorra',
    items: [
      { name: 'Kit de masmorra' },
      { name: 'Portão de ferro' },
      { name: 'Alavanca de pedra' },
      { name: 'Grade enferrujada' },
    ],
  },
  {
    name: 'Natureza',
    items: [
      { name: 'Pacote de vegetação' },
      { name: 'Rochas e penhascos' },
      { name: 'Pedra musgosa' },
      { name: 'Tronco caído' },
    ],
  },
  {
    name: 'Mobília',
    items: [
      { name: 'Mobília medieval' },
      { name: 'Baú do tesouro', kind: 'treasureChest' },
      { name: 'Estante de livros' },
      { name: 'Mesa de taverna' },
    ],
  },
  {
    name: 'Diversos',
    items: [
      { name: 'Pacote de cristais' },
      { name: 'Barril', kind: 'barrel' },
      { name: 'Tocha de parede', kind: 'wallTorch' },
      { name: 'Caldeirão', kind: 'cauldron' },
    ],
  },
]

const SCENE_CATEGORIES: StoreCategory[] = [
  {
    name: 'Masmorra',
    items: [
      { name: 'Ruínas antigas', templateId: 'ancientRuins' },
      { name: 'Câmara do dragão' },
      { name: 'Cripta esquecida' },
    ],
  },
  {
    name: 'Exterior',
    items: [
      { name: 'Floresta assombrada' },
      { name: 'Vila medieval' },
      { name: 'Acampamento noturno', templateId: 'nightCamp' },
    ],
  },
  {
    name: 'Diversos',
    items: [{ name: 'Taverna', templateId: 'tavern' }, { name: 'Torre do mago' }, { name: 'Arena de combate' }],
  },
]

function matches(name: string, query: string) {
  return name.toLowerCase().includes(query.trim().toLowerCase())
}

export function AssetStoreModal({ onClose }: { onClose: () => void }) {
  const addObject = useEditorStore((s) => s.addObject)
  const createSceneFromTemplate = useEditorStore((s) => s.createSceneFromTemplate)
  const [tab, setTab] = useState<'objects' | 'scenes'>('objects')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const categories = tab === 'objects' ? OBJECT_CATEGORIES : SCENE_CATEGORIES
  const isSearching = query.trim() !== ''
  const currentCategory = categories.find((c) => c.name === activeCategory) ?? null

  const changeTab = (next: 'objects' | 'scenes') => {
    setTab(next)
    setActiveCategory(null)
  }

  const searchResults = isSearching
    ? categories.flatMap((c) => c.items.filter((item) => matches(item.name, query)))
    : []

  const placeItem = (kind: ProceduralKind) => {
    addObject(kind)
    onClose()
  }

  const placeTemplate = (templateId: SceneTemplateId, name: string) => {
    createSceneFromTemplate(SCENE_TEMPLATES[templateId], name)
    onClose()
  }

  const renderTile = (item: StoreItem) => {
    if (item.kind) {
      const Icon = PRIMITIVE_ICON[item.kind]
      return (
        <button key={item.name} className="asset-tile" onClick={() => placeItem(item.kind as ProceduralKind)}>
          <span className="asset-tile-icon">
            <Icon size={22} />
          </span>
          <span className="asset-tile-label">{item.name}</span>
        </button>
      )
    }
    if (item.templateId) {
      return (
        <button
          key={item.name}
          className="asset-tile"
          onClick={() => placeTemplate(item.templateId as SceneTemplateId, item.name)}
        >
          <span className="asset-tile-icon">
            <LayoutTemplate size={22} />
          </span>
          <span className="asset-tile-label">{item.name}</span>
        </button>
      )
    }
    return (
      <div key={item.name} className="asset-tile asset-tile-mock">
        <span className="asset-tile-icon">
          <Store size={22} />
        </span>
        <span className="asset-tile-label">{item.name}</span>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal templates-modal" onClick={(e) => e.stopPropagation()}>
        <div className="templates-modal-header">
          <h3>Asset Store</h3>
          <div className="templates-modal-tabs">
            <button className={tab === 'objects' ? 'active' : ''} onClick={() => changeTab('objects')}>
              Objects
            </button>
            <button className={tab === 'scenes' ? 'active' : ''} onClick={() => changeTab('scenes')}>
              Scenes
            </button>
          </div>
          <div className="templates-modal-search">
            <Search size={13} />
            <input
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="modal-close" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="templates-modal-body">
          <div className="templates-modal-sidebar">
            <button className={activeCategory === null ? 'active' : ''} onClick={() => setActiveCategory(null)}>
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.name}
                className={activeCategory === c.name ? 'active' : ''}
                onClick={() => setActiveCategory(c.name)}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="templates-modal-content">
            {isSearching ? (
              searchResults.length > 0 ? (
                <div className="asset-grid">{searchResults.map(renderTile)}</div>
              ) : (
                <p className="empty">Nenhum item encontrado</p>
              )
            ) : currentCategory ? (
              <>
                <button className="templates-modal-breadcrumb" onClick={() => setActiveCategory(null)}>
                  <ChevronLeft size={14} />
                  {currentCategory.name}
                </button>
                <div className="asset-grid">{currentCategory.items.map(renderTile)}</div>
              </>
            ) : (
              categories.map((c) => (
                <div key={c.name} className="templates-modal-section">
                  <div className="templates-modal-section-header">
                    <h4>{c.name}</h4>
                  </div>
                  <div className="asset-grid">{c.items.map(renderTile)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
