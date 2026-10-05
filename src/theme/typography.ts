import type { TextStyle } from "react-native";

export type TextVariant =
  | "display"
  | "title"
  | "heading"
  | "body"
  | "caption"
  | "label";

export const typography: Record<TextVariant, TextStyle> = {
  display: {
    fontSize: 46,
    lineHeight: 50,
    fontWeight: "900",
    letterSpacing: 3,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
};
