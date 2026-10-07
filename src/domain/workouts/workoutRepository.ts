import type { KeyValueStore } from "../../storage/types";
import { SEED_EXERCISES, type Exercise } from "../exercises";
import { isPositiveNumber } from "../validation";
import { getCompletedSessions } from "./history";
import { SEED_WORKOUT_TEMPLATES } from "./seed";
import { createInProgressSession } from "./sessions";
import type {
  EpochMs,
  WorkoutSession,
  WorkoutSessionId,
  WorkoutTemplate,
  WorkoutTemplateId,
} from "./types";
import { validateWorkoutSession, WorkoutValidationError } from "./validation";

const SESSION_INDEX_KEY = "workout_sessions:index";
const sessionKey = (id: WorkoutSessionId): string =>
  `workout_sessions:item:${id}`;

export interface WorkoutRepository {
  getExercises(): Promise<readonly Exercise[]>;
  getTemplates(): Promise<readonly WorkoutTemplate[]>;
  getTemplate(id: WorkoutTemplateId): Promise<WorkoutTemplate | null>;
  getSession(id: WorkoutSessionId): Promise<WorkoutSession | null>;
  saveSession(session: WorkoutSession): Promise<void>;
  getSessionHistory(): Promise<WorkoutSession[]>;
  /** Séances terminées uniquement, de la plus récente à la plus ancienne. */
  getCompletedSessions(): Promise<WorkoutSession[]>;
}

const historySortKey = (session: WorkoutSession): number =>
  session.startedAt ?? session.createdAt;

export function createWorkoutRepository(
  store: KeyValueStore,
  templates: readonly WorkoutTemplate[] = SEED_WORKOUT_TEMPLATES,
  exercises: readonly Exercise[] = SEED_EXERCISES,
): WorkoutRepository {
  let writeQueue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = writeQueue.then(task);
    writeQueue = result.catch(() => undefined);
    return result;
  };

  const readIndex = async (): Promise<string[]> => {
    const ids = await store.getItem<string[]>(SESSION_INDEX_KEY);
    if (!Array.isArray(ids)) {
      return [];
    }
    return ids.filter((id): id is string => typeof id === "string");
  };

  const getSession = async (
    id: WorkoutSessionId,
  ): Promise<WorkoutSession | null> => {
    const session = await store.getItem<WorkoutSession>(sessionKey(id));
    if (session === null) {
      return null;
    }
    return validateWorkoutSession(session).isValid ? session : null;
  };

  const getSessionHistory = async (): Promise<WorkoutSession[]> => {
    const ids = await readIndex();
    const sessions = await Promise.all(ids.map((id) => getSession(id)));
    return sessions
      .filter((session): session is WorkoutSession => session !== null)
      .sort(
        (a, b) =>
          historySortKey(b) - historySortKey(a) || a.id.localeCompare(b.id),
      );
  };

  return {
    getExercises: async () => exercises,

    getTemplates: async () => templates,

    getTemplate: async (id) =>
      templates.find((template) => template.id === id) ?? null,

    getSession,

    saveSession: async (session) => {
      const errors: string[] = [...validateWorkoutSession(session).errors];
      if (!templates.some((template) => template.id === session.templateId)) {
        errors.push(`Unknown templateId: "${session.templateId}"`);
      }
      if (errors.length > 0) {
        throw new WorkoutValidationError(errors);
      }

      await enqueue(async () => {
        await store.setItem(sessionKey(session.id), session);
        const ids = await readIndex();
        if (!ids.includes(session.id)) {
          await store.setItem(SESSION_INDEX_KEY, [...ids, session.id]);
        }
      });
    },

    getSessionHistory,

    getCompletedSessions: async () =>
      getCompletedSessions(await getSessionHistory()),
  };
}

export interface StartWorkoutSessionInput {
  readonly templateId: WorkoutTemplateId;
  readonly now: EpochMs;
  /** Fournit le dernier poids connu (ex. weightRepository.getLatestWeightKg). */
  readonly readLatestBodyweightKg: () => Promise<number | null>;
}

/**
 * Démarre une séance : dernier poids connu → bodyweightKg → persistance.
 * Si la lecture du poids échoue ou renvoie une valeur invalide, bodyweightKg = null
 * (repli explicite : le démarrage n'est jamais bloqué). La valeur copiée est un
 * snapshot : elle n'est jamais recalculée par la suite.
 */
export async function startWorkoutSession(
  repository: Pick<WorkoutRepository, "saveSession">,
  input: StartWorkoutSessionInput,
): Promise<WorkoutSession> {
  let bodyweightKg: number | null = null;
  try {
    const latest = await input.readLatestBodyweightKg();
    bodyweightKg = latest !== null && isPositiveNumber(latest) ? latest : null;
  } catch {
    bodyweightKg = null;
  }

  const session = createInProgressSession({
    templateId: input.templateId,
    now: input.now,
    bodyweightKg,
  });
  await repository.saveSession(session);
  return session;
}
