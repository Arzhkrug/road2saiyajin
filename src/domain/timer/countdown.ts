export type TimestampMs = number;

export const TIMER_STATUSES = [
  "idle",
  "running",
  "paused",
  "completed",
] as const;
export type TimerStatus = (typeof TIMER_STATUSES)[number];

export interface CountdownTimer {
  readonly status: TimerStatus;
  readonly durationMs: number;
  /** Origine effective : écoulé = now - startedAt tant que le timer tourne. */
  readonly startedAt: TimestampMs | null;
  readonly pausedAt: TimestampMs | null;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function createTimer(durationMs: number): CountdownTimer {
  return {
    status: "idle",
    durationMs: Math.max(0, durationMs),
    startedAt: null,
    pausedAt: null,
  };
}

export function createPausedTimerAt(
  durationMs: number,
  elapsedMs: number,
  now: TimestampMs,
): CountdownTimer {
  const duration = Math.max(0, durationMs);
  const elapsed = clamp(elapsedMs, 0, duration);
  return {
    status: "paused",
    durationMs: duration,
    startedAt: now - elapsed,
    pausedAt: now,
  };
}

export function getElapsedMs(timer: CountdownTimer, now: TimestampMs): number {
  switch (timer.status) {
    case "idle":
      return 0;
    case "completed":
      return timer.durationMs;
    case "paused":
      if (timer.startedAt === null || timer.pausedAt === null) {
        return 0;
      }
      return clamp(timer.pausedAt - timer.startedAt, 0, timer.durationMs);
    case "running":
      if (timer.startedAt === null) {
        return 0;
      }
      return clamp(now - timer.startedAt, 0, timer.durationMs);
  }
}

export function getRemainingMs(
  timer: CountdownTimer,
  now: TimestampMs,
): number {
  return Math.max(0, timer.durationMs - getElapsedMs(timer, now));
}

export function startTimer(
  timer: CountdownTimer,
  now: TimestampMs,
): CountdownTimer {
  if (timer.status !== "idle") {
    return timer;
  }
  return { ...timer, status: "running", startedAt: now, pausedAt: null };
}

/** Passe en completed si le temps est écoulé. Renvoie le même objet sinon. */
export function syncTimer(
  timer: CountdownTimer,
  now: TimestampMs,
): CountdownTimer {
  if (
    timer.status === "running" &&
    getElapsedMs(timer, now) >= timer.durationMs
  ) {
    return { ...timer, status: "completed" };
  }
  return timer;
}

export function pauseTimer(
  timer: CountdownTimer,
  now: TimestampMs,
): CountdownTimer {
  const synced = syncTimer(timer, now);
  if (synced.status !== "running") {
    return synced;
  }
  return { ...synced, status: "paused", pausedAt: now };
}

export function resumeTimer(
  timer: CountdownTimer,
  now: TimestampMs,
): CountdownTimer {
  if (
    timer.status !== "paused" ||
    timer.startedAt === null ||
    timer.pausedAt === null
  ) {
    return timer;
  }
  return {
    ...timer,
    status: "running",
    startedAt: timer.startedAt + Math.max(0, now - timer.pausedAt),
    pausedAt: null,
  };
}
