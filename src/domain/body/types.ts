import type { EpochMs } from "../workouts/types";

export type WeightMeasurementId = string;

export interface WeightMeasurement {
  readonly id: WeightMeasurementId;
  readonly recordedAt: EpochMs;
  readonly weightKg: number;
}
