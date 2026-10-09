import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";

import {
  COMPOSITION_INDICATORS,
  getAllTrends,
  getLatestValues,
  mapIndicators,
  parseIndicatorInput,
  PERIOD_OPTIONS,
  sortCompositionMeasurements,
  type BodyCompositionMeasurement,
  type CompositionIndicator,
  type PeriodDays,
} from "../domain";
import { colors, radius, spacing, typography } from "../theme";
import {
  describeTrend,
  formatIndicatorValue,
  formatMeasurementSummary,
  INDICATOR_LABELS,
  INDICATOR_UNITS,
} from "../utils/compositionPresentation";
import { formatDate, formatDateTime } from "../utils/format";
import { AppText } from "./AppText";
import { Card } from "./Card";
import { PeriodSelector } from "./PeriodSelector";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

export type CompositionFormValues = Record<CompositionIndicator, number | null>;

const RECENT_LIMIT = 10;

const buzz = (run: () => Promise<void>): void => {
  run().catch(() => undefined);
};

interface FormProps {
  onSubmit: (values: CompositionFormValues) => void;
  isSaving: boolean;
  submitError: string | null;
}

function CompositionForm({ onSubmit, isSaving, submitError }: FormProps) {
  const [texts, setTexts] = useState<Record<CompositionIndicator, string>>(() =>
    mapIndicators(() => ""),
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (): void => {
    const values = mapIndicators<number | null>(() => null);
    const invalid: CompositionIndicator[] = [];
    let present = 0;
    for (const indicator of COMPOSITION_INDICATORS) {
      const parsed = parseIndicatorInput(indicator, texts[indicator]);
      if (parsed.kind === "invalid") {
        invalid.push(indicator);
      } else if (parsed.kind === "value") {
        values[indicator] = parsed.value;
        present += 1;
      }
    }
    if (invalid.length > 0) {
      setError(
        `Valeur invalide : ${invalid.map((indicator) => INDICATOR_LABELS[indicator]).join(", ")}. Une décimale maximale, valeur plausible.`,
      );
      return;
    }
    if (present === 0) {
      setError("Renseigne au moins un indicateur.");
      return;
    }
    setError(null);
    onSubmit(values);
  };

  return (
    <Card style={styles.formCard}>
      <AppText variant="label" tone="accent">
        NOUVELLE MESURE
      </AppText>
      <AppText variant="caption" tone="secondary" style={styles.formHint}>
        Remplis uniquement ce que ta balance affiche. Les champs vides restent «
        non renseigné ».
      </AppText>
      {COMPOSITION_INDICATORS.map((indicator) => (
        <View key={indicator} style={styles.fieldRow}>
          <AppText variant="caption" tone="secondary" style={styles.fieldLabel}>
            {INDICATOR_LABELS[indicator]}
          </AppText>
          <View style={styles.inputWrap}>
            <TextInput
              accessibilityLabel={INDICATOR_LABELS[indicator]}
              value={texts[indicator]}
              onChangeText={(value) => {
                setTexts((previous) => ({
                  ...previous,
                  [indicator]: value.replace(/[^0-9.,]/g, "").slice(0, 5),
                }));
                setError(null);
              }}
              placeholder="—"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              maxLength={5}
              selectionColor={colors.accent}
              style={styles.input}
            />
            <AppText variant="caption" tone="secondary" style={styles.unit}>
              {INDICATOR_UNITS[indicator]}
            </AppText>
          </View>
        </View>
      ))}
      {error !== null || submitError !== null ? (
        <AppText variant="caption" tone="accent" style={styles.formError}>
          {error ?? submitError}
        </AppText>
      ) : null}
      <PrimaryButton
        label={isSaving ? "ENREGISTREMENT…" : "ENREGISTRER"}
        onPress={handleSubmit}
        disabled={isSaving}
      />
    </Card>
  );
}

interface SectionProps {
  measurements: readonly BodyCompositionMeasurement[];
  now: number;
  onAdd: (values: CompositionFormValues) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function BodyCompositionSection({
  measurements,
  now,
  onAdd,
  onDelete,
}: SectionProps) {
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const latest = getLatestValues(measurements);
  const trends = getAllTrends(measurements, period, now);
  const recent = sortCompositionMeasurements(measurements)
    .reverse()
    .slice(0, RECENT_LIMIT);

  const handleSubmit = async (values: CompositionFormValues): Promise<void> => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSubmitError(null);
    try {
      await onAdd(values);
      setShowForm(false);
      buzz(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
    } catch {
      setSubmitError("Impossible d'enregistrer la mesure. Réessaie.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (measurement: BodyCompositionMeasurement): void => {
    Alert.alert(
      "SUPPRIMER LA MESURE ?",
      `${formatDateTime(measurement.recordedAt)}\n${formatMeasurementSummary(measurement)}`,
      [
        { text: "ANNULER", style: "cancel" },
        {
          text: "SUPPRIMER",
          style: "destructive",
          onPress: () => {
            onDelete(measurement.id)
              .then(() => setListError(null))
              .catch(() =>
                setListError("Impossible de supprimer la mesure. Réessaie."),
              );
          },
        },
      ],
    );
  };

  return (
    <View>
      <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
        COMPOSITION CORPORELLE
      </AppText>

      <Card>
        <AppText variant="label" tone="accent">
          DERNIÈRES VALEURS
        </AppText>
        {COMPOSITION_INDICATORS.map((indicator, index) => {
          const point = latest[indicator];
          return (
            <View
              key={indicator}
              style={[styles.row, index > 0 && styles.rowBorder]}
            >
              <AppText
                variant="heading"
                style={styles.rowLabel}
                numberOfLines={2}
              >
                {INDICATOR_LABELS[indicator]}
              </AppText>
              {point === null ? (
                <AppText variant="caption" tone="secondary">
                  Non renseigné
                </AppText>
              ) : (
                <View style={styles.rowValue}>
                  <AppText variant="heading" tone="accent">
                    {formatIndicatorValue(indicator, point.value)}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {formatDate(point.recordedAt)}
                  </AppText>
                </View>
              )}
            </View>
          );
        })}
        <AppText variant="caption" tone="secondary" style={styles.note}>
          Valeurs d'impédancemétrie indicatives, sans interprétation de santé.
        </AppText>
      </Card>

      {showForm ? (
        <>
          <CompositionForm
            onSubmit={(values) => {
              void handleSubmit(values);
            }}
            isSaving={isSaving}
            submitError={submitError}
          />
          <SecondaryButton
            label="ANNULER"
            onPress={() => {
              setShowForm(false);
              setSubmitError(null);
            }}
            disabled={isSaving}
            style={styles.stretch}
          />
        </>
      ) : (
        <SecondaryButton
          label="+ AJOUTER UNE MESURE"
          onPress={() => setShowForm(true)}
          style={styles.addButton}
        />
      )}

      <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
        TENDANCES
      </AppText>
      <PeriodSelector
        options={PERIOD_OPTIONS}
        value={period}
        onChange={setPeriod}
      />
      <Card style={styles.trendCard}>
        {COMPOSITION_INDICATORS.map((indicator, index) => {
          const trend = trends[indicator];
          const description = trend === null ? null : describeTrend(trend);
          return (
            <View
              key={indicator}
              style={[styles.trendRow, index > 0 && styles.rowBorder]}
            >
              <AppText variant="heading">{INDICATOR_LABELS[indicator]}</AppText>
              {description === null ? (
                <AppText variant="caption" tone="secondary">
                  Moins de 2 valeurs sur cette période.
                </AppText>
              ) : (
                <>
                  <AppText variant="body">{description.range}</AppText>
                  <AppText variant="caption" tone="accent">
                    {description.change}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {description.meta}
                  </AppText>
                </>
              )}
            </View>
          );
        })}
      </Card>

      {listError !== null ? (
        <AppText variant="caption" tone="accent" style={styles.note}>
          {listError}
        </AppText>
      ) : null}

      {recent.length > 0 ? (
        <>
          <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
            MESURES ENREGISTRÉES
          </AppText>
          <Card>
            {recent.map((measurement, index) => (
              <View
                key={measurement.id}
                style={[styles.row, index > 0 && styles.rowBorder]}
              >
                <View style={styles.rowLabel}>
                  <AppText variant="caption" tone="secondary">
                    {formatDateTime(measurement.recordedAt)}
                  </AppText>
                  <AppText variant="body">
                    {formatMeasurementSummary(measurement)}
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer cette mesure de composition"
                  hitSlop={12}
                  onPress={() => confirmDelete(measurement)}
                >
                  <AppText variant="label" tone="secondary">
                    SUPPRIMER
                  </AppText>
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowValue: {
    alignItems: "flex-end",
  },
  note: {
    marginTop: spacing.sm,
  },
  addButton: {
    alignSelf: "stretch",
    marginTop: spacing.md,
  },
  stretch: {
    alignSelf: "stretch",
  },
  formCard: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  formHint: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  fieldLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  inputWrap: {
    width: 120,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  input: {
    ...typography.heading,
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    textAlign: "right",
  },
  unit: {
    width: 24,
    marginLeft: spacing.xs,
  },
  formError: {
    marginVertical: spacing.sm,
  },
  trendCard: {
    marginTop: spacing.md,
  },
  trendRow: {
    paddingVertical: spacing.sm,
    gap: spacing.xs / 2,
  },
});
