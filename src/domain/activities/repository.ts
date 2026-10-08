import type { KeyValueStore } from "../../storage/types";
import type { EpochMs } from "../workouts/types";
import { createActivity } from "./factory";
import { createActivityId } from "./ids";
import {
  getActivitiesBetween,
  getRecentActivities,
  sortActivitiesRecentFirst,
} from "./queries";
import type {
  Activity,
  ActivityId,
  ActivityType,
  NewActivityInput,
} from "./types";
import { ActivityValidationError, validateActivity } from "./validation";

export const ACTIVITIES_KEY = "activities:all";

export interface ActivityRepository {
  add(input: NewActivityInput): Promise<Activity>;
  /** Du plus récent au plus ancien. */
  getAll(): Promise<Activity[]>;
  getById(id: ActivityId): Promise<Activity | null>;
  getByType(type: ActivityType): Promise<Activity[]>;
  getRecent(limit: number): Promise<Activity[]>;
  getBetween(start: EpochMs, end: EpochMs): Promise<Activity[]>;
  delete(id: ActivityId): Promise<void>;
}

export function createActivityRepository(
  store: KeyValueStore,
): ActivityRepository {
  let writeQueue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = writeQueue.then(task);
    writeQueue = result.catch(() => undefined);
    return result;
  };

  /* Lecture défensive : une entrée invalide est ignorée (et disparaît à la prochaine écriture). */
  const readAll = async (): Promise<Activity[]> => {
    const raw = await store.getItem<Activity[]>(ACTIVITIES_KEY);
    if (!Array.isArray(raw)) {
      return [];
    }
    return sortActivitiesRecentFirst(
      raw.filter(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          validateActivity(item).isValid,
      ),
    );
  };

  return {
    getAll: readAll,

    getById: async (id) =>
      (await readAll()).find((activity) => activity.id === id) ?? null,

    getByType: async (type) =>
      (await readAll()).filter((activity) => activity.type === type),

    getRecent: async (limit) => getRecentActivities(await readAll(), limit),

    getBetween: async (start, end) =>
      getActivitiesBetween(await readAll(), start, end),

    add: async (input) => {
      const provisional = createActivity(
        input,
        createActivityId(input.createdAt),
      );
      const validation = validateActivity(provisional);
      if (!validation.isValid) {
        throw new ActivityValidationError(validation.errors);
      }

      /* L'id est choisi dans la file d'écriture : jamais d'écrasement silencieux. */
      return enqueue(async () => {
        const existing = await readAll();
        const id = createActivityId(
          input.createdAt,
          new Set(existing.map((item) => item.id)),
        );
        const activity = createActivity(input, id);
        await store.setItem(ACTIVITIES_KEY, [...existing, activity]);
        return activity;
      });
    },

    delete: async (id) => {
      await enqueue(async () => {
        const remaining = (await readAll()).filter((item) => item.id !== id);
        await store.setItem(ACTIVITIES_KEY, remaining);
      });
    },
  };
}
