import { useEffect, useState } from 'react'
import { ChevronDown, Link2, Magnet, RotateCw, Scale3D, Scaling, Trash2, Unlink2 } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import { PRIMITIVE_BASE_SIZE, PRIMITIVE_LABEL } from '../scene/primitives'
import { SceneInspector } from './SceneInspector'
import { useDropdown } from './useDropdown'
import type { MaterialSide, MaterialType, ShadowMode } from '../types'

function formatMeters(value: number) {
  return `${value.toFixed(2).replace('.', ',')} m`
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

const SHADOW_OPTIONS: { value: ShadowMode; label: string }[] = [
  { value: 'both', label: 'Ambas' },
  { value: 'cast', label: 'Projetar' },
  { value: 'receive', label: 'Receber' },
  { value: 'none', label: 'Nenhuma' },
]

export function Inspector() {
  const objects = useEditorStore((s) => s.objects)
  const selectedId = useEditorStore((s) => s.selectedId)
  const updateObject = useEditorStore((s) => s.updateObject)
  const removeObject = useEditorStore((s) => s.removeObject)
  const transformMode = useEditorStore((s) => s.transformMode)
  const setTransformMode = useEditorStore((s) => s.setTransformMode)
  const object = objects.find((o) => o.id === selectedId)

  // Local, not persisted per-object — a workflow toggle (like Spline's), not
  // content about the object itself.
  const [scaleLocked, setScaleLocked] = useState(false)

  // Keyboard shortcuts (R/S/F/Del), like the hints shown next to each action
  // below — ignored while typing in a field so they don't hijack normal text
  // entry, and while nothing is selected.
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
          setTransformMode(transformMode === 'scale' ? 'translate' : 'scale')
          break
        case 'f':
          setTransformMode(transformMode === 'scaleFree' ? 'translate' : 'scaleFree')
          break
        case 'delete':
        case 'backspace':
          removeObject(object.id)
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [object, transformMode, setTransformMode, removeObject])

  if (!object) return <SceneInspector />

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
    updateObject(object.id, {
      scale: prev.map((v) => v * ratio) as [number, number, number],
    })
  }

  return (
    <div className="floating-panel selection-panel">
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
          onChange={handleScaleChange}
          lockable
          locked={scaleLocked}
          onToggleLock={() => setScaleLocked((v) => !v)}
        />
      </div>

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
      </div>

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
    </div>
  )
}
