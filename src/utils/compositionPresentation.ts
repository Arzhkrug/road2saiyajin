import {
  COMPOSITION_INDICATORS,
  type BodyCompositionMeasurement,
  type CompositionIndicator,
  type IndicatorTrend,
} from "../domain";
import { formatShortDate } from "./format";

export const INDICATOR_LABELS: Record<CompositionIndicator, string> = {
  bodyFatPercent: "Masse grasse",
  muscleMassKg: "Masse musculaire",
  bmi: "IMC",
  visceralFatIndex: "Graisse viscérale (indice)",
  waterPercent: "Eau corporelle",
};

export const INDICATOR_UNITS: Record<CompositionIndicator, string> = {
  bodyFatPercent: "%",
  muscleMassKg: "kg",
  bmi: "",
  visceralFatIndex: "",
  waterPercent: "%",
};

/** Variation absolue : points pour les indicateurs en %, pour ne pas la confondre avec le % relatif. */
const CHANGE_UNITS: Record<CompositionIndicator, string> = {
  bodyFatPercent: "pt",
  muscleMassKg: "kg",
  bmi: "",
  visceralFatIndex: "",
  waterPercent: "pt",
};

const withUnit = (text: string, unit: string): string =>
  unit === "" ? text : `${text} ${unit}`;

/** Les valeurs ont au plus une décimale : on n'affiche jamais plus, ni de zéro superflu. */
const formatNumber = (value: number): string => String(value).replace(".", ",");

const formatSigned = (value: number): string =>
  `${value > 0 ? "+" : ""}${formatNumber(value)}`;

export function formatIndicatorValue(
  indicator: CompositionIndicator,
  value: number,
): string {
  return withUnit(formatNumber(value), INDICATOR_UNITS[indicator]);
}

export interface TrendDescription {
  readonly range: string;
  readonly change: string;
  readonly meta: string;
}

export function describeTrend(trend: IndicatorTrend): TrendDescription {
  const absolute = withUnit(
    formatSigned(trend.absoluteChange),
    CHANGE_UNITS[trend.indicator],
  );
  const percent =
    trend.percentChange === null
      ? ""
      : ` (${formatSigned(trend.percentChange)} %)`;
  return {
    range: `${formatIndicatorValue(trend.indicator, trend.fromValue)} → ${formatIndicatorValue(trend.indicator, trend.toValue)}`,
    change: `${absolute}${percent}`,
    meta: `${trend.pointCount} valeurs · ${formatShortDate(trend.fromAt)} → ${formatShortDate(trend.toAt)}`,
  };
}

export function formatMeasurementSummary(
  measurement: BodyCompositionMeasurement,
): string {
  const parts: string[] = [];
  for (const indicator of COMPOSITION_INDICATORS) {
    const value = measurement[indicator];
    if (value !== null) {
      parts.push(
        `${INDICATOR_LABELS[indicator]} ${formatIndicatorValue(indicator, value)}`,
      );
    }
  }
  return parts.join(" · ");
}
