import { useMemo, useRef, useState } from 'react'
import { TransformControls } from '@react-three/drei'
import type { Mesh } from 'three'
import { useEditorStore } from '../state/useEditorStore'
import { isLightKind } from './primitives'
import { ScaleFaceHandles } from './ScaleFaceHandles'
import { SceneObjectMesh } from './SceneObjectMesh'
import { SelectionOutline } from './SelectionOutline'
import { snapPositionToNeighbors } from './snapToNeighbors'

// "Escalar" (locked) uses our own Loftcraft-style face handles (see
// ScaleFaceHandles.tsx) instead of TransformControls, so TransformControls
// only ever runs in 'scale' mode for "escalar livre". Its scale gizmo
// (three-stdlib's TransformControlsGizmo) always renders both single-axis
// handles (names 'X'/'Y'/'Z') and free handles — two-axis plane handles
// ('XY'/'YZ'/'XZ') plus the proportional (uniform 3-axis) handles, drawn as
// three separate white squares named 'XYZX'/'XYZY'/'XYZZ' — at once, with no
// built-in prop to show only one group. We wrap the gizmo's own per-frame
// updateMatrixWorld (which resets every handle's `visible` each frame) so
// the single-axis ones stay hidden, leaving only the free/proportional ones.
const LOCKED_AXIS_NAMES = ['X', 'Y', 'Z']

function patchFreeScaleGizmoVisibility(controls: any) {
  const gizmo = controls.gizmo
  if (!gizmo || gizmo.__scaleVisibilityPatched) return
  gizmo.__scaleVisibilityPatched = true
  const original = gizmo.updateMatrixWorld.bind(gizmo)
  gizmo.updateMatrixWorld = (force?: boolean) => {
    original(force)
    for (const group of [gizmo.gizmo.scale.children, gizmo.picker.scale.children]) {
      for (const handle of group) {
        if (LOCKED_AXIS_NAMES.includes(handle.name)) handle.visible = false
      }
    }
  }
}

export function SceneObjects({ orbitControlsRef }: { orbitControlsRef: React.RefObject<any> }) {
  const objects = useEditorStore((s) => s.objects)
  const groups = useEditorStore((s) => s.groups)
  const selectedId = useEditorStore((s) => s.selectedId)
  const transformMode = useEditorStore((s) => s.transformMode)
  const updateObject = useEditorStore((s) => s.updateObject)
  const positionSnap = useEditorStore((s) => s.positionSnap)
  const rotationSnap = useEditorStore((s) => s.rotationSnap)
  const gizmoSpace = useEditorStore((s) => s.gizmoSpace)

  const meshRefs = useRef(new Map<string, Mesh>())
  const refCallbacks = useRef(new Map<string, (mesh: Mesh | null) => void>())
  const [, forceUpdate] = useState(0)

  const controlsRefCallback = useRef((instance: any) => {
    if (instance) patchFreeScaleGizmoVisibility(instance)
  })

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
  // Group lock cascades to its objects even without real 3D parenting yet.
  const selectedLocked =
    !!selectedObject?.locked ||
    !!groups.find((g) => g.id === selectedObject?.groupId)?.locked

  // Lights have no meaningful "scale" in our data model — fall back to
  // translate so selecting a light while scale/scaleFree is still the active
  // mode (carried over from a previously selected mesh) doesn't show a scale
  // gizmo that would do nothing useful.
  const effectiveTransformMode =
    selectedObject && isLightKind(selectedObject.kind) && transformMode !== 'rotate'
      ? 'translate'
      : transformMode

  return (
    <>
      {objects.map((object) => (
        <SceneObjectMesh key={object.id} object={object} ref={getRefCallback(object.id)} />
      ))}

      {selectedMesh && selectedObject && (
        <SelectionOutline mesh={selectedMesh} object={selectedObject} />
      )}

      {selectedMesh && selectedObject && !selectedLocked && effectiveTransformMode === 'scale' && (
        <ScaleFaceHandles
          mesh={selectedMesh}
          object={selectedObject}
          updateObject={updateObject}
          orbitControlsRef={orbitControlsRef}
        />
      )}

      {selectedMesh && selectedObject && !selectedLocked && effectiveTransformMode !== 'scale' && (
        <TransformControls
          ref={controlsRefCallback.current}
          object={selectedMesh}
          mode={effectiveTransformMode === 'scaleFree' ? 'scale' : effectiveTransformMode}
          space={gizmoSpace}
          translationSnap={selectedObject.snapToObjects ? null : positionSnap}
          rotationSnap={rotationSnap !== null ? (rotationSnap * Math.PI) / 180 : null}
          onObjectChange={() => {
            if (!selectedObject.snapToObjects || transformMode !== 'translate') return
            const otherMeshes = objects
              .filter((o) => o.id !== selectedObject.id)
              .map((o) => meshRefs.current.get(o.id))
              .filter((mesh): mesh is Mesh => mesh !== undefined)
            snapPositionToNeighbors(selectedMesh, otherMeshes)
          }}
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
