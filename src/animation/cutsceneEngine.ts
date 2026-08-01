// Drives every track's mesh in the currently-testing Cutscene off ONE shared
// anime.js timeline — same imperative-bridge shape as animationEngine.ts's
// useAnimationPreview, generalized from "one object" to "N objects, one
// clock." Mounted once (Editor3D.tsx, alongside BloomPipeline/SunCSM), not
// per-object, since it needs simultaneous access to every track's mesh —
// see meshRegistry.ts for how those are found from here.
import { useEffect, useRef } from 'react'
import type { Mesh } from 'three'
import { createTimeline } from 'animejs'
import 'animejs/adapters/three'
import { useEditorStore } from '../state/useEditorStore'
import { buildChannelTrack, CHANNEL_ACCESSORS, type Channel } from './animationEngine'
import { getMesh } from './meshRegistry'

export function useCutscenePreview() {
  const cutscene = useEditorStore((s) => s.cutscenes.find((c) => c.id === s.testingCutsceneId) ?? null)
  const isTesting = useEditorStore((s) => s.testingCutsceneId !== null)
  const playing = useEditorStore((s) => s.cutscenePlaying)
  const scrubTime = useEditorStore((s) => s.cutsceneScrubTime)
  const setCutsceneScrubTime = useEditorStore((s) => s.setCutsceneScrubTime)
  const timelineRef = useRef<ReturnType<typeof createTimeline> | null>(null)

  // (Re)builds the shared timeline whenever preview starts, or the cutscene
  // being previewed changes underneath it — same "panel only lets you edit
  // while not testing" guarantee as the single-object engine, so this never
  // needs to hot-swap mid-playback.
  useEffect(() => {
    if (!isTesting || !cutscene) return
    const tracksWithMeshes: { track: (typeof cutscene.tracks)[number]; mesh: Mesh }[] = []
    for (const track of cutscene.tracks) {
      if (track.keyframes.length < 2) continue
      const mesh = getMesh(track.objectId)
      if (mesh) tracksWithMeshes.push({ track, mesh })
    }
    if (tracksWithMeshes.length === 0) return

    const timeline = createTimeline({
      loop: cutscene.loop,
      autoplay: false,
      onUpdate: (self) => setCutsceneScrubTime(self.iterationCurrentTime),
    })

    for (const { track, mesh } of tracksWithMeshes) {
      const first = track.keyframes[0]
      mesh.position.set(...first.position)
      mesh.rotation.set(...first.rotation)
      mesh.scale.set(...first.scale)

      const params: Record<string, unknown> = {}
      for (const channel of Object.keys(CHANNEL_ACCESSORS) as Channel[]) {
        params[channel] = buildChannelTrack(track.keyframes, cutscene.easing, CHANNEL_ACCESSORS[channel])
      }
      // See animationEngine.ts's identical cast for why: animejs's
      // `AnimationParams` type isn't exported/satisfiable from outside.
      timeline.add(mesh, params as never, 0)
    }
    timelineRef.current = timeline

    return () => {
      // Each involved mesh's SceneObjectMesh stops suppressing its
      // declarative transform props once isPreviewing goes false (see
      // SceneObjectMesh.tsx), snapping back to whatever object.position/
      // rotation/scale currently holds — same revert story as the
      // single-object engine.
      timeline.revert()
      timelineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTesting, cutscene])

  // Play/pause transport.
  useEffect(() => {
    const timeline = timelineRef.current
    if (!timeline) return
    if (playing) timeline.play()
    else timeline.pause()
  }, [playing, isTesting])

  // Manual scrub, only while paused — see animationEngine.ts's identical
  // reasoning (playing already writes this same field via onUpdate above).
  useEffect(() => {
    const timeline = timelineRef.current
    if (!timeline || playing) return
    timeline.seek(scrubTime)
  }, [scrubTime, playing])
}
