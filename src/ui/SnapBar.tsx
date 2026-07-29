import type { ReactNode } from 'react'
import { Compass, Grid3x3, LayoutGrid, Sparkles } from 'lucide-react'
import type { GraphicsQuality, PositionSnapMode } from '../types'
import { useEditorStore } from '../state/useEditorStore'
import { useDropdown } from './useDropdown'

const POSITION_SNAP_OPTIONS: PositionSnapMode[] = [null, 0.25, 0.5, 1, 2]
const ROTATION_SNAP_OPTIONS: (number | null)[] = [null, 5, 15, 45, 90]

const QUALITY_OPTIONS: { value: GraphicsQuality; label: string; description: string }[] = [
  { value: 'low', label: 'Baixo', description: 'Sem sombras' },
  { value: 'medium', label: 'Médio', description: 'Sombras ativas' },
  { value: 'high', label: 'Alto', description: 'Qualidade máxima' },
]

const QUALITY_LABEL: Record<GraphicsQuality, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
}

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
        <div className="dropdown-menu dropdown-menu--up">
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

function QualityMenu({
  value,
  onChange,
}: {
  value: GraphicsQuality
  onChange: (value: GraphicsQuality) => void
}) {
  const { open, setOpen, rootRef } = useDropdown<HTMLDivElement>()

  return (
    <div className="dropdown" ref={rootRef}>
      <button onClick={() => setOpen((v) => !v)}>
        <Sparkles size={14} />
        Qualidade: {QUALITY_LABEL[value]}
      </button>
      {open && (
        <div className="dropdown-menu dropdown-menu--up dropdown-menu--descriptive">
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={option.value === value ? 'active' : ''}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span className="dropdown-option-label">{option.label}</span>
              <span className="dropdown-option-description">{option.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SnapBar() {
  const positionSnap = useEditorStore((s) => s.positionSnap)
  const setPositionSnap = useEditorStore((s) => s.setPositionSnap)
  const rotationSnap = useEditorStore((s) => s.rotationSnap)
  const setRotationSnap = useEditorStore((s) => s.setRotationSnap)
  const gridVisible = useEditorStore((s) => s.gridVisible)
  const toggleGridVisible = useEditorStore((s) => s.toggleGridVisible)
  const unit = useEditorStore((s) => s.unit)
  const setUnit = useEditorStore((s) => s.setUnit)
  const quality = useEditorStore((s) => s.quality)
  const setQuality = useEditorStore((s) => s.setQuality)

  return (
    <div className="snap-bar">
      <div className="snap-bar-unit-group">
        <button className={unit === 'ft' ? 'active' : ''} onClick={() => setUnit('ft')}>
          pés
        </button>
        <button className={unit === 'm' ? 'active' : ''} onClick={() => setUnit('m')}>
          m
        </button>
      </div>
      <div className="snap-bar-divider" />
      <button
        className={gridVisible ? 'active' : ''}
        onClick={() => toggleGridVisible()}
        title={gridVisible ? 'Esconder grade' : 'Mostrar grade'}
      >
        <LayoutGrid size={14} />
      </button>
      <div className="snap-bar-divider" />
      <SnapMenu
        label="Grade"
        icon={<Grid3x3 size={14} />}
        value={positionSnap}
        options={POSITION_SNAP_OPTIONS}
        unit="m"
        onChange={setPositionSnap}
      />
      <div className="snap-bar-divider" />
      <SnapMenu
        label="Ângulo"
        icon={<Compass size={14} />}
        value={rotationSnap}
        options={ROTATION_SNAP_OPTIONS}
        unit="°"
        onChange={setRotationSnap}
      />
      <div className="snap-bar-divider" />
      <QualityMenu value={quality} onChange={setQuality} />
    </div>
  )
}
