import { Magnet, RotateCw, Scaling, Trash2 } from 'lucide-react'
import { useEditorStore } from '../state/useEditorStore'

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

  if (!object) {
    return (
      <div className="panel inspector">
        <h3>Inspetor</h3>
        <p className="empty">Selecione um objeto</p>
      </div>
    )
  }

  return (
    <div className="panel inspector">
      <h3>Inspetor</h3>
      <div className="inspector-actions">
        <button
          className={transformMode === 'rotate' ? 'active' : ''}
          onClick={() => setTransformMode(transformMode === 'rotate' ? 'translate' : 'rotate')}
        >
          <RotateCw size={14} />
          {transformMode === 'rotate' ? 'Desativar' : 'Ativar'} rotacionar
        </button>
        <button
          className={transformMode === 'scale' ? 'active' : ''}
          onClick={() => setTransformMode(transformMode === 'scale' ? 'translate' : 'scale')}
        >
          <Scaling size={14} />
          {transformMode === 'scale' ? 'Desativar' : 'Ativar'} escalar
        </button>
        <button
          className={`snap-toggle ${object.snapToObjects ? 'active' : ''}`}
          onClick={() => updateObject(object.id, { snapToObjects: !object.snapToObjects })}
        >
          <Magnet size={14} />
          {object.snapToObjects ? 'Desativar' : 'Ativar'} snap a objetos
        </button>
        <button className="danger" onClick={() => removeObject(object.id)}>
          <Trash2 size={14} />
          Excluir objeto
        </button>
      </div>
      <div className="field-row">
        <span className="field-label">Nome</span>
        <input
          type="text"
          value={object.name}
          onChange={(e) => updateObject(object.id, { name: e.target.value })}
        />
      </div>
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
  )
}
