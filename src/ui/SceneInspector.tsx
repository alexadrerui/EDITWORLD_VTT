import { useEditorStore } from '../state/useEditorStore'
import { SegmentedControl } from './Inspector'
import type { GridStyle } from '../types'

const CSM_OPTIONS = [
  { value: 'off', label: 'Não' },
  { value: 'on', label: 'Sim' },
]

const GRID_STYLE_OPTIONS: { value: GridStyle; label: string }[] = [
  { value: 'lines', label: 'Linhas' },
  { value: 'dots', label: 'Pontos' },
]

export function SceneInspector() {
  const scenesIndex = useEditorStore((s) => s.scenesIndex)
  const currentSceneId = useEditorStore((s) => s.currentSceneId)
  const sceneSettings = useEditorStore((s) => s.sceneSettings)
  const updateSceneSettings = useEditorStore((s) => s.updateSceneSettings)
  const currentScene = scenesIndex.find((s) => s.id === currentSceneId)
  const gridStyle = useEditorStore((s) => s.gridStyle)
  const setGridStyle = useEditorStore((s) => s.setGridStyle)

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
        <div className="field-row">
          <span className="field-label">Sombras em cascata</span>
          <SegmentedControl
            options={CSM_OPTIONS}
            value={sceneSettings.csmEnabled ? 'on' : 'off'}
            onChange={(v) => updateSceneSettings({ csmEnabled: v === 'on' })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Exposição</span>
          <input
            type="number"
            step={0.05}
            min={0}
            value={sceneSettings.toneMappingExposure}
            onChange={(e) =>
              updateSceneSettings({ toneMappingExposure: Math.max(0, Number(e.target.value)) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Modelo de grade</span>
          <SegmentedControl options={GRID_STYLE_OPTIONS} value={gridStyle} onChange={setGridStyle} />
        </div>
      </div>
    </div>
  )
}
