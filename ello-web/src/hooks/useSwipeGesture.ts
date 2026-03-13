import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

export type SwipeGestureDetail = {
  direction: SwipeDirection
  deltaX: number
  deltaY: number
  distance: number
  pointerType: string
}

type PointerState = {
  pointerId: number
  startX: number
  startY: number
  pointerType: string
}

type UseSwipeGestureOptions = {
  enabled?: boolean
  threshold?: number
  axisLockRatio?: number
  directions?: SwipeDirection[]
  allowMouse?: boolean
  ignoreFrom?: string
  onSwipe: (detail: SwipeGestureDetail) => void
}

const DEFAULT_IGNORE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[contenteditable="true"]',
  '[data-gesture-ignore="true"]',
].join(', ')

const shouldIgnoreTarget = (target: EventTarget | null, selector: string) => {
  if (!selector || !(target instanceof Element)) return false
  return Boolean(target.closest(selector))
}

const resolveDirection = (
  deltaX: number,
  deltaY: number,
  axisLockRatio: number,
): SwipeDirection | null => {
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)

  if (absX === 0 && absY === 0) return null

  if (absX > absY) {
    if (absX / Math.max(absY, 1) < axisLockRatio) return null
    return deltaX > 0 ? 'right' : 'left'
  }

  if (absY / Math.max(absX, 1) < axisLockRatio) return null
  return deltaY > 0 ? 'down' : 'up'
}

export const useSwipeGesture = ({
  enabled = true,
  threshold = 40,
  axisLockRatio = 1.15,
  directions,
  allowMouse = false,
  ignoreFrom = DEFAULT_IGNORE_SELECTOR,
  onSwipe,
}: UseSwipeGestureOptions) => {
  const pointerStateRef = useRef<PointerState | null>(null)

  const resetGesture = useCallback(() => {
    pointerStateRef.current = null
  }, [])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || !event.isPrimary) return
    if (!allowMouse && event.pointerType === 'mouse') return
    if (shouldIgnoreTarget(event.target, ignoreFrom)) return

    pointerStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pointerType: event.pointerType,
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some browsers may throw if capture is unavailable.
    }
  }, [allowMouse, enabled, ignoreFrom])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = pointerStateRef.current
    if (!state || state.pointerId !== event.pointerId) return

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore release failures.
    }

    const deltaX = event.clientX - state.startX
    const deltaY = event.clientY - state.startY
    const distance = Math.hypot(deltaX, deltaY)

    if (distance < threshold) {
      resetGesture()
      return
    }

    const direction = resolveDirection(deltaX, deltaY, axisLockRatio)
    if (!direction || (directions && !directions.includes(direction))) {
      resetGesture()
      return
    }

    onSwipe({
      direction,
      deltaX,
      deltaY,
      distance,
      pointerType: state.pointerType,
    })

    resetGesture()
  }, [axisLockRatio, directions, onSwipe, resetGesture, threshold])

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = pointerStateRef.current
    if (!state || state.pointerId !== event.pointerId) return

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore release failures.
    }

    resetGesture()
  }, [resetGesture])

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
  }
}
