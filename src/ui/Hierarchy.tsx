import { useEditorStore } from '../state/useEditorStore'

export function Hierarchy() {
  const objects = useEditorStore((s) => s.objects)
  const selectedId = useEditorStore((s) => s.selectedId)
  const select = useEditorStore((s) => s.select)

  return (
    <div className="panel hierarchy">
      <h3>Objetos</h3>
      {objects.length === 0 && <p className="empty">Nenhum objeto na cena</p>}
      <ul>
        {objects.map((obj) => (
          <li
            key={obj.id}
            className={obj.id === selectedId ? 'selected' : ''}
            onClick={() => select(obj.id)}
          >
            {obj.name}
          </li>
        ))}
      </ul>
    </div>
  )
}
