import type { EpochMs } from "../../workouts/types";
import { getCompositionHistory, getIndicatorPoints } from "./queries";
import {
  mapIndicators,
  type BodyCompositionMeasurement,
  type CompositionIndicator,
} from "./types";

/** Nombre minimal de valeurs d'un même indicateur pour calculer une évolution. */
export const MIN_POINTS_FOR_TREND = 2;

/**
 * Dénominateur minimal pour qu'un pourcentage ait un sens. Les valeurs validées
 * sont >= 1 (bornes de validation) : ce seuil n'écarte que les cas dégénérés.
 */
export const MIN_PERCENT_BASE = 0.1;

/** Variation relative maximale conservée (en valeur absolue, en %). Au-delà : non exploitable. */
export const MAX_PERCENT_CHANGE = 1000;

export interface IndicatorChange {
  readonly absolute: number;
  /** null si le pourcentage n'a pas de sens ou n'est pas fiable. */
  readonly percent: number | null;
}

export interface IndicatorTrend {
  readonly indicator: CompositionIndicator;
  readonly pointCount: number;
  readonly fromValue: number;
  readonly toValue: number;
  readonly fromAt: EpochMs;
  readonly toAt: EpochMs;
  readonly absoluteChange: number;
  readonly percentChange: number | null;
}

const roundToTenth = (value: number): number => {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
};

/** Pourcentage uniquement si le départ est significatif et le résultat fini et plausible. */
function calculatePercent(from: number, to: number): number | null {
  if (!(from >= MIN_PERCENT_BASE)) {
    return null;
  }
  const raw = ((to - from) / from) * 100;
  if (!Number.isFinite(raw) || Math.abs(raw) > MAX_PERCENT_CHANGE) {
    return null;
  }
  return roundToTenth(raw);
}

/** Évolution entre deux valeurs du MÊME indicateur. null si une valeur n'est pas finie. */
export function calculateIndicatorChange(
  from: number,
  to: number,
): IndicatorChange | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return null;
  }
  const difference = to - from;
  if (!Number.isFinite(difference)) {
    return null;
  }
  return {
    absolute: roundToTenth(difference),
    percent: calculatePercent(from, to),
  };
}

/**
 * Tendance d'un indicateur sur la période : plus ancienne vs plus récente valeur
 * de CET indicateur. null s'il y a moins de deux valeurs.
 */
export function getIndicatorTrend(
  measurements: readonly BodyCompositionMeasurement[],
  indicator: CompositionIndicator,
  days: number,
  now: EpochMs,
): IndicatorTrend | null {
  const points = getIndicatorPoints(
    getCompositionHistory(measurements, days, now),
    indicator,
  );
  const first = points[0];
  const last = points[points.length - 1];
  if (
    points.length < MIN_POINTS_FOR_TREND ||
    first === undefined ||
    last === undefined
  ) {
    return null;
  }
  const change = calculateIndicatorChange(first.value, last.value);
  if (change === null) {
    return null;
  }
  return {
    indicator,
    pointCount: points.length,
    fromValue: first.value,
    toValue: last.value,
    fromAt: first.recordedAt,
    toAt: last.recordedAt,
    absoluteChange: change.absolute,
    percentChange: change.percent,
  };
}

export function getAllTrends(
  measurements: readonly BodyCompositionMeasurement[],
  days: number,
  now: EpochMs,
): Record<CompositionIndicator, IndicatorTrend | null> {
  return mapIndicators((indicator) =>
    getIndicatorTrend(measurements, indicator, days, now),
  );
}
