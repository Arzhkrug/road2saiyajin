import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "../theme";
import { AppText } from "./AppText";

interface PeriodSelectorProps<T extends number> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}

export function PeriodSelector<T extends number>({
  options,
  value,
  onChange,
}: PeriodSelectorProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option} jours`}
            onPress={() => {
              if (!selected) {
                Haptics.selectionAsync().catch(() => undefined);
                onChange(option);
              }
            }}
            style={[styles.option, selected && styles.optionSelected]}
          >
            <AppText
              variant="label"
              tone={selected ? "accent" : "secondary"}
              style={styles.label}
            >
              {`${option} JOURS`}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  option: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  label: {
    letterSpacing: 1,
  },
});
