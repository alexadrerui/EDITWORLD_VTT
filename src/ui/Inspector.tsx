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
