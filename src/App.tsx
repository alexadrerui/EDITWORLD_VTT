import { Suspense, lazy } from 'react'
import './App.css'
import { Toolbar } from './ui/Toolbar'
import { Hierarchy } from './ui/Hierarchy'
import { Inspector } from './ui/Inspector'
import { SnapBar } from './ui/SnapBar'
import { AssetBrowser } from './ui/AssetBrowser'
import { AnimationPanel } from './ui/AnimationPanel'
import { CutsceneStudio } from './ui/CutsceneStudio'
import { useEditorStore } from './state/useEditorStore'

const Editor3D = lazy(() =>
  import('./scene/Editor3D').then((module) => ({ default: module.Editor3D })),
)
// Lazy-loaded like Editor3D — pulls in @xyflow/react, only worth paying for
// once someone actually opens the node editor.
const TslNodeEditor = lazy(() =>
  import('./ui/nodeEditor/TslNodeEditor').then((module) => ({ default: module.TslNodeEditor })),
)

function App() {
  // CutsceneStudio.tsx replaces every other floating panel while open (its
  // own track-list/keyframes/transport panels take over that screen space) —
  // the Editor3D Canvas underneath stays mounted/interactive either way,
  // since a cutscene animates real objects already in the scene and the
  // gizmo/camera need to keep working while posing keyframes.
  const cutsceneStudioOpen = useEditorStore((s) => s.editingCutsceneId !== null)
  // TslNodeEditor.tsx, by contrast, is a genuine full-screen opaque takeover
  // (see App.css's .tsl-node-editor) — unlike CutsceneStudio it doesn't need
  // the live Editor3D canvas visible underneath, since it has its own small
  // preview pane (NodePreviewPane.tsx).
  const nodeEditorOpen = useEditorStore((s) => s.editingNodeGraphObjectId !== null)

  return (
    <div className="editor-layout">
      <div className="editor-body">
        <div className="viewport">
          <Suspense fallback={<div className="viewport-loading">Carregando viewport 3D...</div>}>
            <Editor3D />
          </Suspense>
          {cutsceneStudioOpen ? (
            <CutsceneStudio />
          ) : nodeEditorOpen ? (
            <Suspense fallback={<div className="viewport-loading">Carregando editor de nós...</div>}>
              <TslNodeEditor />
            </Suspense>
          ) : (
            <>
              <Toolbar />
              <Hierarchy />
              <Inspector />
              <AnimationPanel />
              <SnapBar />
              <AssetBrowser />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
