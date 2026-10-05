import type {
  EmomConfig,
  EmomInterval,
  WorkoutBlock,
  WorkoutTemplate,
} from "./types";

export function getEmomIntervalCount(config: EmomConfig): number {
  if (config.totalMinutes <= 0 || config.intervalSeconds <= 0) {
    return 0;
  }
  return Math.floor((config.totalMinutes * 60) / config.intervalSeconds);
}

export function buildEmomSchedule(config: EmomConfig): EmomInterval[] {
  const count = getEmomIntervalCount(config);
  const schedule: EmomInterval[] = [];

  for (let index = 0; index < count; index += 1) {
    const movement = config.rotation[index % config.rotation.length];
    if (movement === undefined) {
      continue;
    }
    schedule.push({
      intervalNumber: index + 1,
      startsAtSeconds: index * config.intervalSeconds,
      exerciseId: movement.exerciseId,
      targetReps: movement.targetReps,
    });
  }

  return schedule;
}

export function getOrderedBlocks(template: WorkoutTemplate): WorkoutBlock[] {
  return [...template.blocks].sort((a, b) => a.order - b.order);
}
