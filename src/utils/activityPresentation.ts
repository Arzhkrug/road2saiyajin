import type { ActivityIntensity, ActivityType } from "../domain";

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  boxing: "🥊 BOXE",
};

export const ACTIVITY_TYPE_NAMES: Record<ActivityType, string> = {
  boxing: "🥊 Boxe",
};

export const INTENSITY_LABELS: Record<ActivityIntensity, string> = {
  low: "FAIBLE",
  medium: "MOYENNE",
  high: "ÉLEVÉE",
};

export const INTENSITY_SENTENCES: Record<ActivityIntensity, string> = {
  low: "Intensité faible",
  medium: "Intensité moyenne",
  high: "Intensité élevée",
};
