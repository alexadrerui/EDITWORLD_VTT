import { useEditorStore } from '../state/useEditorStore'

export function SceneInspector() {
  const scenesIndex = useEditorStore((s) => s.scenesIndex)
  const currentSceneId = useEditorStore((s) => s.currentSceneId)
  const sceneSettings = useEditorStore((s) => s.sceneSettings)
  const updateSceneSettings = useEditorStore((s) => s.updateSceneSettings)
  const currentScene = scenesIndex.find((s) => s.id === currentSceneId)

  return (
    <div className="floating-panel selection-panel">
      <div className="selection-header">
        <span className="selection-category">CENA</span>
        <span className="scene-inspector-name">{currentScene?.name}</span>
      </div>

      <div className="selection-fields scene-inspector-fields">
        <div className="field-row">
          <span className="field-label">Cor de fundo</span>
          <input
            type="color"
            value={sceneSettings.backgroundColor}
            onChange={(e) => updateSceneSettings({ backgroundColor: e.target.value })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Ambiente</span>
          <input
            type="number"
            step={0.1}
            min={0}
            value={sceneSettings.ambientIntensity}
            onChange={(e) =>
              updateSceneSettings({ ambientIntensity: Math.max(0, Number(e.target.value)) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Direcional</span>
          <input
            type="number"
            step={0.1}
            min={0}
            value={sceneSettings.directionalIntensity}
            onChange={(e) =>
              updateSceneSettings({ directionalIntensity: Math.max(0, Number(e.target.value)) })
            }
          />
        </div>
      </div>
    </div>
  )
}
