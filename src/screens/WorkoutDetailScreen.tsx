import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import {
  AppText,
  PrimaryButton,
  Screen,
  StateMessage,
  WorkoutBlockCard,
  WorkoutHeader,
} from "../components";
import {
  createInProgressSession,
  getOrderedBlocks,
  type WorkoutSessionId,
  type WorkoutTemplate,
} from "../domain";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import type { RootStackScreenProps } from "../navigation/types";
import { workoutRepository } from "../services/workoutRepository";
import { spacing } from "../theme";
import {
  buildExerciseNames,
  WORKOUT_FOCUS_LABELS,
  type ExerciseNames,
} from "../utils/workoutPresentation";

interface DetailData {
  template: WorkoutTemplate;
  exerciseNames: ExerciseNames;
}

interface WorkoutDetailContentProps extends DetailData {
  onStarted: (sessionId: WorkoutSessionId) => void;
}

function WorkoutDetailContent({
  template,
  exerciseNames,
  onStarted,
}: WorkoutDetailContentProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);

  const handleStart = async (): Promise<void> => {
    if (isStarting) {
      return;
    }
    setIsStarting(true);
    setStartFailed(false);
    try {
      const session = createInProgressSession({
        templateId: template.id,
        now: Date.now(),
        bodyweightKg: null,
      });
      await workoutRepository.saveSession(session);
      onStarted(session.id);
    } catch {
      setStartFailed(true);
      setIsStarting(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WorkoutHeader
          title={template.name.toUpperCase()}
          focus={WORKOUT_FOCUS_LABELS[template.code]}
        />
        {getOrderedBlocks(template).map((block, index) => (
          <WorkoutBlockCard
            key={block.id}
            block={block}
            position={index + 1}
            exerciseNames={exerciseNames}
            style={styles.block}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {startFailed ? (
          <AppText
            variant="caption"
            tone="accent"
            align="center"
            style={styles.error}
          >
            Impossible de démarrer la séance. Réessaie.
          </AppText>
        ) : null}
        <PrimaryButton
          label={isStarting ? "DÉMARRAGE…" : "COMMENCER LA SÉANCE"}
          onPress={() => {
            void handleStart();
          }}
          disabled={isStarting}
        />
      </View>
    </Screen>
  );
}

export function WorkoutDetailScreen({
  navigation,
  route,
}: RootStackScreenProps<"WorkoutDetail">) {
  const { templateId } = route.params;

  const state = useAsyncLoad<DetailData>(async () => {
    const template = await workoutRepository.getTemplate(templateId);
    if (template === null) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    const exercises = await workoutRepository.getExercises();
    return { template, exerciseNames: buildExerciseNames(exercises) };
  }, [templateId]);

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

  return (
    <WorkoutDetailContent
      template={state.data.template}
      exerciseNames={state.data.exerciseNames}
      onStarted={(sessionId) =>
        navigation.replace("ActiveWorkout", { sessionId })
      }
    />
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  block: {
    marginBottom: spacing.md,
  },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  error: {
    marginBottom: spacing.sm,
  },
});
