import { useEffect, useRef } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { AppText, Screen, StateMessage } from "../components";
import type { WorkoutSession, WorkoutTemplate } from "../domain";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import { useWorkoutRun } from "../hooks/useWorkoutRun";
import type { RootStackScreenProps } from "../navigation/types";
import { workoutRepository } from "../services/workoutRepository";
import { spacing } from "../theme";
import {
  buildExerciseNames,
  type ExerciseNames,
} from "../utils/workoutPresentation";
import { ActiveRunView } from "./ActiveWorkoutViews";

type ActiveWorkoutNavigation =
  RootStackScreenProps<"ActiveWorkout">["navigation"];

interface ActiveData {
  session: WorkoutSession;
  template: WorkoutTemplate;
  exerciseNames: ExerciseNames;
}

interface ActiveWorkoutContentProps extends ActiveData {
  navigation: ActiveWorkoutNavigation;
}

function ActiveWorkoutContent({
  navigation,
  session,
  template,
  exerciseNames,
}: ActiveWorkoutContentProps) {
  const run = useWorkoutRun(template, session);
  const allowLeaveRef = useRef(false);
  const sessionStatus = run.state.session.status;

  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (allowLeaveRef.current || sessionStatus === "completed") {
        return;
      }
      event.preventDefault();
      Alert.alert("QUITTER LA SÉANCE ?", "Ta séance en cours sera conservée.", [
        { text: "ANNULER", style: "cancel" },
        {
          text: "QUITTER",
          onPress: () => {
            allowLeaveRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });
  }, [navigation, sessionStatus]);

  const handleFinish = async (): Promise<void> => {
    const saved = await run.finish();
    if (!saved) {
      return;
    }
    allowLeaveRef.current = true;
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace("Dashboard");
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quitter la séance"
            hitSlop={12}
            onPress={() => navigation.goBack()}
          >
            <AppText variant="label" tone="secondary">
              ‹ QUITTER
            </AppText>
          </Pressable>
          <AppText variant="label" tone="accent">
            {template.name.toUpperCase()}
          </AppText>
        </View>

        {run.saveError ? (
          <AppText
            variant="caption"
            tone="accent"
            align="center"
            style={styles.saveError}
          >
            Sauvegarde impossible pour le moment. Nouvelle tentative à la
            prochaine saisie.
          </AppText>
        ) : null}

        <ActiveRunView
          run={run}
          template={template}
          exerciseNames={exerciseNames}
          onFinish={() => {
            void handleFinish();
          }}
        />
      </KeyboardAvoidingView>
    </Screen>
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

  return (
    <ActiveWorkoutContent
      navigation={navigation}
      session={state.data.session}
      template={state.data.template}
      exerciseNames={state.data.exerciseNames}
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.md,
  },
  saveError: {
    marginTop: spacing.sm,
  },
});
