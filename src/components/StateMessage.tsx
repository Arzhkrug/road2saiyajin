import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors, spacing } from "../theme";
import { AppText } from "./AppText";
import { SecondaryButton } from "./SecondaryButton";

interface StateMessageProps {
  kind: "loading" | "error";
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function StateMessage({
  kind,
  message,
  actionLabel,
  onAction,
}: StateMessageProps) {
  return (
    <View style={styles.container}>
      {kind === "loading" ? (
        <ActivityIndicator size="large" color={colors.accent} />
      ) : (
        <>
          <AppText variant="heading" align="center">
            {message ?? "Une erreur est survenue."}
          </AppText>
          {actionLabel !== undefined && onAction !== undefined ? (
            <SecondaryButton
              label={actionLabel}
              onPress={onAction}
              style={styles.action}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  action: {
    marginTop: spacing.lg,
    alignSelf: "stretch",
  },
});
