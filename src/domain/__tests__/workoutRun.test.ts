import type { KeyValueStore } from "../../storage/types";
import {
  getElapsedMs,
  getRemainingMs,
  type CountdownTimer,
} from "../timer/countdown";
import { getEmomPosition } from "../timer/emomClock";
import {
  getPendingEmomInterval,
  reduceRun,
  restoreRun,
  type RunAction,
  type RunState,
} from "../workouts/run";
import { SESSION_A_TEMPLATE } from "../workouts/seed";
import {
  createInProgressSession,
  recordPerformance,
} from "../workouts/sessions";
import { validateWorkoutSession } from "../workouts/validation";
import { createWorkoutRepository } from "../workouts/workoutRepository";
import { buildEmomSchedule } from "../workouts/blocks";
import { assertEqual, assertTrue, test } from "./harness";

const T0 = 1_000_000;
const MINUTE = 60_000;
const template = SESSION_A_TEMPLATE;

const baseSession = () =>
  createInProgressSession({
    templateId: template.id,
    now: T0,
    bodyweightKg: 78,
  });

const step = (state: RunState, action: RunAction): RunState =>
  reduceRun(template, state, action);

const startedRun = (): RunState =>
  step(restoreRun(template, baseSession(), T0), { type: "start", now: T0 });

const timerOf = (state: RunState): CountdownTimer => {
  if (state.phase.kind === "emom" || state.phase.kind === "rest") {
    return state.phase.timer;
  }
  throw new Error(`Pas de timer dans la phase ${state.phase.kind}`);
};

const setNumberOf = (state: RunState): number => {
  if (state.phase.kind === "set") {
    return state.phase.setNumber;
  }
  if (state.phase.kind === "rest") {
    return state.phase.nextSetNumber;
  }
  throw new Error(`Pas de numéro de série dans la phase ${state.phase.kind}`);
};

const emomConfig = () => {
  const block = template.blocks[0];
  if (block === undefined || block.type !== "emom") {
    throw new Error("EMOM attendu");
  }
  return block;
};

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

/* ---------- EMOM ---------- */

test("emom: le planning alterne et contient 20 intervalles", () => {
  const schedule = buildEmomSchedule(emomConfig().config);
  assertEqual(schedule.length, 20, "nombre d’intervalles");
  assertEqual(schedule[0]?.exerciseId, "pull_up_pronation", "minute 1");
  assertEqual(schedule[1]?.exerciseId, "dips", "minute 2");
  assertEqual(schedule[18]?.exerciseId, "pull_up_pronation", "minute 19");
  assertEqual(schedule[19]?.exerciseId, "dips", "minute 20");
});

test("emom: la phase initiale est block_intro puis le timer démarre", () => {
  const initial = restoreRun(template, baseSession(), T0);
  assertEqual(initial.phase.kind, "block_intro", "phase initiale");
  const started = step(initial, { type: "start", now: T0 });
  assertEqual(started.phase.kind, "emom", "phase après start");
  assertEqual(timerOf(started).status, "running", "statut du timer");
});

test("emom: pause ne consomme pas le temps et la reprise est exacte", () => {
  let state = startedRun();
  state = step(state, { type: "pause", now: T0 + 10_000 });
  state = step(state, { type: "sync", now: T0 + 10 * MINUTE });
  assertEqual(timerOf(state).status, "paused", "toujours en pause");
  assertEqual(
    getElapsedMs(timerOf(state), T0 + 10 * MINUTE),
    10_000,
    "écoulé figé",
  );
  state = step(state, { type: "resume", now: T0 + 10 * MINUTE });
  assertEqual(
    getElapsedMs(timerOf(state), T0 + 10 * MINUTE + 5_000),
    15_000,
    "écoulé 5 s après reprise",
  );
});

test("emom: plusieurs minutes écoulées en arrière-plan", () => {
  let state = startedRun();
  const now = T0 + 7 * MINUTE + 5_000;
  state = step(state, { type: "sync", now });
  const position = getEmomPosition(
    emomConfig().config,
    getElapsedMs(timerOf(state), now),
  );
  assertEqual(position.intervalNumber, 8, "minute courante");
  state = step(state, { type: "sync", now: T0 + 25 * MINUTE });
  assertEqual(timerOf(state).status, "completed", "EMOM terminé");
});

test("emom: fin à 20 min, saisie des minutes en attente puis CONTINUER", () => {
  const end = T0 + 20 * MINUTE;
  let state = step(startedRun(), { type: "sync", now: end });
  assertEqual(timerOf(state).status, "completed", "timer terminé");
  const blocked = step(state, { type: "continue", now: end });
  assertTrue(
    blocked === state,
    "CONTINUER refusé tant que des minutes sont en attente",
  );
  for (let order = 1; order <= 20; order += 1) {
    state = step(state, {
      type: "record_emom",
      now: end,
      order,
      actualReps: 5,
    });
  }
  assertEqual(state.session.performances.length, 20, "performances EMOM");
  state = step(state, { type: "continue", now: end });
  assertEqual(state.phase.kind, "set", "passage aux séries");
  assertEqual(setNumberOf(state), 1, "première série");
});

/* ---------- Performances ---------- */

test("performance: target conservée, actual enregistré, poids du corps historique", () => {
  const state = step(startedRun(), {
    type: "record_emom",
    now: T0 + 10_000,
    order: 1,
    actualReps: 6,
  });
  const entry = state.session.performances[0];
  assertEqual(entry?.exerciseId, "pull_up_pronation", "exercice");
  assertEqual(entry?.targetReps, 6, "target");
  assertEqual(entry?.actualReps, 6, "actual");
  assertEqual(entry?.order, 1, "ordre (minute)");
  assertEqual(entry?.blockType, "emom", "type de bloc");
  assertEqual(entry?.bodyweightKg, 78, "poids du corps de la séance");
});

test("performance: inférieur, supérieur et zéro acceptés", () => {
  let state = startedRun();
  state = step(state, {
    type: "record_emom",
    now: T0 + 30_000,
    order: 1,
    actualReps: 4,
  });
  state = step(state, { type: "sync", now: T0 + MINUTE + 1_000 });
  state = step(state, {
    type: "record_emom",
    now: T0 + MINUTE + 30_000,
    order: 2,
    actualReps: 12,
  });
  state = step(state, { type: "sync", now: T0 + 2 * MINUTE + 1_000 });
  state = step(state, {
    type: "record_emom",
    now: T0 + 2 * MINUTE + 30_000,
    order: 3,
    actualReps: 0,
  });
  const [first, second, third] = state.session.performances;
  assertEqual(first?.actualReps, 4, "inférieur à la cible");
  assertEqual(first?.targetReps, 6, "cible conservée (minute 1)");
  assertEqual(second?.actualReps, 12, "supérieur à la cible");
  assertEqual(second?.targetReps, 8, "cible conservée (minute 2)");
  assertEqual(third?.actualReps, 0, "zéro accepté");
  assertTrue(validateWorkoutSession(state.session).isValid, "session valide");
});

test("performance: valeur négative ou minute incohérente refusées", () => {
  const state = startedRun();
  const negative = step(state, {
    type: "record_emom",
    now: T0 + 1_000,
    order: 1,
    actualReps: -1,
  });
  assertTrue(negative === state, "négatif refusé");
  const decimal = step(state, {
    type: "record_emom",
    now: T0 + 1_000,
    order: 1,
    actualReps: 2.5,
  });
  assertTrue(decimal === state, "décimal refusé");
  const wrongOrder = step(state, {
    type: "record_emom",
    now: T0 + 1_000,
    order: 2,
    actualReps: 5,
  });
  assertTrue(wrongOrder === state, "minute pas encore démarrée refusée");
});

test("performance: persistée puis relue depuis le repository", async () => {
  const repository = createWorkoutRepository(createMemoryStore());
  let state = startedRun();
  state = step(state, {
    type: "record_emom",
    now: T0 + 10_000,
    order: 1,
    actualReps: 5,
  });
  await repository.saveSession(state.session);
  const loaded = await repository.getSession(state.session.id);
  assertEqual(loaded?.performances.length, 1, "performances relues");
  assertEqual(loaded?.performances[0]?.actualReps, 5, "actual relu");
  assertEqual(loaded?.status, "in_progress", "session toujours en cours");
});

test("reprise: reconstruction depuis les performances", () => {
  const block = emomConfig();
  let session = baseSession();
  for (let order = 1; order <= 3; order += 1) {
    session = recordPerformance(session, {
      blockId: block.id,
      blockType: "emom",
      exerciseId: order % 2 === 1 ? "pull_up_pronation" : "dips",
      order,
      targetReps: order % 2 === 1 ? 6 : 8,
      actualReps: 6,
      externalLoadKg: 0,
      now: T0 + order * 1_000,
    });
  }
  const restored = restoreRun(template, session, T0 + 5 * MINUTE);
  assertEqual(restored.phase.kind, "emom", "phase restaurée");
  assertEqual(timerOf(restored).status, "paused", "timer en pause");
  const pending = getPendingEmomInterval(
    block,
    session.performances,
    timerOf(restored),
    T0 + 5 * MINUTE,
  );
  assertEqual(pending?.intervalNumber, 4, "prochaine minute à effectuer");
});

/* ---------- Séries ---------- */

test("séries: 1 → 2 → 3, repos de 60 s, skip du repos", () => {
  const t = T0 + 5_000;
  let state: RunState = {
    session: baseSession(),
    phase: { kind: "set", blockIndex: 1, setNumber: 1 },
  };

  state = step(state, {
    type: "record_set",
    now: t,
    setNumber: 1,
    actualReps: 9,
  });
  assertEqual(state.phase.kind, "rest", "repos après la série 1");
  assertEqual(setNumberOf(state), 2, "prochaine série");
  assertEqual(getRemainingMs(timerOf(state), t), 60_000, "repos de 60 s");
  assertEqual(
    state.session.performances[0]?.targetReps,
    10,
    "target conservée",
  );
  assertEqual(
    state.session.performances[0]?.actualReps,
    9,
    "actual enregistré",
  );

  state = step(state, { type: "sync", now: t + 59_999 });
  assertEqual(state.phase.kind, "rest", "toujours en repos à 59,999 s");
  state = step(state, { type: "sync", now: t + 60_000 });
  assertEqual(state.phase.kind, "set", "fin du repos");
  assertEqual(setNumberOf(state), 2, "série 2");

  state = step(state, {
    type: "record_set",
    now: t + 70_000,
    setNumber: 2,
    actualReps: 10,
  });
  assertEqual(state.phase.kind, "rest", "repos après la série 2");
  state = step(state, { type: "skip_rest", now: t + 71_000 });
  assertEqual(state.phase.kind, "set", "repos passé");
  assertEqual(setNumberOf(state), 3, "série 3");
  assertEqual(state.session.performances.length, 2, "performances conservées");

  state = step(state, {
    type: "record_set",
    now: t + 80_000,
    setNumber: 3,
    actualReps: 11,
  });
  assertEqual(
    state.session.performances.length,
    3,
    "trois séries enregistrées",
  );
  assertEqual(state.phase.kind, "set", "bloc suivant");
  assertEqual(
    state.phase.kind === "set" ? state.phase.blockIndex : -1,
    2,
    "bloc 3",
  );
  assertEqual(setNumberOf(state), 1, "série 1 du bloc suivant");
});

test("séries: une série déjà passée ou un double tap est ignoré", () => {
  const state: RunState = {
    session: baseSession(),
    phase: { kind: "set", blockIndex: 1, setNumber: 1 },
  };
  const wrong = step(state, {
    type: "record_set",
    now: T0 + 1_000,
    setNumber: 2,
    actualReps: 5,
  });
  assertTrue(wrong === state, "numéro de série incohérent ignoré");
});

/* ---------- Fin de séance ---------- */

test("fin: la séance passe en completed avec completedAt cohérent", () => {
  const session = recordPerformance(baseSession(), {
    blockId: "session_a_push_up",
    blockType: "straight_sets",
    exerciseId: "push_up",
    order: 1,
    targetReps: 10,
    actualReps: 10,
    externalLoadKg: 0,
    now: T0 + 5_000,
  });
  const done = step(
    { session, phase: { kind: "finished" } },
    { type: "finish", now: T0 + 6_000 },
  );
  assertEqual(done.session.status, "completed", "statut");
  assertEqual(done.session.completedAt, T0 + 6_000, "completedAt");
  assertEqual(done.session.performances.length, 1, "performances conservées");
  assertTrue(validateWorkoutSession(done.session).isValid, "session valide");
});
