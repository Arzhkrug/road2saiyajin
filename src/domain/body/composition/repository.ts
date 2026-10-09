import type { KeyValueStore } from "../../../storage/types";
import type { EpochMs } from "../../workouts/types";
import { createCompositionId } from "./ids";
import { getCompositionHistory, sortCompositionMeasurements } from "./queries";
import type {
  BodyCompositionId,
  BodyCompositionMeasurement,
  NewCompositionInput,
} from "./types";
import {
  CompositionValidationError,
  validateCompositionMeasurement,
} from "./validation";

export const COMPOSITION_MEASUREMENTS_KEY = "body_composition:measurements";

export interface BodyCompositionRepository {
  add(input: NewCompositionInput): Promise<BodyCompositionMeasurement>;
  /** Ordre chronologique croissant. */
  getAll(): Promise<BodyCompositionMeasurement[]>;
  getById(id: BodyCompositionId): Promise<BodyCompositionMeasurement | null>;
  /** Fenêtre glissante [now - days, now], ordre croissant. */
  getHistory(days: number, now: EpochMs): Promise<BodyCompositionMeasurement[]>;
  delete(id: BodyCompositionId): Promise<void>;
}

const build = (
  input: NewCompositionInput,
  id: BodyCompositionId,
): BodyCompositionMeasurement => ({
  id,
  recordedAt: input.recordedAt,
  bodyFatPercent: input.bodyFatPercent ?? null,
  muscleMassKg: input.muscleMassKg ?? null,
  bmi: input.bmi ?? null,
  visceralFatIndex: input.visceralFatIndex ?? null,
  waterPercent: input.waterPercent ?? null,
});

export function createBodyCompositionRepository(
  store: KeyValueStore,
): BodyCompositionRepository {
  let writeQueue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = writeQueue.then(task);
    writeQueue = result.catch(() => undefined);
    return result;
  };

  /* Lecture défensive : une entrée invalide est ignorée (et disparaît à la prochaine écriture). */
  const readAll = async (): Promise<BodyCompositionMeasurement[]> => {
    const raw = await store.getItem<BodyCompositionMeasurement[]>(
      COMPOSITION_MEASUREMENTS_KEY,
    );
    if (!Array.isArray(raw)) {
      return [];
    }
    return sortCompositionMeasurements(
      raw.filter(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          validateCompositionMeasurement(item).isValid,
      ),
    );
  };

  return {
    getAll: readAll,

    getById: async (id) =>
      (await readAll()).find((measurement) => measurement.id === id) ?? null,

    getHistory: async (days, now) =>
      getCompositionHistory(await readAll(), days, now),

    add: async (input) => {
      const provisional = build(input, createCompositionId(input.recordedAt));
      const validation = validateCompositionMeasurement(provisional);
      if (!validation.isValid) {
        throw new CompositionValidationError(validation.errors);
      }

      /* L'id est choisi dans la file d'écriture : jamais d'écrasement silencieux. */
      return enqueue(async () => {
        const existing = await readAll();
        const id = createCompositionId(
          input.recordedAt,
          new Set(existing.map((item) => item.id)),
        );
        const measurement = build(input, id);
        await store.setItem(
          COMPOSITION_MEASUREMENTS_KEY,
          sortCompositionMeasurements([...existing, measurement]),
        );
        return measurement;
      });
    },

    delete: async (id) => {
      await enqueue(async () => {
        const remaining = (await readAll()).filter((item) => item.id !== id);
        await store.setItem(COMPOSITION_MEASUREMENTS_KEY, remaining);
      });
    },
  };
}
