// Module-level singleton mapping SceneObject.id -> that object's mesh ref —
// same "module-level object, React only owns when to (re)attach" shape as
// audioListener.ts's globalAudioListener. useAnimationPreview (single-object
// preview) can read its mesh ref directly because it runs inside that
// object's own SceneObjectMesh; a Cutscene's shared timeline needs
// simultaneous access to N different objects' meshes from one place
// (cutsceneEngine.ts), which is what this registry is for.
import type { Mesh } from 'three'
import type { RefObject } from 'react'

const registry = new Map<string, RefObject<Mesh | null>>()

export function registerMesh(id: string, ref: RefObject<Mesh | null>): void {
  registry.set(id, ref)
}

export function unregisterMesh(id: string): void {
  registry.delete(id)
}

export function getMesh(id: string): Mesh | null {
  return registry.get(id)?.current ?? null
}
