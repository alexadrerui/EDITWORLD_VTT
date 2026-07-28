import { useMemo, useRef, useState } from 'react'
import { TransformControls } from '@react-three/drei'
import type { Mesh } from 'three'
import { useEditorStore } from '../state/useEditorStore'
import { SceneObjectMesh } from './SceneObjectMesh'

export function SceneObjects({ orbitControlsRef }: { orbitControlsRef: React.RefObject<any> }) {
  const objects = useEditorStore((s) => s.objects)
  const selectedId = useEditorStore((s) => s.selectedId)
  const transformMode = useEditorStore((s) => s.transformMode)
  const updateObject = useEditorStore((s) => s.updateObject)

  const meshRefs = useRef(new Map<string, Mesh>())
  const refCallbacks = useRef(new Map<string, (mesh: Mesh | null) => void>())
  const [, forceUpdate] = useState(0)

  const getRefCallback = (id: string) => {
    let cb = refCallbacks.current.get(id)
    if (!cb) {
      cb = (mesh) => {
        if (mesh) meshRefs.current.set(id, mesh)
        else meshRefs.current.delete(id)
        forceUpdate((n) => n + 1)
      }
      refCallbacks.current.set(id, cb)
    }
    return cb
  }

  const selectedMesh = selectedId ? meshRefs.current.get(selectedId) : undefined
  const selectedObject = useMemo(
    () => objects.find((o) => o.id === selectedId),
    [objects, selectedId],
  )

  return (
    <>
      {objects.map((object) => (
        <SceneObjectMesh key={object.id} object={object} ref={getRefCallback(object.id)} />
      ))}

      {selectedMesh && selectedObject && (
        <TransformControls
          object={selectedMesh}
          mode={transformMode}
          onMouseDown={() => {
            if (orbitControlsRef.current) orbitControlsRef.current.enabled = false
          }}
          onMouseUp={() => {
            if (orbitControlsRef.current) orbitControlsRef.current.enabled = true
            updateObject(selectedObject.id, {
              position: selectedMesh.position.toArray() as [number, number, number],
              rotation: [
                selectedMesh.rotation.x,
                selectedMesh.rotation.y,
                selectedMesh.rotation.z,
              ],
              scale: selectedMesh.scale.toArray() as [number, number, number],
            })
          }}
        />
      )}
    </>
  )
}
