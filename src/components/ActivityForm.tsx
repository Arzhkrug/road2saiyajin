import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import {
  ACTIVITY_INTENSITIES,
  MAX_ACTIVITY_DURATION_MINUTES,
  MAX_ACTIVITY_NOTES_LENGTH,
  parseDurationInput,
  type ActivityIntensity,
} from "../domain";
import { colors, radius, spacing, typography } from "../theme";
import {
  ACTIVITY_TYPE_LABELS,
  INTENSITY_LABELS,
} from "../utils/activityPresentation";
import { AppText } from "./AppText";
import { Card } from "./Card";
import { PrimaryButton } from "./PrimaryButton";

export interface ActivityFormValues {
  durationMinutes: number;
  intensity: ActivityIntensity | null;
  notes: string;
}

interface ActivityFormProps {
  onSubmit: (values: ActivityFormValues) => void;
  isSaving: boolean;
  submitError: string | null;
}

const DEFAULT_DURATION = "60";

export function ActivityForm({
  onSubmit,
  isSaving,
  submitError,
}: ActivityFormProps) {
  const [durationText, setDurationText] = useState(DEFAULT_DURATION);
  const [intensity, setIntensity] = useState<ActivityIntensity | null>(null);
  const [notes, setNotes] = useState("");
  const [durationError, setDurationError] = useState<string | null>(null);

  const handleSubmit = (): void => {
    const durationMinutes = parseDurationInput(durationText);
    if (durationMinutes === null) {
      setDurationError(
        `Entre une durée entière entre 1 et ${MAX_ACTIVITY_DURATION_MINUTES} min.`,
      );
      return;
    }
    setDurationError(null);
    onSubmit({ durationMinutes, intensity, notes });
  };

  const toggleIntensity = (value: ActivityIntensity): void => {
    Haptics.selectionAsync().catch(() => undefined);
    setIntensity((current) => (current === value ? null : value));
  };

  return (
    <Card style={styles.card}>
      <AppText variant="label" tone="accent">
        {ACTIVITY_TYPE_LABELS.boxing}
      </AppText>

      <AppText variant="caption" tone="secondary" style={styles.fieldLabel}>
        Durée
      </AppText>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel="Durée en minutes"
          value={durationText}
          onChangeText={(value) => {
            setDurationText(value.replace(/[^0-9]/g, "").slice(0, 3));
            setDurationError(null);
          }}
          keyboardType="number-pad"
          maxLength={3}
          selectTextOnFocus
          selectionColor={colors.accent}
          style={styles.durationInput}
        />
        <AppText variant="heading" tone="secondary">
          min
        </AppText>
      </View>
      {durationError !== null ? (
        <AppText variant="caption" tone="accent" style={styles.error}>
          {durationError}
        </AppText>
      ) : null}

      <AppText variant="caption" tone="secondary" style={styles.fieldLabel}>
        Intensité (facultatif)
      </AppText>
      <View style={styles.chips}>
        {ACTIVITY_INTENSITIES.map((value) => {
          const selected = intensity === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Intensité ${INTENSITY_LABELS[value].toLowerCase()}`}
              onPress={() => toggleIntensity(value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <AppText
                variant="label"
                tone={selected ? "accent" : "secondary"}
                style={styles.chipLabel}
              >
                {INTENSITY_LABELS[value]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText variant="caption" tone="secondary" style={styles.fieldLabel}>
        Note (facultatif)
      </AppText>
      <TextInput
        accessibilityLabel="Note facultative"
        value={notes}
        onChangeText={setNotes}
        placeholder="Sparring, sac, pads…"
        placeholderTextColor={colors.textSecondary}
        maxLength={MAX_ACTIVITY_NOTES_LENGTH}
        selectionColor={colors.accent}
        style={styles.notesInput}
      />

      {submitError !== null ? (
        <AppText variant="caption" tone="accent" style={styles.error}>
          {submitError}
        </AppText>
      ) : null}

      <PrimaryButton
        label={isSaving ? "ENREGISTREMENT…" : "ENREGISTRER"}
        onPress={handleSubmit}
        disabled={isSaving}
        style={styles.submit}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  durationInput: {
    ...typography.title,
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  chips: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  chipLabel: {
    letterSpacing: 1,
  },
  notesInput: {
    ...typography.body,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  error: {
    marginTop: spacing.sm,
  },
  submit: {
    marginTop: spacing.lg,
  },
});
