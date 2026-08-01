// Drives a mesh's transform imperatively from an AnimationClip while
// previewing (see "▶ Testar" in AnimationPanel.tsx) — same "module-level
// bridge, React only owns when to (re)attach" spirit as audioListener.ts/
// assetLoaders.ts, but for anime.js instead of three.js/Web Audio directly.
//
// Targets the mesh itself, not mesh.position/rotation/scale separately —
// anime.js v4 ships a first-class three.js Object3D adapter (imported below
// for its module-load side effect) that maps flat x/y/z/rotateX/rotateY/
// rotateZ/scaleX/scaleY/scaleZ properties onto position/rotation/scale,
// converting rotation to/from degrees internally, so there's no need to
// hand-roll a Vector3/Euler bridge or worry about Euler's onChange callback.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { Mesh } from 'three'
import { createTimeline } from 'animejs'
import 'animejs/adapters/three'
import { useEditorStore } from '../state/useEditorStore'
import type { AnimationKeyframe, SceneObject } from '../types'

const RAD_TO_DEG = 180 / Math.PI

export type Channel = 'x' | 'y' | 'z' | 'rotateX' | 'rotateY' | 'rotateZ' | 'scaleX' | 'scaleY' | 'scaleZ'

// Exported for reuse by cutsceneEngine.ts — a Cutscene's shared timeline
// needs the exact same per-channel keyframe-track conversion, just applied
// once per track/mesh instead of once for a single object.
export const CHANNEL_ACCESSORS: Record<Channel, (k: AnimationKeyframe) => number> = {
  x: (k) => k.position[0],
  y: (k) => k.position[1],
  z: (k) => k.position[2],
  rotateX: (k) => k.rotation[0] * RAD_TO_DEG,
  rotateY: (k) => k.rotation[1] * RAD_TO_DEG,
  rotateZ: (k) => k.rotation[2] * RAD_TO_DEG,
  scaleX: (k) => k.scale[0],
  scaleY: (k) => k.scale[1],
  scaleZ: (k) => k.scale[2],
}

// Converts a dense keyframe list into one channel's anime.js "duration
// keyframes" array — each entry describes the segment ARRIVING at that
// keyframe (`duration` is that segment's own length, not an absolute time),
// so the keyframe *before* it supplies the duration via its own `time`. The
// implicit starting value is whatever the mesh already holds when the
// timeline is created — see the `.set(...)` seed to keyframes[0] below.
export function buildChannelTrack(
  keyframes: AnimationKeyframe[],
  clipEasing: string,
  accessor: (k: AnimationKeyframe) => number,
) {
  return keyframes.slice(1).map((kf, i) => ({
    to: accessor(kf),
    duration: kf.time - keyframes[i].time,
    ease: kf.easing ?? clipEasing,
  }))
}

export function useAnimationPreview(meshRef: RefObject<Mesh | null>, object: SceneObject) {
  const clip = useEditorStore((s) => s.animations.find((a) => a.id === object.animationId) ?? null)
  const isTesting = useEditorStore(
    (s) => s.testingAnimationId !== null && s.testingAnimationId === object.animationId,
  )
  const playing = useEditorStore((s) => s.animationPlaying)
  const scrubTime = useEditorStore((s) => s.animationScrubTime)
  const setAnimationScrubTime = useEditorStore((s) => s.setAnimationScrubTime)
  const timelineRef = useRef<ReturnType<typeof createTimeline> | null>(null)

  // (Re)builds the timeline whenever preview starts, or the clip being
  // previewed changes underneath it. Not keyed on individual keyframe edits
  // — the panel only lets you edit keyframes while NOT testing (see
  // AnimationPanel.tsx), so this never needs to hot-swap mid-playback.
  useEffect(() => {
    const mesh = meshRef.current
    if (!isTesting || !clip || !mesh || clip.keyframes.length < 2) return

    const keyframes = clip.keyframes
    const first = keyframes[0]
    mesh.position.set(...first.position)
    mesh.rotation.set(...first.rotation)
    mesh.scale.set(...first.scale)

    const params: Record<string, unknown> = {}
    for (const channel of Object.keys(CHANNEL_ACCESSORS) as Channel[]) {
      params[channel] = buildChannelTrack(keyframes, clip.easing, CHANNEL_ACCESSORS[channel])
    }

    const timeline = createTimeline({
      loop: clip.loop,
      autoplay: false,
      onUpdate: (self) => setAnimationScrubTime(self.iterationCurrentTime),
      // animejs's own `AnimationParams` type isn't exported from the package
      // root and its shape is an internal intersection not meant to be
      // hand-satisfied from outside — this object matches the documented
      // "duration keyframes" shape (`{ to, duration, ease }[]` per channel)
      // exactly, same "vendor type too narrow" escape hatch as
      // assetLoaders.ts's `as unknown as Record<...>` cast.
    }).add(mesh, params as never, 0)
    timelineRef.current = timeline

    return () => {
      // Stops playback and detaches the tweens — SceneObjectMesh.tsx's
      // declarative position/rotation/scale props re-bind on the next
      // render once `isTesting` goes false, snapping the mesh back to
      // whatever object.position/rotation/scale currently holds.
      timeline.revert()
      timelineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTesting, clip, meshRef])

  // Play/pause transport.
  useEffect(() => {
    const timeline = timelineRef.current
    if (!timeline) return
    if (playing) timeline.play()
    else timeline.pause()
  }, [playing, isTesting])

  // Manual scrub, only while paused — while playing, this same store field
  // is being *written* by the timeline's own onUpdate above, so seeking here
  // too would fight live playback every frame.
  useEffect(() => {
    const timeline = timelineRef.current
    if (!timeline || playing) return
    timeline.seek(scrubTime)
  }, [scrubTime, playing])
}
