import { StyleSheet, View } from "react-native";

import type {
  ConfidenceLevel,
  Recommendation,
  RecommendationAction,
} from "../domain";
import { colors, radius, spacing } from "../theme";
import { AppText } from "./AppText";
import { Card } from "./Card";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

export type LocalDecision = "accepted" | "kept";

const ACTION_LABELS: Record<RecommendationAction, string> = {
  increase: "PROGRESSER",
  maintain: "MAINTENIR",
  decrease: "ALLÉGER",
  insufficient_data: "DONNÉES INSUFFISANTES",
};

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  low: "FAIBLE",
  medium: "MOYENNE",
  high: "ÉLEVÉE",
};

interface RecommendationCardProps {
  name: string;
  recommendation: Recommendation;
  decision: LocalDecision | undefined;
  onDecide: (decision: LocalDecision) => void;
}

interface RowProps {
  label: string;
  value: string;
  accent?: boolean;
}

function Row({ label, value, accent = false }: RowProps) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="heading" tone={accent ? "accent" : "primary"}>
        {value}
      </AppText>
    </View>
  );
}

const formatTarget = (value: number | null): string =>
  value === null ? "—" : String(value);

export function RecommendationCard({
  name,
  recommendation,
  decision,
  onDecide,
}: RecommendationCardProps) {
  const { action, currentTarget, suggestedTarget, confidence, reason } =
    recommendation;
  const actionable =
    (action === "increase" || action === "decrease") &&
    suggestedTarget !== null &&
    suggestedTarget !== currentTarget;

  return (
    <Card style={styles.card}>
      <AppText variant="label" tone="accent">
        {name.toUpperCase()}
      </AppText>
      <View style={styles.rows}>
        <Row label="Cible actuelle" value={formatTarget(currentTarget)} />
        <Row
          label="Suggestion"
          value={formatTarget(suggestedTarget)}
          accent={actionable}
        />
        <Row label="Statut" value={ACTION_LABELS[action]} accent />
        <Row label="Confiance" value={CONFIDENCE_LABELS[confidence]} />
      </View>
      <AppText variant="caption" tone="secondary" style={styles.reason}>
        {reason}
      </AppText>

      {actionable && decision === undefined ? (
        <View style={styles.actions}>
          <PrimaryButton
            label="ACCEPTER"
            onPress={() => onDecide("accepted")}
          />
          <SecondaryButton
            label="GARDER LA CIBLE"
            onPress={() => onDecide("kept")}
          />
        </View>
      ) : null}

      {decision !== undefined ? (
        <View style={styles.decision}>
          <AppText variant="caption" tone="accent">
            {decision === "accepted"
              ? "Suggestion notée. Les cibles des séances ne sont pas encore modifiées automatiquement."
              : "Cible conservée."}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
  },
  rows: {
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  reason: {
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  decision: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentMuted,
  },
});
