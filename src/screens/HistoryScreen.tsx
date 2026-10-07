import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Card, Screen, StateMessage } from "../components";
import { countSessionReps, getSessionDurationMs } from "../domain";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import type { RootStackScreenProps } from "../navigation/types";
import { workoutRepository } from "../services/workoutRepository";
import { spacing } from "../theme";
import { formatDateTime, formatDuration } from "../utils/format";

interface HistoryItem {
  sessionId: string;
  title: string;
  dateLabel: string;
  durationLabel: string;
  performanceCount: number;
  totalReps: number;
}

interface MetricProps {
  value: string;
  label: string;
}

function Metric({ value, label }: MetricProps) {
  return (
    <View style={styles.metric}>
      <AppText variant="heading" tone="accent">
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

export function HistoryScreen({ navigation }: RootStackScreenProps<"History">) {
  const state = useAsyncLoad<HistoryItem[]>(async () => {
    const [sessions, templates] = await Promise.all([
      workoutRepository.getCompletedSessions(),
      workoutRepository.getTemplates(),
    ]);
    return sessions.map((session) => {
      const template = templates.find((item) => item.id === session.templateId);
      const duration = getSessionDurationMs(session);
      return {
        sessionId: session.id,
        title: (template?.name ?? session.templateId).toUpperCase(),
        dateLabel: formatDateTime(session.completedAt ?? session.createdAt),
        durationLabel: duration === null ? "—" : formatDuration(duration),
        performanceCount: session.performances.length,
        totalReps: countSessionReps(session),
      };
    });
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
            HISTORIQUE
          </AppText>
        </View>

        {state.status === "loading" ? <StateMessage kind="loading" /> : null}
        {state.status === "error" ? (
          <StateMessage
            kind="error"
            message="Impossible de charger l'historique."
          />
        ) : null}
        {state.status === "ready" && state.data.length === 0 ? (
          <Card>
            <AppText variant="heading">HISTORIQUE</AppText>
            <AppText variant="body" tone="secondary" style={styles.empty}>
              Aucune séance terminée pour le moment.
            </AppText>
          </Card>
        ) : null}
        {state.status === "ready"
          ? state.data.map((item) => (
              <Pressable
                key={item.sessionId}
                accessibilityRole="button"
                accessibilityLabel={`Ouvrir ${item.title} du ${item.dateLabel}`}
                onPress={() =>
                  navigation.navigate("SessionDetail", {
                    sessionId: item.sessionId,
                  })
                }
                style={({ pressed }) => [
                  styles.item,
                  pressed && styles.pressed,
                ]}
              >
                <Card>
                  <AppText variant="label" tone="accent">
                    {item.dateLabel}
                  </AppText>
                  <AppText variant="title" style={styles.itemTitle}>
                    {item.title}
                  </AppText>
                  <View style={styles.metrics}>
                    <Metric value={String(item.totalReps)} label="reps" />
                    <Metric
                      value={String(item.performanceCount)}
                      label="performances"
                    />
                    <Metric value={item.durationLabel} label="durée" />
                  </View>
                </Card>
              </Pressable>
            ))
          : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  headline: {
    marginTop: spacing.xs,
  },
  empty: {
    marginTop: spacing.sm,
  },
  item: {
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.9,
  },
  itemTitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  metrics: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  metric: {
    gap: spacing.xs / 2,
  },
});
