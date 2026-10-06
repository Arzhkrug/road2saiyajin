import {
  createPausedTimerAt,
  createTimer,
  getElapsedMs,
  pauseTimer,
  resumeTimer,
  startTimer,
  syncTimer,
  type CountdownTimer,
} from "../timer/countdown";
import {
  findNextUnrecordedInterval,
  getEmomIntervalMs,
  getEmomPosition,
  getEmomTotalMs,
} from "../timer/emomClock";
import { isNonNegativeInteger } from "../validation";
import { getEmomIntervalCount, getOrderedBlocks } from "./blocks";
import { completeSession, recordPerformance } from "./sessions";
import type {
  EmomBlock,
  EmomInterval,
  EpochMs,
  PerformanceEntry,
  StraightSetsBlock,
  WorkoutBlock,
  WorkoutSession,
  WorkoutTemplate,
} from "./types";

export type RunPhase =
  | { readonly kind: "block_intro"; readonly blockIndex: number }
  | {
      readonly kind: "emom";
      readonly blockIndex: number;
      readonly timer: CountdownTimer;
    }
  | {
      readonly kind: "set";
      readonly blockIndex: number;
      readonly setNumber: number;
    }
  | {
      readonly kind: "rest";
      readonly blockIndex: number;
      readonly nextSetNumber: number;
      readonly timer: CountdownTimer;
    }
  | { readonly kind: "finished" };

export interface RunState {
  readonly session: WorkoutSession;
  readonly phase: RunPhase;
}

export type RunAction =
  | { readonly type: "start"; readonly now: EpochMs }
  | { readonly type: "sync"; readonly now: EpochMs }
  | { readonly type: "pause"; readonly now: EpochMs }
  | { readonly type: "resume"; readonly now: EpochMs }
  | {
      readonly type: "record_emom";
      readonly now: EpochMs;
      readonly order: number;
      readonly actualReps: number;
    }
  | {
      readonly type: "record_set";
      readonly now: EpochMs;
      readonly setNumber: number;
      readonly actualReps: number;
    }
  | { readonly type: "skip_rest"; readonly now: EpochMs }
  | { readonly type: "continue"; readonly now: EpochMs }
  | { readonly type: "finish"; readonly now: EpochMs };

const recordedOrders = (
  performances: readonly PerformanceEntry[],
  blockId: string,
): Set<number> =>
  new Set(
    performances
      .filter((entry) => entry.blockId === blockId)
      .map((entry) => entry.order),
  );

const firstMissingOrder = (
  recorded: ReadonlySet<number>,
  total: number,
): number | null => {
  for (let order = 1; order <= total; order += 1) {
    if (!recorded.has(order)) {
      return order;
    }
  }
  return null;
};

const emomBlockAt = (
  blocks: readonly WorkoutBlock[],
  index: number,
): EmomBlock | null => {
  const block = blocks[index];
  return block !== undefined && block.type === "emom" ? block : null;
};

const setsBlockAt = (
  blocks: readonly WorkoutBlock[],
  index: number,
): StraightSetsBlock | null => {
  const block = blocks[index];
  return block !== undefined && block.type === "straight_sets" ? block : null;
};

function derivePhaseFrom(
  blocks: readonly WorkoutBlock[],
  performances: readonly PerformanceEntry[],
  fromIndex: number,
  now: EpochMs,
): RunPhase {
  for (let index = fromIndex; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block === undefined) {
      continue;
    }
    const recorded = recordedOrders(performances, block.id);

    if (block.type === "emom") {
      const first = firstMissingOrder(
        recorded,
        getEmomIntervalCount(block.config),
      );
      if (first === null) {
        continue;
      }
      if (recorded.size === 0) {
        return { kind: "block_intro", blockIndex: index };
      }
      return {
        kind: "emom",
        blockIndex: index,
        timer: createPausedTimerAt(
          getEmomTotalMs(block.config),
          (first - 1) * getEmomIntervalMs(block.config),
          now,
        ),
      };
    }

    const first = firstMissingOrder(recorded, block.config.sets);
    if (first === null) {
      continue;
    }
    return { kind: "set", blockIndex: index, setNumber: first };
  }
  return { kind: "finished" };
}

export function restoreRun(
  template: WorkoutTemplate,
  session: WorkoutSession,
  now: EpochMs,
): RunState {
  if (session.status === "completed") {
    return { session, phase: { kind: "finished" } };
  }
  return {
    session,
    phase: derivePhaseFrom(
      getOrderedBlocks(template),
      session.performances,
      0,
      now,
    ),
  };
}

export function getPendingEmomInterval(
  block: EmomBlock,
  performances: readonly PerformanceEntry[],
  timer: CountdownTimer,
  now: EpochMs,
): EmomInterval | null {
  const position = getEmomPosition(block.config, getElapsedMs(timer, now));
  return findNextUnrecordedInterval(
    block.config,
    recordedOrders(performances, block.id),
    position.startedIntervals,
  );
}

const restOrNextSet = (
  blockIndex: number,
  nextSetNumber: number,
  restSeconds: number,
  now: EpochMs,
): RunPhase =>
  restSeconds > 0
    ? {
        kind: "rest",
        blockIndex,
        nextSetNumber,
        timer: startTimer(createTimer(restSeconds * 1000), now),
      }
    : { kind: "set", blockIndex, setNumber: nextSetNumber };

export function reduceRun(
  template: WorkoutTemplate,
  state: RunState,
  action: RunAction,
): RunState {
  const blocks = getOrderedBlocks(template);
  const { session, phase } = state;

  switch (action.type) {
    case "start": {
      if (phase.kind !== "block_intro") {
        return state;
      }
      const block = emomBlockAt(blocks, phase.blockIndex);
      if (block === null) {
        return state;
      }
      const timer = startTimer(
        createTimer(getEmomTotalMs(block.config)),
        action.now,
      );
      return {
        session,
        phase: { kind: "emom", blockIndex: phase.blockIndex, timer },
      };
    }

    case "sync": {
      if (phase.kind === "emom") {
        const timer = syncTimer(phase.timer, action.now);
        return timer === phase.timer
          ? state
          : { session, phase: { ...phase, timer } };
      }
      if (phase.kind === "rest") {
        const timer = syncTimer(phase.timer, action.now);
        if (timer.status === "completed") {
          return {
            session,
            phase: {
              kind: "set",
              blockIndex: phase.blockIndex,
              setNumber: phase.nextSetNumber,
            },
          };
        }
        return timer === phase.timer
          ? state
          : { session, phase: { ...phase, timer } };
      }
      return state;
    }

    case "pause": {
      if (phase.kind === "emom" || phase.kind === "rest") {
        const timer = pauseTimer(phase.timer, action.now);
        return timer === phase.timer
          ? state
          : { session, phase: { ...phase, timer } };
      }
      return state;
    }

    case "resume": {
      if (phase.kind === "emom" || phase.kind === "rest") {
        const timer = resumeTimer(phase.timer, action.now);
        return timer === phase.timer
          ? state
          : { session, phase: { ...phase, timer } };
      }
      return state;
    }

    case "record_emom": {
      if (phase.kind !== "emom" || !isNonNegativeInteger(action.actualReps)) {
        return state;
      }
      const block = emomBlockAt(blocks, phase.blockIndex);
      if (block === null) {
        return state;
      }
      const timer = syncTimer(phase.timer, action.now);
      const pending = getPendingEmomInterval(
        block,
        session.performances,
        timer,
        action.now,
      );
      if (pending === null || pending.intervalNumber !== action.order) {
        return state;
      }
      return {
        session: recordPerformance(session, {
          blockId: block.id,
          blockType: "emom",
          exerciseId: pending.exerciseId,
          order: pending.intervalNumber,
          targetReps: pending.targetReps,
          actualReps: action.actualReps,
          externalLoadKg: 0,
          now: action.now,
        }),
        phase: { ...phase, timer },
      };
    }

    case "record_set": {
      if (
        phase.kind !== "set" ||
        phase.setNumber !== action.setNumber ||
        !isNonNegativeInteger(action.actualReps)
      ) {
        return state;
      }
      const block = setsBlockAt(blocks, phase.blockIndex);
      if (block === null) {
        return state;
      }
      const nextSession = recordPerformance(session, {
        blockId: block.id,
        blockType: "straight_sets",
        exerciseId: block.exerciseId,
        order: phase.setNumber,
        targetReps: block.config.targetReps,
        actualReps: action.actualReps,
        externalLoadKg: block.config.targetExternalLoadKg ?? 0,
        now: action.now,
      });
      if (phase.setNumber < block.config.sets) {
        return {
          session: nextSession,
          phase: restOrNextSet(
            phase.blockIndex,
            phase.setNumber + 1,
            block.config.restSeconds,
            action.now,
          ),
        };
      }
      return {
        session: nextSession,
        phase: derivePhaseFrom(
          blocks,
          nextSession.performances,
          phase.blockIndex + 1,
          action.now,
        ),
      };
    }

    case "skip_rest": {
      if (phase.kind !== "rest") {
        return state;
      }
      return {
        session,
        phase: {
          kind: "set",
          blockIndex: phase.blockIndex,
          setNumber: phase.nextSetNumber,
        },
      };
    }

    case "continue": {
      if (phase.kind !== "emom") {
        return state;
      }
      const block = emomBlockAt(blocks, phase.blockIndex);
      if (block === null) {
        return state;
      }
      const timer = syncTimer(phase.timer, action.now);
      if (
        timer.status !== "completed" ||
        getPendingEmomInterval(
          block,
          session.performances,
          timer,
          action.now,
        ) !== null
      ) {
        return state;
      }
      return {
        session,
        phase: derivePhaseFrom(
          blocks,
          session.performances,
          phase.blockIndex + 1,
          action.now,
        ),
      };
    }

    case "finish": {
      if (phase.kind !== "finished") {
        return state;
      }
      const completed = completeSession(session, action.now);
      return completed === session ? state : { session: completed, phase };
    }
  }
}
