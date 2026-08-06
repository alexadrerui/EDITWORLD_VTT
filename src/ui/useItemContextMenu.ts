import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface ItemContextMenuAction {
  label: string
  icon: LucideIcon
  onClick: () => void
}

export interface ItemContextMenuState {
  pos: { x: number; y: number }
  // Optional so a caller can omit the destructive action entirely (e.g. the
  // last remaining scene in Hierarchy.tsx can't be deleted) instead of
  // rendering a button that would just no-op.
  onDelete?: () => void
  extraActions?: ItemContextMenuAction[]
}

// Right-click-on-an-existing-item menu ("Excluir", optionally plus a few
// non-destructive actions like Hierarchy.tsx's scene "Exportar") — separate
// from useAssetContextMenu (the empty-area "Nova pasta"/"Importar" menu)
// since an item's own onContextMenu stops propagation, so this one wins over
// the grid's whenever the cursor is over a tile/folder instead of empty
// space. Shared by every folder-organized AssetBrowser tab, FolderTile, and
// the Hierarchy scene list.
export function useItemContextMenu() {
  const [menu, setMenu] = useState<ItemContextMenuState | null>(null)

  const openItemMenu = (
    e: React.MouseEvent,
    onDelete?: () => void,
    extraActions?: ItemContextMenuAction[],
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ pos: { x: e.clientX, y: e.clientY }, onDelete, extraActions })
  }
  const close = () => setMenu(null)

  return { menu, openItemMenu, close }
}
