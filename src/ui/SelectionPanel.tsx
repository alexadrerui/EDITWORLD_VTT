import type { ReactNode } from 'react'
import { useEditorStore } from '../state/useEditorStore'
import { ResizeHandle } from './ResizeHandle'

// Shared wrapper for every ".floating-panel selection-panel" instance
// (default object Inspector, LightInspector, ImportedModelInspector,
// SoundInspector, CameraInspector, MultiSelectionInspector, SceneInspector —
// all render the literal same className, only one mounted at a time based
// on selection). Centralizing the resize handle here means the drag logic
// exists once instead of duplicated across all 7 call sites.
export function SelectionPanel({ children }: { children: ReactNode }) {
  const inspectorWidth = useEditorStore((s) => s.panelLayout.inspectorWidth)
  const setPanelLayout = useEditorStore((s) => s.setPanelLayout)
  const persistPanelLayout = useEditorStore((s) => s.persistPanelLayout)

  return (
    <div className="floating-panel selection-panel" style={{ width: inspectorWidth }}>
      <ResizeHandle
        orientation="vertical"
        // Left edge: dragging left (negative delta) grows the panel.
        onResize={(delta) => setPanelLayout({ inspectorWidth: inspectorWidth - delta })}
        onResizeEnd={persistPanelLayout}
      />
      {children}
    </div>
  )
}
