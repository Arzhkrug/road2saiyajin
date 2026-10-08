import type { EpochMs } from "../workouts/types";

export const ACTIVITY_TYPES = ["boxing"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_INTENSITIES = ["low", "medium", "high"] as const;
export type ActivityIntensity = (typeof ACTIVITY_INTENSITIES)[number];

export const MAX_ACTIVITY_DURATION_MINUTES = 600;
export const MAX_ACTIVITY_NOTES_LENGTH = 500;

export type ActivityId = string;

export interface Activity {
  readonly id: ActivityId;
  readonly type: ActivityType;
  readonly startedAt: EpochMs;
  readonly durationMinutes: number;
  readonly intensity: ActivityIntensity | null;
  readonly notes: string | null;
  readonly createdAt: EpochMs;
}

export interface NewActivityInput {
  readonly type: ActivityType;
  readonly startedAt: EpochMs;
  readonly durationMinutes: number;
  readonly intensity?: ActivityIntensity | null;
  readonly notes?: string | null;
  readonly createdAt: EpochMs;
}
