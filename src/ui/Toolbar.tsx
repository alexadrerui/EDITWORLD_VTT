import { useEffect } from 'react'
import { Plus, Redo2, Undo2 } from 'lucide-react'
import type { PrimitiveKind } from '../types'
import { useEditorStore } from '../state/useEditorStore'
import { useDropdown } from './useDropdown'

const PRIMITIVES: { kind: PrimitiveKind; label: string }[] = [
  { kind: 'box', label: 'Cubo' },
  { kind: 'sphere', label: 'Esfera' },
  { kind: 'cylinder', label: 'Cilindro' },
  { kind: 'cone', label: 'Cone' },
  { kind: 'plane', label: 'Placa' },
]

function HistoryButtons() {
  const canUndo = useEditorStore((s) => s.undoStack.length > 0)
  const canRedo = useEditorStore((s) => s.redoStack.length > 0)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key.toLowerCase() !== 'z') return

      e.preventDefault()
      if (e.shiftKey) useEditorStore.getState().redo()
      else useEditorStore.getState().undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="toolbar-group">
      <button disabled={!canUndo} onClick={() => undo()} title="Desfazer (Ctrl+Z)">
        <Undo2 size={14} />
      </button>
      <button disabled={!canRedo} onClick={() => redo()} title="Refazer (Ctrl+Shift+Z)">
        <Redo2 size={14} />
      </button>
    </div>
  )
}

function AddObjectMenu() {
  const addObject = useEditorStore((s) => s.addObject)
  const { open, setOpen, rootRef } = useDropdown<HTMLDivElement>()

  return (
    <div className="dropdown" ref={rootRef}>
      <button onClick={() => setOpen((v) => !v)}>
        <Plus size={14} /> Adicionar objeto
      </button>
      {open && (
        <div className="dropdown-menu">
          {PRIMITIVES.map((p) => (
            <button
              key={p.kind}
              onClick={() => {
                addObject(p.kind)
                setOpen(false)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Toolbar() {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <AddObjectMenu />
      </div>

      <HistoryButtons />
    </div>
  )
}
