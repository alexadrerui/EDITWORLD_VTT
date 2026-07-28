import { Box3 } from 'three'
import type { Mesh } from 'three'

const SNAP_THRESHOLD = 0.3

/**
 * Nudges `activeMesh` so its bounding-box edges align flush against the
 * nearest edge of any mesh in `otherMeshes`, independently per axis.
 * Mutates `activeMesh.position` in place.
 */
export function snapPositionToNeighbors(activeMesh: Mesh, otherMeshes: Mesh[]) {
  const activeBox = new Box3().setFromObject(activeMesh)
  const delta = { x: 0, y: 0, z: 0 }
  let snappedX = false
  let snappedY = false
  let snappedZ = false

  for (const mesh of otherMeshes) {
    const box = new Box3().setFromObject(mesh)

    if (!snappedX) {
      if (Math.abs(activeBox.max.x - box.min.x) < SNAP_THRESHOLD) {
        delta.x = box.min.x - activeBox.max.x
        snappedX = true
      } else if (Math.abs(activeBox.min.x - box.max.x) < SNAP_THRESHOLD) {
        delta.x = box.max.x - activeBox.min.x
        snappedX = true
      }
    }

    if (!snappedY) {
      if (Math.abs(activeBox.max.y - box.min.y) < SNAP_THRESHOLD) {
        delta.y = box.min.y - activeBox.max.y
        snappedY = true
      } else if (Math.abs(activeBox.min.y - box.max.y) < SNAP_THRESHOLD) {
        delta.y = box.max.y - activeBox.min.y
        snappedY = true
      }
    }

    if (!snappedZ) {
      if (Math.abs(activeBox.max.z - box.min.z) < SNAP_THRESHOLD) {
        delta.z = box.min.z - activeBox.max.z
        snappedZ = true
      } else if (Math.abs(activeBox.min.z - box.max.z) < SNAP_THRESHOLD) {
        delta.z = box.max.z - activeBox.min.z
        snappedZ = true
      }
    }

    if (snappedX && snappedY && snappedZ) break
  }

  if (delta.x || delta.y || delta.z) {
    activeMesh.position.x += delta.x
    activeMesh.position.y += delta.y
    activeMesh.position.z += delta.z
  }
}
