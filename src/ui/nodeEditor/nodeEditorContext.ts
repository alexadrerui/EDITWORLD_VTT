import { createContext, useContext } from 'react'

// Bridges TslFlowNode.tsx's per-node param inputs (rendered deep inside
// @xyflow/react's own node tree, no direct access to TslNodeEditor.tsx's
// local nodes/edges state) to the two things they need: an immediate local
// visual/preview update on every keystroke, and a store commit at natural
// checkpoints (blur) — see TslNodeEditor.tsx for where this is provided and
// why literal edits don't commit to the store on every keystroke.
interface NodeEditorActions {
  updateParam: (nodeId: string, key: string, value: string) => void
  commitGraph: () => void
}

export const NodeEditorActionsContext = createContext<NodeEditorActions | null>(null)

export function useNodeEditorActions(): NodeEditorActions {
  const ctx = useContext(NodeEditorActionsContext)
  if (!ctx) throw new Error('useNodeEditorActions must be used within TslNodeEditor')
  return ctx
}
