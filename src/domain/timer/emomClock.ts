import { getEmomIntervalCount } from "../workouts/blocks";
import type { EmomConfig, EmomInterval, EmomMovement } from "../workouts/types";
import { buildEmomSchedule } from "../workouts/blocks";

export interface EmomPosition {
  readonly totalIntervals: number;
  /** 1-based : intervalle en cours (ou dernier intervalle si terminé). */
  readonly intervalNumber: number;
  /** Nombre d'intervalles déjà démarrés (1 dès le début, total à la fin). */
  readonly startedIntervals: number;
  readonly intervalRemainingMs: number;
  readonly isFinished: boolean;
  readonly movement: EmomMovement | null;
}

export const getEmomIntervalMs = (config: EmomConfig): number =>
  config.intervalSeconds * 1000;

export const getEmomTotalMs = (config: EmomConfig): number =>
  getEmomIntervalCount(config) * getEmomIntervalMs(config);

export function getEmomPosition(
  config: EmomConfig,
  elapsedMs: number,
): EmomPosition {
  const total = getEmomIntervalCount(config);
  const intervalMs = getEmomIntervalMs(config);

  if (total === 0 || intervalMs <= 0 || config.rotation.length === 0) {
    return {
      totalIntervals: total,
      intervalNumber: total,
      startedIntervals: total,
      intervalRemainingMs: 0,
      isFinished: true,
      movement: null,
    };
  }

  const elapsed = Math.max(0, elapsedMs);

  if (elapsed >= total * intervalMs) {
    return {
      totalIntervals: total,
      intervalNumber: total,
      startedIntervals: total,
      intervalRemainingMs: 0,
      isFinished: true,
      movement: config.rotation[(total - 1) % config.rotation.length] ?? null,
    };
  }

  const index = Math.floor(elapsed / intervalMs);
  return {
    totalIntervals: total,
    intervalNumber: index + 1,
    startedIntervals: index + 1,
    intervalRemainingMs: (index + 1) * intervalMs - elapsed,
    isFinished: false,
    movement: config.rotation[index % config.rotation.length] ?? null,
  };
}

/** Plus ancien intervalle démarré dont la performance n'est pas encore saisie. */
export function findNextUnrecordedInterval(
  config: EmomConfig,
  recordedOrders: ReadonlySet<number>,
  startedIntervals: number,
): EmomInterval | null {
  return (
    buildEmomSchedule(config).find(
      (interval) =>
        interval.intervalNumber <= startedIntervals &&
        !recordedOrders.has(interval.intervalNumber),
    ) ?? null
  );
}
