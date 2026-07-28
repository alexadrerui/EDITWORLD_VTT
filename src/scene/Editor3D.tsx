import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Ground } from './Ground'
import { SceneObjects } from './SceneObjects'
import { useEditorStore } from '../state/useEditorStore'

export function Editor3D() {
  const orbitControlsRef = useRef(null)
  const select = useEditorStore((s) => s.select)

  return (
    <Canvas
      shadows
      camera={{ position: [10, 10, 10], fov: 50 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={['#14161a']} />
      <ambientLight intensity={1.2} />
      <directionalLight
        position={[10, 15, 5]}
        intensity={3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />

      <Ground />
      <SceneObjects orbitControlsRef={orbitControlsRef} />

      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  )
}
