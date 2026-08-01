import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FolderPlus, Upload } from 'lucide-react'

// Right-click-anywhere-in-the-tab context menu shared by every
// folder-organized AssetBrowser tab (Objetos/Modelos/Texturas/Vídeo/Áudio —
// see AssetBrowser.tsx). Not used by Cenas/Asset Store, which aren't
// folder-organized. Positioned at the cursor (`position: fixed`, see
// .context-menu in App.css) via useAssetContextMenu's pos state — portaled
// to <body> (same reasoning as ImportStudio.tsx's own portal) since
// .asset-browser's backdrop-filter/transform creates a containing block for
// `position: fixed` descendants, which would otherwise resolve pos.x/pos.y
// against that small panel's box instead of the real viewport and render
// the menu clipped or in the wrong place entirely.
export function AssetContextMenu({
  pos,
  close,
  canCreateFolder,
  onCreateFolder,
  onImport,
  importLabel,
}: {
  pos: { x: number; y: number } | null
  close: () => void
  // Folders are one level deep (see AssetFolder in types.ts) — "Nova pasta"
  // only makes sense at a tab's root, not while already inside a folder.
  canCreateFolder: boolean
  onCreateFolder: () => void
  onImport: () => void
  importLabel: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
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
  }, [pos])

  if (!pos) return null

  return createPortal(
    <div ref={rootRef} className="context-menu" style={{ left: pos.x, top: pos.y }}>
      {canCreateFolder && (
        <button
          onClick={() => {
            onCreateFolder()
            close()
          }}
        >
          <FolderPlus size={14} />
          Nova pasta
        </button>
      )}
      <button
        onClick={() => {
          onImport()
          close()
        }}
      >
        <Upload size={14} />
        {importLabel}
      </button>
    </div>,
    document.body,
  )
}
