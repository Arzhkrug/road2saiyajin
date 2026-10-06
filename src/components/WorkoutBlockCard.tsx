import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { WorkoutBlock } from "../domain";
import { colors, spacing } from "../theme";
import {
  getEmomRounds,
  getExerciseName,
  type ExerciseNames,
} from "../utils/workoutPresentation";
import { AppText } from "./AppText";
import { Card } from "./Card";

interface WorkoutBlockCardProps {
  block: WorkoutBlock;
  position: number;
  exerciseNames: ExerciseNames;
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface ExerciseRowProps {
  index: string;
  name: string;
  value: string;
}

function ExerciseRow({ index, name, value }: ExerciseRowProps) {
  return (
    <View style={styles.row}>
      <AppText variant="label" tone="secondary" style={styles.rowIndex}>
        {index}
      </AppText>
      <AppText variant="heading" numberOfLines={2} style={styles.rowName}>
        {name}
      </AppText>
      <AppText variant="title" tone="accent">
        {value}
      </AppText>
    </View>
  );
}

export function WorkoutBlockCard({
  block,
  position,
  exerciseNames,
  highlighted = false,
  style,
}: WorkoutBlockCardProps) {
  const cardStyle = [highlighted && styles.highlighted, style];

  switch (block.type) {
    case "emom": {
      const { config } = block;
      const rounds = getEmomRounds(config);
      return (
        <Card style={cardStyle}>
          <AppText variant="label" tone="accent">
            {`BLOC ${position} · EMOM`}
          </AppText>
          <AppText variant="title" style={styles.blockTitle}>
            {`${config.totalMinutes} MIN EMOM`}
          </AppText>
          {config.rotation.map((movement, index) => (
            <ExerciseRow
              key={`${movement.exerciseId}-${index}`}
              index={String(index + 1).padStart(2, "0")}
              name={getExerciseName(
                exerciseNames,
                movement.exerciseId,
              ).toUpperCase()}
              value={`× ${movement.targetReps}`}
            />
          ))}
          <AppText variant="caption" tone="secondary" style={styles.footnote}>
            {`${rounds} alternances · ${
              config.intervalSeconds === 60
                ? "une série chaque minute"
                : `une série toutes les ${config.intervalSeconds} s`
            }`}
          </AppText>
        </Card>
      );
    }
    case "straight_sets": {
      const { config } = block;
      const loadLabel =
        config.targetExternalLoadKg !== null
          ? ` · +${config.targetExternalLoadKg} kg`
          : "";
      return (
        <Card style={cardStyle}>
          <AppText variant="label" tone="accent">
            {`EXERCICE ${position}`}
          </AppText>
          <AppText variant="heading" style={styles.blockTitle}>
            {getExerciseName(exerciseNames, block.exerciseId).toUpperCase()}
          </AppText>
          <AppText variant="display" tone="accent" style={styles.setsValue}>
            {`${config.sets} × ${config.targetReps}`}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {`Repos ${config.restSeconds} s${loadLabel}`}
          </AppText>
        </Card>
      );
    }
  }
}

const styles = StyleSheet.create({
  highlighted: {
    borderColor: colors.accent,
  },
  blockTitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowIndex: {
    width: 32,
    letterSpacing: 1,
  },
  rowName: {
    flex: 1,
    marginRight: spacing.md,
  },
  footnote: {
    marginTop: spacing.sm,
  },
  setsValue: {
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
});
