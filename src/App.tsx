import './App.css'
import { Editor3D } from './scene/Editor3D'
import { Toolbar } from './ui/Toolbar'
import { Hierarchy } from './ui/Hierarchy'
import { Inspector } from './ui/Inspector'
import { SnapBar } from './ui/SnapBar'

function App() {
  return (
    <div className="editor-layout">
      <div className="editor-body">
        <div className="viewport">
          <Editor3D />
          <Toolbar />
          <Hierarchy />
          <Inspector />
          <SnapBar />
        </div>
      </div>
    </div>
  )
}

export default App
