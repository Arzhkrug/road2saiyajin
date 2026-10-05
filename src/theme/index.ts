import { colors, gradients } from "./colors";
import { radius } from "./radius";
import { spacing } from "./spacing";
import { typography } from "./typography";

export type { TextVariant } from "./typography";

export { colors, gradients, radius, spacing, typography };

export const theme = {
  colors,
  gradients,
  radius,
  spacing,
  typography,
} as const;
