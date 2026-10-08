import { useEffect, useState } from "react";
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
import { activityRepository } from "../services/activityRepository";
import { workoutRepository } from "../services/workoutRepository";
import { spacing } from "../theme";
import { ACTIVITY_TYPE_NAMES } from "../utils/activityPresentation";
import { formatActivityDuration, formatDayLabel } from "../utils/format";
import {
  buildExerciseNames,
  summarizeTemplate,
  type TemplateSummary,
} from "../utils/workoutPresentation";

interface SessionEntry {
  templateId: string;
  summary: TemplateSummary;
}

const noop = (): void => undefined;

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
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.sessionButton}
        >
          <PrimaryButton label="COMMENCER" onPress={noop} />
        </View>
      </Card>
    </Pressable>
  );
}

interface NavCardProps {
  title: string;
  description: string;
  detail?: string | null;
  onPress: () => void;
}

function NavCard({ title, description, detail = null, onPress }: NavCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ${title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Card>
        <View style={styles.cardRow}>
          <View style={styles.cardText}>
            <AppText variant="heading">{title}</AppText>
            <AppText variant="caption" tone="secondary">
              {description}
            </AppText>
            {detail !== null ? (
              <AppText variant="caption" tone="accent">
                {detail}
              </AppText>
            ) : null}
          </View>
          <AppText variant="title" tone="accent">
            ›
          </AppText>
        </View>
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

  /* Recharge la dernière activité à chaque retour sur le Dashboard. */
  const [focusCount, setFocusCount] = useState(0);
  useEffect(
    () =>
      navigation.addListener("focus", () =>
        setFocusCount((count) => count + 1),
      ),
    [navigation],
  );

  const lastActivity = useAsyncLoad<string | null>(async () => {
    try {
      const [latest] = await activityRepository.getRecent(1);
      if (latest === undefined) {
        return null;
      }
      return `Dernière activité : ${ACTIVITY_TYPE_NAMES[latest.type]} · ${formatActivityDuration(latest.durationMinutes)} · ${formatDayLabel(latest.startedAt, Date.now())}`;
    } catch {
      return null;
    }
  }, [focusCount]);

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
            Choisis ta séance, ou consulte ton évolution.
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

        <NavCard
          title="HISTORIQUE"
          description="Tes séances et activités"
          onPress={() => navigation.navigate("History")}
        />
        <NavCard
          title="PROGRESSION"
          description="Statistiques et poids du corps"
          onPress={() => navigation.navigate("Progression")}
        />
        <NavCard
          title="ACTIVITÉS"
          description="Boxe & activités annexes"
          detail={lastActivity.status === "ready" ? lastActivity.data : null}
          onPress={() => navigation.navigate("Activities")}
        />
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
});
