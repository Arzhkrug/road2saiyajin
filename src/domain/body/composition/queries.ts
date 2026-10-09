import { filterByPeriod } from "../../stats/period";
import type { EpochMs } from "../../workouts/types";
import { getCompositionIdSequence } from "./ids";
import {
  mapIndicators,
  type BodyCompositionId,
  type BodyCompositionMeasurement,
  type CompositionIndicator,
} from "./types";

export interface IndicatorPoint {
  readonly measurementId: BodyCompositionId;
  readonly recordedAt: EpochMs;
  readonly value: number;
}

const compareMeasurements = (
  a: BodyCompositionMeasurement,
  b: BodyCompositionMeasurement,
): number =>
  a.recordedAt - b.recordedAt ||
  getCompositionIdSequence(a.id) - getCompositionIdSequence(b.id) ||
  a.id.localeCompare(b.id);

/** Ordre chronologique croissant, déterministe (rang numérique d'id à égalité). */
export const sortCompositionMeasurements = (
  measurements: readonly BodyCompositionMeasurement[],
): BodyCompositionMeasurement[] => [...measurements].sort(compareMeasurements);

/** Fenêtre glissante [now - days, now], bornes incluses, ordre croissant. */
export function getCompositionHistory(
  measurements: readonly BodyCompositionMeasurement[],
  days: number,
  now: EpochMs,
): BodyCompositionMeasurement[] {
  return sortCompositionMeasurements(
    filterByPeriod(
      measurements,
      (measurement) => measurement.recordedAt,
      days,
      now,
    ),
  );
}

/** Valeurs d'un seul indicateur, dans l'ordre chronologique. Les mesures sans cet indicateur sont ignorées. */
export function getIndicatorPoints(
  measurements: readonly BodyCompositionMeasurement[],
  indicator: CompositionIndicator,
): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  for (const measurement of sortCompositionMeasurements(measurements)) {
    const value = measurement[indicator];
    if (value !== null && Number.isFinite(value)) {
      points.push({
        measurementId: measurement.id,
        recordedAt: measurement.recordedAt,
        value,
      });
    }
  }
  return points;
}

/** Valeur la plus récente disponible pour l'indicateur, même issue d'une mesure ancienne. */
export function getLatestWithIndicator(
  measurements: readonly BodyCompositionMeasurement[],
  indicator: CompositionIndicator,
): IndicatorPoint | null {
  const points = getIndicatorPoints(measurements, indicator);
  return points[points.length - 1] ?? null;
}

export function getLatestValues(
  measurements: readonly BodyCompositionMeasurement[],
): Record<CompositionIndicator, IndicatorPoint | null> {
  return mapIndicators((indicator) =>
    getLatestWithIndicator(measurements, indicator),
  );
}
