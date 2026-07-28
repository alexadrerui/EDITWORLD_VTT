import { useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'

const CLICK_DRAG_THRESHOLD = 5

export function usePointerClick(onClick: (e: ThreeEvent<PointerEvent>) => void) {
  const downPos = useRef<{ x: number; y: number } | null>(null)

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    downPos.current = { x: e.clientX, y: e.clientY }
  }

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const start = downPos.current
    downPos.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.hypot(dx, dy) < CLICK_DRAG_THRESHOLD) {
      onClick(e)
    }
  }

  return { onPointerDown, onPointerUp }
}
