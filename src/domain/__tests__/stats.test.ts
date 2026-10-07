import type { KeyValueStore } from "../../storage/types";
import {
  getLatestMeasurement,
  getWeightHistory,
  getWeightSummary,
  normalizeSeries,
  parseWeightInput,
  sortMeasurements,
  WeightValidationError,
} from "../body/measurements";
import { createWeightRepository } from "../body/weightRepository";
import type { WeightMeasurement } from "../body/types";
import { DAY_MS, filterByPeriod } from "../stats/period";
import { getWorkoutStats } from "../stats/workoutStats";
import { getCompletedSessions } from "../workouts/history";
import { SEED_WORKOUT_TEMPLATES } from "../workouts/seed";
import { completeSession, recordPerformance } from "../workouts/sessions";
import type {
  PerformanceEntry,
  SessionStatus,
  WorkoutSession,
} from "../workouts/types";
import {
  createWorkoutRepository,
  startWorkoutSession,
} from "../workouts/workoutRepository";
import { assertEqual, assertTrue, test } from "./harness";

const NOW = 1_800_000_000_000;

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

const perf = (
  sessionId: string,
  blockId: string,
  blockType: PerformanceEntry["blockType"],
  exerciseId: string,
  order: number,
  targetReps: number,
  actualReps: number,
  externalLoadKg: number,
  recordedAt: number,
): PerformanceEntry => ({
  id: `${sessionId}__${blockId}__${order}`,
  blockId,
  blockType,
  exerciseId,
  order,
  targetReps,
  actualReps,
  externalLoadKg,
  bodyweightKg: 78,
  recordedAt,
});

const makeSession = (
  id: string,
  templateId: string,
  status: SessionStatus,
  startedAt: number,
  completedAt: number | null,
  bodyweightKg: number | null,
  performances: PerformanceEntry[],
): WorkoutSession => ({
  id,
  templateId,
  status,
  createdAt: startedAt,
  startedAt,
  completedAt,
  bodyweightKg,
  notes: null,
  performances,
});

const at = (daysAgo: number): number => NOW - daysAgo * DAY_MS;

const s1 = makeSession(
  "s1",
  "session_a",
  "completed",
  at(3) - 3_600_000,
  at(3),
  74.2,
  [
    perf(
      "s1",
      "session_a_emom",
      "emom",
      "pull_up_pronation",
      1,
      6,
      6,
      0,
      at(3) - 3_000_000,
    ),
    perf("s1", "session_a_emom", "emom", "dips", 2, 8, 9, 0, at(3) - 2_900_000),
    perf(
      "s1",
      "session_a_push_up",
      "straight_sets",
      "push_up",
      1,
      10,
      11,
      0,
      at(3) - 2_000_000,
    ),
  ],
);
const s2 = makeSession(
  "s2",
  "session_b",
  "completed",
  at(10) - 3_600_000,
  at(10),
  74.0,
  [
    perf(
      "s2",
      "session_b_emom",
      "emom",
      "squat",
      1,
      25,
      25,
      0,
      at(10) - 3_000_000,
    ),
    perf(
      "s2",
      "session_b_emom",
      "emom",
      "chin_up",
      2,
      5,
      4,
      0,
      at(10) - 2_900_000,
    ),
  ],
);
const s3 = makeSession(
  "s3",
  "session_a",
  "completed",
  at(40) - 3_600_000,
  at(40),
  75.0,
  [
    perf(
      "s3",
      "session_a_emom",
      "emom",
      "pull_up_pronation",
      1,
      6,
      8,
      0,
      at(40) - 3_000_000,
    ),
    perf(
      "s3",
      "session_a_emom",
      "emom",
      "dips",
      2,
      8,
      12,
      0,
      at(40) - 2_900_000,
    ),
  ],
);
const s4 = makeSession("s4", "session_a", "in_progress", at(1), null, null, [
  perf("s4", "session_a_emom", "emom", "pull_up_pronation", 1, 6, 5, 0, at(1)),
]);
const s5 = makeSession("s5", "session_b", "cancelled", at(2), null, null, []);

const allSessions = [s4, s3, s5, s1, s2];
const templates = SEED_WORKOUT_TEMPLATES;

/* ---------- Historique ---------- */

test("historique: uniquement les séances terminées", () => {
  const completed = getCompletedSessions(allSessions);
  assertEqual(completed.length, 3, "nombre de séances terminées");
  assertTrue(
    completed.every((session) => session.status === "completed"),
    "toutes terminées",
  );
});

test("historique: trié de la plus récente à la plus ancienne", () => {
  const ids = getCompletedSessions(allSessions).map((session) => session.id);
  assertEqual(ids.join(","), "s1,s2,s3", "ordre");
});

test("historique: une séance terminée sans performance reste terminée", () => {
  const empty = makeSession(
    "s12",
    "session_a",
    "completed",
    at(1) - 1_000,
    at(1),
    null,
    [],
  );
  assertEqual(getCompletedSessions([empty]).length, 1, "listée");
  const stats = getWorkoutStats([empty], templates);
  assertEqual(stats.completedSessions, 1, "comptée");
  assertEqual(stats.totalPerformances, 0, "aucune performance");
  assertEqual(stats.averageRepsPerPerformance, 0, "moyenne 0");
});

/* ---------- Périodes ---------- */

const completedAtOf = (session: WorkoutSession): number =>
  session.completedAt ?? 0;
const idsInPeriod = (days: number): string =>
  filterByPeriod(getCompletedSessions(allSessions), completedAtOf, days, NOW)
    .map((session) => session.id)
    .join(",");

test("période 7 jours (avec frontières)", () => {
  assertEqual(idsInPeriod(7), "s1", "séances sur 7 jours");
  const items = [at(7), at(7) - 1, at(7) + 1, NOW, NOW + 1];
  const kept = filterByPeriod(items, (value) => value, 7, NOW);
  assertEqual(
    kept.length,
    3,
    "inclus : 7 j pile, 7 j − 1 ms, now ; exclus : 7 j + 1 ms, futur",
  );
  assertTrue(kept.includes(at(7)), "frontière incluse");
  assertTrue(!kept.includes(at(7) - 1), "juste avant la frontière exclu");
  assertTrue(kept.includes(NOW), "maintenant inclus");
  assertTrue(!kept.includes(NOW + 1), "juste après maintenant exclu");
});

test("période 30 jours (avec frontières)", () => {
  assertEqual(idsInPeriod(30), "s1,s2", "séances sur 30 jours");
  const kept = filterByPeriod([at(30), at(30) - 1], (value) => value, 30, NOW);
  assertEqual(kept.length, 1, "frontière 30 jours");
});

test("période 90 jours (avec frontières)", () => {
  assertEqual(idsInPeriod(90), "s1,s2,s3", "séances sur 90 jours");
  const kept = filterByPeriod([at(90), at(90) - 1], (value) => value, 90, NOW);
  assertEqual(kept.length, 1, "frontière 90 jours");
});

test("période vide : liste vide", () => {
  assertEqual(
    filterByPeriod([], (value: number) => value, 7, NOW).length,
    0,
    "entrée vide",
  );
  assertEqual(
    filterByPeriod([at(200)], (value) => value, 30, NOW).length,
    0,
    "aucun élément dans la période",
  );
  assertEqual(
    filterByPeriod([NOW], (value) => value, 0, NOW).length,
    0,
    "durée nulle",
  );
  assertEqual(
    filterByPeriod([NOW], (value) => value, -5, NOW).length,
    0,
    "durée négative",
  );
});

/* ---------- Statistiques ---------- */

test("statistiques: compteurs corrects (in_progress et cancelled ignorées)", () => {
  const stats = getWorkoutStats(allSessions, templates);
  assertEqual(stats.completedSessions, 3, "séances terminées");
  assertEqual(stats.totalPerformances, 7, "performances");
});

test("statistiques: reps totales (actualReps, pas targetReps) et moyenne", () => {
  const stats = getWorkoutStats(allSessions, templates);
  assertEqual(stats.totalReps, 75, "reps réalisées (6+9+11+25+4+8+12)");
  assertTrue(stats.totalReps !== 68, "différent de la somme des cibles (68)");
  assertEqual(stats.averageRepsPerPerformance, 10.7, "moyenne 75/7 arrondie");
});

test("statistiques: meilleure performance contextualisée par exercice", () => {
  const stats = getWorkoutStats(allSessions, templates);
  const best = (id: string) =>
    stats.bestByExercise.find((entry) => entry.exerciseId === id);
  assertEqual(best("pull_up_pronation")?.actualReps, 8, "pull-ups");
  assertEqual(best("dips")?.actualReps, 12, "dips");
  assertEqual(best("squat")?.actualReps, 25, "squats");
  assertEqual(best("chin_up")?.actualReps, 4, "chin-ups");
  assertEqual(best("push_up")?.actualReps, 11, "pompes");
  assertEqual(stats.bestByExercise.length, 5, "une entrée par exercice");
});

test("statistiques: meilleure performance = plus grand nombre de reps (charge ignorée)", () => {
  const session = makeSession(
    "s9",
    "session_a",
    "completed",
    at(1) - 1_000,
    at(1),
    74,
    [
      perf("s9", "b", "emom", "pull_up_pronation", 1, 6, 8, 0, at(1) - 500),
      perf("s9", "b", "emom", "pull_up_pronation", 2, 6, 5, 10, at(1) - 400),
    ],
  );
  const best = getWorkoutStats([session], templates).bestByExercise[0];
  assertEqual(best?.actualReps, 8, "le maximum de reps gagne");
  assertEqual(
    best?.externalLoadKg,
    0,
    "la charge de la performance retenue est conservée",
  );
  assertEqual(best?.targetReps, 6, "target conservée");
  assertEqual(best?.bodyweightKg, 78, "poids du corps conservé");
  assertEqual(best?.sessionId, "s9", "séance conservée");
  assertEqual(best?.recordedAt, at(1) - 500, "timestamp conservé");
  assertEqual(best?.performanceId, "s9__b__1", "id de performance conservé");
});

test("statistiques: égalité de reps → performance la plus récente", () => {
  const older = makeSession(
    "s10",
    "session_a",
    "completed",
    at(5) - 1_000,
    at(5),
    74,
    [perf("s10", "b", "emom", "dips", 1, 8, 10, 0, at(5) - 500)],
  );
  const newer = makeSession(
    "s11",
    "session_a",
    "completed",
    at(2) - 1_000,
    at(2),
    74,
    [perf("s11", "b", "emom", "dips", 1, 8, 10, 5, at(2) - 500)],
  );
  const forward = getWorkoutStats([older, newer], templates).bestByExercise[0];
  const backward = getWorkoutStats([newer, older], templates).bestByExercise[0];
  assertEqual(forward?.sessionId, "s11", "la plus récente gagne");
  assertEqual(forward?.externalLoadKg, 5, "charge de la plus récente");
  assertEqual(backward?.sessionId, "s11", "indépendant de l’ordre d’entrée");
});

test("statistiques: égalité totale → départage stable (sessionId puis performanceId)", () => {
  const stamp = at(4) - 500;
  const sa = makeSession(
    "sa",
    "session_a",
    "completed",
    at(4) - 1_000,
    at(4),
    74,
    [perf("sa", "b", "emom", "dips", 1, 8, 10, 0, stamp)],
  );
  const sb = makeSession(
    "sb",
    "session_a",
    "completed",
    at(4) - 1_000,
    at(4),
    74,
    [perf("sb", "b", "emom", "dips", 1, 8, 10, 0, stamp)],
  );
  const forward = getWorkoutStats([sa, sb], templates).bestByExercise[0];
  const backward = getWorkoutStats([sb, sa], templates).bestByExercise[0];
  assertEqual(forward?.sessionId, "sb", "sessionId départage (ordre direct)");
  assertEqual(backward?.sessionId, "sb", "sessionId départage (ordre inverse)");

  const same = makeSession(
    "sc",
    "session_a",
    "completed",
    at(4) - 1_000,
    at(4),
    74,
    [
      perf("sc", "b", "emom", "dips", 1, 8, 10, 0, stamp),
      perf("sc", "b", "emom", "dips", 2, 8, 10, 0, stamp),
    ],
  );
  const reversed: WorkoutSession = {
    ...same,
    performances: [...same.performances].reverse(),
  };
  const one = getWorkoutStats([same], templates).bestByExercise[0];
  const two = getWorkoutStats([reversed], templates).bestByExercise[0];
  assertEqual(
    one?.performanceId,
    "sc__b__2",
    "performanceId départage (ordre direct)",
  );
  assertEqual(
    two?.performanceId,
    "sc__b__2",
    "performanceId départage (ordre inverse)",
  );
});

test("statistiques: séances A et B comptabilisées séparément", () => {
  const full = getWorkoutStats(allSessions, templates);
  assertEqual(full.sessionsByCode.A, 2, "séances A");
  assertEqual(full.sessionsByCode.B, 1, "séances B");
  const onlyB = getWorkoutStats([s2], templates);
  assertEqual(onlyB.sessionsByCode.A, 0, "A");
  assertEqual(onlyB.sessionsByCode.B, 1, "B");
});

test("statistiques: template inconnu → comptée terminée, ni A ni B, sans crash", () => {
  const unknown = makeSession(
    "s13",
    "session_zzz",
    "completed",
    at(1) - 1_000,
    at(1),
    74,
    [perf("s13", "b", "emom", "dips", 1, 8, 9, 0, at(1) - 500)],
  );
  const stats = getWorkoutStats([unknown], templates);
  assertEqual(stats.completedSessions, 1, "comptée");
  assertEqual(stats.sessionsByCode.A, 0, "pas en A");
  assertEqual(stats.sessionsByCode.B, 0, "pas en B");
  assertEqual(stats.totalReps, 9, "reps comptées");
});

test("statistiques: aucun résultat sans NaN ni Infinity", () => {
  const stats = getWorkoutStats([], templates);
  assertEqual(stats.completedSessions, 0, "séances");
  assertEqual(stats.totalReps, 0, "reps");
  assertEqual(stats.totalPerformances, 0, "performances");
  assertTrue(Number.isFinite(stats.averageRepsPerPerformance), "moyenne finie");
  assertEqual(stats.averageRepsPerPerformance, 0, "moyenne vide = 0");
  assertEqual(stats.bestByExercise.length, 0, "aucun record");
});

/* ---------- Poids du corps ---------- */

test("poids: mesure correctement enregistrée", async () => {
  const repository = createWeightRepository(createMemoryStore());
  const added = await repository.addMeasurement({
    recordedAt: 1_000,
    weightKg: 74.2,
  });
  assertEqual(added.weightKg, 74.2, "poids retourné");
  const all = await repository.getMeasurements();
  assertEqual(all.length, 1, "une mesure");
  assertEqual(all[0]?.recordedAt, 1_000, "timestamp");
  assertEqual(all[0]?.weightKg, 74.2, "poids relu");
  assertEqual(await repository.getLatestWeightKg(), 74.2, "dernier poids");
});

test("poids: mesures invalides refusées (0, négatif, bornes, NaN, Infinity)", async () => {
  const repository = createWeightRepository(createMemoryStore());
  let rejected = 0;
  const invalid = [0, -5, 10, 900, Number.NaN, Number.POSITIVE_INFINITY];
  for (const weightKg of invalid) {
    try {
      await repository.addMeasurement({ recordedAt: 1_000, weightKg });
    } catch (error) {
      if (error instanceof WeightValidationError) {
        rejected += 1;
      }
    }
  }
  assertEqual(rejected, invalid.length, "toutes refusées");
  assertEqual(
    (await repository.getMeasurements()).length,
    0,
    "rien enregistré",
  );
  assertEqual(
    await repository.getLatestWeightKg(),
    null,
    "aucun dernier poids",
  );
});

test("poids: saisie utilisateur (74, 74.2, 74,2)", () => {
  assertEqual(parseWeightInput("74"), 74, "entier");
  assertEqual(parseWeightInput("74.2"), 74.2, "point");
  assertEqual(parseWeightInput("74,2"), 74.2, "virgule");
  assertEqual(parseWeightInput(" 80 "), 80, "espaces");
  assertEqual(parseWeightInput(""), null, "vide");
  assertEqual(parseWeightInput("abc"), null, "texte");
  assertEqual(parseWeightInput("10"), null, "trop bas");
  assertEqual(parseWeightInput("600"), null, "trop haut");
  assertEqual(parseWeightInput("74.25"), null, "trop de décimales");
});

test("poids: deux mesures au même timestamp sont toutes deux conservées", async () => {
  const repository = createWeightRepository(createMemoryStore());
  const first = await repository.addMeasurement({
    recordedAt: 5_000,
    weightKg: 74.2,
  });
  const second = await repository.addMeasurement({
    recordedAt: 5_000,
    weightKg: 73.9,
  });
  const third = await repository.addMeasurement({
    recordedAt: 5_000,
    weightKg: 74.0,
  });
  assertTrue(
    first.id !== second.id && second.id !== third.id && first.id !== third.id,
    "ids distincts",
  );
  const all = await repository.getMeasurements();
  assertEqual(all.length, 3, "aucune mesure écrasée");
  assertEqual(
    all
      .map((item) => item.weightKg)
      .sort()
      .join(","),
    "73.9,74,74.2",
    "poids tous conservés",
  );
  await repository.deleteMeasurement(second.id);
  const remaining = await repository.getMeasurements();
  assertEqual(remaining.length, 2, "suppression ciblée par id");
  assertTrue(
    remaining.every((item) => item.id !== second.id),
    "bonne mesure supprimée",
  );
});

test("poids: 12 mesures au même timestamp, ordre d’ajout respecté (_10 après _2)", async () => {
  const repository = createWeightRepository(createMemoryStore());
  for (let index = 0; index < 12; index += 1) {
    await repository.addMeasurement({
      recordedAt: 9_000,
      weightKg: 70 + index,
    });
  }
  const all = await repository.getMeasurements();
  assertEqual(all.length, 12, "douze mesures");
  assertEqual(new Set(all.map((item) => item.id)).size, 12, "ids uniques");
  assertEqual(
    all.map((item) => item.weightKg).join(","),
    "70,71,72,73,74,75,76,77,78,79,80,81",
    "ordre d’ajout conservé",
  );
  assertEqual(
    getLatestMeasurement(all)?.weightKg,
    81,
    "dernière mesure = dernière ajoutée",
  );
  assertEqual(
    await repository.getLatestWeightKg(),
    81,
    "getLatestWeightKg cohérent",
  );
});

test("poids: tri pur numériquement correct (weight_T_2 avant weight_T_10)", () => {
  const make = (id: string, weightKg: number): WeightMeasurement => ({
    id,
    recordedAt: 5_000,
    weightKg,
  });
  const shuffled = [
    make("weight_5000_10", 80),
    make("weight_5000_2", 71),
    make("weight_5000", 70),
    make("weight_5000_9", 79),
    make("weight_5000_3", 72),
  ];
  assertEqual(
    sortMeasurements(shuffled)
      .map((item) => item.id)
      .join(","),
    "weight_5000,weight_5000_2,weight_5000_3,weight_5000_9,weight_5000_10",
    "tri numérique",
  );
  assertEqual(getLatestMeasurement(shuffled)?.weightKg, 80, "dernière = _10");
});

test("poids: après suppression, un nouvel ajout au même instant reste le plus récent", async () => {
  const repository = createWeightRepository(createMemoryStore());
  const first = await repository.addMeasurement({
    recordedAt: 6_000,
    weightKg: 70,
  });
  await repository.addMeasurement({ recordedAt: 6_000, weightKg: 71 });
  await repository.deleteMeasurement(first.id);
  await repository.addMeasurement({ recordedAt: 6_000, weightKg: 72 });
  const all = await repository.getMeasurements();
  assertEqual(all.length, 2, "deux mesures");
  assertEqual(all.map((item) => item.weightKg).join(","), "71,72", "ordre");
  assertEqual(
    await repository.getLatestWeightKg(),
    72,
    "la nouvelle est la plus récente",
  );
});

test("poids: ajouts concurrents au même timestamp sans écrasement", async () => {
  const repository = createWeightRepository(createMemoryStore());
  await Promise.all([
    repository.addMeasurement({ recordedAt: 7_000, weightKg: 70 }),
    repository.addMeasurement({ recordedAt: 7_000, weightKg: 71 }),
    repository.addMeasurement({ recordedAt: 7_000, weightKg: 72 }),
  ]);
  const all = await repository.getMeasurements();
  assertEqual(all.length, 3, "trois mesures");
  assertEqual(new Set(all.map((item) => item.id)).size, 3, "ids uniques");
});

test("poids: mesures triées chronologiquement", async () => {
  const repository = createWeightRepository(createMemoryStore());
  await repository.addMeasurement({ recordedAt: 3_000, weightKg: 73.6 });
  await repository.addMeasurement({ recordedAt: 1_000, weightKg: 74.2 });
  await repository.addMeasurement({ recordedAt: 2_000, weightKg: 73.9 });
  const all = await repository.getMeasurements();
  assertEqual(
    all.map((item) => item.recordedAt).join(","),
    "1000,2000,3000",
    "ordre",
  );
  assertEqual(getLatestMeasurement(all)?.weightKg, 73.6, "dernière mesure");
  assertEqual(
    sortMeasurements([...all].reverse())
      .map((item) => item.recordedAt)
      .join(","),
    "1000,2000,3000",
    "tri pur",
  );
});

test("poids: historique par période", async () => {
  const repository = createWeightRepository(createMemoryStore());
  await repository.addMeasurement({ recordedAt: at(40), weightKg: 75.0 });
  await repository.addMeasurement({ recordedAt: at(5), weightKg: 74.2 });
  await repository.addMeasurement({ recordedAt: at(1), weightKg: 73.6 });
  const all = await repository.getMeasurements();
  assertEqual(getWeightHistory(all, 7, NOW).length, 2, "7 jours");
  assertEqual(getWeightHistory(all, 30, NOW).length, 2, "30 jours");
  assertEqual(getWeightHistory(all, 90, NOW).length, 3, "90 jours");
  assertEqual(
    getWeightHistory(all, 7, NOW + 400 * DAY_MS).length,
    0,
    "période vide",
  );
  assertEqual(getWeightHistory(all, 0, NOW).length, 0, "période de 0 jour");
});

test("poids: résumé (vide, une donnée, plusieurs, désordre, timestamps identiques)", () => {
  assertEqual(getWeightSummary([]), null, "vide");

  const single = getWeightSummary([
    { id: "weight_1", recordedAt: 1, weightKg: 74.2 },
  ]);
  assertEqual(single?.firstKg, 74.2, "une donnée : premier");
  assertEqual(single?.lastKg, 74.2, "une donnée : dernier");
  assertEqual(single?.minKg, 74.2, "une donnée : min");
  assertEqual(single?.maxKg, 74.2, "une donnée : max");
  assertEqual(single?.deltaKg, 0, "une donnée : variation nulle");

  const unordered: WeightMeasurement[] = [
    { id: "weight_3000", recordedAt: at(1), weightKg: 73.6 },
    { id: "weight_1000", recordedAt: at(40), weightKg: 75.0 },
    { id: "weight_2000", recordedAt: at(5), weightKg: 74.2 },
  ];
  const summary = getWeightSummary(getWeightHistory(unordered, 90, NOW));
  assertEqual(summary?.firstKg, 75.0, "désordre : premier");
  assertEqual(summary?.lastKg, 73.6, "désordre : dernier");
  assertEqual(summary?.minKg, 73.6, "min");
  assertEqual(summary?.maxKg, 75.0, "max");
  assertEqual(summary?.deltaKg, -1.4, "variation arrondie à une décimale");

  const ties: WeightMeasurement[] = [
    { id: "weight_50_2", recordedAt: 50, weightKg: 70.0 },
    { id: "weight_50", recordedAt: 50, weightKg: 71.0 },
  ];
  const tied = getWeightSummary(getWeightHistory(ties, 1, 50));
  assertEqual(
    tied?.firstKg,
    71.0,
    "timestamps identiques : premier = id de rang 1",
  );
  assertEqual(tied?.lastKg, 70.0, "timestamps identiques : dernier = rang 2");
  assertEqual(tied?.deltaKg, -1, "timestamps identiques : variation");
});

test("poids: suppression d’une mesure", async () => {
  const repository = createWeightRepository(createMemoryStore());
  const first = await repository.addMeasurement({
    recordedAt: 1_000,
    weightKg: 74.2,
  });
  await repository.addMeasurement({ recordedAt: 2_000, weightKg: 73.9 });
  await repository.deleteMeasurement(first.id);
  const all = await repository.getMeasurements();
  assertEqual(all.length, 1, "une mesure restante");
  assertEqual(all[0]?.recordedAt, 2_000, "bonne mesure conservée");
  await repository.deleteMeasurement("weight_inexistant");
  assertEqual(
    (await repository.getMeasurements()).length,
    1,
    "id inconnu ignoré",
  );
});

test("poids: normalisation de la courbe (bornée, sans NaN, série plate, liste vide)", () => {
  assertEqual(normalizeSeries([]).length, 0, "liste vide");
  const flat = normalizeSeries([70, 70, 70]);
  assertTrue(
    flat.every((value) => value === 0.6),
    "série plate = 0.6",
  );
  const single = normalizeSeries([74.2]);
  assertTrue(single.length === 1 && single[0] === 0.6, "un seul point = 0.6");
  const varied = normalizeSeries([70, 72, 71, 74]);
  assertTrue(
    varied.every(
      (value) =>
        Number.isFinite(value) && value >= 0.12 - 1e-9 && value <= 1 + 1e-9,
    ),
    "valeurs bornées dans [0.12 ; 1]",
  );
  assertTrue(Math.abs(Math.min(...varied) - 0.12) < 1e-9, "minimum à 0.12");
  assertTrue(Math.abs(Math.max(...varied) - 1) < 1e-9, "maximum à 1");
  assertTrue(
    normalizeSeries([1e-12, 2e-12]).every((value) => Number.isFinite(value)),
    "écart minuscule sans NaN",
  );
});

test("poids: données corrompues ignorées sans planter", async () => {
  const store = createMemoryStore();
  const corrupt: unknown[] = [
    { id: "weight_1000", recordedAt: 1_000, weightKg: 74.2 },
    { id: "x", recordedAt: -1, weightKg: "abc" },
    { id: "", recordedAt: 2_000, weightKg: 74 },
    { id: "weight_3000", recordedAt: 3_000, weightKg: Number.NaN },
    null,
    5,
    "texte",
  ];
  await store.setItem("body_weight:measurements", corrupt);
  const repository = createWeightRepository(store);
  const all = await repository.getMeasurements();
  assertEqual(all.length, 1, "seule l’entrée valide est conservée");
  assertEqual(all[0]?.weightKg, 74.2, "entrée valide relue");
  assertEqual(
    await repository.getLatestWeightKg(),
    74.2,
    "dernier poids valide",
  );

  const notAnArray = createMemoryStore();
  await notAnArray.setItem("body_weight:measurements", { oups: true });
  assertEqual(
    (await createWeightRepository(notAnArray).getMeasurements()).length,
    0,
    "valeur non-tableau = liste vide",
  );
});

/* ---------- Snapshot du poids dans la séance ---------- */

test("snapshot: initialisation depuis le dernier poids, immutabilité, nouvelle séance", async () => {
  const store = createMemoryStore();
  const workouts = createWorkoutRepository(store);
  const weights = createWeightRepository(store);
  const readLatest = (): Promise<number | null> => weights.getLatestWeightKg();

  await weights.addMeasurement({ recordedAt: 1_000, weightKg: 74.2 });

  const first = await startWorkoutSession(workouts, {
    templateId: "session_a",
    now: 2_000,
    readLatestBodyweightKg: readLatest,
  });
  assertEqual(first.bodyweightKg, 74.2, "séance A initialisée avec 74.2");
  assertEqual(first.status, "in_progress", "séance en cours");
  assertEqual(
    (await workouts.getSession(first.id))?.bodyweightKg,
    74.2,
    "snapshot persisté",
  );

  const withPerformance = recordPerformance(first, {
    blockId: "session_a_emom",
    blockType: "emom",
    exerciseId: "pull_up_pronation",
    order: 1,
    targetReps: 6,
    actualReps: 6,
    externalLoadKg: 0,
    now: 2_500,
  });
  assertEqual(
    withPerformance.performances[0]?.bodyweightKg,
    74.2,
    "performance = snapshot de la séance",
  );

  await weights.addMeasurement({ recordedAt: 3_000, weightKg: 75.0 });
  assertEqual(
    (await workouts.getSession(first.id))?.bodyweightKg,
    74.2,
    "ancienne séance inchangée",
  );

  const second = await startWorkoutSession(workouts, {
    templateId: "session_b",
    now: 4_000,
    readLatestBodyweightKg: readLatest,
  });
  assertEqual(second.bodyweightKg, 75.0, "nouvelle séance = 75.0");
  assertEqual(
    (await workouts.getSession(second.id))?.bodyweightKg,
    75.0,
    "nouveau snapshot persisté",
  );

  await workouts.saveSession(completeSession(withPerformance, 5_000));
  const history = await workouts.getCompletedSessions();
  assertEqual(history.length, 1, "séance A terminée dans l’historique");
  assertEqual(history[0]?.bodyweightKg, 74.2, "historique : 74.2");
  assertEqual(
    history[0]?.performances[0]?.bodyweightKg,
    74.2,
    "historique : performance à 74.2",
  );
  assertEqual(
    (await workouts.getSession(second.id))?.bodyweightKg,
    75.0,
    "séance B toujours à 75.0",
  );
});

test("snapshot: aucune mesure, lecture en échec ou valeur invalide → null, sans crash", async () => {
  const store = createMemoryStore();
  const workouts = createWorkoutRepository(store);
  const weights = createWeightRepository(store);

  const none = await startWorkoutSession(workouts, {
    templateId: "session_a",
    now: 1_000,
    readLatestBodyweightKg: () => weights.getLatestWeightKg(),
  });
  assertEqual(none.bodyweightKg, null, "aucune mesure");

  const failing = await startWorkoutSession(workouts, {
    templateId: "session_a",
    now: 2_000,
    readLatestBodyweightKg: () =>
      Promise.reject(new Error("lecture impossible")),
  });
  assertEqual(failing.bodyweightKg, null, "lecture en échec");
  assertEqual(
    (await workouts.getSession(failing.id))?.status,
    "in_progress",
    "séance quand même créée",
  );

  const invalid = await startWorkoutSession(workouts, {
    templateId: "session_b",
    now: 3_000,
    readLatestBodyweightKg: () => Promise.resolve(Number.NaN),
  });
  assertEqual(invalid.bodyweightKg, null, "valeur invalide");
});

test("poids: une ancienne séance conserve son poids historique", async () => {
  const store = createMemoryStore();
  const workouts = createWorkoutRepository(store);
  const weights = createWeightRepository(store);
  const start = at(5);
  const monday = makeSession(
    "session_a_old",
    "session_a",
    "completed",
    start,
    start + 3_600_000,
    74.2,
    [
      perf(
        "session_a_old",
        "session_a_emom",
        "emom",
        "pull_up_pronation",
        1,
        6,
        6,
        0,
        start + 1_000,
      ),
    ],
  );
  await workouts.saveSession(monday);
  await weights.addMeasurement({ recordedAt: at(3), weightKg: 73.6 });
  await weights.addMeasurement({ recordedAt: at(3), weightKg: 73.4 });
  const reloaded = await workouts.getSession("session_a_old");
  assertEqual(reloaded?.bodyweightKg, 74.2, "poids de la séance inchangé");
  assertEqual(
    (await weights.getMeasurements()).length,
    2,
    "nouvelles mesures conservées",
  );
  const completed = await workouts.getCompletedSessions();
  assertEqual(completed.length, 1, "séance terminée listée par le repository");
  assertEqual(
    completed[0]?.bodyweightKg,
    74.2,
    "snapshot conservé dans l’historique",
  );
});
