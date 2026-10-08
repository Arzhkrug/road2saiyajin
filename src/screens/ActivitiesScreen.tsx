import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  ActivityCard,
  ActivityForm,
  AppText,
  Card,
  Screen,
  SecondaryButton,
  StateMessage,
  type ActivityFormValues,
} from "../components";
import type { Activity } from "../domain";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import type { RootStackScreenProps } from "../navigation/types";
import { activityRepository } from "../services/activityRepository";
import { spacing } from "../theme";
import { ACTIVITY_TYPE_LABELS } from "../utils/activityPresentation";
import { formatActivityDuration, formatDayLabel } from "../utils/format";

const RECENT_LIMIT = 50;

const buzz = (run: () => Promise<void>): void => {
  run().catch(() => undefined);
};

interface ContentProps {
  initial: Activity[];
}

function ActivitiesContent({ initial }: ContentProps) {
  const [activities, setActivities] = useState<Activity[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const now = Date.now();

  const handleAdd = async (values: ActivityFormValues): Promise<void> => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSubmitError(null);
    try {
      const at = Date.now();
      await activityRepository.add({
        type: "boxing",
        startedAt: at,
        durationMinutes: values.durationMinutes,
        intensity: values.intensity,
        notes: values.notes,
        createdAt: at,
      });
      setActivities(await activityRepository.getRecent(RECENT_LIMIT));
      setShowForm(false);
      buzz(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
    } catch {
      setSubmitError("Impossible d'enregistrer l'activité. Réessaie.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await activityRepository.delete(id);
      setActivities(await activityRepository.getRecent(RECENT_LIMIT));
      setListError(null);
    } catch {
      setListError("Impossible de supprimer l'activité. Réessaie.");
    }
  };

  const confirmDelete = (activity: Activity): void => {
    Alert.alert(
      "SUPPRIMER L'ACTIVITÉ ?",
      `${ACTIVITY_TYPE_LABELS[activity.type]} · ${formatDayLabel(activity.startedAt, Date.now())} · ${formatActivityDuration(activity.durationMinutes)}`,
      [
        { text: "ANNULER", style: "cancel" },
        {
          text: "SUPPRIMER",
          style: "destructive",
          onPress: () => {
            void handleDelete(activity.id);
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
              ACTIVITÉS
            </AppText>
          </View>

          {showForm ? (
            <>
              <ActivityForm
                onSubmit={(values) => {
                  void handleAdd(values);
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
                style={styles.cancel}
              />
            </>
          ) : (
            <SecondaryButton
              label="+ AJOUTER UNE ACTIVITÉ"
              onPress={() => setShowForm(true)}
              style={styles.add}
            />
          )}

          {listError !== null ? (
            <AppText variant="caption" tone="accent" style={styles.listError}>
              {listError}
            </AppText>
          ) : null}

          <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
            RÉCENTES
          </AppText>
          {activities.length === 0 ? (
            <Card>
              <AppText variant="body" tone="secondary">
                Aucune activité enregistrée pour le moment.
              </AppText>
            </Card>
          ) : (
            activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                now={now}
                onDelete={confirmDelete}
              />
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function ActivitiesScreen({
  navigation,
}: RootStackScreenProps<"Activities">) {
  const state = useAsyncLoad<Activity[]>(
    () => activityRepository.getRecent(RECENT_LIMIT),
    [],
  );

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
          message="Impossible de charger les activités."
          actionLabel="RETOUR"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return <ActivitiesContent initial={state.data} />;
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
    marginBottom: spacing.lg,
  },
  headline: {
    marginTop: spacing.xs,
  },
  add: {
    alignSelf: "stretch",
  },
  cancel: {
    alignSelf: "stretch",
  },
  listError: {
    marginTop: spacing.sm,
  },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
