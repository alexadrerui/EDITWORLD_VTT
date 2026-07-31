import { Suspense, lazy } from 'react'
import './App.css'
import { Toolbar } from './ui/Toolbar'
import { Hierarchy } from './ui/Hierarchy'
import { Inspector } from './ui/Inspector'
import { SnapBar } from './ui/SnapBar'
import { AssetBrowser } from './ui/AssetBrowser'

const Editor3D = lazy(() =>
  import('./scene/Editor3D').then((module) => ({ default: module.Editor3D })),
)

function App() {
  return (
    <div className="editor-layout">
      <div className="editor-body">
        <div className="viewport">
          <Suspense fallback={<div className="viewport-loading">Carregando viewport 3D...</div>}>
            <Editor3D />
          </Suspense>
          <Toolbar />
          <Hierarchy />
          <Inspector />
          <SnapBar />
          <AssetBrowser />
        </div>
      </div>
    </div>
  )
}

export default App
