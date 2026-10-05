import { ScrollView, StyleSheet, View } from "react-native";

import { AppText, Card, Screen } from "../components";
import type { RootStackScreenProps } from "../navigation/types";
import { colors, radius, spacing } from "../theme";

interface DashboardItem {
  key: string;
  title: string;
  description: string;
}

const DASHBOARD_ITEMS: readonly DashboardItem[] = [
  {
    key: "session-a",
    title: "SESSION A",
    description: "Entraînement du haut du corps",
  },
  {
    key: "session-b",
    title: "SESSION B",
    description: "Entraînement du bas du corps",
  },
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

export function DashboardScreen(_props: RootStackScreenProps<"Dashboard">) {
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
            Ton centre de commandement arrive. Les fonctionnalités seront
            débloquées étape par étape.
          </AppText>
        </View>

        {DASHBOARD_ITEMS.map((item) => (
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
