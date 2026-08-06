import { Plus, Trash2, X } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import { SegmentedControl, SliderField } from './Inspector'

const EASING_OPTIONS: { value: string; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'inQuad', label: 'Acelerar' },
  { value: 'outQuad', label: 'Desacelerar' },
  { value: 'inOutQuad', label: 'Suave' },
]

// Keyframe-list/transport panel for the clip referenced by
// editingAnimationClipId (see Inspector.tsx's AnimationSection, which opens
// this). No separate open/closed boolean — editingAnimationClipId !== null
// *is* "panel open," so this component just returns null otherwise. Not
// portaled: styled like .floating-panel/.selection-panel (plain absolute
// offsets), which — unlike .asset-browser's centered `transform` — doesn't
// create a containing block that would trap a `position: fixed` descendant.
export function AnimationPanel() {
  const clip = useEditorStore((s) => s.animations.find((a) => a.id === s.editingAnimationClipId) ?? null)
  const editingKeyframeId = useEditorStore((s) => s.editingKeyframeId)
  const testingAnimationId = useEditorStore((s) => s.testingAnimationId)
  const animationPlaying = useEditorStore((s) => s.animationPlaying)
  const animationScrubTime = useEditorStore((s) => s.animationScrubTime)
  const renameAnimation = useEditorStore((s) => s.renameAnimation)
  const setAnimationLoop = useEditorStore((s) => s.setAnimationLoop)
  const setAnimationEasing = useEditorStore((s) => s.setAnimationEasing)
  const addKeyframe = useEditorStore((s) => s.addKeyframe)
  const removeKeyframe = useEditorStore((s) => s.removeKeyframe)
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe)
  const selectKeyframeForEditing = useEditorStore((s) => s.selectKeyframeForEditing)
  const toggleAnimationTest = useEditorStore((s) => s.toggleAnimationTest)
  const toggleAnimationPlaying = useEditorStore((s) => s.toggleAnimationPlaying)
  const setAnimationScrubTime = useEditorStore((s) => s.setAnimationScrubTime)
  const closeAnimationPanel = useEditorStore((s) => s.closeAnimationPanel)

  const inspectorWidth = useEditorStore((s) => s.panelLayout.inspectorWidth)

  if (!clip) return null

  const duration = clip.keyframes.reduce((max, k) => Math.max(max, k.time), 0)
  const isTesting = testingAnimationId === clip.id

  return (
    <div className="floating-panel animation-panel" style={{ right: inspectorWidth + 24 }}>
      <div className="selection-header">
        <span className="selection-category">Animação</span>
        <input
          className="selection-name"
          type="text"
          value={clip.name}
          onChange={(e) => renameAnimation(clip.id, e.target.value)}
        />
        <button className="animation-panel-close" onClick={closeAnimationPanel} title="Fechar">
          <X size={13} />
        </button>
      </div>

      <div className="field-section-label">Configurações</div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Repetir</span>
          <SegmentedControl
            options={[
              { value: 'off', label: 'Não' },
              { value: 'on', label: 'Sim' },
            ]}
            value={clip.loop ? 'on' : 'off'}
            onChange={(v) => setAnimationLoop(clip.id, v === 'on')}
          />
        </div>
        <div className="field-row field-row--wrap">
          <span className="field-label">Suavização</span>
          <SegmentedControl
            options={EASING_OPTIONS}
            value={clip.easing}
            onChange={(v) => setAnimationEasing(clip.id, v)}
          />
        </div>
      </div>

      <div className="field-section-label">Keyframes</div>
      <div className="animation-keyframe-list">
        {clip.keyframes.map((kf, i) => (
          <div
            key={kf.id}
            className={`animation-keyframe-row ${editingKeyframeId === kf.id ? 'active' : ''}`}
          >
            <button
              className="animation-keyframe-select"
              disabled={isTesting}
              onClick={() => selectKeyframeForEditing(clip.id, kf.id)}
            >
              Pose {i + 1}
            </button>
            <input
              type="number"
              className="animation-keyframe-time"
              value={kf.time}
              min={0}
              step={100}
              disabled={isTesting}
              onChange={(e) =>
                updateKeyframe(clip.id, kf.id, { time: Math.max(0, Number(e.target.value)) })
              }
            />
            <span className="animation-keyframe-unit">ms</span>
            <button
              className="animation-keyframe-remove"
              disabled={isTesting || clip.keyframes.length <= 2}
              title="Remover keyframe"
              onClick={() => removeKeyframe(clip.id, kf.id)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button className="animation-keyframe-add" disabled={isTesting} onClick={() => addKeyframe(clip.id)}>
          <Plus size={14} />
          Adicionar keyframe
        </button>
      </div>

      <div className="field-section-label">Reproduzir</div>
      <div className="selection-actions">
        <div className="selection-actions-row">
          <button
            className={isTesting ? 'active' : ''}
            onClick={() => {
              // Deselect the actively-edited keyframe first — previewing and
              // posing a keyframe are mutually exclusive (the timeline would
              // otherwise fight the gizmo for the same mesh transform).
              if (!isTesting && editingKeyframeId) selectKeyframeForEditing(clip.id, null)
              toggleAnimationTest(clip.id)
            }}
          >
            <span className="action-label">{isTesting ? '■ Parar' : '▶ Testar'}</span>
          </button>
          {isTesting && (
            <button onClick={() => toggleAnimationPlaying()}>
              <span className="action-label">{animationPlaying ? 'Pausar' : 'Retomar'}</span>
            </button>
          )}
        </div>
      </div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Progresso</span>
          <SliderField
            value={animationScrubTime}
            max={Math.max(duration, 1)}
            step={10}
            onChange={(v) => setAnimationScrubTime(v)}
          />
        </div>
      </div>
    </div>
  )
}
