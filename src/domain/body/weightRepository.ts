import type { KeyValueStore } from "../../storage/types";
import type { EpochMs } from "../workouts/types";
import {
  createMeasurementId,
  createWeightMeasurement,
  getLatestMeasurement,
  sortMeasurements,
  validateWeightMeasurement,
  WeightValidationError,
} from "./measurements";
import type { WeightMeasurement, WeightMeasurementId } from "./types";

const MEASUREMENTS_KEY = "body_weight:measurements";

export interface AddMeasurementInput {
  readonly recordedAt: EpochMs;
  readonly weightKg: number;
}

export interface WeightRepository {
  addMeasurement(input: AddMeasurementInput): Promise<WeightMeasurement>;
  /** Ordre chronologique croissant. */
  getMeasurements(): Promise<WeightMeasurement[]>;
  /** Poids de la mesure la plus récente, ou null s'il n'y en a aucune. */
  getLatestWeightKg(): Promise<number | null>;
  deleteMeasurement(id: WeightMeasurementId): Promise<void>;
}

export function createWeightRepository(store: KeyValueStore): WeightRepository {
  let writeQueue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = writeQueue.then(task);
    writeQueue = result.catch(() => undefined);
    return result;
  };

  /* Lecture défensive : une entrée invalide est ignorée (et disparaît à la prochaine écriture). */
  const readAll = async (): Promise<WeightMeasurement[]> => {
    const raw = await store.getItem<WeightMeasurement[]>(MEASUREMENTS_KEY);
    if (!Array.isArray(raw)) {
      return [];
    }
    return sortMeasurements(
      raw.filter(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          validateWeightMeasurement(item).isValid,
      ),
    );
  };

  return {
    getMeasurements: readAll,

    getLatestWeightKg: async () =>
      getLatestMeasurement(await readAll())?.weightKg ?? null,

    addMeasurement: async (input) => {
      const provisional = createWeightMeasurement(
        input.recordedAt,
        input.weightKg,
      );
      const validation = validateWeightMeasurement(provisional);
      if (!validation.isValid) {
        throw new WeightValidationError(validation.errors);
      }

      /* L'id est choisi dans la file d'écriture : jamais d'écrasement silencieux. */
      return enqueue(async () => {
        const existing = await readAll();
        const id = createMeasurementId(
          input.recordedAt,
          new Set(existing.map((item) => item.id)),
        );
        const measurement = createWeightMeasurement(
          input.recordedAt,
          input.weightKg,
          id,
        );
        await store.setItem(
          MEASUREMENTS_KEY,
          sortMeasurements([...existing, measurement]),
        );
        return measurement;
      });
    },

    deleteMeasurement: async (id) => {
      await enqueue(async () => {
        const remaining = (await readAll()).filter((item) => item.id !== id);
        await store.setItem(MEASUREMENTS_KEY, remaining);
      });
    },
  };
}
