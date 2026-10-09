import type { KeyValueStore } from "../../storage/types";
import { formatIndicatorValue } from "../../utils/compositionPresentation";
import {
  MAX_PERCENT_CHANGE,
  MIN_PERCENT_BASE,
  COMPOSITION_BOUNDS,
  COMPOSITION_INDICATORS,
  COMPOSITION_MEASUREMENTS_KEY,
  CompositionValidationError,
  calculateIndicatorChange,
  createBodyCompositionRepository,
  createCompositionId,
  getAllTrends,
  getCompositionHistory,
  getIndicatorTrend,
  getLatestValues,
  getLatestWithIndicator,
  parseIndicatorInput,
  sortCompositionMeasurements,
  validateCompositionMeasurement,
  type BodyCompositionMeasurement,
  type CompositionIndicator,
  type NewCompositionInput,
} from "../body/composition";
import { createWeightRepository } from "../body/weightRepository";
import { SEED_EXERCISES } from "../exercises/catalog";
import { buildRecommendations } from "../progression";
import { DAY_MS } from "../stats/period";
import { getWorkoutStats } from "../stats/workoutStats";
import { SEED_WORKOUT_TEMPLATES } from "../workouts/seed";
import type { PerformanceEntry, WorkoutSession } from "../workouts/types";
import {
  createWorkoutRepository,
  startWorkoutSession,
} from "../workouts/workoutRepository";
import { assertEqual, assertTrue, test } from "./harness";

const NOW = 1_800_000_000_000;
const at = (daysAgo: number): number => NOW - daysAgo * DAY_MS;

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

type Values = Partial<Record<CompositionIndicator, number>>;

const make = (
  id: string,
  recordedAt: number,
  values: Values = {},
): BodyCompositionMeasurement => ({
  id,
  recordedAt,
  bodyFatPercent: values.bodyFatPercent ?? null,
  muscleMassKg: values.muscleMassKg ?? null,
  bmi: values.bmi ?? null,
  visceralFatIndex: values.visceralFatIndex ?? null,
  waterPercent: values.waterPercent ?? null,
});

const only = (
  indicator: CompositionIndicator,
  value: number,
): BodyCompositionMeasurement => {
  const values: Values = {};
  values[indicator] = value;
  return make("composition_1000", 1_000, values);
};

/** Fabrique une mesure aux valeurs arbitraires (y compris invalides) sans `any`. */
const variant = (
  overrides: Record<string, unknown>,
): BodyCompositionMeasurement =>
  Object.assign(
    {},
    make("composition_1000", 1_000, { bodyFatPercent: 20 }),
    overrides,
  );

const refused = (measurement: BodyCompositionMeasurement): boolean =>
  !validateCompositionMeasurement(measurement).isValid;

const allFinite = (value: unknown): boolean => {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((item) => allFinite(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).every((item) => allFinite(item));
  }
  return true;
};

/* Jeu de données : indicateurs enregistrés à des dates différentes. */
const dataset = (): BodyCompositionMeasurement[] => [
  make("composition_a", at(40), { bodyFatPercent: 22.0, muscleMassKg: 60.0 }),
  make("composition_b", at(20), { bodyFatPercent: 21.0 }),
  make("composition_c", at(10), { muscleMassKg: 61.0, waterPercent: 55.0 }),
  make("composition_d", at(5), { bodyFatPercent: 20.5, bmi: 23.0 }),
  make("composition_e", at(1), { bodyFatPercent: 20.0 }),
];

/* ---------- Validation ---------- */

test("composition: chaque indicateur accepte ses bornes min et max", () => {
  for (const indicator of COMPOSITION_INDICATORS) {
    const { min, max } = COMPOSITION_BOUNDS[indicator];
    assertTrue(
      validateCompositionMeasurement(only(indicator, min)).isValid,
      `${indicator} min`,
    );
    assertTrue(
      validateCompositionMeasurement(only(indicator, max)).isValid,
      `${indicator} max`,
    );
  }
});

test("composition: valeurs hors bornes refusées pour chaque indicateur", () => {
  for (const indicator of COMPOSITION_INDICATORS) {
    const { min, max } = COMPOSITION_BOUNDS[indicator];
    assertTrue(refused(only(indicator, min - 0.1)), `${indicator} sous le min`);
    assertTrue(
      refused(only(indicator, max + 0.1)),
      `${indicator} au-dessus du max`,
    );
    assertTrue(refused(only(indicator, 0)), `${indicator} zéro`);
    assertTrue(refused(only(indicator, -5)), `${indicator} négatif`);
  }
});

test("composition: une décimale maximale", () => {
  assertTrue(
    validateCompositionMeasurement(only("bodyFatPercent", 18)).isValid,
    "18",
  );
  assertTrue(
    validateCompositionMeasurement(only("bodyFatPercent", 18.2)).isValid,
    "18.2",
  );
  assertTrue(refused(only("bodyFatPercent", 18.25)), "18.25 refusé");
  assertTrue(
    validateCompositionMeasurement(only("visceralFatIndex", 9.5)).isValid,
    "indice 9.5",
  );
  assertTrue(refused(only("visceralFatIndex", 9.55)), "indice 9.55 refusé");
});

test("composition: valeurs non finies ou non numériques refusées", () => {
  for (const indicator of COMPOSITION_INDICATORS) {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "20",
      undefined,
    ]) {
      assertTrue(
        refused(variant({ [indicator]: bad })),
        `${indicator} = ${String(bad)}`,
      );
    }
  }
});

test("composition: mesure vide refusée", () => {
  assertTrue(refused(make("composition_1", 1, {})), "aucun indicateur");
  assertTrue(
    !validateCompositionMeasurement(make("composition_1", 1, {})).isValid,
    "invalide",
  );
});

test("composition: champs facultatifs indépendants (un seul indicateur suffit)", () => {
  for (const indicator of COMPOSITION_INDICATORS) {
    const measurement = only(indicator, COMPOSITION_BOUNDS[indicator].min);
    assertTrue(
      validateCompositionMeasurement(measurement).isValid,
      `${indicator} seul`,
    );
    const others = COMPOSITION_INDICATORS.filter(
      (other) => other !== indicator,
    );
    assertTrue(
      others.every((other) => measurement[other] === null),
      `${indicator} : autres à null`,
    );
  }
  assertTrue(
    validateCompositionMeasurement(
      make("composition_2", 2, { bodyFatPercent: 20, waterPercent: 55 }),
    ).isValid,
    "deux indicateurs",
  );
});

test("composition: timestamps et id invalides refusés", () => {
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assertTrue(
      refused(variant({ recordedAt: bad })),
      `recordedAt ${String(bad)}`,
    );
  }
  assertTrue(refused(variant({ id: "" })), "id vide");
});

test("composition: saisie utilisateur (virgule ou point, champ vide = absent)", () => {
  const value = (
    indicator: CompositionIndicator,
    text: string,
  ): number | null => {
    const parsed = parseIndicatorInput(indicator, text);
    return parsed.kind === "value" ? parsed.value : null;
  };
  assertEqual(value("bodyFatPercent", "18,5"), 18.5, "virgule");
  assertEqual(value("bodyFatPercent", "18.5"), 18.5, "point");
  assertEqual(value("bodyFatPercent", " 20 "), 20, "espaces");
  assertEqual(value("visceralFatIndex", "9"), 9, "indice entier");
  assertEqual(value("visceralFatIndex", "9,5"), 9.5, "indice décimal");
  assertEqual(parseIndicatorInput("bmi", "").kind, "empty", "vide");
  assertEqual(parseIndicatorInput("bmi", "   ").kind, "empty", "espaces seuls");
  assertEqual(parseIndicatorInput("bmi", "abc").kind, "invalid", "texte");
  assertEqual(
    parseIndicatorInput("bodyFatPercent", "18.55").kind,
    "invalid",
    "deux décimales",
  );
  assertEqual(
    parseIndicatorInput("bodyFatPercent", "0.5").kind,
    "invalid",
    "sous le min",
  );
  assertEqual(
    parseIndicatorInput("bodyFatPercent", "80").kind,
    "invalid",
    "au-dessus du max",
  );
});

/* ---------- Repository ---------- */

test("composition: mesure enregistrée puis relue, champs absents à null", async () => {
  const repository = createBodyCompositionRepository(createMemoryStore());
  const added = await repository.add({
    recordedAt: 1_000,
    bodyFatPercent: 18.5,
    waterPercent: 55,
  });
  assertEqual(added.id, "composition_1000", "id");
  const all = await repository.getAll();
  assertEqual(all.length, 1, "une mesure");
  assertEqual(all[0]?.bodyFatPercent, 18.5, "masse grasse relue");
  assertEqual(all[0]?.waterPercent, 55, "eau relue");
  assertEqual(all[0]?.muscleMassKg, null, "muscle absent = null");
  assertEqual(all[0]?.bmi, null, "IMC absent = null");
  assertEqual(all[0]?.visceralFatIndex, null, "viscéral absent = null");
  assertEqual(
    (await repository.getById(added.id))?.recordedAt,
    1_000,
    "getById",
  );
  assertEqual(
    await repository.getById("composition_inconnue"),
    null,
    "introuvable",
  );
});

test("composition: mesures invalides refusées sans rien enregistrer", async () => {
  const repository = createBodyCompositionRepository(createMemoryStore());
  const inputs: NewCompositionInput[] = [
    { recordedAt: 1_000 },
    { recordedAt: 1_000, bodyFatPercent: 80 },
    { recordedAt: 1_000, waterPercent: 10 },
    { recordedAt: -1, bmi: 22 },
    { recordedAt: 1_000, muscleMassKg: Number.NaN },
    { recordedAt: 1_000, visceralFatIndex: 9.55 },
  ];
  let rejected = 0;
  for (const input of inputs) {
    try {
      await repository.add(input);
    } catch (error) {
      if (error instanceof CompositionValidationError) {
        rejected += 1;
      }
    }
  }
  assertEqual(rejected, inputs.length, "toutes refusées");
  assertEqual((await repository.getAll()).length, 0, "rien enregistré");
});

test("composition: trois mesures au même timestamp toutes conservées", async () => {
  const repository = createBodyCompositionRepository(createMemoryStore());
  const first = await repository.add({ recordedAt: 5_000, bodyFatPercent: 20 });
  const second = await repository.add({ recordedAt: 5_000, muscleMassKg: 60 });
  const third = await repository.add({ recordedAt: 5_000, waterPercent: 55 });
  assertTrue(
    first.id !== second.id && second.id !== third.id && first.id !== third.id,
    "ids distincts",
  );
  const all = await repository.getAll();
  assertEqual(all.length, 3, "aucune écrasée");
  assertEqual(
    all.map((item) => item.id).join(","),
    "composition_5000,composition_5000_2,composition_5000_3",
    "ids",
  );
});

test("composition: 12 mesures au même timestamp, ordre numérique (_10 après _2)", async () => {
  const repository = createBodyCompositionRepository(createMemoryStore());
  for (let index = 0; index < 12; index += 1) {
    await repository.add({ recordedAt: 9_000, bodyFatPercent: 10 + index });
  }
  const all = await repository.getAll();
  assertEqual(all.length, 12, "douze mesures");
  assertEqual(new Set(all.map((item) => item.id)).size, 12, "ids uniques");
  assertEqual(
    all.map((item) => item.bodyFatPercent).join(","),
    "10,11,12,13,14,15,16,17,18,19,20,21",
    "ordre d’ajout conservé",
  );
  assertEqual(
    getLatestWithIndicator(all, "bodyFatPercent")?.value,
    21,
    "dernière = dernière ajoutée",
  );
  assertEqual(
    createCompositionId(9_000, new Set(all.map((item) => item.id))),
    "composition_9000_13",
    "rang suivant",
  );
});

test("composition: écritures concurrentes sans écrasement", async () => {
  const repository = createBodyCompositionRepository(createMemoryStore());
  await Promise.all([
    repository.add({ recordedAt: 7_000, bodyFatPercent: 20 }),
    repository.add({ recordedAt: 7_000, muscleMassKg: 60 }),
    repository.add({ recordedAt: 7_000, waterPercent: 55 }),
    repository.add({ recordedAt: 8_000, bmi: 23 }),
  ]);
  const all = await repository.getAll();
  assertEqual(all.length, 4, "quatre mesures");
  assertEqual(new Set(all.map((item) => item.id)).size, 4, "ids uniques");
  assertEqual(
    all
      .map(
        (item) =>
          item.bodyFatPercent ??
          item.muscleMassKg ??
          item.waterPercent ??
          item.bmi,
      )
      .sort((a, b) => (a ?? 0) - (b ?? 0))
      .join(","),
    "20,23,55,60",
    "toutes les valeurs conservées",
  );
});

test("composition: suppression sans altérer les autres mesures", async () => {
  const repository = createBodyCompositionRepository(createMemoryStore());
  const a = await repository.add({
    recordedAt: 1_000,
    bodyFatPercent: 20,
    muscleMassKg: 60,
  });
  const b = await repository.add({ recordedAt: 2_000, waterPercent: 55 });
  const c = await repository.add({ recordedAt: 3_000, bmi: 23.4 });
  await repository.delete(b.id);
  const remaining = await repository.getAll();
  assertEqual(
    JSON.stringify(remaining),
    JSON.stringify([a, c]),
    "les autres mesures sont identiques",
  );
  assertEqual(await repository.getById(b.id), null, "supprimée");
  await repository.delete("composition_inexistante");
  assertEqual((await repository.getAll()).length, 2, "id inconnu ignoré");
});

test("composition: données corrompues ignorées sans planter", async () => {
  const store = createMemoryStore();
  const good = make("composition_1000", 1_000, { bodyFatPercent: 20 });
  const corrupt: unknown[] = [
    good,
    make("composition_2", 2, {}),
    variant({ id: "composition_3", bmi: 999 }),
    variant({ id: "composition_4", bodyFatPercent: "abc" }),
    { id: "composition_5", recordedAt: 5, bodyFatPercent: 20 },
    null,
    5,
    "texte",
  ];
  await store.setItem(COMPOSITION_MEASUREMENTS_KEY, corrupt);
  const all = await createBodyCompositionRepository(store).getAll();
  assertEqual(all.length, 1, "seule l’entrée valide est conservée");
  assertEqual(all[0]?.id, "composition_1000", "bonne entrée");

  const notAnArray = createMemoryStore();
  await notAnArray.setItem(COMPOSITION_MEASUREMENTS_KEY, { oups: true });
  assertEqual(
    (await createBodyCompositionRepository(notAnArray).getAll()).length,
    0,
    "valeur non-tableau = liste vide",
  );
});

test("composition: persistance relue par une nouvelle instance du repository", async () => {
  const store = createMemoryStore();
  const added = await createBodyCompositionRepository(store).add({
    recordedAt: 4_000,
    muscleMassKg: 61.5,
  });
  const reloaded = await createBodyCompositionRepository(store).getAll();
  assertEqual(
    JSON.stringify(reloaded),
    JSON.stringify([added]),
    "identique après rechargement",
  );
});

/* ---------- Dernières valeurs par indicateur ---------- */

test("composition: dernière valeur de chaque indicateur, enregistrées à des dates différentes", () => {
  const latest = getLatestValues(dataset());
  assertEqual(latest.bodyFatPercent?.value, 20.0, "masse grasse");
  assertEqual(latest.bodyFatPercent?.recordedAt, at(1), "date masse grasse");
  assertEqual(
    latest.muscleMassKg?.value,
    61.0,
    "muscle (mesure plus ancienne)",
  );
  assertEqual(latest.muscleMassKg?.recordedAt, at(10), "date muscle");
  assertEqual(latest.waterPercent?.value, 55.0, "eau");
  assertEqual(latest.waterPercent?.recordedAt, at(10), "date eau");
  assertEqual(latest.bmi?.value, 23.0, "IMC");
  assertEqual(
    latest.bmi?.measurementId,
    "composition_d",
    "mesure source de l’IMC",
  );
  assertEqual(latest.visceralFatIndex, null, "indicateur jamais mesuré");
});

test("composition: une mesure partielle ne remplace ni n’invalide les autres indicateurs", () => {
  const before = getLatestValues(dataset());
  const withPartial = [
    ...dataset(),
    make("composition_f", at(0), { bodyFatPercent: 19.5 }),
  ];
  const after = getLatestValues(withPartial);
  assertEqual(after.bodyFatPercent?.value, 19.5, "masse grasse mise à jour");
  assertEqual(
    after.muscleMassKg?.value,
    before.muscleMassKg?.value,
    "muscle inchangé",
  );
  assertEqual(
    after.waterPercent?.value,
    before.waterPercent?.value,
    "eau inchangée",
  );
  assertEqual(after.bmi?.value, before.bmi?.value, "IMC inchangé");
  assertEqual(
    after.muscleMassKg?.recordedAt,
    at(10),
    "date du muscle conservée",
  );
});

test("composition: égalité de timestamp, la dernière ajoutée gagne (_10 > _2)", () => {
  const items = [
    make("composition_5000_10", 5_000, { bodyFatPercent: 30 }),
    make("composition_5000_2", 5_000, { bodyFatPercent: 21 }),
    make("composition_5000", 5_000, { bodyFatPercent: 20 }),
  ];
  assertEqual(
    getLatestWithIndicator(items, "bodyFatPercent")?.value,
    30,
    "rang 10",
  );
  assertEqual(
    sortCompositionMeasurements(items)
      .map((item) => item.id)
      .join(","),
    "composition_5000,composition_5000_2,composition_5000_10",
    "tri numérique",
  );
});

/* ---------- Périodes ---------- */

test("composition: périodes 7/30/90 jours et frontières", () => {
  const items = [
    at(7),
    at(7) - 1,
    at(30),
    at(30) - 1,
    at(90),
    at(90) - 1,
    NOW,
    NOW + 1,
  ].map((timestamp) =>
    make(`composition_${timestamp}`, timestamp, { bodyFatPercent: 20 }),
  );
  const times = (days: number): number[] =>
    getCompositionHistory(items, days, NOW).map((item) => item.recordedAt);

  assertEqual(times(7).length, 2, "7 jours : at(7) et now");
  assertTrue(times(7).includes(at(7)), "7 jours : frontière incluse");
  assertTrue(!times(7).includes(at(7) - 1), "7 jours : juste avant exclu");
  assertEqual(times(30).length, 4, "30 jours");
  assertTrue(times(30).includes(at(30)), "30 jours : frontière incluse");
  assertTrue(!times(30).includes(at(30) - 1), "30 jours : juste avant exclu");
  assertEqual(times(90).length, 6, "90 jours");
  assertTrue(times(90).includes(at(90)), "90 jours : frontière incluse");
  assertTrue(!times(90).includes(at(90) - 1), "90 jours : juste avant exclu");
  assertTrue(!times(90).includes(NOW + 1), "futur exclu");
  const ascending = times(90);
  assertEqual(
    ascending.join(","),
    [...ascending].sort((a, b) => a - b).join(","),
    "ordre croissant",
  );
});

test("composition: période vide ou invalide → liste vide", () => {
  assertEqual(getCompositionHistory([], 7, NOW).length, 0, "entrée vide");
  assertEqual(
    getCompositionHistory(dataset(), 0, NOW).length,
    0,
    "durée nulle",
  );
  assertEqual(
    getCompositionHistory(dataset(), -3, NOW).length,
    0,
    "durée négative",
  );
  assertEqual(
    getCompositionHistory(dataset(), Number.NaN, NOW).length,
    0,
    "durée NaN",
  );
  assertEqual(
    getCompositionHistory(dataset(), 7, NOW + 400 * DAY_MS).length,
    0,
    "période sans mesure",
  );
});

/* ---------- Tendances ---------- */

test("composition: tendances 7/30/90 jours calculées par indicateur", () => {
  const items = dataset();
  const fat7 = getIndicatorTrend(items, "bodyFatPercent", 7, NOW);
  assertEqual(fat7?.pointCount, 2, "7 j : deux valeurs");
  assertEqual(fat7?.fromValue, 20.5, "7 j : départ");
  assertEqual(fat7?.toValue, 20.0, "7 j : arrivée");
  assertEqual(fat7?.absoluteChange, -0.5, "7 j : absolu");
  assertEqual(fat7?.percentChange, -2.4, "7 j : pourcentage");

  const fat30 = getIndicatorTrend(items, "bodyFatPercent", 30, NOW);
  assertEqual(fat30?.pointCount, 3, "30 j : trois valeurs");
  assertEqual(fat30?.fromValue, 21.0, "30 j : départ");
  assertEqual(fat30?.absoluteChange, -1, "30 j : absolu");
  assertEqual(fat30?.percentChange, -4.8, "30 j : pourcentage");

  const fat90 = getIndicatorTrend(items, "bodyFatPercent", 90, NOW);
  assertEqual(fat90?.pointCount, 4, "90 j : quatre valeurs");
  assertEqual(fat90?.fromValue, 22.0, "90 j : départ");
  assertEqual(fat90?.fromAt, at(40), "90 j : date de départ");
  assertEqual(fat90?.toAt, at(1), "90 j : date d’arrivée");
  assertEqual(fat90?.absoluteChange, -2, "90 j : absolu");
  assertEqual(fat90?.percentChange, -9.1, "90 j : pourcentage");
});

test("composition: au moins deux valeurs de l’indicateur pour une tendance", () => {
  const items = dataset();
  assertEqual(
    getIndicatorTrend(items, "muscleMassKg", 7, NOW),
    null,
    "muscle 7 j : aucune valeur",
  );
  assertEqual(
    getIndicatorTrend(items, "muscleMassKg", 30, NOW),
    null,
    "muscle 30 j : une seule valeur",
  );
  const muscle90 = getIndicatorTrend(items, "muscleMassKg", 90, NOW);
  assertEqual(muscle90?.absoluteChange, 1, "muscle 90 j : deux valeurs");
  assertEqual(muscle90?.percentChange, 1.7, "muscle 90 j : pourcentage");
  assertEqual(
    getIndicatorTrend(items, "waterPercent", 90, NOW),
    null,
    "eau : une valeur",
  );
  assertEqual(
    getIndicatorTrend(items, "bmi", 90, NOW),
    null,
    "IMC : une valeur",
  );
  assertEqual(
    getIndicatorTrend(items, "visceralFatIndex", 90, NOW),
    null,
    "viscéral : aucune valeur",
  );
  assertEqual(
    getIndicatorTrend([], "bodyFatPercent", 90, NOW),
    null,
    "aucune mesure",
  );
});

test("composition: évolution calculée uniquement à partir des valeurs de l’indicateur concerné", () => {
  const items = [
    make("composition_1", at(20), { bodyFatPercent: 20, muscleMassKg: 60 }),
    make("composition_2", at(15), { waterPercent: 50 }),
    make("composition_3", at(10), { muscleMassKg: 62 }),
    make("composition_4", at(5), { bmi: 25, waterPercent: 52 }),
    make("composition_5", at(1), { bodyFatPercent: 18 }),
  ];
  const fat = getIndicatorTrend(items, "bodyFatPercent", 30, NOW);
  assertEqual(fat?.fromValue, 20, "masse grasse : départ");
  assertEqual(fat?.toValue, 18, "masse grasse : arrivée");
  assertEqual(fat?.absoluteChange, -2, "masse grasse : absolu");
  assertEqual(fat?.percentChange, -10, "masse grasse : pourcentage");
  const muscle = getIndicatorTrend(items, "muscleMassKg", 30, NOW);
  assertEqual(muscle?.fromValue, 60, "muscle : départ");
  assertEqual(muscle?.toValue, 62, "muscle : arrivée");
  assertEqual(muscle?.absoluteChange, 2, "muscle : absolu");
  assertEqual(muscle?.percentChange, 3.3, "muscle : pourcentage");
  const water = getIndicatorTrend(items, "waterPercent", 30, NOW);
  assertEqual(water?.absoluteChange, 2, "eau : absolu");
  assertEqual(
    getIndicatorTrend(items, "bmi", 30, NOW),
    null,
    "IMC : une seule valeur",
  );
});

test("composition: évolution absolue et en pourcentage", () => {
  const up = calculateIndicatorChange(60, 63);
  assertEqual(up?.absolute, 3, "absolu positif");
  assertEqual(up?.percent, 5, "pourcentage positif");
  const down = calculateIndicatorChange(25, 22.5);
  assertEqual(down?.absolute, -2.5, "absolu négatif");
  assertEqual(down?.percent, -10, "pourcentage négatif");
  const flat = calculateIndicatorChange(20, 20);
  assertEqual(flat?.absolute, 0, "aucune variation");
  assertEqual(flat?.percent, 0, "aucune variation en %");
  assertEqual(
    calculateIndicatorChange(20.04, 20)?.absolute,
    0,
    "arrondi sans -0",
  );
});

test("composition: dénominateur nul ou invalide, sans division par zéro", () => {
  const fromZero = calculateIndicatorChange(0, 5);
  assertEqual(fromZero?.absolute, 5, "départ 0 : absolu calculé");
  assertEqual(fromZero?.percent, null, "départ 0 : pas de pourcentage");
  assertEqual(
    calculateIndicatorChange(-3, 5)?.percent,
    null,
    "départ négatif : pas de pourcentage",
  );
  assertEqual(calculateIndicatorChange(Number.NaN, 5), null, "départ NaN");
  assertEqual(
    calculateIndicatorChange(5, Number.POSITIVE_INFINITY),
    null,
    "arrivée infinie",
  );
  assertEqual(
    calculateIndicatorChange(Number.NEGATIVE_INFINITY, 5),
    null,
    "départ infini",
  );
  assertEqual(
    calculateIndicatorChange(1e-300, 5)?.percent,
    null,
    "pourcentage non fini écarté",
  );
});

test("composition: limites du pourcentage (base minimale, plafond), absolu conservé", () => {
  const tiny = calculateIndicatorChange(1e-300, 5);
  assertEqual(
    tiny?.percent,
    null,
    "dénominateur microscopique : pas de pourcentage",
  );
  assertEqual(
    tiny?.absolute,
    5,
    "dénominateur microscopique : absolu conservé",
  );

  const belowBase = calculateIndicatorChange(MIN_PERCENT_BASE / 2, 5);
  assertEqual(belowBase?.percent, null, "sous la base minimale");
  const atBase = calculateIndicatorChange(
    MIN_PERCENT_BASE,
    MIN_PERCENT_BASE * 2,
  );
  assertEqual(atBase?.percent, 100, "à la base minimale : pourcentage calculé");

  const atCap = calculateIndicatorChange(1, 1 + MAX_PERCENT_CHANGE / 100);
  assertEqual(atCap?.percent, MAX_PERCENT_CHANGE, "au plafond : conservé");
  const aboveCap = calculateIndicatorChange(1, 12.1);
  assertEqual(aboveCap?.percent, null, "au-dessus du plafond : écarté");
  assertEqual(
    aboveCap?.absolute,
    11.1,
    "au-dessus du plafond : absolu conservé",
  );
  assertEqual(
    calculateIndicatorChange(1, -20)?.percent,
    null,
    "chute au-delà du plafond négatif ? non : -2100 %",
  );

  const huge = calculateIndicatorChange(-Number.MAX_VALUE, Number.MAX_VALUE);
  assertEqual(huge, null, "différence non finie : aucune évolution");
  assertTrue(
    allFinite(calculateIndicatorChange(1e-300, 5)),
    "aucun NaN ni Infinity",
  );
  assertEqual(
    calculateIndicatorChange(20, 18)?.percent,
    -10,
    "cas normal inchangé",
  );
});

test("composition: ordre déterministe, indépendant de l’ordre d’entrée", () => {
  const items = dataset();
  const reversed = [...items].reverse();
  assertEqual(
    JSON.stringify(sortCompositionMeasurements(reversed)),
    JSON.stringify(sortCompositionMeasurements(items)),
    "tri",
  );
  assertEqual(
    JSON.stringify(getAllTrends(reversed, 90, NOW)),
    JSON.stringify(getAllTrends(items, 90, NOW)),
    "tendances",
  );
  assertEqual(
    JSON.stringify(getLatestValues(reversed)),
    JSON.stringify(getLatestValues(items)),
    "dernières valeurs",
  );
  assertEqual(
    sortCompositionMeasurements(items)
      .map((item) => item.id)
      .join(","),
    "composition_a,composition_b,composition_c,composition_d,composition_e",
    "ordre chronologique",
  );
});

test("composition: aucun NaN ni Infinity dans les résultats", () => {
  assertTrue(allFinite(getAllTrends(dataset(), 90, NOW)), "tendances");
  assertTrue(allFinite(getLatestValues(dataset())), "dernières valeurs");
  assertTrue(allFinite(getAllTrends([], 90, NOW)), "aucune mesure : tendances");
  assertTrue(
    allFinite(getLatestValues([])),
    "aucune mesure : dernières valeurs",
  );
  assertTrue(
    allFinite(getAllTrends(dataset(), Number.NaN, NOW)),
    "période invalide",
  );
  assertTrue(allFinite(calculateIndicatorChange(0, 0)), "zéro sur zéro");
});

test("composition: affichage sans précision superflue", () => {
  assertEqual(
    formatIndicatorValue("bodyFatPercent", 18.3),
    "18,3 %",
    "une décimale",
  );
  assertEqual(formatIndicatorValue("waterPercent", 55), "55 %", "entier en %");
  assertEqual(
    formatIndicatorValue("muscleMassKg", 61),
    "61 kg",
    "entier en kg",
  );
  assertEqual(
    formatIndicatorValue("visceralFatIndex", 9),
    "9",
    "indice sans décimale inventée",
  );
  assertEqual(formatIndicatorValue("bmi", 23.4), "23,4", "IMC");
});

/* ---------- Indépendance ---------- */

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

const completedSession = (index: number): WorkoutSession => {
  const id = `s${index + 1}`;
  const startedAt = 1_000_000 + index * DAY_MS;
  return {
    id,
    templateId: "session_a",
    status: "completed",
    createdAt: startedAt,
    startedAt,
    completedAt: startedAt + 3_600_000,
    bodyweightKg: 74.2,
    notes: null,
    performances: [
      perf(id, 1, 7 + index, startedAt + 1_000),
      perf(id, 2, 9, startedAt + 2_000),
    ],
  };
};

test("composition: aucun impact sur séances, statistiques, recommandations ni poids", async () => {
  const store = createMemoryStore();
  const workouts = createWorkoutRepository(store);
  const weights = createWeightRepository(store);
  const composition = createBodyCompositionRepository(store);

  await weights.addMeasurement({ recordedAt: 500, weightKg: 74.2 });
  for (let index = 0; index < 3; index += 1) {
    await workouts.saveSession(completedSession(index));
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
      weights: await weights.getMeasurements(),
    });
  };

  const before = await snapshot();
  await composition.add({
    recordedAt: 2_000_000,
    bodyFatPercent: 18.5,
    bmi: 23.4,
  });
  await composition.add({ recordedAt: 2_000_000, muscleMassKg: 61.5 });
  await composition.add({
    recordedAt: 3_000_000,
    waterPercent: 55,
    visceralFatIndex: 8,
  });
  const after = await snapshot();

  assertEqual(
    after,
    before,
    "séances, stats, recommandations et poids identiques",
  );
  assertEqual(
    (await composition.getAll()).length,
    3,
    "mesures bien enregistrées",
  );
  assertEqual(
    (await workouts.getCompletedSessions()).length,
    3,
    "séances inchangées",
  );

  const started = await startWorkoutSession(workouts, {
    templateId: "session_a",
    now: 5_000_000,
    readLatestBodyweightKg: () => weights.getLatestWeightKg(),
  });
  assertEqual(
    started.bodyweightKg,
    74.2,
    "le snapshot de poids ne dépend que du poids",
  );
});
