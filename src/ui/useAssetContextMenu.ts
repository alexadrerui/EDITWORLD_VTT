import { useState } from 'react'

// Right-click-anywhere-in-the-tab context menu position, shared by every
// folder-organized AssetBrowser tab (Objetos/Modelos/Texturas/Vídeo/Áudio —
// see AssetBrowser.tsx and AssetContextMenu.tsx). Positioned at the cursor
// rather than anchored to a trigger button like useDropdown's menus, since a
// context menu's anchor point is wherever the user right-clicked, not a
// fixed UI element.
export function useAssetContextMenu() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setPos({ x: e.clientX, y: e.clientY })
  }
  const close = () => setPos(null)

  return { pos, onContextMenu, close }
}
