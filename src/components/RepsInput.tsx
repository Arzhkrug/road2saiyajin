import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";
import { AppText } from "./AppText";
import { PrimaryButton } from "./PrimaryButton";

interface RepsInputProps {
  initialValue: number;
  onSubmit: (value: number) => void;
  submitLabel?: string;
}

const MAX_REPS = 999;

interface StepButtonProps {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

function StepButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
}: StepButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        pressed && styles.stepPressed,
        disabled && styles.stepDisabled,
      ]}
    >
      <AppText variant="title">{label}</AppText>
    </Pressable>
  );
}

export function RepsInput({
  initialValue,
  onSubmit,
  submitLabel = "VALIDER",
}: RepsInputProps) {
  const [text, setText] = useState(
    String(Math.max(0, Math.round(initialValue))),
  );
  const parsed = /^\d+$/.test(text) ? Number(text) : null;

  const adjust = (delta: number): void => {
    const next = Math.min(MAX_REPS, Math.max(0, (parsed ?? 0) + delta));
    setText(String(next));
  };

  return (
    <View>
      <AppText variant="label" tone="secondary" align="center">
        RÉALISÉ
      </AppText>
      <View style={styles.row}>
        <StepButton
          label="−"
          accessibilityLabel="Retirer une répétition"
          onPress={() => adjust(-1)}
          disabled={parsed === null || parsed <= 0}
        />
        <TextInput
          accessibilityLabel="Répétitions réalisées"
          value={text}
          onChangeText={(value) =>
            setText(value.replace(/[^0-9]/g, "").slice(0, 3))
          }
          keyboardType="number-pad"
          maxLength={3}
          selectTextOnFocus
          selectionColor={colors.accent}
          style={styles.input}
        />
        <StepButton
          label="+"
          accessibilityLabel="Ajouter une répétition"
          onPress={() => adjust(1)}
        />
      </View>
      <PrimaryButton
        label={submitLabel}
        disabled={parsed === null}
        onPress={() => {
          if (parsed !== null) {
            onSubmit(parsed);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  step: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  stepPressed: {
    opacity: 0.7,
  },
  stepDisabled: {
    opacity: 0.35,
  },
  input: {
    ...typography.display,
    flex: 1,
    color: colors.textPrimary,
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
});
