import { Grid } from '@react-three/drei'
import { useEditorStore } from '../state/useEditorStore'
import { usePointerClick } from './usePointerClick'

export function Ground() {
  const select = useEditorStore((s) => s.select)
  const { onPointerDown, onPointerUp } = usePointerClick((e) => {
    e.stopPropagation()
    select(null)
  })

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
      <Grid
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#3a3f47"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#5a6270"
        fadeDistance={80}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />
    </group>
  )
}
