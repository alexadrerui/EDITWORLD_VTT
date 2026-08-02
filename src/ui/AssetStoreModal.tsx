import { useState } from 'react'
import { ChevronLeft, Search, Store, X } from 'lucide-react'

// Purely decorative — this project has no asset store backend yet. Mock
// items only, grouped into categories per tab (Objects/Scenes), matching
// Spline's Templates window structure (see editworld-vtt skill notes). A
// bought item is meant to land in the bottom AssetBrowser panel
// (Objetos/Modelos/etc.) once a real store backend exists — see
// AssetBrowser.tsx's TABS comment.
interface StoreCategory {
  name: string
  items: string[]
}

const OBJECT_CATEGORIES: StoreCategory[] = [
  { name: 'Masmorra', items: ['Kit de masmorra', 'Portão de ferro', 'Alavanca de pedra', 'Grade enferrujada'] },
  { name: 'Natureza', items: ['Pacote de vegetação', 'Rochas e penhascos', 'Pedra musgosa', 'Tronco caído'] },
  { name: 'Mobília', items: ['Mobília medieval', 'Baú do tesouro', 'Estante de livros', 'Mesa de taverna'] },
  { name: 'Diversos', items: ['Pacote de cristais', 'Barril', 'Tocha de parede', 'Caldeirão'] },
]

const SCENE_CATEGORIES: StoreCategory[] = [
  { name: 'Masmorra', items: ['Ruínas antigas', 'Câmara do dragão', 'Cripta esquecida'] },
  { name: 'Exterior', items: ['Floresta assombrada', 'Vila medieval', 'Acampamento noturno'] },
  { name: 'Diversos', items: ['Taverna', 'Torre do mago', 'Arena de combate'] },
]

function matches(name: string, query: string) {
  return name.toLowerCase().includes(query.trim().toLowerCase())
}

export function AssetStoreModal({ onClose }: { onClose: () => void }) {
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
    ? categories.flatMap((c) => c.items.filter((name) => matches(name, query)))
    : []

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
                <div className="asset-grid">
                  {searchResults.map((name) => (
                    <div key={name} className="asset-tile asset-tile-mock">
                      <span className="asset-tile-icon">
                        <Store size={22} />
                      </span>
                      <span className="asset-tile-label">{name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">Nenhum item encontrado</p>
              )
            ) : currentCategory ? (
              <>
                <button className="templates-modal-breadcrumb" onClick={() => setActiveCategory(null)}>
                  <ChevronLeft size={14} />
                  {currentCategory.name}
                </button>
                <div className="asset-grid">
                  {currentCategory.items.map((name) => (
                    <div key={name} className="asset-tile asset-tile-mock">
                      <span className="asset-tile-icon">
                        <Store size={22} />
                      </span>
                      <span className="asset-tile-label">{name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              categories.map((c) => (
                <div key={c.name} className="templates-modal-section">
                  <div className="templates-modal-section-header">
                    <h4>{c.name}</h4>
                  </div>
                  <div className="asset-grid">
                    {c.items.map((name) => (
                      <div key={name} className="asset-tile asset-tile-mock">
                        <span className="asset-tile-icon">
                          <Store size={22} />
                        </span>
                        <span className="asset-tile-label">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
