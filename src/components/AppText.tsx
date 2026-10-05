import { Text, type TextProps, type TextStyle } from "react-native";

import { colors, typography, type TextVariant } from "../theme";

type Tone = "primary" | "secondary" | "accent" | "onAccent";

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: Tone;
  align?: TextStyle["textAlign"];
}

const toneColors: Record<Tone, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  accent: colors.accent,
  onAccent: colors.onAccent,
};

export function AppText({
  variant = "body",
  tone = "primary",
  align,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color: toneColors[tone], textAlign: align },
        style,
      ]}
    />
  );
}
