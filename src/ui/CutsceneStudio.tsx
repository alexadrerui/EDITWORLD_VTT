import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import { SegmentedControl, SliderField } from './Inspector'
import { useDropdown } from './useDropdown'

const EASING_OPTIONS: { value: string; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'inQuad', label: 'Acelerar' },
  { value: 'outQuad', label: 'Desacelerar' },
  { value: 'inOutQuad', label: 'Suave' },
]

// Small dropdown listing scene objects not already in this cutscene, to add
// as a new track — the object-picker the plan called for, built on the same
// useDropdown hook Toolbar.tsx's AddObjectMenu uses.
function AddTrackDropdown({ cutsceneId }: { cutsceneId: string }) {
  const objects = useEditorStore((s) => s.objects)
  const cutscene = useEditorStore((s) => s.cutscenes.find((c) => c.id === cutsceneId))
  const addTrackToCutscene = useEditorStore((s) => s.addTrackToCutscene)
  const { open, setOpen, rootRef } = useDropdown<HTMLDivElement>()

  const availableObjects = objects.filter(
    (o) => !cutscene?.tracks.some((t) => t.objectId === o.id),
  )

  return (
    <div className="dropdown" ref={rootRef}>
      <button onClick={() => setOpen((v) => !v)}>
        <Plus size={14} />
        Adicionar objeto
      </button>
      {open && (
        <div className="dropdown-menu">
          {availableObjects.length === 0 && (
            <div className="field-hint">Nenhum objeto dispon&#237;vel.</div>
          )}
          {availableObjects.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                addTrackToCutscene(cutsceneId, o.id)
                setOpen(false)
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Visible whenever editingCutsceneId !== null (see AssetBrowser.tsx's
// "Animação" tab / Inspector.tsx entry points that set it). Deliberately
// NOT a full opaque overlay: three separate floating panels (tracks,
// keyframes, transport) anchored the same way Hierarchy/Inspector/SnapBar
// already are, leaving the real Editor3D Canvas visible/interactive in the
// middle — a cutscene animates real objects already placed in the scene, so
// the gizmo/camera need to keep working underneath while this is open (see
// App.tsx, which hides the normal panels but not the Canvas).
export function CutsceneStudio() {
  const cutscene = useEditorStore((s) => s.cutscenes.find((c) => c.id === s.editingCutsceneId) ?? null)
  const objects = useEditorStore((s) => s.objects)
  const testingCutsceneId = useEditorStore((s) => s.testingCutsceneId)
  const cutscenePlaying = useEditorStore((s) => s.cutscenePlaying)
  const cutsceneScrubTime = useEditorStore((s) => s.cutsceneScrubTime)
  const editingCutsceneKeyframeId = useEditorStore((s) => s.editingCutsceneKeyframeId)
  const renameCutscene = useEditorStore((s) => s.renameCutscene)
  const setCutsceneLoop = useEditorStore((s) => s.setCutsceneLoop)
  const setCutsceneEasing = useEditorStore((s) => s.setCutsceneEasing)
  const removeTrackFromCutscene = useEditorStore((s) => s.removeTrackFromCutscene)
  const addCutsceneKeyframe = useEditorStore((s) => s.addCutsceneKeyframe)
  const removeCutsceneKeyframe = useEditorStore((s) => s.removeCutsceneKeyframe)
  const updateCutsceneKeyframe = useEditorStore((s) => s.updateCutsceneKeyframe)
  const selectCutsceneKeyframeForEditing = useEditorStore((s) => s.selectCutsceneKeyframeForEditing)
  const toggleCutsceneTest = useEditorStore((s) => s.toggleCutsceneTest)
  const toggleCutscenePlaying = useEditorStore((s) => s.toggleCutscenePlaying)
  const setCutsceneScrubTime = useEditorStore((s) => s.setCutsceneScrubTime)
  const closeCutsceneStudio = useEditorStore((s) => s.closeCutsceneStudio)
  const select = useEditorStore((s) => s.select)

  // Which track's keyframe list is shown — local UI state, not store state
  // (switching which track you're looking at isn't meaningful to persist or
  // share with anything else).
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)

  if (!cutscene) return null

  const isTesting = testingCutsceneId === cutscene.id
  const duration = cutscene.tracks.reduce(
    (max, t) => Math.max(max, t.keyframes.reduce((m, k) => Math.max(m, k.time), 0)),
    0,
  )
  const selectedTrack = cutscene.tracks.find((t) => t.id === selectedTrackId) ?? cutscene.tracks[0] ?? null
  const selectedObject = selectedTrack ? objects.find((o) => o.id === selectedTrack.objectId) : null

  return (
    <>
      <div className="cutscene-studio-header">
        <input
          className="cutscene-studio-name"
          value={cutscene.name}
          onChange={(e) => renameCutscene(cutscene.id, e.target.value)}
        />
        <button className="cutscene-studio-close" onClick={closeCutsceneStudio}>
          <X size={14} />
          Fechar
        </button>
      </div>

      <div className="floating-panel cutscene-studio-tracks">
        <div className="field-section-label">Objetos na cutscene</div>
        <div className="animation-keyframe-list">
          {cutscene.tracks.map((track) => {
            const obj = objects.find((o) => o.id === track.objectId)
            return (
              <div
                key={track.id}
                className={`cutscene-track-row ${selectedTrack?.id === track.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTrackId(track.id)
                  select(track.objectId)
                }}
              >
                <span className="cutscene-track-name">{obj?.name ?? '(objeto removido)'}</span>
                <button
                  className="animation-keyframe-remove"
                  title="Remover objeto da cutscene"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTrackFromCutscene(cutscene.id, track.id)
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
        </div>
        <AddTrackDropdown cutsceneId={cutscene.id} />

        <div className="field-section-label">Configurações</div>
        <div className="selection-fields">
          <div className="field-row">
            <span className="field-label">Repetir</span>
            <SegmentedControl
              options={[
                { value: 'off', label: 'Não' },
                { value: 'on', label: 'Sim' },
              ]}
              value={cutscene.loop ? 'on' : 'off'}
              onChange={(v) => setCutsceneLoop(cutscene.id, v === 'on')}
            />
          </div>
          <div className="field-row field-row--wrap">
            <span className="field-label">Suavização</span>
            <SegmentedControl
              options={EASING_OPTIONS}
              value={cutscene.easing}
              onChange={(v) => setCutsceneEasing(cutscene.id, v)}
            />
          </div>
        </div>
      </div>

      <div className="floating-panel cutscene-studio-keyframes">
        <div className="field-section-label">
          Keyframes{selectedObject ? ` — ${selectedObject.name}` : ''}
        </div>
        {!selectedTrack && (
          <div className="field-hint">Adicione um objeto ao lado para começar.</div>
        )}
        {selectedTrack && (
          <div className="animation-keyframe-list">
            {selectedTrack.keyframes.map((kf, i) => (
              <div
                key={kf.id}
                className={`animation-keyframe-row ${editingCutsceneKeyframeId === kf.id ? 'active' : ''}`}
              >
                <button
                  className="animation-keyframe-select"
                  disabled={isTesting}
                  onClick={() => selectCutsceneKeyframeForEditing(cutscene.id, kf.id)}
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
                    updateCutsceneKeyframe(cutscene.id, selectedTrack.id, kf.id, {
                      time: Math.max(0, Number(e.target.value)),
                    })
                  }
                />
                <span className="animation-keyframe-unit">ms</span>
                <button
                  className="animation-keyframe-remove"
                  disabled={isTesting || selectedTrack.keyframes.length <= 2}
                  title="Remover keyframe"
                  onClick={() => removeCutsceneKeyframe(cutscene.id, selectedTrack.id, kf.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button
              className="animation-keyframe-add"
              disabled={isTesting}
              onClick={() => addCutsceneKeyframe(cutscene.id, selectedTrack.id)}
            >
              <Plus size={14} />
              Adicionar keyframe
            </button>
          </div>
        )}
      </div>

      <div className="cutscene-studio-transport">
        <div className="selection-actions-row">
          <button
            className={isTesting ? 'active' : ''}
            onClick={() => {
              // Same "deselect before previewing" guard as AnimationPanel.tsx
              // — posing a keyframe and previewing playback are mutually
              // exclusive (the timeline would otherwise fight the gizmo for
              // the same mesh transform).
              if (!isTesting && editingCutsceneKeyframeId) {
                selectCutsceneKeyframeForEditing(cutscene.id, null)
              }
              toggleCutsceneTest(cutscene.id)
            }}
          >
            <span className="action-label">{isTesting ? '■ Parar' : '▶ Testar'}</span>
          </button>
          {isTesting && (
            <button onClick={() => toggleCutscenePlaying()}>
              <span className="action-label">{cutscenePlaying ? 'Pausar' : 'Retomar'}</span>
            </button>
          )}
        </div>
        <div className="field-row">
          <span className="field-label">Progresso</span>
          <SliderField
            value={cutsceneScrubTime}
            max={Math.max(duration, 1)}
            step={10}
            onChange={(v) => setCutsceneScrubTime(v)}
          />
        </div>
      </div>
    </>
  )
}
