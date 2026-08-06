import { Fragment, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  FolderPlus,
  Group as GroupIcon,
  HelpCircle,
  Home,
  Lock,
  Plus,
  Save,
  Search,
  Store,
  Trash2,
  Unlock,
} from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import { PRIMITIVE_ICON as KIND_ICON } from '../scene/primitives'
import type { SceneObject } from '../types'
import { exportProjectFile, exportSceneFile, importProjectFile } from '../state/projectFile'
import { ConfirmDialog } from './ConfirmDialog'
import { ImportModal } from './ImportModal'
import { AssetStoreModal } from './AssetStoreModal'
import { ResizeHandle } from './ResizeHandle'
import { ItemContextMenu } from './ItemContextMenu'
import { useItemContextMenu } from './useItemContextMenu'

function ScenesSection() {
  const scenesIndex = useEditorStore((s) => s.scenesIndex)
  const currentSceneId = useEditorStore((s) => s.currentSceneId)
  const isDirty = useEditorStore((s) => s.isDirty)
  const switchScene = useEditorStore((s) => s.switchScene)
  const createScene = useEditorStore((s) => s.createScene)
  const saveScene = useEditorStore((s) => s.saveScene)
  const renameScene = useEditorStore((s) => s.renameScene)
  const removeScene = useEditorStore((s) => s.removeScene)

  const [collapsed, setCollapsed] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const { menu: sceneMenu, openItemMenu: openSceneMenu, close: closeSceneMenu } = useItemContextMenu()

  const runOrConfirm = (action: () => void) => {
    if (isDirty) setPendingAction(() => action)
    else action()
  }

  const startRename = (id: string, currentName: string) => {
    setEditingId(id)
    setDraftName(currentName)
  }

  const commitRename = (id: string) => {
    renameScene(id, draftName)
    setEditingId(null)
  }

  return (
    <div className="scenes-section">
      <div className="scenes-header">
        <button className="scenes-collapse" onClick={() => setCollapsed((v) => !v)}>
          Cenas
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        <button
          className="scenes-add"
          onClick={() => runOrConfirm(() => createScene())}
          title="Nova cena"
        >
          <Plus size={17} />
        </button>
      </div>

      {!collapsed && (
        <ul className="scenes-list">
          {scenesIndex.map((scene) => (
            <li
              key={scene.id}
              className={scene.id === currentSceneId ? 'selected' : ''}
              onClick={() => runOrConfirm(() => switchScene(scene.id))}
              onContextMenu={(e) =>
                openSceneMenu(
                  e,
                  scenesIndex.length > 1 ? () => removeScene(scene.id) : undefined,
                  [{ label: 'Exportar', icon: Download, onClick: () => exportSceneFile(scene) }],
                )
              }
            >
              <span className="scenes-check">
                {scene.id === currentSceneId && <Check size={13} />}
              </span>

              {editingId === scene.id ? (
                <input
                  autoFocus
                  className="hierarchy-rename-input"
                  value={draftName}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitRename(scene.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(scene.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span
                  className="scenes-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startRename(scene.id, scene.name)
                  }}
                >
                  {scene.name}
                </span>
              )}

              <Home size={13} className="scenes-home-icon" />
            </li>
          ))}
        </ul>
      )}

      <button className={`scenes-save ${isDirty ? 'active' : ''}`} disabled={!isDirty} onClick={() => saveScene()}>
        <Save size={13} />
        Salvar{isDirty ? ' •' : ''}
      </button>

      {pendingAction && (
        <ConfirmDialog
          message="Há alterações não salvas na cena atual. Elas serão perdidas ao continuar."
          confirmLabel="Descartar e continuar"
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            pendingAction()
            setPendingAction(null)
          }}
        />
      )}

      <ItemContextMenu menu={sceneMenu} close={closeSceneMenu} label="Excluir cena" />
    </div>
  )
}

function ObjectRow({
  obj,
  indent,
  selected,
  isEditing,
  draftName,
  onSelect,
  onStartRename,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  onToggleLocked,
  onToggleHidden,
}: {
  obj: SceneObject
  indent: boolean
  selected: boolean
  isEditing: boolean
  draftName: string
  onSelect: (e: MouseEvent) => void
  onStartRename: () => void
  onDraftChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onToggleLocked: () => void
  onToggleHidden: () => void
}) {
  const Icon = KIND_ICON[obj.kind]
  const hasState = obj.locked || obj.hidden

  return (
    <li
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', obj.id)}
      className={[
        indent ? 'child-row' : '',
        selected ? 'selected' : '',
        hasState ? 'has-state' : '',
      ].join(' ')}
      onClick={onSelect}
    >
      <Icon size={13} className="hierarchy-kind-icon" />

      {isEditing ? (
        <input
          autoFocus
          className="hierarchy-rename-input"
          value={draftName}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename()
            if (e.key === 'Escape') onCancelRename()
          }}
        />
      ) : (
        <span
          className="hierarchy-name"
          onDoubleClick={(e) => {
            e.stopPropagation()
            onStartRename()
          }}
        >
          {obj.name}
        </span>
      )}

      <span className="hierarchy-row-actions">
        <button
          className={obj.locked ? 'active' : ''}
          onClick={(e) => {
            e.stopPropagation()
            onToggleLocked()
          }}
          title={obj.locked ? 'Destravar' : 'Travar'}
        >
          {obj.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        <button
          className={obj.hidden ? 'active' : ''}
          onClick={(e) => {
            e.stopPropagation()
            onToggleHidden()
          }}
          title={obj.hidden ? 'Mostrar' : 'Esconder'}
        >
          {obj.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </span>
    </li>
  )
}

// Back arrow + campaign title row (Spline-style panel header). The back
// arrow is a placeholder — this project has no campaign-selection screen
// yet, so it doesn't navigate anywhere. Title renames on double-click, same
// pattern as ScenesSection's scene rename above.
function CampaignHeader() {
  const campaignName = useEditorStore((s) => s.campaignName)
  const renameCampaign = useEditorStore((s) => s.renameCampaign)

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')

  const commitRename = () => {
    renameCampaign(draftName)
    setEditing(false)
  }

  return (
    <div className="hierarchy-topbar">
      <button className="hierarchy-back" title="Voltar para seleção de campanhas (em breve)">
        <ArrowLeft size={16} />
      </button>

      {editing ? (
        <input
          autoFocus
          className="hierarchy-campaign-input"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span
          className="hierarchy-campaign-name"
          title={campaignName}
          onDoubleClick={() => {
            setDraftName(campaignName)
            setEditing(true)
          }}
        >
          {campaignName}
        </span>
      )}
    </div>
  )
}

// "Objetos" / "Ativos" panel switcher (Spline-style). "Ativos" is a
// placeholder for now — this panel's asset browsing already lives in the
// separate bottom AssetBrowser.tsx; wiring it in here is future work.
function PanelTabs({
  active,
  onChange,
}: {
  active: 'objects' | 'assets'
  onChange: (tab: 'objects' | 'assets') => void
}) {
  return (
    <div className="hierarchy-tabs">
      <button className={active === 'objects' ? 'active' : ''} onClick={() => onChange('objects')}>
        Objetos
      </button>
      <button className={active === 'assets' ? 'active' : ''} onClick={() => onChange('assets')}>
        Ativos
      </button>
    </div>
  )
}

// Fixed footer row (Spline-style Modelos/Importar/Ajuda e feedback).
// Asset Store opens AssetStoreModal — a separate browse/buy window, kept out
// of the bottom AssetBrowser panel on purpose (that panel is for organizing
// what you already own; a bought item would land there once purchasing is
// real). Import opens ImportModal, a tile launcher for every real import
// flow this project has. Help & Feedback stays a placeholder — no feedback
// channel exists yet.
function HierarchyFooter({
  onOpenAssetStore,
  onOpenImport,
  onExportProject,
  onImportProject,
  exportingProject,
}: {
  onOpenAssetStore: () => void
  onOpenImport: () => void
  onExportProject: () => void
  onImportProject: () => void
  exportingProject: boolean
}) {
  return (
    <div className="hierarchy-footer">
      <button title="Asset Store" onClick={onOpenAssetStore}>
        <Store size={14} />
        Asset Store
      </button>
      <button title="Importar" onClick={onOpenImport}>
        <Download size={14} />
        Import
      </button>
      <button
        title="Baixar a campanha inteira (cenas + assets) como um arquivo .json"
        onClick={onExportProject}
        disabled={exportingProject}
      >
        <FileDown size={14} />
        {exportingProject ? 'Exportando…' : 'Exportar projeto'}
      </button>
      <button
        title="Substituir a campanha atual pelo conteúdo de um arquivo .json de projeto"
        onClick={onImportProject}
      >
        <FileUp size={14} />
        Importar projeto
      </button>
      <button title="Ajuda e feedback (em breve)">
        <HelpCircle size={14} />
        Help &amp; Feedback
      </button>
    </div>
  )
}

export function Hierarchy() {
  const objects = useEditorStore((s) => s.objects)
  const groups = useEditorStore((s) => s.groups)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const select = useEditorStore((s) => s.select)
  const toggleSelect = useEditorStore((s) => s.toggleSelect)
  const updateObject = useEditorStore((s) => s.updateObject)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const toggleHidden = useEditorStore((s) => s.toggleHidden)
  const setObjectGroup = useEditorStore((s) => s.setObjectGroup)
  const createGroup = useEditorStore((s) => s.createGroup)
  const groupSelected = useEditorStore((s) => s.groupSelected)
  const removeGroup = useEditorStore((s) => s.removeGroup)
  const renameGroup = useEditorStore((s) => s.renameGroup)
  const toggleGroupLocked = useEditorStore((s) => s.toggleGroupLocked)
  const toggleGroupHidden = useEditorStore((s) => s.toggleGroupHidden)
  const hierarchyVisible = useEditorStore((s) => s.hierarchyVisible)
  const toggleHierarchyVisible = useEditorStore((s) => s.toggleHierarchyVisible)
  const hierarchyWidth = useEditorStore((s) => s.panelLayout.hierarchyWidth)
  const setPanelLayout = useEditorStore((s) => s.setPanelLayout)
  const persistPanelLayout = useEditorStore((s) => s.persistPanelLayout)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [query, setQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [panelTab, setPanelTab] = useState<'objects' | 'assets'>('objects')
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [assetStoreModalOpen, setAssetStoreModalOpen] = useState(false)
  const [exportingProject, setExportingProject] = useState(false)
  const [pendingProjectImport, setPendingProjectImport] = useState<File | null>(null)
  const projectFileInputRef = useRef<HTMLInputElement>(null)
  const { menu: objectMenu, openItemMenu: openObjectMenu, close: closeObjectMenu } = useItemContextMenu()

  // Right-click-anywhere-in-the-objects-list "Novo grupo" — groups the
  // current selection (same as MultiSelectionInspector's "Agrupar
  // selecionados") when something's selected, otherwise creates an empty
  // group like the toolbar button next to the search field.
  const handleNewGroup = () => {
    if (selectedIds.length > 0) groupSelected()
    else createGroup()
  }

  const handleExportProject = async () => {
    setExportingProject(true)
    try {
      await exportProjectFile()
    } finally {
      setExportingProject(false)
    }
  }

  const handleProjectFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setPendingProjectImport(file)
  }

  // Reloads on success — every piece of live state (Zustand store, undo
  // stacks, current scene/selection, open panels) is derived from
  // localStorage/IndexedDB at store-creation time, so a full reload is the
  // simplest way to make the freshly-imported campaign the live one instead
  // of manually resetting each piece by hand — same "opening a project file"
  // reload any native editor would do.
  const confirmProjectImport = async () => {
    const file = pendingProjectImport
    setPendingProjectImport(null)
    if (!file) return
    const result = await importProjectFile(file)
    if (result.ok) window.location.reload()
    else window.alert(result.error)
  }

  const startRename = (id: string, currentName: string) => {
    setEditingId(id)
    setDraftName(currentName)
  }

  const commitObjectRename = (id: string) => {
    const trimmed = draftName.trim()
    if (trimmed) updateObject(id, { name: trimmed })
    setEditingId(null)
  }

  const commitGroupRename = (id: string) => {
    renameGroup(id, draftName)
    setEditingId(null)
  }

  const toggleGroupCollapsed = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isSearching = query.trim() !== ''
  const filteredObjects = objects.filter((o) =>
    o.name.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const ungroupedObjects = objects.filter((o) => !o.groupId)

  const objectRowProps = (obj: SceneObject, indent: boolean) => ({
    obj,
    indent,
    selected: selectedIds.includes(obj.id),
    isEditing: editingId === obj.id,
    draftName,
    onSelect: (e: MouseEvent) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSelect(obj.id)
      else select(obj.id)
    },
    onStartRename: () => startRename(obj.id, obj.name),
    onDraftChange: setDraftName,
    onCommitRename: () => commitObjectRename(obj.id),
    onCancelRename: () => setEditingId(null),
    onToggleLocked: () => toggleLocked(obj.id),
    onToggleHidden: () => toggleHidden(obj.id),
  })

  return (
    <>
      {hierarchyVisible && (
        <div className="floating-panel hierarchy" style={{ width: hierarchyWidth }}>
          <CampaignHeader />
          <PanelTabs active={panelTab} onChange={setPanelTab} />

          {panelTab === 'assets' ? (
            <p className="empty">Em breve</p>
          ) : (
            <>
          <ScenesSection />

          <div className="hierarchy-search-row">
            {objects.length > 0 && (
              <div className="hierarchy-search">
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Procurar"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            <button className="scenes-add" onClick={() => createGroup()} title="Novo grupo">
              <FolderPlus size={14} />
            </button>
          </div>

      <div
        className="hierarchy-object-list"
        onContextMenu={(e) =>
          openObjectMenu(e, undefined, [
            { label: 'Novo grupo', icon: FolderPlus, onClick: handleNewGroup },
          ])
        }
      >
      {objects.length === 0 && <p className="empty">Nenhum objeto na cena</p>}
      {objects.length > 0 && isSearching && filteredObjects.length === 0 && (
        <p className="empty">Nenhum objeto encontrado</p>
      )}

      {isSearching ? (
        <ul>{filteredObjects.map((obj) => <ObjectRow key={obj.id} {...objectRowProps(obj, false)} />)}</ul>
      ) : (
        <div
          className="hierarchy-objects"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData('text/plain')
            if (id) setObjectGroup(id, null)
          }}
        >
          <ul>
            {groups.map((group) => {
              const isEditingGroup = editingId === group.id
              const hasState = group.locked || group.hidden
              const collapsed = collapsedGroups.has(group.id)
              const children = objects.filter((o) => o.groupId === group.id)

              return (
                <Fragment key={group.id}>
                  <li
                    className={hasState ? 'has-state' : ''}
                    onClick={() => toggleGroupCollapsed(group.id)}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDrop={(e) => {
                      e.stopPropagation()
                      const id = e.dataTransfer.getData('text/plain')
                      if (id) setObjectGroup(id, group.id)
                    }}
                  >
                    {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    <GroupIcon size={13} className="hierarchy-kind-icon" />

                    {isEditingGroup ? (
                      <input
                        autoFocus
                        className="hierarchy-rename-input"
                        value={draftName}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => commitGroupRename(group.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitGroupRename(group.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (
                      <span
                        className="hierarchy-name"
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          startRename(group.id, group.name)
                        }}
                      >
                        {group.name}
                      </span>
                    )}

                    <span className="hierarchy-row-actions">
                      <button
                        className={group.locked ? 'active' : ''}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleGroupLocked(group.id)
                        }}
                        title={group.locked ? 'Destravar' : 'Travar'}
                      >
                        {group.locked ? <Lock size={13} /> : <Unlock size={13} />}
                      </button>
                      <button
                        className={group.hidden ? 'active' : ''}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleGroupHidden(group.id)
                        }}
                        title={group.hidden ? 'Mostrar' : 'Esconder'}
                      >
                        {group.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeGroup(group.id)
                        }}
                        title="Excluir grupo (desagrupa os objetos)"
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </li>
                  {!collapsed &&
                    children.map((obj) => <ObjectRow key={obj.id} {...objectRowProps(obj, true)} />)}
                </Fragment>
              )
            })}

            {ungroupedObjects.map((obj) => (
              <ObjectRow key={obj.id} {...objectRowProps(obj, false)} />
            ))}
          </ul>
        </div>
      )}
      </div>
            </>
          )}

          <HierarchyFooter
            onOpenAssetStore={() => setAssetStoreModalOpen(true)}
            onOpenImport={() => setImportModalOpen(true)}
            onExportProject={handleExportProject}
            onImportProject={() => projectFileInputRef.current?.click()}
            exportingProject={exportingProject}
          />
          <ResizeHandle
            orientation="vertical"
            onResize={(delta) => setPanelLayout({ hierarchyWidth: hierarchyWidth + delta })}
            onResizeEnd={persistPanelLayout}
          />
        </div>
      )}
      <button
        className={`panel-collapse-toggle panel-collapse-toggle--left ${hierarchyVisible ? 'is-open' : ''}`}
        style={{ left: hierarchyVisible ? hierarchyWidth + 20 : undefined }}
        onClick={() => toggleHierarchyVisible()}
        title={hierarchyVisible ? 'Esconder painel' : 'Mostrar painel'}
      >
        {hierarchyVisible ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
      </button>

      <input
        ref={projectFileInputRef}
        type="file"
        accept=".json,application/json"
        className="asset-file-input"
        onChange={handleProjectFileChange}
      />

      {importModalOpen && <ImportModal onClose={() => setImportModalOpen(false)} />}
      {assetStoreModalOpen && <AssetStoreModal onClose={() => setAssetStoreModalOpen(false)} />}
      {pendingProjectImport && (
        <ConfirmDialog
          message={`Importar "${pendingProjectImport.name}" substituirá TODAS as cenas, pastas de assets e assets binários da campanha atual neste navegador. Essa ação não pode ser desfeita.`}
          confirmLabel="Substituir e importar"
          onCancel={() => setPendingProjectImport(null)}
          onConfirm={confirmProjectImport}
        />
      )}

      <ItemContextMenu menu={objectMenu} close={closeObjectMenu} />
    </>
  )
}
