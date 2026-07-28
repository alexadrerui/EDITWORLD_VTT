import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { WebGPURenderer } from 'three/webgpu'
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
      gl={
        // WebGPURenderer with automatic WebGL2 fallback (forceWebGL: false) —
        // same renderer setup used by the folio-2025-study reference project
        // (sources/Game/Rendering.js, MIT licensed). Prefers WebGPU when the
        // browser supports it; falls back to WebGL2 under the same API when
        // it doesn't, so this doesn't narrow browser support vs. WebGLRenderer.
        async ({ canvas }) => {
          const renderer = new WebGPURenderer({
            // `@types/three`'s WebGPU canvas type and lib.dom's OffscreenCanvas
            // don't structurally match; both are the same object at runtime.
            canvas: canvas as HTMLCanvasElement,
            powerPreference: 'high-performance',
            antialias: true,
            forceWebGL: false,
          })
          await renderer.init()
          return renderer
        }
      }
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
        shadow-normalBias={0.03}
        shadow-bias={-0.0005}
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
