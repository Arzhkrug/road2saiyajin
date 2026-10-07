import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, spacing } from "../theme";
import { AppText } from "./AppText";

interface StatTileProps {
  label: string;
  value: string;
  style?: StyleProp<ViewStyle>;
}

export function StatTile({ label, value, style }: StatTileProps) {
  return (
    <View style={[styles.tile, style]}>
      <AppText
        variant="title"
        tone="accent"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary" numberOfLines={2}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
