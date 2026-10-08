import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText, Card, Screen, StateMessage } from "../components";
import {
  buildHistory,
  countSessionReps,
  getSessionDurationMs,
  type ActivityHistoryItem,
  type HistoryItem,
  type WorkoutHistoryItem,
} from "../domain";
import { useAsyncLoad } from "../hooks/useAsyncLoad";
import type { RootStackScreenProps } from "../navigation/types";
import { activityRepository } from "../services/activityRepository";
import { workoutRepository } from "../services/workoutRepository";
import { spacing } from "../theme";
import {
  ACTIVITY_TYPE_LABELS,
  INTENSITY_SENTENCES,
} from "../utils/activityPresentation";
import {
  formatActivityDuration,
  formatDateTime,
  formatDuration,
} from "../utils/format";

interface HistoryData {
  items: HistoryItem[];
  templateNames: ReadonlyMap<string, string>;
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

interface SessionRowProps {
  item: WorkoutHistoryItem;
  title: string;
  onPress: () => void;
}

function SessionRow({ item, title, onPress }: SessionRowProps) {
  const { session } = item;
  const duration = getSessionDurationMs(session);
  const dateLabel = formatDateTime(item.at);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ${title} du ${dateLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <Card>
        <AppText variant="label" tone="accent">
          {`SÉANCE · ${dateLabel}`}
        </AppText>
        <AppText variant="title" style={styles.itemTitle}>
          {title}
        </AppText>
        <View style={styles.metrics}>
          <Metric value={String(countSessionReps(session))} label="reps" />
          <Metric
            value={String(session.performances.length)}
            label="performances"
          />
          <Metric
            value={duration === null ? "—" : formatDuration(duration)}
            label="durée"
          />
        </View>
      </Card>
    </Pressable>
  );
}

interface ActivityRowProps {
  item: ActivityHistoryItem;
}

function ActivityRow({ item }: ActivityRowProps) {
  const { activity } = item;
  return (
    <View style={styles.item}>
      <Card>
        <AppText variant="label" tone="accent">
          {`ACTIVITÉ · ${formatDateTime(item.at)}`}
        </AppText>
        <AppText variant="title" style={styles.itemTitle}>
          {ACTIVITY_TYPE_LABELS[activity.type]}
        </AppText>
        <View style={styles.metrics}>
          <Metric
            value={formatActivityDuration(activity.durationMinutes)}
            label="durée"
          />
          {activity.intensity !== null ? (
            <Metric
              value={INTENSITY_SENTENCES[activity.intensity]}
              label="intensité"
            />
          ) : null}
        </View>
        {activity.notes !== null ? (
          <AppText variant="caption" tone="secondary" style={styles.notes}>
            {activity.notes}
          </AppText>
        ) : null}
      </Card>
    </View>
  );
}

export function HistoryScreen({ navigation }: RootStackScreenProps<"History">) {
  const state = useAsyncLoad<HistoryData>(async () => {
    const [sessions, templates, activities] = await Promise.all([
      workoutRepository.getCompletedSessions(),
      workoutRepository.getTemplates(),
      activityRepository.getAll(),
    ]);
    return {
      items: buildHistory(sessions, activities),
      templateNames: new Map(
        templates.map((template) => [template.id, template.name] as const),
      ),
    };
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
        {state.status === "ready" && state.data.items.length === 0 ? (
          <Card>
            <AppText variant="heading">HISTORIQUE</AppText>
            <AppText variant="body" tone="secondary" style={styles.empty}>
              Aucune séance terminée ni activité pour le moment.
            </AppText>
          </Card>
        ) : null}
        {state.status === "ready"
          ? state.data.items.map((item) =>
              item.kind === "session" ? (
                <SessionRow
                  key={`session:${item.session.id}`}
                  item={item}
                  title={(
                    state.data.templateNames.get(item.session.templateId) ??
                    item.session.templateId
                  ).toUpperCase()}
                  onPress={() =>
                    navigation.navigate("SessionDetail", {
                      sessionId: item.session.id,
                    })
                  }
                />
              ) : (
                <ActivityRow key={`activity:${item.activity.id}`} item={item} />
              ),
            )
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
  notes: {
    marginTop: spacing.md,
  },
});
