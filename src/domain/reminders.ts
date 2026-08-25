export const REMINDER_MILESTONE_DAYS = [1, 2, 4, 7, 14, 30] as const;

export type ReminderMilestoneDays = (typeof REMINDER_MILESTONE_DAYS)[number];

const dayMilliseconds = 86_400_000;

export function pendingReminderMilestone(
  lastStudiedAt: string,
  processedThroughDays: number | null,
  now: Date,
): ReminderMilestoneDays | null {
  const elapsedMilliseconds = now.getTime() - new Date(lastStudiedAt).getTime();
  if (elapsedMilliseconds < dayMilliseconds) return null;

  const reached = REMINDER_MILESTONE_DAYS.findLast(
    (days) => elapsedMilliseconds >= days * dayMilliseconds,
  );
  if (reached === undefined || reached <= (processedThroughDays ?? 0)) return null;
  return reached;
}
