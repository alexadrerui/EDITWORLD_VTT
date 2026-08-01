import { useRef } from 'react'
import { useEditorStore } from '../state/useEditorStore'
import { SegmentedControl, SliderField } from './Inspector'
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
  const assets = useEditorStore((s) => s.assets)
  const importAudio = useEditorStore((s) => s.importAudio)
  const testingBackgroundMusic = useEditorStore((s) => s.testingBackgroundMusic)
  const toggleBackgroundMusicTest = useEditorStore((s) => s.toggleBackgroundMusicTest)
  const musicInputRef = useRef<HTMLInputElement>(null)

  const handleMusicFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const meta = await importAudio(file)
    updateSceneSettings({ backgroundMusicAssetId: meta.id })
  }

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
          <SliderField
            max={5}
            step={0.1}
            value={sceneSettings.ambientIntensity}
            onChange={(ambientIntensity) =>
              updateSceneSettings({ ambientIntensity: Math.max(0, ambientIntensity) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Direcional</span>
          <SliderField
            max={10}
            step={0.1}
            value={sceneSettings.directionalIntensity}
            onChange={(directionalIntensity) =>
              updateSceneSettings({ directionalIntensity: Math.max(0, directionalIntensity) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Elevação do sol</span>
          <SliderField
            min={0}
            max={90}
            step={0.5}
            value={sceneSettings.sunElevation}
            onChange={(sunElevation) =>
              updateSceneSettings({ sunElevation: Math.min(90, Math.max(0, sunElevation)) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Azimute do sol</span>
          <SliderField
            min={-180}
            max={180}
            step={0.5}
            value={sceneSettings.sunAzimuth}
            onChange={(sunAzimuth) =>
              updateSceneSettings({ sunAzimuth: Math.min(180, Math.max(-180, sunAzimuth)) })
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
          <span className="field-label">Suavidade da sombra</span>
          <SliderField
            max={10}
            step={0.5}
            value={sceneSettings.sunShadowBlur}
            onChange={(sunShadowBlur) =>
              updateSceneSettings({ sunShadowBlur: Math.max(0, sunShadowBlur) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Exposição</span>
          <SliderField
            max={3}
            step={0.05}
            value={sceneSettings.toneMappingExposure}
            onChange={(toneMappingExposure) =>
              updateSceneSettings({ toneMappingExposure: Math.max(0, toneMappingExposure) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Modelo de grade</span>
          <SegmentedControl options={GRID_STYLE_OPTIONS} value={gridStyle} onChange={setGridStyle} />
        </div>
      </div>

      <div className="field-section-label">Música de fundo</div>
      <div className="selection-fields">
        <input
          ref={musicInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleMusicFileChange}
        />
        <div className="field-row">
          <span className="field-label">Arquivo</span>
          <div className="texture-field">
            {sceneSettings.backgroundMusicAssetId && (
              <span className="texture-field-name">
                {assets.find((a) => a.id === sceneSettings.backgroundMusicAssetId)?.name ??
                  sceneSettings.backgroundMusicAssetId}
              </span>
            )}
            <button onClick={() => musicInputRef.current?.click()}>Escolher arquivo</button>
            {sceneSettings.backgroundMusicAssetId && (
              <button onClick={() => updateSceneSettings({ backgroundMusicAssetId: null })}>
                Remover
              </button>
            )}
          </div>
        </div>
        <div className="field-row">
          <span className="field-label">Volume</span>
          <input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={sceneSettings.backgroundMusicVolume}
            onChange={(e) =>
              updateSceneSettings({
                backgroundMusicVolume: Math.max(0, Math.min(1, Number(e.target.value))),
              })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Repetir</span>
          <SegmentedControl
            options={[
              { value: 'off', label: 'Não' },
              { value: 'on', label: 'Sim' },
            ]}
            value={sceneSettings.backgroundMusicLoop ? 'on' : 'off'}
            onChange={(v) => updateSceneSettings({ backgroundMusicLoop: v === 'on' })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Pré-visualizar</span>
          <button
            className={testingBackgroundMusic ? 'active' : ''}
            onClick={() => toggleBackgroundMusicTest()}
          >
            {testingBackgroundMusic ? '■ Parar' : '▶ Testar'}
          </button>
        </div>
      </div>
    </div>
  )
}
