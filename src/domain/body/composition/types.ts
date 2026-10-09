import type { EpochMs } from "../../workouts/types";

export const COMPOSITION_INDICATORS = [
  "bodyFatPercent",
  "muscleMassKg",
  "bmi",
  "visceralFatIndex",
  "waterPercent",
] as const;
export type CompositionIndicator = (typeof COMPOSITION_INDICATORS)[number];

export type BodyCompositionId = string;

/** Chaque indicateur est facultatif et indépendant : `null` = non mesuré. */
export interface BodyCompositionMeasurement {
  readonly id: BodyCompositionId;
  readonly recordedAt: EpochMs;
  readonly bodyFatPercent: number | null;
  readonly muscleMassKg: number | null;
  readonly bmi: number | null;
  readonly visceralFatIndex: number | null;
  readonly waterPercent: number | null;
}

export interface NewCompositionInput {
  readonly recordedAt: EpochMs;
  readonly bodyFatPercent?: number | null;
  readonly muscleMassKg?: number | null;
  readonly bmi?: number | null;
  readonly visceralFatIndex?: number | null;
  readonly waterPercent?: number | null;
}

/** Construit un Record complet en appelant `build` pour chaque indicateur. */
export function mapIndicators<T>(
  build: (indicator: CompositionIndicator) => T,
): Record<CompositionIndicator, T> {
  return {
    bodyFatPercent: build("bodyFatPercent"),
    muscleMassKg: build("muscleMassKg"),
    bmi: build("bmi"),
    visceralFatIndex: build("visceralFatIndex"),
    waterPercent: build("waterPercent"),
  };
}
