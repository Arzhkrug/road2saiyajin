export const colors = {
  background: "#0A0A0C",
  surface: "#14141A",
  surfaceElevated: "#1C1C24",
  border: "#2A2A33",
  textPrimary: "#F5F5F7",
  textSecondary: "#8E8E99",
  accent: "#F5A623",
  accentStrong: "#FF7A1A",
  accentMuted: "rgba(245, 166, 35, 0.14)",
  onAccent: "#0A0A0C",
} as const;

export const gradients = {
  accent: [colors.accent, colors.accentStrong],
  heroGlow: ["#2B1B09", "#120D08", colors.background],
  fadeToBackground: ["rgba(10, 10, 12, 0)", colors.background],
} as const;
