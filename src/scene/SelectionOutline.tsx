import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxHelper, Color, type Mesh } from 'three'

export function SelectionOutline({ mesh }: { mesh: Mesh }) {
  const helper = useMemo(() => new BoxHelper(mesh, new Color('#3a6df0')), [mesh])

  useEffect(() => () => helper.dispose(), [helper])

  // BoxHelper snapshots the object's world-space bounding box once at
  // construction; re-running update() every frame keeps it following the
  // mesh while it's being dragged/rotated/scaled by the transform gizmo.
  useFrame(() => helper.update())

  return <primitive object={helper} />
}
