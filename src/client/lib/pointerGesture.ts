interface PointerGestureHandlers {
  move: (event: PointerEvent) => void;
  end: (event: PointerEvent) => void;
  cancel: () => void;
}

export type PointerGestureAxis = "horizontal" | "vertical" | null;

export function resolvePointerGestureAxis(
  deltaX: number,
  deltaY: number,
  lockDistance: number,
  dominanceRatio: number,
): PointerGestureAxis {
  if (Math.hypot(deltaX, deltaY) < lockDistance) return null;

  const distanceX = Math.abs(deltaX);
  const distanceY = Math.abs(deltaY);
  if (distanceX > distanceY * dominanceRatio) return "horizontal";
  if (distanceY > distanceX * dominanceRatio) return "vertical";
  return null;
}

// Listen on the window for the lifetime of one gesture, not on its starting element.
// Pointer capture is useful but must not be the only way to receive its final event.
export function trackPointerGesture(
  target: EventTarget,
  pointerId: number,
  handlers: PointerGestureHandlers,
): () => void {
  const options = { capture: true };
  const move = (event: Event) => {
    if ((event as PointerEvent).pointerId === pointerId) handlers.move(event as PointerEvent);
  };
  const end = (event: Event) => {
    if ((event as PointerEvent).pointerId !== pointerId) return;
    stop();
    handlers.end(event as PointerEvent);
  };
  const cancel = (event: Event) => {
    if ((event as PointerEvent).pointerId !== pointerId) return;
    stop();
    handlers.cancel();
  };
  function stop() {
    target.removeEventListener("pointermove", move, options);
    target.removeEventListener("pointerup", end, options);
    target.removeEventListener("pointercancel", cancel, options);
  }
  target.addEventListener("pointermove", move, options);
  target.addEventListener("pointerup", end, options);
  target.addEventListener("pointercancel", cancel, options);
  return stop;
}
