import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  AppText,
  Card,
  PeriodSelector,
  PrimaryButton,
  RecommendationCard,
  Screen,
  StateMessage,
  StatTile,
  WeightChart,
  type LocalDecision,
} from "../components";
import {
  buildRecommendations,
  getWeightHistory,
  getWeightSummary,
  getWorkoutStats,
  parseWeightInput,
  PERIOD_OPTIONS,
  type PeriodDays,
  type Recommendation,
  type WeightMeasurement,
  type WorkoutSession,
  type WorkoutTemplate,
} from "../domain";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import type { RootStackScreenProps } from "../navigation/types";
import { weightRepository } from "../services/weightRepository";
import { workoutRepository } from "../services/workoutRepository";
import { colors, radius, spacing, typography } from "../theme";
import { formatDateTime, formatKg } from "../utils/format";
import {
  buildExerciseNames,
  getExerciseName,
  type ExerciseNames,
} from "../utils/workoutPresentation";

interface ProgressionData {
  sessions: WorkoutSession[];
  templates: readonly WorkoutTemplate[];
  measurements: WeightMeasurement[];
  exerciseNames: ExerciseNames;
  recommendations: Recommendation[];
}

const buzz = (run: () => Promise<void>): void => {
  run().catch(() => undefined);
};

const formatDelta = (deltaKg: number): string => {
  const sign = deltaKg > 0 ? "+" : "";
  return `${sign}${deltaKg.toFixed(1).replace(".", ",")} kg`;
};

interface ContentProps {
  data: ProgressionData;
}

function ProgressionContent({ data }: ContentProps) {
  const [measurements, setMeasurements] = useState<WeightMeasurement[]>(
    data.measurements,
  );
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [text, setText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, LocalDecision>>({});

  const stats = useMemo(
    () => getWorkoutStats(data.sessions, data.templates),
    [data.sessions, data.templates],
  );

  const visibleRecommendations = data.recommendations.filter(
    (recommendation) =>
      recommendation.action !== "insufficient_data" ||
      recommendation.metrics.sessionCount > 0,
  );

  const history = getWeightHistory(measurements, period, Date.now());
  const summary = getWeightSummary(history);
  const recent = [...measurements].reverse().slice(0, 10);

  const handleDecide = (exerciseId: string, decision: LocalDecision): void => {
    setDecisions((previous) => ({ ...previous, [exerciseId]: decision }));
    buzz(() => Haptics.selectionAsync());
  };

  const handleAdd = async (): Promise<void> => {
    if (isSaving) {
      return;
    }
    const weightKg = parseWeightInput(text);
    if (weightKg === null) {
      setFormError("Entre un poids valide, entre 20 et 500 kg (ex. 74,2).");
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      await weightRepository.addMeasurement({
        recordedAt: Date.now(),
        weightKg,
      });
      setMeasurements(await weightRepository.getMeasurements());
      setText("");
      Keyboard.dismiss();
      buzz(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
    } catch {
      setFormError("Impossible d'enregistrer la mesure. Réessaie.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await weightRepository.deleteMeasurement(id);
      setMeasurements(await weightRepository.getMeasurements());
      setFormError(null);
    } catch {
      setFormError("Impossible de supprimer la mesure. Réessaie.");
    }
  };

  const confirmDelete = (measurement: WeightMeasurement): void => {
    Alert.alert(
      "SUPPRIMER LA MESURE ?",
      `${formatKg(measurement.weightKg)} · ${formatDateTime(measurement.recordedAt)}`,
      [
        { text: "ANNULER", style: "cancel" },
        {
          text: "SUPPRIMER",
          style: "destructive",
          onPress: () => {
            void handleDelete(measurement.id);
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <AppText variant="label" tone="accent">
              Road to Saiyajin
            </AppText>
            <AppText variant="title" style={styles.headline}>
              PROGRESSION
            </AppText>
          </View>

          <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
            APERÇU
          </AppText>
          <View style={styles.tiles}>
            <StatTile
              label="séances terminées"
              value={String(stats.completedSessions)}
            />
            <StatTile label="reps totales" value={String(stats.totalReps)} />
            <StatTile
              label="performances"
              value={String(stats.totalPerformances)}
            />
          </View>
          <View style={[styles.tiles, styles.tilesSecond]}>
            <StatTile
              label="séances A / B"
              value={`${stats.sessionsByCode.A} / ${stats.sessionsByCode.B}`}
            />
            <StatTile
              label="reps par performance"
              value={String(stats.averageRepsPerPerformance).replace(".", ",")}
            />
          </View>

          <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
            RECOMMANDATIONS
          </AppText>
          {visibleRecommendations.length === 0 ? (
            <Card>
              <AppText variant="body" tone="secondary">
                Termine au moins 3 séances pour obtenir des recommandations par
                exercice.
              </AppText>
            </Card>
          ) : (
            visibleRecommendations.map((recommendation) => (
              <RecommendationCard
                key={recommendation.exerciseId}
                name={getExerciseName(
                  data.exerciseNames,
                  recommendation.exerciseId,
                )}
                recommendation={recommendation}
                decision={decisions[recommendation.exerciseId]}
                onDecide={(decision) =>
                  handleDecide(recommendation.exerciseId, decision)
                }
              />
            ))
          )}

          {stats.bestByExercise.length > 0 ? (
            <>
              <AppText
                variant="label"
                tone="secondary"
                style={styles.sectionLabel}
              >
                RECORDS PAR EXERCICE
              </AppText>
              <Card>
                {stats.bestByExercise.map((best, index) => (
                  <View
                    key={best.exerciseId}
                    style={[styles.recordRow, index > 0 && styles.recordBorder]}
                  >
                    <AppText
                      variant="heading"
                      style={styles.recordName}
                      numberOfLines={2}
                    >
                      {getExerciseName(data.exerciseNames, best.exerciseId)}
                    </AppText>
                    <AppText variant="heading" tone="accent">
                      {best.externalLoadKg > 0
                        ? `${best.actualReps} reps · +${best.externalLoadKg} kg`
                        : `${best.actualReps} reps`}
                    </AppText>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
            POIDS DU CORPS
          </AppText>
          <PeriodSelector
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
          />

          <Card style={styles.chartCard}>
            {summary === null ? (
              <AppText variant="body" tone="secondary">
                Aucune mesure sur cette période.
              </AppText>
            ) : (
              <>
                <View style={styles.summaryRow}>
                  <View>
                    <AppText variant="caption" tone="secondary">
                      Dernière mesure
                    </AppText>
                    <AppText variant="title" tone="accent">
                      {formatKg(summary.lastKg)}
                    </AppText>
                  </View>
                  <View style={styles.summaryRight}>
                    <AppText variant="caption" tone="secondary">
                      Variation
                    </AppText>
                    <AppText variant="heading">
                      {formatDelta(summary.deltaKg)}
                    </AppText>
                  </View>
                </View>
                <WeightChart points={history} />
                <AppText
                  variant="caption"
                  tone="secondary"
                  style={styles.minMax}
                >
                  {`Min ${formatKg(summary.minKg)} · Max ${formatKg(summary.maxKg)}`}
                </AppText>
              </>
            )}
          </Card>

          <Card style={styles.formCard}>
            <AppText variant="label" tone="accent">
              AJOUTER UNE MESURE
            </AppText>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Poids du corps en kilogrammes"
                value={text}
                onChangeText={(value) => {
                  setText(value.replace(/[^0-9.,]/g, "").slice(0, 5));
                  setFormError(null);
                }}
                placeholder="74,2"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                maxLength={5}
                selectionColor={colors.accent}
                style={styles.input}
              />
              <AppText variant="heading" tone="secondary">
                kg
              </AppText>
            </View>
            {formError !== null ? (
              <AppText variant="caption" tone="accent" style={styles.formError}>
                {formError}
              </AppText>
            ) : null}
            <PrimaryButton
              label={isSaving ? "ENREGISTREMENT…" : "ENREGISTRER"}
              onPress={() => {
                void handleAdd();
              }}
              disabled={isSaving}
            />
          </Card>

          {recent.length > 0 ? (
            <>
              <AppText
                variant="label"
                tone="secondary"
                style={styles.sectionLabel}
              >
                DERNIÈRES MESURES
              </AppText>
              <Card>
                {recent.map((measurement, index) => (
                  <View
                    key={measurement.id}
                    style={[styles.recordRow, index > 0 && styles.recordBorder]}
                  >
                    <View style={styles.recordName}>
                      <AppText variant="heading">
                        {formatKg(measurement.weightKg)}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        {formatDateTime(measurement.recordedAt)}
                      </AppText>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Supprimer cette mesure"
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function ProgressionScreen({
  navigation,
}: RootStackScreenProps<"Progression">) {
  const state = useAsyncLoad<ProgressionData>(async () => {
    const [sessions, templates, measurements, exercises] = await Promise.all([
      workoutRepository.getCompletedSessions(),
      workoutRepository.getTemplates(),
      weightRepository.getMeasurements(),
      workoutRepository.getExercises(),
    ]);
    return {
      sessions,
      templates,
      measurements,
      exerciseNames: buildExerciseNames(exercises),
      recommendations: buildRecommendations({
        sessions,
        templates,
        exercises,
        now: Date.now(),
      }),
    };
  }, []);

  if (state.status === "loading") {
    return (
      <Screen>
        <StateMessage kind="loading" />
      </Screen>
    );
  }

  if (state.status === "error") {
    return (
      <Screen>
        <StateMessage
          kind="error"
          message="Impossible de charger la progression."
          actionLabel="RETOUR"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return <ProgressionContent data={state.data} />;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.md,
  },
  headline: {
    marginTop: spacing.xs,
  },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  tiles: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  tilesSecond: {
    marginTop: spacing.sm,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  recordBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recordName: {
    flex: 1,
    marginRight: spacing.md,
  },
  chartCard: {
    marginTop: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.md,
  },
  summaryRight: {
    alignItems: "flex-end",
  },
  minMax: {
    marginTop: spacing.sm,
  },
  formCard: {
    marginTop: spacing.md,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  input: {
    ...typography.title,
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  formError: {
    marginBottom: spacing.md,
  },
});
