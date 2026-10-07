import { StyleSheet, View } from "react-native";

import { normalizeSeries, type WeightMeasurement } from "../domain";
import { colors, radius, spacing } from "../theme";
import { formatShortDate } from "../utils/format";
import { AppText } from "./AppText";

interface WeightChartProps {
  points: readonly WeightMeasurement[];
}

const CHART_HEIGHT = 140;

export function WeightChart({ points }: WeightChartProps) {
  const ratios = normalizeSeries(points.map((point) => point.weightKg));
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <View>
      <View style={styles.plot}>
        {ratios.map((ratio, index) => (
          <View key={points[index]?.id ?? String(index)} style={styles.slot}>
            <View
              style={[
                styles.bar,
                { height: Math.max(4, Math.round(ratio * CHART_HEIGHT)) },
                index === ratios.length - 1 ? styles.barLast : null,
              ]}
            />
          </View>
        ))}
      </View>
      {first !== undefined && last !== undefined ? (
        <View style={styles.axis}>
          <AppText variant="caption" tone="secondary">
            {formatShortDate(first.recordedAt)}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {formatShortDate(last.recordedAt)}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  plot: {
    height: CHART_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  slot: {
    flex: 1,
    maxWidth: 28,
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderTopLeftRadius: radius.sm / 2,
    borderTopRightRadius: radius.sm / 2,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  barLast: {
    opacity: 1,
  },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
});
