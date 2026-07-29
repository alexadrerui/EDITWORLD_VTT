import { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Color } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Ground } from './Ground'
import { SceneObjects } from './SceneObjects'
import { useEditorStore } from '../state/useEditorStore'

// Sets scene.background imperatively (vs. the declarative
// `<color attach="background" args={[hex]} />`) so a color coming from the
// Cena inspector reruns cleanly on every change without relying on R3F's
// args-diffing for a plain hex string. Note: with the ground plane covering
// 200x200 units and the camera locked to never look above the horizon
// (maxPolarAngle in the OrbitControls below), the background is rarely
// actually visible on screen — verified this is wired correctly by reading
// scene.background directly rather than by eye.
function SceneBackground({ color }: { color: string }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.background = new Color(color)
  }, [scene, color])
  return null
}

export function Editor3D() {
  const orbitControlsRef = useRef(null)
  const select = useEditorStore((s) => s.select)
  const sceneSettings = useEditorStore((s) => s.sceneSettings)

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
      <SceneBackground color={sceneSettings.backgroundColor} />
      <ambientLight intensity={sceneSettings.ambientIntensity} />
      <directionalLight
        position={[10, 15, 5]}
        intensity={sceneSettings.directionalIntensity}
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
