import { StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "../theme";
import { AppText } from "./AppText";

interface WorkoutHeaderProps {
  title: string;
  focus: string;
  badge?: string;
}

export function WorkoutHeader({ title, focus, badge }: WorkoutHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <AppText variant="label" tone="accent" style={styles.focus}>
          {focus}
        </AppText>
        {badge !== undefined ? (
          <View style={styles.badge}>
            <AppText variant="caption" tone="accent">
              {badge}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText
        variant="display"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={styles.title}
      >
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  focus: {
    flex: 1,
    marginRight: spacing.md,
  },
  badge: {
    backgroundColor: colors.accentMuted,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md - 4,
  },
  title: {
    fontSize: 40,
    lineHeight: 44,
  },
});
