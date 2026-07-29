import { Fragment, useState } from 'react'
import {
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Cone,
  Cylinder,
  Eye,
  EyeOff,
  FolderPlus,
  Group as GroupIcon,
  Home,
  Lock,
  Plus,
  Save,
  Search,
  Square,
  Trash2,
  Unlock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import type { PrimitiveKind, SceneObject } from '../types'
import { ConfirmDialog } from './ConfirmDialog'

const KIND_ICON: Record<PrimitiveKind, LucideIcon> = {
  box: Box,
  sphere: Circle,
  cylinder: Cylinder,
  cone: Cone,
  plane: Square,
}

function ScenesSection() {
  const scenesIndex = useEditorStore((s) => s.scenesIndex)
  const currentSceneId = useEditorStore((s) => s.currentSceneId)
  const isDirty = useEditorStore((s) => s.isDirty)
  const switchScene = useEditorStore((s) => s.switchScene)
  const createScene = useEditorStore((s) => s.createScene)
  const saveScene = useEditorStore((s) => s.saveScene)
  const renameScene = useEditorStore((s) => s.renameScene)

  const [collapsed, setCollapsed] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

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
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          Cenas
        </button>
        <button
          className="scenes-add"
          onClick={() => runOrConfirm(() => createScene())}
          title="Nova cena"
        >
          <Plus size={14} />
        </button>
      </div>

      {!collapsed && (
        <ul className="scenes-list">
          {scenesIndex.map((scene) => (
            <li
              key={scene.id}
              className={scene.id === currentSceneId ? 'selected' : ''}
              onClick={() => runOrConfirm(() => switchScene(scene.id))}
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
  onSelect: () => void
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

export function Hierarchy() {
  const objects = useEditorStore((s) => s.objects)
  const groups = useEditorStore((s) => s.groups)
  const selectedId = useEditorStore((s) => s.selectedId)
  const select = useEditorStore((s) => s.select)
  const updateObject = useEditorStore((s) => s.updateObject)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const toggleHidden = useEditorStore((s) => s.toggleHidden)
  const setObjectGroup = useEditorStore((s) => s.setObjectGroup)
  const createGroup = useEditorStore((s) => s.createGroup)
  const removeGroup = useEditorStore((s) => s.removeGroup)
  const renameGroup = useEditorStore((s) => s.renameGroup)
  const toggleGroupLocked = useEditorStore((s) => s.toggleGroupLocked)
  const toggleGroupHidden = useEditorStore((s) => s.toggleGroupHidden)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [query, setQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

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
    selected: obj.id === selectedId,
    isEditing: editingId === obj.id,
    draftName,
    onSelect: () => select(obj.id),
    onStartRename: () => startRename(obj.id, obj.name),
    onDraftChange: setDraftName,
    onCommitRename: () => commitObjectRename(obj.id),
    onCancelRename: () => setEditingId(null),
    onToggleLocked: () => toggleLocked(obj.id),
    onToggleHidden: () => toggleHidden(obj.id),
  })

  return (
    <div className="floating-panel hierarchy">
      <ScenesSection />

      <div className="objects-header">
        <h3>Objetos</h3>
        <button className="scenes-add" onClick={() => createGroup()} title="Novo grupo">
          <FolderPlus size={14} />
        </button>
      </div>

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
  )
}
