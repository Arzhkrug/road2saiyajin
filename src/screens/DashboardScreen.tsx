import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  AppText,
  Card,
  PrimaryButton,
  Screen,
  StateMessage,
} from "../components";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import type { RootStackScreenProps } from "../navigation/types";
import { workoutRepository } from "../services/workoutRepository";
import { colors, radius, spacing } from "../theme";
import {
  buildExerciseNames,
  summarizeTemplate,
  type TemplateSummary,
} from "../utils/workoutPresentation";

interface SessionEntry {
  templateId: string;
  summary: TemplateSummary;
}

interface ComingSoonItem {
  key: string;
  title: string;
  description: string;
}

const COMING_SOON_ITEMS: readonly ComingSoonItem[] = [
  {
    key: "progression",
    title: "PROGRESSION",
    description: "Suivi de ton évolution",
  },
  {
    key: "activities",
    title: "ACTIVITÉS",
    description: "Cardio et activités annexes",
  },
];

interface SessionCardProps {
  summary: TemplateSummary;
  onPress: () => void;
}

function SessionCard({ summary, onPress }: SessionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ${summary.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Card>
        <AppText variant="label" tone="accent">
          {summary.focus}
        </AppText>
        <AppText variant="title" style={styles.sessionTitle}>
          {summary.title}
        </AppText>
        <AppText variant="heading">{summary.headline}</AppText>
        {summary.movements !== "" ? (
          <AppText variant="caption" tone="secondary" style={styles.detail}>
            {summary.movements}
          </AppText>
        ) : null}
        {summary.extraLabel !== null ? (
          <AppText variant="caption" tone="secondary">
            {summary.extraLabel}
          </AppText>
        ) : null}
        <PrimaryButton
          label="COMMENCER"
          onPress={onPress}
          style={styles.sessionButton}
        />
      </Card>
    </Pressable>
  );
}

export function DashboardScreen({
  navigation,
}: RootStackScreenProps<"Dashboard">) {
  const state = useAsyncLoad<SessionEntry[]>(async () => {
    const [templates, exercises] = await Promise.all([
      workoutRepository.getTemplates(),
      workoutRepository.getExercises(),
    ]);
    const names = buildExerciseNames(exercises);
    return templates.map((template) => ({
      templateId: template.id,
      summary: summarizeTemplate(template, names),
    }));
  }, []);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText variant="label" tone="accent">
            Road to Saiyajin
          </AppText>
          <AppText variant="title" style={styles.headline}>
            Prêt à progresser ?
          </AppText>
          <AppText variant="body" tone="secondary">
            Choisis ta séance. Le reste du centre de commandement arrive étape
            par étape.
          </AppText>
        </View>

        {state.status === "loading" ? <StateMessage kind="loading" /> : null}
        {state.status === "error" ? (
          <StateMessage
            kind="error"
            message="Impossible de charger les séances."
          />
        ) : null}
        {state.status === "ready"
          ? state.data.map((entry) => (
              <SessionCard
                key={entry.templateId}
                summary={entry.summary}
                onPress={() =>
                  navigation.navigate("WorkoutDetail", {
                    templateId: entry.templateId,
                  })
                }
              />
            ))
          : null}

        {COMING_SOON_ITEMS.map((item) => (
          <Card key={item.key} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.cardText}>
                <AppText variant="heading">{item.title}</AppText>
                <AppText variant="caption" tone="secondary">
                  {item.description}
                </AppText>
              </View>
              <View style={styles.badge}>
                <AppText variant="caption" tone="accent">
                  Bientôt disponible
                </AppText>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  headline: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  card: {
    marginBottom: spacing.md,
  },
  cardPressed: {
    opacity: 0.9,
  },
  sessionTitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  detail: {
    marginTop: spacing.xs,
  },
  sessionButton: {
    marginTop: spacing.lg,
    alignSelf: "stretch",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardText: {
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  badge: {
    backgroundColor: colors.accentMuted,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md - 4,
  },
});
