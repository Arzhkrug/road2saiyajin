import type { KeyValueStore } from "../../storage/types";
import { formatActivityDuration, formatDayLabel } from "../../utils/format";
import { buildHistory } from "../activities/history";
import { createActivityId, getActivityIdSequence } from "../activities/ids";
import {
  getActivitiesBetween,
  sortActivitiesRecentFirst,
} from "../activities/queries";
import {
  ACTIVITIES_KEY,
  createActivityRepository,
} from "../activities/repository";
import {
  MAX_ACTIVITY_DURATION_MINUTES,
  MAX_ACTIVITY_NOTES_LENGTH,
  type Activity,
  type NewActivityInput,
} from "../activities/types";
import {
  ActivityValidationError,
  parseDurationInput,
  validateActivity,
} from "../activities/validation";
import { SEED_EXERCISES } from "../exercises/catalog";
import { buildRecommendations } from "../progression";
import { DAY_MS } from "../stats/period";
import { getWorkoutStats } from "../stats/workoutStats";
import { SEED_WORKOUT_TEMPLATES } from "../workouts/seed";
import type {
  PerformanceEntry,
  SessionStatus,
  WorkoutSession,
} from "../workouts/types";
import { createWorkoutRepository } from "../workouts/workoutRepository";
import { assertEqual, assertTrue, test } from "./harness";

const createMemoryStore = (): KeyValueStore => {
  const data = new Map<string, string>();
  return {
    async getItem<T>(key: string): Promise<T | null> {
      const raw = data.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as T);
    },
    async setItem<T>(key: string, value: T): Promise<void> {
      data.set(key, JSON.stringify(value));
    },
    async removeItem(key: string): Promise<void> {
      data.delete(key);
    },
  };
};

const valid: Activity = {
  id: "activity_1000",
  type: "boxing",
  startedAt: 1_000,
  durationMinutes: 60,
  intensity: null,
  notes: null,
  createdAt: 1_000,
};

/** Fabrique une activité aux valeurs arbitraires (y compris invalides) sans `any`. */
const variant = (overrides: Record<string, unknown>): Activity =>
  Object.assign({}, valid, overrides);

const refused = (activity: Activity): boolean =>
  !validateActivity(activity).isValid;

const newInput = (
  overrides: Partial<NewActivityInput> = {},
): NewActivityInput => ({
  type: "boxing",
  startedAt: 1_000,
  durationMinutes: 60,
  createdAt: 1_000,
  ...overrides,
});

const makeSession = (
  id: string,
  status: SessionStatus,
  startedAt: number,
  completedAt: number | null,
  performances: PerformanceEntry[] = [],
): WorkoutSession => ({
  id,
  templateId: "session_a",
  status,
  createdAt: startedAt,
  startedAt,
  completedAt,
  bodyweightKg: 74.2,
  notes: null,
  performances,
});

const perf = (
  sessionId: string,
  order: number,
  actualReps: number,
  recordedAt: number,
): PerformanceEntry => ({
  id: `${sessionId}__session_a_emom__${order}`,
  blockId: "session_a_emom",
  blockType: "emom",
  exerciseId: order % 2 === 1 ? "pull_up_pronation" : "dips",
  order,
  targetReps: 6,
  actualReps,
  externalLoadKg: 0,
  bodyweightKg: 74.2,
  recordedAt,
});

/* ---------- Validation ---------- */

test("activité: une activité valide est acceptée", () => {
  assertTrue(validateActivity(valid).isValid, "activité de base");
  for (const intensity of ["low", "medium", "high"]) {
    assertTrue(
      validateActivity(variant({ intensity })).isValid,
      `intensité ${intensity}`,
    );
  }
  assertTrue(
    validateActivity(variant({ notes: "Sparring" })).isValid,
    "avec note",
  );
  assertTrue(
    validateActivity(
      variant({ durationMinutes: MAX_ACTIVITY_DURATION_MINUTES }),
    ).isValid,
    "durée maximale acceptée",
  );
});

test("activité: durée 0 refusée", () => {
  assertTrue(refused(variant({ durationMinutes: 0 })), "durée 0");
});

test("activité: durée négative refusée", () => {
  assertTrue(refused(variant({ durationMinutes: -10 })), "durée négative");
});

test("activité: durée décimale refusée", () => {
  assertTrue(refused(variant({ durationMinutes: 45.5 })), "durée décimale");
  assertTrue(refused(variant({ durationMinutes: Number.NaN })), "NaN");
});

test("activité: durée trop élevée refusée", () => {
  assertTrue(
    refused(variant({ durationMinutes: MAX_ACTIVITY_DURATION_MINUTES + 1 })),
    "durée au-dessus du maximum",
  );
  assertTrue(
    refused(variant({ durationMinutes: Number.POSITIVE_INFINITY })),
    "Infinity",
  );
});

test("activité: intensité invalide refusée", () => {
  assertTrue(refused(variant({ intensity: "extreme" })), "valeur inconnue");
  assertTrue(refused(variant({ intensity: 3 })), "nombre");
  assertTrue(
    refused(variant({ intensity: undefined })),
    "undefined (ni null ni valeur)",
  );
});

test("activité: note trop longue refusée", () => {
  assertTrue(
    validateActivity(variant({ notes: "x".repeat(MAX_ACTIVITY_NOTES_LENGTH) }))
      .isValid,
    "500 caractères acceptés",
  );
  assertTrue(
    refused(variant({ notes: "x".repeat(MAX_ACTIVITY_NOTES_LENGTH + 1) })),
    "501 caractères refusés",
  );
  assertTrue(refused(variant({ notes: 42 })), "note non textuelle");
});

test("activité: timestamps invalides refusés", () => {
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assertTrue(
      refused(variant({ startedAt: bad })),
      `startedAt ${String(bad)}`,
    );
    assertTrue(
      refused(variant({ createdAt: bad })),
      `createdAt ${String(bad)}`,
    );
  }
  assertTrue(refused(variant({ id: "" })), "id vide");
  assertTrue(refused(variant({ type: "swimming" })), "type inconnu");
});

test("activité: saisie de la durée (1 à 600, entier)", () => {
  assertEqual(parseDurationInput("60"), 60, "valide");
  assertEqual(parseDurationInput(" 45 "), 45, "espaces");
  assertEqual(parseDurationInput("600"), 600, "maximum");
  assertEqual(parseDurationInput("0"), null, "zéro");
  assertEqual(parseDurationInput("601"), null, "trop haut");
  assertEqual(parseDurationInput(""), null, "vide");
  assertEqual(parseDurationInput("45.5"), null, "décimal");
  assertEqual(parseDurationInput("-5"), null, "négatif");
  assertEqual(parseDurationInput("abc"), null, "texte");
});

/* ---------- Repository ---------- */

test("repository: activité enregistrée puis relue", async () => {
  const repository = createActivityRepository(createMemoryStore());
  const added = await repository.add(
    newInput({ durationMinutes: 75, intensity: "high", notes: "Sparring" }),
  );
  assertEqual(added.id, "activity_1000", "id");
  assertEqual(added.type, "boxing", "type");
  const all = await repository.getAll();
  assertEqual(all.length, 1, "une activité");
  assertEqual(all[0]?.durationMinutes, 75, "durée relue");
  assertEqual(all[0]?.intensity, "high", "intensité relue");
  assertEqual(all[0]?.notes, "Sparring", "note relue");
  assertEqual(all[0]?.startedAt, 1_000, "startedAt relu");
});

test("repository: activité invalide refusée sans rien enregistrer", async () => {
  const repository = createActivityRepository(createMemoryStore());
  let rejected = 0;
  const durations = [0, -5, 1.5, MAX_ACTIVITY_DURATION_MINUTES + 1];
  for (const durationMinutes of durations) {
    try {
      await repository.add(newInput({ durationMinutes }));
    } catch (error) {
      if (error instanceof ActivityValidationError) {
        rejected += 1;
      }
    }
  }
  assertEqual(rejected, durations.length, "toutes refusées");
  assertEqual((await repository.getAll()).length, 0, "rien enregistré");
});

test("repository: note rognée, note vide = null, intensité absente = null", async () => {
  const repository = createActivityRepository(createMemoryStore());
  const trimmed = await repository.add(
    newInput({ notes: "  Pads  ", createdAt: 1 }),
  );
  const blank = await repository.add(newInput({ notes: "   ", createdAt: 2 }));
  const absent = await repository.add(newInput({ createdAt: 3 }));
  assertEqual(trimmed.notes, "Pads", "note rognée");
  assertEqual(blank.notes, null, "note vide");
  assertEqual(absent.notes, null, "note absente");
  assertEqual(absent.intensity, null, "intensité absente");
});

test("repository: getById", async () => {
  const repository = createActivityRepository(createMemoryStore());
  const first = await repository.add(
    newInput({ createdAt: 1_000, durationMinutes: 30 }),
  );
  await repository.add(newInput({ createdAt: 2_000, durationMinutes: 40 }));
  assertEqual(
    (await repository.getById(first.id))?.durationMinutes,
    30,
    "trouvée",
  );
  assertEqual(
    await repository.getById("activity_inconnue"),
    null,
    "introuvable",
  );
});

test("repository: suppression", async () => {
  const repository = createActivityRepository(createMemoryStore());
  const first = await repository.add(
    newInput({ createdAt: 1_000, startedAt: 1_000 }),
  );
  await repository.add(newInput({ createdAt: 2_000, startedAt: 2_000 }));
  await repository.delete(first.id);
  const all = await repository.getAll();
  assertEqual(all.length, 1, "une activité restante");
  assertEqual(all[0]?.startedAt, 2_000, "bonne activité conservée");
  assertEqual(await repository.getById(first.id), null, "supprimée");
  await repository.delete("activity_inexistante");
  assertEqual((await repository.getAll()).length, 1, "id inconnu ignoré");
});

test("repository: getByType", async () => {
  const store = createMemoryStore();
  const repository = createActivityRepository(store);
  await store.setItem(ACTIVITIES_KEY, [
    valid,
    { ...valid, id: "activity_9", type: "swimming" },
  ]);
  await repository.add(newInput({ createdAt: 5_000, startedAt: 5_000 }));
  const boxing = await repository.getByType("boxing");
  assertEqual(boxing.length, 2, "deux activités de boxe");
  assertTrue(
    boxing.every((activity) => activity.type === "boxing"),
    "type respecté",
  );
});

test("repository: getRecent", async () => {
  const repository = createActivityRepository(createMemoryStore());
  for (let index = 1; index <= 5; index += 1) {
    await repository.add(
      newInput({
        createdAt: index * 1_000,
        startedAt: index * 1_000,
        durationMinutes: index,
      }),
    );
  }
  const recent = await repository.getRecent(3);
  assertEqual(
    recent.map((activity) => activity.durationMinutes).join(","),
    "5,4,3",
    "trois plus récentes",
  );
  assertEqual(
    (await repository.getRecent(100)).length,
    5,
    "limite au-dessus du total",
  );
  assertEqual((await repository.getRecent(0)).length, 0, "limite nulle");
  assertEqual(
    (await repository.getRecent(Number.NaN)).length,
    0,
    "limite invalide",
  );
});

test("repository: getBetween et getActivitiesBetween (bornes incluses)", async () => {
  const repository = createActivityRepository(createMemoryStore());
  for (const at of [1_000, 2_000, 3_000]) {
    await repository.add(newInput({ createdAt: at, startedAt: at }));
  }
  const between = await repository.getBetween(2_000, 3_000);
  assertEqual(
    between.map((activity) => activity.startedAt).join(","),
    "3000,2000",
    "bornes incluses",
  );
  assertEqual(
    (await repository.getBetween(3_001, 4_000)).length,
    0,
    "plage vide",
  );
  assertEqual(
    (await repository.getBetween(3_000, 1_000)).length,
    0,
    "plage inversée",
  );
  assertEqual(
    getActivitiesBetween([valid], 1_000, 1_000).length,
    1,
    "borne unique",
  );
});

test("repository: trois activités au même timestamp sont toutes conservées", async () => {
  const repository = createActivityRepository(createMemoryStore());
  const first = await repository.add(newInput({ durationMinutes: 30 }));
  const second = await repository.add(newInput({ durationMinutes: 45 }));
  const third = await repository.add(newInput({ durationMinutes: 60 }));
  assertTrue(
    first.id !== second.id && second.id !== third.id && first.id !== third.id,
    "ids distincts",
  );
  const all = await repository.getAll();
  assertEqual(all.length, 3, "aucune écrasée");
  assertEqual(
    all
      .map((activity) => activity.durationMinutes)
      .sort((a, b) => a - b)
      .join(","),
    "30,45,60",
    "durées toutes conservées",
  );
});

test("repository: 12 activités au même timestamp, la dernière ajoutée est la plus récente", async () => {
  const repository = createActivityRepository(createMemoryStore());
  for (let index = 1; index <= 12; index += 1) {
    await repository.add(newInput({ durationMinutes: index }));
  }
  const all = await repository.getAll();
  assertEqual(all.length, 12, "douze activités");
  assertEqual(
    new Set(all.map((activity) => activity.id)).size,
    12,
    "ids uniques",
  );
  assertEqual(
    all[0]?.durationMinutes,
    12,
    "la plus récente en premier (_12 avant _2)",
  );
  assertEqual(all[11]?.durationMinutes, 1, "la plus ancienne en dernier");
});

test("repository: écritures concurrentes sans écrasement", async () => {
  const repository = createActivityRepository(createMemoryStore());
  await Promise.all([
    repository.add(newInput({ durationMinutes: 10 })),
    repository.add(newInput({ durationMinutes: 20 })),
    repository.add(newInput({ durationMinutes: 30 })),
    repository.add(
      newInput({ createdAt: 2_000, startedAt: 2_000, durationMinutes: 40 }),
    ),
  ]);
  const all = await repository.getAll();
  assertEqual(all.length, 4, "quatre activités");
  assertEqual(
    new Set(all.map((activity) => activity.id)).size,
    4,
    "ids uniques",
  );
});

test("repository: données corrompues ignorées sans planter", async () => {
  const store = createMemoryStore();
  const corrupt: unknown[] = [
    valid,
    {
      id: "x",
      type: "swimming",
      startedAt: 1,
      durationMinutes: 10,
      intensity: null,
      notes: null,
      createdAt: 1,
    },
    variant({ id: "activity_2000", durationMinutes: -1 }),
    variant({ id: "activity_3000", notes: 42 }),
    variant({ id: "activity_4000", startedAt: Number.NaN }),
    null,
    5,
    "texte",
  ];
  await store.setItem(ACTIVITIES_KEY, corrupt);
  const repository = createActivityRepository(store);
  const all = await repository.getAll();
  assertEqual(all.length, 1, "seule l’entrée valide est conservée");
  assertEqual(all[0]?.id, "activity_1000", "bonne entrée");

  const notAnArray = createMemoryStore();
  await notAnArray.setItem(ACTIVITIES_KEY, { oups: true });
  assertEqual(
    (await createActivityRepository(notAnArray).getAll()).length,
    0,
    "valeur non-tableau = liste vide",
  );
});

/* ---------- IDs, tri, formatage ---------- */

test("ids: séquence numérique (_2 avant _10, suppression incluse)", () => {
  assertEqual(createActivityId(5_000), "activity_5000", "premier id");
  assertEqual(
    createActivityId(5_000, new Set(["activity_5000"])),
    "activity_5000_2",
    "deuxième",
  );
  assertEqual(
    createActivityId(
      5_000,
      new Set(["activity_5000", "activity_5000_2", "activity_5000_10"]),
    ),
    "activity_5000_11",
    "dernier rang + 1",
  );
  assertEqual(
    createActivityId(5_000, new Set(["activity_5000_2"])),
    "activity_5000_3",
    "après suppression du premier",
  );
  assertEqual(
    createActivityId(500, new Set(["activity_5000"])),
    "activity_500",
    "préfixe voisin sans collision",
  );
  assertEqual(getActivityIdSequence("activity_5000"), 1, "rang 1");
  assertEqual(getActivityIdSequence("activity_5000_10"), 10, "rang 10");
  assertEqual(getActivityIdSequence("n_importe_quoi"), 0, "format inconnu");
});

test("tri: activités du plus récent au plus ancien, déterministe", () => {
  const make = (
    id: string,
    startedAt: number,
    createdAt: number,
  ): Activity => ({
    ...valid,
    id,
    startedAt,
    createdAt,
  });
  const items = [
    make("activity_1", 1_000, 1_000),
    make("activity_3", 3_000, 3_000),
    make("activity_2_10", 2_000, 2_000),
    make("activity_2_2", 2_000, 2_000),
    make("activity_2", 2_000, 2_000),
  ];
  const sorted = sortActivitiesRecentFirst(items);
  assertEqual(
    sorted.map((activity) => activity.id).join(","),
    "activity_3,activity_2_10,activity_2_2,activity_2,activity_1",
    "ordre",
  );
  assertEqual(
    sortActivitiesRecentFirst([...items].reverse())
      .map((activity) => activity.id)
      .join(","),
    sorted.map((activity) => activity.id).join(","),
    "indépendant de l’ordre d’entrée",
  );
});

/* ---------- Historique ---------- */

const idOf = (item: ReturnType<typeof buildHistory>[number]): string =>
  item.kind === "session" ? item.session.id : item.activity.id;

test("historique: séances et activités mélangées, du plus récent au plus ancien", () => {
  const session = makeSession("s1", "completed", 1_000, 3_601_000, [
    perf("s1", 1, 6, 2_000),
  ]);
  const activities: Activity[] = [
    { ...valid, id: "activity_a", startedAt: 5_000_000, createdAt: 5_000_000 },
    { ...valid, id: "activity_b", startedAt: 2_000_000, createdAt: 2_000_000 },
    { ...valid, id: "activity_c", startedAt: 500, createdAt: 500 },
  ];
  const history = buildHistory([session], activities);
  assertEqual(
    history.map(idOf).join(","),
    "activity_a,s1,activity_b,activity_c",
    "ordre fusionné",
  );
  assertEqual(
    history.map((item) => item.kind).join(","),
    "activity,session,activity,activity",
    "les deux concepts restent distincts",
  );
  assertEqual(
    buildHistory([session], [...activities].reverse())
      .map(idOf)
      .join(","),
    history.map(idOf).join(","),
    "indépendant de l’ordre d’entrée",
  );
});

test("historique: séances en cours ou annulées exclues, égalité de date déterministe", () => {
  const done = makeSession("done", "completed", 1_000, 5_000);
  const running = makeSession("running", "in_progress", 6_000, null);
  const cancelled = makeSession("cancelled", "cancelled", 7_000, null);
  const sameTime: Activity = {
    ...valid,
    id: "activity_t",
    startedAt: 5_000,
    createdAt: 5_000,
  };
  const history = buildHistory([running, cancelled, done], [sameTime]);
  assertEqual(history.length, 2, "séance terminée + activité seulement");
  assertEqual(
    history.map(idOf).join(","),
    "activity_t,done",
    "activité avant séance à date égale",
  );
  assertEqual(
    buildHistory([done, cancelled, running], [sameTime]).map(idOf).join(","),
    history.map(idOf).join(","),
    "déterministe",
  );
  assertEqual(buildHistory([], []).length, 0, "historique vide");
});

test("historique: une activité ne modifie ni les séances, ni les stats, ni les recommandations", async () => {
  const store = createMemoryStore();
  const workouts = createWorkoutRepository(store);
  const activities = createActivityRepository(store);

  for (let index = 0; index < 3; index += 1) {
    const startedAt = 1_000_000 + index * DAY_MS;
    const id = `s${index + 1}`;
    await workouts.saveSession(
      makeSession(id, "completed", startedAt, startedAt + 3_600_000, [
        perf(id, 1, 7 + index, startedAt + 1_000),
        perf(id, 2, 9, startedAt + 2_000),
      ]),
    );
  }

  const snapshot = async (): Promise<string> => {
    const completed = await workouts.getCompletedSessions();
    return JSON.stringify({
      sessions: await workouts.getSessionHistory(),
      stats: getWorkoutStats(completed, SEED_WORKOUT_TEMPLATES),
      recommendations: buildRecommendations({
        sessions: completed,
        templates: SEED_WORKOUT_TEMPLATES,
        exercises: SEED_EXERCISES,
        now: 9_000_000_000,
      }),
    });
  };

  const before = await snapshot();
  const day = 1_000_000 + 2 * DAY_MS;
  await activities.add(
    newInput({
      startedAt: day,
      createdAt: day,
      durationMinutes: 90,
      intensity: "high",
    }),
  );
  await activities.add(
    newInput({ startedAt: day + 1, createdAt: day + 1, durationMinutes: 60 }),
  );
  await activities.add(
    newInput({
      startedAt: day + 2,
      createdAt: day + 2,
      durationMinutes: 45,
      intensity: "high",
    }),
  );
  const after = await snapshot();

  assertEqual(after, before, "séances, stats et recommandations identiques");
  assertEqual(
    (await activities.getAll()).length,
    3,
    "activités bien enregistrées",
  );
  assertEqual(
    (await workouts.getCompletedSessions()).length,
    3,
    "séances inchangées",
  );
});

test("formatage: durée d’activité (45 min, 1h, 1h 30)", () => {
  assertEqual(formatActivityDuration(45), "45 min", "45 min");
  assertEqual(formatActivityDuration(60), "1h", "1h");
  assertEqual(formatActivityDuration(90), "1h 30", "1h 30");
  assertEqual(formatActivityDuration(125), "2h 05", "2h 05");
  assertEqual(formatActivityDuration(5), "5 min", "5 min");
});

test("formatage: Aujourd’hui, Hier, date courte", () => {
  const now = new Date(2026, 9, 8, 15, 0).getTime();
  assertEqual(
    formatDayLabel(new Date(2026, 9, 8, 8, 0).getTime(), now),
    "Aujourd'hui",
    "aujourd’hui",
  );
  assertEqual(
    formatDayLabel(new Date(2026, 9, 7, 23, 30).getTime(), now),
    "Hier",
    "hier",
  );
  assertEqual(
    formatDayLabel(new Date(2026, 9, 2, 10, 0).getTime(), now),
    "2 oct.",
    "même année",
  );
  assertEqual(
    formatDayLabel(new Date(2025, 9, 12, 10, 0).getTime(), now),
    "12 oct. 2025",
    "autre année",
  );
});
