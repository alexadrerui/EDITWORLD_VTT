import { forwardRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Mesh } from 'three'
import type { SceneObject } from '../types'
import { useEditorStore } from '../state/useEditorStore'
import { usePointerClick } from './usePointerClick'

function Geometry({ kind }: { kind: SceneObject['kind'] }) {
  switch (kind) {
    case 'box':
      return <boxGeometry args={[1, 1, 1]} />
    case 'sphere':
      return <sphereGeometry args={[0.6, 32, 32]} />
    case 'cylinder':
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
    case 'cone':
      return <coneGeometry args={[0.6, 1, 32]} />
    case 'plane':
      return <boxGeometry args={[2, 0.05, 2]} />
  }
}

export const SceneObjectMesh = forwardRef<Mesh, { object: SceneObject }>(
  function SceneObjectMesh({ object }, ref) {
    const selectedId = useEditorStore((s) => s.selectedId)
    const select = useEditorStore((s) => s.select)
    const isSelected = selectedId === object.id

    const { onPointerDown, onPointerUp } = usePointerClick((e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      select(object.id)
    })

    return (
      <mesh
        ref={ref}
        name={object.id}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        castShadow
        receiveShadow
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <Geometry kind={object.kind} />
        <meshStandardMaterial
          color={object.color}
          emissive={isSelected ? '#3a6df0' : '#000000'}
          emissiveIntensity={isSelected ? 0.35 : 0}
        />
      </mesh>
    )
  },
)
