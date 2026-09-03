import { useEffect, useRef, useState } from 'react'
import { Euler, Vector3 } from 'three'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Film,
  Focus,
  ImageOff,
  Link2,
  Magnet,
  RotateCw,
  Scale3D,
  Scaling,
  Trash2,
  Unlink2,
  Upload,
  Workflow,
  X,
} from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import {
  isCameraKind,
  isImportedModelKind,
  isLightKind,
  isProceduralKind,
  isSoundKind,
  PRIMITIVE_BASE_SIZE,
  PRIMITIVE_LABEL,
} from '../scene/primitives'
import { MultiSelectionInspector } from './MultiSelectionInspector'
import { SceneInspector } from './SceneInspector'
import { SelectionPanel } from './SelectionPanel'
import { useDropdown } from './useDropdown'
import { rejectIfNotGlb, useImportedModel } from '../scene/assetLoaders'
import type {
  BlendMode,
  MaterialSide,
  MaterialType,
  SceneObject,
  ShadowMode,
  ShadowResolution,
} from '../types'

function formatMeters(value: number) {
  return `${value.toFixed(2).replace('.', ',')} m`
}

// "Animação" field-section shared by the default mesh body and
// ImportedModelInspector — no clip yet: a single create button; has one: a
// summary + links to open AnimationPanel.tsx (which doubles its own open
// state as editingAnimationClipId !== null) or delete the clip outright
// (1:1 relationship, so unlinking == deleting, no orphan cleanup needed).
function AnimationSection({ object }: { object: SceneObject }) {
  const clip = useEditorStore((s) => s.animations.find((a) => a.id === object.animationId))
  const createAnimationForObject = useEditorStore((s) => s.createAnimationForObject)
  const deleteAnimation = useEditorStore((s) => s.deleteAnimation)
  const selectKeyframeForEditing = useEditorStore((s) => s.selectKeyframeForEditing)

  return (
    <>
      <div className="field-section-label">Animação</div>
      <div className="selection-fields">
        {!clip ? (
          <button onClick={() => createAnimationForObject(object.id)}>
            <span className="action-label">
              <Film size={14} />
              Criar animação
            </span>
          </button>
        ) : (
          <>
            <div className="field-row">
              <span className="field-label">Clipe</span>
              <span className="texture-field-name">
                {clip.name} · {clip.keyframes.length} poses
              </span>
            </div>
            <div className="selection-actions-row">
              <button onClick={() => selectKeyframeForEditing(clip.id, null)}>
                <span className="action-label">Editar animação</span>
              </button>
              <button className="danger" onClick={() => deleteAnimation(clip.id)}>
                <span className="action-label">Remover</span>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// "Nós (TSL)" field-section — same "Criar" -> "Editar"/"Remover" two-state
// shape as AnimationSection above, opening TslNodeEditor.tsx (a full-screen
// overlay, see App.tsx's editingNodeGraphObjectId-driven swap) instead of a
// floating panel. Not shown for procedural-kind objects (barrel/chest/torch/
// cauldron etc.) — those are multi-submesh groups where each submesh
// intentionally has its own independently-colored material (see
// buildWeatheringNode in SceneObjectMesh.tsx); applying one graph's
// colorNode uniformly across them would flatten that, so this is gated by
// the caller instead of being checked here.
function NodeGraphSection({ object }: { object: SceneObject }) {
  const graph = useEditorStore((s) => s.nodeGraphs.find((g) => g.id === object.nodeGraphId))
  const createNodeGraphForObject = useEditorStore((s) => s.createNodeGraphForObject)
  const deleteNodeGraphForObject = useEditorStore((s) => s.deleteNodeGraphForObject)
  const openNodeEditor = useEditorStore((s) => s.openNodeEditor)

  return (
    <>
      <div className="field-section-label">Nós (TSL)</div>
      <div className="selection-fields">
        {!graph ? (
          <button
            onClick={() => {
              createNodeGraphForObject(object.id)
              openNodeEditor(object.id)
            }}
          >
            <span className="action-label">
              <Workflow size={14} />
              Criar grafo de nós
            </span>
          </button>
        ) : (
          <>
            <div className="field-row">
              <span className="field-label">Grafo</span>
              <span className="texture-field-name">
                {graph.name} · {graph.nodes.length} nós
              </span>
            </div>
            <div className="selection-actions-row">
              <button onClick={() => openNodeEditor(object.id)}>
                <span className="action-label">Editar nós</span>
              </button>
              <button className="danger" onClick={() => deleteNodeGraphForObject(object.id)}>
                <span className="action-label">Remover</span>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Vector3Row({
  label,
  value,
  onChange,
  step = 0.1,
  lockable = false,
  locked = false,
  onToggleLock,
}: {
  label: string
  value: [number, number, number]
  onChange: (next: [number, number, number]) => void
  step?: number
  lockable?: boolean
  locked?: boolean
  onToggleLock?: () => void
}) {
  return (
    <div className="field-row">
      <span className="field-label">
        {label}
        {lockable && (
          <button
            className={`axis-lock-toggle ${locked ? 'active' : ''}`}
            onClick={onToggleLock}
            title={locked ? 'Desvincular eixos' : 'Vincular eixos (escala proporcional)'}
          >
            {locked ? <Link2 size={15} /> : <Unlink2 size={15} />}
          </button>
        )}
      </span>
      <div className="axis-group">
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <label key={axis} className="axis-field">
            <span className="axis-field-label">{axis.toUpperCase()}</span>
            <input
              type="number"
              step={step}
              value={Number(value[i].toFixed(3))}
              onChange={(e) => {
                const next: [number, number, number] = [...value]
                next[i] = Number(e.target.value)
                onChange(next)
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented-control">
      {options.map((option) => (
        <button
          key={option.value}
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// Unified value+slider "pill" control, matching Spline's Light inspector
// (Intensity/Distance/Angle/etc. all use this single merged control instead
// of a bare number input). `max` is just the slider's drag range — typing
// directly in the number half still accepts any value beyond it.
export function SliderField({
  value,
  min = 0,
  max,
  step = 0.1,
  onChange,
}: {
  value: number
  min?: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="slider-field">
      <input
        type="number"
        className="slider-field-value"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="range"
        className="slider-field-track"
        value={Math.min(Math.max(value, min), max)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

// Compact dropdown for fields with too many options to fit as inline
// segmented buttons — matches Spline's Visibility > Shadows control, which
// shows the current value with a chevron instead of spelling out every
// option in the row.
function FieldDropdown<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const { open, setOpen, rootRef } = useDropdown<HTMLDivElement>()
  const current = options.find((o) => o.value === value)

  return (
    <div className="dropdown field-dropdown" ref={rootRef}>
      <button onClick={() => setOpen((v) => !v)}>
        {current?.label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="dropdown-menu dropdown-menu--right field-dropdown-menu">
          {options.map((option) => (
            <button
              key={option.value}
              className={option.value === value ? 'active' : ''}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SIDE_OPTIONS: { value: MaterialSide; label: string }[] = [
  { value: 'front', label: 'Frente' },
  { value: 'back', label: 'Verso' },
  { value: 'double', label: 'Ambos' },
]

const MATERIAL_TYPE_OPTIONS: { value: MaterialType; label: string }[] = [
  { value: 'standard', label: 'Padrão' },
  { value: 'lambert', label: 'Lambert' },
  { value: 'phong', label: 'Phong' },
  { value: 'physical', label: 'Físico' },
  { value: 'toon', label: 'Toon' },
]

const BLEND_MODE_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'additive', label: 'Aditivo' },
  { value: 'subtractive', label: 'Subtrativo' },
  { value: 'multiply', label: 'Multiplicar' },
]

const SHADOW_OPTIONS: { value: ShadowMode; label: string }[] = [
  { value: 'both', label: 'Ambas' },
  { value: 'cast', label: 'Projetar' },
  { value: 'receive', label: 'Receber' },
  { value: 'none', label: 'Nenhuma' },
]

// Matches Spline's Light > Shadows > Resolution dropdown (Low/Normal/High).
const SHADOW_RESOLUTION_OPTIONS: { value: ShadowResolution; label: string }[] = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
]

// Lights share the header/rename/delete chrome with mesh objects but have an
// entirely different field set (no material/visibility sections, no scale —
// see SceneObjects.tsx's effectiveTransformMode), so they get their own body
// instead of branching every section below.
function LightInspector({ object }: { object: SceneObject }) {
  const updateObject = useEditorStore((s) => s.updateObject)
  const removeObject = useEditorStore((s) => s.removeObject)
  const transformMode = useEditorStore((s) => s.transformMode)
  const setTransformMode = useEditorStore((s) => s.setTransformMode)
  const isSpot = object.kind === 'spotLight'
  const isPoint = object.kind === 'pointLight'
  const isDirectional = object.kind === 'directionalLight'
  // Point lights are omnidirectional — rotating them does nothing. Spot and
  // directional both aim somewhere, so both get the rotate gizmo/field.
  const hasDirection = !isPoint
  // Directional lights aren't distance-attenuated — three.js's
  // DirectionalLight has no distance/decay properties at all.
  const hasFalloff = !isDirectional

  return (
    <SelectionPanel>
      <div className="selection-header">
        <span className="selection-category">{PRIMITIVE_LABEL[object.kind].toUpperCase()}</span>
        <input
          className="selection-name"
          type="text"
          value={object.name}
          onChange={(e) => updateObject(object.id, { name: e.target.value })}
        />
      </div>

      <div className="selection-actions">
        {hasDirection && (
          <button
            className={transformMode === 'rotate' ? 'active' : ''}
            onClick={() => setTransformMode(transformMode === 'rotate' ? 'translate' : 'rotate')}
          >
            <span className="action-label">
              <RotateCw size={14} />
              {transformMode === 'rotate' ? 'Desativar' : 'Ativar'} rotacionar
            </span>
            <span className="action-shortcut">R</span>
          </button>
        )}
        <button className="danger" onClick={() => removeObject(object.id)}>
          <span className="action-label">
            <Trash2 size={14} />
            Excluir luz
          </span>
          <span className="action-shortcut">Del</span>
        </button>
      </div>

      <div className="field-section-label">Transformar</div>
      <div className="selection-fields">
        <Vector3Row
          label="Posição"
          value={object.position}
          onChange={(position) => updateObject(object.id, { position })}
        />
        {hasDirection && (
          <Vector3Row
            label="Rotação"
            value={object.rotation}
            onChange={(rotation) => updateObject(object.id, { rotation })}
            step={0.05}
          />
        )}
      </div>

      <div className="field-section-label">Luz</div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Cor</span>
          <input
            type="color"
            value={object.color}
            onChange={(e) => updateObject(object.id, { color: e.target.value })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Intensidade</span>
          <SliderField
            max={50}
            step={0.5}
            value={object.lightIntensity}
            onChange={(lightIntensity) =>
              updateObject(object.id, { lightIntensity: Math.max(0, lightIntensity) })
            }
          />
        </div>
        {hasFalloff && (
          <>
            <div className="field-row">
              <span className="field-label">Alcance</span>
              <SliderField
                max={50}
                step={0.5}
                value={object.lightDistance}
                onChange={(lightDistance) =>
                  updateObject(object.id, { lightDistance: Math.max(0, lightDistance) })
                }
              />
            </div>
            <div className="field-row">
              <span className="field-label">Decaimento</span>
              <SliderField
                max={5}
                step={0.1}
                value={object.lightDecay}
                onChange={(lightDecay) =>
                  updateObject(object.id, { lightDecay: Math.max(0, lightDecay) })
                }
              />
            </div>
          </>
        )}
        {isSpot && (
          <>
            <div className="field-row">
              <span className="field-label">Ângulo</span>
              <SliderField
                min={1}
                max={90}
                step={1}
                value={Math.round((object.lightAngle * 180) / Math.PI)}
                onChange={(degrees) =>
                  updateObject(object.id, {
                    lightAngle: (Math.min(90, Math.max(1, degrees)) * Math.PI) / 180,
                  })
                }
              />
            </div>
            <div className="field-row">
              {/* Spline calls this "Edge Blur" — kept distinct from the
                  shadow-only "Penumbra" field below, which is a different
                  concept (see shadowPenumbra in types.ts). */}
              <span className="field-label">Desfoque da borda</span>
              <SliderField
                max={1}
                step={0.05}
                value={object.lightPenumbra}
                onChange={(lightPenumbra) =>
                  updateObject(object.id, { lightPenumbra: Math.min(1, Math.max(0, lightPenumbra)) })
                }
              />
            </div>
          </>
        )}
      </div>

      <div className="field-section-label">Sombra</div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Projetar sombra</span>
          <SegmentedControl
            options={[
              { value: 'off', label: 'Não' },
              { value: 'on', label: 'Sim' },
            ]}
            value={object.castLightShadow ? 'on' : 'off'}
            onChange={(v) => updateObject(object.id, { castLightShadow: v === 'on' })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Resolução</span>
          <FieldDropdown
            options={SHADOW_RESOLUTION_OPTIONS}
            value={object.shadowResolution}
            onChange={(shadowResolution) => updateObject(object.id, { shadowResolution })}
          />
        </div>
        {isDirectional && (
          <div className="field-row">
            <span className="field-label">Tamanho</span>
            <SliderField
              min={1}
              max={50}
              step={1}
              value={object.shadowSize}
              onChange={(shadowSize) => updateObject(object.id, { shadowSize: Math.max(1, shadowSize) })}
            />
          </div>
        )}
        <div className="field-row">
          <span className="field-label">Desfoque da sombra</span>
          <SliderField
            max={10}
            step={0.5}
            value={object.shadowBlur}
            onChange={(shadowBlur) => updateObject(object.id, { shadowBlur: Math.max(0, shadowBlur) })}
          />
        </div>
        {!isPoint && (
          <div className="field-row">
            <span className="field-label">Penumbra</span>
            <SliderField
              max={5}
              step={0.1}
              value={object.shadowPenumbra}
              onChange={(shadowPenumbra) =>
                updateObject(object.id, { shadowPenumbra: Math.max(0, shadowPenumbra) })
              }
            />
          </div>
        )}
      </div>
    </SelectionPanel>
  )
}

// Imported models share the header/rename/delete chrome and Transformar
// section with mesh objects, but have no Material/Visibilidade sections (the
// model brings its own materials) — same "own body instead of branching
// every section" reasoning as LightInspector above.
function ImportedModelInspector({ object }: { object: SceneObject }) {
  const updateObject = useEditorStore((s) => s.updateObject)
  const removeObject = useEditorStore((s) => s.removeObject)
  const importModel = useEditorStore((s) => s.importModel)
  const transformMode = useEditorStore((s) => s.transformMode)
  const setTransformMode = useEditorStore((s) => s.setTransformMode)
  const requestCameraFocus = useEditorStore((s) => s.requestCameraFocus)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Same hook SceneObjectMesh.tsx uses to render this object in the
  // viewport — the model template is cached by assetId (see
  // loadModelTemplate in assetLoaders.ts), so calling it a second time here
  // doesn't re-parse the GLB, it just reads the already-resolved textures
  // list alongside the viewport's own clone.
  const { status: modelStatus, textures: modelTextures } = useImportedModel(object.assetId)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !rejectIfNotGlb(file)) return
    const meta = await importModel(file)
    updateObject(object.id, { assetId: meta.id })
  }

  return (
    <SelectionPanel>
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <div className="selection-header">
        <span className="selection-category">{PRIMITIVE_LABEL[object.kind].toUpperCase()}</span>
        <input
          className="selection-name"
          type="text"
          value={object.name}
          onChange={(e) => updateObject(object.id, { name: e.target.value })}
        />
      </div>

      <div className="selection-actions">
        <div className="selection-actions-row">
          <button
            className={transformMode === 'scale' ? 'active' : ''}
            onClick={() => setTransformMode(transformMode === 'scale' ? 'translate' : 'scale')}
          >
            <span className="action-label">
              <Scaling size={14} />
              {transformMode === 'scale' ? 'Desativar' : 'Ativar'} escalar
            </span>
            <span className="action-shortcut">S</span>
          </button>
          <button
            className={transformMode === 'rotate' ? 'active' : ''}
            onClick={() => setTransformMode(transformMode === 'rotate' ? 'translate' : 'rotate')}
          >
            <span className="action-label">
              <RotateCw size={14} />
              {transformMode === 'rotate' ? 'Desativar' : 'Ativar'} rotacionar
            </span>
            <span className="action-shortcut">R</span>
          </button>
        </div>
        <button onClick={() => requestCameraFocus(object.id)}>
          <span className="action-label">
            <Focus size={14} />
            Centralizar câmera
          </span>
          <span className="action-shortcut">.</span>
        </button>
        <button className="danger" onClick={() => removeObject(object.id)}>
          <span className="action-label">
            <Trash2 size={14} />
            Excluir objeto
          </span>
          <span className="action-shortcut">Del</span>
        </button>
      </div>

      <div className="field-section-label">Transformar</div>
      <div className="selection-fields">
        <Vector3Row
          label="Posição"
          value={object.position}
          onChange={(position) => updateObject(object.id, { position })}
        />
        <Vector3Row
          label="Rotação"
          value={object.rotation}
          onChange={(rotation) => updateObject(object.id, { rotation })}
          step={0.05}
        />
        <Vector3Row
          label="Escala"
          value={object.scale}
          onChange={(scale) => updateObject(object.id, { scale })}
        />
      </div>

      <AnimationSection object={object} />

      <div className="field-section-label">Arquivo</div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Modelo (.glb)</span>
          <button onClick={() => fileInputRef.current?.click()}>
            <span className="action-label">
              <Upload size={14} />
              Substituir arquivo
            </span>
          </button>
        </div>
        {modelStatus === 'error' && (
          <div className="field-hint field-hint-error">
            Não foi possível carregar o modelo — o arquivo pode ter sido removido ou estar
            corrompido. Substitua o arquivo acima.
          </div>
        )}
      </div>

      <div className="field-section-label">Texturas do modelo</div>
      {modelStatus === 'loading' && <div className="field-hint">Carregando modelo…</div>}
      {modelStatus === 'ready' && modelTextures.length === 0 && (
        <div className="field-hint">Nenhuma textura incorporada neste modelo.</div>
      )}
      {modelStatus === 'ready' && modelTextures.length > 0 && (
        <div className="asset-grid">
          {modelTextures.map((tex) => (
            <div key={tex.id} className="asset-tile model-texture-tile" title={tex.label}>
              {tex.thumbnail ? (
                <img className="model-texture-thumb" src={tex.thumbnail} alt={tex.label} />
              ) : (
                <span className="asset-tile-icon">
                  <ImageOff size={22} />
                </span>
              )}
              <span className="asset-tile-label">{tex.label}</span>
            </div>
          ))}
        </div>
      )}
    </SelectionPanel>
  )
}

// Sound sources share the header/rename/delete chrome with lights/meshes but
// have their own field set — no material/visibility/scale (a point-source
// audio emitter has no "size"), same "own body" reasoning as LightInspector.
function SoundInspector({ object }: { object: SceneObject }) {
  const updateObject = useEditorStore((s) => s.updateObject)
  const removeObject = useEditorStore((s) => s.removeObject)
  const importAudio = useEditorStore((s) => s.importAudio)
  const assets = useEditorStore((s) => s.assets)
  const isTesting = useEditorStore((s) => s.testingSoundId === object.id)
  const toggleSoundTest = useEditorStore((s) => s.toggleSoundTest)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const meta = await importAudio(file)
    updateObject(object.id, { assetId: meta.id })
  }

  return (
    <SelectionPanel>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <div className="selection-header">
        <span className="selection-category">{PRIMITIVE_LABEL[object.kind].toUpperCase()}</span>
        <input
          className="selection-name"
          type="text"
          value={object.name}
          onChange={(e) => updateObject(object.id, { name: e.target.value })}
        />
      </div>

      <div className="selection-actions">
        <button className={isTesting ? 'active' : ''} onClick={() => toggleSoundTest(object.id)}>
          <span className="action-label">{isTesting ? '■ Parar' : '▶ Testar'}</span>
        </button>
        <button className="danger" onClick={() => removeObject(object.id)}>
          <span className="action-label">
            <Trash2 size={14} />
            Excluir som
          </span>
          <span className="action-shortcut">Del</span>
        </button>
      </div>

      <div className="field-section-label">Transformar</div>
      <div className="selection-fields">
        <Vector3Row
          label="Posição"
          value={object.position}
          onChange={(position) => updateObject(object.id, { position })}
        />
      </div>

      <div className="field-section-label">Som</div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Volume</span>
          <SliderField
            max={1}
            step={0.05}
            value={object.soundVolume}
            onChange={(soundVolume) =>
              updateObject(object.id, { soundVolume: Math.max(0, Math.min(1, soundVolume)) })
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
            value={object.soundLoop ? 'on' : 'off'}
            onChange={(v) => updateObject(object.id, { soundLoop: v === 'on' })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Distância de referência</span>
          <SliderField
            max={30}
            step={0.5}
            value={object.soundRefDistance}
            onChange={(soundRefDistance) =>
              updateObject(object.id, { soundRefDistance: Math.max(0, soundRefDistance) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Distância máxima</span>
          <SliderField
            max={100}
            step={1}
            value={object.soundMaxDistance}
            onChange={(soundMaxDistance) =>
              updateObject(object.id, { soundMaxDistance: Math.max(0, soundMaxDistance) })
            }
          />
        </div>
      </div>

      <div className="field-section-label">Arquivo</div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Áudio</span>
          <div className="texture-field">
            {object.assetId && (
              <span className="texture-field-name">
                {assets.find((a) => a.id === object.assetId)?.name ?? object.assetId}
              </span>
            )}
            <button onClick={() => fileInputRef.current?.click()}>Escolher arquivo</button>
          </div>
        </div>
      </div>
    </SelectionPanel>
  )
}

// Cameras share the header/rename/delete chrome and Transformar (position +
// rotation, no scale — a camera doesn't scale) with mesh objects, but have no
// Material/Visibilidade/Arquivo sections at all — same "own body instead of
// branching every section" reasoning as LightInspector/SoundInspector above.
function CameraInspector({ object }: { object: SceneObject }) {
  const updateObject = useEditorStore((s) => s.updateObject)
  const removeObject = useEditorStore((s) => s.removeObject)
  const transformMode = useEditorStore((s) => s.transformMode)
  const setTransformMode = useEditorStore((s) => s.setTransformMode)
  const requestCameraFocus = useEditorStore((s) => s.requestCameraFocus)

  return (
    <SelectionPanel>
      <div className="selection-header">
        <span className="selection-category">{PRIMITIVE_LABEL[object.kind].toUpperCase()}</span>
        <input
          className="selection-name"
          type="text"
          value={object.name}
          onChange={(e) => updateObject(object.id, { name: e.target.value })}
        />
      </div>

      <div className="selection-actions">
        <button
          className={transformMode === 'rotate' ? 'active' : ''}
          onClick={() => setTransformMode(transformMode === 'rotate' ? 'translate' : 'rotate')}
        >
          <span className="action-label">
            <RotateCw size={14} />
            {transformMode === 'rotate' ? 'Desativar' : 'Ativar'} rotacionar
          </span>
          <span className="action-shortcut">R</span>
        </button>
        <button onClick={() => requestCameraFocus(object.id)}>
          <span className="action-label">
            <Focus size={14} />
            Centralizar câmera
          </span>
          <span className="action-shortcut">.</span>
        </button>
        <button className="danger" onClick={() => removeObject(object.id)}>
          <span className="action-label">
            <Trash2 size={14} />
            Excluir câmera
          </span>
          <span className="action-shortcut">Del</span>
        </button>
      </div>

      <div className="field-section-label">Transformar</div>
      <div className="selection-fields">
        <Vector3Row
          label="Posição"
          value={object.position}
          onChange={(position) => updateObject(object.id, { position })}
        />
        <Vector3Row
          label="Rotação"
          value={object.rotation}
          onChange={(rotation) => updateObject(object.id, { rotation })}
          step={0.05}
        />
      </div>

      <AnimationSection object={object} />
    </SelectionPanel>
  )
}

export function Inspector() {
  const objects = useEditorStore((s) => s.objects)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null
  const updateObject = useEditorStore((s) => s.updateObject)
  const removeObject = useEditorStore((s) => s.removeObject)
  const transformMode = useEditorStore((s) => s.transformMode)
  const setTransformMode = useEditorStore((s) => s.setTransformMode)
  const requestCameraFocus = useEditorStore((s) => s.requestCameraFocus)
  const inspectorVisible = useEditorStore((s) => s.inspectorVisible)
  const toggleInspectorVisible = useEditorStore((s) => s.toggleInspectorVisible)
  const inspectorWidth = useEditorStore((s) => s.panelLayout.inspectorWidth)
  const assets = useEditorStore((s) => s.assets)
  const importTexture = useEditorStore((s) => s.importTexture)
  const importVideo = useEditorStore((s) => s.importVideo)
  const textureInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const object = objects.find((o) => o.id === selectedId)

  const collapseToggle = (
    <button
      className={`panel-collapse-toggle panel-collapse-toggle--right ${inspectorVisible ? 'is-open' : ''}`}
      style={{ right: inspectorVisible ? inspectorWidth + 20 : undefined }}
      onClick={() => toggleInspectorVisible()}
      title={inspectorVisible ? 'Esconder painel' : 'Mostrar painel'}
    >
      {inspectorVisible ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
    </button>
  )

  // Local, not persisted per-object — a workflow toggle (like Spline's), not
  // content about the object itself.
  const [scaleLocked, setScaleLocked] = useState(false)
  // Whether the "Edit Pivot" popover (Spline-style, opened from the
  // Transformar section header) is open — same "ephemeral UI state" bucket
  // as scaleLocked above.
  const [editPivotOpen, setEditPivotOpen] = useState(false)

  // Keyboard shortcuts (R/S/F/Del/.), like the hints shown next to each
  // action below — ignored while typing in a field so they don't hijack
  // normal text entry, and while nothing is selected. `.` (not `S`, Blender's
  // "Frame Selected" convention) because S/F are already taken by Escalar/
  // Escala livre above.
  useEffect(() => {
    if (!object) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      switch (e.key.toLowerCase()) {
        case 'r':
          setTransformMode(transformMode === 'rotate' ? 'translate' : 'rotate')
          break
        case 's':
          // Scale is meaningless for lights/sound sources/cameras (see
          // SceneObjects.tsx's effectiveTransformMode) — don't even flip the
          // global mode.
          if (!isLightKind(object.kind) && !isSoundKind(object.kind) && !isCameraKind(object.kind)) {
            setTransformMode(transformMode === 'scale' ? 'translate' : 'scale')
          }
          break
        case 'f':
          if (!isLightKind(object.kind) && !isSoundKind(object.kind) && !isCameraKind(object.kind)) {
            setTransformMode(transformMode === 'scaleFree' ? 'translate' : 'scaleFree')
          }
          break
        case 'delete':
        case 'backspace':
          removeObject(object.id)
          break
        case '.':
          requestCameraFocus(object.id)
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [object, transformMode, setTransformMode, removeObject, requestCameraFocus])

  if (selectedIds.length > 1) {
    return (
      <>
        {inspectorVisible && <MultiSelectionInspector selectedIds={selectedIds} />}
        {collapseToggle}
      </>
    )
  }
  if (!object) {
    return (
      <>
        {inspectorVisible && <SceneInspector />}
        {collapseToggle}
      </>
    )
  }
  if (isLightKind(object.kind)) {
    return (
      <>
        {inspectorVisible && <LightInspector object={object} />}
        {collapseToggle}
      </>
    )
  }
  if (isImportedModelKind(object.kind)) {
    return (
      <>
        {inspectorVisible && <ImportedModelInspector object={object} />}
        {collapseToggle}
      </>
    )
  }
  if (isSoundKind(object.kind)) {
    return (
      <>
        {inspectorVisible && <SoundInspector object={object} />}
        {collapseToggle}
      </>
    )
  }
  if (isCameraKind(object.kind)) {
    return (
      <>
        {inspectorVisible && <CameraInspector object={object} />}
        {collapseToggle}
      </>
    )
  }

  const baseSize = PRIMITIVE_BASE_SIZE[object.kind]
  const dimensions = baseSize.map((size, i) => size * object.scale[i]) as [number, number, number]

  const handleScaleChange = (next: [number, number, number]) => {
    if (!scaleLocked) {
      updateObject(object.id, { scale: next })
      return
    }
    const prev = object.scale
    const changedIndex = next.findIndex((v, i) => v !== prev[i])
    if (changedIndex === -1) {
      updateObject(object.id, { scale: next })
      return
    }
    const ratio = prev[changedIndex] !== 0 ? next[changedIndex] / prev[changedIndex] : 1
    const scale = prev.map((v) => v * ratio) as [number, number, number]
    updateObject(object.id, { scale })
  }

  // Moving the pivot must not visibly move the object — pivotOffset is baked
  // into the geometry (see buildGeometry in SceneObjectMesh.tsx), so shifting
  // it alone would translate every vertex under a fixed `position`. Spline's
  // own Edit Pivot panel keeps the mesh stationary and updates its Position
  // field instead when you edit the pivot (verified by testing it directly);
  // this replicates that by compensating `position` with the pivot delta
  // rotated/scaled into world space — same correction math as the pivot↔
  // center conversion in ScaleFaceHandles.tsx/SelectionOutline.tsx, just
  // solved for "keep the mesh fixed" instead of "find the geometric center."
  const handlePivotChange = (nextPivot: [number, number, number]) => {
    const prevPivot = object.pivotOffset
    const delta = new Vector3(
      nextPivot[0] - prevPivot[0],
      nextPivot[1] - prevPivot[1],
      nextPivot[2] - prevPivot[2],
    )
      .multiply(new Vector3(...object.scale))
      .applyEuler(new Euler(...object.rotation))

    updateObject(object.id, {
      pivotOffset: nextPivot,
      position: [
        object.position[0] + delta.x,
        object.position[1] + delta.y,
        object.position[2] + delta.z,
      ],
    })
  }

  return (
    <>
      {inspectorVisible && (
        <SelectionPanel>
      <div className="selection-header">
        <span className="selection-category">{PRIMITIVE_LABEL[object.kind].toUpperCase()}</span>
        <input
          className="selection-name"
          type="text"
          value={object.name}
          onChange={(e) => updateObject(object.id, { name: e.target.value })}
        />
        <span className="selection-dimensions">
          Tamanho: {dimensions.map(formatMeters).join(' × ')}
        </span>
      </div>

      <div className="selection-actions">
        <div className="selection-actions-row">
          <button
            className={transformMode === 'scale' ? 'active' : ''}
            onClick={() => setTransformMode(transformMode === 'scale' ? 'translate' : 'scale')}
          >
            <span className="action-label">
              <Scaling size={14} />
              {transformMode === 'scale' ? 'Desativar' : 'Ativar'} escalar
            </span>
            <span className="action-shortcut">S</span>
          </button>
          <button
            className={transformMode === 'scaleFree' ? 'active' : ''}
            onClick={() =>
              setTransformMode(transformMode === 'scaleFree' ? 'translate' : 'scaleFree')
            }
          >
            <span className="action-label">
              <Scale3D size={14} />
              {transformMode === 'scaleFree' ? 'Desativar' : 'Ativar'} escala livre
            </span>
            <span className="action-shortcut">F</span>
          </button>
        </div>
        <button
          className={transformMode === 'rotate' ? 'active' : ''}
          onClick={() => setTransformMode(transformMode === 'rotate' ? 'translate' : 'rotate')}
        >
          <span className="action-label">
            <RotateCw size={14} />
            {transformMode === 'rotate' ? 'Desativar' : 'Ativar'} rotacionar
          </span>
          <span className="action-shortcut">R</span>
        </button>
        <button onClick={() => requestCameraFocus(object.id)}>
          <span className="action-label">
            <Focus size={14} />
            Centralizar câmera
          </span>
          <span className="action-shortcut">.</span>
        </button>
        <button
          className={`snap-toggle ${object.snapToObjects ? 'active' : ''}`}
          onClick={() => updateObject(object.id, { snapToObjects: !object.snapToObjects })}
        >
          <span className="action-label">
            <Magnet size={14} />
            {object.snapToObjects ? 'Desativar' : 'Ativar'} snap a objetos
          </span>
        </button>
        <button className="danger" onClick={() => removeObject(object.id)}>
          <span className="action-label">
            <Trash2 size={14} />
            Excluir objeto
          </span>
          <span className="action-shortcut">Del</span>
        </button>
      </div>

      <div className="field-section-label-row">
        <div className="field-section-label">Transformar</div>
        <button
          className={`edit-pivot-toggle ${editPivotOpen ? 'active' : ''}`}
          onClick={() => setEditPivotOpen((v) => !v)}
          title="Editar pivô"
        >
          <Crosshair size={14} />
        </button>
      </div>
      <div className="selection-fields">
        <Vector3Row
          label="Posição"
          value={object.position}
          onChange={(position) => updateObject(object.id, { position })}
        />
        <Vector3Row
          label="Rotação"
          value={object.rotation}
          onChange={(rotation) => updateObject(object.id, { rotation })}
          step={0.05}
        />
        <Vector3Row
          label="Escala"
          value={object.scale}
          onChange={handleScaleChange}
          lockable
          locked={scaleLocked}
          onToggleLock={() => setScaleLocked((v) => !v)}
        />
      </div>

      <AnimationSection object={object} />

      <div className="field-section-label">Materiais</div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Cor</span>
          <input
            type="color"
            value={object.color}
            onChange={(e) => updateObject(object.id, { color: e.target.value })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Tipo</span>
          <FieldDropdown
            options={MATERIAL_TYPE_OPTIONS}
            value={object.materialType}
            onChange={(materialType) => updateObject(object.id, { materialType })}
          />
        </div>
        {/* Meaningless for 'lambert'/'phong'/'toon' — those shading models
            have no roughness/metalness concept (see types.ts) — hidden
            instead of shown-but-inert. */}
        {(object.materialType === 'standard' || object.materialType === 'physical') && (
          <>
            <div className="field-row">
              <span className="field-label">Rugosidade</span>
              <SliderField
                max={1}
                step={0.01}
                value={object.roughness}
                onChange={(roughness) =>
                  updateObject(object.id, { roughness: Math.min(1, Math.max(0, roughness)) })
                }
              />
            </div>
            <div className="field-row">
              <span className="field-label">Metalicidade</span>
              <SliderField
                max={1}
                step={0.01}
                value={object.metalness}
                onChange={(metalness) =>
                  updateObject(object.id, { metalness: Math.min(1, Math.max(0, metalness)) })
                }
              />
            </div>
          </>
        )}
        <div className="field-row">
          <span className="field-label">Opacidade</span>
          <SliderField
            max={1}
            step={0.01}
            value={object.opacity}
            onChange={(opacity) =>
              updateObject(object.id, { opacity: Math.min(1, Math.max(0, opacity)) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Mesclagem</span>
          <FieldDropdown
            options={BLEND_MODE_OPTIONS}
            value={object.blending}
            onChange={(blending) => updateObject(object.id, { blending })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Cor emissiva</span>
          <input
            type="color"
            value={object.emissiveColor}
            onChange={(e) => updateObject(object.id, { emissiveColor: e.target.value })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Intensidade</span>
          <SliderField
            max={5}
            step={0.1}
            value={object.emissiveIntensity}
            onChange={(emissiveIntensity) =>
              updateObject(object.id, { emissiveIntensity: Math.max(0, emissiveIntensity) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Textura</span>
          <input
            ref={textureInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const meta = await importTexture(file)
              // Image and video maps are mutually exclusive — applying one
              // clears the other so Material only ever has one active.
              updateObject(object.id, { colorMapAssetId: meta.id, videoMapAssetId: null })
            }}
          />
          <div className="texture-field">
            {object.colorMapAssetId && (
              <span className="texture-field-name">
                {assets.find((a) => a.id === object.colorMapAssetId)?.name ?? object.colorMapAssetId}
              </span>
            )}
            <button onClick={() => textureInputRef.current?.click()}>Escolher arquivo</button>
            {object.colorMapAssetId && (
              <button onClick={() => updateObject(object.id, { colorMapAssetId: null })}>
                Remover
              </button>
            )}
          </div>
        </div>
        <div className="field-row">
          <span className="field-label">Vídeo</span>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const meta = await importVideo(file)
              updateObject(object.id, { videoMapAssetId: meta.id, colorMapAssetId: null })
            }}
          />
          <div className="texture-field">
            {object.videoMapAssetId && (
              <span className="texture-field-name">
                {assets.find((a) => a.id === object.videoMapAssetId)?.name ?? object.videoMapAssetId}
              </span>
            )}
            <button onClick={() => videoInputRef.current?.click()}>Escolher arquivo</button>
            {object.videoMapAssetId && (
              <button onClick={() => updateObject(object.id, { videoMapAssetId: null })}>
                Remover
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Procedural weathering (img2threejs skill's "localOverrides" idea) —
          triplanar world-space noise in buildWeatheringNode
          (SceneObjectMesh.tsx), works on any primitive without UVs. Two
          independent sliders since dirt and wear read as different things:
          dirt darkens top-facing surfaces, wear lightens edges/corners. */}
      <div className="field-section-label">Desgaste</div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Sujeira</span>
          <SliderField
            max={1}
            step={0.01}
            value={object.dirtAmount}
            onChange={(dirtAmount) =>
              updateObject(object.id, { dirtAmount: Math.min(1, Math.max(0, dirtAmount)) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Desbotado</span>
          <SliderField
            max={1}
            step={0.01}
            value={object.wearAmount}
            onChange={(wearAmount) =>
              updateObject(object.id, { wearAmount: Math.min(1, Math.max(0, wearAmount)) })
            }
          />
        </div>
        <div className="field-row">
          <span className="field-label">Cor do desgaste</span>
          <input
            type="color"
            value={object.weatheringColor}
            onChange={(e) => updateObject(object.id, { weatheringColor: e.target.value })}
          />
        </div>
      </div>

      {!isProceduralKind(object.kind) && <NodeGraphSection object={object} />}

      <div className="field-section-label">Visibilidade</div>
      <div className="selection-fields">
        <div className="field-row">
          <span className="field-label">Wireframe</span>
          <SegmentedControl
            options={[
              { value: 'off', label: 'Esconder' },
              { value: 'on', label: 'Mostrar' },
            ]}
            value={object.wireframe ? 'on' : 'off'}
            onChange={(v) => updateObject(object.id, { wireframe: v === 'on' })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Sombreado</span>
          <SegmentedControl
            options={[
              { value: 'smooth', label: 'Suave' },
              { value: 'flat', label: 'Chapado' },
            ]}
            value={object.flatShading ? 'flat' : 'smooth'}
            onChange={(v) => updateObject(object.id, { flatShading: v === 'flat' })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Lados</span>
          <SegmentedControl
            options={SIDE_OPTIONS}
            value={object.side}
            onChange={(side) => updateObject(object.id, { side })}
          />
        </div>
        <div className="field-row">
          <span className="field-label">Sombras</span>
          <FieldDropdown
            options={SHADOW_OPTIONS}
            value={object.shadowMode}
            onChange={(shadowMode) => updateObject(object.id, { shadowMode })}
          />
        </div>
      </div>
        </SelectionPanel>
      )}

      {inspectorVisible && editPivotOpen && (
        <div className="edit-pivot-panel" style={{ right: inspectorWidth + 24 }}>
          <div className="edit-pivot-panel-header">
            <h4>Editar pivô</h4>
            <button onClick={() => setEditPivotOpen(false)} title="Fechar">
              <X size={14} />
            </button>
          </div>
          <Vector3Row label="Pivô" value={object.pivotOffset} onChange={handlePivotChange} step={0.05} />
          <p className="edit-pivot-hint">
            Desloca a origem de rotação/escala dentro do objeto sem mover a Posição.
          </p>
        </div>
      )}

      {collapseToggle}
    </>
  )
}
