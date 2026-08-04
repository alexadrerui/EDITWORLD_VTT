// Batches every placed imported-model object that shares the same asset (and
// qualifies — see useModelInstancing in assetLoaders.ts) into one
// THREE.InstancedMesh per sub-mesh, instead of one full draw call per placed
// copy. A forest of 200 identical trees becomes (mesh count inside the
// tree's GLB) draw calls total instead of 200x that.
//
// Each placed object keeps its normal per-object <mesh> anchor (see
// ImportedModelContent in SceneObjectMesh.tsx) for picking, the selection
// outline, and the move/rotate/scale gizmos — none of those read real
// geometry off it (confirmed: SelectionOutline/CompactGizmo/
// ScaleFaceHandles only ever touch position/quaternion/scale). This layer
// only supplies the VISIBLE geometry, mirroring each instance's transform
// off that same anchor mesh every frame — same "copy the live mesh
// transform into a follower object" pattern SelectionOutline already uses —
// so it stays in sync during drag, undo/redo, and animation/cutscene
// preview (which writes straight into the anchor mesh) with no
// special-casing needed here.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances, type PositionMesh } from '@react-three/drei/core/Instances'
import { Matrix4, type Mesh } from 'three'
import type { SceneObject } from '../types'
import { isImportedModelKind } from './primitives'
import { useModelInstancing, type SubMeshDescriptor } from './assetLoaders'

// Reused every frame instead of allocated — same convention as
// SelectionOutline's correctionRef.
const scratchMatrix = new Matrix4()

// <Instances> sizes its instance-matrix buffer once, from its `limit` prop,
// on mount — it does not grow that buffer if `limit` changes later (checked
// in node_modules/@react-three/drei/core/Instances.js: the buffer comes from
// a lazy useState initializer). Rounding up to the next power of two and
// keying the <Instances> tree by that bucket (see AssetInstanceBatch below)
// means adding/removing objects only forces a remount when the count
// actually crosses a bucket boundary, not on every single add/remove.
function nextInstanceLimit(count: number): number {
  return Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(count, 1))))
}

function InstanceFollower({
  objectId,
  localMatrix,
  meshRefs,
}: {
  objectId: string
  localMatrix: Matrix4
  meshRefs: React.RefObject<Map<string, Mesh>>
}) {
  const ref = useRef<PositionMesh>(null)

  useFrame(() => {
    const instance = ref.current
    if (!instance) return
    const anchor = meshRefs.current.get(objectId)
    if (!anchor) {
      // Object hidden (or its group is) or not yet mounted — <Instances>
      // reads every subscribed instance's matrixWorld unconditionally, it
      // doesn't check `.visible`, so collapsing the scale is what actually
      // hides it instead of just being ignored.
      instance.scale.setScalar(0)
      return
    }
    scratchMatrix.compose(anchor.position, anchor.quaternion, anchor.scale).multiply(localMatrix)
    scratchMatrix.decompose(instance.position, instance.quaternion, instance.scale)
  })

  return <Instance ref={ref} />
}

function AssetInstanceBatch({
  assetId,
  objectIds,
  subMeshes,
  meshRefs,
}: {
  assetId: string
  objectIds: string[]
  subMeshes: SubMeshDescriptor[]
  meshRefs: React.RefObject<Map<string, Mesh>>
}) {
  const limit = nextInstanceLimit(objectIds.length)
  return (
    <>
      {subMeshes.map((subMesh, i) => (
        <Instances
          key={`${assetId}:${i}:${limit}`}
          geometry={subMesh.geometry}
          material={subMesh.material}
          limit={limit}
          castShadow
          receiveShadow
        >
          {objectIds.map((id) => (
            <InstanceFollower key={id} objectId={id} localMatrix={subMesh.localMatrix} meshRefs={meshRefs} />
          ))}
        </Instances>
      ))}
    </>
  )
}

function AssetInstances({
  assetId,
  objectIds,
  meshRefs,
}: {
  assetId: string
  objectIds: string[]
  meshRefs: React.RefObject<Map<string, Mesh>>
}) {
  const { status, subMeshes } = useModelInstancing(assetId)
  // Not eligible (still loading, missing, or skinned/morph/multi-material —
  // see useModelInstancing) — those objects render their own real geometry
  // instead, via ImportedModelContent's non-instanced fallback path.
  if (status !== 'ready' || !subMeshes) return null
  return <AssetInstanceBatch assetId={assetId} objectIds={objectIds} subMeshes={subMeshes} meshRefs={meshRefs} />
}

// Mounted once alongside the rest of SceneObjects (not per-object) — see
// SceneObjects.tsx.
export function ImportedModelInstances({
  objects,
  meshRefs,
}: {
  objects: SceneObject[]
  meshRefs: React.RefObject<Map<string, Mesh>>
}) {
  const byAsset = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const object of objects) {
      if (!isImportedModelKind(object.kind) || !object.assetId) continue
      const list = map.get(object.assetId)
      if (list) list.push(object.id)
      else map.set(object.assetId, [object.id])
    }
    return map
  }, [objects])

  return (
    <>
      {[...byAsset.entries()].map(([assetId, objectIds]) => (
        <AssetInstances key={assetId} assetId={assetId} objectIds={objectIds} meshRefs={meshRefs} />
      ))}
    </>
  )
}
