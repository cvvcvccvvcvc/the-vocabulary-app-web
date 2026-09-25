export interface AddViewportCoverage {
  unobscuredBottom: number;
  coveredHeight: number;
}

export function addViewportCoverage(
  previous: AddViewportCoverage,
  visibleBottom: number,
  touchEditing: boolean,
): AddViewportCoverage {
  const nextUnobscuredBottom = touchEditing || previous.coveredHeight > 0
    ? Math.max(previous.unobscuredBottom, visibleBottom)
    : visibleBottom;
  const coveredHeight = Math.max(0, nextUnobscuredBottom - visibleBottom);

  // Focus can leave before the keyboard has finished closing. Keep its coverage
  // until the visible viewport returns, so the form does not jump upward on blur.
  if (!touchEditing && coveredHeight <= 8) {
    return { unobscuredBottom: visibleBottom, coveredHeight: 0 };
  }

  return {
    unobscuredBottom: nextUnobscuredBottom,
    coveredHeight,
  };
}
