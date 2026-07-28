import './App.css'
import { Editor3D } from './scene/Editor3D'
import { Toolbar } from './ui/Toolbar'
import { Hierarchy } from './ui/Hierarchy'
import { Inspector } from './ui/Inspector'

function App() {
  return (
    <div className="editor-layout">
      <Toolbar />
      <div className="editor-body">
        <Hierarchy />
        <div className="viewport">
          <Editor3D />
        </div>
        <Inspector />
      </div>
    </div>
  )
}

export default App
