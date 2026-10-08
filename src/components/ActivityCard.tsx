import { Pressable, StyleSheet, View } from "react-native";

import type { Activity } from "../domain";
import { spacing } from "../theme";
import {
  ACTIVITY_TYPE_LABELS,
  INTENSITY_SENTENCES,
} from "../utils/activityPresentation";
import { formatActivityDuration, formatDayLabel } from "../utils/format";
import { AppText } from "./AppText";
import { Card } from "./Card";

interface ActivityCardProps {
  activity: Activity;
  now: number;
  onDelete: (activity: Activity) => void;
}

export function ActivityCard({ activity, now, onDelete }: ActivityCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.text}>
          <AppText variant="heading">
            {ACTIVITY_TYPE_LABELS[activity.type]}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {`${formatDayLabel(activity.startedAt, now)} · ${formatActivityDuration(activity.durationMinutes)}`}
          </AppText>
          {activity.intensity !== null ? (
            <AppText variant="caption" tone="accent">
              {INTENSITY_SENTENCES[activity.intensity]}
            </AppText>
          ) : null}
          {activity.notes !== null ? (
            <AppText variant="caption" tone="secondary">
              {activity.notes}
            </AppText>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Supprimer cette activité"
          hitSlop={12}
          onPress={() => onDelete(activity)}
        >
          <AppText variant="label" tone="secondary">
            SUPPRIMER
          </AppText>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  text: {
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
});
