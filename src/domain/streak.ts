export interface CurrentStreak {
  current: number;
  studiedToday: boolean;
}

export function calculateCurrentStreak(
  activeDays: readonly string[],
  today: string,
): CurrentStreak {
  const days = new Set(activeDays);
  const studiedToday = days.has(today);
  let cursor = studiedToday ? today : previousDay(today);

  if (!days.has(cursor)) {
    return { current: 0, studiedToday };
  }

  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor = previousDay(cursor);
  }

  return { current, studiedToday };
}

export function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
