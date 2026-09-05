const EXIT_OVERSHOOT = 20;
const MIN_EXIT_DURATION_MS = 160;
const MAX_EXIT_DURATION_MS = 260;
const MIN_EXIT_SPEED = 1.35;

interface ReviewSwipeBounds {
  left: number;
  width: number;
}

export function reviewSwipeExitOffset(
  bounds: ReviewSwipeBounds,
  viewportWidth: number,
  direction: -1 | 1,
): number {
  return direction > 0
    ? viewportWidth - bounds.left + EXIT_OVERSHOOT
    : -(bounds.left + bounds.width + EXIT_OVERSHOOT);
}

export function reviewSwipeExitDuration(
  currentOffset: number,
  exitOffset: number,
  releaseVelocity: number,
): number {
  const remainingDistance = Math.abs(exitOffset - currentOffset);
  const speed = Math.max(Math.abs(releaseVelocity), MIN_EXIT_SPEED);
  return Math.round(Math.max(
    MIN_EXIT_DURATION_MS,
    Math.min(MAX_EXIT_DURATION_MS, remainingDistance / speed),
  ));
}
