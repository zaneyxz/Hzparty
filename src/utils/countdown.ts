export interface CountdownSnapshot {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  status: 'upcoming' | 'live' | 'ended';
  targetYear: number;
  eventDateLabel: string;
  eventTimeLabel: string;
}

/**
 * Resolves the target start (Dec 12, 22:30) and end (Dec 13, 05:00) timestamps
 * in local calendar time relative to `now`, rolling forward to the next year
 * only after the 05:00 closing window has passed.
 */
export function resolveDecemberEventWindow(now: Date): {
  start: Date;
  end: Date;
  targetYear: number;
} {
  const currentYear = now.getFullYear();
  const makeWindow = (year: number) => ({
    start: new Date(year, 11, 12, 22, 30, 0, 0), // Dec is month 11
    end: new Date(year, 11, 13, 5, 0, 0, 0),
    targetYear: year,
  });

  const thisYear = makeWindow(currentYear);
  if (now.getTime() <= thisYear.end.getTime()) {
    return thisYear;
  }
  return makeWindow(currentYear + 1);
}

export function getEventCountdown(now: Date = new Date()): CountdownSnapshot {
  const { start, end, targetYear } = resolveDecemberEventWindow(now);
  const nowMs = now.getTime();
  const startMs = start.getTime();
  const endMs = end.getTime();

  if (nowMs >= startMs && nowMs <= endMs) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      status: 'live',
      targetYear,
      eventDateLabel: '12 de Dezembro',
      eventTimeLabel: '22:30 às 05:00',
    };
  }

  const diffMs = Math.max(0, startMs - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    status: diffMs === 0 ? 'live' : 'upcoming',
    targetYear,
    eventDateLabel: '12 de Dezembro',
    eventTimeLabel: '22:30 às 05:00',
  };
}

export function padTwoDigits(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}
