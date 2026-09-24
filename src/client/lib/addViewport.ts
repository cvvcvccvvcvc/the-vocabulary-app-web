export function addViewportCoverage(
  unobscuredBottom: number,
  visibleBottom: number,
  touchEditing: boolean,
): { unobscuredBottom: number; coveredHeight: number } {
  const nextUnobscuredBottom = touchEditing
    ? Math.max(unobscuredBottom, visibleBottom)
    : visibleBottom;
  return {
    unobscuredBottom: nextUnobscuredBottom,
    coveredHeight: Math.max(0, nextUnobscuredBottom - visibleBottom),
  };
}
