import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  completeSession,
  getElapsedMs,
  getEmomPosition,
  getEmomTotalMs,
  getOrderedBlocks,
  getPendingEmomInterval,
  reduceRun,
  restoreRun,
  type EmomBlock,
  type EmomInterval,
  type EmomPosition,
  type RunAction,
  type RunState,
  type TimerStatus,
  type WorkoutBlock,
  type WorkoutSession,
  type WorkoutTemplate,
} from "../domain";
import { workoutRepository } from "../services/workoutRepository";

const TICK_MS = 250;

export interface EmomInfo {
  block: EmomBlock;
  position: EmomPosition;
  pending: EmomInterval | null;
  status: TimerStatus;
  elapsedMs: number;
  totalMs: number;
}

export interface WorkoutRun {
  state: RunState;
  now: number;
  blocks: readonly WorkoutBlock[];
  emom: EmomInfo | null;
  saveError: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  recordEmom: (order: number, actualReps: number) => void;
  recordSet: (setNumber: number, actualReps: number) => void;
  skipRest: () => void;
  continueFlow: () => void;
  finish: () => Promise<boolean>;
}

const buzz = (run: () => Promise<void>): void => {
  run().catch(() => undefined);
};

export function useWorkoutRun(
  template: WorkoutTemplate,
  initialSession: WorkoutSession,
): WorkoutRun {
  const blocks = useMemo(() => getOrderedBlocks(template), [template]);

  const reducer = useMemo(
    () =>
      (state: RunState, action: RunAction): RunState =>
        reduceRun(template, state, action),
    [template],
  );

  const [state, dispatch] = useReducer(
    reducer,
    initialSession,
    (session: WorkoutSession) => restoreRun(template, session, Date.now()),
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const [saveError, setSaveError] = useState(false);

  const savedRef = useRef<WorkoutSession>(initialSession);
  const finishingRef = useRef(false);

  const { phase } = state;
  const hasLiveTimer =
    (phase.kind === "emom" || phase.kind === "rest") &&
    phase.timer.status === "running";

  /* Rafraîchissement : le temps réel est toujours recalculé depuis Date.now(). */
  useEffect(() => {
    if (!hasLiveTimer) {
      setNow(Date.now());
      return undefined;
    }
    const tick = (): void => {
      const current = Date.now();
      setNow(current);
      dispatch({ type: "sync", now: current });
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [hasLiveTimer]);

  /* Retour au premier plan : rattrapage immédiat depuis les timestamps. */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        const current = Date.now();
        setNow(current);
        dispatch({ type: "sync", now: current });
      }
    });
    return () => subscription.remove();
  }, []);

  /* Persistance immédiate de chaque changement de session. */
  useEffect(() => {
    const session = state.session;
    if (session === savedRef.current) {
      return;
    }
    if (
      session.status === "completed" &&
      savedRef.current.status === "completed"
    ) {
      return;
    }
    savedRef.current = session;
    workoutRepository
      .saveSession(session)
      .then(() => setSaveError(false))
      .catch(() => setSaveError(true));
  }, [state.session]);

  const emom = useMemo<EmomInfo | null>(() => {
    if (state.phase.kind !== "emom") {
      return null;
    }
    const block = blocks[state.phase.blockIndex];
    if (block === undefined || block.type !== "emom") {
      return null;
    }
    const elapsedMs = getElapsedMs(state.phase.timer, now);
    return {
      block,
      position: getEmomPosition(block.config, elapsedMs),
      pending: getPendingEmomInterval(
        block,
        state.session.performances,
        state.phase.timer,
        now,
      ),
      status: state.phase.timer.status,
      elapsedMs,
      totalMs: getEmomTotalMs(block.config),
    };
  }, [state.phase, state.session.performances, blocks, now]);

  /* Haptics : changement de minute et fin d'EMOM uniquement. */
  const emomNumber = emom === null ? null : emom.position.intervalNumber;
  const emomOver = emom !== null && emom.position.isFinished;
  const lastIntervalRef = useRef<number | null>(null);
  const overRef = useRef(false);

  useEffect(() => {
    if (
      emomNumber !== null &&
      lastIntervalRef.current !== null &&
      lastIntervalRef.current !== emomNumber
    ) {
      buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    }
    lastIntervalRef.current = emomNumber;
  }, [emomNumber]);

  useEffect(() => {
    if (emomOver && !overRef.current) {
      buzz(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
    }
    overRef.current = emomOver;
  }, [emomOver]);

  const finish = async (): Promise<boolean> => {
    if (state.session.status === "completed") {
      return true;
    }
    if (finishingRef.current) {
      return false;
    }
    finishingRef.current = true;
    const at = Date.now();
    const completed = completeSession(state.session, at);
    try {
      await workoutRepository.saveSession(completed);
      savedRef.current = completed;
      dispatch({ type: "finish", now: at });
      setSaveError(false);
      return true;
    } catch {
      setSaveError(true);
      return false;
    } finally {
      finishingRef.current = false;
    }
  };

  return {
    state,
    now,
    blocks,
    emom,
    saveError,
    start: () => dispatch({ type: "start", now: Date.now() }),
    pause: () => dispatch({ type: "pause", now: Date.now() }),
    resume: () => dispatch({ type: "resume", now: Date.now() }),
    recordEmom: (order, actualReps) =>
      dispatch({ type: "record_emom", now: Date.now(), order, actualReps }),
    recordSet: (setNumber, actualReps) =>
      dispatch({ type: "record_set", now: Date.now(), setNumber, actualReps }),
    skipRest: () => dispatch({ type: "skip_rest", now: Date.now() }),
    continueFlow: () => dispatch({ type: "continue", now: Date.now() }),
    finish,
  };
}
