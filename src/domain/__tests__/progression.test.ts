import { SEED_EXERCISES } from "../exercises/catalog";
import {
  buildRecommendation,
  buildRecommendations,
  calculateIntraSessionDrop,
  calculatePerformanceTrend,
  DEFAULT_PROGRESSION_THRESHOLDS,
  type ProgressionThresholds,
  type Recommendation,
} from "../progression";
import { DAY_MS } from "../stats/period";
import { SEED_WORKOUT_TEMPLATES } from "../workouts/seed";
import type {
  PerformanceEntry,
  SessionStatus,
  WorkoutSession,
} from "../workouts/types";
import { assertEqual, assertTrue, test } from "./harness";

const BASE = 1_800_000_000_000;
const NOW = 1_900_000_000_000;
const DEFAULT_TARGETS: Record<string, number> = {
  pull_up_pronation: 6,
  dips: 8,
};

interface Spec {
  id: string;
  day: number;
  reps: Record<string, readonly number[]>;
  status?: SessionStatus;
  bodyweightKg?: number | null;
  loadKg?: number;
  targets?: Record<string, number>;
}

const makeSession = (spec: Spec): WorkoutSession => {
  const status = spec.status ?? "completed";
  const at = BASE + spec.day * DAY_MS;
  const bodyweightKg = spec.bodyweightKg === undefined ? 78 : spec.bodyweightKg;
  const performances: PerformanceEntry[] = [];
  Object.entries(spec.reps).forEach(([exerciseId, list]) => {
    list.forEach((actualReps, index) => {
      performances.push({
        id: `${spec.id}__${exerciseId}__${index + 1}`,
        blockId: `block_${exerciseId}`,
        blockType: "straight_sets",
        exerciseId,
        order: index + 1,
        targetReps:
          spec.targets?.[exerciseId] ?? DEFAULT_TARGETS[exerciseId] ?? 6,
        actualReps,
        externalLoadKg: spec.loadKg ?? 0,
        bodyweightKg,
        recordedAt: at - 5_000 + index,
      });
    });
  });
  return {
    id: spec.id,
    templateId: "session_a",
    status,
    createdAt: at - 10_000,
    startedAt: at - 10_000,
    completedAt: status === "completed" ? at : null,
    bodyweightKg,
    notes: null,
    performances,
  };
};

type Extra = Omit<Partial<Spec>, "id" | "day" | "reps">;

const pull = (
  id: string,
  day: number,
  reps: readonly number[],
  extra: Extra = {},
): WorkoutSession =>
  makeSession({ id, day, reps: { pull_up_pronation: reps }, ...extra });

const analyze = (
  sessions: readonly WorkoutSession[],
  exerciseId = "pull_up_pronation",
  thresholds?: ProgressionThresholds,
): Recommendation =>
  buildRecommendation({
    sessions,
    exerciseId,
    exercise: SEED_EXERCISES.find((exercise) => exercise.id === exerciseId),
    templates: SEED_WORKOUT_TEMPLATES,
    thresholds,
    now: NOW,
  });

const allRecommendations = (
  sessions: readonly WorkoutSession[],
  templates = SEED_WORKOUT_TEMPLATES,
  now = NOW,
): Recommendation[] =>
  buildRecommendations({ sessions, templates, exercises: SEED_EXERCISES, now });

const pick = (
  recommendations: readonly Recommendation[],
  id: string,
): Recommendation => {
  const found = recommendations.find((item) => item.exerciseId === id);
  if (found === undefined) {
    throw new Error(`Recommandation absente pour ${id}`);
  }
  return found;
};

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

const stable3 = (): WorkoutSession[] => [
  pull("a", 0, [6, 6, 6]),
  pull("b", 1, [6, 6, 6]),
  pull("c", 2, [6, 6, 6]),
];

const progression4 = (): WorkoutSession[] => [
  pull("a", 0, [6, 6, 6]),
  pull("b", 1, [7, 7, 7]),
  pull("c", 2, [7, 7, 7]),
  pull("d", 3, [8, 8, 8]),
];

const declining3 = (): WorkoutSession[] => {
  const extra: Extra = { targets: { pull_up_pronation: 10 } };
  return [
    pull("a", 0, [10, 10, 9], extra),
    pull("b", 1, [8, 7, 7], extra),
    pull("c", 2, [7, 6, 6], extra),
  ];
};

test("progression: 0 séance → insufficient_data (cible issue du template)", () => {
  const rec = analyze([]);
  assertEqual(rec.action, "insufficient_data", "action");
  assertEqual(rec.confidence, "low", "confiance");
  assertEqual(rec.currentTarget, 6, "cible du template");
  assertEqual(rec.supportingSessionIds.length, 0, "aucune séance");
});

test("progression: 1 séance → jamais de decrease", () => {
  assertEqual(
    analyze([pull("a", 0, [6, 6, 6])]).action,
    "insufficient_data",
    "séance normale",
  );
  const bad = analyze([pull("a", 0, [1, 1, 1])]);
  assertTrue(bad.action !== "decrease", "pas de baisse sur une séance");
  assertEqual(bad.confidence, "low", "confiance faible");
});

test("progression: 2 séances → prudence, jamais de decrease", () => {
  const steady = analyze([pull("a", 0, [6, 6, 6]), pull("b", 1, [6, 6, 6])]);
  assertEqual(steady.action, "maintain", "stable = maintain");
  assertEqual(steady.confidence, "low", "confiance faible");
  const extra: Extra = { targets: { pull_up_pronation: 10 } };
  const falling = analyze([
    pull("a", 0, [10, 10, 10], extra),
    pull("b", 1, [5, 5, 5], extra),
  ]);
  assertEqual(
    falling.action,
    "insufficient_data",
    "baisse sur 2 séances = pas de décision",
  );
});

test("progression: 3 séances stables → maintain, confiance medium", () => {
  const rec = analyze(stable3());
  assertEqual(rec.action, "maintain", "action");
  assertEqual(rec.suggestedTarget, 6, "cible inchangée");
  assertEqual(rec.confidence, "medium", "confiance");
  assertEqual(rec.reasonCode, "on_target", "raison");
});

test("progression: progression régulière → increase vers 7", () => {
  const rec = analyze(progression4());
  assertEqual(rec.action, "increase", "action");
  assertEqual(rec.currentTarget, 6, "cible actuelle");
  assertEqual(rec.suggestedTarget, 7, "cible suggérée prudente");
  assertEqual(rec.confidence, "high", "confiance");
});

test("progression: progression trop faible → maintain", () => {
  const rec = analyze([
    pull("a", 0, [6, 6, 6]),
    pull("b", 1, [6, 6, 6]),
    pull("c", 2, [7, 7, 7]),
  ]);
  assertEqual(rec.action, "maintain", "action");
  assertEqual(rec.suggestedTarget, 6, "cible inchangée");
  assertEqual(rec.reasonCode, "insufficient_progress", "raison");
});

test("progression: une mauvaise séance isolée → pas de decrease", () => {
  const extra: Extra = { targets: { pull_up_pronation: 10 } };
  const rec = analyze([
    pull("a", 0, [10, 10, 10], extra),
    pull("b", 1, [10, 10, 10], extra),
    pull("c", 2, [10, 10, 10], extra),
    pull("d", 3, [7, 6, 6], extra),
  ]);
  assertEqual(rec.action, "maintain", "action");
  assertEqual(rec.reasonCode, "isolated_dip", "raison");
  assertEqual(rec.suggestedTarget, 10, "cible conservée");
});

test("progression: trois séances en baisse → decrease", () => {
  const rec = analyze(declining3());
  assertEqual(rec.action, "decrease", "action");
  assertEqual(rec.currentTarget, 10, "cible actuelle");
  assertEqual(rec.suggestedTarget, 9, "baisse prudente");
  assertEqual(rec.reasonCode, "repeated_drop", "raison");
});

test("progression: exercice A en baisse, exercice B inchangé", () => {
  const extra: Extra = { targets: { pull_up_pronation: 10 } };
  const sessions = [
    makeSession({
      id: "a",
      day: 0,
      reps: { pull_up_pronation: [10, 10, 10], dips: [8, 8, 8] },
      ...extra,
    }),
    makeSession({
      id: "b",
      day: 1,
      reps: { pull_up_pronation: [10, 10, 10], dips: [8, 8, 8] },
      ...extra,
    }),
    makeSession({
      id: "c",
      day: 2,
      reps: { pull_up_pronation: [6, 6, 6], dips: [8, 8, 8] },
      ...extra,
    }),
    makeSession({
      id: "d",
      day: 3,
      reps: { pull_up_pronation: [5, 5, 5], dips: [8, 8, 8] },
      ...extra,
    }),
  ];
  const recs = allRecommendations(sessions);
  assertEqual(pick(recs, "pull_up_pronation").action, "decrease", "tractions");
  const dips = pick(recs, "dips");
  assertEqual(dips.action, "maintain", "dips");
  assertEqual(dips.currentTarget, 8, "cible dips");
  assertEqual(dips.suggestedTarget, 8, "cible dips inchangée");
});

test("progression: poids du corps différent → contexte conservé, comparaison incertaine", () => {
  const sessions = [
    makeSession({
      id: "a",
      day: 0,
      bodyweightKg: 70,
      reps: { pull_up_pronation: [7, 7, 7], lateral_raise: [7, 7, 7] },
    }),
    makeSession({
      id: "b",
      day: 1,
      bodyweightKg: 70,
      reps: { pull_up_pronation: [7, 7, 7], lateral_raise: [7, 7, 7] },
    }),
    makeSession({
      id: "c",
      day: 2,
      bodyweightKg: 80,
      reps: { pull_up_pronation: [8, 8, 8], lateral_raise: [8, 8, 8] },
    }),
  ];
  const pullUps = analyze(sessions, "pull_up_pronation");
  assertEqual(pullUps.action, "maintain", "tractions : on garde la cible");
  assertEqual(pullUps.reasonCode, "not_comparable", "raison");
  assertEqual(pullUps.confidence, "low", "confiance");
  assertEqual(pullUps.metrics.comparable, false, "non comparable");
  assertEqual(pullUps.metrics.bodyweightKg, 80, "poids du corps conservé");
  assertTrue(
    pullUps.metrics.bodyweightShiftRatio > 0.05,
    "variation de poids mesurée",
  );
  const raises = analyze(sessions, "lateral_raise");
  assertEqual(
    raises.metrics.comparable,
    true,
    "élévations latérales : poids du corps non pertinent",
  );
  assertEqual(
    raises.action,
    "increase",
    "élévations latérales : hausse possible",
  );
});

test("progression: charge externe différente → contexte conservé", () => {
  const sessions = [
    makeSession({ id: "a", day: 0, loadKg: 0, reps: { dips: [9, 9, 9] } }),
    makeSession({ id: "b", day: 1, loadKg: 0, reps: { dips: [9, 9, 9] } }),
    makeSession({ id: "c", day: 2, loadKg: 10, reps: { dips: [9, 9, 9] } }),
  ];
  const rec = analyze(sessions, "dips");
  assertEqual(rec.metrics.loadVaries, true, "variation de charge détectée");
  assertEqual(
    rec.metrics.externalLoadKg,
    10,
    "charge la plus récente conservée",
  );
  assertEqual(rec.action, "maintain", "action");
  assertEqual(rec.reasonCode, "not_comparable", "raison");
});

test("progression: séances in_progress ignorées", () => {
  const rec = analyze([
    ...stable3(),
    pull("ip", 3, [1, 1, 1], { status: "in_progress" }),
  ]);
  assertEqual(rec.metrics.sessionCount, 3, "trois séances comptées");
  assertTrue(
    !rec.supportingSessionIds.includes("ip"),
    "séance en cours exclue",
  );
  assertEqual(rec.action, "maintain", "action");
  assertEqual(
    analyze([pull("ip", 0, [6, 6, 6], { status: "in_progress" })]).action,
    "insufficient_data",
    "seule en cours",
  );
});

test("progression: séances cancelled ignorées", () => {
  const onlyCancelled = analyze([
    pull("x1", 0, [1, 1, 1], { status: "cancelled" }),
    pull("x2", 1, [1, 1, 1], { status: "cancelled" }),
    pull("x3", 2, [1, 1, 1], { status: "cancelled" }),
  ]);
  assertEqual(onlyCancelled.action, "insufficient_data", "rien de terminé");
  assertEqual(onlyCancelled.metrics.sessionCount, 0, "aucune séance");
  const mixed = analyze([
    ...stable3(),
    pull("x", 3, [20, 20, 20], { status: "cancelled" }),
  ]);
  assertEqual(
    mixed.action,
    "maintain",
    "une séance annulée ne déclenche pas de hausse",
  );
});

test("progression: la cible est conservée (celle de la dernière séance)", () => {
  const same = analyze([
    pull("a", 0, [7, 7, 7], { targets: { pull_up_pronation: 7 } }),
    pull("b", 1, [7, 7, 7], { targets: { pull_up_pronation: 7 } }),
    pull("c", 2, [7, 7, 7], { targets: { pull_up_pronation: 7 } }),
  ]);
  assertEqual(same.currentTarget, 7, "cible actuelle");
  assertEqual(same.suggestedTarget, 7, "cible suggérée = actuelle");
  const changed = analyze([
    pull("a", 0, [6, 6, 6]),
    pull("b", 1, [6, 6, 6]),
    pull("c", 2, [7, 7, 7], { targets: { pull_up_pronation: 7 } }),
  ]);
  assertEqual(changed.currentTarget, 7, "cible la plus récente");
});

test("progression: cible suggérée raisonnable (pas de saut brutal)", () => {
  const inc = analyze(progression4());
  assertTrue(
    inc.suggestedTarget !== null &&
      inc.suggestedTarget > 6 &&
      inc.suggestedTarget <= 7,
    "hausse de 6 limitée",
  );
  const squats = [0, 1, 2].map((day) =>
    makeSession({
      id: `q${day}`,
      day,
      reps: { squat: [28, 28, 28] },
      targets: { squat: 25 },
    }),
  );
  const big = analyze(squats, "squat");
  assertEqual(big.action, "increase", "action squat");
  assertTrue(
    big.suggestedTarget !== null &&
      big.suggestedTarget > 25 &&
      big.suggestedTarget - 25 <= 3,
    "hausse de 25 limitée à 3",
  );
  const dec = analyze(declining3());
  assertTrue(
    dec.suggestedTarget !== null &&
      dec.suggestedTarget >= 1 &&
      dec.suggestedTarget < 10,
    "baisse limitée et positive",
  );
});

test("progression: confiance cohérente avec les données", () => {
  assertEqual(analyze([pull("a", 0, [6, 6, 6])]).confidence, "low", "1 séance");
  assertEqual(analyze(stable3()).confidence, "medium", "3 séances cohérentes");
  assertEqual(
    analyze([...stable3(), pull("d", 3, [6, 6, 6])]).confidence,
    "high",
    "4 séances cohérentes",
  );
  const erratic = analyze([
    pull("a", 0, [10, 10, 10]),
    pull("b", 1, [3, 3, 3]),
    pull("c", 2, [10, 10, 10]),
    pull("d", 3, [3, 3, 3]),
  ]);
  assertEqual(
    erratic.confidence,
    "medium",
    "4 séances incohérentes : un niveau en moins",
  );
  assertEqual(erratic.action, "maintain", "incohérent : pas de baisse");
});

test("progression: supportingSessionIds corrects (fenêtre de 5, ordre chronologique)", () => {
  const sessions = ["s1", "s2", "s3", "s4", "s5", "s6"].map((id, day) =>
    pull(id, day, [6, 6, 6]),
  );
  const rec = analyze([...sessions].reverse());
  assertEqual(rec.supportingSessionIds.join(","), "s2,s3,s4,s5,s6", "ids");
  assertEqual(rec.metrics.sessionCount, 5, "cinq séances");
});

test("progression: generatedAt déterministe lorsqu’il est injecté", () => {
  const run = () =>
    allRecommendations(progression4(), SEED_WORKOUT_TEMPLATES, 4242);
  const first = run();
  assertTrue(
    first.every((rec) => rec.generatedAt === 4242),
    "generatedAt injecté",
  );
  assertEqual(
    JSON.stringify(first),
    JSON.stringify(run()),
    "résultat identique",
  );
});

test("progression: aucun NaN ni Infinity", () => {
  const zero = { targets: { pull_up_pronation: 0 } };
  const sessions = [
    pull("z1", 0, [0, 0, 0], zero),
    pull("z2", 1, [0, 0, 0], zero),
    pull("z3", 2, [0, 0, 0], zero),
    makeSession({ id: "big", day: 3, reps: { dips: [999, 0, 999] } }),
  ];
  assertTrue(allFinite(allRecommendations(sessions)), "sessions limites");
  assertTrue(allFinite(allRecommendations([])), "aucune séance");
  assertTrue(allFinite(allRecommendations(progression4())), "cas normal");
});

test("progression: ordre des recommandations déterministe", () => {
  const sessions = progression4();
  const forward = allRecommendations(sessions);
  const shuffled = allRecommendations(
    [...sessions].reverse(),
    [...SEED_WORKOUT_TEMPLATES].reverse(),
  );
  assertEqual(
    JSON.stringify(forward),
    JSON.stringify(shuffled),
    "indépendant de l’ordre d’entrée",
  );
  const ids = forward.map((rec) => rec.exerciseId);
  assertEqual(
    ids.join(","),
    [...ids].sort((a, b) => a.localeCompare(b)).join(","),
    "trié par exerciseId",
  );
});

test("progression: 2 séances nettement au-dessus de la cible → increase prudent, confiance faible", () => {
  const rec = analyze([pull("a", 0, [8, 8, 8]), pull("b", 1, [8, 8, 8])]);
  assertEqual(rec.action, "increase", "action");
  assertEqual(rec.confidence, "low", "confiance");
  assertEqual(rec.suggestedTarget, 7, "hausse de 1");
  assertEqual(rec.reasonCode, "two_sessions_clear_progress", "raison");
});

test("progression: seuils configurables", () => {
  assertEqual(analyze(progression4()).action, "increase", "seuils par défaut");
  const strict: ProgressionThresholds = {
    ...DEFAULT_PROGRESSION_THRESHOLDS,
    minExcessRepRate: 0.5,
  };
  assertEqual(
    analyze(progression4(), "pull_up_pronation", strict).action,
    "maintain",
    "seuil plus strict",
  );
});

test("progression: chute intra-séance mesurée et bloque la hausse", () => {
  assertEqual(calculateIntraSessionDrop([10, 10, 6, 6]), 0.4, "chute de 40 %");
  assertEqual(calculateIntraSessionDrop([5]), 0, "une seule série");
  assertEqual(calculateIntraSessionDrop([0, 0]), 0, "zéro sans NaN");
  const fatigued = [0, 1, 2].map((day) =>
    pull(`f${day}`, day, [10, 10, 10, 6, 6, 6]),
  );
  const rec = analyze(fatigued);
  assertEqual(rec.metrics.intraSessionDrop, 0.4, "métrique exposée");
  assertEqual(rec.action, "maintain", "pas de hausse malgré une moyenne haute");
  assertEqual(rec.reasonCode, "fatigue_within_session", "raison");
});

test("progression: cibles des templates sans historique, 8 exercices", () => {
  const recs = allRecommendations([]);
  assertEqual(recs.length, 8, "un conseil par exercice du catalogue");
  const dips = pick(recs, "dips");
  assertEqual(dips.currentTarget, 8, "cible dips");
  assertEqual(dips.suggestedTarget, 8, "suggestion = cible");
  assertEqual(dips.action, "insufficient_data", "action");
});

test("progression: tendance pure (récent vs référence)", () => {
  const trend = calculatePerformanceTrend([10, 10, 8, 7], 2, 2);
  assertEqual(trend?.recentAverage, 7.5, "moyenne récente");
  assertEqual(trend?.baselineAverage, 10, "moyenne de référence");
  assertEqual(trend?.ratio, -0.25, "variation");
  assertEqual(
    calculatePerformanceTrend([5], 2, 2),
    null,
    "pas assez de données",
  );
});
