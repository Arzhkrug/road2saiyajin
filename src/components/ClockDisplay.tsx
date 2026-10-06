import { StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "../theme";
import { formatClock } from "../utils/formatTime";
import { AppText } from "./AppText";

interface ClockDisplayProps {
  ms: number;
  progress: number;
  dimmed?: boolean;
}

export function ClockDisplay({
  ms,
  progress,
  dimmed = false,
}: ClockDisplayProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <View style={styles.container}>
      <AppText
        variant="display"
        tone={dimmed ? "secondary" : "primary"}
        align="center"
        style={styles.time}
      >
        {formatClock(ms)}
      </AppText>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` as const }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.lg,
  },
  time: {
    fontSize: 88,
    lineHeight: 96,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 6,
    marginTop: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
});
