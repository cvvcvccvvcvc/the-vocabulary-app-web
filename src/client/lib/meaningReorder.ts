const REORDER_HYSTERESIS = 4;

export interface MeaningReorderItem {
  id: number;
  top: number;
  height: number;
}

export interface MeaningReorderShift {
  id: number;
  offset: number;
}

export interface MeaningReorderLayout {
  targetIndex: number;
  beforeId: number | null;
  shifts: MeaningReorderShift[];
  clampedCenter: number;
  offset: number;
}

function center(item: MeaningReorderItem): number {
  return item.top + item.height / 2;
}

export function calculateMeaningReorderLayout(
  items: readonly MeaningReorderItem[],
  sourceId: number,
  draggedCenter: number,
  previousTargetIndex?: number,
): MeaningReorderLayout {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0) throw new Error("Reordered meaning is missing from its geometry");
  const source = items[sourceIndex]!;
  const remaining = items.filter((item) => item.id !== sourceId);
  const gaps = items.slice(1).map((item, index) => item.top - items[index]!.top - items[index]!.height);
  const slotTops = [items[0]!.top];
  for (let index = 0; index < remaining.length; index += 1) {
    slotTops.push(slotTops[index]! + remaining[index]!.height + gaps[index]!);
  }
  const firstCenter = slotTops[0]! + source.height / 2;
  const lastCenter = slotTops[slotTops.length - 1]! + source.height / 2;
  const clampedCenter = Math.max(firstCenter, Math.min(lastCenter, draggedCenter));

  let targetIndex = previousTargetIndex === undefined
    || previousTargetIndex < 0
    || previousTargetIndex >= items.length
    ? sourceIndex
    : previousTargetIndex;

  // Use fixed destination slots, not the animated neighbors. Midpoint boundaries
  // let a row reach either end without requiring the pointer to overshoot the track.
  const boundary = (index: number): number => (slotTops[index]! + slotTops[index + 1]! + source.height) / 2;

  while (targetIndex < items.length - 1
    && clampedCenter > boundary(targetIndex) + REORDER_HYSTERESIS) {
    targetIndex += 1;
  }
  while (targetIndex > 0
    && clampedCenter < boundary(targetIndex - 1) - REORDER_HYSTERESIS) {
    targetIndex -= 1;
  }

  const ordered = [...remaining];
  ordered.splice(targetIndex, 0, source);
  let top = items[0]!.top;
  const destinationTops = new Map(ordered.map((item, index) => {
    const entry = [item.id, top] as const;
    top += item.height + (gaps[index] ?? 0);
    return entry;
  }));
  const shifts = items.map((item) => {
    return { id: item.id, offset: item.id === sourceId ? 0 : destinationTops.get(item.id)! - item.top };
  });

  return {
    targetIndex,
    beforeId: remaining[targetIndex]?.id ?? null,
    shifts,
    clampedCenter,
    offset: clampedCenter - center(source),
  };
}
