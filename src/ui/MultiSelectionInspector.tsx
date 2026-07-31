import { useEffect } from 'react'
import { Eye, EyeOff, FolderPlus, Lock, Trash2, Unlock } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'

// Bulk-action panel for 2+ objects selected at once (see SceneObjects.tsx/
// Hierarchy.tsx for how Shift/Ctrl-click builds up selectedIds). Deliberately
// scoped to actions only, not the per-object field editors the single-object
// Inspector has — editing shared material/transform fields across a
// mixed-kind selection is a different, bigger feature than what unblocked
// this one (grouping several objects at once), see the multi-selection plan.
export function MultiSelectionInspector({ selectedIds }: { selectedIds: string[] }) {
  const removeObjects = useEditorStore((s) => s.removeObjects)
  const groupSelected = useEditorStore((s) => s.groupSelected)
  const setObjectsLocked = useEditorStore((s) => s.setObjectsLocked)
  const setObjectsHidden = useEditorStore((s) => s.setObjectsHidden)

  // Same convention as the single-object Inspector's shortcut effect:
  // ignored while typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key.toLowerCase() === 'delete' || e.key.toLowerCase() === 'backspace') {
        e.preventDefault()
        removeObjects(selectedIds)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedIds, removeObjects])

  return (
    <div className="floating-panel selection-panel">
      <div className="selection-header">
        <span className="selection-category">SELEÇÃO</span>
        <span className="selection-dimensions">{selectedIds.length} objetos selecionados</span>
      </div>

      <div className="selection-actions">
        <button onClick={() => groupSelected()}>
          <span className="action-label">
            <FolderPlus size={14} />
            Agrupar selecionados
          </span>
        </button>
        <div className="selection-actions-row">
          <button onClick={() => setObjectsLocked(selectedIds, true)}>
            <span className="action-label">
              <Lock size={14} />
              Travar todos
            </span>
          </button>
          <button onClick={() => setObjectsLocked(selectedIds, false)}>
            <span className="action-label">
              <Unlock size={14} />
              Destravar
            </span>
          </button>
        </div>
        <div className="selection-actions-row">
          <button onClick={() => setObjectsHidden(selectedIds, true)}>
            <span className="action-label">
              <EyeOff size={14} />
              Esconder todos
            </span>
          </button>
          <button onClick={() => setObjectsHidden(selectedIds, false)}>
            <span className="action-label">
              <Eye size={14} />
              Mostrar
            </span>
          </button>
        </div>
        <button className="danger" onClick={() => removeObjects(selectedIds)}>
          <span className="action-label">
            <Trash2 size={14} />
            Excluir selecionados
          </span>
          <span className="action-shortcut">Del</span>
        </button>
      </div>
    </div>
  )
}
