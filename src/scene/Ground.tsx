import { useEffect, useMemo } from 'react'
import { useEditorStore } from '../state/useEditorStore'
import { usePointerClick } from './usePointerClick'
import { GridLine, GridMaterial } from './GridMaterial'

export function Ground() {
  const select = useEditorStore((s) => s.select)
  const positionSnap = useEditorStore((s) => s.positionSnap)
  const { onPointerDown, onPointerUp } = usePointerClick((e) => {
    e.stopPropagation()
    select(null)
  })

  const gridMaterial = useMemo(() => {
    const lines = [new GridLine('#3a3f47', 1, 0.02), new GridLine('#5a6270', 10, 0.03)]
    return new GridMaterial({ lines, fadeDistance: 80, fadeStrength: 1 })
  }, [])

  useEffect(() => {
    const cell = positionSnap ?? 1
    const [fine, section] = gridMaterial.lines
    fine.scale.value = cell
    section.scale.value = cell * 10
  }, [gridMaterial, positionSnap])

  useEffect(() => () => gridMaterial.dispose(), [gridMaterial])

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#1c1f24" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <primitive object={gridMaterial} attach="material" />
      </mesh>
    </group>
  )
}
