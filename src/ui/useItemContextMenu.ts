import { useState } from 'react'

export interface ItemContextMenuState {
  pos: { x: number; y: number }
  onDelete: () => void
}

// Right-click-on-an-existing-item menu ("Excluir") — separate from
// useAssetContextMenu (the empty-area "Nova pasta"/"Importar" menu) since an
// item's own onContextMenu stops propagation, so this one wins over the
// grid's whenever the cursor is over a tile/folder instead of empty space.
// Shared by every folder-organized AssetBrowser tab and FolderTile.
export function useItemContextMenu() {
  const [menu, setMenu] = useState<ItemContextMenuState | null>(null)

  const openItemMenu = (e: React.MouseEvent, onDelete: () => void) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ pos: { x: e.clientX, y: e.clientY }, onDelete })
  }
  const close = () => setMenu(null)

  return { menu, openItemMenu, close }
}
