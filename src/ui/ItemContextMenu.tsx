import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'
import type { ItemContextMenuState } from './useItemContextMenu'

// Renders the single "Excluir" action for whatever item useItemContextMenu's
// openItemMenu was called with — see AssetContextMenu.tsx for the sibling
// empty-area menu this deliberately doesn't merge with (different trigger,
// different options, and this one needs to win when both could apply).
// Portaled to <body> for the same reason as AssetContextMenu — .asset-browser's
// backdrop-filter/transform would otherwise hijack this menu's `position: fixed`.
export function ItemContextMenu({
  menu,
  close,
  label = 'Excluir',
}: {
  menu: ItemContextMenuState | null
  close: () => void
  label?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu])

  if (!menu) return null

  return createPortal(
    <div ref={rootRef} className="context-menu" style={{ left: menu.pos.x, top: menu.pos.y }}>
      {menu.extraActions?.map((action) => (
        <button
          key={action.label}
          onClick={() => {
            action.onClick()
            close()
          }}
        >
          <action.icon size={14} />
          {action.label}
        </button>
      ))}
      {menu.onDelete && (
        <button
          className="context-menu-danger"
          onClick={() => {
            menu.onDelete!()
            close()
          }}
        >
          <Trash2 size={14} />
          {label}
        </button>
      )}
    </div>,
    document.body,
  )
}
