import { useState, type ReactNode } from 'react'
import { Compass, Grid3x3, Layers, Plus, Save } from 'lucide-react'
import type { PositionSnapMode, PrimitiveKind } from '../types'
import { useEditorStore } from '../state/useEditorStore'
import { useDropdown } from './useDropdown'
import { ConfirmDialog } from './ConfirmDialog'

const PRIMITIVES: { kind: PrimitiveKind; label: string }[] = [
  { kind: 'box', label: 'Cubo' },
  { kind: 'sphere', label: 'Esfera' },
  { kind: 'cylinder', label: 'Cilindro' },
  { kind: 'cone', label: 'Cone' },
  { kind: 'plane', label: 'Placa' },
]

const POSITION_SNAP_OPTIONS: PositionSnapMode[] = [null, 0.25, 0.5, 1, 2]
const ROTATION_SNAP_OPTIONS: (number | null)[] = [null, 5, 15, 45, 90]

function formatSnapLabel(value: number | null, unit: string) {
  return value === null ? 'Desligado' : `${value}${unit}`
}

function SnapMenu<T extends number | null>({
  label,
  icon,
  value,
  options,
  unit,
  onChange,
}: {
  label: string
  icon: ReactNode
  value: T
  options: T[]
  unit: string
  onChange: (value: T) => void
}) {
  const { open, setOpen, rootRef } = useDropdown<HTMLDivElement>()

  return (
    <div className="dropdown" ref={rootRef}>
      <button onClick={() => setOpen((v) => !v)}>
        {icon}
        {label}: {formatSnapLabel(value, unit)}
      </button>
      {open && (
        <div className="dropdown-menu">
          {options.map((option) => (
            <button
              key={option ?? 'off'}
              className={option === value ? 'active' : ''}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              {formatSnapLabel(option, unit)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AddObjectMenu() {
  const addObject = useEditorStore((s) => s.addObject)
  const { open, setOpen, rootRef } = useDropdown<HTMLDivElement>()

  return (
    <div className="dropdown" ref={rootRef}>
      <button onClick={() => setOpen((v) => !v)}>
        <Plus size={14} /> Adicionar objeto
      </button>
      {open && (
        <div className="dropdown-menu">
          {PRIMITIVES.map((p) => (
            <button
              key={p.kind}
              onClick={() => {
                addObject(p.kind)
                setOpen(false)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SceneMenu() {
  const scenesIndex = useEditorStore((s) => s.scenesIndex)
  const currentSceneId = useEditorStore((s) => s.currentSceneId)
  const isDirty = useEditorStore((s) => s.isDirty)
  const switchScene = useEditorStore((s) => s.switchScene)
  const createScene = useEditorStore((s) => s.createScene)
  const saveScene = useEditorStore((s) => s.saveScene)
  const { open, setOpen, rootRef } = useDropdown<HTMLDivElement>()
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  const currentScene = scenesIndex.find((s) => s.id === currentSceneId)

  const runOrConfirm = (action: () => void) => {
    if (isDirty) setPendingAction(() => action)
    else action()
  }

  return (
    <div className="toolbar-group">
      <button className={isDirty ? 'active' : ''} disabled={!isDirty} onClick={() => saveScene()}>
        <Save size={14} /> Salvar
      </button>

      <div className="dropdown" ref={rootRef}>
        <button onClick={() => setOpen((v) => !v)}>
          <Layers size={14} />
          Cena: {currentScene?.name}
          {isDirty ? ' •' : ''}
        </button>
        {open && (
          <div className="dropdown-menu dropdown-menu--right">
            {scenesIndex.map((scene) => (
              <button
                key={scene.id}
                className={scene.id === currentSceneId ? 'active' : ''}
                onClick={() => {
                  setOpen(false)
                  runOrConfirm(() => switchScene(scene.id))
                }}
              >
                {scene.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => runOrConfirm(() => createScene())}>
        <Plus size={14} /> Nova cena
      </button>

      {pendingAction && (
        <ConfirmDialog
          message="Há alterações não salvas na cena atual. Elas serão perdidas ao continuar."
          confirmLabel="Descartar e continuar"
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            pendingAction()
            setPendingAction(null)
          }}
        />
      )}
    </div>
  )
}

export function Toolbar() {
  const positionSnap = useEditorStore((s) => s.positionSnap)
  const setPositionSnap = useEditorStore((s) => s.setPositionSnap)
  const rotationSnap = useEditorStore((s) => s.rotationSnap)
  const setRotationSnap = useEditorStore((s) => s.setRotationSnap)

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <AddObjectMenu />
      </div>

      <div className="toolbar-group">
        <SnapMenu
          label="Grade"
          icon={<Grid3x3 size={14} />}
          value={positionSnap}
          options={POSITION_SNAP_OPTIONS}
          unit="m"
          onChange={setPositionSnap}
        />
        <SnapMenu
          label="Ângulo"
          icon={<Compass size={14} />}
          value={rotationSnap}
          options={ROTATION_SNAP_OPTIONS}
          unit="°"
          onChange={setRotationSnap}
        />
      </div>

      <SceneMenu />
    </div>
  )
}
