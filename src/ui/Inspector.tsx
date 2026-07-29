import { useEffect } from 'react'
import { Magnet, RotateCw, Scale3D, Scaling, Trash2 } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'
import { PRIMITIVE_BASE_SIZE, PRIMITIVE_LABEL } from '../scene/primitives'

function formatMeters(value: number) {
  return `${value.toFixed(2).replace('.', ',')} m`
}

function Vector3Row({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string
  value: [number, number, number]
  onChange: (next: [number, number, number]) => void
  step?: number
}) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      {(['x', 'y', 'z'] as const).map((axis, i) => (
        <input
          key={axis}
          type="number"
          step={step}
          value={Number(value[i].toFixed(3))}
          onChange={(e) => {
            const next: [number, number, number] = [...value]
            next[i] = Number(e.target.value)
            onChange(next)
          }}
        />
      ))}
    </div>
  )
}

export function Inspector() {
  const objects = useEditorStore((s) => s.objects)
  const selectedId = useEditorStore((s) => s.selectedId)
  const updateObject = useEditorStore((s) => s.updateObject)
  const removeObject = useEditorStore((s) => s.removeObject)
  const transformMode = useEditorStore((s) => s.transformMode)
  const setTransformMode = useEditorStore((s) => s.setTransformMode)
  const object = objects.find((o) => o.id === selectedId)

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

  if (!object) return null

  const baseSize = PRIMITIVE_BASE_SIZE[object.kind]
  const dimensions = baseSize.map((size, i) => size * object.scale[i]) as [number, number, number]

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
        <div className="field-row">
          <span className="field-label">Cor</span>
          <input
            type="color"
            value={object.color}
            onChange={(e) => updateObject(object.id, { color: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}
