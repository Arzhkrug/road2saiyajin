import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, gradients, radius } from "../theme";
import { AppText } from "./AppText";

interface HeroPlaceholderProps {
  style?: StyleProp<ViewStyle>;
}

const RING_SIZES = [140, 230, 320] as const;

export function HeroPlaceholder({ style }: HeroPlaceholderProps) {
  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={gradients.heroGlow}
        style={StyleSheet.absoluteFill}
      />
      {RING_SIZES.map((size) => (
        <View
          key={size}
          style={[
            styles.ring,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        />
      ))}
      <LinearGradient
        colors={gradients.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.core}
      >
        <AppText variant="title" tone="onAccent">
          R2S
        </AppText>
      </LinearGradient>
      <LinearGradient colors={gradients.fadeToBackground} style={styles.fade} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  core: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
  },
});
