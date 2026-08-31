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

  let targetIndex = previousTargetIndex === undefined
    || previousTargetIndex < 0
    || previousTargetIndex >= items.length
    ? sourceIndex
    : previousTargetIndex;

  // The boundary between two possible destinations is the center of the row
  // that the dragged item would cross. Geometry is captured before rows move,
  // so visual shifts cannot make the destination oscillate.
  const boundary = (slotIndex: number): number => {
    const crossedIndex = slotIndex < sourceIndex ? slotIndex : slotIndex + 1;
    return center(items[crossedIndex]!);
  };

  while (targetIndex < items.length - 1
    && draggedCenter > boundary(targetIndex) + REORDER_HYSTERESIS) {
    targetIndex += 1;
  }
  while (targetIndex > 0
    && draggedCenter < boundary(targetIndex - 1) - REORDER_HYSTERESIS) {
    targetIndex -= 1;
  }

  const remaining = items.filter((item) => item.id !== sourceId);
  const shifts = items.map((item, index) => {
    if (targetIndex > sourceIndex && index > sourceIndex && index <= targetIndex) {
      return { id: item.id, offset: items[index - 1]!.top - item.top };
    }
    if (targetIndex < sourceIndex && index >= targetIndex && index < sourceIndex) {
      return { id: item.id, offset: items[index + 1]!.top - item.top };
    }
    return { id: item.id, offset: 0 };
  });

  return {
    targetIndex,
    beforeId: remaining[targetIndex]?.id ?? null,
    shifts,
  };
}
