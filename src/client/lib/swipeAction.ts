const REVEAL_DISTANCE_RATIO = 0.45;
const REVEAL_VELOCITY = 0.45;

export function swipeActionOffset(startOffset: number, deltaX: number, actionWidth: number): number {
  return Math.max(-actionWidth, Math.min(0, startOffset + deltaX));
}

export function shouldRevealSwipeAction(
  offset: number,
  velocityX: number,
  actionWidth: number,
): boolean {
  if (Math.abs(velocityX) >= REVEAL_VELOCITY) return velocityX < 0;
  return Math.abs(offset) >= actionWidth * REVEAL_DISTANCE_RATIO;
}
