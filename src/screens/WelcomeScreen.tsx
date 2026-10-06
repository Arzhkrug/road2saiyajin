import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { AppText, HeroPlaceholder, PrimaryButton, Screen } from "../components";
import type { RootStackScreenProps } from "../navigation/types";
import { spacing } from "../theme";

export function WelcomeScreen({ navigation }: RootStackScreenProps<"Welcome">) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Screen>
      <Animated.View
        style={[styles.content, { opacity, transform: [{ translateY }] }]}
      >
        <View style={styles.heroWrapper}>
          <HeroPlaceholder style={styles.hero} />
        </View>

        <View style={styles.titleBlock}>
          <AppText variant="label" tone="secondary" align="center">
            Road to
          </AppText>
          <AppText variant="display" tone="accent" align="center">
            SAIYAJIN
          </AppText>
          <AppText
            variant="body"
            tone="secondary"
            align="center"
            style={styles.tagline}
          >
            Train. Track. Evolve.
          </AppText>
        </View>

        <PrimaryButton
          label="COMMENCER"
          onPress={() => navigation.navigate("Dashboard")}
          style={styles.button}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heroWrapper: {
    flex: 1,
    justifyContent: "center",
  },
  hero: {
    aspectRatio: 1,
    maxHeight: "100%",
  },
  titleBlock: {
    alignItems: "center",
    marginVertical: spacing.xl,
  },
  tagline: {
    marginTop: spacing.sm,
    letterSpacing: 1.5,
  },
  button: {
    alignSelf: "stretch",
  },
});
