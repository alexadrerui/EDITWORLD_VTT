import { useState } from 'react'
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
  Home,
  Lock,
  Plus,
  Save,
  Square,
  Unlock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import type { PrimitiveKind } from '../types'
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

export function Hierarchy() {
  const objects = useEditorStore((s) => s.objects)
  const selectedId = useEditorStore((s) => s.selectedId)
  const select = useEditorStore((s) => s.select)
  const updateObject = useEditorStore((s) => s.updateObject)
  const toggleLocked = useEditorStore((s) => s.toggleLocked)
  const toggleHidden = useEditorStore((s) => s.toggleHidden)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  const startRename = (id: string, currentName: string) => {
    setEditingId(id)
    setDraftName(currentName)
  }

  const commitRename = (id: string) => {
    const trimmed = draftName.trim()
    if (trimmed) updateObject(id, { name: trimmed })
    setEditingId(null)
  }

  return (
    <div className="floating-panel hierarchy">
      <ScenesSection />

      <h3>Objetos</h3>
      {objects.length === 0 && <p className="empty">Nenhum objeto na cena</p>}
      <ul>
        {objects.map((obj) => {
          const Icon = KIND_ICON[obj.kind]
          const hasState = obj.locked || obj.hidden

          return (
            <li
              key={obj.id}
              className={[
                obj.id === selectedId ? 'selected' : '',
                hasState ? 'has-state' : '',
              ].join(' ')}
              onClick={() => select(obj.id)}
            >
              <Icon size={13} className="hierarchy-kind-icon" />

              {editingId === obj.id ? (
                <input
                  autoFocus
                  className="hierarchy-rename-input"
                  value={draftName}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitRename(obj.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(obj.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span
                  className="hierarchy-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startRename(obj.id, obj.name)
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
                    toggleLocked(obj.id)
                  }}
                  title={obj.locked ? 'Destravar' : 'Travar'}
                >
                  {obj.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button
                  className={obj.hidden ? 'active' : ''}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleHidden(obj.id)
                  }}
                  title={obj.hidden ? 'Mostrar' : 'Esconder'}
                >
                  {obj.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
