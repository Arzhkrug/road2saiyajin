import { ScrollView, StyleSheet, View } from "react-native";

import {
  AppText,
  Card,
  Screen,
  StateMessage,
  WorkoutHeader,
} from "../components";
import {
  countSessionReps,
  getOrderedBlocks,
  getSessionDurationMs,
  type PerformanceEntry,
  type WorkoutBlock,
  type WorkoutSession,
  type WorkoutTemplate,
} from "../domain";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import type { RootStackScreenProps } from "../navigation/types";
import { workoutRepository } from "../services/workoutRepository";
import { colors, spacing } from "../theme";
import { formatDateTime, formatDuration, formatKg } from "../utils/format";
import {
  buildExerciseNames,
  getExerciseName,
  SESSION_STATUS_LABELS,
  WORKOUT_FOCUS_LABELS,
  type ExerciseNames,
} from "../utils/workoutPresentation";

interface DetailData {
  session: WorkoutSession;
  template: WorkoutTemplate;
  exerciseNames: ExerciseNames;
}

interface SummaryRowProps {
  label: string;
  value: string;
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <View style={styles.summaryRow}>
      <AppText variant="label" tone="secondary">
        {label}
      </AppText>
      <AppText variant="heading" tone="accent">
        {value}
      </AppText>
    </View>
  );
}

interface PerformanceRowProps {
  title: string;
  entry: PerformanceEntry;
}

function PerformanceRow({ title, entry }: PerformanceRowProps) {
  const load = entry.externalLoadKg > 0 ? ` · +${entry.externalLoadKg} kg` : "";
  return (
    <View style={styles.row}>
      <AppText variant="heading">{title}</AppText>
      <AppText variant="caption" tone="secondary">
        {`${entry.targetReps} cible → ${entry.actualReps} réalisé${load}`}
      </AppText>
    </View>
  );
}

interface BlockSectionProps {
  block: WorkoutBlock;
  position: number;
  performances: readonly PerformanceEntry[];
  exerciseNames: ExerciseNames;
}

function BlockSection({
  block,
  position,
  performances,
  exerciseNames,
}: BlockSectionProps) {
  const entries = performances
    .filter((entry) => entry.blockId === block.id)
    .sort((a, b) => a.order - b.order);

  const heading =
    block.type === "emom"
      ? `BLOC ${position} · EMOM`
      : `EXERCICE ${position} · ${getExerciseName(exerciseNames, block.exerciseId).toUpperCase()}`;

  return (
    <Card style={styles.block}>
      <AppText variant="label" tone="accent">
        {heading}
      </AppText>
      {entries.length === 0 ? (
        <AppText variant="caption" tone="secondary" style={styles.none}>
          Aucune performance enregistrée.
        </AppText>
      ) : (
        entries.map((entry) => (
          <PerformanceRow
            key={entry.id}
            title={
              block.type === "emom"
                ? `Minute ${entry.order} — ${getExerciseName(exerciseNames, entry.exerciseId)}`
                : `Série ${entry.order}`
            }
            entry={entry}
          />
        ))
      )}
    </Card>
  );
}

export function SessionDetailScreen({
  navigation,
  route,
}: RootStackScreenProps<"SessionDetail">) {
  const { sessionId } = route.params;

  const state = useAsyncLoad<DetailData>(async () => {
    const session = await workoutRepository.getSession(sessionId);
    if (session === null) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const template = await workoutRepository.getTemplate(session.templateId);
    if (template === null) {
      throw new Error(`Unknown template: ${session.templateId}`);
    }
    const exercises = await workoutRepository.getExercises();
    return { session, template, exerciseNames: buildExerciseNames(exercises) };
  }, [sessionId]);

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
          message="Impossible de charger cette séance."
          actionLabel="RETOUR"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const { session, template, exerciseNames } = state.data;
  const duration = getSessionDurationMs(session);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WorkoutHeader
          title={template.name.toUpperCase()}
          focus={formatDateTime(
            session.completedAt ?? session.startedAt ?? session.createdAt,
          )}
          badge={SESSION_STATUS_LABELS[session.status]}
        />

        <Card style={styles.block}>
          <SummaryRow
            label="POIDS DU CORPS"
            value={formatKg(session.bodyweightKg)}
          />
          <SummaryRow
            label="DURÉE"
            value={duration === null ? "—" : formatDuration(duration)}
          />
          <SummaryRow
            label="REPS TOTALES"
            value={String(countSessionReps(session))}
          />
          <AppText variant="caption" tone="secondary" style={styles.focus}>
            {WORKOUT_FOCUS_LABELS[template.code]}
          </AppText>
        </Card>

        {getOrderedBlocks(template).map((block, index) => (
          <BlockSection
            key={block.id}
            block={block}
            position={index + 1}
            performances={session.performances}
            exerciseNames={exerciseNames}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  block: {
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs + 2,
  },
  focus: {
    marginTop: spacing.sm,
  },
  row: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    gap: spacing.xs / 2,
  },
  none: {
    marginTop: spacing.sm,
  },
});
