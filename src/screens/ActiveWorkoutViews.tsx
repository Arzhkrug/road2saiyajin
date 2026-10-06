import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import {
  AppText,
  Card,
  ClockDisplay,
  PrimaryButton,
  RepsInput,
  SecondaryButton,
  WorkoutBlockCard,
} from "../components";
import {
  getEmomIntervalCount,
  getRemainingMs,
  type EmomBlock,
  type EmomInterval,
  type StraightSetsBlock,
  type WorkoutTemplate,
} from "../domain";
import type { EmomInfo, WorkoutRun } from "../hooks/useWorkoutRun";
import { spacing } from "../theme";
import { padTwo } from "../utils/formatTime";
import {
  getExerciseName,
  type ExerciseNames,
} from "../utils/workoutPresentation";

interface PhaseLayoutProps {
  children: ReactNode;
  footer?: ReactNode;
}

function PhaseLayout({ children, footer }: PhaseLayoutProps) {
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer !== undefined ? (
        <View style={styles.footer}>{footer}</View>
      ) : null}
    </>
  );
}

interface PendingInputProps {
  interval: EmomInterval;
  exerciseNames: ExerciseNames;
  onSubmit: (order: number, actualReps: number) => void;
}

function PendingInput({
  interval,
  exerciseNames,
  onSubmit,
}: PendingInputProps) {
  return (
    <Card style={styles.inputCard}>
      <AppText variant="label" tone="accent">
        {`SAISIE · MINUTE ${padTwo(interval.intervalNumber)}`}
      </AppText>
      <AppText variant="caption" tone="secondary" style={styles.inputCaption}>
        {`${getExerciseName(exerciseNames, interval.exerciseId)} · cible ${interval.targetReps} reps`}
      </AppText>
      <RepsInput
        key={`emom-${interval.intervalNumber}`}
        initialValue={interval.targetReps}
        onSubmit={(value) => onSubmit(interval.intervalNumber, value)}
      />
    </Card>
  );
}

interface PausedNoticeProps {
  align?: "center";
}

function PausedNotice({ align = "center" }: PausedNoticeProps) {
  return (
    <View style={styles.paused}>
      <AppText variant="title" tone="accent" align={align}>
        PAUSE
      </AppText>
      <AppText variant="caption" tone="secondary" align={align}>
        La séance est en pause
      </AppText>
    </View>
  );
}

/* ---------- Intro EMOM ---------- */

interface IntroViewProps {
  run: WorkoutRun;
  block: EmomBlock;
  position: number;
  exerciseNames: ExerciseNames;
}

function IntroView({ run, block, position, exerciseNames }: IntroViewProps) {
  return (
    <PhaseLayout
      footer={<PrimaryButton label="DÉMARRER L'EMOM" onPress={run.start} />}
    >
      <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
        PRÊT ?
      </AppText>
      <WorkoutBlockCard
        block={block}
        position={position}
        exerciseNames={exerciseNames}
        highlighted
      />
    </PhaseLayout>
  );
}

/* ---------- EMOM ---------- */

interface EmomViewProps {
  run: WorkoutRun;
  info: EmomInfo;
  exerciseNames: ExerciseNames;
}

function EmomView({ run, info, exerciseNames }: EmomViewProps) {
  const { position, pending, status } = info;
  const total = position.totalIntervals;

  if (position.isFinished) {
    return (
      <PhaseLayout
        footer={
          <PrimaryButton
            label="CONTINUER"
            disabled={pending !== null}
            onPress={run.continueFlow}
          />
        }
      >
        <AppText variant="label" tone="accent">
          EMOM TERMINÉ
        </AppText>
        <AppText variant="display" style={styles.bigValue}>
          {`${total} / ${total}`}
        </AppText>
        <AppText variant="heading">minutes</AppText>
        <AppText variant="body" tone="secondary" style={styles.message}>
          {pending === null
            ? "Toutes les performances sont enregistrées."
            : "Saisis les dernières minutes pour continuer."}
        </AppText>
        {pending !== null ? (
          <PendingInput
            interval={pending}
            exerciseNames={exerciseNames}
            onSubmit={run.recordEmom}
          />
        ) : null}
      </PhaseLayout>
    );
  }

  const paused = status === "paused";
  const movement = position.movement;
  const progress = info.totalMs > 0 ? info.elapsedMs / info.totalMs : 1;

  return (
    <PhaseLayout
      footer={
        paused ? (
          <PrimaryButton label="REPRENDRE" onPress={run.resume} />
        ) : (
          <SecondaryButton label="PAUSE" onPress={run.pause} />
        )
      }
    >
      <View style={styles.minuteRow}>
        <AppText variant="label" tone="secondary">
          MINUTE
        </AppText>
        <AppText variant="heading" tone="accent">
          {`${padTwo(position.intervalNumber)} / ${padTwo(total)}`}
        </AppText>
      </View>

      {movement !== null ? (
        <>
          <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
            EXERCICE
          </AppText>
          <AppText variant="title">
            {getExerciseName(exerciseNames, movement.exerciseId).toUpperCase()}
          </AppText>
          <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
            CIBLE
          </AppText>
          <AppText variant="display" tone="accent">
            {`${movement.targetReps} reps`}
          </AppText>
        </>
      ) : null}

      <ClockDisplay
        ms={position.intervalRemainingMs}
        progress={progress}
        dimmed={paused}
      />

      {paused ? <PausedNotice /> : null}

      {pending !== null ? (
        <PendingInput
          interval={pending}
          exerciseNames={exerciseNames}
          onSubmit={run.recordEmom}
        />
      ) : null}
    </PhaseLayout>
  );
}

/* ---------- Série ---------- */

interface SetViewProps {
  run: WorkoutRun;
  block: StraightSetsBlock;
  setNumber: number;
  exerciseNames: ExerciseNames;
}

function SetView({ run, block, setNumber, exerciseNames }: SetViewProps) {
  const { config } = block;
  const load =
    config.targetExternalLoadKg !== null
      ? ` · +${config.targetExternalLoadKg} kg`
      : "";

  return (
    <PhaseLayout>
      <AppText variant="label" tone="accent">
        {`SÉRIE ${setNumber} / ${config.sets}`}
      </AppText>
      <AppText variant="title" style={styles.sectionLabel}>
        {getExerciseName(exerciseNames, block.exerciseId).toUpperCase()}
      </AppText>
      <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
        CIBLE
      </AppText>
      <AppText variant="display" tone="accent">
        {String(config.targetReps)}
      </AppText>
      <AppText variant="caption" tone="secondary" style={styles.message}>
        {`reps${load}`}
      </AppText>
      <Card style={styles.inputCard}>
        <RepsInput
          key={`set-${block.id}-${setNumber}`}
          initialValue={config.targetReps}
          onSubmit={(value) => run.recordSet(setNumber, value)}
        />
      </Card>
    </PhaseLayout>
  );
}

/* ---------- Repos ---------- */

interface RestViewProps {
  run: WorkoutRun;
  block: StraightSetsBlock;
  nextSetNumber: number;
  timerPaused: boolean;
  remainingMs: number;
  durationMs: number;
  exerciseNames: ExerciseNames;
}

function RestView({
  run,
  block,
  nextSetNumber,
  timerPaused,
  remainingMs,
  durationMs,
  exerciseNames,
}: RestViewProps) {
  const progress = durationMs > 0 ? 1 - remainingMs / durationMs : 1;

  return (
    <PhaseLayout
      footer={
        <>
          {timerPaused ? (
            <PrimaryButton label="REPRENDRE" onPress={run.resume} />
          ) : (
            <SecondaryButton label="PAUSE" onPress={run.pause} />
          )}
          <SecondaryButton label="PASSER LE REPOS" onPress={run.skipRest} />
        </>
      }
    >
      <AppText variant="label" tone="accent">
        REPOS
      </AppText>
      <ClockDisplay ms={remainingMs} progress={progress} dimmed={timerPaused} />
      {timerPaused ? <PausedNotice /> : null}
      <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
        PROCHAINE SÉRIE
      </AppText>
      <AppText variant="title">{`${nextSetNumber} / ${block.config.sets}`}</AppText>
      <AppText variant="body" tone="secondary">
        {getExerciseName(exerciseNames, block.exerciseId)}
      </AppText>
    </PhaseLayout>
  );
}

/* ---------- Fin de séance ---------- */

interface FinishedViewProps {
  run: WorkoutRun;
  template: WorkoutTemplate;
  exerciseNames: ExerciseNames;
  onFinish: () => void;
}

function FinishedView({
  run,
  template,
  exerciseNames,
  onFinish,
}: FinishedViewProps) {
  const { performances } = run.state.session;

  return (
    <PhaseLayout footer={<PrimaryButton label="TERMINER" onPress={onFinish} />}>
      <AppText variant="label" tone="accent">
        SÉANCE TERMINÉE
      </AppText>
      <AppText variant="display" style={styles.sectionLabel}>
        {template.name.toUpperCase()}
      </AppText>
      <Card style={styles.inputCard}>
        {run.blocks.map((block) => {
          const recorded = performances.filter(
            (entry) => entry.blockId === block.id,
          ).length;
          const label =
            block.type === "emom"
              ? "EMOM"
              : getExerciseName(exerciseNames, block.exerciseId).toUpperCase();
          const value =
            block.type === "emom"
              ? `${recorded} / ${getEmomIntervalCount(block.config)} min`
              : `${recorded} / ${block.config.sets} séries`;
          return (
            <View key={block.id} style={styles.summaryRow}>
              <AppText variant="heading" style={styles.summaryLabel}>
                {label}
              </AppText>
              <AppText variant="heading" tone="accent">
                {value}
              </AppText>
            </View>
          );
        })}
      </Card>
      <AppText variant="body" tone="secondary" style={styles.message}>
        {`${performances.length} performances enregistrées.`}
      </AppText>
    </PhaseLayout>
  );
}

/* ---------- Dispatcher de phases ---------- */

interface ActiveRunViewProps {
  run: WorkoutRun;
  template: WorkoutTemplate;
  exerciseNames: ExerciseNames;
  onFinish: () => void;
}

export function ActiveRunView({
  run,
  template,
  exerciseNames,
  onFinish,
}: ActiveRunViewProps) {
  const { phase } = run.state;

  switch (phase.kind) {
    case "block_intro": {
      const block = run.blocks[phase.blockIndex];
      if (block === undefined || block.type !== "emom") {
        return null;
      }
      return (
        <IntroView
          run={run}
          block={block}
          position={phase.blockIndex + 1}
          exerciseNames={exerciseNames}
        />
      );
    }
    case "emom":
      return run.emom === null ? null : (
        <EmomView run={run} info={run.emom} exerciseNames={exerciseNames} />
      );
    case "set": {
      const block = run.blocks[phase.blockIndex];
      if (block === undefined || block.type !== "straight_sets") {
        return null;
      }
      return (
        <SetView
          run={run}
          block={block}
          setNumber={phase.setNumber}
          exerciseNames={exerciseNames}
        />
      );
    }
    case "rest": {
      const block = run.blocks[phase.blockIndex];
      if (block === undefined || block.type !== "straight_sets") {
        return null;
      }
      return (
        <RestView
          run={run}
          block={block}
          nextSetNumber={phase.nextSetNumber}
          timerPaused={phase.timer.status === "paused"}
          remainingMs={getRemainingMs(phase.timer, run.now)}
          durationMs={phase.timer.durationMs}
          exerciseNames={exerciseNames}
        />
      );
    }
    case "finished":
      return (
        <FinishedView
          run={run}
          template={template}
          exerciseNames={exerciseNames}
          onFinish={onFinish}
        />
      );
  }
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  message: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  bigValue: {
    marginTop: spacing.sm,
  },
  minuteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  paused: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  inputCard: {
    marginTop: spacing.md,
  },
  inputCaption: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
});
