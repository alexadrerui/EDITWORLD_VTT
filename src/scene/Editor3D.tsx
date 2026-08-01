import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei/core/OrbitControls'
import {
  Audio,
  Color,
  type DirectionalLight,
  NeutralToneMapping,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { emissive, mrt, output, pass, renderOutput, vec4 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js'
import { BlendMode, NormalBlending, RenderPipeline, UnsignedByteType, WebGPURenderer } from 'three/webgpu'
import { Ground } from './Ground'
import {
  computeNormalBias,
  computeShadowRadius,
  computeSunPosition,
  PRIMITIVE_BASE_SIZE,
} from './primitives'
import { SceneObjects } from './SceneObjects'
import { useAudioBuffer } from './assetLoaders'
import { globalAudioListener } from './audioListener'
import { useCutscenePreview } from '../animation/cutsceneEngine'
import { useEditorStore } from '../state/useEditorStore'
import type { AxisView } from '../types'

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
    // RenderPipeline's default (outputColorTransform = true) tone-maps
    // colorPass.add(bloomPass) as one combined value at the very end — so
    // the scene's "Exposição" slider (ToneMappingExposure below) was scaling
    // bloom's glow right along with the beauty image. Apply tone
    // mapping/exposure to colorPass alone, then add bloom (still
    // colorspace-converted via NoToneMapping so it isn't washed out/miscolored,
    // just skipping the exposure-driven tone curve) on top, so bloom strength
    // stays constant regardless of scene exposure. Doc'd pattern for manual
    // control: RenderOutputNode.js's own class comment.
    pipeline.outputColorTransform = false
    const toneMappedColor = renderOutput(colorPass, gl.toneMapping, gl.outputColorSpace)
    const gammaBloom = renderOutput(bloomPass, NoToneMapping, gl.outputColorSpace)
    pipeline.outputNode = toneMappedColor.add(gammaBloom)
    return pipeline
  }, [scene, camera, gl])

  useFrame(() => {
    renderPipeline.render()
  }, 1)

  return null
}

// Floor for the scene's own shadow-camera radius (see computeShadowRadius in
// primitives.ts, now shared with directional light-objects too) — never
// shrinks below this, so small/empty scenes keep the same framing as before.
const DEFAULT_SHADOW_RADIUS = 20

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

// Cascaded Shadow Maps for the scene's own always-on directional light —
// chosen over TileShadowNode (the other candidate analyzed) because it's
// camera-aware: sharpness concentrates wherever the editor camera is
// currently looking, rather than a fixed grid over the whole
// computeShadowRadius-sized frustum (see the editworld-vtt skill's shadow
// sections for the full comparison). Opt-in via SceneSettings.csmEnabled
// (SceneInspector.tsx) — real render cost (one shadow-camera pass per
// cascade), only worth it once a scene is big enough that the sun's shadow
// visibly looks blocky.
const CSM_CASCADES = 3
const CSM_MODE = 'practical' as const

function SunCSM({
  sunRef,
  enabled,
  mapSize,
}: {
  sunRef: RefObject<DirectionalLight | null>
  enabled: boolean
  mapSize: number
}) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const csmRef = useRef<CSMShadowNode | null>(null)

  // Builds/tears down the CSM instance itself — only when it's actually
  // toggled on/off, or when `mapSize` changes (quality preset), since each
  // cascade clones the light's `shadow.mapSize` once at first use (same
  // "can't resize an already-allocated shadow texture" constraint already
  // documented for per-light shadowResolution changes elsewhere in this
  // file/SceneObjectMesh.tsx) — not on every camera swap/resize, which the
  // second effect below handles far more cheaply.
  useEffect(() => {
    const sun = sunRef.current
    if (!sun || !enabled) return

    const csm = new CSMShadowNode(sun, { cascades: CSM_CASCADES, mode: CSM_MODE })
    sun.shadow.shadowNode = csm
    csmRef.current = csm

    return () => {
      csm.dispose()
      if (sun.shadow.shadowNode === csm) sun.shadow.shadowNode = undefined
      csmRef.current = null
    }
  }, [enabled, sunRef, mapSize])

  // Keeps the CSM's tracked camera in sync with whichever camera is
  // currently active (CameraRig swaps perspective<->orthographic) and
  // recomputes cascade splits/bounds whenever that camera's frustum changes
  // structurally (resize, projection swap, fov change) — per-frame
  // cascade-light repositioning already happens automatically inside
  // CSMShadowNode's own updateBefore(), no manual call needed for that part.
  // Once CSM is active, this supersedes the sun's own
  // shadow-camera-left/right/top/bottom props below (computeShadowRadius) —
  // each cascade gets its own bounds computed from the view camera instead.
  //
  // `csm.camera` starts `null` and is only populated by CSM's own lazy
  // `_init()` — triggered by the renderer's first shadow-node build pass for
  // this light, which captures whichever camera is actively rendering at
  // that point and also calls `updateFrustums()` itself (confirmed by
  // reading the source: `_init()`'s last line is `this.updateFrustums()`).
  // Calling `updateFrustums()` here before that first pass has run throws —
  // `mainFrustum` is still null too — so this only ever reacts to *later*
  // camera changes, matching the upstream example's own usage (it never
  // calls updateFrustums() right after construction either, only from
  // resize/GUI-change handlers).
  useEffect(() => {
    const csm = csmRef.current
    if (!csm || csm.camera === null) return
    csm.camera = camera
    csm.updateFrustums()
  }, [camera, size, enabled])

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

// World-space height (at zoom 1) of the orthographic frustum — same order of
// magnitude as the perspective camera's default framing from [10,10,10].
const ORTHO_FRUSTUM_SIZE = 20
const WORLD_UP = new Vector3(0, 1, 0)
const GIMBAL_SAFE_UP = new Vector3(0, 0, 1)

// Axis-aligned view snap (Interverse Engine's front/back/top/left/right
// buttons) — the direction the camera sits *away from* the target along, so
// e.g. 'front' places the camera in front of the scene looking toward -Z.
// Arbitrary but internally consistent convention (three.js has no canonical
// "front"); doesn't need to match any other tool's choice.
const AXIS_VIEW_DIRECTIONS: Record<AxisView, Vector3> = {
  front: new Vector3(0, 0, 1),
  back: new Vector3(0, 0, -1),
  top: new Vector3(0, 1, 0),
  left: new Vector3(-1, 0, 0),
  right: new Vector3(1, 0, 0),
}

// Repositions `camera` along `direction` at `distance` from `target`, and (for
// an orthographic camera) sets `zoom` so the same vertical extent stays
// visible as a perspective camera with `perspectiveFovDeg` would show at that
// distance — shared by the projection toggle and "focus on selection" below.
function frameCamera(
  camera: PerspectiveCamera | OrthographicCamera,
  direction: Vector3,
  target: Vector3,
  distance: number,
  perspectiveFovDeg: number,
) {
  // Guard against gimbal lock in lookAt() when the view direction is nearly
  // parallel to the default up vector (looking straight down/up) — same
  // safeUp() idea as kokraf's ControlsManager.js (see editworld-vtt skill
  // notes): three.js's lookAt() degenerates in that case.
  camera.up.copy(Math.abs(direction.dot(WORLD_UP)) > 0.999 ? GIMBAL_SAFE_UP : WORLD_UP)
  camera.position.copy(target).addScaledVector(direction, distance)
  camera.lookAt(target)

  if (camera instanceof OrthographicCamera) {
    const vFov = (perspectiveFovDeg * Math.PI) / 180
    const visibleHeight = 2 * Math.tan(vFov / 2) * distance
    camera.zoom = ORTHO_FRUSTUM_SIZE / visibleHeight
  } else {
    camera.zoom = 1
  }
  camera.updateProjectionMatrix()
}

// Drives two things via the store (both set from plain DOM UI outside the
// Canvas — SnapBar.tsx/Inspector.tsx — same store-flag bridge already used by
// gridVisible/lightGizmosVisible):
//   - `cameraProjection`: toggles perspective <-> orthographic, preserving
//     the current viewing angle (kokraf-style, not a fixed top-down snap).
//   - `focusNonce`/`focusTargetId`: "frame selection", Spline's "Centralizar
//     no objeto"/kokraf's focusObjects(), reusing the same frameCamera() math.
//   - `axisViewNonce`/`axisView`: Interverse Engine's front/back/top/left/
//     right buttons, same frameCamera() math again with a fixed direction.
function CameraRig({ orbitControlsRef }: { orbitControlsRef: RefObject<any> }) {
  const cameraProjection = useEditorStore((s) => s.cameraProjection)
  const focusNonce = useEditorStore((s) => s.focusNonce)
  const focusTargetId = useEditorStore((s) => s.focusTargetId)
  const axisViewNonce = useEditorStore((s) => s.axisViewNonce)
  const axisView = useEditorStore((s) => s.axisView)
  const objects = useEditorStore((s) => s.objects)

  const camera = useThree((s) => s.camera)
  const setDefaultCamera = useThree((s) => s.set)
  const size = useThree((s) => s.size)

  // Re-parents the single shared AudioListener (see audioListener.ts) onto
  // whichever camera is currently active — three.js's Object3D.add()
  // automatically detaches an object from its previous parent, so this one
  // effect (keyed on `camera`, same as the pendingTargetRef restore below)
  // is all that's needed to keep it following the perspective<->orthographic
  // swap; no manual `.remove()` call required.
  useEffect(() => {
    camera.add(globalAudioListener)
  }, [camera])

  // The perspective camera is the one `<Canvas camera={{...}}>` already
  // created — captured once here (projection starts as 'perspective') rather
  // than constructing a second instance, so there's no pop on load.
  const perspectiveCameraRef = useRef<PerspectiveCamera | null>(null)
  if (!perspectiveCameraRef.current && camera instanceof PerspectiveCamera) {
    perspectiveCameraRef.current = camera
  }
  const orthoCameraRef = useRef<OrthographicCamera | null>(null)
  if (!orthoCameraRef.current) {
    const aspect = size.width / size.height
    orthoCameraRef.current = new OrthographicCamera(
      (-ORTHO_FRUSTUM_SIZE * aspect) / 2,
      (ORTHO_FRUSTUM_SIZE * aspect) / 2,
      ORTHO_FRUSTUM_SIZE / 2,
      -ORTHO_FRUSTUM_SIZE / 2,
      0.1,
      1000,
    )
  }

  // Keep the ortho frustum's aspect synced to canvas resizes (the perspective
  // camera's `aspect` is already handled by R3F itself).
  useEffect(() => {
    const cam = orthoCameraRef.current
    if (!cam) return
    const aspect = size.width / size.height
    cam.left = (-ORTHO_FRUSTUM_SIZE * aspect) / 2
    cam.right = (ORTHO_FRUSTUM_SIZE * aspect) / 2
    cam.top = ORTHO_FRUSTUM_SIZE / 2
    cam.bottom = -ORTHO_FRUSTUM_SIZE / 2
    cam.updateProjectionMatrix()
  }, [size])

  // Restoring OrbitControls' target after a camera swap has to happen in a
  // *separate* effect: drei's <OrbitControls> recreates its internal
  // three-stdlib instance whenever the default camera reference changes
  // (node_modules/@react-three/drei/core/OrbitControls.js:
  // `useMemo(() => new OrbitControls$1(explCamera), [explCamera])`), and that
  // new instance always starts with target (0,0,0). By the time this effect's
  // dependency (`camera`) has actually changed, React has already committed
  // the new OrbitControls, so `orbitControlsRef.current` already points at it
  // (refs are applied during commit, before any effects run).
  const pendingTargetRef = useRef<Vector3 | null>(null)
  useEffect(() => {
    if (!pendingTargetRef.current) return
    const controls = orbitControlsRef.current
    if (!controls) return
    controls.target.copy(pendingTargetRef.current)
    controls.update()
    pendingTargetRef.current = null
  }, [camera, orbitControlsRef])

  const prevProjectionRef = useRef(cameraProjection)
  useEffect(() => {
    if (prevProjectionRef.current === cameraProjection) return
    prevProjectionRef.current = cameraProjection
    const controls = orbitControlsRef.current
    const perspectiveCamera = perspectiveCameraRef.current
    const orthoCamera = orthoCameraRef.current
    if (!controls || !perspectiveCamera || !orthoCamera) return

    const fromCam = camera
    const toCam = cameraProjection === 'orthographic' ? orthoCamera : perspectiveCamera
    const target = controls.target.clone()
    const distance = fromCam.position.distanceTo(target)
    const direction = fromCam.position.clone().sub(target).normalize()

    frameCamera(toCam, direction, target, distance, perspectiveCamera.fov)

    pendingTargetRef.current = target
    setDefaultCamera({ camera: toCam })
  }, [cameraProjection, camera, orbitControlsRef, setDefaultCamera])

  const prevFocusNonceRef = useRef(focusNonce)
  useEffect(() => {
    if (prevFocusNonceRef.current === focusNonce) return
    prevFocusNonceRef.current = focusNonce
    const controls = orbitControlsRef.current
    const perspectiveCamera = perspectiveCameraRef.current
    const object = objects.find((o) => o.id === focusTargetId)
    if (!controls || !perspectiveCamera || !object) return

    const [w, h, d] = PRIMITIVE_BASE_SIZE[object.kind]
    const boundingRadius =
      0.5 * Math.hypot(w * object.scale[0], h * object.scale[1], d * object.scale[2])
    const target = new Vector3(...object.position)
    // Keep the current viewing direction — only re-center and re-distance,
    // same idea as kokraf's focusObjects()/Spline's "Centralizar no objeto".
    const direction = camera.position.clone().sub(controls.target).normalize()
    const vFov = (perspectiveCamera.fov * Math.PI) / 180
    const FIT_MARGIN = 1.5
    const distance = Math.max((boundingRadius * FIT_MARGIN) / Math.tan(vFov / 2), 0.5)

    frameCamera(
      camera as PerspectiveCamera | OrthographicCamera,
      direction,
      target,
      distance,
      perspectiveCamera.fov,
    )
    controls.target.copy(target)
    controls.update()
  }, [focusNonce, focusTargetId, objects, camera, orbitControlsRef])

  const prevAxisViewNonceRef = useRef(axisViewNonce)
  useEffect(() => {
    if (prevAxisViewNonceRef.current === axisViewNonce) return
    prevAxisViewNonceRef.current = axisViewNonce
    const controls = orbitControlsRef.current
    const perspectiveCamera = perspectiveCameraRef.current
    if (!controls || !perspectiveCamera || !axisView) return

    // Preserve target/distance (so zoom level and pivot don't jump) — only
    // the viewing direction snaps to the chosen axis.
    const target = controls.target.clone()
    const distance = camera.position.distanceTo(target)
    const direction = AXIS_VIEW_DIRECTIONS[axisView]

    frameCamera(
      camera as PerspectiveCamera | OrthographicCamera,
      direction,
      target,
      distance,
      perspectiveCamera.fov,
    )
    controls.update()
  }, [axisViewNonce, axisView, camera, orbitControlsRef])

  return null
}

// Non-positional background music, mirroring soundSource's SoundIcon "▶
// Testar" bridge (testingBackgroundMusic here instead of testingSoundId) —
// never autoplays on scene load, only plays while the SceneInspector's "▶
// Testar" button is toggled on. Plays through the same shared AudioListener
// as every positional soundSource (see audioListener.ts).
// Mounted once (below, alongside BloomPipeline/SunCSM/BackgroundMusic) so
// useCutscenePreview's shared timeline has a single owner regardless of
// which/how-many objects a Cutscene's tracks reference — see
// cutsceneEngine.ts. Renders nothing itself, purely a side-effect hook.
function CutscenePreviewDriver() {
  useCutscenePreview()
  return null
}

function BackgroundMusic() {
  const sceneSettings = useEditorStore((s) => s.sceneSettings)
  const testing = useEditorStore((s) => s.testingBackgroundMusic)
  const buffer = useAudioBuffer(sceneSettings.backgroundMusicAssetId)
  const audio = useMemo(() => new Audio(globalAudioListener), [])

  useEffect(() => {
    if (!buffer) return
    audio.setBuffer(buffer)
    audio.setLoop(sceneSettings.backgroundMusicLoop)
    audio.setVolume(sceneSettings.backgroundMusicVolume)
  }, [audio, buffer, sceneSettings.backgroundMusicLoop, sceneSettings.backgroundMusicVolume])

  useEffect(() => {
    if (!buffer) return
    if (testing && !audio.isPlaying) audio.play()
    else if (!testing && audio.isPlaying) audio.stop()
  }, [audio, testing, buffer])

  useEffect(
    () => () => {
      if (audio.isPlaying) audio.stop()
    },
    [audio],
  )

  return <primitive object={audio} />
}

export function Editor3D() {
  const orbitControlsRef = useRef(null)
  const sunRef = useRef<DirectionalLight | null>(null)
  const select = useEditorStore((s) => s.select)
  const sceneSettings = useEditorStore((s) => s.sceneSettings)
  const quality = useEditorStore((s) => s.quality)
  const objects = useEditorStore((s) => s.objects)
  const shadowRadius = useMemo(
    () => computeShadowRadius(objects, DEFAULT_SHADOW_RADIUS),
    [objects],
  )
  const sunPosition = useMemo(
    () => computeSunPosition(sceneSettings.sunElevation, sceneSettings.sunAzimuth),
    [sceneSettings.sunElevation, sceneSettings.sunAzimuth],
  )
  const shadowMapSize = quality === 'high' ? 2048 : 1024
  // Texel-proportional normalBias (see computeNormalBias in primitives.ts) —
  // was a fixed 0.03 world units, tuned by eye once against this default
  // small-scene frustum; that same absolute gap reads as "shadow floats
  // above the object" (peter-panning) once you zoom in or work with an
  // object smaller than the frustum it was tuned for, since it doesn't
  // scale with either the frustum size or the map resolution.
  const sunNormalBias = computeNormalBias(shadowRadius * 2, shadowMapSize)
  // Shadows off entirely at "Qualidade: Baixa" (shadows={false} below) — CSM
  // would have nothing to render against, so it never activates in that case
  // regardless of the scene's own csmEnabled toggle.
  const csmActive = sceneSettings.csmEnabled && quality !== 'low'

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
          // Colored/opacity-aware shadows (three.js's own
          // webgpu_shadowmap_opacity.html example) — without this, the
          // shadow map only ever stores binary occlusion, so a translucent
          // object (see SceneObject.opacity) still casts a fully solid black
          // shadow regardless of how see-through it actually is. Paired with
          // each material's `castShadowNode` (see SceneObjectMesh.tsx).
          renderer.shadowMap.transmitted = true
          await renderer.init()
          return renderer
        }
      }
    >
      <SceneBackground color={sceneSettings.backgroundColor} />
      <ToneMappingExposure exposure={sceneSettings.toneMappingExposure} />
      <CameraRig orbitControlsRef={orbitControlsRef} />
      <BloomPipeline />
      <SunCSM sunRef={sunRef} enabled={csmActive} mapSize={shadowMapSize} />
      <BackgroundMusic />
      <CutscenePreviewDriver />
      <ambientLight intensity={sceneSettings.ambientIntensity} />
      <directionalLight
        ref={sunRef}
        position={sunPosition}
        intensity={sceneSettings.directionalIntensity}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-shadowRadius}
        shadow-camera-right={shadowRadius}
        shadow-camera-top={shadowRadius}
        shadow-camera-bottom={-shadowRadius}
        shadow-radius={sceneSettings.sunShadowBlur}
        shadow-normalBias={sunNormalBias}
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
