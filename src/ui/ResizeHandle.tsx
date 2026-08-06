interface ResizeHandleProps {
  orientation: 'vertical' | 'horizontal'
  onResize: (delta: number) => void
  onResizeEnd: () => void
}

// Thin drag strip for panel resize — same pointer-capture pattern as
// CompactGizmo.tsx/ScaleFaceHandles.tsx's drag handlers (listen on `window`,
// tear down both listeners from inside onPointerUp itself, not a useEffect
// cleanup), just with plain clientX/clientY delta math instead of a
// raycast. The caller owns the delta's sign (which edge grows the panel)
// and any clamping.
export function ResizeHandle({ orientation, onResize, onResizeEnd }: ResizeHandleProps) {
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const axis = orientation === 'vertical' ? 'clientX' : 'clientY'
    const start = e[axis]
    const onMove = (ev: PointerEvent) => onResize(ev[axis] - start)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onResizeEnd()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={`resize-handle resize-handle--${orientation}`}
      onPointerDown={handlePointerDown}
    />
  )
}
