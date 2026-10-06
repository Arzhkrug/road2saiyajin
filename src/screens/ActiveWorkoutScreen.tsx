import { ScrollView, StyleSheet, View } from "react-native";

import {
  AppText,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StateMessage,
  WorkoutBlockCard,
  WorkoutHeader,
} from "../components";
import {
  getOrderedBlocks,
  type WorkoutSession,
  type WorkoutTemplate,
} from "../domain";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import type { RootStackScreenProps } from "../navigation/types";
import { workoutRepository } from "../services/workoutRepository";
import { spacing } from "../theme";
import {
  buildExerciseNames,
  SESSION_STATUS_LABELS,
  WORKOUT_FOCUS_LABELS,
  type ExerciseNames,
} from "../utils/workoutPresentation";

interface ActiveData {
  session: WorkoutSession;
  template: WorkoutTemplate;
  exerciseNames: ExerciseNames;
}

interface TimerSlotProps {
  onLeave: () => void;
}

function TimerSlot({ onLeave }: TimerSlotProps) {
  return (
    <View style={styles.footer}>
      <AppText
        variant="caption"
        tone="secondary"
        align="center"
        style={styles.footnote}
      >
        La séance est enregistrée. Tu peux la quitter sans la perdre.
      </AppText>
      <PrimaryButton
        label="TIMER BIENTÔT DISPONIBLE"
        onPress={onLeave}
        disabled
      />
      <SecondaryButton
        label="RETOUR AU DASHBOARD"
        onPress={onLeave}
        style={styles.leave}
      />
    </View>
  );
}

export function ActiveWorkoutScreen({
  navigation,
  route,
}: RootStackScreenProps<"ActiveWorkout">) {
  const { sessionId } = route.params;

  const state = useAsyncLoad<ActiveData>(async () => {
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

  const leave = (): void => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace("Dashboard");
    }
  };

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
          actionLabel="RETOUR AU DASHBOARD"
          onAction={leave}
        />
      </Screen>
    );
  }

  const { session, template, exerciseNames } = state.data;
  const [currentBlock, ...nextBlocks] = getOrderedBlocks(template);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WorkoutHeader
          title={template.name.toUpperCase()}
          focus={WORKOUT_FOCUS_LABELS[template.code]}
          badge={SESSION_STATUS_LABELS[session.status]}
        />

        {currentBlock !== undefined ? (
          <WorkoutBlockCard
            block={currentBlock}
            position={1}
            exerciseNames={exerciseNames}
            highlighted
            style={styles.block}
          />
        ) : null}

        {nextBlocks.length > 0 ? (
          <>
            <AppText variant="label" tone="secondary" style={styles.nextLabel}>
              ENSUITE
            </AppText>
            {nextBlocks.map((block, index) => (
              <WorkoutBlockCard
                key={block.id}
                block={block}
                position={index + 2}
                exerciseNames={exerciseNames}
                style={styles.block}
              />
            ))}
          </>
        ) : null}
      </ScrollView>

      <TimerSlot onLeave={leave} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  block: {
    marginBottom: spacing.md,
  },
  nextLabel: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  footnote: {
    marginBottom: spacing.md,
  },
  leave: {
    marginTop: spacing.sm,
  },
});
