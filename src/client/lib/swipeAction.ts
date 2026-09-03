const REVEAL_DISTANCE_RATIO = 0.45;
const REVEAL_VELOCITY = 0.45;
const ACTION_APPEAR_DISTANCE = 18;
const ACTION_FULL_OPACITY_DISTANCE = 68;
const ACTION_EDGE_INSET = 6;
const DEEP_CONFIRM_DISTANCE_RATIO = 0.72;

export type SwipeActionSettlement = "closed" | "revealed" | "confirm";

export interface SwipeActionPresentation {
  width: number;
  progress: number;
}

export function swipeActionOffset(startOffset: number, deltaX: number, maximumDistance: number): number {
  return Math.max(-maximumDistance, Math.min(0, startOffset + deltaX));
}

export function settleSwipeAction(
  offset: number,
  velocityX: number,
  rowWidth: number,
  revealedOffset: number,
): SwipeActionSettlement {
  const distance = Math.abs(offset);
  if (distance >= rowWidth * DEEP_CONFIRM_DISTANCE_RATIO) return "confirm";
  if (Math.abs(velocityX) >= REVEAL_VELOCITY) return velocityX < 0 ? "revealed" : "closed";
  return distance >= revealedOffset * REVEAL_DISTANCE_RATIO ? "revealed" : "closed";
}

export function swipeActionPresentation(offset: number): SwipeActionPresentation {
  const distance = Math.abs(offset);
  if (distance <= ACTION_APPEAR_DISTANCE) return { width: 0, progress: 0 };
  return {
    width: Math.max(0, distance - ACTION_EDGE_INSET * 2),
    progress: Math.min(
      1,
      (distance - ACTION_APPEAR_DISTANCE)
        / (ACTION_FULL_OPACITY_DISTANCE - ACTION_APPEAR_DISTANCE),
    ),
  };
}
