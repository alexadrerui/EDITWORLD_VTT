import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Color, NeutralToneMapping } from 'three'
import { emissive, mrt, output, pass, vec4 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { BlendMode, NormalBlending, RenderPipeline, UnsignedByteType, WebGPURenderer } from 'three/webgpu'
import { Ground } from './Ground'
import { PRIMITIVE_BASE_SIZE } from './primitives'
import { SceneObjects } from './SceneObjects'
import { useEditorStore } from '../state/useEditorStore'
import type { SceneObject } from '../types'

const BLOOM_STRENGTH = 1.5
const BLOOM_RADIUS = 0.4

// Selective bloom: only objects with a nonzero `emissiveIntensity` (the "Cor
// emissiva"/"Intensidade" fields in Inspector.tsx) glow — unlike a scene-wide
// brightness-threshold bloom, this leaves bright lights/highlights alone.
// Modeled on three.js's own webgpu_postprocessing_bloom_emissive example:
// the scene's emissive channel is rendered into a second MRT target, blurred/
// bloomed on its own, then added back on top of the normal color output.
//
// This takes over the render call from R3F's default — a positive
// `useFrame` priority disables R3F's automatic render for the frame, the
// same mechanism @react-three/postprocessing uses internally to drive its
// own EffectComposer.
function BloomPipeline() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const renderPipeline = useMemo(() => {
    const scenePass = pass(scene, camera)

    const mrtNode = mrt({
      output,
      emissive: vec4(emissive, output.a),
    })
    mrtNode.setBlendMode('emissive', new BlendMode(NormalBlending))
    scenePass.setMRT(mrtNode)

    // Bandwidth optimization — the emissive channel doesn't need float precision.
    scenePass.getTexture('emissive').type = UnsignedByteType

    const colorPass = scenePass.getTextureNode('output')
    const emissivePass = scenePass.getTextureNode('emissive')
    const bloomPass = bloom(emissivePass, BLOOM_STRENGTH, BLOOM_RADIUS)

    // `RenderPipeline` only works with WebGPURenderer (see Editor3D.tsx's
    // renderer factory) — same renderer this project already commits to.
    const pipeline = new RenderPipeline(gl as unknown as WebGPURenderer)
    pipeline.outputNode = colorPass.add(bloomPass)
    return pipeline
  }, [scene, camera, gl])

  useFrame(() => {
    renderPipeline.render()
  }, 1)

  return null
}

const DEFAULT_SHADOW_RADIUS = 20
const SHADOW_RADIUS_MARGIN = 1.15

// Dynamic shadow-camera framing: a fixed -20/20 frustum clips shadows once
// objects move far from the origin. Recomputed from the current scene's
// objects instead — same idea as the folio-2025-study reference (see
// editworld-vtt skill notes), simplified to an origin-centered radius rather
// than a full off-center bounding box. Never shrinks below the old default,
// so small/empty scenes keep the same framing as before.
function computeShadowRadius(objects: SceneObject[]): number {
  let maxReach = DEFAULT_SHADOW_RADIUS
  for (const object of objects) {
    const [w, h, d] = PRIMITIVE_BASE_SIZE[object.kind]
    const halfDiagonal =
      0.5 * Math.hypot(w * object.scale[0], h * object.scale[1], d * object.scale[2])
    const reach =
      Math.hypot(object.position[0], object.position[1], object.position[2]) + halfDiagonal
    if (reach > maxReach) maxReach = reach
  }
  return maxReach * SHADOW_RADIUS_MARGIN
}

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

// Exposure multiplier on top of the renderer's tone mapping (set once at
// creation below) — same knob as the "physically-correct" three.js example
// this was modeled after (webgpu_lights_physical.html: `renderer.
// toneMappingExposure = Math.pow(params.exposure, 5.0)`), useful now that
// lights are placeable objects with unbounded intensity and can blow out
// highlights without it.
function ToneMappingExposure({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.toneMappingExposure = exposure
  }, [gl, exposure])
  return null
}

export function Editor3D() {
  const orbitControlsRef = useRef(null)
  const select = useEditorStore((s) => s.select)
  const sceneSettings = useEditorStore((s) => s.sceneSettings)
  const quality = useEditorStore((s) => s.quality)
  const objects = useEditorStore((s) => s.objects)
  const shadowRadius = useMemo(() => computeShadowRadius(objects), [objects])
  const shadowMapSize = quality === 'high' ? 2048 : 1024

  return (
    <Canvas
      shadows={quality !== 'low'}
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
            // No powerPreference: Chrome logs "powerPreference option is
            // currently ignored when calling requestAdapter() on Windows"
            // (crbug.com/369219127) whenever this is set, and it has no
            // effect there anyway.
            antialias: true,
            forceWebGL: false,
          })
          // Neutral tone mapping (same choice three.js's own
          // webgpu_lights_clustered.html example makes) — without any tone
          // mapping, bright point/spot lights just clip to solid white
          // instead of rolling off smoothly. Exposure itself stays a
          // per-scene setting (see ToneMappingExposure below).
          renderer.toneMapping = NeutralToneMapping
          await renderer.init()
          return renderer
        }
      }
    >
      <SceneBackground color={sceneSettings.backgroundColor} />
      <ToneMappingExposure exposure={sceneSettings.toneMappingExposure} />
      <BloomPipeline />
      <ambientLight intensity={sceneSettings.ambientIntensity} />
      <directionalLight
        position={[10, 15, 5]}
        intensity={sceneSettings.directionalIntensity}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
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
