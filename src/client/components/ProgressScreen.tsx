import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { UserStatisticsDay, UserStatisticsResponse } from "../../shared/contracts.js";
import { api, ApiError } from "../lib/api.js";
import { Icon } from "./Icons.js";

interface ProgressScreenProps {
  onAddWord(): void;
  onLearn(): void;
  onOpenSettings(): void;
}

type ActivityMode = "reviews" | "words";

interface CalendarDay {
  date: string;
  activity: UserStatisticsDay | null;
}

export function ProgressScreen({ onAddWord, onLearn, onOpenSettings }: ProgressScreenProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [report, setReport] = useState<UserStatisticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  useEffect(() => {
    let active = true;
    setReport(null);
    setError(null);
    api.statistics(timeZone)
      .then((statistics) => {
        if (active) setReport(statistics);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof ApiError ? requestError.message : "Could not load progress");
      });
    return () => {
      active = false;
    };
  }, [reloadKey, timeZone]);

  const isEmptyProgress = report !== null
    && report.vocabulary.totalWords === 0
    && report.activity.every((day) => day.answers === 0 && day.wordsAdded === 0);

  return (
    <section className="screen progress-screen">
      <header className="mobile-screen-header progress-mobile-header">
        <h1>Progress</h1>
        <button className="mobile-header-button" type="button" aria-label="Settings" onClick={onOpenSettings}>
          <Icon name="settings" />
        </button>
      </header>

      {report === null && error === null && (
        <div className="progress-message" aria-label="Loading progress">
          <div className="loading-ring" />
        </div>
      )}

      {error !== null && (
        <div className="progress-message">
          <h1>Could not load progress</h1>
          <p>{error}</p>
          <button className="primary-button progress-retry" type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </div>
      )}

      {report !== null && (
        <div className="progress-stack">
          {isEmptyProgress ? (
            <EmptyProgress onAddWord={onAddWord} />
          ) : (
            <>
              <StreakCard report={report} onAddWord={onAddWord} onLearn={onLearn} />
              <ActivityCard activity={report.activity} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyProgress({ onAddWord }: { onAddWord(): void }) {
  return (
    <section className="progress-card progress-empty-state">
      <h2>Add your first word</h2>
      <p>Your progress will appear here after you begin reviewing.</p>
      <button className="primary-button" type="button" onClick={onAddWord}>Add word</button>
    </section>
  );
}

function StreakCard({
  report,
  onAddWord,
  onLearn,
}: {
  report: UserStatisticsResponse;
  onAddWord(): void;
  onLearn(): void;
}) {
  const { current, studiedToday } = report.streak;
  const hasWords = report.vocabulary.totalWords > 0;
  const status = current > 0
    ? "Review one card today to keep it going."
    : hasWords
      ? "Review one card today to start a streak."
      : "Add your first word, then begin reviewing.";

  return (
    <section className="progress-card streak-card" aria-labelledby="streak-title">
      <div className="streak-summary">
        <span className="streak-icon" aria-hidden="true"><Icon name="flame" /></span>
        <div>
          <p className="progress-eyebrow" id="streak-title">Current streak</p>
          <p className="streak-value">
            <strong>{formatNumber(current)}</strong>
            <span>{current === 1 ? "day" : "days"}</span>
          </p>
          {!studiedToday && <p className="streak-status">{status}</p>}
        </div>
      </div>

      {!studiedToday && (
        <button className="primary-button streak-action" type="button" onClick={hasWords ? onLearn : onAddWord}>
          {hasWords ? "Learn now" : "Add your first word"}
        </button>
      )}
    </section>
  );
}

function ActivityCard({ activity }: { activity: UserStatisticsDay[] }) {
  const [mode, setMode] = useState<ActivityMode>("reviews");
  const today = activity.at(-1)?.date ?? "";
  const [selectedDate, setSelectedDate] = useState(today);
  const calendarDays = useMemo(() => buildCalendarDays(activity), [activity]);
  const selectedDay = activity.find((day) => day.date === selectedDate) ?? activity.at(-1);

  const selectPointerDay = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const week = clamp(Math.floor(((event.clientX - bounds.left) / bounds.width) * 12), 0, 11);
    const weekday = clamp(Math.floor(((event.clientY - bounds.top) / bounds.height) * 7), 0, 6);
    const day = calendarDays[week * 7 + weekday];
    if (day !== undefined && day.activity !== null) setSelectedDate(day.date);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    selectPointerDay(event);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) selectPointerDay(event);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = calendarDays.findIndex((day) => day.date === selectedDate);
    const lastSelectableIndex = calendarDays.findLastIndex((day) => day.activity !== null);
    const currentWeek = Math.floor(currentIndex / 7);
    const currentWeekday = currentIndex % 7;
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentWeek - 1) * 7 + currentWeekday;
    else if (event.key === "ArrowRight") nextIndex = Math.min(11, currentWeek + 1) * 7 + currentWeekday;
    else if (event.key === "ArrowUp") nextIndex = currentWeek * 7 + Math.max(0, currentWeekday - 1);
    else if (event.key === "ArrowDown") nextIndex = currentWeek * 7 + Math.min(6, currentWeekday + 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastSelectableIndex;
    else return;

    event.preventDefault();
    const day = calendarDays[clamp(nextIndex, 0, lastSelectableIndex)];
    if (day !== undefined && day.activity !== null) setSelectedDate(day.date);
  };

  return (
    <section className="progress-card heatmap-card" aria-labelledby="activity-title">
      <header>
        <p className="progress-eyebrow" aria-hidden="true">Last 12 weeks</p>
        <h2 className="visually-hidden" id="activity-title">Activity over the last 12 weeks</h2>
      </header>

      <div className="activity-mode-tabs" role="tablist" aria-label="Activity type">
        <button
          className={mode === "reviews" ? "active" : ""}
          id="reviews-tab"
          type="button"
          role="tab"
          aria-controls="activity-panel"
          aria-selected={mode === "reviews"}
          onClick={() => setMode("reviews")}
        >
          Reviews
        </button>
        <button
          className={mode === "words" ? "active" : ""}
          id="words-added-tab"
          type="button"
          role="tab"
          aria-controls="activity-panel"
          aria-selected={mode === "words"}
          onClick={() => setMode("words")}
        >
          Words added
        </button>
      </div>

      <div className="activity-mode-panel" id="activity-panel" role="tabpanel" aria-labelledby={mode === "reviews" ? "reviews-tab" : "words-added-tab"}>
        <ActivityHeatmap
          calendarDays={calendarDays}
          today={today}
          mode={mode}
          selectedDate={selectedDate}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerEnd={handlePointerEnd}
        />

        {selectedDay !== undefined && (
          <SelectedDayDetails day={selectedDay} mode={mode} isToday={selectedDay.date === today} />
        )}
      </div>
    </section>
  );
}

function ActivityHeatmap({
  calendarDays,
  today,
  mode,
  selectedDate,
  onKeyDown,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: {
  calendarDays: CalendarDay[];
  today: string;
  mode: ActivityMode;
  selectedDate: string;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerEnd(event: ReactPointerEvent<HTMLDivElement>): void;
}) {
  const values = calendarDays.flatMap((day) => day.activity === null ? [] : [valueForMode(day.activity, mode)]);
  const maximum = heatmapMaximum(values, mode === "reviews" ? 8 : 4);
  const monthLabels = calendarMonthLabels(calendarDays);

  return (
    <figure className="activity-heatmap">
      <div className="heatmap-months" aria-hidden="true">
        {monthLabels.map((label, week) => label === null ? null : (
          <span key={`${week}-${label}`} style={{ gridColumn: week + 1 }}>{label}</span>
        ))}
      </div>
      <div className="heatmap-weekdays" aria-hidden="true">
        <span style={{ gridRow: 1 }}>M</span>
        <span style={{ gridRow: 3 }}>W</span>
        <span style={{ gridRow: 5 }}>F</span>
      </div>
      <div
        className="heatmap-plot"
        role="grid"
        tabIndex={0}
        aria-label={`${mode === "reviews" ? "Review" : "Words added"} activity for the last 12 weeks`}
        aria-rowcount={7}
        aria-colcount={12}
        aria-activedescendant={`activity-day-${selectedDate}`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {Array.from({ length: 84 }, (_, renderIndex) => {
          const weekday = Math.floor(renderIndex / 12);
          const week = renderIndex % 12;
          const calendarDay = calendarDays[week * 7 + weekday];
          if (calendarDay === undefined) return null;
          const value = calendarDay.activity === null ? 0 : valueForMode(calendarDay.activity, mode);
          const level = calendarDay.activity === null ? 0 : heatmapLevel(value, maximum);
          const selected = calendarDay.date === selectedDate;
          const className = [
            "heatmap-day",
            calendarDay.activity === null ? "future" : "",
            calendarDay.date === today ? "today" : "",
            selected ? "selected" : "",
          ].filter(Boolean).join(" ");
          const label = calendarDay.activity === null
            ? `${formatLongDate(calendarDay.date)}, future date`
            : describeDay(calendarDay.activity, mode);
          return (
            <span
              className={className}
              id={`activity-day-${calendarDay.date}`}
              key={calendarDay.date}
              role="gridcell"
              aria-label={label}
              aria-selected={selected}
              aria-disabled={calendarDay.activity === null}
              data-level={level}
              style={{ gridColumn: week + 1, gridRow: weekday + 1 }}
              title={label}
            />
          );
        })}
      </div>
      <figcaption className="heatmap-legend" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} />)}
        <span>More</span>
      </figcaption>
    </figure>
  );
}

function SelectedDayDetails({ day, mode, isToday }: { day: UserStatisticsDay; mode: ActivityMode; isToday: boolean }) {
  return (
    <div className="selected-day-details" aria-live="polite">
      <p className="progress-eyebrow">{isToday ? "Today · " : ""}{formatDetailDate(day.date)}</p>
      {mode === "reviews" ? (
        <strong>{day.answers === 0 ? "No answers" : formatUnit(day.answers, "answer")}</strong>
      ) : (
        <strong>{day.wordsAdded === 0 ? "No words added" : `${formatUnit(day.wordsAdded, "word")} added`}</strong>
      )}
    </div>
  );
}

function buildCalendarDays(activity: UserStatisticsDay[]): CalendarDay[] {
  const today = activity.at(-1)?.date;
  if (today === undefined) return [];
  const activityByDate = new Map(activity.map((day) => [day.date, day]));
  const mondayIndex = (parseDay(today).getUTCDay() + 6) % 7;
  const currentWeekMonday = addDays(today, -mondayIndex);
  const firstDay = addDays(currentWeekMonday, -77);
  return Array.from({ length: 84 }, (_, index) => {
    const date = addDays(firstDay, index);
    return { date, activity: date <= today ? activityByDate.get(date) ?? null : null };
  });
}

function calendarMonthLabels(days: CalendarDay[]): Array<string | null> {
  return Array.from({ length: 12 }, (_, week) => {
    const weekDays = days.slice(week * 7, week * 7 + 7);
    const firstOfMonth = weekDays.find((day) => day.date.endsWith("-01"));
    if (week === 0) return formatMonth(weekDays[0]?.date ?? "");
    return firstOfMonth === undefined ? null : formatMonth(firstOfMonth.date);
  });
}

function valueForMode(day: UserStatisticsDay, mode: ActivityMode): number {
  return mode === "reviews" ? day.answers : day.wordsAdded;
}

function heatmapMaximum(values: number[], minimum: number): number {
  const positive = values.filter((value) => value > 0).sort((left, right) => left - right);
  if (positive.length === 0) return minimum;
  const percentileIndex = Math.max(0, Math.ceil(positive.length * 0.95) - 1);
  return Math.max(minimum, positive[percentileIndex] ?? minimum);
}

function heatmapLevel(value: number, maximum: number): number {
  if (value === 0) return 0;
  return clamp(Math.ceil((Math.min(value, maximum) / maximum) * 4), 1, 4);
}

function describeDay(day: UserStatisticsDay, mode: ActivityMode): string {
  if (mode === "words") return `${formatLongDate(day.date)}: ${formatUnit(day.wordsAdded, "word")} added`;
  return `${formatLongDate(day.date)}: ${formatUnit(day.answers, "answer")}`;
}

function parseDay(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

function addDays(day: string, amount: number): string {
  const value = parseDay(day);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function formatMonth(day: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" }).format(parseDay(day));
}

function formatDetailDate(day: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(parseDay(day));
}

function formatLongDate(day: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(parseDay(day));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatUnit(value: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
